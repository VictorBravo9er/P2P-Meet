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
- **Flexible Credential Setup**: Supports both `.env` configuration and interactive runtime configuration in the browser via the Settings dialog.

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
> 
> *Tip: If you don't set `.env`, you can also enter your credentials directly in the app's in-browser **Settings** dialog.*

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
