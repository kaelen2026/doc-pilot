import type { Metadata } from "next";
import { AdminView } from "./admin-view";

export const metadata: Metadata = { title: "管理后台" };

export default function AdminPage() {
  return <AdminView />;
}
