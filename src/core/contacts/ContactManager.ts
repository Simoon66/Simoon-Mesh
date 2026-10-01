export interface Contact {
  id: string; // Peer ID (e.g. 8F4A-29C1-7D52)
  alias: string; // Friendly name (e.g. "Alice (Ops)")
  note?: string; // Optional user note
  avatarColor: string; // Tailored badge color
  publicKeyFingerprint?: string; // SHA-256 fingerprint
  verified: boolean; // SAS cryptographic verification flag
  createdAt: number;
  lastConnectedAt?: number;
}

const STORAGE_KEY = 'simoon_mesh_contacts_v1';

const AVATAR_COLORS = [
  'from-cyan-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-purple-500 to-indigo-600',
  'from-rose-500 to-pink-600',
  'from-sky-500 to-indigo-500',
];

export class ContactManager {
  private contacts: Map<string, Contact> = new Map();
  private listeners: (() => void)[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: Contact[] = JSON.parse(raw);
        this.contacts = new Map(parsed.map(c => [c.id.toUpperCase(), c]));
      }
    } catch (e) {
      console.warn('[ContactManager] Failed to load contacts from storage:', e);
    }
  }

  private save(): void {
    try {
      const list = Array.from(this.contacts.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      this.notify();
    } catch (e) {
      console.warn('[ContactManager] Failed to save contacts to storage:', e);
    }
  }

  private notify(): void {
    this.listeners.forEach(fn => fn());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public getAll(): Contact[] {
    return Array.from(this.contacts.values()).sort((a, b) => (b.lastConnectedAt || b.createdAt) - (a.lastConnectedAt || a.createdAt));
  }

  public get(id: string): Contact | undefined {
    return this.contacts.get(id.toUpperCase().trim());
  }

  public isContact(id: string): boolean {
    return this.contacts.has(id.toUpperCase().trim());
  }

  public addContact(contact: {
    id: string;
    alias: string;
    note?: string;
    publicKeyFingerprint?: string;
    verified?: boolean;
  }): Contact {
    const cleanId = contact.id.toUpperCase().trim();
    const existing = this.contacts.get(cleanId);
    
    // Choose consistent deterministic color based on ID
    const colorIndex = Math.abs(cleanId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % AVATAR_COLORS.length;
    const avatarColor = existing?.avatarColor || AVATAR_COLORS[colorIndex];

    const updated: Contact = {
      id: cleanId,
      alias: contact.alias.trim() || `Peer ${cleanId.slice(0, 4)}`,
      note: contact.note?.trim(),
      avatarColor,
      publicKeyFingerprint: contact.publicKeyFingerprint || existing?.publicKeyFingerprint,
      verified: contact.verified ?? existing?.verified ?? false,
      createdAt: existing?.createdAt || Date.now(),
      lastConnectedAt: existing?.lastConnectedAt,
    };

    this.contacts.set(cleanId, updated);
    this.save();
    return updated;
  }

  public updateLastConnected(id: string): void {
    const cleanId = id.toUpperCase().trim();
    const existing = this.contacts.get(cleanId);
    if (existing) {
      existing.lastConnectedAt = Date.now();
      this.save();
    }
  }

  public removeContact(id: string): boolean {
    const cleanId = id.toUpperCase().trim();
    const existed = this.contacts.delete(cleanId);
    if (existed) {
      this.save();
    }
    return existed;
  }
}

export const contactManager = new ContactManager();
