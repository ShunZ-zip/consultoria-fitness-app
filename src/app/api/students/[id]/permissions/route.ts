import { getStudentPermissions, putStudentPermissions } from "../../../../../server/handlers";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => getStudentPermissions(req, await ctx.params);
export const PUT = async (req: Request, ctx: P) => putStudentPermissions(req, await ctx.params);
