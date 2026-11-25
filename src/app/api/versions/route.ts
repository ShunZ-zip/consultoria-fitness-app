import { createVersion, listVersions } from "../../../server/handlers";
export const dynamic = "force-dynamic";
type P = { params: Promise<Record<string, string>> };
export const GET = async (req: Request, ctx: P) => listVersions(req, await ctx.params);
export const POST = async (req: Request, ctx: P) => createVersion(req, await ctx.params);
