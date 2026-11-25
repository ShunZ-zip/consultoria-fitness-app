import { acceptInvite } from "../../../../../server/handlers";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const POST = async (req: Request, ctx: P) => acceptInvite(req, await ctx.params);
