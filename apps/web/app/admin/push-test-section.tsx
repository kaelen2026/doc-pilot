"use client";

import { PUSH_TEST_MESSAGE } from "@doc-pilot/contracts";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TestPushReport } from "@/features/admin/types";
import { useSendTestPush } from "@/features/admin/use-admin";
import { AdminSection } from "./admin-section";

/**
 * 发送测试推送:按邮箱定位用户,向其全部已注册设备投递一条 APNS 通知。
 * 用于验证「iOS 注册令牌 → 后端 → APNS」整条链路。真实投递,故用 mutation(不缓存)。
 */
export function PushTestSection() {
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const mutation = useSendTestPush();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      return;
    }
    mutation.mutate({
      email: email.trim(),
      title: title.trim() || undefined,
      body: body.trim() || undefined,
    });
  }

  return (
    <AdminSection title="测试推送" description="按邮箱向用户的全部已注册设备发送一条 APNS 通知">
      <form onSubmit={onSubmit} className="space-y-4 px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor="push-email">收件人邮箱</Label>
            <Input
              id="push-email"
              type="email"
              required
              autoComplete="off"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="push-title">标题(可选)</Label>
            <Input
              id="push-title"
              maxLength={PUSH_TEST_MESSAGE.titleMax}
              placeholder="DocPilot 测试推送"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="push-body">正文(可选)</Label>
          <Input
            id="push-body"
            maxLength={PUSH_TEST_MESSAGE.bodyMax}
            placeholder="如果你收到这条通知,说明推送链路已打通 🎉"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!email.trim() || mutation.isPending}>
            {mutation.isPending ? "发送中…" : "发送测试推送"}
          </Button>
          <PushResult
            report={mutation.data}
            error={mutation.error}
            isPending={mutation.isPending}
          />
        </div>
      </form>
    </AdminSection>
  );
}

/** 结果反馈:错误、或按设备数汇总。aria-live 让屏幕阅读器读到异步结果。 */
function PushResult({
  report,
  error,
  isPending,
}: {
  report: TestPushReport | undefined;
  error: Error | null;
  isPending: boolean;
}) {
  if (isPending) {
    return null;
  }
  if (error) {
    return (
      <p aria-live="polite" className="text-seal text-sm">
        {error.message}
      </p>
    );
  }
  if (!report) {
    return null;
  }
  if (report.requested === 0) {
    return (
      <p aria-live="polite" className="text-ink-faint text-sm">
        {report.email} 没有已注册的设备
      </p>
    );
  }
  return (
    <p aria-live="polite" className="text-ink-soft text-sm tabular-nums">
      已发往 {report.email} 的 {report.requested} 台设备:成功 {report.sent},失败 {report.failed}
      {report.invalidPruned > 0 ? `,清除失效令牌 ${report.invalidPruned}` : ""}
    </p>
  );
}
