"use client";

import {
  AlertCircle,
  Boxes,
  Clock3,
  Loader2,
  MapPin,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
  ShoppingBag,
  Warehouse
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, formatMoney, makeIdempotencyKey } from "@/lib/client-api";
import type { ProductSummary } from "@/lib/client-types";

type ProductsResponse = {
  products: ProductSummary[];
};

type PendingSelection = {
  productId: string;
  warehouseId: string;
};

export default function ProductListing() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReserving, setIsReserving] = useState<PendingSelection | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadProducts() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ProductsResponse>("/api/products");
      setProducts(data.products);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load products");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  async function reserve(productId: string, warehouseId: string) {
    setError(null);
    setIsReserving({ productId, warehouseId });

    try {
      const reservation = await apiFetch<{ id: string }>("/api/reservations", {
        method: "POST",
        headers: {
          "Idempotency-Key": makeIdempotencyKey("reserve")
        },
        body: JSON.stringify({
          productId,
          warehouseId,
          quantity: 1
        })
      });

      router.push(`/reservations/${reservation.id}`);
    } catch (reserveError) {
      setError(
        reserveError instanceof Error ? reserveError.message : "Unable to reserve stock"
      );
      await loadProducts();
    } finally {
      setIsReserving(null);
    }
  }

  const totalAvailable = useMemo(
    () =>
      products.reduce(
        (sum, product) =>
          sum +
          product.warehouses.reduce(
            (warehouseSum, warehouse) => warehouseSum + warehouse.availableUnits,
            0
          ),
        0
      ),
    [products]
  );

  const totalReserved = useMemo(
    () =>
      products.reduce(
        (sum, product) =>
          sum +
          product.warehouses.reduce(
            (warehouseSum, warehouse) => warehouseSum + warehouse.reservedUnits,
            0
          ),
        0
      ),
    [products]
  );

  const warehouseCount = useMemo(() => {
    const ids = new Set<string>();
    products.forEach((product) =>
      product.warehouses.forEach((warehouse) => ids.add(warehouse.warehouseId))
    );
    return ids.size;
  }, [products]);

  return (
    <main className="min-h-screen bg-cloud">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-7 sm:px-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-mint px-3 py-1.5 text-sm font-semibold text-moss">
                <ShieldCheck size={16} aria-hidden="true" />
                Checkout reservation control
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-ink sm:text-5xl">
                Allo Inventory Reservations
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-ink/70">
                Multi-warehouse stock holds with live availability, expiry, and
                payment confirmation.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadProducts()}
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-moss hover:text-moss disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
              aria-label="Refresh inventory"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={17} />
              ) : (
                <RefreshCcw size={17} />
              )}
              Refresh inventory
            </button>
          </div>

          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-ink/10 bg-cloud p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase text-ink/50">
                <ShoppingBag size={15} aria-hidden="true" />
                Available units
              </dt>
              <dd className="mt-2 text-3xl font-semibold text-ink">{totalAvailable}</dd>
            </div>
            <div className="rounded-md border border-ink/10 bg-cloud p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase text-ink/50">
                <Clock3 size={15} aria-hidden="true" />
                Held units
              </dt>
              <dd className="mt-2 text-3xl font-semibold text-clay">{totalReserved}</dd>
            </div>
            <div className="rounded-md border border-ink/10 bg-cloud p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase text-ink/50">
                <Warehouse size={15} aria-hidden="true" />
                Warehouses
              </dt>
              <dd className="mt-2 text-3xl font-semibold text-moss">{warehouseCount}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-7 sm:px-8">
        {error ? (
          <div className="flex items-start gap-3 rounded-md border border-clay/30 bg-clay/10 p-4 text-sm font-medium text-clay">
            <AlertCircle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}

        <section className="grid gap-5 lg:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.id}
              className="overflow-hidden rounded-md border border-ink/10 bg-white shadow-panel"
            >
              <div className="relative aspect-[4/3] bg-mint/30">
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  priority={products[0]?.id === product.id}
                />
                <div className="absolute left-3 top-3 rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-semibold uppercase text-ink shadow-sm">
                  {product.sku}
                </div>
              </div>
              <div className="space-y-5 p-5">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-xl font-semibold text-ink">{product.name}</h2>
                    <span className="shrink-0 rounded-md bg-mint px-2.5 py-1.5 text-sm font-semibold text-moss">
                      {formatMoney(product.priceCents)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-ink/65">
                    {product.description}
                  </p>
                </div>

                <div className="space-y-3">
                  {product.warehouses.map((warehouse) => {
                    const selectionMatches =
                      isReserving?.productId === product.id &&
                      isReserving?.warehouseId === warehouse.warehouseId;
                    const unavailable = warehouse.availableUnits <= 0;
                    const total = Math.max(warehouse.totalUnits, 1);
                    const availablePercent = Math.max(
                      0,
                      Math.min(100, (warehouse.availableUnits / total) * 100)
                    );

                    return (
                      <div
                        key={warehouse.warehouseId}
                        className="rounded-md border border-ink/10 p-3 transition hover:border-moss/30"
                      >
                        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                              <MapPin size={14} className="shrink-0 text-moss" />
                              {warehouse.warehouseCode} / {warehouse.city}
                            </p>
                            <p className="mt-1 text-xs text-ink/55">
                              {warehouse.availableUnits} available /{" "}
                              {warehouse.reservedUnits} held / {warehouse.totalUnits} total
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void reserve(product.id, warehouse.warehouseId)}
                            disabled={unavailable || selectionMatches}
                            className="inline-flex min-h-10 min-w-24 items-center justify-center gap-2 rounded-md bg-moss px-3 py-2 text-sm font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/45"
                          >
                            {selectionMatches ? (
                              <Loader2 className="animate-spin" size={16} />
                            ) : (
                              <PackageCheck size={16} />
                            )}
                            Reserve
                          </button>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10">
                          <div
                            className="h-full rounded-full bg-moss"
                            style={{ width: `${availablePercent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          ))}
        </section>

        {isLoading && products.length === 0 ? (
          <div className="grid min-h-72 place-items-center rounded-md border border-dashed border-ink/20 bg-white/70 text-ink/60">
            <div className="flex items-center gap-3 text-sm font-medium">
              <Loader2 className="animate-spin" size={24} aria-hidden="true" />
              Loading live inventory
            </div>
          </div>
        ) : null}

        {!isLoading && products.length === 0 ? (
          <div className="grid min-h-72 place-items-center rounded-md border border-dashed border-ink/20 bg-white text-center">
            <div>
              <Boxes className="mx-auto text-ink/35" size={34} aria-hidden="true" />
              <p className="mt-3 font-semibold text-ink">No seeded inventory found</p>
              <p className="mt-1 text-sm text-ink/60">Run the seed command and refresh.</p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
