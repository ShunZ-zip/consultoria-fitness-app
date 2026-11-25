import { createTemplate, listTemplates } from "../../../server/handlers";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listTemplates(req, await ctx.params);
export const POST = async (req: Request, ctx: P) => createTemplate(req, await ctx.params);
