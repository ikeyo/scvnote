import { redirect } from "next/navigation";
import { getSessionUserId, needsSetup } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUserId()) redirect("/notes");
  return <LoginForm setup={await needsSetup()} />;
}
