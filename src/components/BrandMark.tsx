/* eslint-disable @next/next/no-img-element */
import { BRAND } from "@/lib/brand";

type Props = {
  /** "dark" = on onyx/charcoal backgrounds, "light" = on ivory/white. */
  tone?: "dark" | "light";
  size?: "sm" | "lg";
  /** Show the small "POS" tag after the wordmark. */
  showPosTag?: boolean;
  /** Show the "The Real Indian Kitchen" strapline under the wordmark (lg only). */
  showTagline?: boolean;
};

export function BrandMark({
  tone = "dark",
  size = "sm",
  showPosTag = true,
  showTagline = false,
}: Props) {
  const lg = size === "lg";
  const word = tone === "dark" ? "text-gold-light" : "text-cardamom";
  const tag =
    tone === "dark"
      ? "border-gold/40 text-gold-light"
      : "border-gold-dark/40 text-gold-dark";

  return (
    <span className={`inline-flex items-center ${lg ? "flex-col gap-3" : "gap-2.5"}`}>
      <img
        src="/brand/jk-mark.png"
        alt=""
        width={lg ? 88 : 30}
        height={lg ? 88 : 30}
        className={`${lg ? "w-[88px] h-[88px]" : "w-[30px] h-[30px]"} rounded-full shrink-0 shadow-[0_0_0_1px_rgba(201,161,74,0.25)]`}
      />
      <span className={`flex flex-col ${lg ? "items-center" : ""}`}>
        <span className="flex items-center gap-2">
          <span
            className={`font-display tracking-tight leading-none ${word} ${
              lg ? "text-3xl" : "text-lg"
            }`}
          >
            {BRAND.shortName}
          </span>
          {showPosTag && (
            <span
              className={`border rounded px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-[0.18em] ${tag}`}
            >
              POS
            </span>
          )}
        </span>
        {lg && showTagline && (
          <span
            className={`mt-2 font-display text-[11px] uppercase tracking-[0.32em] ${
              tone === "dark" ? "text-gold/80" : "text-gold-dark"
            }`}
          >
            {BRAND.tagline}
          </span>
        )}
      </span>
    </span>
  );
}
