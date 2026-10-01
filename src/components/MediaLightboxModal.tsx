import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCw, FileText, Film, Image as ImageIcon, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface MediaPreviewItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string; // Object URL or Base64 data URL
}

interface MediaLightboxModalProps {
  item: MediaPreviewItem | null;
  onClose: () => void;
}

export const MediaLightboxModal: React.FC<MediaLightboxModalProps> = ({ item, onClose }) => {
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [item]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (!item) return null;

  const isImage = item.mimeType.startsWith('image/');
  const isVideo = item.mimeType.startsWith('video/');
  const isAudio = item.mimeType.startsWith('audio/');

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = item.url;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <AnimatePresence>
      <div
        ref={containerRef}
        className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-md select-none text-white"
      >
        {/* Top control bar */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/50 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-white/10 text-cyan-400">
              {isImage && <ImageIcon className="w-5 h-5" />}
              {isVideo && <Film className="w-5 h-5" />}
              {isAudio && <Volume2 className="w-5 h-5" />}
              {!isImage && !isVideo && !isAudio && <FileText className="w-5 h-5" />}
            </div>
            <div className="truncate">
              <h2 className="text-sm font-semibold text-zinc-100 truncate">{item.name}</h2>
              <p className="text-xs text-zinc-400">{formatSize(item.size)} • {item.mimeType}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isImage && (
              <>
                <button
                  onClick={() => setZoom(z => Math.max(0.2, z - 0.25))}
                  title="Zoom Out"
                  className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono text-zinc-400 px-1 min-w-[3rem] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom(z => Math.min(4, z + 0.25))}
                  title="Zoom In"
                  className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setRotation(r => (r + 90) % 360)}
                  title="Rotate 90°"
                  className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={handleDownload}
              title="Download File"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition cursor-pointer shadow-lg shadow-cyan-600/20"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>

            <button
              onClick={onClose}
              title="Close Preview (Esc)"
              className="p-2 rounded-lg bg-zinc-800 hover:bg-rose-600/80 text-zinc-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content Viewport */}
        <main className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
          {isImage && (
            <div className="relative max-w-full max-h-full flex items-center justify-center overflow-auto">
              <motion.img
                src={item.url}
                alt={item.name}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.15s ease-out',
                }}
                className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
              />
            </div>
          )}

          {isVideo && (
            <div className="w-full max-w-5xl max-h-[85vh] flex items-center justify-center">
              <video
                src={item.url}
                controls
                autoPlay
                playsInline
                className="w-full max-h-[80vh] rounded-xl shadow-2xl bg-black"
              >
                Your browser does not support the video tag.
              </video>
            </div>
          )}

          {isAudio && (
            <div className="flex flex-col items-center justify-center gap-6 p-8 bg-zinc-900/90 border border-zinc-700/50 rounded-2xl max-w-md w-full shadow-2xl">
              <div className="w-20 h-20 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Volume2 className="w-10 h-10 animate-pulse" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-lg text-zinc-100">{item.name}</p>
                <p className="text-xs text-zinc-400 mt-1">{formatSize(item.size)}</p>
              </div>
              <audio src={item.url} controls className="w-full" autoPlay>
                Your browser does not support audio playback.
              </audio>
            </div>
          )}

          {!isImage && !isVideo && !isAudio && (
            <div className="flex flex-col items-center justify-center gap-5 p-8 bg-zinc-900/80 border border-zinc-700/50 rounded-2xl max-w-md text-center shadow-2xl">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-cyan-400">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-zinc-100">{item.name}</h3>
                <p className="text-xs text-zinc-400 mt-1 font-mono">{formatSize(item.size)} • {item.mimeType}</p>
              </div>
              <p className="text-xs text-zinc-400">
                In-app binary preview is not supported for this file format. You can download it directly.
              </p>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download {item.name}
              </button>
            </div>
          )}
        </main>
      </div>
    </AnimatePresence>
  );
};
