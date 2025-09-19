FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web ./apps/web
COPY packages/ui ./packages/ui
COPY packages/core ./packages/core
RUN pnpm install --frozen-lockfile
# Normalize encodings to UTF-8 (strip BOM, fix CRLF) using Node to avoid tool incompatibilities
RUN node -e "const fs=require('fs'),path=require('path');function walk(p){for(const f of fs.readdirSync(p)){const full=path.join(p,f);const st=fs.statSync(full);if(st.isDirectory())walk(full);else if(/\.(ts|tsx|js|jsx)$/.test(f)){let buf=fs.readFileSync(full);let s=buf.toString('utf8');if(s.charCodeAt(0)===0xFEFF)s=s.slice(1);s=s.replace(/\r\n/g,'\n');fs.writeFileSync(full,s,'utf8');}}}walk('/app/apps/web');"
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


