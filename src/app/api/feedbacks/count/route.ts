import { feedbackCount } from "../../../../server/handlers9";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => feedbackCount(req, await ctx.params);
