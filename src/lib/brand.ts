/**
 * Product and vendor identity, in one place.
 *
 * Renamed from AttendPAC to Activ-HR on 10 Aug 2026. The rename is
 * deliberately **user-visible only** — the DS-01 design tokens keep their
 * `--pac-*` names, as do the `attendpac` package name, `attendpac.db` and the
 * `attendpac:offline-queue` localStorage key. That last one matters: renaming
 * it would orphan any punches queued on a device that hasn't synced yet, so
 * it stays until there's a read-both-keys migration to go with it.
 *
 * Everything below is what a customer can read. Import from here rather than
 * writing the strings inline, so the next rename is one file.
 */

export const PRODUCT_NAME = "Activ-HR";

/**
 * TODO — confirm the real mailbox. This address is a placeholder standing in
 * for the old `hello@pac.africa`, chosen so nothing shipped with the previous
 * brand on it. It is used as the contact form's fallback and for suspension
 * enquiries, so if it does not receive mail, enquiries go nowhere — which is
 * the exact failure doc 11 recorded for the old timeout-and-pretend contact
 * form. Change it here and it changes everywhere.
 */
export const SUPPORT_EMAIL = "hello@activ-hr.com";

export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

/** Footer attribution line. */
export const VENDOR_LINE = "Activ-HR · Gordian Knotz Technovation · Confidential";
