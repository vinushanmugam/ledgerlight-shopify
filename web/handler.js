// The public tester page: the same checker as the Shopify app, with no Shopify login and nothing stored.
// It takes a standard web Request and returns a Response, so it can run on any host.
import { demoPayouts, demoLedger } from "../app/payouts/demoData.js";
import { reconcilePayouts } from "../app/payouts/reconcile.js";
import { parseBankCsv, parsePayoutsFile } from "../app/payouts/csv.js";
import { CSS } from "../app/payouts/styles.js";

export const MAX_FILE = 4 * 1024 * 1024;
const FEEDBACK = () => process.env.FEEDBACK_EMAIL || "";

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const isDateId = (id) => /^\d{4}-\d{2}-\d{2}$/.test(String(id));

const LABELS = {
  MISSING_DEPOSIT: { title: "Money did not arrive in your bank", card: "ll-c-bad" },
  FAILED_PAYOUT: { title: "Shopify could not send this payout", card: "ll-c-bad" },
  DUPLICATE_DEPOSIT: { title: "Money arrived twice", card: "ll-c-warn" },
  AMOUNT_MISMATCH: { title: "A different amount arrived", card: "ll-c-warn" },
  UNMATCHED_DEPOSIT: { title: "Money from Shopify that we can't match", card: "ll-c-info" },
};
const STATUS = {
  PAID: { text: "Sent", pill: "ll-p-ok" },
  IN_TRANSIT: { text: "On the way", pill: "ll-p-way" },
  SCHEDULED: { text: "On the way", pill: "ll-p-way" },
  FAILED: { text: "Failed", pill: "ll-p-bad" },
  CANCELED: { text: "Canceled", pill: "ll-p-bad" },
};
const QUERY = `FROM payouts
  SHOW payout_amount
  TIMESERIES day
  SINCE startOfDay(-60d) UNTIL today
  ORDER BY day ASC`;

const SITE_CSS = `
body { margin: 0; background: #fafafa; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.site { background: #1d3a6e; color: #fff; padding: 22px 20px; }
.site .in { max-width: 980px; margin: 0 auto; }
.site h1 { margin: 0; font-size: 30px; }
.site p { margin: 4px 0 0; font-size: 18px; color: #dbe7ff; }
.wrap { max-width: 1020px; margin: 0 auto; padding: 22px 20px 10px; }
.foot { max-width: 980px; margin: 0 auto; padding: 10px 20px 40px; font-size: 16px; color: #3d3d3d; }
`;

function note(tone, icon, title, text) {
  return `<div class="ll-note ${tone}" role="status"><div class="ll-icon" aria-hidden="true">${icon}</div><div><h3>${esc(title)}</h3>${
    text ? `<p>${esc(text)}</p>` : ""
  }</div></div>`;
}

function problemsCsv(findings) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [["Problem", "Payout", "Date", "Amount", "What happened", "What to do"]];
  for (const f of findings) {
    rows.push([
      LABELS[f.type].title,
      f.payout ? String(f.payout.id) : "",
      f.payout ? f.payout.issuedAt : (f.ledger[0]?.date ?? ""),
      f.amount.toFixed(2),
      f.explanation,
      f.suggestion,
    ]);
  }
  return rows.map((r) => r.map(q).join(",")).join("\n");
}

function demoData() {
  const today = new Date();
  const payouts = demoPayouts(today);
  return { source: "demo", payouts, report: reconcilePayouts(payouts, demoLedger(today), { today }), warnings: [] };
}

function render(data, error) {
  const { source, payouts, report } = data;
  const { summary, findings } = report;
  const hasBreakdown = payouts.some((p) => p.fees || p.refunds || p.chargebacks);
  const contact = FEEDBACK()
    ? `Questions or ideas? Email <a href="mailto:${esc(FEEDBACK())}">${esc(FEEDBACK())}</a>.`
    : "Questions or ideas? Reply to the message where you found this link.";

  let html = "";
  if (error) html += note("ll-bad", "!", "We couldn't read those files", error);
  html +=
    source === "demo"
      ? note("ll-info", "i", "You are looking at an example", "This is made-up information so you can see how the page works. Add your own files in Step 1 to check your real payouts.")
      : note("ll-good", "&#10003;", "We checked your files", `${payouts.length} payouts from ${data.files.payouts} and ${data.files.bankRows} lines from ${data.files.bank}. Nothing was saved.`);
  for (const w of data.warnings || []) html += note("ll-warn", "!", "One thing to know", w);

  html += `<p>Shopify sends the money from your sales to your bank in batches called <strong>payouts</strong>. This page checks that every payout really arrived in your bank.</p>`;

  html += `<div class="ll-block ll-step1"><div class="ll-title"><div class="ll-num" aria-hidden="true">1</div><h2>Add your two files</h2></div>
<form method="post" action="/" enctype="multipart/form-data">
<div class="ll-field"><strong>Your Shopify payouts file</strong><span class="ll-small">The list of payouts you downloaded from Shopify (a CSV file).</span><br><input type="file" name="payouts" accept=".csv,text/csv" required></div>
<div class="ll-field"><strong>Your bank statement</strong><span class="ll-small">The list of deposits you downloaded from your bank (a CSV file).</span><br><input type="file" name="bank" accept=".csv,text/csv" required></div>
<div class="ll-row"><button type="submit" class="ll-btn">Check my payouts</button>${
    source === "upload" ? `<a class="ll-btn ll-btn-2" style="text-decoration:none" href="/">Show the example again</a>` : ""
  }</div>
<p class="ll-small" style="margin-top:12px">Your files are only read to do the check. Nothing is saved. If you prefer, remove names or other private details from the files first. We only need dates, descriptions and amounts.</p>
</form>
<details><summary>Where do I find these files?</summary><div class="ll-help">
<h3>Your Shopify payouts file</h3><p>Pick one of these two ways.</p>
<p><strong>Way 1 (most detail):</strong></p>
<ol><li>In Shopify, click <strong>Finance</strong>, then <strong>Payouts</strong>.</li><li>Click one payout, then click <strong>View order transactions</strong>.</li><li>Click <strong>Export</strong>. Choose <strong>Items by date</strong> (not the summary).</li></ol>
<p><strong>Way 2 (any dates you like):</strong> in Shopify, open <strong>Analytics</strong> and the <strong>ShopifyQL editor</strong>. Paste this, run it, then export the result as a CSV file.</p>
<pre><code id="q">${esc(QUERY)}</code></pre>
<button type="button" class="ll-btn ll-btn-2" id="copy">Copy this</button>
<h3 style="margin-top:18px">Your bank statement</h3><p>Sign in to your bank's website and download your recent activity as a CSV file, for the same dates.</p>
</div></details></div>`;

  html += `<div class="ll-block ll-step2"><div class="ll-title"><div class="ll-num" aria-hidden="true">2</div><h2>See what needs your attention</h2></div>`;
  html +=
    findings.length === 0
      ? `<div class="ll-hero ll-good"><h2>Everything arrived</h2><p>All ${summary.matched} payouts we checked match a deposit in your bank.</p></div>`
      : `<div class="ll-hero ll-bad"><h2>We found ${findings.length} ${findings.length === 1 ? "thing" : "things"} to look at</h2><p>About ${esc(usd(summary.amount_at_risk))} is involved. The details are below.</p></div>`;
  html += `<div class="ll-tiles">
<div class="ll-tile ll-t-all">Payouts we checked<b>${summary.payouts_checked}</b></div>
<div class="ll-tile ll-t-ok">Arrived in your bank<b>${summary.matched}</b></div>
<div class="ll-tile ll-t-bad">Need your attention<b>${summary.exceptions}</b></div>
<div class="ll-tile ll-t-way">Still on the way<b>${summary.waiting}</b></div></div>`;

  if (findings.length > 0) {
    html += `<div class="ll-section-title">Things to look at</div>`;
    for (const f of findings) {
      const label = LABELS[f.type];
      html += `<div class="ll-card ${label.card}"><h3>${esc(label.title)}</h3><div class="ll-amount">${esc(usd(f.amount))}</div><p>${esc(f.explanation)}</p>${
        f.ledger.length ? `<p class="ll-small">Your bank shows: ${esc(f.ledger.map((r) => `${r.date}, ${usd(r.amount)}`).join("; "))}</p>` : ""
      }<div class="ll-todo"><strong>What to do: </strong>${esc(f.suggestion)}</div></div>`;
    }
    html += `<div class="ll-row" style="margin-top:6px"><a class="ll-btn ll-btn-2" style="text-decoration:none" download="payout-problems.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent(problemsCsv(findings))}">Save this list for my bookkeeper</a></div>`;
  }

  html += `<div class="ll-section-title">All your payouts</div><div class="ll-tablewrap"><table><thead><tr><th>Date</th><th>Status</th>${
    hasBreakdown ? `<th class="ll-r">Sales</th><th class="ll-r">Shopify fees</th><th class="ll-r">Refunds</th><th class="ll-r">Disputes</th>` : ""
  }<th class="ll-r">Sent to your bank</th></tr></thead><tbody>`;
  for (const p of payouts) {
    const st = STATUS[p.status] || { text: p.status, pill: "ll-p-way" };
    html += `<tr><td>${esc(p.issuedAt)}${isDateId(p.id) ? "" : ` <span class="ll-small">(#${esc(p.id)})</span>`}</td><td><span class="ll-pill ${st.pill}">${esc(st.text)}</span></td>${
      hasBreakdown
        ? `<td class="ll-r">${usd(p.gross)}</td><td class="ll-r">${usd(p.fees)}</td><td class="ll-r">${usd(p.refunds)}</td><td class="ll-r">${usd(p.chargebacks)}</td>`
        : ""
    }<td class="ll-r"><strong>${esc(usd(p.net.amount))}</strong></td></tr>`;
  }
  html += `</tbody></table></div></div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>LedgerLight: check your Shopify payouts</title><style>${SITE_CSS}${CSS}</style></head><body>
<div class="site"><div class="in"><h1>LedgerLight</h1><p>Free beta: did all your Shopify money reach your bank?</p></div></div>
<div class="wrap"><div class="ll">${html}</div></div>
<div class="foot">This is a free test version. ${contact}</div>
<script>var b=document.getElementById("copy");if(b){b.addEventListener("click",function(){var t=document.getElementById("q").textContent;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){b.textContent="Copied"},function(){b.textContent="Please select the text and copy it"})})}</script>
</body></html>`;
}

const page = (data, error, status = 200) =>
  new Response(render(data, error), { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

export async function handle(request) {
  const url = new URL(request.url);
  if (url.pathname === "/health") return new Response("ok");
  if (url.pathname !== "/") return new Response("Page not found", { status: 404 });
  if (request.method === "GET" || request.method === "HEAD") return page(demoData());
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let form;
  try {
    form = await request.formData();
  } catch {
    return page(demoData(), "We couldn't read what you sent. Please choose the two files again. Each file must be under 4 MB.", 400);
  }
  const bank = form.get("bank");
  const shopify = form.get("payouts");
  const isFile = (f) => f && typeof f === "object" && typeof f.text === "function" && f.size > 0;
  if (!isFile(bank) || !isFile(shopify)) return page(demoData(), "Please choose both files: your Shopify payouts file and your bank statement.", 400);
  if (bank.size > MAX_FILE || shopify.size > MAX_FILE) return page(demoData(), "A file is too large. Please keep each file under 4 MB.", 400);

  const bankResult = parseBankCsv(await bank.text());
  if (bankResult.error) return page(demoData(), bankResult.error, 400);
  const payoutResult = parsePayoutsFile(await shopify.text());
  if (payoutResult.error) return page(demoData(), payoutResult.error, 400);
  if (payoutResult.payouts.length === 0) {
    return page(demoData(), "We found no payouts in the Shopify file. Export the transactions that are part of a payout and try again.", 400);
  }
  const today = new Date();
  const report = reconcilePayouts(payoutResult.payouts, bankResult.rows, { today });
  const warnings = [];
  if (bankResult.skipped > 0) warnings.push(`${bankResult.skipped} bank rows were skipped because the date or amount could not be read.`);
  return page({
    source: "upload",
    payouts: payoutResult.payouts,
    report,
    files: { bank: bank.name, bankRows: bankResult.rows.length, payouts: shopify.name },
    warnings,
  });
}
