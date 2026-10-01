# SIMOON MESH — Human × AI

> **"Communication without the cloud."**  
> An open-source, peer-to-peer cryptographic communication protocol and messenger engineered for autonomy, zero-server privacy, and future internet-free mesh networks.

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](https://opensource.org/licenses/MIT)
[![Protocol Version](https://img.shields.io/badge/Protocol-v0.1--draft-cyan.svg)](#architecture)
[![Cryptographic Primitives](https://img.shields.io/badge/Crypto-ECDH%20%7C%20AES--GCM--256%20%7C%20ECDSA-emerald.svg)](#security-model)

---

## What It Is

**SIMOON MESH** is a decentralized, serverless communication protocol foundation. 

Unlike traditional messengers that rely on centralized databases (WhatsApp, Signal, Telegram), and unlike systems that mandate phone numbers, email addresses, or cloud-synced accounts, SIMOON MESH operates on self-sovereign cryptographic identities generated purely on the client device.

This repository contains the **Web MVP and Protocol Foundation (v0.1)**. It establishes:
1. **Local Cryptographic Identity**: Deterministic SIMOON IDs derived from locally generated ECDH and ECDSA keypairs.
2. **End-to-End Encryption (E2EE)**: Web Crypto API primitives (ECDH P-256 + HKDF + AES-GCM 256) ensuring zero plaintext exposure to intermediate infrastructure.
3. **Transport Abstraction Layer (`ITransport`)**: An architecture separating high-level messaging and chunked binary file transfer from the underlying physical radio transport (currently WebRTC DataChannels, architected for future Bluetooth LE and Wi-Fi Direct).
4. **Chunked Binary File Transfer Engine**: Native streaming of arbitrary files (images, video, documents, ZIP archives) in discrete 32KB binary frames with flow control, live throughput meters, and SHA-256 post-reassembly verification.

---

## Why It Exists

Modern communication infrastructure is fragile and surveillance-heavy:
- **Centralized Vulnerability**: Cloud chat services go dark during network outages, undersea cable cuts, natural disasters, or authoritarian internet shutdowns.
- **Identity Exploitation**: Phone numbers and emails tie communication to real-world identities, sim-swap vectors, and persistent metadata tracking.
- **Fake "Offline" Illusion**: Many tools claim offline support while secretly routing all message histories through cloud databases or centralized servers.

The long-term objective of SIMOON MESH is to enable **truly off-grid communication**—allowing humans and local AI nodes to exchange encrypted messages and files directly over nearby device radios (Bluetooth, Wi-Fi Direct) and multi-hop relay meshes without internet access.

---

## Current Functionality (v0.1 Web MVP) vs. Future Roadmap

We believe in engineering transparency. The table below clearly distinguishes what is **actually working right now** versus what is scheduled for future releases:

| Feature | Status | Implementation Details |
| :--- | :--- | :--- |
| **No Account / No Phone / No Email** | **CURRENT** | Cryptographic keypairs generated locally in browser via `crypto.subtle`. Stored non-extractably in local IndexedDB. |
| **SIMOON ID Generation** | **CURRENT** | 12-character formatted fingerprint (`XXXX-XXXX-XXXX`, e.g. `8F4A-29C1-7D52`) derived deterministically from public keys. |
| **End-to-End Encryption (E2EE)** | **CURRENT** | ECDH P-256 key agreement + HKDF-SHA256 + AES-GCM 256-bit with unique 96-bit random IVs per message. |
| **Peer-to-Peer Data Transfer** | **CURRENT** | Direct browser-to-browser WebRTC DataChannels (`ordered: true`, `binaryType: 'arraybuffer'`). |
| **Chunked Binary File Transfer** | **CURRENT** | 32KB binary frames, non-blocking flow control via `bufferedAmountLowThreshold`, live speed & ETA calculation. |
| **SHA-256 File Integrity Check** | **CURRENT** | Full payload hash verified against sender's checksum before assembly. |
| **Local Message & File Vault** | **CURRENT** | Private IndexedDB storage for chat histories and received file records. Zero cloud database. |
| **Dual Signaling Modes** | **CURRENT** | Automated local signaling relay (`/api/signal`) + 100% Serverless Airgap SDP Token exchange. |
| **Real Diagnostics Panel** | **CURRENT** | Live WebRTC ICE states, DataChannel buffer gauge, throughput meters, and raw protocol envelope inspector. |
| **Native Android Client** | *FUTURE (v0.3)* | Kotlin / Jetpack Compose client sharing the identical envelope and chunk protocol. |
| **Bluetooth LE / Wi-Fi Direct** | *FUTURE (v0.4)* | Local radio transports plugging into `ITransport` for off-grid nearby communication. |
| **Offline Store-and-Forward** | *FUTURE (v0.5)* | Delay-tolerant epidemic routing when sender and receiver are not simultaneously online. |
| **Double Ratchet (Forward Secrecy)** | *FUTURE (v0.5)* | Per-message key ratcheting (Signal protocol style). |
| **Multi-Hop Mesh Relay** | *FUTURE (v0.7)* | Intermediate nodes relaying encrypted envelopes without possessing decryption keys. |

> **Honest Engineering Note:** The current Web version operates in modern web browsers. Web browsers cannot access raw Wi-Fi Direct or classic Bluetooth RFCOMM sockets due to web security sandbox restrictions. Therefore, the web version utilizes WebRTC DataChannels for direct P2P transfer over existing IP networks. **Do not expect the browser MVP to connect two air-gapped laptops without a local Wi-Fi or network connection.** True radio-level offline mesh will arrive in the native Android release (v0.3/v0.4).

---

## Architecture & Layer Separation

SIMOON MESH follows a strict layered architecture:

```
┌────────────────────────────────────────────────────────┐
│                   Application Layer                    │
│   (React UI: Chat, File Vault, Diagnostics, Pairing)   │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│              Messaging & File Protocol Engine          │
│   (Envelopes, 32KB Binary Chunk Framer, Flow Control)  │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│              E2EE Cryptographic Engine                 │
│      (ECDH P-256 Agreement, HKDF, AES-GCM 256)         │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│            Transport Abstraction Interface             │
│                      (ITransport)                      │
└─────────┬───────────────────────┬──────────────────────┘
          │ (Active)              │ (Planned)
┌─────────▼──────────────┐  ┌─────▼──────────────────────┐
│  WebRTCTransport (P2P) │  │  Android BLE / Wi-Fi P2P   │
│   (WebRTC DataChannel) │  │    (Local Offline Radio)   │
└────────────────────────┘  └────────────────────────────┘
```

### 1. `ITransport` Interface

The messaging engine and chunked binary file manager are **completely decoupled** from WebRTC. They communicate strictly through the generic `ITransport` contract:

```typescript
export interface ITransport {
  readonly type: TransportType;
  readonly state: TransportState;
  readonly peerId: string | null;
  readonly stats: TransportStats;

  connect(remotePeerId: string, options?: any): Promise<void>;
  disconnect(): Promise<void>;
  send(data: string | ArrayBuffer): Promise<void>;
  onReceive(handler: (data: string | ArrayBuffer) => void): void;
  onStateChange(handler: (state: TransportState) => void): void;
  onStatsChange(handler: (stats: TransportStats) => void): void;
  getBufferedAmount(): number;
  waitForBufferDrain(maxThreshold?: number): Promise<void>;
}
```

When building the native Android client, implementing this interface with Android's `WifiP2pManager` or `BluetoothGattServer` requires **zero modifications** to the file transfer or messaging state machines!

---

## Cryptographic Security Model & Threat Boundaries

### Established Primitives
SIMOON MESH does not invent custom cryptography. All cryptographic operations are executed via the W3C Web Crypto API (`window.crypto.subtle`):
1. **Identity & Signatures**: ECDSA with curve P-256 (`prime256v1`) and SHA-256. Public keys are exchanged during mutual handshakes; signatures authenticate protocol envelopes.
2. **Key Agreement**: ECDH on curve P-256. Both peers contribute their ephemeral public keys to compute a shared secret.
3. **Key Derivation**: HKDF (RFC 5869) with SHA-256 and domain-separated salt (`SIMOON-MESH-v1-HKDF-SALT`) extracts a cryptographically strong 256-bit symmetric key.
4. **Symmetric Encryption**: AES-GCM (256-bit). Each payload generates a fresh 96-bit (12-byte) initialization vector (IV) via `crypto.getRandomValues`. The 128-bit authentication tag ensures data integrity and authenticity.
5. **Payload Integrity**: SHA-256 digests computed over file bytes before streaming and re-verified on the receiver side before Blob compilation.

### Current Limitations
- **Per-Session Keys (No Double Ratchet Yet)**: In v0.1, the AES-GCM symmetric key remains active for the duration of the P2P connection session. Compromise of an active session key would expose messages within that connection. Double Ratchet key updating is scheduled for v0.5.
- **WebRTC IP Exposure**: Direct WebRTC links reveal the public/local IP address to the peer and configured STUN servers. Users requiring network-level anonymity should route traffic over VPNs or Tor.
- **Browser Memory Boundaries**: The security of local IndexedDB storage and in-memory cryptographic keys is bound to the integrity of the host OS and browser profile.

---

## Binary File Transfer Protocol Specification

SIMOON MESH does **NOT** serialize files into massive base64 strings or load hundreds of megabytes into RAM. 

### Chunk Framing Architecture

Files are sliced into configurable 32KB (`32,768` bytes) binary blocks. Each block is encapsulated in a high-efficiency 32-byte binary header:

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   'S' (0x53)  |   'M' (0x4D)  |  Type (0x01)  |  Flags (0x00) |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                 Transfer ID (16 Bytes ASCII)                  +
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Chunk Index (Uint32, BE)                    |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Total Chunks (Uint32, BE)                   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                 Payload Length (Uint32, BE)                   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Binary Chunk Payload                      |
|                           ...                                 |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### Flow Control & Memory Protection
To prevent browser crashes from buffer overflow when transferring multi-megabyte files, the transmission loop actively monitors `dataChannel.bufferedAmount`. If the buffer exceeds 256KB, transmission pauses until the browser's `bufferedamountlow` event fires, maintaining optimal throughput without memory bloat.

---

## Testing Between Two Devices

To test the system across two devices (e.g., Laptop & Phone, or two browser windows):

### Method A: Automated Fast Connect
1. Open the app on **Device A**. Note your SIMOON ID (e.g. `8F4A-29C1-7D52`).
2. Open the app on **Device B** (in another tab, incognito window, or on a phone connected to the same network).
3. On Device B, go to the **Connect** tab.
4. Under *Active Nodes on Network*, Device A will automatically appear. Click **Connect →**, or type Device A's SIMOON ID into the input field and click **Connect P2P Channel**.
5. Once the handshake verifies, the status indicators switch to 🟢 `Connected`.
6. Send encrypted text messages, or attach images/videos/documents. Watch the live 32KB chunk progress bar and speed meter in real-time!

### Method B: 100% Serverless Airgap / Manual Mode
If you wish to test with **zero signaling server communication**:
1. On Device A, open **Connect** > expand **Airgap & Zero-Server Manual Handshake**.
2. Click **1. Device A: Create Offer Token**. Copy the generated base64 token.
3. On Device B, click **2. Device B: Accept Offer & Answer**, paste Device A's token, and click **Generate Answer Token**. Copy the answer token.
4. On Device A, click **3. Device A: Complete Handshake**, paste the answer token, and click **Finalize Direct Connection**.
5. Both devices connect directly over WebRTC without a single packet hitting the signaling server!

---

## Cloudflare Pages Deployment

SIMOON MESH deploys as a static Single Page Application (SPA) on Cloudflare Pages.

### Recommended Build Configuration

In your Cloudflare Pages project dashboard:

| Setting | Value |
| :--- | :--- |
| **Framework preset** | `Vite` |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | `/` |
| **Environment Variable** | `NODE_VERSION` = `22` |

### Package Manager & Lockfile Notice

- **Package manager**: Standard `npm`
- **Lockfile**: `package-lock.json`
- The incompatible legacy `bun.lock` has been removed from the repository. Cloudflare Pages will install dependencies using `npm install` and build using `npm run build`.

### SPA Routing Fallback

Cloudflare Pages routing is pre-configured via `public/_redirects`:
```text
/*    /index.html   200
```
This ensures direct URL navigation (including shareable direct-connect links like `/?peer=8F4A-29C1-7D52`) resolves to `index.html` without 404 errors.

### WebRTC & Signaling on Cloudflare Pages

1. **Free Public WebRTC Signaling Relay (Default / Zero-Config)**:
   - When deployed to Cloudflare Pages (e.g. `https://simoon-mesh-test.pages.dev/`), the app automatically connects to a secure public WebRTC signaling relay (`wss://broker.emqx.io:8084/mqtt` / `wss://broker.hivemq.com:8884/mqtt`).
   - 6-digit session codes (`482-195`) and direct SIMOON IDs exchange WebRTC SDP offers/answers and ICE candidates in real time with sub-100ms latency.
   - **Zero servers, zero API keys, and zero HTTP 405 errors!**
2. **Cloudflare Pages Edge Functions**:
   - Included in `/functions/api/signal/[[catchall]].ts`. When pushed to GitHub, Cloudflare Pages deploys serverless edge handlers for `/api/signal/*`.
3. **Airgap Mode (Zero-Server Offline Fallback)**:
   - Users can exchange connection tokens via QR code or base64 text completely offline.
4. **Custom Signaling Server (Optional)**:
   - To host your own private relay using the included `server.ts`, configure:
     ```text
     VITE_SIGNALING_URL=https://signal.yourdomain.com
     ```

---

## Roadmap

- [x] **v0.1 — Web P2P Prototype & Protocol Foundation**
  - Local cryptographic identities (ECDH/ECDSA P-256)
  - AES-GCM 256-bit E2EE
  - WebRTC DataChannel transport with Public WebSocket relay fallback
  - Contact management & address book with custom aliases and verification
  - Message editing with instant peer sync and `(edited)` badge
  - Message unsend (permanently removes message for both participants)
  - In-app media lightbox: Fullscreen image viewer (zoom/pan/rotate), HTML5 video player, audio player, and document inspector
  - Dual notification system: Web Push desktop notifications + offline synthesized Web Audio chimes
  - 32KB binary chunked file transfer with SHA-256 verification
  - Persistent IndexedDB message and file storage
  - Live diagnostics & telemetry console
- [ ] **v0.2 — Protocol Hardening & Compression**
  - Streaming Zstandard chunk compression
  - Configurable chunk size auto-tuning (16KB to 128KB)
  - Missing-chunk selective re-request protocol
- [ ] **v0.3 — Native Android Client**
  - Native Kotlin / Jetpack Compose client
  - Android Keystore integration for hardware-backed keys
- [ ] **v0.4 — Bluetooth LE & Wi-Fi Direct Transports**
  - `BluetoothTransport` implementing `ITransport`
  - `WifiDirectTransport` implementing `ITransport`
  - True offline nearby communication between devices without Wi-Fi routers
- [ ] **v0.5 — Offline Asynchronous Messaging & Double Ratchet**
  - Signal-compatible Double Ratchet per-message forward secrecy
  - Local store-and-forward bundle protocol
- [ ] **v0.6 — Multi-Device Identity Sync**
  - Key authorization across personal devices
- [ ] **v0.7 — Multi-Hop Mesh Relay**
  - Epidemic and distance-vector routing over ad-hoc peer nodes
  - Anonymous packet forwarding with onion-routed hops

---

## License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2026 SIMOON MESH Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
