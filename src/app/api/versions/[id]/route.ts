import { getVersion, updateDraft } from "../../../../server/handlers";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => getVersion(req, await ctx.params);
export const PUT = async (req: Request, ctx: P) => updateDraft(req, await ctx.params);
