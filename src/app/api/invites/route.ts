import { createInvite, listInvites } from "../../../server/handlers";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listInvites(req, await ctx.params);
export const POST = async (req: Request, ctx: P) => createInvite(req, await ctx.params);
