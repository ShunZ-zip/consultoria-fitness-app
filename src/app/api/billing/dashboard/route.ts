import { dashboard } from "../../../../server/handlers5";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => dashboard(req, await ctx.params);
