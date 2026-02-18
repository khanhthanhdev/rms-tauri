import { mkdirSync } from "node:fs";
import path from "node:path";
import { $ } from "bun";

const BINARY_NAME = "rms-server-sidecar";

const ARCHITECTURES = {
  x64: "x86_64",
  arm64: "aarch64",
} as const;

const TARGET_POSTFIX: Record<
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
    x64: "x86_64-pc-windows-msvc.exe",
    arm64: "aarch64-pc-windows-msvc.exe",
  },
  cygwin: {},
};

const resolveTargetPostfix = (): string => {
  const platform = process.platform;
  const architecture = process.arch as keyof typeof ARCHITECTURES;
  const postfix = TARGET_POSTFIX[platform]?.[architecture];

  if (!postfix) {
    throw new Error(
      `Unsupported platform/architecture for sidecar build: ${platform}/${architecture}`
    );
  }

  return postfix;
};

const compile = async (): Promise<void> => {
  const targetPostfix = resolveTargetPostfix();
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

  console.log(`[sidecar] compiling ${BINARY_NAME}-${targetPostfix}`);
  await $`bun build --compile --target bun --production --minify --bytecode ./src/index.ts --outfile ${outfile}`;
  console.log(`[sidecar] created ${outfile}`);
};

await compile();
