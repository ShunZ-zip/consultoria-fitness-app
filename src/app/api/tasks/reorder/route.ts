import { reorderTasks } from "../../../../server/handlers6";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const POST = async (req: Request, ctx: P) => reorderTasks(req, await ctx.params);
