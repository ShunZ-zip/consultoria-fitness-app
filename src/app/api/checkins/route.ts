import { listCheckins } from "../../../server/handlers4";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listCheckins(req, await ctx.params);
