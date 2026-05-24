# Allo Inventory Reservations

Checkout-time inventory reservations for multi-warehouse retail. The app lets a shopper reserve one unit from a specific warehouse, then confirm the purchase or cancel the hold before it expires.

## Tech Stack

- Next.js App Router and TypeScript
- Prisma with hosted Postgres
- Zod for request validation
- Tailwind CSS for the UI

## Data Model

The core tables are:

- `Product` and `Warehouse`
- `StockLevel`, keyed by `(productId, warehouseId)`, with `totalUnits` and `reservedUnits`
- `Reservation`, with `pending`, `confirmed`, and `released` states plus `expiresAt`
- `IdempotencyRecord`, keyed by `(Idempotency-Key, method, path)`

Available stock is always computed as:

```txt
availableUnits = totalUnits - reservedUnits
```

Pending reservations increase `reservedUnits`. Confirmed reservations decrease both `totalUnits` and `reservedUnits`. Released or expired reservations decrease `reservedUnits`.

## Local Setup

Create a hosted Postgres database in Supabase, Neon, Railway, or another provider and set:

```bash
cp .env.example .env
```

Fill in:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
RESERVATION_TTL_MINUTES=10
CRON_SECRET="change-me"
```

Install dependencies, migrate, seed, and run:

```bash
npm install
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Open `http://localhost:3000`.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/products` | Lists products and available stock per warehouse |
| `GET` | `/api/warehouses` | Lists warehouses |
| `POST` | `/api/reservations` | Reserves units, returns `409` when stock is unavailable |
| `GET` | `/api/reservations/:id` | Fetches a reservation for the checkout page |
| `POST` | `/api/reservations/:id/confirm` | Confirms the reservation, returns `410` when expired |
| `POST` | `/api/reservations/:id/release` | Releases a pending reservation |
| `GET` or `POST` | `/api/cron/release-expired` | Releases expired pending reservations |

## Concurrency Guarantee

The reserve endpoint does not read available stock in application code and then update later. It performs a single guarded Postgres update inside a serializable transaction:

```sql
UPDATE "StockLevel"
SET "reservedUnits" = "reservedUnits" + $quantity
WHERE "productId" = $productId
  AND "warehouseId" = $warehouseId
  AND "totalUnits" - "reservedUnits" >= $quantity
```

If two requests race for the last unit, Postgres serializes the row update. Exactly one update can affect one row. The loser affects zero rows and receives `409 Not enough stock available`.

Confirmation and release also run in serializable transactions. Confirming a pending reservation decrements both `totalUnits` and `reservedUnits`; releasing decrements only `reservedUnits`.

## Idempotency

`POST /api/reservations` and `POST /api/reservations/:id/confirm` support an `Idempotency-Key` header.

Implementation details:

- The server hashes the request body and stores the original status code and JSON response.
- The unique key is `(key, method, path)`.
- A Postgres advisory transaction lock serializes concurrent retries using the same key.
- Reusing the same key with a different request body returns `409`.
- Reusing the same key with the same request returns the original response without applying the side effect again.

The release endpoint is naturally safe for repeated calls because releasing an already released reservation returns the released state.

## Expiry in Production

This implementation uses lazy cleanup plus a cron-compatible endpoint.

Lazy cleanup runs before product reads and reservation mutations. That means expired holds are released as soon as normal traffic touches inventory.

For production, configure Vercel Cron to call:

```txt
/api/cron/release-expired
```

Send:

```txt
Authorization: Bearer $CRON_SECRET
```

A one-minute cron cadence is enough for this demo. At larger scale, I would move this into a queue-backed worker that processes reservations by `expiresAt` and records metrics for late release lag.

## Deployment

1. Push this repo to GitHub.
2. Create a hosted Postgres database.
3. Add `DATABASE_URL`, `RESERVATION_TTL_MINUTES`, and `CRON_SECRET` to Vercel.
4. Run migrations against the hosted database:

```bash
npm run prisma:deploy
npm run prisma:seed
```

5. Deploy the app on Vercel.
6. Add a Vercel Cron schedule for `/api/cron/release-expired`.

## Trade-offs

- The demo reserves one unit at a time from the UI, while the API supports larger quantities.
- Idempotency records do not expire yet. In production I would add a retention policy or scheduled cleanup.
- The stock counter is intentionally simple. For auditability at scale, I would add an append-only inventory ledger and derive counters from ledger snapshots.
- The cron endpoint is enough for this exercise. A background worker would provide better observability and tighter release timing under low traffic.
