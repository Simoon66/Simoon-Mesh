import { ChatMessage, FileTransferRecord, PeerContact } from '../../types/index.ts';

const DB_NAME = 'simoon_mesh_local_db';
const DB_VERSION = 2;

const STORES = {
  MESSAGES: 'messages',
  TRANSFERS: 'transfers',
  CONTACTS: 'contacts',
  DRAFTS: 'drafts',
};

export interface StoredDraft {
  conversationId: string;
  draftText: string;
  updatedAt: number;
}

class SimoonDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
            const msgStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
            msgStore.createIndex('conversationId', 'conversationId', { unique: false });
            msgStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.TRANSFERS)) {
            const transferStore = db.createObjectStore(STORES.TRANSFERS, { keyPath: 'transferId' });
            transferStore.createIndex('senderId', 'senderId', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.CONTACTS)) {
            db.createObjectStore(STORES.CONTACTS, { keyPath: 'peerId' });
          }
          if (!db.objectStoreNames.contains(STORES.DRAFTS)) {
            db.createObjectStore(STORES.DRAFTS, { keyPath: 'conversationId' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  // --- Messages ---
  async saveMessage(msg: ChatMessage): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MESSAGES, 'readwrite');
      const store = tx.objectStore(STORES.MESSAGES);
      const req = store.put(msg);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getMessages(conversationId?: string): Promise<ChatMessage[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MESSAGES, 'readonly');
      const store = tx.objectStore(STORES.MESSAGES);
      let req: IDBRequest;

      if (conversationId) {
        const index = store.index('conversationId');
        req = index.getAll(conversationId);
      } else {
        req = store.getAll();
      }

      req.onsuccess = () => {
        const results: ChatMessage[] = req.result || [];
        results.sort((a, b) => a.timestamp - b.timestamp);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteMessage(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MESSAGES, 'readwrite');
      const store = tx.objectStore(STORES.MESSAGES);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clearMessages(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MESSAGES, 'readwrite');
      const store = tx.objectStore(STORES.MESSAGES);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async updateMessageText(id: string, newText: string, editedAt: number): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MESSAGES, 'readwrite');
      const store = tx.objectStore(STORES.MESSAGES);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const msg: ChatMessage = getReq.result;
        if (msg) {
          msg.text = newText;
          msg.isEdited = true;
          msg.editedAt = editedAt;
          const putReq = store.put(msg);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        } else {
          resolve();
        }
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // --- Drafts (Automatic IndexedDB persistence when navigating / switching tabs) ---
  async saveDraft(conversationId: string, draftText: string): Promise<void> {
    // Also save to localStorage as fast sync backup
    try {
      if (!draftText.trim()) {
        localStorage.removeItem(`simoon_draft_${conversationId}`);
      } else {
        localStorage.setItem(`simoon_draft_${conversationId}`, draftText);
      }
    } catch {}

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.DRAFTS, 'readwrite');
      const store = tx.objectStore(STORES.DRAFTS);
      if (!draftText.trim()) {
        const req = store.delete(conversationId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } else {
        const req = store.put({
          conversationId,
          draftText,
          updatedAt: Date.now(),
        });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }
    });
  }

  async getDraft(conversationId: string): Promise<string> {
    try {
      const local = localStorage.getItem(`simoon_draft_${conversationId}`);
      if (local !== null) return local;
    } catch {}

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.DRAFTS, 'readonly');
      const store = tx.objectStore(STORES.DRAFTS);
      const req = store.get(conversationId);
      req.onsuccess = () => {
        const res: StoredDraft = req.result;
        resolve(res ? res.draftText : '');
      };
      req.onerror = () => reject(req.error);
    });
  }

  async clearDraft(conversationId: string): Promise<void> {
    try {
      localStorage.removeItem(`simoon_draft_${conversationId}`);
    } catch {}

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.DRAFTS, 'readwrite');
      const store = tx.objectStore(STORES.DRAFTS);
      const req = store.delete(conversationId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- Transfers ---
  async saveTransfer(record: FileTransferRecord): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.TRANSFERS, 'readwrite');
      const store = tx.objectStore(STORES.TRANSFERS);
      const toSave = { ...record, fileData: undefined };
      const req = store.put(toSave);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getTransfers(): Promise<FileTransferRecord[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.TRANSFERS, 'readonly');
      const store = tx.objectStore(STORES.TRANSFERS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Contacts ---
  async saveContact(contact: PeerContact): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.CONTACTS, 'readwrite');
      const store = tx.objectStore(STORES.CONTACTS);
      const req = store.put(contact);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getContacts(): Promise<PeerContact[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.CONTACTS, 'readonly');
      const store = tx.objectStore(STORES.CONTACTS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Clear Data ---
  async clearAll(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.MESSAGES, STORES.TRANSFERS, STORES.CONTACTS, STORES.DRAFTS], 'readwrite');
      tx.objectStore(STORES.MESSAGES).clear();
      tx.objectStore(STORES.TRANSFERS).clear();
      tx.objectStore(STORES.CONTACTS).clear();
      tx.objectStore(STORES.DRAFTS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const localDB = new SimoonDatabase();
