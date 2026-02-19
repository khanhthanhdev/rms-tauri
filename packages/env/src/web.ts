import { createEnv } from "@t3-oss/env-core";
import { optional, pipe, string, url } from "valibot";

const runtimeEnv = import.meta.env as Record<string, string | undefined>;

const browserGlobal = globalThis as unknown as
  | { location?: { origin: string } }
  | undefined;
const currentOrigin = browserGlobal?.location?.origin ?? "http://localhost";

export const env = createEnv({
  client: {
    VITE_SERVER_URL: optional(pipe(string(), url()), currentOrigin),
  },
  clientPrefix: "VITE_",
  emptyStringAsUndefined: true,
  runtimeEnv,
});
