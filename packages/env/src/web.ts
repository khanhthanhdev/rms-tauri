import { createEnv } from "@t3-oss/env-core";
import { pipe, string, url } from "valibot";

const runtimeEnv = import.meta.env as Record<string, string | undefined>;

export const env = createEnv({
  client: {
    VITE_SERVER_URL: pipe(string(), url()),
  },
  clientPrefix: "VITE_",
  emptyStringAsUndefined: true,
  runtimeEnv,
});
