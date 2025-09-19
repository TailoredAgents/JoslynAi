FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web ./apps/web
COPY packages/ui ./packages/ui
COPY packages/core ./packages/core
RUN pnpm install --frozen-lockfile
# Strip UTF-8 BOM from source files to avoid Turbopack UTF-8 errors during Next build
RUN find /app/apps/web -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) -exec sed -i '1s/^\xEF\xBB\xBF//' {} +
RUN pnpm --filter @joslyn-ai/web build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/packages ./packages
RUN pnpm install --frozen-lockfile --prod --filter @joslyn-ai/web...
EXPOSE 3000
CMD ["pnpm","--filter","@joslyn-ai/web","start"]


