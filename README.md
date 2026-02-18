# rms-local

Turborepo starter for a desktop launcher pattern:

- `apps/desktop`: Tauri app that starts a Bun sidecar and opens the browser
- `apps/server`: Hono + `bun:sqlite` API server compiled as sidecar binary
- `apps/web`: React + TanStack Router + TanStack Query UI (styled with Oat)

## What This Starter Does

1. Tauri starts a small launcher window that shows runtime status and logs.
2. It launches a compiled Bun sidecar binary.
3. The sidecar initializes SQLite and serves API + web assets.
4. Tauri selects an available local port and opens `http://127.0.0.1:<PORT>` in your default browser.
5. The server binds `0.0.0.0:<PORT>` so LAN devices can reach it via `http://<LAN-IP>:<PORT>`.

## Install

```bash
bun install
```

## Run

### Full desktop flow (recommended)

```bash
bun run dev:desktop
```

This runs `tauri dev`, which automatically:

- builds `apps/web`
- compiles `apps/server` into sidecar binary at `apps/desktop/src-tauri/binaries`
- starts Tauri launcher window (local URL, LAN URL, database path, logs)

### Individual apps

```bash
bun run dev:web
bun run dev:server
```

## Build

```bash
bun run desktop:build
```

Windows release bundles only (`.exe` + `.msi`):

```bash
bun run desktop:build:win
```

Installer output:
- `apps/desktop/src-tauri/target/release/bundle/nsis/*.exe`
- `apps/desktop/src-tauri/target/release/bundle/msi/*.msi`

End users only install and run the installer output. Bun/Rust are not required on user machines.

## Publish Release

Pushing a version tag triggers the release workflow and publishes installers.

```bash
git tag v0.1.0
git push origin v0.1.0
```

What the tag workflow does:
- Builds desktop release artifacts.
- Publishes NSIS and MSI assets to the GitHub release for that tag.

Current mode: Windows code signing is disabled.

## Project Structure

```text
rms-local/
├── apps/
│   ├── desktop/   # Tauri launcher app
│   ├── server/    # Hono + bun:sqlite sidecar server
│   └── web/       # React + TanStack Router + Query frontend
└── packages/
    └── ...        # shared packages from original template
```
