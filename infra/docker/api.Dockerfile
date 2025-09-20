FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/api ./services/api
COPY packages/core ./packages/core
COPY packages/db ./packages/db
RUN pnpm install
# Build only required workspace packages so core/db are compiled before the API
RUN pnpm --filter @joslyn-ai/core --filter @joslyn-ai/db --filter @joslyn-ai/api -r build
COPY services/api/docker-entrypoint.sh ./services/api/docker-entrypoint.sh
RUN chmod +x ./services/api/docker-entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["./services/api/docker-entrypoint.sh"]
