#!/usr/bin/env bash
set -e

pnpm --filter @joslyn-ai/core build

# Optional migrations/extensions at startup (disabled by default in production)
if [ "${RUN_MIGRATIONS}" = "true" ]; then
  echo "[entrypoint] Running Prisma db push and extension scripts..."
  pnpm --filter @joslyn-ai/db exec prisma db push --schema prisma/schema.prisma ${ACCEPT_DATA_LOSS:+--accept-data-loss}
  pnpm --filter @joslyn-ai/db exec prisma db execute --file prisma/extensions.sql --schema prisma/schema.prisma || true
  pnpm --filter @joslyn-ai/db exec prisma db execute --file prisma/rls.sql --schema prisma/schema.prisma || true
else
  echo "[entrypoint] Skipping migrations (set RUN_MIGRATIONS=true to enable)."
fi

exec node services/api/dist/index.js
