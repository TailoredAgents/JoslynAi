const REQUIRED_IN_PRODUCTION = [
  "DATABASE_URL",
  "REDIS_URL",
  "OPENAI_API_KEY",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "INTERNAL_API_KEY",
];

function formatEnvList(keys: string[]): string {
  return keys.map((key) => `"${key}"`).join(", ");
}

export function validateRequiredEnv(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${formatEnvList(missing)}`);
  }
}

export function logOptionalWarnings(): void {
  const optionalWarnings: Array<{ key: string; message: string }> = [];
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    optionalWarnings.push({
      key: "STRIPE_*",
      message: "Stripe billing features will be disabled until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set.",
    });
  }
  if (!process.env.PUBLIC_BASE_URL) {
    optionalWarnings.push({
      key: "PUBLIC_BASE_URL",
      message: "PUBLIC_BASE_URL missing; URL generation falls back to request headers.",
    });
  }

  if (!optionalWarnings.length) return;

  for (const entry of optionalWarnings) {
    console.warn(`[env] ${entry.message}`);
  }
}
