import { ITransport } from '../transport/Transport.ts';
import { FileTransferRecord } from '../../types/index.ts';
import { sha256Digest } from '../crypto/crypto.ts';

export const DEFAULT_CHUNK_SIZE = 32 * 1024; // 32 KB binary chunks

export interface FileOfferMetadata {
  transferId: string;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  chunkSize: number;
  sha256Checksum: string;
  senderId: string;
}

export interface ChunkFrameHeader {
  transferId: string;
  chunkIndex: number;
  totalChunks: number;
  payloadLength: number;
}

const FRAME_MAGIC_1 = 0x53; // 'S'
const FRAME_MAGIC_2 = 0x4d; // 'M'
const FRAME_TYPE_CHUNK = 0x01;
const HEADER_SIZE = 32;

/**
 * Encode binary chunk frame: 32-byte header + binary payload
 */
export function encodeBinaryChunkFrame(
  transferId: string,
  chunkIndex: number,
  totalChunks: number,
  chunkBytes: Uint8Array
): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER_SIZE + chunkBytes.byteLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Magic bytes
  view.setUint8(0, FRAME_MAGIC_1);
  view.setUint8(1, FRAME_MAGIC_2);
  view.setUint8(2, FRAME_TYPE_CHUNK);
  view.setUint8(3, 0); // reserved flags

  // Transfer ID (16 bytes ASCII)
  const transferIdBytes = new TextEncoder().encode(transferId.slice(0, 16));
  bytes.set(transferIdBytes, 4);

  // Chunk Index (Uint32)
  view.setUint32(20, chunkIndex, false);
  // Total Chunks (Uint32)
  view.setUint32(24, totalChunks, false);
  // Chunk Payload Length (Uint32)
  view.setUint32(28, chunkBytes.byteLength, false);

  // Chunk Payload Bytes
  bytes.set(chunkBytes, HEADER_SIZE);

  return buffer;
}

/**
 * Decode binary chunk frame from ArrayBuffer
 */
export function decodeBinaryChunkFrame(buffer: ArrayBuffer): {
  header: ChunkFrameHeader;
  payload: Uint8Array;
} | null {
  if (buffer.byteLength < HEADER_SIZE) return null;
  const view = new DataView(buffer);

  if (view.getUint8(0) !== FRAME_MAGIC_1 || view.getUint8(1) !== FRAME_MAGIC_2) {
    return null;
  }

  const idBytes = new Uint8Array(buffer, 4, 16);
  // Read string until null character or length
  let nullIdx = idBytes.indexOf(0);
  if (nullIdx === -1) nullIdx = 16;
  const transferId = new TextDecoder().decode(idBytes.subarray(0, nullIdx));

  const chunkIndex = view.getUint32(20, false);
  const totalChunks = view.getUint32(24, false);
  const payloadLength = view.getUint32(28, false);

  const payload = new Uint8Array(buffer, HEADER_SIZE, payloadLength);

  return {
    header: {
      transferId,
      chunkIndex,
      totalChunks,
      payloadLength,
    },
    payload,
  };
}

export class FileTransferManager {
  private transport: ITransport;
  private localPeerId: string;
  private activeTransfers = new Map<string, FileTransferRecord>();

  // In-memory reassembly buffers for incoming files
  private incomingBuffers = new Map<string, { chunks: (Uint8Array | null)[]; receivedCount: number }>();
  // Outgoing cancellation controllers
  private cancelledTransfers = new Set<string>();

  private transferUpdateCallbacks: ((record: FileTransferRecord) => void)[] = [];
  private controlMessageSender: ((type: string, data: any) => Promise<void>) | null = null;

  constructor(transport: ITransport, localPeerId: string) {
    this.transport = transport;
    this.localPeerId = localPeerId;
  }

  setControlSender(sender: (type: string, data: any) => Promise<void>) {
    this.controlMessageSender = sender;
  }

  onTransferUpdate(callback: (record: FileTransferRecord) => void) {
    this.transferUpdateCallbacks.push(callback);
  }

  private notify(record: FileTransferRecord) {
    this.transferUpdateCallbacks.forEach(cb => cb({ ...record }));
  }

  getActiveTransfers(): FileTransferRecord[] {
    return Array.from(this.activeTransfers.values());
  }

  getTransfer(transferId: string): FileTransferRecord | undefined {
    return this.activeTransfers.get(transferId);
  }

  /**
   * Initiate sending a file
   */
  async sendFile(file: File, recipientId: string, chunkSize: number = DEFAULT_CHUNK_SIZE): Promise<string> {
    const transferId = Math.random().toString(36).substring(2, 12);
    const totalChunks = Math.ceil(file.size / chunkSize);

    // Compute checksum
    const arrayBuffer = await file.arrayBuffer();
    const sha256Checksum = await sha256Digest(arrayBuffer);

    const record: FileTransferRecord = {
      transferId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks,
      chunkSize,
      sha256Checksum,
      senderId: this.localPeerId,
      recipientId,
      direction: 'outgoing',
      status: 'pending',
      chunksCompleted: 0,
      bytesTransferred: 0,
      transferSpeedBytesPerSec: 0,
      estimatedSecondsRemaining: 0,
      startTime: Date.now(),
      fileData: file,
      blobUrl: URL.createObjectURL(file),
    };

    this.activeTransfers.set(transferId, record);
    this.notify(record);

    // Send FILE_OFFER control packet to recipient
    if (this.controlMessageSender) {
      const offerData: FileOfferMetadata = {
        transferId,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        totalChunks,
        chunkSize,
        sha256Checksum,
        senderId: this.localPeerId,
      };
      await this.controlMessageSender('FILE_OFFER', offerData);
    }

    return transferId;
  }

  /**
   * Handle incoming FILE_OFFER from peer
   */
  handleFileOffer(metadata: FileOfferMetadata): FileTransferRecord {
    const record: FileTransferRecord = {
      transferId: metadata.transferId,
      fileName: metadata.name,
      fileSize: metadata.size,
      mimeType: metadata.mimeType,
      totalChunks: metadata.totalChunks,
      chunkSize: metadata.chunkSize,
      sha256Checksum: metadata.sha256Checksum,
      senderId: metadata.senderId,
      recipientId: this.localPeerId,
      direction: 'incoming',
      status: 'transferring', // Auto-accept in MVP for smooth peer transfers
      chunksCompleted: 0,
      bytesTransferred: 0,
      transferSpeedBytesPerSec: 0,
      estimatedSecondsRemaining: 0,
      startTime: Date.now(),
    };

    this.activeTransfers.set(metadata.transferId, record);
    this.incomingBuffers.set(metadata.transferId, {
      chunks: new Array(metadata.totalChunks).fill(null),
      receivedCount: 0,
    });

    this.notify(record);

    // Acknowledge acceptance
    if (this.controlMessageSender) {
      this.controlMessageSender('FILE_ACCEPT', { transferId: metadata.transferId }).catch(console.error);
    }

    return record;
  }

  /**
   * Begin chunk streaming once accepted
   */
  async startStreamingFileChunks(transferId: string): Promise<void> {
    const record = this.activeTransfers.get(transferId);
    if (!record || !record.fileData) return;

    record.status = 'transferring';
    record.startTime = Date.now();
    this.notify(record);

    const file = record.fileData;
    const totalChunks = record.totalChunks;
    const chunkSize = record.chunkSize;

    let lastTime = Date.now();
    let bytesSinceLastTime = 0;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (this.cancelledTransfers.has(transferId)) {
        record.status = 'cancelled';
        this.notify(record);
        if (this.controlMessageSender) {
          await this.controlMessageSender('FILE_CANCEL', { transferId });
        }
        return;
      }

      const startByte = chunkIndex * chunkSize;
      const endByte = Math.min(startByte + chunkSize, file.size);
      const chunkBlob = file.slice(startByte, endByte);
      const chunkBuffer = await chunkBlob.arrayBuffer();
      const chunkBytes = new Uint8Array(chunkBuffer);

      // Create binary chunk frame
      const frame = encodeBinaryChunkFrame(transferId, chunkIndex, totalChunks, chunkBytes);

      // Wait if transport buffer is high
      await this.transport.waitForBufferDrain();
      await this.transport.send(frame);

      // Update metrics
      record.chunksCompleted = chunkIndex + 1;
      record.bytesTransferred += chunkBytes.byteLength;
      bytesSinceLastTime += chunkBytes.byteLength;

      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      if (elapsed >= 0.5 || chunkIndex === totalChunks - 1) {
        record.transferSpeedBytesPerSec = bytesSinceLastTime / Math.max(elapsed, 0.1);
        const remainingBytes = file.size - record.bytesTransferred;
        record.estimatedSecondsRemaining = Math.max(
          0,
          Math.round(remainingBytes / Math.max(record.transferSpeedBytesPerSec, 1))
        );
        lastTime = now;
        bytesSinceLastTime = 0;
        this.notify(record);
      }
    }

    // Complete transmission
    record.status = 'completed';
    record.endTime = Date.now();
    record.transferSpeedBytesPerSec = 0;
    record.estimatedSecondsRemaining = 0;
    this.notify(record);

    if (this.controlMessageSender) {
      await this.controlMessageSender('FILE_COMPLETE', {
        transferId,
        sha256Checksum: record.sha256Checksum,
      });
    }
  }

  /**
   * Process an incoming binary chunk frame received over transport
   */
  async handleIncomingChunkFrame(frameBuffer: ArrayBuffer): Promise<void> {
    const decoded = decodeBinaryChunkFrame(frameBuffer);
    if (!decoded) return;

    const { header, payload } = decoded;
    const { transferId, chunkIndex, totalChunks } = header;

    const record = this.activeTransfers.get(transferId);
    const bufferInfo = this.incomingBuffers.get(transferId);

    if (!record || !bufferInfo) {
      return;
    }

    // Store chunk
    if (!bufferInfo.chunks[chunkIndex]) {
      bufferInfo.chunks[chunkIndex] = new Uint8Array(payload);
      bufferInfo.receivedCount++;
      record.chunksCompleted = bufferInfo.receivedCount;
      record.bytesTransferred += payload.byteLength;

      const elapsed = (Date.now() - record.startTime) / 1000;
      if (elapsed > 0) {
        record.transferSpeedBytesPerSec = record.bytesTransferred / elapsed;
        const remainingBytes = record.fileSize - record.bytesTransferred;
        record.estimatedSecondsRemaining = Math.max(
          0,
          Math.round(remainingBytes / Math.max(record.transferSpeedBytesPerSec, 1))
        );
      }

      this.notify(record);
    }

    // Check if all chunks received
    if (bufferInfo.receivedCount === totalChunks) {
      await this.finalizeIncomingFile(transferId);
    }
  }

  /**
   * Reassemble, verify checksum, and produce downloadable Blob
   */
  private async finalizeIncomingFile(transferId: string) {
    const record = this.activeTransfers.get(transferId);
    const bufferInfo = this.incomingBuffers.get(transferId);
    if (!record || !bufferInfo) return;

    // Check that no chunks are missing
    for (let i = 0; i < record.totalChunks; i++) {
      if (!bufferInfo.chunks[i]) {
        console.warn(`[SIMOON FILE] Missing chunk #${i} in file transfer`);
        record.status = 'failed';
        record.errorMessage = `Missing chunk #${i}`;
        this.notify(record);
        return;
      }
    }

    // Reassemble binary parts into single Blob
    const parts = bufferInfo.chunks as Uint8Array[];
    const assembledBlob = new Blob(parts as any, { type: record.mimeType });
    const fullBuffer = await assembledBlob.arrayBuffer();

    // Verify SHA-256 integrity
    const computedHash = await sha256Digest(fullBuffer);

    if (computedHash.toLowerCase() !== record.sha256Checksum.toLowerCase()) {
      record.status = 'failed';
      record.errorMessage = 'Integrity verification failed (SHA-256 hash mismatch)';
      this.notify(record);
      return;
    }

    record.status = 'completed';
    record.endTime = Date.now();
    record.fileData = assembledBlob;
    record.blobUrl = URL.createObjectURL(assembledBlob);
    record.transferSpeedBytesPerSec = 0;
    record.estimatedSecondsRemaining = 0;

    // Clean up in-memory chunk array to save RAM
    this.incomingBuffers.delete(transferId);

    this.notify(record);
  }

  /**
   * Cancel an in-progress file transfer
   */
  cancelTransfer(transferId: string) {
    this.cancelledTransfers.add(transferId);
    const record = this.activeTransfers.get(transferId);
    if (record) {
      record.status = 'cancelled';
      this.notify(record);
    }
    if (this.controlMessageSender) {
      this.controlMessageSender('FILE_CANCEL', { transferId }).catch(console.error);
    }
  }

  handleRemoteCancellation(transferId: string) {
    const record = this.activeTransfers.get(transferId);
    if (record) {
      record.status = 'cancelled';
      record.errorMessage = 'Cancelled by peer';
      this.notify(record);
    }
  }
}
