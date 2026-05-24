"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Loader2,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  TimerReset,
  Warehouse,
  XCircle
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch, formatMoney, makeIdempotencyKey } from "@/lib/client-api";
import type { ReservationView } from "@/lib/client-types";

type Props = {
  id: string;
};

function getRemainingSeconds(expiresAt: string) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export default function ReservationCheckout({ id }: Props) {
  const router = useRouter();
  const [reservation, setReservation] = useState<ReservationView | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState<"confirm" | "release" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReservation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ReservationView>(`/api/reservations/${id}`);
      setReservation(data);
      setRemainingSeconds(getRemainingSeconds(data.expiresAt));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load reservation"
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadReservation();
  }, [loadReservation]);

  useEffect(() => {
    if (!reservation || reservation.status !== "pending") {
      return;
    }

    const interval = window.setInterval(() => {
      setRemainingSeconds(getRemainingSeconds(reservation.expiresAt));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [reservation]);

  async function confirm() {
    setIsMutating("confirm");
    setError(null);
    try {
      const updated = await apiFetch<ReservationView>(
        `/api/reservations/${id}/confirm`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": makeIdempotencyKey("confirm")
          },
          body: JSON.stringify({})
        }
      );
      setReservation(updated);
      router.refresh();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Unable to confirm reservation"
      );
      await loadReservation();
    } finally {
      setIsMutating(null);
    }
  }

  async function release() {
    setIsMutating("release");
    setError(null);
    try {
      const updated = await apiFetch<ReservationView>(
        `/api/reservations/${id}/release`,
        {
          method: "POST",
          body: JSON.stringify({})
        }
      );
      setReservation(updated);
      router.refresh();
    } catch (releaseError) {
      setError(
        releaseError instanceof Error
          ? releaseError.message
          : "Unable to cancel reservation"
      );
      await loadReservation();
    } finally {
      setIsMutating(null);
    }
  }

  const statusMeta = useMemo(() => {
    if (reservation?.status === "confirmed") {
      return {
        label: "Confirmed",
        className: "bg-mint text-moss",
        icon: CheckCircle2
      };
    }

    if (reservation?.status === "released") {
      return {
        label: "Released",
        className: "bg-clay/10 text-clay",
        icon: XCircle
      };
    }

    return {
      label: "Pending",
      className: "bg-white text-ink",
      icon: Clock3
    };
  }, [reservation?.status]);

  const StatusIcon = statusMeta.icon;
  const canAct = reservation?.status === "pending";
  const expiryPercent = Math.max(0, Math.min(100, (remainingSeconds / 600) * 100));

  return (
    <main className="min-h-screen bg-cloud">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-7 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm transition hover:text-moss"
          >
            <ArrowLeft size={17} aria-hidden="true" />
            Products
          </Link>

          <div
            className={`inline-flex min-h-10 items-center gap-2 rounded-md border border-ink/10 px-3 py-2 text-sm font-semibold shadow-sm ${statusMeta.className}`}
          >
            <StatusIcon size={17} aria-hidden="true" />
            {statusMeta.label}
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-md border border-clay/30 bg-clay/10 p-4 text-sm font-medium text-clay">
            <AlertCircle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}

        {isLoading && !reservation ? (
          <div className="grid min-h-96 place-items-center rounded-md border border-dashed border-ink/20 bg-white/70 text-ink/60">
            <div className="flex items-center gap-3 text-sm font-medium">
              <Loader2 className="animate-spin" size={24} aria-hidden="true" />
              Loading reservation
            </div>
          </div>
        ) : null}

        {reservation ? (
          <section className="grid overflow-hidden rounded-md border border-ink/10 bg-white shadow-panel lg:grid-cols-[0.85fr_1.15fr]">
            <div className="relative min-h-80 bg-mint/30 lg:min-h-[520px]">
              <Image
                src={reservation.product.imageUrl}
                alt={reservation.product.name}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 42vw, 100vw"
                priority
              />
              <div className="absolute left-4 top-4 rounded-md bg-white/95 px-3 py-2 text-xs font-semibold uppercase text-ink shadow-sm">
                {reservation.product.sku}
              </div>
            </div>

            <div className="flex flex-col gap-6 p-6 sm:p-8">
              <div>
                <div className="inline-flex items-center gap-2 rounded-md bg-mint px-3 py-1.5 text-sm font-semibold text-moss">
                  <ShieldCheck size={16} aria-hidden="true" />
                  Inventory hold active
                </div>
                <p className="mt-5 text-sm font-medium uppercase text-ink/45">
                  Reservation {reservation.id.slice(-8)}
                </p>
                <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">
                  {reservation.product.name}
                </h1>
                <p className="mt-3 text-base leading-7 text-ink/65">
                  {reservation.quantity} unit from {reservation.warehouse.name},{" "}
                  {reservation.warehouse.city}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-ink/10 bg-cloud p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase text-ink/45">
                    <ReceiptText size={15} aria-hidden="true" />
                    Amount
                  </p>
                  <p className="mt-2 text-xl font-semibold text-ink">
                    {formatMoney(reservation.product.priceCents * reservation.quantity)}
                  </p>
                </div>
                <div className="rounded-md border border-ink/10 bg-cloud p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase text-ink/45">
                    <Warehouse size={15} aria-hidden="true" />
                    Warehouse
                  </p>
                  <p className="mt-2 text-xl font-semibold text-ink">
                    {reservation.warehouse.code}
                  </p>
                </div>
                <div className="rounded-md border border-ink/10 bg-cloud p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase text-ink/45">
                    <TimerReset size={15} aria-hidden="true" />
                    Expires in
                  </p>
                  <p className="mt-2 text-xl font-semibold text-ink">
                    {reservation.status === "pending"
                      ? formatCountdown(remainingSeconds)
                      : "Closed"}
                  </p>
                </div>
              </div>

              {reservation.status === "pending" ? (
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-moss transition-all duration-500"
                      style={{ width: `${expiryPercent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs font-medium text-ink/55">
                    Held until {new Date(reservation.expiresAt).toLocaleTimeString()}
                  </p>
                </div>
              ) : null}

              {remainingSeconds === 0 && reservation.status === "pending" ? (
                <div className="rounded-md border border-clay/30 bg-clay/10 p-4 text-sm font-medium text-clay">
                  This reservation has expired. Confirming now will return a 410 and
                  release the held unit.
                </div>
              ) : null}

              <div className="mt-auto flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={!canAct || isMutating !== null}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md bg-moss px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/45"
                >
                  {isMutating === "confirm" ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <PackageCheck size={18} />
                  )}
                  Confirm purchase
                </button>
                <button
                  type="button"
                  onClick={() => void release()}
                  disabled={reservation.status !== "pending" || isMutating !== null}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md border border-ink/15 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:border-clay hover:text-clay disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isMutating === "release" ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <XCircle size={18} />
                  )}
                  Cancel
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
