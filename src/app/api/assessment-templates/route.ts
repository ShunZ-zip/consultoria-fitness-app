import { createAssessmentTemplate, listAssessmentTemplates } from "../../../server/handlers4";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listAssessmentTemplates(req, await ctx.params);
export const POST = async (req: Request, ctx: P) => createAssessmentTemplate(req, await ctx.params);
