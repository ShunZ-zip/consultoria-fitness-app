import { addExerciseMedia, getExerciseMedia } from "../../../../../server/handlers4";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => getExerciseMedia(req, await ctx.params);
export const POST = async (req: Request, ctx: P) => addExerciseMedia(req, await ctx.params);
