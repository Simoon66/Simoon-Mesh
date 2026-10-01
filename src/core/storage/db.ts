import { ChatMessage, FileTransferRecord, PeerContact } from '../../types/index.ts';

const DB_NAME = 'simoon_mesh_local_db';
const DB_VERSION = 1;

const STORES = {
  MESSAGES: 'messages',
  TRANSFERS: 'transfers',
  CONTACTS: 'contacts',
};

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

  // --- Transfers ---
  async saveTransfer(transfer: FileTransferRecord): Promise<void> {
    const db = await this.getDB();
    // Exclude raw File / Blob from indexedDB storage to avoid quota issues on huge files
    const cleanRecord: FileTransferRecord = {
      ...transfer,
      fileData: undefined,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.TRANSFERS, 'readwrite');
      const store = tx.objectStore(STORES.TRANSFERS);
      const req = store.put(cleanRecord);
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
      req.onsuccess = () => {
        const list: FileTransferRecord[] = req.result || [];
        list.sort((a, b) => b.startTime - a.startTime);
        resolve(list);
      };
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
      const tx = db.transaction([STORES.MESSAGES, STORES.TRANSFERS, STORES.CONTACTS], 'readwrite');
      tx.objectStore(STORES.MESSAGES).clear();
      tx.objectStore(STORES.TRANSFERS).clear();
      tx.objectStore(STORES.CONTACTS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const localDB = new SimoonDatabase();
