# NexusNight

A Netflix-style **watch-together Discord Activity**. Browse a catalogue (powered by TMDB), open a room inside a Discord voice channel, and watch in sync with your friends: shared playback, chat, reactions and host controls.

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS v4 (English / Arabic UI)
- **Backend:** Node.js + Express + Socket.IO + TypeScript
- **Auth:** Discord OAuth2 (server-side code exchange + JWT sessions)
- **Playback:** local files via ffmpeg → HLS, or external embed providers with automatic failover

## Features

- **Watch together:** the server holds the authoritative room state (`mediaId`, `position`, `playing`), and clients only request changes. Drift is corrected automatically (small drift → playback-rate nudge, large drift → seek).
- **Rooms & permissions:** host / host + chosen / everyone modes, request-control flow, host handover, invite codes, room discovery.
- **Late joiners** get a snapshot and jump to the current position. If someone is loading or buffering, the room waits for them.
- **Chat & reactions** inside the player (work in fullscreen). Messages are plain text, escaped and rate-limited.
- **Continue watching** stored per Discord user.
- **Library:** scans a media folder, parses filenames, enriches metadata from TMDB (per language), generates thumbnails, sprites and subtitles.
- **Multi-provider streaming** with health tracking and failover, plus a providers dashboard.

## Requirements

- Node.js **20+**
- **ffmpeg** and **ffprobe** on your `PATH` (or set `FFMPEG_PATH` / `FFPROBE_PATH`)
- A [Discord application](https://discord.com/developers/applications)
- A [TMDB](https://www.themoviedb.org/settings/api) API key or read-access token

## Quick start

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>

npm install
cp .env.example .env        # Windows: copy .env.example .env
# edit .env and fill in the required values (see below)

mkdir media                 # put your videos here (optional)
npm run scan                # index the library + generate thumbnails
npm run dev                 # API on :3001, web on :5173
```

Test without Discord (development only): open `http://localhost:5173/?room=test&name=Alice` and `...&name=Bob` in two windows.

## Discord setup

1. In the Developer Portal, copy the **Application ID** (`DISCORD_CLIENT_ID`) and the **Client Secret** (`DISCORD_CLIENT_SECRET`).
2. **Activities → Settings:** enable Activities.
3. **Installation:** enable *User Install* and *Guild Install*, then install the app to your server.
4. In Discord: **Settings → Advanced → Developer Mode** ON (to run an Activity that is still in development).
5. **Activities → URL Mappings:** map `/` to your public host (host only, with no `https://` and no path).

For local testing through Discord, expose the dev server with a tunnel and use that host in the mapping:

```bash
npm run dev:tunnel
cloudflared tunnel --url http://localhost:5173
```

> The mapping for `/` covers everything: the web app, `/api/*` and the `/socket.io` WebSocket.

## Environment variables

Copy `.env.example` to `.env`. **Never commit `.env`.**

| Variable | Required | Description |
|---|---|---|
| `DISCORD_CLIENT_ID` | yes | Discord application ID |
| `DISCORD_CLIENT_SECRET` | yes | Discord OAuth2 client secret |
| `DISCORD_REDIRECT_URI` | yes | OAuth2 callback URL |
| `JWT_SECRET` | yes | Long random string used to sign sessions |
| `TMDB_API_KEY` | yes | TMDB v3 key or v4 read-access token |
| `MEDIA_PATH` | no | Folder with your videos (default `./media`) |
| `PORT` | no | Server port (default `3001`) |
| `DATA_PATH` | no | Index, caches, thumbnails, HLS output (default `./data`) |
| `TMDB_LANGUAGES` | no | Metadata languages, e.g. `en-US,ar` |
| `TMDB_CACHE_DAYS` | no | TMDB cache lifetime |
| `FFMPEG_PATH` / `FFPROBE_PATH` | no | Custom ffmpeg binaries |
| `FFMPEG_CONCURRENCY` / `HLS_CONCURRENCY` | no | Parallel ffmpeg jobs |
| `HLS_CACHE_GB` | no | LRU cap for prepared HLS streams |
| `SCAN_ON_START` | no | Rescan the library on boot |
| `ADMIN_TOKEN` | no | Protects `POST /api/library/rescan` |
| `TRUST_PROXY` | no | Number of reverse-proxy hops in front of the server |
| `ALLOW_GUEST` | no | Allow login without Discord (**never enable in production**) |
| `CONTROL_ROLE_IDS` | no | Comma-separated Discord role IDs that can always control playback |
| `STREAMING_PROVIDERS_ENABLED` | no | Enable external streaming providers |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Server + client in development |
| `npm run dev:tunnel` | Same, with HMR configured for a tunnel / Discord |
| `npm run build` | Build client and server |
| `npm start` | Run the production server (serves API + `client/dist` + Socket.IO) |
| `npm run scan` | Scan the media folder and build the index |
| `npm run list` | Print the indexed library |
| `npm test` | Run server and client tests |

## Project structure

```
.
├── client/                 # React + Vite frontend
│   └── src/
│       ├── api/ auth/ components/ pages/
│       ├── player/         # video player, subtitles, embed player
│       └── i18n.tsx        # EN / AR strings
├── server/
│   └── src/
│       ├── auth/           # Discord OAuth, sessions, middleware
│       ├── http/           # REST routes
│       ├── library/        # scanner, probe, HLS, thumbnails, subtitles
│       ├── metadata/       # TMDB enrichment
│       ├── realtime/       # Socket.IO rooms + sync
│       └── streaming/      # provider registry, adapters, health
├── .env.example
└── package.json            # npm workspaces: server + client
```

## Production

```bash
npm run build
npm start
```

A single Node process serves the API, the built client and Socket.IO on `PORT`. Point the Discord URL Mapping at your public domain, set a strong `JWT_SECRET` and an `ADMIN_TOKEN`, and keep `ALLOW_GUEST` off.

## Security notes

- Opaque IDs only (no file paths exposed)
- All REST and socket payloads validated with zod
- Per-event rate limits, 16 KB socket payload cap, member and room caps
- OAuth code exchange happens server-side, so the client secret never reaches the browser
- Strict allow-lists for HLS, subtitle and image routes

## Disclaimer

NexusNight does not host, store or distribute any copyrighted content. You are responsible for the media you place in your own library and for how you use any third-party streaming providers. Make sure you comply with the laws in your country and with the terms of service of every provider and API you use.

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB.