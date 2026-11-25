import { duplicateVersion } from "../../../../../server/handlers";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const POST = async (req: Request, ctx: P) => duplicateVersion(req, await ctx.params);
