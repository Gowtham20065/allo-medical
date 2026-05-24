import { json, toErrorResponse } from "@/lib/http";
import { listProducts } from "@/lib/reservation-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ products: await listProducts() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
