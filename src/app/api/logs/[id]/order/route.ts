import { putOrder } from "../../../../../server/handlers";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const PUT = async (req: Request, ctx: P) => putOrder(req, await ctx.params);
