/**
 * SIMOON MESH Cryptographic Engine
 * Standard Web Crypto API primitives:
 * - ECDH (P-256) for Diffie-Hellman Key Agreement
 * - HKDF (SHA-256) for Key Derivation
 * - AES-GCM (256-bit) for Authenticated Symmetric Encryption
 * - ECDSA (P-256, SHA-256) for Identity Signatures
 * - SHA-256 for Identity Fingerprinting & File Integrity Verification
 */

export interface EncryptedPayload {
  iv: string; // Base64 12-byte IV
  ciphertext: string; // Base64 ciphertext with authentication tag
}

// Convert ArrayBuffer to Base64
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 to Uint8Array
export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Convert ArrayBuffer to Hex string
export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Convert Hex string to Uint8Array
export function hexToBuffer(hex: string): Uint8Array {
  const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Generate SHA-256 digest of data
 */
export async function sha256Digest(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data).buffer as ArrayBuffer;
  } else if (data instanceof Uint8Array) {
    buffer = data.buffer as ArrayBuffer;
  } else {
    buffer = data;
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return bufferToHex(hashBuffer);
}

/**
 * Generate an ECDH P-256 Keypair for Diffie-Hellman key exchange
 */
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable for local storage JWK export
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Generate an ECDSA P-256 Keypair for Identity Signing & Verification
 */
export async function generateECDSAKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['sign', 'verify']
  );
}

/**
 * Derive AES-GCM (256-bit) shared secret key using ECDH + HKDF
 */
export async function deriveSharedSecretKey(
  localPrivateKey: CryptoKey,
  remotePublicKey: CryptoKey,
  saltStr: string = 'SIMOON-MESH-v1-HKDF-SALT'
): Promise<CryptoKey> {
  // 1. Derive shared bits from ECDH
  const sharedBits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: remotePublicKey,
    },
    localPrivateKey,
    256
  );

  // 2. Import shared bits for HKDF derivation
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  const salt = new TextEncoder().encode(saltStr);
  const info = new TextEncoder().encode('SIMOON-MESH-AES-GCM-SESSION');

  // 3. Derive 256-bit AES-GCM symmetric key
  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info,
    },
    hkdfKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext string or bytes with AES-GCM 256-bit
 */
export async function encryptAESGCM(
  sharedKey: CryptoKey,
  plaintext: string | Uint8Array
): Promise<EncryptedPayload> {
  const data = typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
  // Standard 12-byte (96-bit) IV for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    sharedKey,
    data as BufferSource
  );

  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer),
  };
}

/**
 * Decrypt AES-GCM 256-bit payload
 */
export async function decryptAESGCM(
  sharedKey: CryptoKey,
  payload: EncryptedPayload
): Promise<Uint8Array> {
  const iv = base64ToBuffer(payload.iv);
  const ciphertext = base64ToBuffer(payload.ciphertext);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    sharedKey,
    ciphertext as BufferSource
  );

  return new Uint8Array(decryptedBuffer);
}

/**
 * Decrypt AES-GCM into UTF-8 string
 */
export async function decryptAESGCMToString(
  sharedKey: CryptoKey,
  payload: EncryptedPayload
): Promise<string> {
  const decryptedBytes = await decryptAESGCM(sharedKey, payload);
  return new TextDecoder().decode(decryptedBytes);
}

/**
 * Sign data with ECDSA P-256
 */
export async function signData(privateKey: CryptoKey, data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    bytes as BufferSource
  );
  return bufferToBase64(signature);
}

/**
 * Verify data signature with ECDSA P-256
 */
export async function verifySignature(
  publicKey: CryptoKey,
  signatureBase64: string,
  data: string | Uint8Array
): Promise<boolean> {
  try {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const signature = base64ToBuffer(signatureBase64);
    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      publicKey,
      signature as BufferSource,
      bytes as BufferSource
    );
  } catch (e) {
    console.error('Signature verification error:', e);
    return false;
  }
}

/**
 * Import JWK formatted Public ECDH Key
 */
export async function importECDHPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

/**
 * Import JWK formatted Private ECDH Key
 */
export async function importECDHPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Import JWK formatted Public ECDSA Key
 */
export async function importECDSAPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['verify']
  );
}

/**
 * Import JWK formatted Private ECDSA Key
 */
export async function importECDSAPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign']
  );
}
