/**
 * Scripted answers for the in-app help widget — not an LLM call.
 *
 * That was the one open decision on this feature (see the design note in
 * `HelpChatWidget`); scripted was chosen because it ships with no API key,
 * no provider account, and no per-message cost to decide on, and because
 * nothing here needs judgment — every question below has one correct,
 * static answer that lives in this file, not in a model that might
 * paraphrase it wrong. Swapping in a real LLM later is a change to how a
 * query is answered, not to how it's asked; this module's shape survives it.
 *
 * Pure and import-free, like `leave-balance.ts`, so the matching itself is
 * testable under `node --test` with no database and no browser.
 */

export type FaqEntry = {
  id: string;
  question: string;
  /** Extra terms the question text itself doesn't contain. */
  keywords: string[];
  answer: string;
};

/**
 * Scores every entry against `query` and returns the matches, best first.
 *
 * An empty query returns every entry, unranked — that's the widget's
 * opening state, not a search result. Any other query that matches nothing
 * returns an empty list: falling back to "show everything" would make the
 * search box look broken, as if it silently ignored what was typed.
 */
export function searchFaq(entries: FaqEntry[], query: string): FaqEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return entries;

  const terms = trimmed.split(/\s+/).filter(Boolean);

  const scored = entries
    .map((entry) => {
      const haystacks = [entry.question.toLowerCase(), ...entry.keywords.map((k) => k.toLowerCase())];
      let score = 0;
      for (const term of terms) {
        for (const haystack of haystacks) {
          if (haystack.includes(term)) score += haystack === term ? 3 : 1;
        }
      }
      // The whole query as one phrase, not just its terms — "check in"
      // should outscore two separate single-word hits on "check" and "in".
      if (haystacks.some((h) => h.includes(trimmed))) score += 2;
      return { entry, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => s.entry);
}

export const STAFF_FAQ: FaqEntry[] = [
  {
    id: "check-in",
    question: "How do I check in or out?",
    keywords: ["check in", "checkin", "clock in", "clock out", "punch"],
    answer:
      "Open /checkin from your phone at your site — it needs to see you're within the geofence. Checking in and out are the same button; it alternates.",
  },
  {
    id: "late",
    question: "When does a check-in count as late?",
    keywords: ["late", "cutoff", "on time"],
    answer:
      "A check-in after the org's late cutoff is marked late rather than present. Your admin can tell you the exact time on /admin/settings.",
  },
  {
    id: "request-leave",
    question: "How do I request leave?",
    keywords: ["leave", "request", "time off", "vacation", "annual", "sick"],
    answer:
      'Go to "Leave" in your dashboard and use the "Request leave" button. Pick a type, a start and end date, and a manager or admin decides it.',
  },
  {
    id: "leave-balance",
    question: "How is my leave balance worked out?",
    keywords: ["balance", "remaining", "granted", "days left"],
    answer:
      "Calendar days, inclusive, minus weekends and public holidays — only approved requests reduce it. Pending requests show separately so you don't double-book the same days. The exact rule is printed under your balance on the Leave page.",
  },
  {
    id: "tracked-no-allowance",
    question: "What does \"tracked, no allowance\" mean?",
    keywords: ["tracked", "no allowance", "sick"],
    answer:
      "Your organization hasn't set a yearly limit for that leave type (sick leave often isn't limited). Days you take are still counted, but there's no number to run out of.",
  },
  {
    id: "cancel-leave",
    question: "Can I cancel a leave request?",
    keywords: ["cancel", "withdraw", "undo"],
    answer:
      "Only while it's still pending — ask your manager or admin to help if it's already been decided.",
  },
  {
    id: "who-approves",
    question: "Who approves my leave request?",
    keywords: ["approve", "decide", "manager", "admin"],
    answer:
      "Your site's manager, or an organization admin. Nobody — including an admin — can approve their own request.",
  },
  {
    id: "reset-password",
    question: "I forgot my password.",
    keywords: ["password", "forgot", "reset", "login", "sign in"],
    answer: "Use \"Forgot password\" on the sign-in page (/login) — it emails you a reset link.",
  },
  {
    id: "contact-support",
    question: "This didn't answer my question.",
    keywords: ["support", "contact", "help", "human", "email"],
    answer: "__SUPPORT_EMAIL__",
  },
];

export const ADMIN_FAQ: FaqEntry[] = [
  {
    id: "grant-leave",
    question: "How do I set a leave policy or grant this year's entitlements?",
    keywords: ["policy", "grant", "entitlement", "allowance"],
    answer:
      `On Settings, set each leave type's annual days and carry-over, then use "Grant entitlements" — it's safe to press more than once; it never overwrites an entitlement you've adjusted by hand.`,
  },
  {
    id: "approve-leave",
    question: "How do I approve or reject a leave request?",
    keywords: ["approve", "reject", "decide", "leave"],
    answer:
      "On Leave, use the buttons next to a pending request. A manager can only decide for their own site; nobody can decide their own request.",
  },
  {
    id: "billing-seats",
    question: "How are billable seats counted?",
    keywords: ["billing", "seat", "invoice", "price", "amount"],
    answer:
      "Every staff member and manager who overlapped the billing period at all — never an org admin or the vendor. There's no proration: joining or leaving mid-period still bills the whole period. See Billing for this month's count and amount.",
  },
  {
    id: "record-payment",
    question: "How do I pay an invoice?",
    keywords: ["pay", "payment", "mpesa", "invoice"],
    answer:
      "On Billing, record the M-Pesa transaction code and phone number against the invoice that's due. That records the attempt — it doesn't move money — and we confirm it before the invoice shows as paid.",
  },
  {
    id: "attendance-calendar",
    question: "How do I see one employee's attendance?",
    keywords: ["attendance", "calendar", "employee", "present", "absent"],
    answer:
      "On Attendance, pick anyone from the roster to see their month as a calendar — present days are unmarked, late/absent/on-leave days get a small dot.",
  },
  {
    id: "add-staff",
    question: "How do I add or remove staff?",
    keywords: ["invite", "add staff", "remove staff", "roster"],
    answer: "On Staff, use \"Invite\" to add someone and the roster row's remove icon to take them off.",
  },
  {
    id: "change-plan",
    question: "How do I change our plan or billing status?",
    keywords: ["plan", "upgrade", "downgrade", "billing status"],
    answer: "__SUPPORT_EMAIL__",
  },
  {
    id: "contact-support-admin",
    question: "This didn't answer my question.",
    keywords: ["support", "contact", "help", "human", "email"],
    answer: "__SUPPORT_EMAIL__",
  },
];
