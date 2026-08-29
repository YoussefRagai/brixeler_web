"use client";

import { useState } from "react";
import { Award, BadgeCheck, Bell, Check, ChevronRight, Globe2, LockKeyhole, Sparkles } from "lucide-react";

export type RewardPreviewKind = "tier" | "badge";

export type RewardPreviewData = {
  kind: RewardPreviewKind;
  name: string;
  nameAr?: string | null;
  description?: string | null;
  level?: number | null;
  badgeType?: string | null;
  benefit?: string | null;
  expiresInDays?: number | null;
};

export function RewardMobilePreview({ reward }: { reward: RewardPreviewData }) {
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const isArabic = language === "ar";
  const title = (isArabic ? reward.nameAr : reward.name)?.trim() || (isArabic ? "وسام جديد" : "New reward");
  const description =
    reward.description?.trim() ||
    (reward.kind === "tier"
      ? isArabic
        ? "استمر في التقدم لفتح المزايا التالية."
        : "Keep progressing to unlock your next benefits."
      : isArabic
        ? "إنجاز جديد يظهر الآن في ملفك."
        : "A new achievement is now part of your profile.");
  const benefit = reward.benefit?.trim() || (reward.kind === "tier" ? "+0.25% commission boost" : "Featured on your profile");
  const eyebrow = reward.kind === "tier" ? (isArabic ? "مستوى جديد" : "NEW TIER") : isArabic ? "وسام جديد" : "NEW BADGE";

  return (
    <section className="rounded-[1.5rem] border border-[#1d1e1a] bg-[#11120f] p-4 text-white shadow-[0_18px_40px_rgba(5,5,5,0.12)]" aria-labelledby="reward-mobile-preview-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[#dff579]">
            <Globe2 aria-hidden="true" size={14} />
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">Mobile preview</p>
          </div>
          <h3 id="reward-mobile-preview-heading" className="mt-1 text-sm font-semibold text-white">
            See the moment an agent earns it
          </h3>
        </div>
        <div className="flex rounded-full border border-white/15 bg-white/5 p-1" aria-label="Preview language">
          {(["en", "ar"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setLanguage(option)}
              aria-pressed={language === option}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                language === option ? "bg-[#dff579] text-[#11120f]" : "text-white/60 hover:text-white"
              }`}
            >
              {option === "en" ? "English" : "العربية"}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-4 w-full max-w-[252px] rounded-[2rem] border-[5px] border-[#30322c] bg-[#f4f5ee] p-2 text-[#11120f] shadow-[0_18px_0_rgba(0,0,0,0.15)]">
        <div className="rounded-[1.45rem] bg-[#f4f5ee] px-3 pb-4 pt-2" dir={isArabic ? "rtl" : "ltr"}>
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-[#11120f]/15" aria-hidden="true" />
          <div className="flex items-center justify-between text-[10px] font-semibold text-[#696c63]">
            <span>{isArabic ? "بريكسلر" : "BRIXELER"}</span>
            <Bell aria-hidden="true" size={13} />
          </div>
          <div className="mt-4 rounded-[1.1rem] bg-[#11120f] p-3 text-white">
            <div className="flex items-start justify-between gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dff579] text-[#11120f]">
                {reward.kind === "tier" ? <Award aria-hidden="true" size={22} /> : <BadgeCheck aria-hidden="true" size={22} />}
              </div>
              <span className="rounded-full border border-white/15 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#dff579]">
                {eyebrow}
              </span>
            </div>
            <p className="mt-3 text-[15px] font-semibold leading-tight">
              {title}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-white/65">{description}</p>
            {reward.kind === "tier" ? (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[9px] text-white/60">
                  <span>{isArabic ? `المستوى ${reward.level ?? 1}` : `Level ${reward.level ?? 1}`}</span>
                  <span>{isArabic ? "الخطوة التالية" : "Next step"}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-white/15">
                  <div className="h-1.5 w-3/4 rounded-full bg-[#dff579]" />
                </div>
              </div>
            ) : null}
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/10 px-2.5 py-2 text-[10px] text-white/80">
              <Sparkles aria-hidden="true" size={12} className="shrink-0 text-[#dff579]" />
              <span>{benefit}</span>
            </div>
            <span className="mt-3 flex w-full items-center justify-center gap-1 rounded-full bg-[#dff579] py-2 text-[10px] font-bold text-[#11120f]">
              {isArabic ? "عرض ملفي" : "View my profile"}
              <ChevronRight aria-hidden="true" size={12} className={isArabic ? "rotate-180" : ""} />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-center gap-1 text-[9px] text-[#8a8d83]">
            <LockKeyhole aria-hidden="true" size={10} />
            {isArabic ? "مرئي لك وللفريق" : "Visible to you and your team"}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-4 text-white/65">
        <Check aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-[#dff579]" />
        <span>
          {reward.expiresInDays
            ? `The preview includes a ${reward.expiresInDays}-day renewal reminder.`
            : "The preview uses the saved bilingual name and benefit copy."}
        </span>
      </div>
    </section>
  );
}
