import { defineConfig } from "drizzle-kit";
import { databaseEnv } from "./src/env";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseEnv.url ?? "",
  },
});
