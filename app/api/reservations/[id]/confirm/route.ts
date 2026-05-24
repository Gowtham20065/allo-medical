import { json, toErrorResponse } from "@/lib/http";
import {
  confirmReservationTx,
  withIdempotency
} from "@/lib/reservation-service";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: Params) {
  try {
    const result = await withIdempotency(request, { id: params.id }, async (tx) =>
      confirmReservationTx(tx, params.id)
    );

    return json(result.body, result.statusCode);
  } catch (error) {
    return toErrorResponse(error);
  }
}
