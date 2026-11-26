import { listFavorites } from "../../../../server/handlers8";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listFavorites(req, await ctx.params);
