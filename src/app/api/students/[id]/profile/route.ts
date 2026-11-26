import { getStudentProfile, updateStudentProfile } from "../../../../../server/handlers13";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => getStudentProfile(req, await ctx.params);
export const PUT = async (req: Request, ctx: P) => updateStudentProfile(req, await ctx.params);
