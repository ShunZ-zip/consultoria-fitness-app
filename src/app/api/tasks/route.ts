import { createTask, listTasks } from "../../../server/handlers6";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listTasks(req, await ctx.params);
export const POST = async (req: Request, ctx: P) => createTask(req, await ctx.params);
