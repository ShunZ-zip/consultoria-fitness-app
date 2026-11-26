import { updateProfile } from "../../../../server/handlers12";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const PUT = async (req: Request, ctx: P) => updateProfile(req, await ctx.params);
