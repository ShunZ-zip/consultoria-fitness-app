import { getThread, postMessage } from "../../../../server/handlers4";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => getThread(req, await ctx.params);
export const POST = async (req: Request, ctx: P) => postMessage(req, await ctx.params);
