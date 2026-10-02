import { db, handle } from "@/lib/api";
import { connectionState, getBalance } from "@/lib/vidiq/client";
import { isVidiqError } from "@/lib/vidiq/errors";

export async function GET() {
  return handle(async () => {
    const connection = connectionState(db());
    if (connection.status !== "connected") return Response.json({ connection, balance: null });
    try {
      return Response.json({ connection, balance: await getBalance(db()) });
    } catch (error) {
      if (isVidiqError(error, "auth")) return Response.json({ connection: connectionState(db()), balance: null });
      return Response.json({ connection, balance: null, balanceError: (error as Error).message });
    }
  });
}
