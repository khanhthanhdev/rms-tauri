# Quick Start Guide

## One-Command Setup & Run

```bash
# 1. Install dependencies
bun install

# 2. Build everything once
bun run build

# 3. Run development servers (in separate terminals)
# Terminal 1:
bun run dev:server

# Terminal 2 (after server is running):
bun run dev:web

# Terminal 3 (optional, for Tauri desktop):
bun run dev:desktop
```

Or use Turbo to run all dev tasks:
```bash
bun run dev
```

The app should automatically open at `http://localhost:3000` 🎉

---

## Typical Development Workflow

### 1. Start the Backend

```bash
bun run dev:server
```

Output:
```
[server] listening at http://0.0.0.0:3000
[server] using db at /home/user/rms-local/data/rms-local.db
```

### 2. Start the Frontend (in another terminal)

```bash
bun run dev:web
```

Output:
```
  VITE v6.2.2  ready in 123 ms

  ➜  local:   http://localhost:5173/
  ➜  press h to show help
```

### 3. Open in Browser

- **Frontend**: `http://localhost:5173` (hot reload)
- **Backend API**: `http://localhost:3000/api/*`

### 4. Make Changes

Changes to React files auto-reload. Backend changes require restart (`Ctrl+C`, then `bun run dev:server`).

---

## Adding API Endpoints

### 1. Add Route to Server

**File**: `apps/server/src/index.ts`

```typescript
// Find the createApp function and add a new route:

app.get("/api/todos", async (c) => {
  // Query database
  const todos = db.query("SELECT * FROM todos").all();
  return c.json(todos);
});

app.post("/api/todos", async (c) => {
  const body = await c.req.json();
  const result = db.query(
    "INSERT INTO todos (title, completed) VALUES (?, ?)"
  ).run(body.title, false);
  
  return c.json({ id: result.lastInsertRowid, ...body });
});
```

### 2. Create Database Table

**File**: `apps/server/src/index.ts` - Update `initDatabase` function:

```typescript
const initDatabase = (dbPath: string) => {
  ensureDatabasePath(dbPath);
  const db = new Database(dbPath, { create: true });

  // Add your tables here:
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed BOOLEAN DEFAULT false,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ... rest of init code
};
```

### 3. Use in React

**File**: `apps/web/src/routes/__root.tsx` or any component:

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";

export function TodoList() {
  const { data: todos, isLoading } = useQuery({
    queryKey: ["todos"],
    queryFn: async () => {
      const res = await fetch("http://localhost:3000/api/todos");
      return res.json();
    },
  });

  const addTodo = useMutation({
    mutationFn: async (title: string) => {
      const res = await fetch("http://localhost:3000/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  return (
    <div>
      <ul>
        {todos?.map((todo: any) => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
      <button onClick={() => addTodo.mutate("New Todo")}>Add Todo</button>
    </div>
  );
}
```

---

## Adding React Pages

### 1. Create Route

**File**: `apps/web/src/routes/todos.tsx`

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { TodoList } from "../components/TodoList";

export const Route = createFileRoute("/todos")({
  component: () => <TodoList />,
});
```

### 2. Update Root Layout

**File**: `apps/web/src/routes/__root.tsx`

```typescript
import { Outlet, Link } from "@tanstack/react-router";

export function RootLayout() {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/todos">Todos</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
```

---

## Testing API Locally

```bash
# Check server health
curl http://localhost:3000/api/health

# Get counter value
curl http://localhost:3000/api/counter

# Increment counter
curl -X POST http://localhost:3000/api/counter/increment

# Access from LAN (replace with your IP)
curl http://192.168.1.100:3000/api/health
```

---

## Building for Production

```bash
# Full production build
bun run desktop:build

# Or just components:
bun run -F web build          # React app
bun run -F server compile     # Server sidecar
bun run -F desktop build      # Tauri app
```

Output will be in:
- **Web assets**: `apps/web/dist/`
- **Server sidecar**: `apps/desktop/src-tauri/binaries/`
- **Installers**: `apps/desktop/src-tauri/target/release/bundle/`

---

## Code Style & Formatting

```bash
# Check code quality
bun run check

# Auto-fix issues
bun run fix
```

This uses Biome (Ultracite preset) for:
- Formatting
- Linting
- Type checking

---

## Common Issues & Fixes

| Problem | Fix |
|---------|-----|
| `Port 3000 in use` | Change PORT in env or kill process: `lsof -i :3000` |
| `Cannot find module` | Run `bun install` |
| `Database not initialized` | Server creates it automatically on first run |
| `API returns 404` | Check server is running and route exists |
| `CORS error` | Server has CORS enabled for `/api/*` routes |
| `Web not loading` | Run `bun run -F web build` to create dist folder |

---

## Next Steps

1. **Explore the codebase**:
   - `apps/server/src/index.ts` - Backend
   - `apps/web/src/routes/` - Frontend pages
   - `packages/db/` - Database schemas

2. **Read deeper docs**:
   - `SETUP_GUIDE.md` - Full setup instructions
   - `ARCHITECTURE.md` - System architecture
   - See also: [Hono Docs](https://hono.dev), [TanStack Router Docs](https://tanstack.com/router)

3. **Build features**:
   - Add database tables
   - Create API endpoints
   - Build React pages
   - Connect with TanStack Query

---

## Tips

- **Hot reload**: Frontend reloads on save (Vite)
- **Type safety**: Full TypeScript support for type checking
- **Sidecar compilation**: Auto-compiles for your platform (x64/arm64)
- **LAN access**: Use your machine's IP instead of localhost to access from other devices
- **Database queries**: Use raw SQL with bun:sqlite for simplicity (or add an ORM later)

