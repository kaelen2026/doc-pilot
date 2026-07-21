import { resolve } from "node:path";

export const PROJECT_NAME = "docpilot-staging-local";
export const ROOT = resolve(import.meta.dirname, "../..");
export const GENERATED_ENV = resolve(ROOT, ".env.production");
export const BASE_COMPOSE = resolve(ROOT, "docker-compose.prod.yml");
export const STAGING_COMPOSE = resolve(ROOT, "docker-compose.staging.yml");
export const WEB_URL = "http://localhost:3300";
export const API_URL = "http://localhost:3301";
export const MAILPIT_URL = "http://localhost:38025";
export const COST_BUDGET_MICROS = 5_000_000;

export const COMPOSE_ARGS = [
  "compose",
  "--project-name",
  PROJECT_NAME,
  "--env-file",
  GENERATED_ENV,
  "-f",
  BASE_COMPOSE,
  "-f",
  STAGING_COMPOSE,
];
