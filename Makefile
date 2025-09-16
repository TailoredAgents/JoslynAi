SHELL := /bin/sh

.PHONY: up down restart ps logs logs-api logs-web logs-worker migrate dev-api dev-web

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

