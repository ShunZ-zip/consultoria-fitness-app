import { putMediaPreference } from "../../../../../server/handlers4";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const PUT = async (req: Request, ctx: P) => putMediaPreference(req, await ctx.params);
