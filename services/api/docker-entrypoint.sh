#!/usr/bin/env bash
set -e

pnpm --filter @joslyn-ai/core build

# Ensure Prisma Client is generated for the API at runtime using the shared schema
SCHEMA_DB_REL="packages/db/prisma/schema.prisma"
echo "[entrypoint] Generating Prisma Client from ${SCHEMA_DB_REL}"
# Prefer running Prisma CLI from the db package (where it is declared). When filtered, CWD=packages/db, so schema path is prisma/schema.prisma
if ! pnpm --filter @joslyn-ai/db exec prisma generate --schema prisma/schema.prisma; then
  echo "[entrypoint] Filtered exec failed; falling back to dlx in workspace root"
  PRISMA_VER="${PRISMA_VER:-5.18.0}"
  pnpm dlx prisma@"${PRISMA_VER}" generate --schema "${SCHEMA_DB_REL}" || {
    echo "[entrypoint] prisma generate failed" >&2
    exit 1
  }
fi

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
