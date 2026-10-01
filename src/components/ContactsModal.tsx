import React, { useState, useEffect } from 'react';
import { X, UserPlus, Search, ShieldCheck, Trash2, Edit2, Link2, Check, User, Clock, ArrowRight } from 'lucide-react';
import { contactManager, Contact } from '../core/contacts/ContactManager.ts';
import { motion, AnimatePresence } from 'motion/react';

interface ContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPeerToConnect: (peerId: string) => void;
  connectedPeerId: string | null;
}

export const ContactsModal: React.FC<ContactsModalProps> = ({
  isOpen,
  onClose,
  onSelectPeerToConnect,
  connectedPeerId,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newPeerId, setNewPeerId] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newNote, setNewNote] = useState('');
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editAlias, setEditAlias] = useState('');
  const [editNote, setEditNote] = useState('');

  useEffect(() => {
    setContacts(contactManager.getAll());
    const unsub = contactManager.subscribe(() => {
      setContacts(contactManager.getAll());
    });
    return unsub;
  }, []);

  if (!isOpen) return null;

  const filtered = contacts.filter(
    c =>
      c.alias.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newPeerId.trim().toUpperCase();
    if (!cleanId) return;

    contactManager.addContact({
      id: cleanId,
      alias: newAlias.trim() || `Peer ${cleanId.slice(0, 4)}`,
      note: newNote.trim(),
    });

    setNewPeerId('');
    setNewAlias('');
    setNewNote('');
    setIsAdding(false);
  };

  const handleStartEdit = (contact: Contact) => {
    setEditingContactId(contact.id);
    setEditAlias(contact.alias);
    setEditNote(contact.note || '');
  };

  const handleSaveEdit = (id: string) => {
    contactManager.addContact({
      id,
      alias: editAlias,
      note: editNote,
    });
    setEditingContactId(null);
  };

  const handleDelete = (id: string) => {
    contactManager.removeContact(id);
  };

  const formatLastSeen = (timestamp?: number) => {
    if (!timestamp) return 'Never connected';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Saved Contacts</h2>
              <p className="text-xs text-zinc-400">{contacts.length} peers saved locally</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isAdding && (
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add Contact
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Add Contact Form Drawer */}
        <AnimatePresence>
          {isAdding && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onSubmit={handleAddSubmit}
              className="p-4 bg-zinc-950/80 border-b border-zinc-800 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">New Contact</span>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Peer ID (e.g. 8F4A-29C1-7D52)"
                  value={newPeerId}
                  onChange={e => setNewPeerId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500"
                />
                <input
                  type="text"
                  placeholder="Alias / Name (e.g. Alice Ops)"
                  value={newAlias}
                  onChange={e => setNewAlias(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <input
                type="text"
                placeholder="Optional Note"
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Save Contact to Local Mesh
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Search */}
        <div className="p-3 border-b border-zinc-800 bg-zinc-900/50">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search contacts by name or Peer ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-950/70 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-zinc-800/40">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-zinc-500">
              <User className="w-8 h-8 mx-auto opacity-30 mb-2" />
              <p className="text-sm font-medium">No contacts found</p>
              <p className="text-xs text-zinc-600 mt-1">
                Save peers using their Peer ID or click "Save Contact" when connected in chat.
              </p>
            </div>
          ) : (
            filtered.map(contact => {
              const isCurrent = connectedPeerId?.toUpperCase() === contact.id.toUpperCase();
              const isEditing = editingContactId === contact.id;

              return (
                <div
                  key={contact.id}
                  className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Badge */}
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${contact.avatarColor} flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0`}
                    >
                      {contact.alias.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="space-y-1 my-1">
                          <input
                            type="text"
                            value={editAlias}
                            onChange={e => setEditAlias(e.target.value)}
                            className="w-full px-2 py-1 bg-zinc-950 border border-cyan-500 rounded text-xs text-white"
                            placeholder="Alias"
                          />
                          <input
                            type="text"
                            value={editNote}
                            onChange={e => setEditNote(e.target.value)}
                            className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs text-zinc-300"
                            placeholder="Note"
                          />
                          <div className="flex gap-1 pt-1">
                            <button
                              onClick={() => handleSaveEdit(contact.id)}
                              className="px-2 py-0.5 bg-cyan-600 text-white rounded text-[10px] font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingContactId(null)}
                              className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[10px]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm text-zinc-100 truncate">
                              {contact.alias}
                            </span>
                            {contact.verified && (
                              <span title="SAS Cryptographically Verified">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              </span>
                            )}
                            {isCurrent && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-mono text-zinc-400 truncate">{contact.id}</p>
                          {contact.note && (
                            <p className="text-[11px] text-zinc-500 italic truncate mt-0.5">{contact.note}</p>
                          )}
                          <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-0.5">
                            <Clock className="w-3 h-3" />
                            <span>{formatLastSeen(contact.lastConnectedAt)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!isEditing && (
                      <>
                        <button
                          onClick={() => handleStartEdit(contact)}
                          title="Edit Contact"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(contact.id)}
                          title="Delete Contact"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            onSelectPeerToConnect(contact.id);
                            onClose();
                          }}
                          title="Connect to Peer"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-600/80 hover:bg-cyan-500 text-white text-xs font-medium transition cursor-pointer shadow-sm ml-1"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Connect</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
