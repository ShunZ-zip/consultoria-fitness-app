import { getTemplate } from "../../../../server/handlers";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => getTemplate(req, await ctx.params);
