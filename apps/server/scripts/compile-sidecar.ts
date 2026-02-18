import { mkdirSync } from "node:fs";
import path from "node:path";
import { $ } from "bun";

const BINARY_NAME = "rms-server-sidecar";

const ARCHITECTURES = {
  x64: "x86_64",
  arm64: "aarch64",
} as const;

const TARGET_TRIPLE_BY_HOST: Record<
  NodeJS.Platform,
  Partial<Record<keyof typeof ARCHITECTURES, string>>
> = {
  aix: {},
  android: {},
  darwin: {
    x64: "x86_64-apple-darwin",
    arm64: "aarch64-apple-darwin",
  },
  freebsd: {},
  haiku: {},
  linux: {
    x64: "x86_64-unknown-linux-gnu",
    arm64: "aarch64-unknown-linux-gnu",
  },
  openbsd: {},
  netbsd: {},
  sunos: {},
  win32: {
    x64: "x86_64-pc-windows-msvc",
    arm64: "aarch64-pc-windows-msvc",
  },
  cygwin: {},
};

const TARGET_TRIPLE_ENV_KEYS = [
  "SIDECAR_TARGET_TRIPLE",
  "TAURI_TARGET_TRIPLE",
  "TAURI_ENV_TARGET_TRIPLE",
  "CARGO_BUILD_TARGET",
  "npm_config_target",
] as const;

const normalizeTargetTriple = (value: string): string => {
  return value.replace(/\.exe$/i, "").trim();
};

const resolveTargetTriple = (): { targetTriple: string; source: string } => {
  for (const envKey of TARGET_TRIPLE_ENV_KEYS) {
    const envValue = process.env[envKey];
    if (!envValue) {
      continue;
    }

    const normalized = normalizeTargetTriple(envValue);
    if (!normalized) {
      continue;
    }

    return {
      targetTriple: normalized,
      source: `env:${envKey}`,
    };
  }

  const platform = process.platform;
  const architecture = process.arch as keyof typeof ARCHITECTURES;
  const targetTriple = TARGET_TRIPLE_BY_HOST[platform]?.[architecture];

  if (!targetTriple) {
    throw new Error(
      `Unsupported platform/architecture for sidecar build: ${platform}/${architecture}`
    );
  }

  return {
    targetTriple,
    source: `host:${platform}/${architecture}`,
  };
};

const getTargetPostfix = (targetTriple: string): string => {
  if (targetTriple.includes("windows")) {
    return `${targetTriple}.exe`;
  }

  return targetTriple;
};

const compile = async (): Promise<void> => {
  const { targetTriple, source } = resolveTargetTriple();
  const targetPostfix = getTargetPostfix(targetTriple);
  const outDir = path.join(
    import.meta.dir,
    "..",
    "..",
    "desktop",
    "src-tauri",
    "binaries"
  );
  const outfile = path.join(outDir, `${BINARY_NAME}-${targetPostfix}`);

  mkdirSync(outDir, { recursive: true });

  console.log(`[sidecar] target triple: ${targetTriple} (${source})`);
  console.log(`[sidecar] compiling ${BINARY_NAME}-${targetPostfix}`);
  await $`bun build --compile --target bun --production --minify --bytecode ./src/index.ts --outfile ${outfile}`;
  console.log(`[sidecar] created ${outfile}`);
};

await compile();
