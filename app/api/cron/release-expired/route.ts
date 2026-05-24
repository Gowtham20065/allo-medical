import { ApiError, json, toErrorResponse } from "@/lib/http";
import { releaseExpiredReservations } from "@/lib/reservation-service";

export const dynamic = "force-dynamic";

function assertCronSecret(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    return;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${configuredSecret}`) {
    throw new ApiError(401, "Invalid cron secret");
  }
}

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    const releasedCount = await releaseExpiredReservations();
    return json({ releasedCount });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const POST = GET;
