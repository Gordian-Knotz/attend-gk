"use client";

import * as React from "react";
import { PowerSyncDatabase } from "@powersync/web";
import { PowerSyncContext } from "@powersync/react";

import { AppSchema } from "./schema";
import { SupabaseConnector } from "./connector";

/**
 * Boots the local SQLite database and keeps it connected.
 *
 * Client-only by necessity — the Web SDK needs IndexedDB, Web Workers and
 * WASM, none of which exist in Node. There's no SSR benefit to chase here:
 * the whole point is that reads come off the device.
 *
 * Held as a module singleton so React Strict Mode's double-invoke in
 * development doesn't open two SQLite connections to the same file.
 */
let dbInstance: PowerSyncDatabase | null = null;

function getDatabase(): PowerSyncDatabase {
  if (!dbInstance) {
    dbInstance = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: "attendpac.db" },
    });
  }
  return dbInstance;
}

export function PowerSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const configured = Boolean(process.env.NEXT_PUBLIC_POWERSYNC_URL);

  const db = React.useMemo(
    () => (configured ? getDatabase() : null),
    [configured]
  );

  React.useEffect(() => {
    if (!db) return;

    const connector = new SupabaseConnector();
    db.connect(connector).catch((error) => {
      // Never fatal: the online path still works, so a failed sync
      // connection should degrade rather than blank the page.
      console.error("[powersync] connect failed", error);
    });

    return () => {
      void db.disconnect();
    };
  }, [db]);

  // Not configured yet — render the app untouched so the online-only build
  // keeps working before a PowerSync instance exists.
  if (!db) return <>{children}</>;

  return (
    <PowerSyncContext.Provider value={db}>
      {children}
    </PowerSyncContext.Provider>
  );
}
