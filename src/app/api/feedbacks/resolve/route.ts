import { resolveFeedbacks } from "../../../../server/handlers9";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const POST = async (req: Request, ctx: P) => resolveFeedbacks(req, await ctx.params);
