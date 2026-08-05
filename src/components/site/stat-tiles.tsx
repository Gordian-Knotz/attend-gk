import { cn } from "@/lib/utils";

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
          className={cn(
            "px-5 py-4 first:pl-0",
            i > 0 && "border-l border-border"
          )}
        >
          <div className="font-serif text-4xl leading-none">
            {tile.value}
            {tile.unit && <span className="text-primary">{tile.unit}</span>}
          </div>
          <div className="font-label mt-2 text-muted-foreground">
            {tile.label}
          </div>
        </div>
      ))}
    </div>
  );
}
