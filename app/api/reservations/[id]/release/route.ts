import { json, toErrorResponse } from "@/lib/http";
import { releaseReservation } from "@/lib/reservation-service";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    id: string;
  };
};

export async function POST(_request: Request, { params }: Params) {
  try {
    return json(await releaseReservation(params.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
