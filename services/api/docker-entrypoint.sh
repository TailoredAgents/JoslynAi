#!/usr/bin/env bash
set -e

pnpm --filter @iep-ally/db migrate

exec node dist/index.js

