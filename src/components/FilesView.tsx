import React, { useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  Download,
  ShieldCheck,
  HardDrive,
  Copy,
  Check,
} from 'lucide-react';
import { FileTransferRecord } from '../types/index.ts';
import { formatBytes } from './FileTransferCard.tsx';

interface FilesViewProps {
  transfers: FileTransferRecord[];
}

export const FilesView: React.FC<FilesViewProps> = ({ transfers }) => {
  const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const filtered = transfers.filter((t) => {
    if (filter === 'incoming') return t.direction === 'incoming';
    if (filter === 'outgoing') return t.direction === 'outgoing';
    return true;
  });

  const totalBytes = transfers
    .filter((t) => t.status === 'completed')
    .reduce((acc, curr) => acc + curr.fileSize, 0);

  const completedCount = transfers.filter((t) => t.status === 'completed').length;

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header and Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-neutral-100">
            Local File Vault
          </h2>
          <p className="text-xs text-neutral-400">
            Cryptographically verified binary transfers conducted directly between peers.
          </p>
        </div>

        {/* Aggregate Stats */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-neutral-300">
            <HardDrive className="h-3.5 w-3.5 text-amber-400" />
            <span>{completedCount} Verified Files</span>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-neutral-300">
            <span>{formatBytes(totalBytes)} Transferred</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-neutral-800 pb-3">
        {(['all', 'incoming', 'outgoing'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
              filter === tab
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Files Grid / List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 py-16 text-center space-y-2">
          <HardDrive className="mx-auto h-8 w-8 text-neutral-600" />
          <h3 className="font-display text-sm font-semibold text-neutral-300">
            No Files in Vault
          </h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            Attach or receive documents, images, videos, or archives during an active P2P session to store them here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => {
            const isImage = item.mimeType.startsWith('image/');
            const isVideo = item.mimeType.startsWith('video/');
            const isAudio = item.mimeType.startsWith('audio/');
            const isArchive = item.mimeType.includes('zip') || item.fileName.endsWith('.zip');

            return (
              <div
                key={item.transferId}
                className="flex flex-col justify-between rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 space-y-3 hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Thumbnail / Icon */}
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-800 border border-neutral-700/60">
                    {isImage && item.blobUrl ? (
                      <img
                        src={item.blobUrl}
                        alt={item.fileName}
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
                    ) : (
                      <FileText className="h-6 w-6 text-neutral-400" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-xs font-semibold text-neutral-100" title={item.fileName}>
                      {item.fileName}
                    </h4>
                    <div className="mt-1 flex items-center gap-2 text-[11px] font-mono text-neutral-400">
                      <span>{formatBytes(item.fileSize)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{item.direction}</span>
                      <span aria-hidden="true">·</span>
                      <span>{new Date(item.startTime).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* SHA-256 Checksum Bar */}
                <div className="rounded border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 flex items-center justify-between text-[10px] font-mono text-neutral-400">
                  <div className="flex items-center gap-1.5 truncate">
                    <ShieldCheck className="h-3 w-3 text-emerald-400 shrink-0" />
                    <span className="truncate">SHA-256: {item.sha256Checksum}</span>
                  </div>
                  <button
                    onClick={() => handleCopyHash(item.sha256Checksum)}
                    className="ml-2 hover:text-neutral-200 shrink-0"
                    title="Copy SHA-256 checksum"
                  >
                    {copiedHash === item.sha256Checksum ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span
                    className={`font-mono text-[11px] ${
                      item.status === 'completed'
                        ? 'text-emerald-400'
                        : item.status === 'cancelled'
                        ? 'text-rose-400'
                        : 'text-amber-400'
                    }`}
                  >
                    Status: {item.status.toUpperCase()}
                  </span>

                  {item.blobUrl && (
                    <a
                      href={item.blobUrl}
                      download={item.fileName}
                      className="flex items-center gap-1 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded text-xs font-medium transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
