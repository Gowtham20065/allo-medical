# Allo Inventory Reservations

Checkout-time inventory reservations for multi-warehouse retail. The app lets a shopper reserve one unit from a specific warehouse, then confirm the purchase or cancel the hold before it expires.

## Tech Stack

- Next.js App Router and TypeScript
- Prisma with hosted Postgres
- Zod for request validation
- Tailwind CSS for the UI

## Local Setup

### Prerequisites

- Node.js 18+ and npm
- A hosted Postgres database (Supabase, Neon, Railway, or similar)

### Step 1: Configure Environment Variables

Create a local `.env` file by copying the template:

```bash
cp .env.example .env
```

Then fill in the required variables:

```bash
# Supabase pooled connection for app queries (uses PgBouncer for connection pooling).
DATABASE_URL="postgresql://USER:PASSWORD@POOLER_HOST:6543/postgres?pgbouncer=true"

# Supabase direct database connection for Prisma migrations (bypasses PgBouncer).
DIRECT_URL="postgresql://USER:PASSWORD@DIRECT_HOST:5432/postgres"

# How long reservations remain pending before expiring (in minutes).
RESERVATION_TTL_MINUTES=10

# Secret for authorizing cron job requests from Vercel.
CRON_SECRET="change-me-to-a-random-string"
```

**Important:** The `DATABASE_URL` uses a pooled connection (PgBouncer) for fast query execution, while `DIRECT_URL` is a direct connection required by Prisma for migrations.

### Step 2: Install Dependencies and Setup Database

```bash
npm install
npm run prisma:migrate  # Run migrations to create tables
npm run prisma:seed    # Populate sample products, warehouses, and stock levels
npm run dev            # Start the development server
```

### Step 3: Access the App

Open your browser and navigate to `http://localhost:3000`.

## Expiry Mechanism

### How It Works

The reservation system uses a **lazy cleanup + scheduled cron** approach for expiring reservations:

1. **Lazy Cleanup**: When a user performs any action that reads inventory (e.g., viewing products), expired pending reservations are automatically released before the stock levels are computed. This ensures stale holds don't artificially reduce available inventory.

   ```typescript
   // In product listing and reservation mutations:
   await releaseExpiredReservations();  // Cleanup first, then proceed
   ```

2. **Scheduled Cron Job**: To ensure expired reservations are cleaned up even during low-traffic periods, a background cron job runs periodically to release all expired pending reservations.

### Production Configuration

For production deployment on Vercel, configure a cron schedule to call:

```bash
GET/POST /api/cron/release-expired?authorization=Bearer%20$CRON_SECRET
```

**Headers:**
```
Authorization: Bearer $CRON_SECRET
```

Recommended cadence: **1 minute** for this demo. The cron job:
- Finds all pending reservations where `expiresAt <= NOW()`
- Updates them to `released` state in a single transaction
- Decrements `reservedUnits` accordingly
- Returns the count of released reservations

### Why This Design?

- **Fault-tolerant**: Even if cron fails or is delayed, lazy cleanup ensures correctness during user actions
- **Simple**: No external job queue or worker infrastructure needed for a demo
- **Fast**: Most expiry cleanup happens naturally with user traffic
- **Observable**: The cron endpoint provides visibility into cleanup operations

### At Scale

For a production system at higher throughput, I would:
- Move cleanup to a **dedicated background worker** (e.g., AWS Lambda, Bull queue with Redis)
- Process reservations **by batch** using the `expiresAt` index
- Record **metrics**: cleanup latency, count of late releases, reprocessing attempts
- Implement **prioritization**: process reservations closest to expiry first
- Add **dead letter queue**: handle stuck reservations separately

## Trade-offs & Future Improvements

### Current Decisions

1. **Single Unit Reservations in UI**
   - The frontend only reserves one unit at a time, even though the API supports arbitrary quantities.
   - **Trade-off**: Simpler UI/UX, but less flexible for wholesale or bulk purchase flows.
   - **Future**: Would add quantity selection if supporting B2B or bulk orders.

2. **Simple Stock Counter**
   - Stock levels are stored as simple counters: `totalUnits` and `reservedUnits`.
   - **Trade-off**: Fast queries and easy to reason about, but no audit trail of inventory changes.
   - **Future**: Implement an **append-only inventory ledger** that records every stock movement (receive, reserve, confirm, release, adjustment). Derive current counters from ledger snapshots for auditability and debugging.

3. **Eager Idempotency Records**
   - Idempotency records are persisted indefinitely in the database.
   - **Trade-off**: Simple implementation, but the table grows unbounded.
   - **Future**: Add a **retention policy** (e.g., keep records for 24 hours) with automatic cleanup scheduled via cron.

4. **Lazy Expiry Cleanup + Cron**
   - Lazy cleanup on user traffic + periodic cron job instead of a dedicated worker.
   - **Trade-off**: No external infrastructure, but cleanup timing depends on traffic patterns. Low-traffic periods may delay expiry by up to the cron interval.
   - **Future**: Move to a **message queue-backed worker** (e.g., Redis with Bull, AWS SQS + Lambda) for:
     - Guaranteed cleanup within seconds
     - Better metrics and alerting
     - Decoupling from request-response cycles

5. **No Distributed Transaction Guarantees Beyond Postgres**
   - If a reserve request succeeds but the response is lost, the client may retry and create a duplicate pending reservation.
   - **Trade-off**: Mitigated by idempotency keys, but idempotency records themselves are not replicated across regions.
   - **Future**: For multi-region deployment, use **Postgres logical replication** or an external idempotency service (e.g., Supabase with read replicas).

6. **No Monitoring or Alerting**
   - The system logs operations but has no real-time alerts for inventory anomalies or cron failures.
   - **Future**: Add:
     - Prometheus metrics (reservation count, expiry lag, cron execution time)
     - Structured logging to a log aggregation service (e.g., Datadog, CloudWatch)
     - Alerts for late cron runs or failed migrations

7. **Authorization is Minimal**
   - Cron jobs are authenticated only by a shared secret header.
   - **Trade-off**: Simple, but not suitable for multi-tenant systems.
   - **Future**: Implement proper RBAC with JWT tokens or OAuth for API endpoints if multi-user access is needed.

### Architectural Considerations

- **Serializable transactions** ensure correctness under high concurrency, but may cause transaction aborts under extreme contention. A future implementation could use optimistic locking (version numbers) for less strict isolation if throughput becomes a bottleneck.
- **PgBouncer pooling** is essential for Postgres connection limits, but introduces slight latency. Connection pooling could be optimized per request type (read-only vs. write).
- **Zod validation** is comprehensive but adds some runtime overhead. For ultra-high throughput, consider JIT-compiled validation or schema compilation.

### If You Had More Time

1. **Implement Kafka-based inventory events** for downstream systems (analytics, replication, webhooks).
2. **Add GraphQL API** alongside REST for more flexible client queries.
3. **Multi-region deployment** with active-active Postgres replicas and conflict resolution.
4. **Real-time WebSocket updates** so clients see stock changes instantly.
5. **Inventory forecast integration** to recommend hold durations and stock reorder points.
6. **Admin dashboard** for monitoring reservations, stock levels, and cron health.
7. **Load testing** to validate concurrent reserve limits and measure P99 latency.
