# syntax=docker/dockerfile:1
# 构建上下文 = 仓库根。build: docker build -f apps/web/Dockerfile .
# Next standalone 产出自包含运行时。NEXT_PUBLIC_* 在 build 期被内联,故用 build args 传入。
# 用 slim(glibc)而非 alpine:避开 Next 图片优化依赖 sharp 在 musl 上的边角问题。

FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.1 --activate
WORKDIR /repo

FROM base AS fetch
COPY pnpm-lock.yaml ./
RUN pnpm fetch

FROM fetch AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter=@doc-pilot/web build

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# Next standalone(monorepo):server 在 apps/web/server.js,自带精简 node_modules。
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
