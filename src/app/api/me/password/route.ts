import { changePassword } from "../../../../server/handlers12";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const POST = async (req: Request, ctx: P) => changePassword(req, await ctx.params);
