#!/usr/bin/env bash
set -e

pnpm --filter @joslyn-ai/core build
pnpm --filter @joslyn-ai/db migrate

exec node services/api/dist/index.js
