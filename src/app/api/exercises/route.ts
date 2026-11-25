import { listExercises } from "../../../server/handlers";
import { createExercise } from "../../../server/handlers4";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listExercises(req, await ctx.params);
export const POST = async (req: Request, ctx: P) => createExercise(req, await ctx.params);
