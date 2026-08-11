import Link from "next/link";

import { Callout } from "@/components/callout";

export default function OrgNotFound() {
  return (
    <div className="flex flex-col gap-6">
      <Callout variant="note" label="No such organization">
        That organization doesn&apos;t exist, or it has been deleted.{" "}
        <Link href="/super" className="text-primary underline">
          Back to the platform overview
        </Link>
        .
      </Callout>
    </div>
  );
}
