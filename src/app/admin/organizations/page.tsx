import { redirect } from "next/navigation";

/**
 * Superseded by `/super`.
 *
 * This was a read-only cross-org list living inside the `/admin` layout —
 * which is the layout built on the assumption that everything in it is
 * scoped to a single organization. The platform console now has its own
 * route segment and its own layout, and it can write as well as read.
 *
 * Kept as a redirect rather than deleted: the path is in the sidebar
 * history, in browser bookmarks, and in doc 03.
 */
export default async function OrganizationsRedirect() {
  redirect("/super");
}
