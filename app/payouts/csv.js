// Reads the two files a merchant uploads: a bank statement and Shopify's transaction export.
// Pure functions (no Shopify or database calls), so they are easy to test.

const money = (n) => Math.round(n * 100) / 100;

// Split CSV text into rows of cells. Handles quoted cells, commas and line breaks inside quotes, and a leading BOM.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/[$,\s]/g, "");
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s);
  return money(negative ? -Math.abs(n) : n);
}

const pad = (n) => String(n).padStart(2, "0");

// Returns "YYYY-MM-DD" or null. Accepts 2026-10-26, 2026-10-26 14:03:11 -0700, 10/26/2026, 10/26/26 and "Oct 26, 2026".
export function parseDate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${year}-${pad(m[1])}-${pad(m[2])}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return null;
}

function table(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const records = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { headers, records };
}

const firstHeader = (headers, test) => headers.find((h) => test.test(h));

// Bank statement: needs a date and either one amount column or separate debit/credit columns.
export function parseBankCsv(text) {
  const { headers, records } = table(text);
  const dateCol = firstHeader(headers, /date|posted/);
  const descCol = firstHeader(headers, /desc|memo|detail|payee|narrat|reference|name/);
  const amountCol = firstHeader(headers, /^amount$/) ?? firstHeader(headers, /amount/);
  const debitCol = firstHeader(headers, /debit|withdraw/);
  const creditCol = firstHeader(headers, /credit|deposit/);
  if (!dateCol || (!amountCol && !(debitCol || creditCol))) {
    return {
      rows: [],
      skipped: 0,
      error: `I couldn't find date and amount columns in the bank file. Columns I saw: ${headers.join(", ") || "none"}.`,
    };
  }
  const rows = [];
  let skipped = 0;
  for (const rec of records) {
    const date = parseDate(rec[dateCol]);
    let amount = null;
    if (amountCol) {
      amount = parseAmount(rec[amountCol]);
    } else {
      const credit = parseAmount(rec[creditCol]) ?? 0;
      const debit = parseAmount(rec[debitCol]) ?? 0;
      amount = money(Math.abs(credit) - Math.abs(debit));
    }
    if (!date || amount === null) {
      skipped++;
      continue;
    }
    rows.push({ id: rows.length, date, amount, description: descCol ? rec[descCol] : "" });
  }
  return { rows, skipped };
}

const STATUS = { deposited: "PAID", paid: "PAID", scheduled: "SCHEDULED", in_transit: "IN_TRANSIT", failed: "FAILED", canceled: "CANCELED" };

// Shopify's transaction export (one row per charge, refund and so on). Rows are grouped into payouts.
// Expected columns: Payout Date, Payout Status, Type, Amount, Fee, Net (Payout ID is used when present).
export function parseShopifyTransactionsCsv(text) {
  const { headers, records } = table(text);
  const need = ["payout date", "payout status", "type", "amount", "fee", "net"];
  const missing = need.filter((h) => !headers.includes(h));
  if (missing.length) {
    return {
      payouts: [],
      error: `This doesn't look like Shopify's transaction export. Missing columns: ${missing.join(", ")}. Columns I saw: ${headers.join(", ") || "none"}.`,
    };
  }
  const groups = new Map();
  for (const rec of records) {
    const status = STATUS[rec["payout status"].toLowerCase().replace(/\s+/g, "_")];
    const date = parseDate(rec["payout date"]);
    if (!status || !date) continue; // pending transactions are not in a payout yet
    const key = rec["payout id"] || date;
    if (!groups.has(key)) {
      groups.set(key, { id: key, issuedAt: date, status, currency: rec["currency"] || "USD", gross: 0, fees: 0, refunds: 0, chargebacks: 0, orders: 0, net: 0 });
    }
    const g = groups.get(key);
    const type = rec.type.toLowerCase();
    const amount = parseAmount(rec.amount) ?? 0;
    const fee = parseAmount(rec.fee) ?? 0;
    const net = parseAmount(rec.net) ?? amount - fee;
    g.net += net;
    g.fees += fee;
    if (type.includes("refund")) g.refunds += Math.abs(amount);
    else if (type.includes("chargeback") || type.includes("dispute")) g.chargebacks += Math.abs(amount);
    else {
      g.gross += amount;
      if (type.includes("charge") || type.includes("sale")) g.orders += 1;
    }
  }
  const payouts = [...groups.values()]
    .map((g) => ({
      id: g.id,
      issuedAt: g.issuedAt,
      status: g.status,
      currency: g.currency,
      gross: money(g.gross),
      fees: money(g.fees),
      refunds: money(g.refunds),
      chargebacks: money(g.chargebacks),
      orders: g.orders,
      net: { amount: money(g.net), currencyCode: g.currency },
    }))
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  return { payouts };
}

const SUMMARY_STATUS = {
  paid: "PAID", deposited: "PAID", complete: "PAID", completed: "PAID",
  in_transit: "IN_TRANSIT", "in transit": "IN_TRANSIT",
  scheduled: "SCHEDULED", pending: "SCHEDULED",
  failed: "FAILED", canceled: "CANCELED", cancelled: "CANCELED",
};

// A simple payout list: one row per payout (reference, date, status, amount). Extra breakdown columns are used if present.
export function parsePayoutSummaryCsv(text) {
  const { headers, records } = table(text);
  const idCol = firstHeader(headers, /reference|payout.?id|^id$/);
  const dateCol = firstHeader(headers, /arriv|payout.?date|issued|^day$|date/);
  const statusCol = firstHeader(headers, /status/);
  // A ShopifyQL export of `FROM payouts SHOW payout_amount` has no status column: each row is one day's deposits.
  const shopifyql = headers.includes("payout_amount");
  const amountCol =
    firstHeader(headers, /^payout_amount$/) ?? firstHeader(headers, /^(net|total|amount)$/) ?? firstHeader(headers, /net|total|amount/);
  const grossCol = firstHeader(headers, /charges|gross|sales/);
  const feeCol = firstHeader(headers, /fee/);
  const refundCol = firstHeader(headers, /refund/);
  const chargebackCol = firstHeader(headers, /chargeback|dispute/);
  const currencyCol = firstHeader(headers, /currency/);
  if (!dateCol || !amountCol || (!statusCol && !shopifyql)) {
    const looksLikeBank = dateCol && amountCol && !statusCol;
    return {
      payouts: [],
      error: looksLikeBank
        ? `This file has no status column, so it looks like a bank statement. Please choose it in the "Bank statement" box instead. Columns I saw: ${headers.join(", ")}.`
        : `I couldn't find date, status and amount columns in the payouts file. Columns I saw: ${headers.join(", ") || "none"}.`,
    };
  }
  const payouts = [];
  const seen = new Set();
  for (const rec of records) {
    const date = parseDate(rec[dateCol]);
    const net = parseAmount(rec[amountCol]);
    if (!date || net === null) continue;
    if (shopifyql && net <= 0) continue; // days with no payout
    const status = statusCol ? SUMMARY_STATUS[rec[statusCol].toLowerCase()] : "PAID";
    if (!status) continue;
    const fees = Math.abs(parseAmount(rec[feeCol]) ?? 0);
    const refunds = Math.abs(parseAmount(rec[refundCol]) ?? 0);
    const chargebacks = Math.abs(parseAmount(rec[chargebackCol]) ?? 0);
    const gross = grossCol ? (parseAmount(rec[grossCol]) ?? 0) : money(net + fees + refunds + chargebacks);
    let id = (idCol && rec[idCol]) || date;
    while (seen.has(id)) id += "*";
    seen.add(id);
    const currency = (currencyCol && rec[currencyCol]) || "USD";
    payouts.push({ id, issuedAt: date, status, currency, gross, fees, refunds, chargebacks, orders: 0, net: { amount: net, currencyCode: currency } });
  }
  payouts.sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  return { payouts };
}

// Accepts either kind of Shopify payouts file and works out which one it is.
export function parsePayoutsFile(text) {
  const headers = (parseCsv(text)[0] ?? []).map((h) => h.trim().toLowerCase());
  const isTransactions = headers.includes("payout date") && headers.includes("payout status") && headers.includes("type");
  return isTransactions ? parseShopifyTransactionsCsv(text) : parsePayoutSummaryCsv(text);
}
