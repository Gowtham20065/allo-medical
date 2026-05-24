import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return json({ error: error.message, details: error.details }, error.statusCode);
  }

  if (error instanceof ZodError) {
    return json({ error: "Invalid request body", details: error.flatten() }, 400);
  }

  console.error(error);
  return json({ error: "Internal server error" }, 500);
}
