import { resolveFeedback } from "../../../../../server/handlers9";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const POST = async (req: Request, ctx: P) => resolveFeedback(req, await ctx.params);
