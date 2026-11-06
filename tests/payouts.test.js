import { test } from "node:test";
import assert from "node:assert/strict";
import { demoPayouts, demoLedger } from "../app/payouts/demoData.js";
import { reconcilePayouts } from "../app/payouts/reconcile.js";

const today = new Date("2026-11-05T00:00:00Z");
const report = () => reconcilePayouts(demoPayouts(today), demoLedger(today), { today });
const byType = (type) => report().findings.filter((f) => f.type === type);

test("net amount is gross minus fees, refunds and chargebacks", () => {
  const p = demoPayouts(today).find((x) => x.id === "1001");
  assert.equal(p.net.amount, 4548.43);
});

test("finds the four expected exceptions", () => {
  const types = report().findings.map((f) => f.type).sort();
  assert.deepEqual(types, ["AMOUNT_MISMATCH", "DUPLICATE_DEPOSIT", "MISSING_DEPOSIT", "UNMATCHED_DEPOSIT"]);
});

test("missing deposit is payout 1003 for the full net amount", () => {
  const [f] = byType("MISSING_DEPOSIT");
  assert.equal(f.payout.id, "1003");
  assert.equal(f.amount, 5695.35);
});

test("amount mismatch is payout 1004, $25 short", () => {
  const [f] = byType("AMOUNT_MISMATCH");
  assert.equal(f.payout.id, "1004");
  assert.equal(f.difference, -25);
});

test("duplicate deposit is payout 1007 and counts the extra amount once", () => {
  const [f] = byType("DUPLICATE_DEPOSIT");
  assert.equal(f.payout.id, "1007");
  assert.equal(f.ledger.length, 2);
  assert.equal(f.amount, 1283.11);
});

test("unmatched Shopify deposit is $412.10", () => {
  const [f] = byType("UNMATCHED_DEPOSIT");
  assert.equal(f.amount, 412.1);
});

test("clean payouts match and the in-transit payout is just waiting", () => {
  const s = report().summary;
  assert.equal(s.matched, 3);
  assert.equal(s.waiting, 1);
  assert.equal(s.exceptions, 4);
  assert.equal(s.payouts_checked, 6);
});

test("non-Shopify bank rows are ignored", () => {
  const ids = report().findings.flatMap((f) => f.ledger.map((r) => r.description));
  assert.ok(!ids.some((d) => /BIRCH|GRANITE|ADOBE|LEASE/.test(d)));
});
