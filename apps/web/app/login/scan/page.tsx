import type { Metadata } from "next";
import { ScanLoginView } from "./scan-login-view";

export const metadata: Metadata = { title: "扫码登录" };

export default function ScanLoginPage() {
  return <ScanLoginView />;
}
