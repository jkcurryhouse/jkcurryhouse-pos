import { Allergen } from "@/lib/types";
import { allergenLabels } from "@/lib/mock-data";

export function AllergenTags({ allergens }: { allergens: Allergen[] }) {
  if (allergens.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {allergens.map((a) => (
        <span
          key={a}
          className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-chili/10 text-chili-dark border border-chili/20"
        >
          {allergenLabels[a] ?? a}
        </span>
      ))}
    </div>
  );
}
