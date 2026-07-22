import { flavorSwatchOptions } from "@/lib/calc/color";
import { cn } from "@/lib/utils";

export function SwatchPicker({
  flavorIndex,
  onSelect,
}: {
  flavorIndex: number;
  onSelect: (flavorIndex: number) => void;
}) {
  return (
    <div className="mb-3.5 flex items-center gap-1.5">
      <span className="mr-0.5 text-[11px] text-muted-foreground">테마색</span>
      {flavorSwatchOptions(flavorIndex).map((opt) => (
        <button
          key={opt.flavorIndex}
          type="button"
          onClick={() => onSelect(opt.flavorIndex)}
          className={cn(
            "size-[18px] shrink-0 rounded-full ring-offset-1",
            opt.selected && "ring-2 ring-foreground/40 ring-offset-1",
          )}
          style={{ background: opt.color }}
          aria-label={`테마색 ${opt.flavorIndex + 1}`}
        />
      ))}
    </div>
  );
}
