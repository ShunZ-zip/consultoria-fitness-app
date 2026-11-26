import { myEngagement } from "../../../../server/handlers10";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => myEngagement(req, await ctx.params);
