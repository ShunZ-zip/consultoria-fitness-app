import { deleteSetPreset } from "../../../../server/handlers8";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const DELETE = async (req: Request, ctx: P) => deleteSetPreset(req, await ctx.params);
