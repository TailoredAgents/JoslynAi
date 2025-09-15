#!/usr/bin/env bash
set -e

pnpm --filter @iep-ally/core build
pnpm --filter @iep-ally/db migrate

exec node services/api/dist/index.js