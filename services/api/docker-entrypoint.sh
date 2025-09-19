#!/usr/bin/env bash
set -e

pnpm --filter @joslyn-ai/core build
# Dev-friendly DB push with extensions and RLS; accept data loss for local containers
pnpm --filter @joslyn-ai/db exec prisma db push --schema prisma/schema.prisma --accept-data-loss
pnpm --filter @joslyn-ai/db exec prisma db execute --file prisma/extensions.sql --schema prisma/schema.prisma || true
pnpm --filter @joslyn-ai/db exec prisma db execute --file prisma/rls.sql --schema prisma/schema.prisma || true

exec node services/api/dist/index.js
