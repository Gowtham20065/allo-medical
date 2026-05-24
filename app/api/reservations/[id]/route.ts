import { json, toErrorResponse } from "@/lib/http";
import { getReservation } from "@/lib/reservation-service";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  try {
    return json(await getReservation(params.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
