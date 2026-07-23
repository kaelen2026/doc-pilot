import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SealMark } from "@/components/seal-mark";

export const metadata: Metadata = {
  title: "隐私政策",
  description: "DocPilot 隐私政策:我们收集哪些信息、如何使用与保护,以及你的权利。",
};

// 生效日期:内容确认后由运营方维护。改动实质条款时应同步更新此日期并在「政策更新」说明。
const EFFECTIVE_DATE = "2026 年 7 月 23 日";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-medium tracking-[-0.01em] text-ink">{title}</h2>
      <div className="space-y-3 text-[15px] leading-[1.75] text-ink-soft">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6">
      <nav className="flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <SealMark className="size-8 text-base" />
          <span className="font-display text-lg font-medium tracking-[-0.01em]">DocPilot</span>
        </Link>
        <Link
          href="/"
          className="rounded-md px-1 text-sm text-ink-soft outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 [@media(hover:hover)]:hover:text-ink"
        >
          返回首页
        </Link>
      </nav>

      <article className="flex-1 space-y-10 py-10">
        <header className="animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both] space-y-3">
          <h1 className="font-display text-4xl font-medium leading-[1.15] tracking-[-0.02em] text-ink">
            隐私政策
          </h1>
          <p className="text-sm text-ink-faint">最近更新:{EFFECTIVE_DATE}</p>
          <p className="text-[15px] leading-[1.75] text-ink-soft">
            DocPilot 是一款 AI 文档工作台:你上传
            PDF,我们解析并向量化其内容,让你基于全文提问并获得带原文引用的回答。
            本政策说明我们收集哪些信息、如何使用与共享、保存多久,以及你如何行使自己的权利。
          </p>
        </header>

        <Section title="一、我们收集的信息">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="font-medium text-ink">账户信息</strong>
              :你的邮箱地址、昵称,以及你所选登录方式的标识—— 邮箱验证码、邮箱+密码,或通过 Sign in
              with Apple / Google 登录时对应服务返回的账户标识。
            </li>
            <li>
              <strong className="font-medium text-ink">你上传的内容</strong>:你上传的 PDF
              文档、由其解析出的文本与切片, 以及你在问答中提交的问题和生成的回答、对话记录。
            </li>
            <li>
              <strong className="font-medium text-ink">使用与配额数据</strong>
              :文档数量、提问次数等用于计量配额与防止滥用的数据。
            </li>
            <li>
              <strong className="font-medium text-ink">设备与推送</strong>
              :开启通知时的推送令牌(APNs),用于向你的设备发送与账户相关的通知。
            </li>
            <li>
              <strong className="font-medium text-ink">日志与诊断</strong>
              :为保障服务可用与排查故障而产生的必要技术日志(如请求时间、错误信息)。
            </li>
          </ul>
        </Section>

        <Section title="二、我们如何使用这些信息">
          <ul className="list-disc space-y-2 pl-5">
            <li>提供核心功能:文档解析、摘要生成、基于全文检索的问答与引用定位;</li>
            <li>管理你的账户与工作区、登录与会话;</li>
            <li>在你开启时发送推送通知;</li>
            <li>计量与执行配额、防止滥用、保障服务安全;</li>
            <li>排查故障、维护与改进服务。</li>
          </ul>
          <p>我们不会将你的文档内容或对话用于与提供上述服务无关的目的。</p>
        </Section>

        <Section title="三、数据的处理与共享">
          <p>
            为实现问答能力,你的文档相关内容会在你发起处理或提问时,通过我们的 AI 网关发送给第三方 AI
            模型服务商进行摘要与作答。我们仅在提供服务所必需的范围内共享数据,并要求这些服务方对数据保密。
          </p>
          <p>涉及的第三方处理者类别包括:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="font-medium text-ink">AI 模型服务商</strong>:用于生成摘要与回答;
              <span className="text-ink-faint">(具体服务商名单:______,请据实填写)</span>
            </li>
            <li>
              <strong className="font-medium text-ink">云存储服务</strong>:用于存放你上传的文档;
            </li>
            <li>
              <strong className="font-medium text-ink">邮件发送服务</strong>
              :用于投递登录验证码等事务性邮件。
            </li>
          </ul>
          <p>
            我们<strong className="font-medium text-ink">不会出售</strong>
            你的个人信息。除上述为提供服务所必需的共享外,
            仅在法律要求或为保护用户与公众安全的必要情形下才会披露信息。
          </p>
        </Section>

        <Section title="四、数据保存与删除">
          <p>
            我们在为你提供服务期间保存上述数据。你可以随时在 app 内删除单个文档,或
            <strong className="font-medium text-ink">删除整个账户</strong>。
          </p>
          <p>
            发起账户删除后,账户将进入 <strong className="font-medium text-ink">7 天冷静期</strong>:
            期间你重新登录即可撤销删除;冷静期结束后,你的文档、对话及全部关联数据将被
            <strong className="font-medium text-ink">永久删除且无法恢复</strong>
            。为满足法律或合规义务而必须保留的最小限度数据除外。
          </p>
        </Section>

        <Section title="五、你的权利">
          <p>
            在适用法律范围内,你有权访问、更正、导出或删除你的个人信息,并可撤回此前给予的授权。你可以:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>在账户设置中更新昵称等资料;</li>
            <li>删除单个文档,或删除整个账户(见上「数据保存与删除」);</li>
            <li>通过下方联系方式就隐私事宜与我们联系。</li>
          </ul>
        </Section>

        <Section title="六、数据安全">
          <p>
            数据传输经 HTTPS/TLS 加密;我们按工作区隔离你的数据,并以访问控制限制内部接触。
            但请注意,没有任何系统能保证绝对安全。
          </p>
        </Section>

        <Section title="七、儿童隐私">
          <p>
            DocPilot 不面向 <span className="text-ink-faint">[年龄门槛,如 14]</span>{" "}
            岁以下的儿童,我们不会有意收集其个人信息。
            若你认为我们可能收集了此类信息,请联系我们删除。
          </p>
        </Section>

        <Section title="八、政策更新">
          <p>
            我们可能不时更新本政策。发生重大变更时,我们会更新页首的「最近更新」日期,并在适当情况下通过
            app 或邮件另行告知。
          </p>
        </Section>

        <Section title="九、联系我们">
          <p>
            如对本隐私政策或你的数据有任何疑问,请联系:
            <br />
            运营主体:<span className="text-ink-faint">______(请填写)</span>
            <br />
            邮箱:
            <a
              href="mailto:privacy@example.com"
              className="rounded-sm text-seal underline-offset-2 outline-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="text-ink-faint">[联系邮箱,请填写]</span>
            </a>
          </p>
        </Section>
      </article>

      <footer className="border-t border-hairline py-8 text-sm text-ink-faint">
        <Link
          href="/"
          className="rounded-md px-1 outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 [@media(hover:hover)]:hover:text-ink"
        >
          ← 回到 DocPilot
        </Link>
      </footer>
    </main>
  );
}
