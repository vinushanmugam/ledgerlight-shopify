// Demo data shaped like Shopify Payments payouts, plus the bank rows each payout should produce.
// Dates are offsets from "today" so the demo never goes stale.
// Used only when a store has no Shopify Payments account (like a dev store).

const DAY = 86400000;
const isoDay = (today, offset) =>
  new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) + offset * DAY)
    .toISOString()
    .slice(0, 10);
const money = (n) => Math.round(n * 100) / 100;

// issued = days before today. bank = [[daysBeforeToday, amountAdjustment]] rows the bank received.
// An empty bank list means the money never arrived; two rows means it arrived twice.
const SCENARIOS = [
  { id: "1001", issued: -21, status: "PAID", gross: 4820.5, fees: 152.07, refunds: 120, chargebacks: 0, orders: 41, bank: [[-20, 0]] },
  { id: "1002", issued: -14, status: "PAID", gross: 3150.0, fees: 98.23, refunds: 0, chargebacks: 0, orders: 28, bank: [[-13, 0]] },
  // Never arrived at the bank:
  { id: "1003", issued: -9, status: "PAID", gross: 6210.75, fees: 205.4, refunds: 310, chargebacks: 0, orders: 52, bank: [] },
  // Arrived $25 short (a bank fee, hold or reserve):
  { id: "1004", issued: -7, status: "PAID", gross: 2480.0, fees: 77.91, refunds: 0, chargebacks: 150, orders: 19, bank: [[-6, -25]] },
  { id: "1005", issued: -4, status: "PAID", gross: 1890.2, fees: 59.22, refunds: 0, chargebacks: 0, orders: 17, bank: [[-3, 0]] },
  // Still on its way, so not an exception yet:
  { id: "1006", issued: -1, status: "IN_TRANSIT", gross: 2750.0, fees: 86.4, refunds: 0, chargebacks: 0, orders: 23, bank: [] },
  // Deposited twice:
  { id: "1007", issued: -16, status: "PAID", gross: 1325.0, fees: 41.89, refunds: 0, chargebacks: 0, orders: 11, bank: [[-15, 0], [-14, 0]] },
];

// Bank credits and debits that have nothing to do with a given payout.
const OTHER_BANK_ROWS = [
  [-11, 412.1, "SHOPIFY PAYOUT 0993"], // a Shopify deposit with no payout behind it
  [-18, 450.0, "ACH CREDIT BIRCH STUDIO"],
  [-8, 1200.0, "WIRE IN GRANITE PARTNERS"],
  [-12, -2000.0, "ACH DEBIT OFFICE LEASE LLC"],
  [-5, -189.0, "CARD PURCHASE ADOBE SYSTEMS"],
];

const netOf = (s) => money(s.gross - s.fees - s.refunds - s.chargebacks);

export function demoPayouts(today = new Date()) {
  return SCENARIOS.map((s) => ({
    id: s.id,
    issuedAt: isoDay(today, s.issued),
    status: s.status,
    currency: "USD",
    gross: s.gross,
    fees: s.fees,
    refunds: s.refunds,
    chargebacks: s.chargebacks,
    orders: s.orders,
    net: { amount: netOf(s), currencyCode: "USD" },
  }));
}

export function demoLedger(today = new Date()) {
  const rows = [];
  for (const s of SCENARIOS) {
    for (const [offset, adjust] of s.bank) {
      rows.push({ date: isoDay(today, offset), amount: money(netOf(s) + adjust), description: `SHOPIFY PAYOUT ${s.id}` });
    }
  }
  for (const [offset, amount, description] of OTHER_BANK_ROWS) {
    rows.push({ date: isoDay(today, offset), amount, description });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows.map((r, i) => ({ id: i, ...r }));
}
