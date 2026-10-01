import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Lock,
  Radio,
  Check,
  CheckCheck,
  AlertCircle,
  FileUp,
} from 'lucide-react';
import {
  ChatMessage,
  FileTransferRecord,
  SimoonIdentity,
  TransportState,
} from '../types/index.ts';
import { FileTransferCard } from './FileTransferCard.tsx';

interface ChatViewProps {
  messages: ChatMessage[];
  transfers: Map<string, FileTransferRecord>;
  connectedPeer: SimoonIdentity | null;
  connectionState: TransportState;
  onSendMessage: (text: string) => Promise<void>;
  onSendFile: (file: File) => Promise<void>;
  onCancelTransfer: (transferId: string) => void;
  onNavigateToConnect: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  transfers,
  connectedPeer,
  connectionState,
  onSendMessage,
  onSendFile,
  onCancelTransfer,
  onNavigateToConnect,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, transfers]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending || connectionState !== 'connected') return;

    try {
      setIsSending(true);
      const text = inputText;
      setInputText('');
      await onSendMessage(text);
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      await onSendFile(files[i]);
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (connectionState !== 'connected') return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        await onSendFile(files[i]);
      }
    }
  };

  const isConnected = connectionState === 'connected';

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex h-[calc(100vh-3.5rem)] flex-col bg-neutral-950"
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950/90 border-2 border-dashed border-amber-500 backdrop-blur-sm">
          <FileUp className="h-12 w-12 text-amber-400 animate-bounce mb-3" />
          <h3 className="font-display text-lg font-bold text-neutral-100">
            Drop file to send over P2P DataChannel
          </h3>
          <p className="text-xs text-neutral-400 mt-1">
            Chunked 32KB binary streaming · Verified via SHA-256
          </p>
        </div>
      )}

      {/* Top Session Status Bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-800/80 bg-neutral-900/40 px-4">
        <div className="flex items-center gap-2">
          {isConnected && connectedPeer ? (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs font-semibold text-neutral-100">
                  {connectedPeer.id}
                </span>
                <span className="text-[11px] text-neutral-400 font-mono hidden sm:inline">
                  · ECDH-P256 AES-GCM
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-neutral-600" />
              <span className="text-xs text-neutral-400">
                {connectionState === 'connecting'
                  ? 'Connecting to peer...'
                  : 'No peer connected'}
              </span>
            </div>
          )}
        </div>

        {!isConnected && (
          <button
            onClick={onNavigateToConnect}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-amber-400 bg-amber-950/40 border border-amber-800/50 rounded hover:bg-amber-900/40 transition-colors"
          >
            <Radio className="h-3.5 w-3.5" />
            <span>Connect a Peer</span>
          </button>
        )}
      </div>

      {/* Messages Feed Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* End-to-End Encryption Notice */}
        <div className="mx-auto max-w-md rounded border border-neutral-800/80 bg-neutral-900/30 p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-neutral-300">
            <Lock className="h-3.5 w-3.5 text-amber-400" />
            <span>End-to-End Encrypted Session</span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">
            Messages and binary files travel peer-to-peer. Private keys remain on device. No cloud storage.
          </p>
        </div>

        {/* Empty state if no messages */}
        {messages.length === 0 && (
          <div className="py-16 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 border border-neutral-800">
              <Radio className="h-6 w-6 text-neutral-500" />
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-sm font-semibold text-neutral-300">
                {isConnected ? 'Channel Open — Start Communicating' : 'Direct Peer Mesh Channel'}
              </h3>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                {isConnected
                  ? 'Send encrypted text messages or drop any file to initiate chunked P2P transfer.'
                  : 'Connect with a peer using their SIMOON ID or QR code to begin.'}
              </p>
            </div>
          </div>
        )}

        {/* Message Items */}
        {messages.map((msg) => {
          const isSelf = msg.isSelf;
          const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-md rounded-lg ${
                  msg.type === 'file'
                    ? 'p-0 bg-transparent'
                    : isSelf
                    ? 'bg-neutral-800 text-neutral-100 border border-neutral-700/60 px-4 py-2.5'
                    : 'bg-neutral-900 text-neutral-200 border border-neutral-800 px-4 py-2.5'
                }`}
              >
                {/* Text Content */}
                {msg.type === 'text' && (
                  <p className="text-sm whitespace-pre-wrap break-words leading-relaxed select-text">
                    {msg.text}
                  </p>
                )}

                {/* File Transfer Card */}
                {msg.type === 'file' && msg.fileTransferId && (
                  <div className="mt-1">
                    {transfers.get(msg.fileTransferId) ? (
                      <FileTransferCard
                        transfer={transfers.get(msg.fileTransferId)!}
                        onCancel={onCancelTransfer}
                      />
                    ) : (
                      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-400">
                        {msg.fileMetadata?.name} (Transfer record stored locally)
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Status & Timestamp */}
              <div className="mt-1 flex items-center gap-1.5 px-1 text-[10px] font-mono text-neutral-500">
                <span>{timeStr}</span>
                {isSelf && (
                  <>
                    <span aria-hidden="true">·</span>
                    {msg.status === 'delivered' ? (
                      <CheckCheck className="h-3 w-3 text-emerald-400" />
                    ) : msg.status === 'sent' ? (
                      <Check className="h-3 w-3 text-neutral-400" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-rose-400" />
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Message & File Input Bar */}
      <div className="border-t border-neutral-800 bg-neutral-950 p-3 sm:p-4">
        <form onSubmit={handleSend} className="mx-auto flex max-w-4xl items-center gap-2">
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            multiple
            className="hidden"
          />

          {/* Attachment Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConnected}
            title={isConnected ? 'Attach & stream file' : 'Connect to a peer to send files'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200 disabled:opacity-40 transition-colors"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          {/* Text Input */}
          <div className="relative flex-1">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                isConnected
                  ? 'Write an encrypted message...'
                  : 'Connect to a peer to start messaging'
              }
              disabled={!isConnected}
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900/90 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:border-amber-400 focus:outline-none disabled:opacity-40"
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!isConnected || !inputText.trim() || isSending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-neutral-950 hover:bg-amber-400 disabled:opacity-40 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
