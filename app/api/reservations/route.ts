import { json, toErrorResponse } from "@/lib/http";
import {
  createReservationTx,
  withIdempotency
} from "@/lib/reservation-service";
import { createReservationSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = createReservationSchema.parse(await request.json());
    const result = await withIdempotency(request, input, async (tx) => ({
      statusCode: 201,
      body: await createReservationTx(tx, input)
    }));

    return json(result.body, result.statusCode);
  } catch (error) {
    return toErrorResponse(error);
  }
}
