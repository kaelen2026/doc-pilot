# syntax=docker/dockerfile:1
# 构建上下文 = 仓库根。build: docker build -f apps/worker/Dockerfile .
# 与 api 同款:tsup 打包 + pnpm deploy 产出自包含 prod node_modules。Worker 常驻进程,
# 消费 document-processing / maintenance 队列(BullMQ),无 HTTP 端口。

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.1 --activate
WORKDIR /repo

FROM base AS fetch
COPY pnpm-lock.yaml ./
RUN pnpm fetch

FROM fetch AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter=@doc-pilot/worker build
# node-linker=hoisted:把传递依赖(如 @opentelemetry/api)扁平化到顶层,
# 运行时 dist/index.js 才解析得到(bundle 引用的是 @doc-pilot 包的传递依赖)。
RUN printf 'node-linker=hoisted\n' > .npmrc \
  && pnpm --filter=@doc-pilot/worker --prod --legacy deploy /prod

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod/dist ./dist
COPY --from=build /prod/node_modules ./node_modules
COPY --from=build /prod/package.json ./package.json
USER node
CMD ["node", "dist/index.js"]
