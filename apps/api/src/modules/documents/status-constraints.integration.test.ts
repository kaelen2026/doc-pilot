import { db, queryClient } from "@doc-pilot/database";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const REQUIRED_CONSTRAINTS = [
  "documents_status_check",
  "documents_current_stage_check",
  "processing_jobs_type_check",
  "processing_jobs_stage_check",
  "processing_jobs_status_check",
  "outbox_events_status_check",
  "messages_role_check",
  "messages_status_check",
] as const;

afterAll(async () => {
  await queryClient.end();
});

describe("状态字段数据库约束", () => {
  it("所有业务状态和阶段字段都有 CHECK 约束", async () => {
    const rows = await db.execute<{ constraint_name: string }>(sql`
      select constraint_name
      from information_schema.table_constraints
      where constraint_type = 'CHECK'
        and constraint_name in ${REQUIRED_CONSTRAINTS}
    `);

    expect(new Set(rows.map((row) => row.constraint_name))).toEqual(new Set(REQUIRED_CONSTRAINTS));
  });
});
