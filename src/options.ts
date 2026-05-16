import { Command } from "commander";
import type { GatewayParams, JsonValue } from "./client.js";

export const SEARCH_SCOPES = {
  all: 0,
  book: 10,
  ebook: 10,
  fiction: 16,
  audio: 14,
  author: 6,
  fulltext: 12,
  list: 13,
  mp: 2,
  article: 4
} as const;

export function jsonMode(command: Command): boolean {
  return Boolean(command.optsWithGlobals<{ json?: boolean }>().json);
}

export function compactMode(command: Command): boolean {
  return Boolean(command.optsWithGlobals<{ compact?: boolean }>().compact);
}

export function intOption(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  return parsed;
}

export function positiveIntOption(value: string | undefined, name: string): number | undefined {
  const parsed = intOption(value, name);
  if (parsed !== undefined && parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function outputLimit(opts: { limit?: string; all?: boolean }, fallback: number): number | undefined {
  if (opts.all) return undefined;
  return positiveIntOption(opts.limit, "--limit") ?? fallback;
}

export function optionalString(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

export function scopeValue(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const key = value.toLowerCase() as keyof typeof SEARCH_SCOPES;
  if (key in SEARCH_SCOPES) return SEARCH_SCOPES[key];
  throw new Error(`unknown scope "${value}". Use one of: ${Object.keys(SEARCH_SCOPES).join(", ")}, or a numeric scope`);
}

export function parseJsonValue(raw: string, label: string): JsonValue {
  try {
    return JSON.parse(raw) as JsonValue;
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error instanceof Error ? error.message : "parse failed"}`);
  }
}

export function parseBodyJson(raw: string | undefined): GatewayParams {
  if (!raw) return {};
  const parsed = parseJsonValue(raw, "--body-json");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--body-json must be a JSON object");
  }
  return parsed as GatewayParams;
}

export function collectParam(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

export function parseParams(values: string[] | undefined): GatewayParams {
  const params: GatewayParams = {};
  for (const value of values ?? []) {
    const separator = value.indexOf("=");
    if (separator <= 0) {
      throw new Error(`--param must be key=value, got "${value}"`);
    }
    const key = value.slice(0, separator);
    const raw = value.slice(separator + 1);
    params[key] = coerceScalar(raw);
  }
  return params;
}

export function coerceScalar(value: string): JsonValue {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
    return parseJsonValue(value, "parameter value");
  }
  return value;
}

export function compactParams(params: GatewayParams): GatewayParams {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)) as GatewayParams;
}
