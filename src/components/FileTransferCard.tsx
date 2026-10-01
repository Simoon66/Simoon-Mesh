import React from 'react';
import {
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  FileCode,
} from 'lucide-react';
import { FileTransferRecord } from '../types/index.ts';

interface FileTransferCardProps {
  transfer: FileTransferRecord;
  onCancel?: (transferId: string) => void;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatSeconds(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const FileTransferCard: React.FC<FileTransferCardProps> = ({ transfer, onCancel }) => {
  const isImage = transfer.mimeType.startsWith('image/');
  const isVideo = transfer.mimeType.startsWith('video/');
  const isAudio = transfer.mimeType.startsWith('audio/');
  const isArchive =
    transfer.mimeType.includes('zip') ||
    transfer.mimeType.includes('tar') ||
    transfer.mimeType.includes('compressed') ||
    transfer.fileName.endsWith('.zip');
  const isCode =
    transfer.fileName.endsWith('.ts') ||
    transfer.fileName.endsWith('.js') ||
    transfer.fileName.endsWith('.json') ||
    transfer.fileName.endsWith('.rs') ||
    transfer.fileName.endsWith('.py');

  const progressPercent =
    transfer.totalChunks > 0
      ? Math.min(100, Math.round((transfer.chunksCompleted / transfer.totalChunks) * 100))
      : 0;

  const isCompleted = transfer.status === 'completed';
  const isTransferring = transfer.status === 'transferring' || transfer.status === 'pending';
  const isCancelled = transfer.status === 'cancelled';
  const isFailed = transfer.status === 'failed';

  return (
    <div className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900/90 p-3.5 shadow-sm text-neutral-200">
      {/* Header Info */}
      <div className="flex items-start gap-3">
        {/* Thumbnail or File Icon */}
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-800 border border-neutral-700/60">
          {isImage && transfer.blobUrl ? (
            <img
              src={transfer.blobUrl}
              alt={transfer.fileName}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : isImage ? (
            <ImageIcon className="h-6 w-6 text-neutral-400" />
          ) : isVideo ? (
            <Film className="h-6 w-6 text-neutral-400" />
          ) : isAudio ? (
            <Music className="h-6 w-6 text-neutral-400" />
          ) : isArchive ? (
            <Archive className="h-6 w-6 text-amber-400" />
          ) : isCode ? (
            <FileCode className="h-6 w-6 text-cyan-400" />
          ) : (
            <FileText className="h-6 w-6 text-neutral-400" />
          )}
        </div>

        {/* Title & Metadata */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <h4 className="truncate text-xs font-semibold text-neutral-100" title={transfer.fileName}>
              {transfer.fileName}
            </h4>
            <span className="text-[10px] uppercase font-mono text-neutral-400">
              {transfer.direction === 'outgoing' ? 'Sent' : 'Recv'}
            </span>
          </div>

          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-400 font-mono-nums">
            <span>{formatBytes(transfer.fileSize)}</span>
            <span aria-hidden="true">·</span>
            <span>{transfer.totalChunks} chunks</span>
          </div>
        </div>
      </div>

      {/* Progress & Speed Section */}
      {isTransferring && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
            <span className="text-amber-400 font-semibold">{progressPercent}%</span>
            <span>
              {formatBytes(transfer.transferSpeedBytesPerSec)}/s · {formatSeconds(transfer.estimatedSecondsRemaining)} rem
            </span>
          </div>

          {/* Native-feel Progress Bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-amber-500 transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] font-mono text-neutral-500">
              Chunk {transfer.chunksCompleted} of {transfer.totalChunks} (32KB blocks)
            </span>
            {onCancel && (
              <button
                onClick={() => onCancel(transfer.transferId)}
                className="text-[11px] text-rose-400 hover:text-rose-300 font-medium transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Completed State */}
      {isCompleted && (
        <div className="mt-3 pt-2 border-t border-neutral-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Transfer complete</span>
            </div>

            {transfer.blobUrl && (
              <a
                href={transfer.blobUrl}
                download={transfer.fileName}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-900 bg-neutral-100 hover:bg-white rounded transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Save</span>
              </a>
            )}
          </div>

          <div className="mt-1 text-[10px] font-mono text-neutral-500 truncate" title={`SHA-256: ${transfer.sha256Checksum}`}>
            SHA-256: {transfer.sha256Checksum.slice(0, 16)}...
          </div>
        </div>
      )}

      {/* Cancelled / Failed State */}
      {(isCancelled || isFailed) && (
        <div className="mt-2.5 pt-2 border-t border-neutral-800 flex items-center justify-between text-xs text-rose-400">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            <span>{isCancelled ? 'Transfer cancelled' : (transfer.errorMessage || 'Transfer failed')}</span>
          </div>
        </div>
      )}
    </div>
  );
};
