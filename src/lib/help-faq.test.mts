import { test } from "node:test";
import assert from "node:assert/strict";

import { searchFaq, STAFF_FAQ, ADMIN_FAQ } from "./help-faq.ts";

const ENTRIES = [
  { id: "a", question: "How do I check in?", keywords: ["check in", "checkin", "clock in"], answer: "Open /checkin." },
  { id: "b", question: "How do I request leave?", keywords: ["leave", "request", "time off", "vacation"], answer: "Use the leave form." },
  { id: "c", question: "What does tracked, no allowance mean?", keywords: ["tracked", "no allowance", "sick"], answer: "No policy is set for that type." },
];

test("an empty query returns every entry, unranked", () => {
  const results = searchFaq(ENTRIES, "");
  assert.equal(results.length, 3);
});

test("a query matching a keyword ranks that entry first", () => {
  const results = searchFaq(ENTRIES, "vacation");
  assert.equal(results[0].id, "b");
});

test("a query matching the question text also matches, not just keywords", () => {
  const results = searchFaq(ENTRIES, "check in");
  assert.equal(results[0].id, "a");
});

test("matching is case-insensitive", () => {
  const results = searchFaq(ENTRIES, "LEAVE");
  assert.equal(results[0].id, "b");
});

test("a query matching nothing returns an empty list, not every entry", () => {
  // Falling back to "show everything" on no match would make the search box
  // look broken — as if it never filtered at all.
  const results = searchFaq(ENTRIES, "salary advance");
  assert.equal(results.length, 0);
});

test("a query matching several entries returns all of them", () => {
  const entries = [
    { id: "x", question: "Sick leave", keywords: ["sick", "leave"], answer: "..." },
    { id: "y", question: "Annual leave", keywords: ["leave", "annual", "vacation"], answer: "..." },
  ];
  const results = searchFaq(entries, "leave");
  assert.equal(results.length, 2);
});

test("a two-word phrase ranks a whole-phrase keyword match above a single-word hit", () => {
  const entries = [
    { id: "phrase", question: "Check in", keywords: ["check in"], answer: "..." },
    { id: "partial", question: "Checklist", keywords: ["check"], answer: "..." },
  ];
  const results = searchFaq(entries, "check in");
  assert.equal(results[0].id, "phrase");
});

test("STAFF_FAQ and ADMIN_FAQ are both non-empty and every entry has an answer", () => {
  for (const entry of [...STAFF_FAQ, ...ADMIN_FAQ]) {
    assert.ok(entry.answer.length > 0, `${entry.id} has no answer`);
    assert.ok(entry.question.length > 0, `${entry.id} has no question`);
  }
  assert.ok(STAFF_FAQ.length > 0);
  assert.ok(ADMIN_FAQ.length > 0);
});

test("FAQ entry ids are unique within each set", () => {
  for (const set of [STAFF_FAQ, ADMIN_FAQ]) {
    const ids = set.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});
