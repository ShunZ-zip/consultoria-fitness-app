import { getSettings, putSettings } from "../../../server/handlers";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => getSettings(req, await ctx.params);
export const PUT = async (req: Request, ctx: P) => putSettings(req, await ctx.params);
