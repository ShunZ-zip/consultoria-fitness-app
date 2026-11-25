import { putLoggedSet } from "../../../../../../server/handlers";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const PUT = async (req: Request, ctx: P) => putLoggedSet(req, await ctx.params);
