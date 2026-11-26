import { setFavorite } from "../../../../../server/handlers8";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const PUT = async (req: Request, ctx: P) => setFavorite(req, await ctx.params);
