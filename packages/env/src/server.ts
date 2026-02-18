import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { minLength, optional, picklist, pipe, string, url } from "valibot";

export const env = createEnv({
  server: {
    BETTER_AUTH_SECRET: pipe(string(), minLength(32)),
    BETTER_AUTH_URL: pipe(string(), url()),
    CORS_ORIGIN: pipe(string(), url()),
    DATABASE_URL: pipe(string(), minLength(1)),
    NODE_ENV: optional(
      picklist(["development", "production", "test"]),
      "development"
    ),
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
});
