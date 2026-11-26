import { updateRoutine } from "../../../../server/handlers11";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const PUT = async (req: Request, ctx: P) => updateRoutine(req, await ctx.params);
