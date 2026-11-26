import { rejectSuggestion } from "../../../../../server/handlers7";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const POST = async (req: Request, ctx: P) => rejectSuggestion(req, await ctx.params);
