# RMS Local - Turborepo Setup Guide

Your monorepo uses **Tauri**, **Hono** (Bun backend), **React** (Vite frontend), and **bun:sqlite** database.

## Architecture Overview

```
┌─────────────────────────────────────────┐
│       Tauri Desktop Application          │
│  (Hidden window, sidecar management)     │
└─────────────────┬───────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
    ┌────▼──────┐     ┌────▼──────┐
    │   Hono    │     │   React   │
    │   Sidecar │     │  Sidecar  │
    │  :3000    │     │  :5173    │
    │  (Bun)    │     │  (Dev)    │
    └────┬──────┘     └───────────┘
         │
    ┌────▼─────────────┐
    │  bun:sqlite DB   │
    │  (Local file)    │
    └──────────────────┘
```

## Project Structure

```
rms-local/
├── apps/
│   ├── desktop/          # Tauri app (sidecar launcher)
│   │   └── src-tauri/    # Rust code
│   ├── server/           # Hono backend (compiled as sidecar)
│   │   ├── src/
│   │   │   └── index.ts  # Main Hono server
│   │   └── scripts/
│   │       └── compile-sidecar.ts
│   └── web/              # React frontend (Vite)
│       └── src/
├── packages/
│   ├── db/               # Database schemas/migrations
│   ├── auth/             # Shared auth logic
│   ├── env/              # Environment variables
│   └── config/           # Shared configs
└── turbo.json            # Build orchestration
```

## Prerequisites

### Install System Dependencies

**macOS:**
```bash
brew install rustup
rustup-init
```

**Linux (Ubuntu/Debian):**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sudo apt-get install libssl-dev pkg-config libgtk-3-dev libappindicator3-dev librsvg2-dev
```

**Windows:**
- Install [Rust](https://rustup.rs/)
- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/)

### Verify Installation

```bash
bun --version      # Should be 1.3.6+
cargo --version    # Rust
rustc --version    # Rust compiler
```

## Development Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Build Web Assets

```bash
bun run build
```

Or specifically:
```bash
bun run -F web build
```

### 3. Compile Server Sidecar

```bash
bun run -F server compile:sidecar
```

This creates platform-specific binaries in `apps/desktop/src-tauri/binaries/`.

### 4. Run Development Servers

**Option A: All servers at once**
```bash
bun run dev
```

**Option B: Specific servers**

Terminal 1 - Web dev server:
```bash
bun run dev:web
```

Terminal 2 - Hono backend:
```bash
bun run dev:server
```

Terminal 3 - Tauri desktop (once web/server are running):
```bash
bun run dev:desktop
```

## Database Setup

### Initialize Database

The database is auto-initialized on first server startup at:
- **Dev**: `./data/rms-local.db` (relative to server working directory)
- **Production**: App data directory (platform-specific)

### Database Management

```bash
# View database (if you have a studio tool)
bun run db:studio

# Migrations (if using @rms-local/db)
bun run db:migrate
bun run db:push
```

## Building for Production

### Desktop Build

```bash
bun run desktop:build
```

This:
1. Builds the React web app
2. Compiles the server sidecar
3. Bundles everything into platform-specific installers (`.deb`, `.msi`, `.nsis`)

Output: `apps/desktop/src-tauri/target/release/bundle/`

## Key Features

### Sidecar Architecture

- **Server Sidecar**: Hono + bun:sqlite
  - Handles all API requests
  - Manages database
  - Serves static web assets (production)
  - Binds to `0.0.0.0:3000` for LAN access

- **Frontend**:
  - React + Vite (dev hot reload)
  - TanStack Router for routing
  - TanStack Query for data fetching
  - Communicates via `http://localhost:3000/api/*`

- **Tauri App**:
  - Minimal window (hidden by default)
  - Launches sidecars
  - Opens browser to `http://127.0.0.1:3000`
  - Manages app lifecycle

### LAN Access

Both servers bind to `0.0.0.0`, so you can access from other devices:
```
http://192.168.x.x:3000
```

Just replace `127.0.0.1` with your machine's IP in the Tauri app or manually navigate.

## Scripts Reference

```bash
# Development
bun run dev              # All servers
bun run dev:web         # React only
bun run dev:server      # Hono only
bun run dev:desktop     # Tauri (requires web + server running)

# Building
bun run build           # Full build
bun run desktop:build   # Desktop only

# Type checking
bun run check-types     # All packages
bun run desktop:check   # Tauri Rust types

# Code quality
bun run check           # Lint + format check
bun run fix             # Auto-fix lint/format issues

# Database
bun run db:push         # Push schema to database
bun run db:migrate      # Run migrations
bun run db:studio       # Open database UI (if configured)
```

## Troubleshooting

### "sidecar did not become ready"

1. Check server is built: `bun run -F server compile:sidecar`
2. Verify binary exists: `ls apps/desktop/src-tauri/binaries/`
3. Test server manually: `bun run -F server dev`

### Database file not created

- Server creates `./data/rms-local.db` automatically
- In production, use app data directory (see `lib.rs`)
- Check permissions: `ls -la ./data/`

### Web assets not loading

1. Build web app: `bun run -F web build`
2. Verify output: `ls apps/web/dist/`
3. In production build, assets are bundled automatically

### Port 3000 already in use

Change in `apps/server/src/index.ts` (line 18):
```ts
port: 3001, // or any available port
```

And in `apps/desktop/src-tauri/src/lib.rs` (line 11):
```rs
const SERVER_PORT: u16 = 3001;
```

## Next Steps

1. **Define your database schema**: Edit `packages/db/` for Prisma/Drizzle schemas
2. **Build API endpoints**: Add routes to `apps/server/src/index.ts`
3. **Create pages/components**: Add routes to `apps/web/src/routes/`
4. **Configure authentication**: Use `packages/auth/` for shared auth logic
5. **Set environment variables**: Create `.env` files in each app

## Useful Links

- [Tauri Documentation](https://tauri.app)
- [Hono Documentation](https://hono.dev)
- [Bun Documentation](https://bun.sh)
- [TanStack Router](https://tanstack.com/router)
- [TanStack Query](https://tanstack.com/query)
