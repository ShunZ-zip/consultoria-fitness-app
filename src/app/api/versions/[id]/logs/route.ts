import { listLogs, startLog } from "../../../../../server/handlers";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listLogs(req, await ctx.params);
export const POST = async (req: Request, ctx: P) => startLog(req, await ctx.params);
