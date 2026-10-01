import {
  generateECDHKeyPair,
  generateECDSAKeyPair,
  sha256Digest,
  importECDHPrivateKey,
  importECDSAPrivateKey,
} from '../crypto/crypto.ts';
import { SimoonIdentity, StoredIdentityKeys } from '../../types/index.ts';

const IDENTITY_DB_NAME = 'simoon_identity_db';
const IDENTITY_STORE = 'identity_vault';
const IDENTITY_KEY = 'local_simoon_identity';

/**
 * Open or initialize IndexedDB for local key storage
 */
function openIdentityDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDENTITY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generate a deterministic SIMOON ID from cryptographic public keys
 * Example format: 8F4A-29C1-7D52
 */
export async function deriveSimoonId(
  ecdhPublicJwk: JsonWebKey,
  ecdsaPublicJwk: JsonWebKey
): Promise<{ id: string; fingerprint: string }> {
  const canonical = JSON.stringify({
    ecdh: { x: ecdhPublicJwk.x, y: ecdhPublicJwk.y, crv: ecdhPublicJwk.crv },
    ecdsa: { x: ecdsaPublicJwk.x, y: ecdsaPublicJwk.y, crv: ecdsaPublicJwk.crv },
  });

  const fullHash = await sha256Digest(canonical);
  const uppercaseHex = fullHash.toUpperCase();

  // Pick 12 characters grouped into 3 chunks of 4: e.g. 8F4A-29C1-7D52
  const part1 = uppercaseHex.slice(0, 4);
  const part2 = uppercaseHex.slice(4, 8);
  const part3 = uppercaseHex.slice(8, 12);
  const formattedId = `${part1}-${part2}-${part3}`;

  return {
    id: formattedId,
    fingerprint: uppercaseHex,
  };
}

/**
 * Generate a brand new local cryptographic identity
 */
export async function createLocalIdentity(): Promise<StoredIdentityKeys> {
  const ecdhPair = await generateECDHKeyPair();
  const ecdsaPair = await generateECDSAKeyPair();

  const ecdhPublicJwk = await crypto.subtle.exportKey('jwk', ecdhPair.publicKey);
  const ecdhPrivateJwk = await crypto.subtle.exportKey('jwk', ecdhPair.privateKey);

  const ecdsaPublicJwk = await crypto.subtle.exportKey('jwk', ecdsaPair.publicKey);
  const ecdsaPrivateJwk = await crypto.subtle.exportKey('jwk', ecdsaPair.privateKey);

  const { id, fingerprint } = await deriveSimoonId(ecdhPublicJwk, ecdsaPublicJwk);

  const storedKeys: StoredIdentityKeys = {
    identity: {
      id,
      createdAt: Date.now(),
      ecdhPublicKeyJwk: ecdhPublicJwk,
      ecdsaPublicKeyJwk: ecdsaPublicJwk,
      fingerprint,
    },
    ecdhPrivateKeyJwk: ecdhPrivateJwk,
    ecdsaPrivateKeyJwk: ecdsaPrivateJwk,
  };

  await saveIdentityKeys(storedKeys);
  return storedKeys;
}

/**
 * Save identity keys into browser local vault (IndexedDB)
 */
export async function saveIdentityKeys(keys: StoredIdentityKeys): Promise<void> {
  const db = await openIdentityDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDENTITY_STORE, 'readwrite');
    const store = tx.objectStore(IDENTITY_STORE);
    const putReq = store.put(keys, IDENTITY_KEY);
    putReq.onsuccess = () => resolve();
    putReq.onerror = () => reject(putReq.error);
  });
}

/**
 * Load existing identity keys from browser local vault
 */
export async function loadIdentityKeys(): Promise<StoredIdentityKeys | null> {
  try {
    const db = await openIdentityDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDENTITY_STORE, 'readonly');
      const store = tx.objectStore(IDENTITY_STORE);
      const getReq = store.get(IDENTITY_KEY);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (e) {
    console.error('Error loading identity keys:', e);
    return null;
  }
}

/**
 * Retrieve or automatically generate local identity on boot
 */
export async function getOrCreateIdentity(): Promise<{
  identity: SimoonIdentity;
  ecdhPrivateKey: CryptoKey;
  ecdsaPrivateKey: CryptoKey;
  storedKeys: StoredIdentityKeys;
}> {
  let keys = await loadIdentityKeys();
  if (!keys) {
    keys = await createLocalIdentity();
  }

  const ecdhPrivateKey = await importECDHPrivateKey(keys.ecdhPrivateKeyJwk);
  const ecdsaPrivateKey = await importECDSAPrivateKey(keys.ecdsaPrivateKeyJwk);

  return {
    identity: keys.identity,
    ecdhPrivateKey,
    ecdsaPrivateKey,
    storedKeys: keys,
  };
}

/**
 * Wipe local identity completely (for resetting or testing)
 */
export async function wipeLocalIdentity(): Promise<void> {
  const db = await openIdentityDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDENTITY_STORE, 'readwrite');
    const store = tx.objectStore(IDENTITY_STORE);
    const delReq = store.delete(IDENTITY_KEY);
    delReq.onsuccess = () => resolve();
    delReq.onerror = () => reject(delReq.error);
  });
}
