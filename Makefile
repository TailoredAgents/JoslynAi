SHELL := /bin/sh

.PHONY: up down restart ps logs logs-api logs-web logs-worker migrate dev-api dev-web purge

up:
	docker compose up -d --build

down:
	docker compose down

restart:
	docker compose restart

ps:
	docker compose ps

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f api

logs-web:
	docker compose logs -f web

logs-worker:
	docker compose logs -f worker

migrate:
	DATABASE_URL=$${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/joslyn_ai} \
		pnpm --filter @joslyn-ai/db migrate

dev-api:
	PNPM_HOME=$${PNPM_HOME} pnpm dev:api

dev-web:
	PNPM_HOME=$${PNPM_HOME} pnpm dev:web

purge:
	@if [ -z "$${DATABASE_URL}" ]; then echo "DATABASE_URL required for purge target"; exit 1; fi
	PGOPTIONS="-c joslyn.retention_days=$${RETENTION_DAYS:-90}" \
		pnpm --filter @joslyn-ai/db exec prisma db execute --file scripts/purge_ephemeral.sql --schema packages/db/prisma/schema.prisma --url "$${DATABASE_URL}"

