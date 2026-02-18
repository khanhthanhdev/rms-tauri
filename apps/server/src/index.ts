import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { file as bunFile, serve } from "bun";
import { Hono } from "hono";
import { cors } from "hono/cors";

interface ServerOptions {
  dbPath: string;
  host: string;
  port: number;
  webDist?: string;
}

const DEFAULT_SERVER_OPTIONS: ServerOptions = {
  dbPath: "./data/rms-local.db",
  host: "0.0.0.0",
  port: 3000,
};

const getArgValue = (key: string, fallback?: string): string | undefined => {
  const index = process.argv.indexOf(`--${key}`);
  if (index === -1) {
    return fallback;
  }
  return process.argv[index + 1] ?? fallback;
};

const parsePort = (rawPort: string | undefined): number => {
  const parsedPort = Number.parseInt(rawPort ?? "", 10);
  if (!Number.isFinite(parsedPort) || parsedPort <= 0 || parsedPort > 65_535) {
    return DEFAULT_SERVER_OPTIONS.port;
  }
  return parsedPort;
};

const parseServerOptions = (): ServerOptions => {
  const host =
    getArgValue("host", process.env.HOST) ?? DEFAULT_SERVER_OPTIONS.host;
  const port = parsePort(getArgValue("port", process.env.PORT));
  const dbPath =
    getArgValue("db-path", process.env.DB_PATH) ??
    DEFAULT_SERVER_OPTIONS.dbPath;
  const webDist = getArgValue("web-dist", process.env.WEB_DIST);

  return {
    host,
    port,
    dbPath,
    webDist,
  };
};

const ensureDatabasePath = (dbPath: string): void => {
  const directoryPath = path.dirname(path.resolve(dbPath));
  mkdirSync(directoryPath, { recursive: true });
};

const getCounterOrDefault = (
  query: ReturnType<Database["query"]>,
  key: string
): number => {
  const row = query.get(key) as { value?: number } | null;
  return row?.value ?? 0;
};

const initDatabase = (dbPath: string) => {
  ensureDatabasePath(dbPath);
  const db = new Database(dbPath, { create: true });

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.query("INSERT OR IGNORE INTO app_state (key, value) VALUES (?1, ?2)").run(
    "counter",
    0
  );

  const readCounterQuery = db.query(
    "SELECT value FROM app_state WHERE key = ?1"
  );
  const incrementCounterQuery = db.query(
    "UPDATE app_state SET value = value + 1 WHERE key = ?1 RETURNING value"
  );

  return {
    db,
    getCounter: () => getCounterOrDefault(readCounterQuery, "counter"),
    incrementCounter: () =>
      getCounterOrDefault(incrementCounterQuery, "counter"),
  };
};

const normalizeRequestPath = (requestPath: string): string | null => {
  const normalizedPath = path.posix.normalize(requestPath);
  if (normalizedPath.includes("..")) {
    return null;
  }
  return normalizedPath === "/" ? "/index.html" : normalizedPath;
};

const serveStaticFile = async (
  webDist: string,
  requestPath: string
): Promise<Response | null> => {
  const normalizedPath = normalizeRequestPath(requestPath);
  if (!normalizedPath) {
    return null;
  }

  const absoluteWebDist = path.resolve(webDist);
  const absoluteFilePath = path.resolve(absoluteWebDist, `.${normalizedPath}`);
  if (!absoluteFilePath.startsWith(absoluteWebDist)) {
    return null;
  }

  const requestedFile = bunFile(absoluteFilePath);
  if (await requestedFile.exists()) {
    return new Response(requestedFile);
  }

  if (path.extname(normalizedPath).length > 0) {
    return null;
  }

  const indexFile = bunFile(path.join(absoluteWebDist, "index.html"));
  if (await indexFile.exists()) {
    return new Response(indexFile);
  }

  return null;
};

const createApp = (
  options: ServerOptions,
  dbHealthPath: string,
  getCounter: () => number,
  incrementCounter: () => number
) => {
  const app = new Hono();

  app.use(
    "/api/*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    })
  );

  app.get("/api/health", (c) => {
    return c.json({
      status: "ok",
      database: dbHealthPath,
      host: options.host,
      port: options.port,
      startedAt: new Date().toISOString(),
    });
  });

  app.get("/api/counter", (c) => {
    return c.json({
      value: getCounter(),
    });
  });

  app.post("/api/counter/increment", (c) => {
    return c.json({
      value: incrementCounter(),
    });
  });

  app.get("*", async (c) => {
    if (!options.webDist) {
      return c.text(
        "RMS server is running. Build the web app to serve UI.",
        200
      );
    }

    const response = await serveStaticFile(options.webDist, c.req.path);
    if (response) {
      return response;
    }

    return c.notFound();
  });

  return app;
};

const options = parseServerOptions();
const { db, getCounter, incrementCounter } = initDatabase(options.dbPath);
const app = createApp(
  options,
  path.resolve(options.dbPath),
  getCounter,
  incrementCounter
);

const server = serve({
  fetch: app.fetch,
  hostname: options.host,
  port: options.port,
});

console.log(`[server] listening at http://${options.host}:${options.port}`);
console.log(`[server] using db at ${path.resolve(options.dbPath)}`);
if (options.webDist) {
  console.log(
    `[server] serving web assets from ${path.resolve(options.webDist)}`
  );
}

const shutdown = (): void => {
  server.stop(true);
  db.close();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
