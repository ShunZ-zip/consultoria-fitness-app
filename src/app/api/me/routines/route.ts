import { myRoutines } from "../../../../server/handlers11";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => myRoutines(req, await ctx.params);
