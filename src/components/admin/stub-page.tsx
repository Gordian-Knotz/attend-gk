import { Construction } from "lucide-react";

export function StubPage({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-border px-6 py-24 text-center">
      <Construction className="size-6 text-muted-foreground" strokeWidth={1.5} />
      <p className="text-sm text-muted-foreground">
        {what} isn&apos;t wired up yet — this screen ships once the Supabase
        schema and auth are in place.
      </p>
    </div>
  );
}
