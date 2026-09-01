import { getSessionUserId, needsSetup } from "@/lib/auth";
import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  return Response.json({
    authenticated: (await getSessionUserId()) !== null,
    needsSetup: await needsSetup(),
  });
});
