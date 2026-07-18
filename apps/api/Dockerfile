# syntax=docker/dockerfile:1
# 构建上下文 = 仓库根(pnpm workspace)。build: docker build -f apps/api/Dockerfile .
# tsup 把 @doc-pilot/* 打进 dist/index.js,第三方依赖仍是外部化的,故运行时需要一份
# 精简的 prod node_modules —— 用 `pnpm deploy --prod` 生成自包含目录。

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.1 --activate
WORKDIR /repo

# 仅按 lockfile 预取依赖到 store,最大化 Docker 层缓存(源码变化不失效)。
FROM base AS fetch
COPY pnpm-lock.yaml ./
RUN pnpm fetch

FROM fetch AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter=@doc-pilot/api build
# 产出自包含的 prod node_modules:
# - --legacy:workspace 包已被 tsup 打进 bundle,无需 injected 依赖(pnpm 10 默认要求 inject)。
# - node-linker=hoisted:bundle 会引用 @doc-pilot 包的传递依赖(如 @opentelemetry/api),
#   须扁平化到顶层 node_modules,Node 才能从 dist/index.js 解析到它们。
RUN printf 'node-linker=hoisted\n' > .npmrc \
  && pnpm --filter=@doc-pilot/api --prod --legacy deploy /prod

# 一次性迁移:复用 build 阶段(含 drizzle-kit + drizzle/*.sql)。DATABASE_URL 运行时注入。
FROM build AS migrate
WORKDIR /repo
CMD ["pnpm", "--filter=@doc-pilot/database", "db:migrate"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod/dist ./dist
COPY --from=build /prod/node_modules ./node_modules
COPY --from=build /prod/package.json ./package.json
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]
