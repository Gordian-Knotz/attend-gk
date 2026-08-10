"use client";

import {
  UpdateType,
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from "@powersync/web";

import { createClient } from "@/lib/supabase/client";

/**
 * Bridges PowerSync to Supabase.
 *
 * Auth: PowerSync is configured with "Use Supabase Auth", so the Supabase
 * session's own access token is what it validates — no separate token
 * endpoint to build.
 *
 * Writes: local SQLite mutations queue as CRUD entries; this drains them
 * back to Postgres through PostgREST, so RLS still applies to every write
 * exactly as it does for an online client.
 */

/** Postgres error codes that will never succeed on retry. */
const FATAL_PG_CODES = new Set([
  "22P02", // invalid text representation — e.g. a malformed uuid
  "23502", // not-null violation
  "23503", // foreign key violation
  "23505", // unique violation
  "23514", // check constraint violation — includes the geofence trigger
  "42501", // insufficient privilege (RLS rejected the write)
]);

function pgCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  private supabase = createClient();

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const {
      data: { session },
      error,
    } = await this.supabase.auth.getSession();

    // A network blip must throw, not return null: null means "signed out"
    // and would tear down the sync connection.
    if (error) throw error;
    if (!session) return null;

    const endpoint = process.env.NEXT_PUBLIC_POWERSYNC_URL;
    if (!endpoint) {
      throw new Error(
        "NEXT_PUBLIC_POWERSYNC_URL isn't set — see README, 'Offline sync'."
      );
    }

    return {
      endpoint,
      token: session.access_token,
      expiresAt: session.expires_at
        ? new Date(session.expires_at * 1000)
        : undefined,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    for (const entry of transaction.crud) {
      const table = this.supabase.from(entry.table);

      try {
        let result;
        switch (entry.op) {
          case UpdateType.PUT:
            result = await table.upsert({ ...(entry.opData ?? {}), id: entry.id });
            break;
          case UpdateType.PATCH:
            // opData is optional on the type; an update with no changed
            // columns has nothing to send, so skip rather than issue an
            // empty PATCH that PostgREST would reject.
            if (!entry.opData || Object.keys(entry.opData).length === 0) {
              continue;
            }
            result = await table.update(entry.opData).eq("id", entry.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq("id", entry.id);
            break;
        }

        if (result.error) throw result.error;
      } catch (error: unknown) {
        const code = pgCode(error);

        // Discard writes Postgres will reject every time — a check-in that
        // failed the geofence trigger, for instance. Retrying forever would
        // wedge the queue and block every later punch behind it.
        //
        // Only THIS entry is dropped. The previous version completed the
        // whole transaction on the first fatal error, which silently
        // discarded every remaining entry too — so one out-of-fence punch
        // took all the valid punches queued behind it with it.
        if (code && FATAL_PG_CODES.has(code)) {
          console.error(
            `[powersync] discarding permanently rejected ${entry.op} on ` +
              `${entry.table} (${code})`,
            error
          );
          continue;
        }

        // Anything else is treated as transient — rethrow so PowerSync backs
        // off and retries the same transaction. `complete()` is deliberately
        // not called, so nothing in this transaction is lost.
        throw error;
      }
    }

    await transaction.complete();
  }
}
