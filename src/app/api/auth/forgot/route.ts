import { forgotPassword } from "../../../../server/handlers";
export const dynamic = "force-dynamic";
export const POST = async (req: Request) => forgotPassword(req, {});
