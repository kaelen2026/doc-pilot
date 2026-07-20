/**
 * 结构化日志(cross-cutting.md §29.3)。零依赖,每条日志一行 JSON。
 * 字段约定:time / level / event / 以及绑定上下文(traceId / workspaceId / documentId 等)。
 * 默认不记录完整文档与完整 Prompt:超长字符串会被截断(§29.3)。
 */

import { observabilityEnv } from "./env";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MAX_STRING_LEN = 512;

function activeLevel(): LogLevel {
  const raw = observabilityEnv.logLevel();
  return raw in LEVEL_ORDER ? (raw as LogLevel) : "info";
}

/** 把 Error 转成可安全序列化的对象(默认不含 stack 之外的敏感数据)。 */
export function errToLog(err: unknown): LogFields {
  if (err instanceof Error) {
    const out: LogFields = { name: err.name, message: err.message };
    if ("code" in err && typeof (err as { code?: unknown }).code === "string") {
      out.code = (err as { code: string }).code;
    }
    return out;
  }
  return { message: String(err) };
}

/** 截断超长字符串,避免把完整文档/Prompt 写进日志(§29.3)。 */
function sanitize(value: unknown): unknown {
  if (typeof value === "string" && value.length > MAX_STRING_LEN) {
    return `${value.slice(0, MAX_STRING_LEN)}…[+${value.length - MAX_STRING_LEN}]`;
  }
  return value;
}

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** 派生带固定上下文的子 logger(如绑定 traceId / workspaceId)。 */
  child(bindings: LogFields): Logger;
}

function write(level: LogLevel, bindings: LogFields, event: string, fields?: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel()]) {
    return;
  }
  const record: LogFields = {
    time: new Date().toISOString(),
    level,
    event,
    ...bindings,
  };
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      record[key] = sanitize(value);
    }
  }
  const line = JSON.stringify(record);
  if (level === "warn" || level === "error") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export function createLogger(bindings: LogFields = {}): Logger {
  return {
    debug: (event, fields) => write("debug", bindings, event, fields),
    info: (event, fields) => write("info", bindings, event, fields),
    warn: (event, fields) => write("warn", bindings, event, fields),
    error: (event, fields) => write("error", bindings, event, fields),
    child: (extra) => createLogger({ ...bindings, ...extra }),
  };
}

/** 进程级根 logger。 */
export const logger = createLogger();
