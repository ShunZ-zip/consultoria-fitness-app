import { createRoutine, listRoutines } from "../../../../../server/handlers11";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listRoutines(req, await ctx.params);
export const POST = async (req: Request, ctx: P) => createRoutine(req, await ctx.params);
