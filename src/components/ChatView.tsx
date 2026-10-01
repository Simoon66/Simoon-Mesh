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
  Pencil,
  Trash2,
  X,
  UserPlus,
  Users,
  Bell,
  BellOff,
  ShieldCheck,
  Copy,
  Eraser,
} from 'lucide-react';
import {
  ChatMessage,
  FileTransferRecord,
  SimoonIdentity,
  TransportState,
} from '../types/index.ts';
import { FileTransferCard } from './FileTransferCard.tsx';
import { MediaLightboxModal, MediaPreviewItem } from './MediaLightboxModal.tsx';
import { contactManager, Contact } from '../core/contacts/ContactManager.ts';
import { notificationService } from '../utils/notifications.ts';

interface ChatViewProps {
  messages: ChatMessage[];
  transfers: Map<string, FileTransferRecord>;
  connectedPeer: SimoonIdentity | null;
  connectionState: TransportState;
  onSendMessage: (text: string) => Promise<void>;
  onEditMessage: (messageId: string, newText: string) => Promise<void>;
  onUnsendMessage: (messageId: string) => Promise<void>;
  onSendFile: (file: File) => Promise<void>;
  onCancelTransfer: (transferId: string) => void;
  onNavigateToConnect: () => void;
  onOpenContacts: () => void;
  onClearChat?: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  transfers,
  connectedPeer,
  connectionState,
  onSendMessage,
  onEditMessage,
  onUnsendMessage,
  onSendFile,
  onCancelTransfer,
  onNavigateToConnect,
  onOpenContacts,
  onClearChat,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Edit message state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editTextValue, setEditTextValue] = useState('');

  // Media preview lightbox state
  const [previewItem, setPreviewItem] = useState<MediaPreviewItem | null>(null);

  // Contact state & Sound
  const [activeContact, setActiveContact] = useState<Contact | undefined>(undefined);
  const [soundEnabled, setSoundEnabled] = useState(notificationService.isSoundEnabled());
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSaveContactDialog, setShowSaveContactDialog] = useState(false);
  const [newContactAlias, setNewContactAlias] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  // Sync contact info
  useEffect(() => {
    if (connectedPeer) {
      setActiveContact(contactManager.get(connectedPeer.id));
      setNewContactAlias(`Peer ${connectedPeer.id.slice(0, 4)}`);
    } else {
      setActiveContact(undefined);
    }

    const unsub = contactManager.subscribe(() => {
      if (connectedPeer) {
        setActiveContact(contactManager.get(connectedPeer.id));
      }
    });
    return unsub;
  }, [connectedPeer]);

  // Focus edit input when editing begins
  useEffect(() => {
    if (editingMessageId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingMessageId]);

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

  const handleStartEdit = (msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setEditTextValue(msg.text || '');
  };

  const handleSaveEdit = async (msgId: string) => {
    if (!editTextValue.trim()) return;
    try {
      await onEditMessage(msgId, editTextValue.trim());
      setEditingMessageId(null);
    } catch (err) {
      console.error('Failed to edit message:', err);
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditTextValue('');
  };

  // Direct instant message deletion
  const handleDeleteMessage = async (msgId: string) => {
    try {
      await onUnsendMessage(msgId);
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const handleCopyText = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleConfirmSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectedPeer) return;
    contactManager.addContact({
      id: connectedPeer.id,
      alias: newContactAlias.trim() || `Peer ${connectedPeer.id.slice(0, 4)}`,
      publicKeyFingerprint: connectedPeer.fingerprint,
      verified: true,
    });
    setActiveContact(contactManager.get(connectedPeer.id));
    setShowSaveContactDialog(false);
  };

  const toggleSound = async () => {
    const nextState = !soundEnabled;
    notificationService.setSoundEnabled(nextState);
    setSoundEnabled(nextState);
    if (nextState) {
      await notificationService.requestDesktopPermission();
      notificationService.playConnectChime();
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      await onSendFile(files[i]);
    }
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
      className="relative flex h-[calc(100vh-3.5rem)] flex-col bg-neutral-950 select-text"
    >
      {/* Fullscreen Media Lightbox Modal */}
      <MediaLightboxModal item={previewItem} onClose={() => setPreviewItem(null)} />

      {/* In-App Save Contact Dialog */}
      {showSaveContactDialog && connectedPeer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form
            onSubmit={handleConfirmSaveContact}
            className="bg-neutral-900 border border-neutral-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-neutral-100 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-cyan-400" />
                <span>Save Peer to Contacts</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSaveContactDialog(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                Peer ID: <span className="text-neutral-200">{connectedPeer.id}</span>
              </label>
              <input
                type="text"
                placeholder="Enter Alias or Name..."
                value={newContactAlias}
                onChange={e => setNewContactAlias(e.target.value)}
                autoFocus
                required
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-sm text-neutral-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowSaveContactDialog(false)}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 text-xs text-neutral-300 hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white cursor-pointer"
              >
                Save Contact
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950/90 border-2 border-dashed border-cyan-500 backdrop-blur-sm">
          <FileUp className="h-12 w-12 text-cyan-400 animate-bounce mb-3" />
          <h3 className="font-display text-lg font-bold text-neutral-100">
            Drop file to send over P2P DataChannel
          </h3>
          <p className="text-xs text-neutral-400 mt-1">
            Chunked 32KB binary streaming · Verified via SHA-256
          </p>
        </div>
      )}

      {/* Top Session Status Bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-800/80 bg-neutral-900/60 px-4">
        <div className="flex items-center gap-3">
          {isConnected && connectedPeer ? (
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-xs text-neutral-100">
                    {activeContact ? activeContact.alias : `Peer ${connectedPeer.id.slice(0, 4)}`}
                  </span>
                  {activeContact?.verified && (
                    <span title="Cryptographically Verified">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-neutral-400 bg-neutral-800/80 px-1.5 py-0.5 rounded">
                    {connectedPeer.id}
                  </span>
                </div>
                <span className="text-[10px] text-neutral-400 font-mono hidden sm:inline">
                  ECDH-P256 · AES-GCM 256 E2EE
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-neutral-600" />
              <span className="text-xs text-neutral-400">
                {connectionState === 'connecting'
                  ? 'Connecting to peer...'
                  : 'Offline / Standby (Local Vault Active)'}
              </span>
            </div>
          )}
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {/* Notification Mute / Unmute Toggle */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Alert sounds & notifications enabled (click to mute)' : 'Muted (click to enable)'}
            className={`p-2 rounded-lg text-xs transition cursor-pointer border ${
              soundEnabled
                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20'
                : 'bg-neutral-800/80 text-neutral-400 border-neutral-700 hover:text-neutral-200'
            }`}
          >
            {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>

          {/* Contacts Drawer Button */}
          <button
            onClick={onOpenContacts}
            title="Open Contacts & Address Book"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 bg-neutral-800/80 border border-neutral-700 rounded-lg hover:bg-neutral-700/80 hover:text-white transition cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Contacts</span>
          </button>

          {/* Clear Messages Action */}
          {messages.length > 0 && onClearChat && (
            <div className="relative">
              {showClearConfirm ? (
                <div className="flex items-center gap-1 bg-neutral-800 border border-neutral-700 rounded-lg p-1 animate-fade-in">
                  <button
                    onClick={() => {
                      onClearChat();
                      setShowClearConfirm(false);
                    }}
                    className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-semibold cursor-pointer"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-1.5 py-0.5 text-neutral-400 hover:text-white text-[10px]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  title="Clear chat messages"
                  className="p-2 rounded-lg text-xs text-neutral-400 hover:text-rose-400 hover:bg-neutral-800/80 border border-neutral-700/60 transition cursor-pointer"
                >
                  <Eraser className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Save active peer as contact if not yet saved */}
          {isConnected && connectedPeer && !activeContact && (
            <button
              onClick={() => setShowSaveContactDialog(true)}
              title="Save this peer to local contacts"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-400 bg-amber-950/40 border border-amber-800/50 rounded-lg hover:bg-amber-900/40 transition cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Save</span>
            </button>
          )}

          {!isConnected && (
            <button
              onClick={onNavigateToConnect}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 rounded-lg hover:bg-cyan-900/40 transition cursor-pointer"
            >
              <Radio className="h-3.5 w-3.5" />
              <span>Connect</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Feed Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* End-to-End Encryption Notice */}
        <div className="mx-auto max-w-md rounded-xl border border-neutral-800/80 bg-neutral-900/30 p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-neutral-300">
            <Lock className="h-3.5 w-3.5 text-cyan-400" />
            <span>Zero-Knowledge End-to-End Encrypted</span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">
            Messages and binary files travel direct peer-to-peer. Private keys remain on device.
          </p>
        </div>

        {/* Empty state if no messages */}
        {messages.length === 0 && (
          <div className="py-16 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900 border border-neutral-800 text-cyan-400">
              <Radio className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-sm font-semibold text-neutral-300">
                {isConnected ? 'Channel Open — Start Communicating' : 'Direct Peer Mesh Channel'}
              </h3>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                {isConnected
                  ? 'Send encrypted text messages, images, videos, or drop any file to stream.'
                  : 'Connect with a peer using a 6-digit code or QR handshake to begin.'}
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
          const isEditing = editingMessageId === msg.id;
          const isSelected = selectedMsgId === msg.id;

          return (
            <div
              key={msg.id}
              onClick={() => setSelectedMsgId(isSelected ? null : msg.id)}
              className={`flex flex-col group relative ${isSelf ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`relative max-w-[85%] sm:max-w-md rounded-2xl transition-all ${
                  msg.type === 'file'
                    ? 'p-0 bg-transparent'
                    : isSelf
                    ? 'bg-neutral-800 text-neutral-100 border border-neutral-700/60 px-4 py-2.5 shadow-sm'
                    : 'bg-neutral-900 text-neutral-200 border border-neutral-800 px-4 py-2.5 shadow-sm'
                }`}
              >
                {/* Text Content */}
                {msg.type === 'text' && (
                  <div>
                    {isEditing ? (
                      <div className="flex flex-col gap-2 min-w-[240px] sm:min-w-[280px]" onClick={e => e.stopPropagation()}>
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editTextValue}
                          onChange={(e) => setEditTextValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(msg.id);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          className="w-full px-3 py-1.5 bg-neutral-950 border border-cyan-500 rounded-lg text-sm text-neutral-100 focus:outline-none"
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-700 text-xs cursor-pointer"
                            title="Cancel (Esc)"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(msg.id)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium cursor-pointer"
                            title="Save changes (Enter)"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed select-text">
                        {msg.text}
                      </p>
                    )}
                  </div>
                )}

                {/* File Transfer Card */}
                {msg.type === 'file' && msg.fileTransferId && (
                  <div className="mt-1">
                    {transfers.get(msg.fileTransferId) ? (
                      <FileTransferCard
                        transfer={transfers.get(msg.fileTransferId)!}
                        onCancel={onCancelTransfer}
                        onPreview={setPreviewItem}
                      />
                    ) : (
                      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-400">
                        {msg.fileMetadata?.name} (Transfer stored locally)
                      </div>
                    )}
                  </div>
                )}

                {/* Quick Action Toolbar (Always accessible on hover or tap) */}
                {!isEditing && (
                  <div
                    onClick={e => e.stopPropagation()}
                    className={`absolute right-0 -top-3.5 ${
                      isSelected ? 'flex' : 'hidden group-hover:flex'
                    } items-center gap-1 bg-neutral-900/95 border border-neutral-700 rounded-full px-1.5 py-0.5 shadow-lg z-10`}
                  >
                    {/* Copy text */}
                    {msg.type === 'text' && msg.text && (
                      <button
                        onClick={() => handleCopyText(msg.text!, msg.id)}
                        title={copiedMsgId === msg.id ? 'Copied!' : 'Copy text'}
                        className="p-1 rounded-full text-neutral-400 hover:text-cyan-400 hover:bg-neutral-800 transition cursor-pointer"
                      >
                        {copiedMsgId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}

                    {/* Edit (for own text messages) */}
                    {isSelf && msg.type === 'text' && (
                      <button
                        onClick={() => handleStartEdit(msg)}
                        title="Edit message"
                        className="p-1 rounded-full text-neutral-400 hover:text-cyan-400 hover:bg-neutral-800 transition cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}

                    {/* Delete / Remove / Unsend */}
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      title={isSelf ? 'Unsend / Delete message' : 'Delete message from history'}
                      className="p-1 rounded-full text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Status & Timestamp */}
              <div className="mt-1 flex items-center gap-1.5 px-1 text-[10px] font-mono text-neutral-500">
                <span>{timeStr}</span>
                {msg.isEdited && (
                  <span className="text-[10px] text-cyan-400/80 font-sans italic">(edited)</span>
                )}
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-cyan-500/50 hover:text-cyan-300 disabled:opacity-40 transition cursor-pointer"
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
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900/90 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:border-cyan-400 focus:outline-none disabled:opacity-40"
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!isConnected || !inputText.trim() || isSending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40 transition cursor-pointer shadow-sm shadow-cyan-600/30"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
