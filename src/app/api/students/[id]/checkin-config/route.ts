import { getCheckinConfig, putCheckinConfig } from "../../../../../server/handlers4";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => getCheckinConfig(req, await ctx.params);
export const PUT = async (req: Request, ctx: P) => putCheckinConfig(req, await ctx.params);
