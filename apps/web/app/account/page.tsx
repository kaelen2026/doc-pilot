import type { Metadata } from "next";
import { AccountView } from "./account-view";

export const metadata: Metadata = { title: "设置" };

export default function AccountPage() {
  return <AccountView />;
}
