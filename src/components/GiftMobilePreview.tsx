"use client";

import { useState } from "react";
import { ArrowUpRight, Gift, Sparkles } from "lucide-react";

export function GiftMobilePreview({
  title,
  titleAr,
  description,
  cta,
  terms,
  iconUrl,
}: {
  title: string;
  titleAr?: string;
  description?: string;
  cta?: string;
  terms?: string;
  iconUrl?: string | null;
}) {
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const isArabic = language === "ar";
  const displayTitle = isArabic ? titleAr?.trim() || title : title || "Your reward";
  const displayDescription = description?.trim() || (isArabic ? "مكافأة مختارة لك" : "A considered reward for your work.");

  return (
    <section className="rounded-3xl border border-black/10 bg-[#f4f1e9] p-4" aria-labelledby="gift-mobile-preview-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
            <Sparkles aria-hidden="true" size={13} />
            Mobile preview
          </div>
          <h4 id="gift-mobile-preview-title" className="mt-1 text-sm font-semibold text-[#111]">
            See the moment an agent receives it
          </h4>
        </div>
        <div className="inline-flex rounded-full border border-black/10 bg-white p-1" role="group" aria-label="Preview language">
          <button
            type="button"
            onClick={() => setLanguage("en")}
            aria-pressed={language === "en"}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${language === "en" ? "bg-black text-white" : "text-neutral-600"}`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLanguage("ar")}
            aria-pressed={language === "ar"}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${language === "ar" ? "bg-black text-white" : "text-neutral-600"}`}
          >
            العربية
          </button>
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-[310px] rounded-[2rem] border-[7px] border-[#171717] bg-[#fbfbfa] p-2 shadow-xl shadow-black/15">
        <div className="flex items-center justify-between rounded-t-[1.4rem] bg-[#111] px-4 py-3 text-[10px] text-white/70">
          <span>9:41</span>
          <span className="font-semibold tracking-[0.18em] text-white">BRIXELER</span>
          <span aria-hidden="true">•••</span>
        </div>
        <div dir={isArabic ? "rtl" : "ltr"} className="px-3 pb-4 pt-5 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{isArabic ? "هديتك الجديدة" : "A new reward"}</p>
          <div className="mt-3 overflow-hidden rounded-2xl bg-[#111] text-white">
            <div data-dashboard-surface="dark" className="relative flex min-h-24 items-end overflow-hidden bg-[radial-gradient(circle_at_78%_12%,#e8bd6b,transparent_40%),linear-gradient(135deg,#191919,#3b372e)] p-4">
              {iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={iconUrl} alt="" className="absolute right-3 top-3 h-12 w-12 rounded-xl object-cover opacity-90" />
              ) : (
                <Gift aria-hidden="true" size={25} className="absolute right-4 top-4 text-[#e8bd6b]" />
              )}
              <div>
                <p className="text-[10px] font-medium text-white/60">Brixeler Growth</p>
                <h5 className="mt-1 line-clamp-2 max-w-[190px] text-lg font-semibold leading-tight">{displayTitle}</h5>
              </div>
            </div>
            <div className="bg-white px-4 py-4 text-[#111]">
              <p className="line-clamp-3 text-xs leading-5 text-neutral-600">{displayDescription}</p>
              <span aria-hidden="true" className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#111] px-4 py-2.5 text-xs font-semibold text-white">
                {cta?.trim() || (isArabic ? "استفد من الهدية" : "View reward")}
                <ArrowUpRight aria-hidden="true" size={14} />
              </span>
              <p className="mt-3 line-clamp-2 text-[10px] leading-4 text-neutral-400">{terms?.trim() || (isArabic ? "تطبق الشروط والأحكام." : "Terms apply. Limited availability.")}</p>
            </div>
          </div>
        </div>
      </div>
      <p className="mx-auto mt-3 max-w-[310px] text-center text-[11px] leading-5 text-neutral-500">
        Illustrative mobile state · copy is shown in {isArabic ? "Arabic" : "English"}.
      </p>
    </section>
  );
}
