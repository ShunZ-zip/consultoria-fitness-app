import { setRoutineStatus } from "../../../../../server/handlers11";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const POST = async (req: Request, ctx: P) => setRoutineStatus(req, await ctx.params);
