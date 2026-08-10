import { cn } from "@/lib/utils";
import { StatValue } from "@/components/site/stat-value";

type Tile = {
  value: string;
  unit?: string;
  label: string;
};

export function StatTiles({
  tiles,
  className,
}: {
  tiles: Tile[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 border-t-2 border-foreground md:grid-cols-4",
        className
      )}
    >
      {tiles.map((tile, i) => (
        <div
          key={tile.label}
          // At the 2-column mobile stage `i > 0` put a left border on
          // tiles 2 and 3 — i.e. on the first tile of the second row, where
          // there is nothing to its left — and no rule between the rows.
          className={cn(
            "px-5 py-4 first:pl-0",
            i % 2 === 1 && "border-l border-border",
            i >= 2 && "border-t border-border",
            i > 0 && "md:border-l md:border-border",
            i >= 2 && "md:border-t-0"
          )}
        >
          <div className="font-serif text-4xl leading-none tabular-nums">
            <StatValue value={tile.value} unit={tile.unit} />
          </div>
          <div className="font-label mt-2 text-muted-foreground">
            {tile.label}
          </div>
        </div>
      ))}
    </div>
  );
}
