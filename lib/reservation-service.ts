import { Prisma, ReservationStatus } from "@prisma/client";
import { createHash } from "crypto";

import { ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { CreateReservationInput } from "@/lib/schemas";

type Tx = Prisma.TransactionClient;

type ApiResult = {
  statusCode: number;
  body: unknown;
};

const reservationTtlMinutes = Number(process.env.RESERVATION_TTL_MINUTES ?? 10);

function hashRequest(body: unknown) {
  return createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
}

function serializeForIdempotency<T>(body: T): T {
  return JSON.parse(JSON.stringify(body)) as T;
}

async function releaseExpiredReservationsTx(tx: Tx, now = new Date()) {
  const expired = await tx.reservation.findMany({
    where: {
      status: ReservationStatus.pending,
      expiresAt: { lte: now }
    },
    select: {
      id: true,
      productId: true,
      warehouseId: true,
      quantity: true
    }
  });

  for (const reservation of expired) {
    const released = await tx.reservation.updateMany({
      where: {
        id: reservation.id,
        status: ReservationStatus.pending
      },
      data: {
        status: ReservationStatus.released,
        releasedAt: now
      }
    });

    if (released.count === 1) {
      await tx.stockLevel.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId
          }
        },
        data: {
          reservedUnits: { decrement: reservation.quantity }
        }
      });
    }
  }

  return expired.length;
}

export async function releaseExpiredReservations() {
  return prisma.$transaction(
    (tx) => releaseExpiredReservationsTx(tx),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function withIdempotency(
  request: Request,
  body: unknown,
  action: (tx: Tx) => Promise<ApiResult>
) {
  const idempotencyKey = request.headers.get("Idempotency-Key");
  const method = request.method.toUpperCase();
  const path = new URL(request.url).pathname;
  const requestHash = hashRequest(body);

  return prisma.$transaction(
    async (tx) => {
      if (idempotencyKey) {
        const lockKey = `${method}:${path}:${idempotencyKey}`;
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${lockKey}))::text AS lock
        `;

        const existing = await tx.idempotencyRecord.findUnique({
          where: {
            key_method_path: {
              key: idempotencyKey,
              method,
              path
            }
          }
        });

        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new ApiError(
              409,
              "Idempotency-Key was already used with a different request body"
            );
          }

          return {
            statusCode: existing.statusCode,
            body: existing.response
          };
        }
      }

      const result = await action(tx);

      if (idempotencyKey) {
        await tx.idempotencyRecord.create({
          data: {
            key: idempotencyKey,
            method,
            path,
            requestHash,
            statusCode: result.statusCode,
            response: serializeForIdempotency(result.body) as Prisma.InputJsonValue
          }
        });
      }

      return result;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function listProducts() {
  await releaseExpiredReservations();

  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      stockLevels: {
        include: { warehouse: true },
        orderBy: { warehouse: { code: "asc" } }
      }
    }
  });

  return products.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    priceCents: product.priceCents,
    imageUrl: product.imageUrl,
    warehouses: product.stockLevels.map((stock) => ({
      warehouseId: stock.warehouseId,
      warehouseCode: stock.warehouse.code,
      warehouseName: stock.warehouse.name,
      city: stock.warehouse.city,
      totalUnits: stock.totalUnits,
      reservedUnits: stock.reservedUnits,
      availableUnits: stock.totalUnits - stock.reservedUnits
    }))
  }));
}

export async function listWarehouses() {
  return prisma.warehouse.findMany({
    orderBy: { code: "asc" }
  });
}

export async function createReservationTx(tx: Tx, input: CreateReservationInput) {
  await releaseExpiredReservationsTx(tx);

  const stock = await tx.stockLevel.findUnique({
    where: {
      productId_warehouseId: {
        productId: input.productId,
        warehouseId: input.warehouseId
      }
    },
    include: {
      product: true,
      warehouse: true
    }
  });

  if (!stock) {
    throw new ApiError(404, "No stock row exists for that product and warehouse");
  }

  const updatedRows = await tx.$executeRaw`
    UPDATE "StockLevel"
    SET "reservedUnits" = "reservedUnits" + ${input.quantity}, "updatedAt" = NOW()
    WHERE "productId" = ${input.productId}
      AND "warehouseId" = ${input.warehouseId}
      AND "totalUnits" - "reservedUnits" >= ${input.quantity}
  `;

  if (updatedRows !== 1) {
    throw new ApiError(409, "Not enough stock available to reserve those units", {
      availableUnits: stock.totalUnits - stock.reservedUnits
    });
  }

  const expiresAt = new Date(Date.now() + reservationTtlMinutes * 60_000);
  const reservation = await tx.reservation.create({
    data: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      expiresAt
    },
    include: {
      product: true,
      warehouse: true
    }
  });

  return {
    id: reservation.id,
    status: reservation.status,
    quantity: reservation.quantity,
    expiresAt: reservation.expiresAt,
    product: {
      id: reservation.product.id,
      sku: reservation.product.sku,
      name: reservation.product.name,
      priceCents: reservation.product.priceCents,
      imageUrl: reservation.product.imageUrl
    },
    warehouse: {
      id: reservation.warehouse.id,
      code: reservation.warehouse.code,
      name: reservation.warehouse.name,
      city: reservation.warehouse.city
    }
  };
}

export async function getReservation(id: string) {
  await releaseExpiredReservations();

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      product: true,
      warehouse: true
    }
  });

  if (!reservation) {
    throw new ApiError(404, "Reservation not found");
  }

  return {
    id: reservation.id,
    status: reservation.status,
    quantity: reservation.quantity,
    expiresAt: reservation.expiresAt,
    confirmedAt: reservation.confirmedAt,
    releasedAt: reservation.releasedAt,
    product: {
      id: reservation.product.id,
      sku: reservation.product.sku,
      name: reservation.product.name,
      priceCents: reservation.product.priceCents,
      imageUrl: reservation.product.imageUrl
    },
    warehouse: {
      id: reservation.warehouse.id,
      code: reservation.warehouse.code,
      name: reservation.warehouse.name,
      city: reservation.warehouse.city
    }
  };
}

export async function confirmReservationTx(tx: Tx, id: string) {
  const reservation = await tx.reservation.findUnique({
    where: { id },
    include: {
      product: true,
      warehouse: true
    }
  });

  if (!reservation) {
    throw new ApiError(404, "Reservation not found");
  }

  if (reservation.status === ReservationStatus.confirmed) {
    return {
      statusCode: 200,
      body: getReservationBody(reservation)
    };
  }

  if (reservation.status === ReservationStatus.released) {
    return {
      statusCode: 410,
      body: { error: "Reservation has already been released" }
    };
  }

  const now = new Date();
  if (reservation.expiresAt <= now) {
    await tx.reservation.update({
      where: { id },
      data: {
        status: ReservationStatus.released,
        releasedAt: now
      }
    });
    await tx.stockLevel.update({
      where: {
        productId_warehouseId: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId
        }
      },
      data: {
        reservedUnits: { decrement: reservation.quantity }
      }
    });
    return {
      statusCode: 410,
      body: { error: "Reservation has expired" }
    };
  }

  await tx.stockLevel.update({
    where: {
      productId_warehouseId: {
        productId: reservation.productId,
        warehouseId: reservation.warehouseId
      }
    },
    data: {
      totalUnits: { decrement: reservation.quantity },
      reservedUnits: { decrement: reservation.quantity }
    }
  });

  const confirmed = await tx.reservation.update({
    where: { id },
    data: {
      status: ReservationStatus.confirmed,
      confirmedAt: now
    },
    include: {
      product: true,
      warehouse: true
    }
  });

  return {
    statusCode: 200,
    body: getReservationBody(confirmed)
  };
}

export async function releaseReservation(id: string) {
  return prisma.$transaction(
    async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id },
        include: {
          product: true,
          warehouse: true
        }
      });

      if (!reservation) {
        throw new ApiError(404, "Reservation not found");
      }

      if (reservation.status === ReservationStatus.confirmed) {
        throw new ApiError(409, "Confirmed reservations cannot be released");
      }

      if (reservation.status === ReservationStatus.released) {
        return getReservationBody(reservation);
      }

      const released = await tx.reservation.update({
        where: { id },
        data: {
          status: ReservationStatus.released,
          releasedAt: new Date()
        },
        include: {
          product: true,
          warehouse: true
        }
      });

      await tx.stockLevel.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId
          }
        },
        data: {
          reservedUnits: { decrement: reservation.quantity }
        }
      });

      return getReservationBody(released);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

function getReservationBody(
  reservation: Prisma.ReservationGetPayload<{
    include: { product: true; warehouse: true };
  }>
) {
  return {
    id: reservation.id,
    status: reservation.status,
    quantity: reservation.quantity,
    expiresAt: reservation.expiresAt,
    confirmedAt: reservation.confirmedAt,
    releasedAt: reservation.releasedAt,
    product: {
      id: reservation.product.id,
      sku: reservation.product.sku,
      name: reservation.product.name,
      priceCents: reservation.product.priceCents,
      imageUrl: reservation.product.imageUrl
    },
    warehouse: {
      id: reservation.warehouse.id,
      code: reservation.warehouse.code,
      name: reservation.warehouse.name,
      city: reservation.warehouse.city
    }
  };
}
