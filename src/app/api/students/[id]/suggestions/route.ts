import { listStudentSuggestions } from "../../../../../server/handlers7";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listStudentSuggestions(req, await ctx.params);
