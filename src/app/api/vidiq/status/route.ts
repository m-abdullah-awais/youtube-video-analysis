import { db, handle, requestLocale } from "@/lib/api";
import { errorText } from "@/lib/i18n/errors";
import { connectionState, getBalance } from "@/lib/vidiq/client";
import { isVidiqError } from "@/lib/vidiq/errors";

export async function GET(request: Request) {
  return handle(request, async () => {
    const connection = connectionState(db());
    if (connection.status !== "connected") return Response.json({ connection, balance: null });
    try {
      return Response.json({ connection, balance: await getBalance(db()) });
    } catch (error) {
      if (isVidiqError(error, "auth")) return Response.json({ connection: connectionState(db()), balance: null });
      const message = isVidiqError(error) && error.key ? errorText(requestLocale(request), error.key) : (error as Error).message;
      return Response.json({ connection, balance: null, balanceError: message });
    }
  });
}
