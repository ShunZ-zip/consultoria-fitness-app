import { resetPassword } from "../../../../server/handlers";
export const dynamic = "force-dynamic";
export const POST = async (req: Request) => resetPassword(req, {});
