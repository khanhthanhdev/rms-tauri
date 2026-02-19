import { db } from "@rms-local/db";
import { authSchema } from "@rms-local/db/schema/auth";
import { env } from "@rms-local/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";

const TAURI_ORIGINS = [
  "tauri://localhost",
  "https://tauri.localhost",
  "http://tauri.localhost",
] as const;

const buildTrustedOrigins = (request?: Request): string[] => {
  const trustedOrigins = new Set<string>([env.CORS_ORIGIN, ...TAURI_ORIGINS]);
  const host = request?.headers.get("host");
  if (host) {
    trustedOrigins.add(`http://${host}`);
    trustedOrigins.add(`https://${host}`);
  }
  return [...trustedOrigins];
};

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: authSchema,
  }),
  trustedOrigins: buildTrustedOrigins,
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
    },
  },
  plugins: [username()],
});
