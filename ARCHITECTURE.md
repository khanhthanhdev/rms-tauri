# Architecture Guide

## System Components

### 1. **Tauri Desktop App** (`apps/desktop`)
- **Role**: Application launcher and lifecycle manager
- **Key Files**:
  - `src-tauri/src/lib.rs` - Sidecar process management
  - `src-tauri/tauri.conf.json` - Tauri configuration
  - `package.json` - Build orchestration

**Responsibilities**:
- Launch Hono backend sidecar
- Wait for server readiness (TCP connection check)
- Open default web browser to `http://127.0.0.1:3000`
- Manage application lifecycle

**Flow**:
```
Tauri starts → Start sidecar → Wait for port 3000 → Open browser → Hide launcher window
```

---

### 2. **Hono Backend Sidecar** (`apps/server`)
- **Role**: REST API server and static file server
- **Tech**: Hono + Bun + bun:sqlite
- **Key Files**:
  - `src/index.ts` - Main server code
  - `scripts/compile-sidecar.ts` - Build sidecar binary

**Responsibilities**:
- Initialize SQLite database on startup
- Handle API requests under `/api/*` routes
- Serve static web assets (in production)
- Bind to `0.0.0.0:3000` for LAN access

**API Routes**:
```
GET    /api/health              # Server health check
GET    /api/counter             # Get counter value
POST   /api/counter/increment   # Increment counter
GET|*  /*                       # Serve static files or SPA
```

**Database Initialization**:
```ts
// Auto-creates data/rms-local.db on first run
// Creates app_state table with counter
```

**Server Options** (via CLI args or env vars):
```bash
--host <string>     # Bind address (default: 0.0.0.0)
--port <number>     # Port (default: 3000)
--db-path <path>    # Database file path (default: ./data/rms-local.db)
--web-dist <path>   # Web assets directory (for SPA serving)
```

---

### 3. **React Frontend** (`apps/web`)
- **Role**: User interface and client-side logic
- **Tech**: React 19 + Vite + TanStack Router + TanStack Query
- **Key Files**:
  - `src/main.tsx` - App entry point
  - `src/routes/` - TanStack Router pages
  - `vite.config.ts` - Vite configuration

**Responsibilities**:
- Render user interface
- Route between pages (TanStack Router)
- Fetch data from API (TanStack Query)
- Communicate with backend via `http://localhost:3000/api/*`

**API Client Pattern**:
```ts
import { useQuery } from "@tanstack/react-query";

const { data } = useQuery({
  queryKey: ["counter"],
  queryFn: async () => {
    const res = await fetch("http://localhost:3000/api/counter");
    return res.json();
  },
});
```

---

## Data Flow

### During Development

```
┌─────────────────────────────────────────────────────────┐
│                    Your Machine                          │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Tauri Desktop                                   │   │
│  │  (http://127.0.0.1:3000)                         │   │
│  │  ├─ Dev Window (hidden by default)               │   │
│  │  └─ Launches sidecars                            │   │
│  └──────────────────┬───────────────────────────────┘   │
│                     │                                    │
│         ┌───────────┼───────────┐                       │
│         │           │           │                       │
│    ┌────▼──────┐   ┌──────────┐ │                       │
│    │  Hono     │   │ Dev Bun  │ │                       │
│    │  Sidecar  │   │  Server  │ │                       │
│    │  :3000    │   │ :3000    │ │                       │
│    │ (Bun)     │   │(hot reload)                        │
│    └────┬──────┘   └──────────┘ │                       │
│         │                        │                       │
│         │    ┌──────────────────┐│                       │
│         │    │ Browser (auto    ││                       │
│         │    │ opened)          ││                       │
│         │    │ Dev Vite Server  ││                       │
│         │    │ :5173            ││                       │
│         │    │ (hot reload)     ││                       │
│         ▼    └──────────────────┘│                       │
│    ┌──────────────────────────────┘                      │
│    │                                                     │
│    ▼                                                     │
│  ┌────────────────────────────────┐                     │
│  │  SQLite Database               │                     │
│  │  ./data/rms-local.db           │                     │
│  └────────────────────────────────┘                     │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### During Production

```
┌─────────────────────────────────────────────────────────┐
│  Other Devices on Network                                │
├─────────────────────────────────────────────────────────┤
│  Browser: http://192.168.x.x:3000                       │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │ HTTP requests to /api/*
                  │
┌─────────────────▼───────────────────────────────────────┐
│                    Your Machine                          │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Tauri Desktop Executable                        │   │
│  │  └─ Hidden launcher window                       │   │
│  │  └─ Starts bundled sidecar binary                │   │
│  └──────────────────┬───────────────────────────────┘   │
│                     │                                    │
│    ┌────────────────▼──────────────────────┐             │
│    │                                        │             │
│    │  Bundled Hono Sidecar                 │             │
│    │  - Compiled Bun executable             │             │
│    │  - Serves web assets (/web/dist)      │             │
│    │  - Binds to 0.0.0.0:3000              │             │
│    │  - Manages SQLite database            │             │
│    │                                        │             │
│    └────────────────┬──────────────────────┘             │
│                     │                                    │
│                     ▼                                    │
│    ┌────────────────────────────┐                       │
│    │  SQLite Database           │                       │
│    │  (App data directory)      │                       │
│    └────────────────────────────┘                       │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## File Organization

```
apps/server/src/index.ts
  ├── Database Setup (bun:sqlite)
  │   ├── initDatabase()
  │   ├── ensureDatabasePath()
  │   └── app_state table
  │
  ├── Server Configuration
  │   ├── parseServerOptions()
  │   ├── getArgValue()
  │   └── parsePort()
  │
  ├── Static File Serving (SPA)
  │   ├── serveStaticFile()
  │   ├── normalizeRequestPath()
  │   └── Fallback to index.html
  │
  ├── Hono App Creation
  │   ├── CORS middleware
  │   ├── API routes
  │   └── Catch-all handler
  │
  └── Server Initialization
      ├── bun.serve()
      ├── Graceful shutdown
      └── Process signal handlers
```

---

## Communication Patterns

### Fetch from React to API

```typescript
// apps/web/src/hooks/useCounter.ts
import { useQuery, useMutation } from "@tanstack/react-query";

const API_BASE = "http://localhost:3000";

export function useCounter() {
  const query = useQuery({
    queryKey: ["counter"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/counter`);
      if (!res.ok) throw new Error("Failed to fetch counter");
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/counter/increment`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to increment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counter"] });
    },
  });

  return { counter: query.data?.value, increment: mutation.mutate };
}
```

### Health Check Pattern

```typescript
// Verify server is ready before using API
async function checkServerHealth() {
  try {
    const res = await fetch("http://localhost:3000/api/health");
    const health = await res.json();
    console.log("Server ready:", health);
    return true;
  } catch {
    console.error("Server not ready yet");
    return false;
  }
}
```

---

## Environment Variables

### Server (`apps/server/.env`)
```env
HOST=0.0.0.0              # Bind address
PORT=3000                 # Server port
DB_PATH=./data/rms-local.db  # Database location
WEB_DIST=../web/dist      # Web assets (optional, for SPA serving)
```

### Web (`apps/web/.env`)
```env
VITE_API_BASE=http://localhost:3000
```

### Shared (`packages/env/.env`)
```env
CORS_ORIGIN=http://localhost:3000
```

---

## Build Pipeline

```
bun run desktop:build
  │
  ├─ bun run -F web build
  │   └─ Vite builds React app → apps/web/dist/
  │
  ├─ bun run -F server compile:sidecar
  │   └─ Bun compiles server → apps/desktop/src-tauri/binaries/
  │
  └─ cargo tauri build
      └─ Creates platform installers
          ├─ Linux: .deb
          ├─ macOS: .dmg
          └─ Windows: .msi/.nsis
```

---

## Database Schema

### Current Tables

```sql
-- Created automatically on server startup
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- Inserted on init:
INSERT INTO app_state (key, value) VALUES ('counter', 0);
```

### Extending Schema

Edit `packages/db/src/schema/` and use Drizzle migrations:

```typescript
// packages/db/src/schema/custom.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  completed: integer("completed", { mode: "boolean" }).default(false),
});
```

---

## Testing Locally

### Test API Health
```bash
curl http://localhost:3000/api/health
```

### Test Web Server
```bash
curl http://localhost:3000/
```

### Test from Another Device
```bash
# Find your IP
ipconfig getifaddr en0  # macOS
hostname -I             # Linux

# Access from another device
curl http://192.168.x.x:3000/api/health
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 3000 in use | Change `PORT` in env or args |
| Database locked | Stop all server instances |
| Sidecar won't start | Check binary exists: `ls apps/desktop/src-tauri/binaries/` |
| CORS errors | Server has `cors()` middleware enabled for `/api/*` |
| Web assets 404 | Ensure `web build` ran before starting server |
| Hot reload not working | Check Vite dev server on port 5173 |

