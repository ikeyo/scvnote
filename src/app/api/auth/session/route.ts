import { requireUser, needsSetup } from "@/lib/auth";
import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  // `requireUser` re-checks disabledAt in the DB, unlike a bare cookie check -
  // a disabled account should read as logged out even with a valid JWT
  const user = await requireUser().catch(() => null);
  return Response.json({
    authenticated: user !== null,
    isAdmin: user?.isAdmin ?? false,
    email: user?.email ?? null,
    needsSetup: await needsSetup(),
  });
});
