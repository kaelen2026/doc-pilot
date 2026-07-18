import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node24",
  clean: true,
  // 只把 @doc-pilot/* 的 TS 源打进产物(它们不发布已编译 JS);其余 npm 依赖——包括
  // workspace 包的传递依赖(如 @opentelemetry/*)——一律外部化,运行时从 node_modules
  // 加载。否则 esbuild 会把 CJS 包(内部动态 require)打进 ESM 产物,运行时报
  // "Dynamic require of ... is not supported"。
  noExternal: [/^@doc-pilot\//],
  esbuildPlugins: [
    {
      name: "externalize-npm-except-workspace",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          const p = args.path;
          // 相对/绝对导入照常打包;@doc-pilot/* 交给 noExternal 打包。
          if (p.startsWith(".") || p.startsWith("/") || p.startsWith("@doc-pilot/")) {
            return undefined;
          }
          // 其余裸导入(npm 包 + node: 内置)全部外部化。
          return { path: p, external: true };
        });
      },
    },
  ],
});
