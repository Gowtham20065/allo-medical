import { json, toErrorResponse } from "@/lib/http";
import { listWarehouses } from "@/lib/reservation-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ warehouses: await listWarehouses() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
