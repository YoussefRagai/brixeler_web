"use client";

import { Calculator, Columns2, GitCompare, Heart } from "lucide-react";
import { useCallback } from "react";

type PropertyListingCardProps = {
  propertyId: string;
  heroImageUrl?: string | null;
  projectName: string;
  propertyType: string;
  propertySize: number | string;
  price: number | string;
  finishing: string;
  downPayment: string;
  installments: string;
  isFavorite?: boolean;
  isCompareActive?: boolean;
  loading?: boolean;
  error?: string | null;
  onCardClick?: (propertyId: string) => void;
  onOpenLayout?: (propertyId: string) => void;
  onToggleCompare?: (propertyId: string) => void;
  onToggleFavorite?: (propertyId: string) => void;
  onOpenCalculator?: (payload: {
    propertyId: string;
    price: number | string;
    downPayment: string;
    installments: string;
  }) => void;
};

const formatCurrency = (value: number | string) => {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(numeric);
};

export function PropertyListingCard({
  propertyId,
  heroImageUrl,
  projectName,
  propertyType,
  propertySize,
  price,
  finishing,
  downPayment,
  installments,
  isFavorite = false,
  isCompareActive = false,
  loading = false,
  error = null,
  onCardClick,
  onOpenLayout,
  onToggleCompare,
  onToggleFavorite,
  onOpenCalculator,
}: PropertyListingCardProps) {
  const handleCardClick = useCallback(() => {
    if (loading || error) return;
    onCardClick?.(propertyId);
  }, [loading, error, onCardClick, propertyId]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardClick();
    }
  };

  const stop = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${projectName} listing details`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className="relative rounded-2xl border border-black/5 bg-white p-4 shadow-[0_10px_25px_-20px_rgba(0,0,0,0.45)] outline-none transition hover:-translate-y-0.5 hover:shadow-[0_20px_35px_-24px_rgba(0,0,0,0.55)] focus-visible:ring-2 focus-visible:ring-black/40"
    >
      <div className="relative overflow-hidden rounded-xl bg-slate-100">
        <div className="aspect-[16/9] w-full">
          {loading ? (
            <div className="h-full w-full animate-pulse bg-slate-200" />
          ) : heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroImageUrl}
              alt={`${projectName} hero`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-sm text-slate-500">
              No image available
            </div>
          )}
        </div>
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <button
            type="button"
            aria-label="Open layout gallery"
            onClick={(event) => {
              stop(event);
              onOpenLayout?.(propertyId);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40"
          >
            <Columns2 size={18} />
          </button>
          <button
            type="button"
            aria-label={isCompareActive ? "Remove from compare" : "Add to compare"}
            onClick={(event) => {
              stop(event);
              onToggleCompare?.(propertyId);
            }}
            className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 ${
              isCompareActive ? "ring-2 ring-black/50" : ""
            }`}
          >
            <GitCompare size={18} />
          </button>
          <button
            type="button"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            onClick={(event) => {
              stop(event);
              onToggleFavorite?.(propertyId);
            }}
            className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40 ${
              isFavorite ? "text-rose-500" : ""
            }`}
          >
            <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <div className="grid gap-x-3 gap-y-2 pt-3 text-sm sm:grid-cols-2">
        <DetailItem label="Project name" value={projectName} />
        <DetailItem label="Finishing" value={finishing} />
        <DetailItem label="Property type" value={propertyType} />
        <DetailItem label="Down payment" value={downPayment} />
        <DetailItem label="Property size" value={`${propertySize} m²`} />
        <DetailItem label="Installments" value={installments} />
        <DetailItem label="Price" value={formatCurrency(price)} />
        {error ? <DetailItem label="Status" value={error} tone="error" /> : null}
      </div>

      <button
        type="button"
        aria-label="Open payment calculator"
        onClick={(event) => {
          stop(event);
          onOpenCalculator?.({ propertyId, price, downPayment, installments });
        }}
        className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-black text-white shadow-lg transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40"
      >
        <Calculator size={18} />
      </button>
    </div>
  );
}

function DetailItem({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "error";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-normal uppercase tracking-[0.2em] text-slate-500">
        {label}
      </span>
      <span
        className={`text-sm font-semibold ${
          tone === "error" ? "text-rose-500" : "text-slate-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
