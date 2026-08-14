import { Ban } from "lucide-react";

import { Callout } from "@/components/callout";
import { SignOutLink } from "@/components/auth/sign-out-link";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/brand";

/**
 * Shown instead of the app when an organization has been suspended from
 * `/super`.
 *
 * A suspension that only greys out a button is theatre — the data is still
 * one PostgREST call away. This blocks the rendered surfaces; the honest
 * caveat is that it is an *application* control, not a database one, so a
 * suspended org's members can still reach their own rows through the API
 * with a valid session. Closing that properly means adding a
 * `not suspended` predicate to the RLS policies, which is a bigger change
 * than this one and should be done before suspension is used against
 * anyone who might be motivated to go around it.
 */
export function OrgSuspended({
  orgName,
  reason,
}: {
  orgName: string;
  reason: string | null;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-sm bg-destructive text-destructive-foreground">
        <Ban className="size-6" />
      </span>

      <div>
        <h1 className="font-display text-3xl">
          {orgName} is <span className="italic text-primary">suspended</span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          Access is paused while this is sorted out. Nothing has been deleted —
          your staff, sites and attendance history are all intact and will be
          exactly as you left them.
        </p>
      </div>

      {reason && (
        <Callout variant="status" label="Reason" className="w-full text-left">
          {reason}
        </Callout>
      )}

      <p className="text-sm text-muted-foreground">
        Get in touch at{" "}
        <a className="text-primary underline" href={SUPPORT_MAILTO}>
          {SUPPORT_EMAIL}
        </a>{" "}
        and we&apos;ll restore it.
      </p>

      <SignOutLink />
    </div>
  );
}
