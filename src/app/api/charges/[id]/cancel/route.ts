import { cancelCharge } from "../../../../../server/handlers5";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const POST = async (req: Request, ctx: P) => cancelCharge(req, await ctx.params);
