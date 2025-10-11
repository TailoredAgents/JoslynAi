import { createScanner } from "clamdjs";

let scannerInstance: ReturnType<typeof createScanner> | null = null;

function getScanner() {
  if (!process.env.CLAMAV_HOST || process.env.CLAMAV_DISABLED === "1") {
    return null;
  }
  if (scannerInstance) return scannerInstance;
  const host = process.env.CLAMAV_HOST;
  const port = Number(process.env.CLAMAV_PORT || 3310);
  const timeout = Number(process.env.CLAMAV_TIMEOUT_MS || 15000);
  scannerInstance = createScanner(host, port, timeout);
  return scannerInstance;
}

export async function scanFileForViruses(filePath: string) {
  const scanner = getScanner();
  if (!scanner) return;
  const failClosed = process.env.CLAMAV_FAIL_CLOSED !== "0";
  try {
    const result = await scanner.scanFile(filePath);
    if (typeof result === "string" && result.includes("FOUND")) {
      throw new Error(result);
    }
  } catch (err) {
    if (!failClosed) {
      console.warn("[clamav] scan failed, continuing:", err);
      return;
    }
    throw new Error(`clamav_scan_failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
