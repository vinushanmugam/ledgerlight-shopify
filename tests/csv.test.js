import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseAmount, parseDate, parseBankCsv, parseShopifyTransactionsCsv } from "../app/payouts/csv.js";
import { reconcilePayouts } from "../app/payouts/reconcile.js";

test("parseCsv handles quotes, commas inside quotes, and a BOM", () => {
  const rows = parseCsv('﻿a,b\n"x, y","say ""hi"""\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'say "hi"']]);
});

test("parseAmount understands dollars, commas and brackets", () => {
  assert.equal(parseAmount("$1,234.50"), 1234.5);
  assert.equal(parseAmount("(25.00)"), -25);
  assert.equal(parseAmount("-7.1"), -7.1);
  assert.equal(parseAmount("abc"), null);
});

test("parseDate accepts common formats", () => {
  assert.equal(parseDate("2026-10-26"), "2026-10-26");
  assert.equal(parseDate("2026-10-26 14:03:11 -0700"), "2026-10-26");
  assert.equal(parseDate("10/26/2026"), "2026-10-26");
  assert.equal(parseDate("1/5/26"), "2026-01-05");
  assert.equal(parseDate("nonsense"), null);
});

test("bank file with one Amount column", () => {
  const { rows, skipped } = parseBankCsv("Date,Description,Amount\n2026-10-20,SHOPIFY PAYOUT 1,100.00\nbad,row,x\n");
  assert.equal(rows.length, 1);
  assert.equal(skipped, 1);
  assert.equal(rows[0].amount, 100);
});

test("bank file with separate Debit and Credit columns", () => {
  const { rows } = parseBankCsv("Posting Date,Memo,Debit,Credit\n10/20/2026,Rent,2000.00,\n10/21/2026,SHOPIFY,,450.25\n");
  assert.deepEqual(rows.map((r) => r.amount), [-2000, 450.25]);
});

test("bank file without a date or amount gives a clear error", () => {
  const { error } = parseBankCsv("Foo,Bar\n1,2\n");
  assert.match(error, /couldn't find date and amount/);
});

const SHOPIFY = `Transaction Date,Type,Order,Card Brand,Card Source,Payout Status,Payout Date,Available On,Amount,Fee,Net
2026-10-24,charge,#1,visa,online,Deposited,2026-10-26,2026-10-26,1000.00,32.00,968.00
2026-10-24,charge,#2,visa,online,Deposited,2026-10-26,2026-10-26,500.00,17.00,483.00
2026-10-25,refund,#1,visa,online,Deposited,2026-10-26,2026-10-26,-100.00,0.00,-100.00
2026-10-30,charge,#3,visa,online,Pending,,,200.00,6.00,194.00
`;

test("Shopify transactions are grouped into one payout with a breakdown", () => {
  const { payouts, error } = parseShopifyTransactionsCsv(SHOPIFY);
  assert.equal(error, undefined);
  assert.equal(payouts.length, 1); // the pending row is not in a payout
  const [p] = payouts;
  assert.equal(p.issuedAt, "2026-10-26");
  assert.equal(p.status, "PAID");
  assert.equal(p.gross, 1500);
  assert.equal(p.fees, 49);
  assert.equal(p.refunds, 100);
  assert.equal(p.net.amount, 1351);
});

test("wrong Shopify file gives a clear error", () => {
  const { error } = parseShopifyTransactionsCsv("A,B\n1,2\n");
  assert.match(error, /Missing columns/);
});

test("uploaded files flow through the engine", () => {
  const today = new Date("2026-11-05T00:00:00Z");
  const { payouts } = parseShopifyTransactionsCsv(SHOPIFY);
  const bank = parseBankCsv("Date,Description,Amount\n2026-10-27,SHOPIFY PAYOUT,1351.00\n").rows;
  assert.equal(reconcilePayouts(payouts, bank, { today }).summary.exceptions, 0);
  const none = reconcilePayouts(payouts, [], { today });
  assert.equal(none.findings[0].type, "MISSING_DEPOSIT");
});

test("payouts named by date read naturally in explanations", () => {
  const today = new Date("2026-11-05T00:00:00Z");
  const { payouts } = parseShopifyTransactionsCsv(SHOPIFY);
  const [f] = reconcilePayouts(payouts, [], { today }).findings;
  assert.equal(f.explanation, "The 2026-10-26 payout of $1,351.00 has no matching deposit in the bank after 3 days.");
});

import { parsePayoutSummaryCsv, parsePayoutsFile } from "../app/payouts/csv.js";

const SUMMARY = `payout_reference,expected_arrival,status,amount,currency
DEMO-PAYOUT-001,2026-11-02,Paid,1245.80,USD
DEMO-PAYOUT-002,2026-11-03,Paid,876.25,USD
DEMO-PAYOUT-003,2026-11-04,Failed,432.10,USD
DEMO-PAYOUT-004,2026-11-06,In transit,1598.40,USD
DEMO-PAYOUT-005,2026-11-09,Scheduled,963.75,USD
`;

test("a simple payout list is read, and statuses are mapped", () => {
  const { payouts, error } = parsePayoutSummaryCsv(SUMMARY);
  assert.equal(error, undefined);
  assert.deepEqual(payouts.map((p) => p.status), ["PAID", "PAID", "FAILED", "IN_TRANSIT", "SCHEDULED"]);
  assert.equal(payouts[0].id, "DEMO-PAYOUT-001");
  assert.equal(payouts[0].net.amount, 1245.8);
});

test("the right reader is chosen for each kind of file", () => {
  assert.equal(parsePayoutsFile(SUMMARY).payouts.length, 5);
  assert.equal(parsePayoutsFile(SHOPIFY).payouts.length, 1);
});

test("a failed payout is flagged, and the bank file can still pair the others", () => {
  const today = new Date("2026-11-05T00:00:00Z");
  const { payouts } = parsePayoutSummaryCsv(SUMMARY);
  const bank = parseBankCsv("Date,Description,Amount\n2026-11-03,SHOPIFY PAYOUT,1245.80\n2026-11-04,SHOPIFY PAYOUT,850.00\n").rows;
  const r = reconcilePayouts(payouts, bank, { today });
  assert.deepEqual(r.findings.map((f) => f.type), ["FAILED_PAYOUT", "AMOUNT_MISMATCH"]);
  assert.equal(r.findings[0].amount, 432.1);
  assert.equal(r.findings[1].difference, -26.25);
  assert.equal(r.summary.matched, 1);
  assert.equal(r.summary.waiting, 2);
});

test("a payouts file with no date or amount gives a clear error", () => {
  const { error } = parsePayoutSummaryCsv("Foo,Bar\n1,2\n");
  assert.match(error, /couldn't find date, status and amount/);
});

test("a bank statement put in the payouts box is refused with a helpful message", () => {
  const { payouts, error } = parsePayoutsFile("Date,Description,Amount\n2026-11-03,SHOPIFY PAYOUT,1245.80\n");
  assert.equal(payouts.length, 0);
  assert.match(error, /looks like a bank statement/);
});

test("a ShopifyQL export (day, payout_amount) is read as payouts, skipping empty days", () => {
  const { payouts, error } = parsePayoutsFile("day,payout_amount\n2026-10-26,1351.00\n2026-10-27,0.00\n2026-10-28,\"$2,000.50\"\n");
  assert.equal(error, undefined);
  assert.deepEqual(payouts.map((p) => [p.issuedAt, p.net.amount, p.status]), [["2026-10-26", 1351, "PAID"], ["2026-10-28", 2000.5, "PAID"]]);
});

test("every exception comes with a next step", () => {
  const today = new Date("2026-11-05T00:00:00Z");
  const { payouts } = parsePayoutsFile("day,payout_amount\n2026-10-26,1351.00\n");
  const [f] = reconcilePayouts(payouts, [], { today }).findings;
  assert.match(f.suggestion, /bank account/);
});
