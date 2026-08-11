# What changed — in plain terms

Written 11 August 2026, for whoever wants the short version. The full reasoning
lives in `context-sessions/13` and `context-sessions/14`; this file is just
what's different and what it means.

**The headline: the app is live.** It runs at
`web-production-c7d3e.up.railway.app`. Before this it only ran on a laptop.

---

## Added

**Tenant pages in your operator console.** In `/super` you could see a list of
every company using the product, but you couldn't open one. Now you can click a
company and see its sites with their geofences, its staff list with roles and
when each person last clocked in, how many people actually used the product in
the last 30 days, and a usage chart. The plan, billing and suspend controls live
on that page too.

**A sidebar on the staff dashboard.** Clock in, Shifts, History and Leave, with
the current section highlighted as you scroll. On a phone it becomes a bar across
the top instead.

**The Settings page actually works.** It used to be a placeholder saying "not
available yet". You can now rename your organization and edit a site's geofence —
its centre point and radius — which previously could only be created or deleted,
never corrected. It also shows your plan, your billing status, and the exact
times the system uses to decide "late" and "absent".

**A staff test account,** so the employee dashboard can be looked at without
guessing. Details at the bottom of this file.

**Two automated browser test suites.** One checks the public pages, one signs in
and checks the staff dashboard. They run in a real browser at three screen sizes
in both light and dark. They have already caught eight real bugs that passed
every other check.

**One new database migration (0012)** closing three security gaps. It has been
applied.

---

## Changed

**The product is called Activ-HR, not AttendPAC.** Every place a customer can
read it. Internal names — file names, colour variables, the offline storage key —
deliberately still say the old name, because renaming the storage key would throw
away any clock-ins sitting unsent on someone's phone.

**The landing page.**

- The client names ("Trusted by growing teams…") moved from just under the
  headline to just above the footer, and now scroll gently across the screen,
  pausing when you point at them. Near the top they were asking you to trust the
  product before the page had said what it does.
- The three "how staff clock in" cards were rebuilt. Hovering one now dusts it
  with colour from the centre outward.

**The company list in `/super` became navigation.** Plan and billing are now
labels there, not dropdowns, and the suspend button has gone from the table. All
three moved onto the company's own page. Suspending a company locks every one of
its employees out of the product, and a button that does that in the middle of a
crowded table row is a mis-click with a customer on the other end of it.

**Contact emails now come from one place** in the code rather than being typed
into five files, so changing the address is a one-line job.

---

## Removed

**The "Who sees what" roles table** from the landing page, and the footer link
that pointed at it — a link to a section that no longer exists is worse than no
link.

**A sync rule that could never have worked.** The offline-sync configuration
asked the server to send each employee's past clock-ins down to their phone, but
the phone's storage for that data is deliberately write-only, so every one of
those records would have been sent and immediately thrown away.

**An old chart component**, replaced by one that can draw any daily figure rather
than only signups.

---

## Fixed

These are worth reading. Several were live and none of them announced themselves.

**Sign-in and contact-form rate limiting could be walked straight past.** The
protection identified you by a piece of information the visitor's own browser
gets to set. Anyone who changed it on each attempt was effectively unlimited. So
the protection existed but did nothing against someone deliberately trying.

**Clock-ins could be lost or recorded out of order.** Three separate problems in
the offline queue: a temporary failure (bad signal, server hiccup) threw the
clock-in away instead of holding it to retry, which is the exact thing the queue
exists for; a new clock-in could jump ahead of older ones still waiting to send;
and after a reload the button could offer "Clock in" to someone already clocked
in.

**Anyone logged in could look up which site an employee at another company works
at.** A database helper meant for internal use was reachable directly and wasn't
checking that you and the person you asked about were in the same organization.

**The staff dashboard was broken on phones** — content pushed sideways off the
screen, names cut off mid-word, and a large orange bar down one side. It had been
like that since the sidebar was added, and nobody had seen it because nobody could
log in to look.

**Headings were invisible for anyone who turns off animations** in their
operating system, and the page reported errors while loading. Five separate
components had the same underlying mistake. It had been live for five days.

**The Settings page could lie about the rules.** It displayed the "late after"
and "absent from" times as fixed text, while the system read them from somewhere
else — so the two could drift apart and the page meant to show you the rules
would have shown you the wrong ones.

**A failed sign-out said nothing at all.** You'd be told you were signed out
while your session was still active — on a shared tablet, that hands the next
person your account.

**Database error messages were being shown to visitors,** including table and
column names. They're now logged for us and replaced with a plain message.

**A mistyped timezone setting would crash pages** instead of falling back to the
default.

**The contact form's error is now announced to screen readers,** and the landing
page has a proper main region so "skip to content" works.

---

## Not done yet

- **The operator console has still never been looked at in a browser.** The new
  company pages were checked with fake data; the real pages with real data need a
  super-admin login, which the test account doesn't have.
- **The support email address is a placeholder** (`hello@activ-hr.com`). The
  contact form's fallback and the suspension notice both point at it, so if that
  mailbox doesn't exist, those messages go nowhere.
- **Pilot enquiries from the website are saved but nobody can read them.** There's
  no screen for them yet.
- **Old enquiries are never deleted automatically.** The cleanup exists but isn't
  scheduled.
- **The landing page scores 72/100 for speed.** Not the images or the download
  size — the animations. Making it faster means having fewer of them, which is a
  look-and-feel decision rather than a fix.
- **Clocking in only works in Nairobi.** Every site in the database has its
  geofence there, and location is checked on the server, so the button will
  refuse from anywhere else. That's the feature working, not a bug.

---

## Seeing it for yourself

Staff dashboard: `https://web-production-c7d3e.up.railway.app/login`

```
staff.demo@pac.africa
```

The password was given separately and is deliberately not in this repository.

The account has a week of clock-ins, upcoming shifts and two leave requests
behind it, so every part of the screen has something real in it. One day is
deliberately a late arrival and one has no clock-out, so you can see how those
look.

Two things to expect: **the Clock in button will refuse** unless you're at Two
Rivers Mall in Nairobi, and **six sign-ins per 15 minutes** is the limit on one
email address — that's the rate limiting above, working.
