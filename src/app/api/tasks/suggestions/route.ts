import { acceptSuggestion, listSuggestions } from "../../../../server/handlers6";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listSuggestions(req, await ctx.params);
export const POST = async (req: Request, ctx: P) => acceptSuggestion(req, await ctx.params);
