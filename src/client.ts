import { configPath, maskSecret, readConfig } from "./config.js";

export const DEFAULT_BASE_URL = "https://i.weread.qq.com/api/agent/gateway";
export const SKILL_VERSION = "1.0.3";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type GatewayParams = Record<string, JsonValue | undefined>;

export interface GatewaySuccess {
  ok: true;
  api_name: string;
  skill_version: string;
  data: unknown;
}

export interface GatewayFailure {
  ok: false;
  api_name?: string;
  skill_version: string;
  error: {
    type:
      | "missing_auth"
      | "network_error"
      | "upstream_timeout"
      | "http_error"
      | "invalid_json"
      | "api_error"
      | "upgrade_required"
      | "invalid_input";
    message: string;
    status?: number;
    errcode?: number | string;
    retryable?: boolean;
    attempts?: number;
  };
  response?: unknown;
  upgrade_info?: unknown;
}

export class WereadError extends Error {
  readonly failure: GatewayFailure;
  readonly exitCode: number;

  constructor(failure: GatewayFailure, exitCode = 1) {
    super(failure.error.message);
    this.failure = failure;
    this.exitCode = exitCode;
  }
}

export class WereadClient {
  private readonly apiKey: string | undefined;
  private readonly apiKeySource: "constructor" | "env" | "config" | null;
  private readonly baseUrl: string;
  private readonly baseUrlSource: "constructor" | "env" | "config" | "default";
  private readonly timeoutMs: number;
  private readonly timeoutSource: "constructor" | "env" | "config" | "default";

  constructor(options: { apiKey?: string; baseUrl?: string; timeoutMs?: number } = {}) {
    const stored = readConfig();
    const envApiKey = nonEmpty(process.env.WEREAD_API_KEY);
    const envBaseUrl = nonEmpty(process.env.WEREAD_API_BASE_URL);
    const envTimeoutValue = nonEmpty(process.env.WEREAD_TIMEOUT_MS);
    const envTimeout = envTimeoutValue ? Number(envTimeoutValue) : undefined;

    this.apiKey = nonEmpty(options.apiKey) ?? envApiKey ?? stored.apiKey;
    this.apiKeySource = nonEmpty(options.apiKey) ? "constructor" : envApiKey ? "env" : stored.apiKey ? "config" : null;

    this.baseUrl = nonEmpty(options.baseUrl) ?? envBaseUrl ?? stored.baseUrl ?? DEFAULT_BASE_URL;
    this.baseUrlSource = nonEmpty(options.baseUrl) ? "constructor" : envBaseUrl ? "env" : stored.baseUrl ? "config" : "default";

    this.timeoutMs = options.timeoutMs ?? envTimeout ?? stored.timeoutMs ?? 30000;
    this.timeoutSource = options.timeoutMs ? "constructor" : envTimeout ? "env" : stored.timeoutMs ? "config" : "default";
  }

  authConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  config() {
    return {
      base_url: this.baseUrl,
      base_url_source: this.baseUrlSource,
      skill_version: SKILL_VERSION,
      auth_configured: this.authConfigured(),
      api_key_source: this.apiKeySource,
      api_key_preview: maskSecret(this.apiKey),
      config_file: configPath(),
      timeout_ms: this.timeoutMs,
      timeout_source: this.timeoutSource
    };
  }

  async call(apiName: string, params: GatewayParams = {}): Promise<GatewaySuccess> {
    if (!this.apiKey) {
      throw new WereadError(
        {
          ok: false,
          api_name: apiName,
          skill_version: SKILL_VERSION,
          error: {
            type: "missing_auth",
            message: "WeRead API key is not configured. Run: weread config set-key <wrk-...>"
          }
        },
        2
      );
    }

    const body: Record<string, JsonValue> = {
      api_name: apiName,
      skill_version: SKILL_VERSION
    };

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) body[key] = value;
    }

    const response = await this.fetchWithRetry(apiName, body);

    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new WereadError({
        ok: false,
        api_name: apiName,
        skill_version: SKILL_VERSION,
        error: {
          type: "invalid_json",
          message: "Gateway returned non-JSON response",
          status: response.status
        },
        response: text
      });
    }

    if (!response.ok) {
      if (response.status === 499) {
        throw new WereadError({
          ok: false,
          api_name: apiName,
          skill_version: SKILL_VERSION,
          error: {
            type: "upstream_timeout",
            message: "Upstream request timed out with HTTP 499",
            status: response.status,
            retryable: true,
            attempts: 3
          },
          response: data
        });
      }
      throw new WereadError({
        ok: false,
        api_name: apiName,
        skill_version: SKILL_VERSION,
        error: {
          type: "http_error",
          message: `Gateway HTTP ${response.status}`,
          status: response.status,
          retryable: false,
          attempts: 1
        },
        response: data
      });
    }

    const upgradeInfo = getObjectField(data, "upgrade_info");
    if (upgradeInfo !== undefined) {
      throw new WereadError(
        {
          ok: false,
          api_name: apiName,
          skill_version: SKILL_VERSION,
          error: {
            type: "upgrade_required",
            message: extractUpgradeMessage(upgradeInfo)
          },
          response: data,
          upgrade_info: upgradeInfo
        },
        3
      );
    }

    const errcode = getObjectField(data, "errcode");
    if (errcode !== undefined && errcode !== 0) {
      throw new WereadError({
        ok: false,
        api_name: apiName,
        skill_version: SKILL_VERSION,
        error: {
          type: "api_error",
          message: extractApiMessage(data),
          errcode: typeof errcode === "number" || typeof errcode === "string" ? errcode : undefined
        },
        response: data
      });
    }

    return {
      ok: true,
      api_name: apiName,
      skill_version: SKILL_VERSION,
      data
    };
  }

  private async fetchWithRetry(apiName: string, body: Record<string, JsonValue>): Promise<Response> {
    const maxAttempts = 3;
    let lastNetworkError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(this.baseUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        if (response.status === 499 && attempt < maxAttempts) {
          await response.arrayBuffer().catch(() => undefined);
          await delay(150 * attempt);
          continue;
        }
        return response;
      } catch (error) {
        lastNetworkError = error;
        if (attempt < maxAttempts && isRetryableNetworkError(error)) {
          await delay(150 * attempt);
          continue;
        }
        throw new WereadError({
          ok: false,
          api_name: apiName,
          skill_version: SKILL_VERSION,
          error: {
            type: "network_error",
            message: error instanceof Error ? error.message : "Network request failed",
            retryable: isRetryableNetworkError(error),
            attempts: attempt
          }
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new WereadError({
      ok: false,
      api_name: apiName,
      skill_version: SKILL_VERSION,
      error: {
        type: "network_error",
        message: lastNetworkError instanceof Error ? lastNetworkError.message : "Network request failed",
        retryable: true,
        attempts: maxAttempts
      }
    });
  }
}

function getObjectField(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

function extractUpgradeMessage(upgradeInfo: unknown): string {
  if (upgradeInfo && typeof upgradeInfo === "object" && "message" in upgradeInfo) {
    const message = (upgradeInfo as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return "WeRead skill upgrade is required. Follow upgrade_info before retrying.";
}

function extractApiMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "WeRead API returned an error";
  const record = data as Record<string, unknown>;
  for (const key of ["errmsg", "message", "errMsg", "msg"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return "WeRead API returned a non-zero errcode";
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  return error.name === "AbortError" || /fetch failed|network|timeout|aborted/i.test(error.message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
