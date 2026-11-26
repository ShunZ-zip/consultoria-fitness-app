import { deleteTask, updateTask } from "../../../../server/handlers6";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const PUT = async (req: Request, ctx: P) => updateTask(req, await ctx.params);
export const DELETE = async (req: Request, ctx: P) => deleteTask(req, await ctx.params);
