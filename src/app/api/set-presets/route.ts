import { createSetPreset, listSetPresets } from "../../../server/handlers8";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listSetPresets(req, await ctx.params);
export const POST = async (req: Request, ctx: P) => createSetPreset(req, await ctx.params);
