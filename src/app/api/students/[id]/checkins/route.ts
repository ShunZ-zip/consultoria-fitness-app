import { listStudentCheckins } from "../../../../../server/handlers4";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listStudentCheckins(req, await ctx.params);
