import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node24",
  clean: true,
  // Bundle internal workspace packages (they ship TS source, not built JS).
  noExternal: [/^@doc-pilot\//],
});
