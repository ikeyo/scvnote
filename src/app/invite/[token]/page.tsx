import { prisma } from "@/lib/db";
import { InviteAcceptForm } from "@/components/InviteAcceptForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({
    where: { token },
    select: { usedAt: true, expiresAt: true, createdBy: { select: { email: true } } },
  });

  if (!invite) {
    return <ErrorScreen message="존재하지 않는 초대 링크입니다." />;
  }
  if (invite.usedAt) {
    return <ErrorScreen message="이미 사용된 초대 링크입니다." />;
  }
  if (invite.expiresAt < new Date()) {
    return <ErrorScreen message="만료된 초대 링크입니다. 관리자에게 새 링크를 요청하세요." />;
  }

  return <InviteAcceptForm token={token} invitedBy={invite.createdBy.email} />;
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 text-center">
      <h1 className="text-xl font-bold">초대 링크 오류</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{message}</p>
    </main>
  );
}
