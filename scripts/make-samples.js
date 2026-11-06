// Writes two example files that match the demo data, so you can try the upload without real data.
// Run: node scripts/make-samples.js
import { writeFileSync } from "node:fs";
import { demoPayouts, demoLedger } from "../app/payouts/demoData.js";

const today = new Date();
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const r2 = (n) => (Math.round(n * 100) / 100).toFixed(2);

const bank = ["Date,Description,Amount"];
for (const r of demoLedger(today)) bank.push(`${r.date},${q(r.description)},${r2(r.amount)}`);
writeFileSync("samples/sample_bank.csv", bank.join("\n") + "\n");

const header = "Transaction Date,Type,Order,Card Brand,Card Source,Payout Status,Payout Date,Available On,Amount,Fee,Net";
const lines = [header];
for (const p of demoPayouts(today)) {
  const status = p.status === "PAID" ? "Deposited" : "Scheduled";
  const parts = 3;
  let grossLeft = p.gross;
  let feeLeft = p.fees;
  for (let i = 0; i < parts; i++) {
    const amt = i === parts - 1 ? grossLeft : Math.round((p.gross / parts) * 100) / 100;
    const fee = i === parts - 1 ? feeLeft : Math.round((p.fees / parts) * 100) / 100;
    grossLeft = Math.round((grossLeft - amt) * 100) / 100;
    feeLeft = Math.round((feeLeft - fee) * 100) / 100;
    lines.push([p.issuedAt, "charge", `#${p.id}${i}`, "visa", "online", status, p.issuedAt, p.issuedAt, r2(amt), r2(fee), r2(amt - fee)].join(","));
  }
  if (p.refunds > 0) lines.push([p.issuedAt, "refund", `#${p.id}R`, "visa", "online", status, p.issuedAt, p.issuedAt, r2(-p.refunds), "0.00", r2(-p.refunds)].join(","));
  if (p.chargebacks > 0) lines.push([p.issuedAt, "chargeback", `#${p.id}C`, "visa", "online", status, p.issuedAt, p.issuedAt, r2(-p.chargebacks), "0.00", r2(-p.chargebacks)].join(","));
}
writeFileSync("samples/sample_shopify_transactions.csv", lines.join("\n") + "\n");
const ql = ["day,payout_amount"];
for (const p of demoPayouts(today)) ql.push(`${p.issuedAt},${r2(p.net.amount)}`);
writeFileSync("samples/sample_shopifyql_payouts.csv", ql.join("\n") + "\n");
console.log("Wrote the three sample files in samples/");
