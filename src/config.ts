import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface StoredConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export function configDir(): string {
  return resolve(process.env.WEREAD_CLI_CONFIG_DIR ?? join(homedir(), ".weread-cli"));
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function readConfig(): StoredConfig {
  try {
    const raw = readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    return {
      apiKey: typeof record.apiKey === "string" ? record.apiKey : undefined,
      baseUrl: typeof record.baseUrl === "string" ? record.baseUrl : undefined,
      timeoutMs: typeof record.timeoutMs === "number" ? record.timeoutMs : undefined
    };
  } catch {
    return {};
  }
}

export function writeConfig(config: StoredConfig): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function updateConfig(patch: Partial<StoredConfig>): StoredConfig {
  const next = { ...readConfig(), ...patch };
  writeConfig(next);
  return next;
}

export function maskSecret(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}
