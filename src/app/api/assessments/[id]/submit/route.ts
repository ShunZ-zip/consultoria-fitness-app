import { submitAssessment } from "../../../../../server/handlers4";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const POST = async (req: Request, ctx: P) => submitAssessment(req, await ctx.params);
