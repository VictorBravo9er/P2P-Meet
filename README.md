# Peer-to-Peer Video Meeting App

A modern, serverless **peer-to-peer (P2P) video meeting application** built with **Vite, React, TypeScript, and WebRTC**, using **Supabase Realtime** solely as a lightweight signaling coordinator.

All video, audio, screen sharing, and in-meeting text chat travel **directly between peers (encrypted end-to-end via SRTP/DTLS)**. Zero media traffic ever touches a server.

---

## Features

- **Direct P2P Media Streams**: 100% peer-to-peer video & audio via browser-native `RTCPeerConnection`.
- **Zero-Media Signaling**: Uses Supabase Realtime Channels (Presence & Broadcast) strictly to coordinate connection handshakes (SDP Offer/Answer & ICE Candidates).
- **In-Call P2P Chat**: Direct text messaging between participants using WebRTC `RTCDataChannel` (never saved to any database).
- **Screen Sharing**: Easily toggle between webcam and screen presentation.
- **Audio Activity Meter**: Visual detection and highlighting of active speakers using Web Audio API.
- **Dynamic Mesh Layout**: Responsive grid that automatically adjusts based on participant count or active screen shares.
- **Lobby & Pre-Call Preview**: Check camera/mic, test audio levels, and toggle devices before entering a room.
- **Interactive Settings & Audio Controls**: In-app customization for noise suppression, echo cancellation, auto-gain, camera mirroring, video resolution (480p/720p/1080p), live mic test meter, and synthesized audio chimes.

---

## 📚 Technical Documentation Dossier

The project maintains an exhaustive, self-contained **technical dossier** in [`docs/`](./docs/INDEX.md) that thoroughly documents the application architecture, protocols, and workflows without requiring source code inspection:

| Module | Document | Focus Area |
| :--- | :--- | :--- |
| **01** | [**Architecture Overview**](./docs/01-architecture-overview.md) | Full mesh topology, zero-server media paradigm, signaling vs. media plane, DTLS/SRTP encryption. |
| **02** | [**WebRTC & Signaling Protocol**](./docs/02-webrtc-and-signaling.md) | W3C Perfect Negotiation, deterministic politeness, glare handling, candidate queueing, SDP recovery. |
| **03** | [**Media Stream Pipeline**](./docs/03-media-stream-pipeline.md) | Audio/video capture, Web Audio speaking detection with GC safety, screen share swapping, video sync. |
| **04** | [**Room Lifecycle & State**](./docs/04-room-lifecycle-and-state.md) | Presence sync, ephemeral broadcast state, safe leave detection, P2P in-call chat. |
| **05** | [**UI Components & Layout**](./docs/05-ui-components-and-layout.md) | Component architecture, responsive dynamic grid, presenter spotlight mode. |
| **06** | [**User Settings & Preferences**](./docs/06-settings-and-preferences.md) | Schema, localStorage persistence, live mic test meter, synthesized Web Audio chime, track constraints. |
| **07** | [**Deployment & Environment**](./docs/07-deployment-and-environment.md) | Vite build pipeline, Vercel branch filtering (`bash-decide.sh`), Cloudflare Pages, WebRTC troubleshooting. |

> **Invariant**: As mandated by [GEMINI.md](./GEMINI.md), any significant codebase changes must update the corresponding document in `docs/`.

---

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Supabase Realtime

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Open `.env` and fill in your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here
```

> **Where to find these in Supabase:**
> 1. Open your [Supabase Dashboard](https://supabase.com/dashboard)
> 2. Navigate to **Project Settings** -> **API**
> 3. Copy the **Project URL** and the `anon public` key.

### 3. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## How to Test Multi-Party P2P Calling

1. Open [http://localhost:3000](http://localhost:3000) in your primary browser window.
2. Enter your name (e.g. "Alice") and create a room (e.g. `test-room`).
3. Click **Enter Meeting**.
4. Click **Share Link** or copy the invite URL (`http://localhost:3000/?room=test-room`).
5. Open an **Incognito Window** or a second browser (Chrome / Firefox / Safari).
6. Paste the URL, set the name to "Bob", and click **Enter Meeting**.
7. Both browsers will automatically discover each other via Supabase Realtime, perform the WebRTC handshake, and establish a direct peer-to-peer video, audio, and chat connection!

---

## Production Build & Deployment

### Build for Production

```bash
npm run build
```

The output will be in the `dist/` directory.

### Deploy to Vercel

```bash
npx vercel
```
In the Vercel Project Settings, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Environment Variables.

### Deploy to Cloudflare Pages

```bash
npx wrangler pages deploy dist
```
Add the same environment variables under **Settings > Environment Variables** in Cloudflare Pages.
