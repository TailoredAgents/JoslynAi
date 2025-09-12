FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/api ./services/api
COPY packages/core ./packages/core
COPY packages/db ./packages/db
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @iep-ally/api build
EXPOSE 8080
CMD ["pnpm","--filter","@iep-ally/api","start"]

