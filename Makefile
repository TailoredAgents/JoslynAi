SHELL := /bin/sh

.PHONY: up down restart ps logs logs-api logs-web logs-worker migrate dev-api dev-web purge tasks-cleanup dead-letter-trim

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

tasks-cleanup:
	@if [ -z "$${DATABASE_URL}" ]; then echo "DATABASE_URL required for tasks-cleanup target"; exit 1; fi
	pnpm --filter @joslyn-ai/db exec prisma db execute --file packages/db/scripts/tasks_cleanup.sql --schema packages/db/prisma/schema.prisma --url "$${DATABASE_URL}"

dead-letter-trim:
	@if [ -z "$${REDIS_URL}" ]; then echo "REDIS_URL required for dead-letter-trim target"; exit 1; fi
	python services/worker/scripts/trim_dead_letter.py --redis-url "$${REDIS_URL}" --queue "$${JOB_DEAD_LETTER_QUEUE:-jobs:dead}" --keep "$${DEAD_LETTER_KEEP:-100}"
