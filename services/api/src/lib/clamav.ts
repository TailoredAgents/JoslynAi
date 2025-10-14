import { createScanner, ping, type ClamdScanner } from "clamdjs";

type ClamConfig = {
  host: string | undefined;
  port: number;
  timeout: number;
  disabled: boolean;
  failClosed: boolean;
};

let scannerInstance: ClamdScanner | null = null;
let scannerKey: string | null = null;
let readinessValidated = false;

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveConfig(): ClamConfig {
  return {
    host: process.env.CLAMAV_HOST,
    port: parsePositiveNumber(process.env.CLAMAV_PORT, 3310),
    timeout: parsePositiveNumber(process.env.CLAMAV_TIMEOUT_MS, 15000),
    disabled: process.env.CLAMAV_DISABLED === "1",
    failClosed: process.env.CLAMAV_FAIL_CLOSED !== "0",
  };
}

function getScanner(config: ClamConfig): ClamdScanner | null {
  if (config.disabled || !config.host) {
    return null;
  }
  const key = `${config.host}:${config.port}:${config.timeout}`;
  if (!scannerInstance || scannerKey !== key) {
    scannerInstance = createScanner(config.host, config.port, config.timeout);
    scannerKey = key;
  }
  return scannerInstance;
}

export async function ensureClamAvReadiness(): Promise<void> {
  const config = resolveConfig();
  if (config.disabled) {
    if (config.failClosed) {
      throw new Error("CLAMAV_DISABLED=1 while CLAMAV_FAIL_CLOSED!=0; disable fail-closed or enable scanning.");
    }
    return;
  }

  if (!config.host) {
    if (config.failClosed) {
      throw new Error("CLAMAV_HOST must be set when CLAMAV_FAIL_CLOSED!=0.");
    }
    return;
  }

  if (readinessValidated) return;

  try {
    const ok = await ping(config.host, config.port, config.timeout);
    if (!ok) {
      if (config.failClosed) {
        throw new Error(`ClamAV ping returned unexpected response for ${config.host}:${config.port}.`);
      }
      console.warn(`[clamav] ping returned false for ${config.host}:${config.port}`);
      return;
    }
    readinessValidated = true;
  } catch (err) {
    if (config.failClosed) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`[clamav] failed to reach server at ${config.host}:${config.port}: ${message}`);
    }
    console.warn("[clamav] readiness check failed but continuing because fail-closed is disabled:", err);
  }
}

export async function scanFileForViruses(filePath: string): Promise<void> {
  const config = resolveConfig();
  if (config.disabled) return;
  if (!config.host) {
    if (config.failClosed) {
      throw new Error("clamav_scan_failed: CLAMAV_HOST must be set when CLAMAV_FAIL_CLOSED!=0");
    }
    return;
  }

  const scanner = getScanner(config);
  if (!scanner) {
    if (config.failClosed) {
      throw new Error("clamav_scan_failed: scanner is unavailable");
    }
    return;
  }

  try {
    const result = await scanner.scanFile(filePath, config.timeout);
    if (typeof result === "string" && result.includes("FOUND")) {
      throw new Error(result);
    }
  } catch (err) {
    if (!config.failClosed) {
      console.warn("[clamav] scan failed, continuing:", err);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`clamav_scan_failed: ${message}`);
  }
}
