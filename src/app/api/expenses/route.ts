import { createExpense, listExpenses } from "../../../server/handlers5";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listExpenses(req, await ctx.params);
export const POST = async (req: Request, ctx: P) => createExpense(req, await ctx.params);
