// The matching engine: compares Shopify payouts with bank deposits.
// It does all the arithmetic and detection, so an AI model never has to calculate amounts.
// Pure functions with no Shopify or database calls, so they are easy to test.

const DAY = 86400000;
const money = (n) => Math.round(n * 100) / 100;
const dayNumber = (isoDate) => Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY);
const todayNumber = (d) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY);
const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const SHOPIFY = /shopify/i;
// Shopify's export has no payout ID, so uploaded payouts are named by their date.
const isDateId = (p) => /^\d{4}-\d{2}-\d{2}$/.test(String(p.id));
const nameOf = (p) => (isDateId(p) ? `The ${p.issuedAt} payout` : `Payout ${p.id}`);
const TYPE_RANK = { MISSING_DEPOSIT: 0, FAILED_PAYOUT: 1, DUPLICATE_DEPOSIT: 2, AMOUNT_MISMATCH: 3, UNMATCHED_DEPOSIT: 4 };

const SUGGESTION = {
  MISSING_DEPOSIT: "Look for the deposit in your bank account. If it is not there, check the payout in Shopify under Finance, then Payouts, and contact Shopify Support if it still has not arrived.",
  FAILED_PAYOUT: "Check the bank account details in Shopify under Settings, then Payments, and contact Shopify Support if the payout is not sent again.",
  DUPLICATE_DEPOSIT: "Check whether the second deposit belongs to a different payout of the same amount. If it does not, ask your bank or Shopify why it was sent twice.",
  AMOUNT_MISMATCH: "Look at your bank's fees and at any reserve Shopify is holding. Then record the difference as a bank fee or a reserve in your books.",
  UNMATCHED_DEPOSIT: "Find which payout this belongs to. It may come from an earlier period or from another Shopify store.",
};

export function reconcilePayouts(payouts, ledger, { today = new Date(), graceDays = 3 } = {}) {
  const now = todayNumber(today);
  const credits = ledger.filter((r) => r.amount > 0).map((r) => ({ ...r, day: dayNumber(r.date) }));
  const used = new Set();
  const findings = [];
  let matched = 0;
  let waiting = 0;

  const paid = payouts.filter((p) => p.status === "PAID" && p.net.amount > 0);
  waiting = payouts.filter((p) => p.status === "IN_TRANSIT" || p.status === "SCHEDULED").length;

  // A deposit normally lands 0 to 10 days after the payout is issued.
  const inWindow = (p, c) => c.day >= dayNumber(p.issuedAt) - 1 && c.day <= dayNumber(p.issuedAt) + 10;
  const unresolved = [];

  // Pass 1: exact amount matches (could be one deposit, or the same deposit twice).
  for (const p of paid) {
    const exact = credits.filter((c) => !used.has(c.id) && inWindow(p, c) && Math.abs(c.amount - p.net.amount) < 0.005);
    if (exact.length === 0) {
      unresolved.push(p);
      continue;
    }
    exact.forEach((c) => used.add(c.id));
    if (exact.length === 1) {
      matched += 1;
    } else {
      const extra = money(p.net.amount * (exact.length - 1));
      findings.push({
        type: "DUPLICATE_DEPOSIT",
        payout: p,
        ledger: exact,
        amount: extra,
        explanation: `${nameOf(p)} of ${usd(p.net.amount)} appears in the bank ${exact.length} times, so ${usd(extra)} too much was recorded. Check whether one deposit belongs to something else.`,
      });
    }
  }

  // Pass 2: payouts with no exact match. Look for a Shopify deposit of a different amount.
  for (const p of unresolved) {
    const tolerance = Math.max(1, p.net.amount * 0.1);
    const near = credits.find(
      (c) => !used.has(c.id) && inWindow(p, c) && SHOPIFY.test(c.description) && Math.abs(c.amount - p.net.amount) <= tolerance,
    );
    if (near) {
      used.add(near.id);
      const diff = money(near.amount - p.net.amount);
      const note = p.chargebacks > 0 ? ` The payout already included a ${usd(p.chargebacks)} chargeback.` : "";
      findings.push({
        type: "AMOUNT_MISMATCH",
        payout: p,
        ledger: [near],
        amount: Math.abs(diff),
        difference: diff,
        explanation: `The bank received ${usd(near.amount)} for ${nameOf(p).replace(/^The /, "the ").replace(/^Payout /, "payout ")}, which is ${usd(Math.abs(diff))} ${diff < 0 ? "less" : "more"} than the payout of ${usd(p.net.amount)}. A bank fee, a hold or a reserve could explain this.${note}`,
      });
    } else if (now - dayNumber(p.issuedAt) > graceDays) {
      findings.push({
        type: "MISSING_DEPOSIT",
        payout: p,
        ledger: [],
        amount: p.net.amount,
        explanation: isDateId(p)
          ? `The ${p.issuedAt} payout of ${usd(p.net.amount)} has no matching deposit in the bank after ${graceDays} days.`
          : `Payout ${p.id} of ${usd(p.net.amount)} was issued on ${p.issuedAt}, but no matching deposit has reached the bank after ${graceDays} days.`,
      });
    } else {
      waiting += 1;
    }
  }

  // Payouts the bank refused: the money was not deposited.
  for (const p of payouts.filter((x) => x.status === "FAILED" && x.net.amount > 0)) {
    findings.push({
      type: "FAILED_PAYOUT",
      payout: p,
      ledger: [],
      amount: p.net.amount,
      explanation: `${nameOf(p)} of ${usd(p.net.amount)} failed: the bank did not accept it, so the money has not been deposited. Check the bank details in Shopify.`,
    });
  }

  // Shopify deposits that no payout accounts for.
  for (const c of credits) {
    if (!used.has(c.id) && SHOPIFY.test(c.description)) {
      findings.push({
        type: "UNMATCHED_DEPOSIT",
        payout: null,
        ledger: [c],
        amount: c.amount,
        explanation: `The bank shows a Shopify deposit of ${usd(c.amount)} on ${c.date} that does not match any payout.`,
      });
    }
  }

  findings.forEach((f) => {
    f.suggestion = SUGGESTION[f.type];
  });
  findings.sort((a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type] || b.amount - a.amount);

  return {
    summary: {
      payouts_checked: paid.length,
      matched,
      exceptions: findings.length,
      waiting,
      amount_at_risk: money(findings.reduce((sum, f) => sum + f.amount, 0)),
      ledger_credits: credits.length,
    },
    findings,
  };
}
