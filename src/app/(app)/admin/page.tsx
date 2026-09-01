import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/notes");

  return <AdminPanel />;
}
