import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node24",
  clean: true,
  // 只把 @doc-pilot/* 的 TS 源打进产物;其余 npm 依赖(含 workspace 包的传递依赖,如
  // @opentelemetry/*)一律外部化,运行时从 node_modules 加载。否则 CJS 包(动态 require)
  // 被打进 ESM 产物会报 "Dynamic require of ... is not supported"。
  noExternal: [/^@doc-pilot\//],
  esbuildPlugins: [
    {
      name: "externalize-npm-except-workspace",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          const p = args.path;
          if (p.startsWith(".") || p.startsWith("/") || p.startsWith("@doc-pilot/")) {
            return undefined;
          }
          return { path: p, external: true };
        });
      },
    },
  ],
});
