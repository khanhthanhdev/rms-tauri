# Turborepo + Tauri Sidecar Setup Guide

## Architecture Overview

```
monorepo/
├── apps/
│   ├── desktop/          # Tauri app (orchestrator, system tray, no webview)
│   ├── backend/          # Hono + Bun + bun:sqlite  (sidecar binary)
│   └── frontend/         # React + TanStack Router/Query  (sidecar binary)
├── packages/
│   └── shared/           # Shared TypeScript types
├── turbo.json
└── package.json
```

**Flow:** Tauri launches → spawns `backend` sidecar → spawns `frontend` sidecar → opens browser at `http://localhost:3000` → user accesses app (LAN accessible).

---

## 1. Bootstrap the Monorepo

```bash
# Create monorepo
mkdir my-app && cd my-app
npx create-turbo@latest . --skip-install

# Remove default apps, we'll create our own
rm -rf apps/web apps/docs
```

### `package.json` (root)

```json
{
  "name": "my-app",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "build:sidecar": "turbo build:sidecar",
    "tauri": "cd apps/desktop && cargo tauri dev"
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "^5.0.0"
  }
}
```

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "out/**"]
    },
    "build:sidecar": {
      "dependsOn": ["^build:sidecar"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

---

## 2. Backend App (`apps/backend`)

```bash
mkdir -p apps/backend/src
cd apps/backend
bun init -y
```

### `apps/backend/package.json`

```json
{
  "name": "@my-app/backend",
  "version": "0.0.1",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build:sidecar": "bun build src/index.ts --compile --outfile dist/backend"
  },
  "dependencies": {
    "hono": "^4.0.0"
  }
}
```

### `apps/backend/src/db.ts`

```typescript
import { Database } from "bun:sqlite";
import { join } from "path";

// Store DB next to the binary in production, or in project root in dev
const DB_PATH = process.env.DB_PATH ?? join(process.cwd(), "app.db");

export const db = new Database(DB_PATH, { create: true });

// Run migrations on init
db.run(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log(`[db] Connected to ${DB_PATH}`);
```

### `apps/backend/src/index.ts`

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { db } from "./db";

const app = new Hono();

const PORT = Number(process.env.PORT ?? 3001);
// Allow all origins so LAN devices can access
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";

app.use("*", logger());
app.use("*", cors({ origin: ALLOWED_ORIGIN }));

// Health check
app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }));

// Example CRUD routes
app.get("/items", (c) => {
  const items = db.query("SELECT * FROM items").all();
  return c.json(items);
});

app.post("/items", async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  const result = db.run("INSERT INTO items (name) VALUES (?)", [name]);
  return c.json({ id: result.lastInsertRowid, name }, 201);
});

app.delete("/items/:id", (c) => {
  const id = c.req.param("id");
  db.run("DELETE FROM items WHERE id = ?", [id]);
  return c.json({ deleted: true });
});

console.log(`[backend] Listening on http://0.0.0.0:${PORT}`);

export default {
  port: PORT,
  hostname: "0.0.0.0", // LAN accessible
  fetch: app.fetch,
};
```

---

## 3. Frontend App (`apps/frontend`)

```bash
mkdir -p apps/frontend
cd apps/frontend
bun create vite . --template react-ts
bun add @tanstack/react-router @tanstack/react-query axios
bun add -d @tanstack/router-devtools @tanstack/react-query-devtools serve
```

### `apps/frontend/package.json` (relevant scripts)

```json
{
  "name": "@my-app/frontend",
  "scripts": {
    "dev": "vite --host",
    "build": "tsc && vite build",
    "build:sidecar": "bun run build && bun build scripts/serve.ts --compile --outfile dist/frontend",
    "preview": "vite preview --host"
  }
}
```

### `apps/frontend/scripts/serve.ts`

This is the sidecar entry — it serves the built static files.

```typescript
import { serve } from "bun";
import { join } from "path";
import { readFileSync, existsSync } from "fs";

const PORT = Number(process.env.FRONTEND_PORT ?? 3000);
const DIST = join(import.meta.dir, "../dist");

serve({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req) {
    const url = new URL(req.url);
    let filePath = join(DIST, url.pathname);

    // SPA fallback
    if (!existsSync(filePath) || url.pathname === "/") {
      filePath = join(DIST, "index.html");
    }

    const file = Bun.file(filePath);
    return new Response(file);
  },
});

console.log(`[frontend] Serving on http://0.0.0.0:${PORT}`);
```

### `apps/frontend/src/main.tsx`

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
```

### `apps/frontend/src/routes/__root.tsx`

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});
```

### `apps/frontend/src/routes/index.tsx`

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const { data: items = [] } = useQuery({
    queryKey: ["items"],
    queryFn: () => fetch(`${API}/items`).then((r) => r.json()),
  });

  const add = useMutation({
    mutationFn: (name: string) =>
      fetch(`${API}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["items"] }),
  });

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>My App</h1>
      <div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name"
        />
        <button onClick={() => { add.mutate(name); setName(""); }}>Add</button>
      </div>
      <ul>
        {items.map((item: any) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
    </main>
  );
}
```

### `apps/frontend/vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";

export default defineConfig({
  plugins: [react(), TanStackRouterVite()],
  server: {
    host: "0.0.0.0", // LAN accessible in dev
    port: 3000,
  },
});
```

---

## 4. Tauri Desktop App (`apps/desktop`)

```bash
cd apps/desktop
# Init Tauri v2 (no frontend framework - we don't need a webview)
bunx create-tauri-app . --identifier com.myapp.desktop --template vanilla
# Or manually:
cargo tauri init
```

### Disable the webview window

### `apps/desktop/src-tauri/tauri.conf.json`

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "My App",
  "version": "0.1.0",
  "identifier": "com.myapp.desktop",
  "build": {
    "frontendDist": "../ui-placeholder",
    "devUrl": "about:blank"
  },
  "app": {
    "windows": [],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png"],
    "externalBin": [
      "binaries/backend",
      "binaries/frontend"
    ]
  }
}
```

### `apps/desktop/src-tauri/capabilities/default.json`

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-execute",
    "shell:allow-open"
  ]
}
```

### `apps/desktop/src-tauri/Cargo.toml`

```toml
[package]
name = "desktop"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

### `apps/desktop/src-tauri/src/main.rs`

```rust
// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            sidecar::spawn_sidecars(app)?;
            sidecar::setup_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
```

### `apps/desktop/src-tauri/src/sidecar.rs`

```rust
use std::sync::{Arc, Mutex};
use tauri::{App, Manager};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

pub struct AppState {
    pub backend: Option<CommandChild>,
    pub frontend: Option<CommandChild>,
}

pub fn spawn_sidecars(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let shell = app.shell();

    // ── Spawn backend ──────────────────────────────────────────────
    let (mut rx_b, child_b) = shell
        .sidecar("backend")?
        .env("PORT", "3001")
        .env("DB_PATH", get_data_dir(app).join("app.db").to_str().unwrap())
        .spawn()?;

    // Stream backend logs to Tauri console
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx_b.recv().await {
            match event {
                CommandEvent::Stdout(line) => println!("[backend] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Stderr(line) => eprintln!("[backend] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Terminated(status) => {
                    println!("[backend] exited: {:?}", status);
                    break;
                }
                _ => {}
            }
        }
    });

    // ── Wait briefly for backend to be ready, then spawn frontend ──
    let shell2 = app.shell();
    let (mut rx_f, child_f) = shell2
        .sidecar("frontend")?
        .env("FRONTEND_PORT", "3000")
        .spawn()?;

    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        // Give backend ~500ms to start before we open the browser
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        while let Some(event) = rx_f.recv().await {
            match event {
                CommandEvent::Stdout(line) => println!("[frontend] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Stderr(line) => eprintln!("[frontend] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Terminated(status) => {
                    println!("[frontend] exited: {:?}", status);
                    break;
                }
                _ => {}
            }
        }
    });

    // Open the browser after a short delay
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        handle.shell().open("http://localhost:3000", None).unwrap();
    });

    // Store children so they're dropped (killed) when app exits
    app.manage(Arc::new(Mutex::new(AppState {
        backend: Some(child_b),
        frontend: Some(child_f),
    })));

    Ok(())
}

pub fn setup_tray(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::TrayIconBuilder,
    };

    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open in Browser", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("My App is running")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                // Children are killed when state is dropped
                app.exit(0);
            }
            "open" => {
                app.shell().open("http://localhost:3000", None).unwrap();
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn get_data_dir(app: &App) -> std::path::PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
}
```

---

## 5. Building the Sidecar Binaries

Tauri requires sidecar binaries to be named with the **target triple**:  
`binaries/backend-<triple>` e.g. `backend-x86_64-unknown-linux-gnu`

### `apps/desktop/scripts/copy-sidecars.sh`

```bash
#!/usr/bin/env bash
set -e

TRIPLE=$(rustc -vV | sed -n 's|host: ||p')
BINARIES="src-tauri/binaries"
mkdir -p "$BINARIES"

echo "Target triple: $TRIPLE"

cp ../../apps/backend/dist/backend "$BINARIES/backend-$TRIPLE"
cp ../../apps/frontend/dist/frontend "$BINARIES/frontend-$TRIPLE"

echo "Sidecars copied!"
```

### Full build sequence

```bash
# 1. Build backend binary
cd apps/backend
bun run build:sidecar
# Output: apps/backend/dist/backend

# 2. Build frontend static files + server binary
cd apps/frontend
bun run build:sidecar
# Output: apps/frontend/dist/frontend

# 3. Copy sidecars into Tauri
cd apps/desktop
bash scripts/copy-sidecars.sh

# 4. Build or run Tauri
cargo tauri dev     # Development
cargo tauri build   # Production
```

---

## 6. Development Workflow (without building binaries)

For faster iteration you can run everything as separate processes instead of sidecars:

```bash
# Terminal 1 — Backend
cd apps/backend && bun run dev

# Terminal 2 — Frontend
cd apps/frontend && bun run dev

# Terminal 3 — Tauri (with env vars to skip sidecars in dev)
cd apps/desktop && cargo tauri dev
```

Add a `DEV_MODE` env check in `sidecar.rs` to skip spawning sidecars when `DEV_MODE=1` is set, opening the browser directly instead.

---

## 7. LAN Access

Both the backend and frontend bind to `0.0.0.0`. Find your machine's local IP:

```bash
# Linux/macOS
ip addr | grep 'inet ' | grep -v '127.0.0.1'

# Windows
ipconfig
```

Other devices on the same network can access:
- Frontend: `http://192.168.x.x:3000`
- Backend API: `http://192.168.x.x:3001`

Set `VITE_API_URL=http://192.168.x.x:3001` in `apps/frontend/.env` so the frontend points to the correct backend address when accessed from another device.

---

## File Tree Summary

```
my-app/
├── package.json                    # root workspace
├── turbo.json
├── apps/
│   ├── backend/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts            # Hono server entry
│   │       └── db.ts               # bun:sqlite setup
│   ├── frontend/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── scripts/
│   │   │   └── serve.ts            # static file server sidecar
│   │   └── src/
│   │       ├── main.tsx
│   │       └── routes/
│   │           ├── __root.tsx
│   │           └── index.tsx
│   └── desktop/
│       ├── scripts/
│       │   └── copy-sidecars.sh
│       └── src-tauri/
│           ├── Cargo.toml
│           ├── tauri.conf.json
│           ├── capabilities/
│           │   └── default.json
│           ├── binaries/           # compiled sidecars go here
│           └── src/
│               ├── main.rs
│               └── sidecar.rs
└── packages/
    └── shared/                     # shared TS types (optional)
```