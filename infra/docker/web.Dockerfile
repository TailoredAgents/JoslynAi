FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web ./apps/web
COPY packages/ui ./packages/ui
COPY packages/core ./packages/core
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @iep-ally/web build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/packages ./packages
RUN pnpm install --frozen-lockfile --prod --filter @iep-ally/web...
EXPOSE 3000
CMD ["pnpm","--filter","@iep-ally/web","start"]


