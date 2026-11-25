import { changePlan } from "../../../../server/handlers5";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const POST = async (req: Request, ctx: P) => changePlan(req, await ctx.params);
