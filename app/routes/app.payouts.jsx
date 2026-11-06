import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { demoPayouts, demoLedger } from "../payouts/demoData.js";
import { reconcilePayouts } from "../payouts/reconcile.js";
import { parseBankCsv, parsePayoutsFile } from "../payouts/csv.js";
import { CSS } from "../payouts/styles.js";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  // Dev stores have no Shopify Payments account, so for now we always use demo data.
  const today = new Date();
  const payouts = demoPayouts(today);
  const ledger = demoLedger(today);
  const report = reconcilePayouts(payouts, ledger, { today });
  return { source: "demo", payouts, report, warnings: [] };
};

const MAX_BYTES = 5 * 1024 * 1024;

// Reads the two uploaded files, checks them, and returns the result. Nothing is saved.
export const action = async ({ request }) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const bank = form.get("bank");
  const shopify = form.get("payouts");
  const isFile = (f) => f && typeof f === "object" && typeof f.text === "function" && f.size > 0;
  if (!isFile(bank) || !isFile(shopify)) {
    return { error: "Please choose both files: your Shopify payouts file and your bank statement." };
  }
  if (bank.size > MAX_BYTES || shopify.size > MAX_BYTES) {
    return { error: "A file is too large. Please keep each file under 5 MB." };
  }
  const bankResult = parseBankCsv(await bank.text());
  if (bankResult.error) return { error: bankResult.error };
  const payoutResult = parsePayoutsFile(await shopify.text());
  if (payoutResult.error) return { error: payoutResult.error };
  if (payoutResult.payouts.length === 0) {
    return { error: "We found no payouts in the Shopify file. Export the transactions that are part of a payout and try again." };
  }
  const today = new Date();
  const report = reconcilePayouts(payoutResult.payouts, bankResult.rows, { today });
  const warnings = [];
  if (bankResult.skipped > 0) warnings.push(`${bankResult.skipped} bank rows were skipped because the date or amount could not be read.`);
  return {
    source: "upload",
    payouts: payoutResult.payouts,
    report,
    files: { bank: bank.name, bankRows: bankResult.rows.length, payouts: shopify.name },
    warnings,
  };
};

const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const isDateId = (id) => /^\d{4}-\d{2}-\d{2}$/.test(String(id));

// Plain-language names for each kind of problem, and the colour of its card.
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

function downloadProblems(findings) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
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
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "payout-problems.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function Note({ tone, icon, title, children }) {
  return (
    <div className={`ll-note ${tone}`} role="status">
      <div className="ll-icon" aria-hidden="true">{icon}</div>
      <div>
        <h3>{title}</h3>
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}

export default function Payouts() {
  const loaded = useLoaderData();
  const submitted = useActionData();
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const error = submitted?.error;
  const data = submitted && !submitted.error ? submitted : loaded;
  const { source, payouts, report } = data;
  const { summary, findings } = report;
  // Simple payout lists have no fee or refund detail, so those columns are hidden when everything is zero.
  const hasBreakdown = payouts.some((p) => p.fees || p.refunds || p.chargebacks);

  const copyQuery = async () => {
    try {
      await navigator.clipboard.writeText(QUERY);
      shopify.toast.show("Copied");
    } catch {
      shopify.toast.show("Please select the text and copy it");
    }
  };

  return (
    <s-page heading="Check your Shopify payouts">
      <style>{CSS}</style>
      <div className="ll">
        {error ? (
          <Note tone="ll-bad" icon="!" title="We couldn't read those files">
            {error}
          </Note>
        ) : null}

        {source === "demo" ? (
          <Note tone="ll-info" icon="i" title="You are looking at an example">
            This is made-up information so you can see how the page works. Add your own files in Step 1 to check your real
            payouts.
          </Note>
        ) : (
          <Note tone="ll-good" icon="✓" title="We checked your files">
            {payouts.length} payouts from {data.files.payouts} and {data.files.bankRows} lines from {data.files.bank}. Nothing
            was saved.
          </Note>
        )}
        {(data.warnings || []).map((w) => (
          <Note key={w} tone="ll-warn" icon="!" title="One thing to know">
            {w}
          </Note>
        ))}

        <p>
          Shopify sends the money from your sales to your bank in batches called <strong>payouts</strong>. This page checks
          that every payout really arrived in your bank.
        </p>

        <div className="ll-block ll-step1">
          <div className="ll-title">
            <div className="ll-num" aria-hidden="true">1</div>
            <h2>Add your two files</h2>
          </div>
          <Form method="post" encType="multipart/form-data">
            <div className="ll-field">
              <strong>Your Shopify payouts file</strong>
              <span className="ll-small">The list of payouts you downloaded from Shopify (a CSV file).</span>
              <br />
              <input type="file" name="payouts" accept=".csv,text/csv" required />
            </div>
            <div className="ll-field">
              <strong>Your bank statement</strong>
              <span className="ll-small">The list of deposits you downloaded from your bank (a CSV file).</span>
              <br />
              <input type="file" name="bank" accept=".csv,text/csv" required />
            </div>
            <div className="ll-row">
              <button type="submit" className="ll-btn" disabled={busy}>
                {busy ? "Checking…" : "Check my payouts"}
              </button>
              {source === "upload" ? (
                <button type="button" className="ll-btn ll-btn-2" onClick={() => window.location.reload()}>
                  Show the example again
                </button>
              ) : null}
            </div>
            <p className="ll-small" style={{ marginTop: 12 }}>
              Your files are only read to do the check. Nothing is saved.
            </p>
          </Form>

          <details>
            <summary>Where do I find these files?</summary>
            <div className="ll-help">
              <h3>Your Shopify payouts file</h3>
              <p>Pick one of these two ways.</p>
              <p>
                <strong>Way 1 (most detail):</strong>
              </p>
              <ol>
                <li>In Shopify, click <strong>Finance</strong>, then <strong>Payouts</strong>.</li>
                <li>Click one payout, then click <strong>View order transactions</strong>.</li>
                <li>Click <strong>Export</strong>. Choose <strong>Items by date</strong> (not the summary).</li>
              </ol>
              <p>
                <strong>Way 2 (any dates you like):</strong> in Shopify, open <strong>Analytics</strong> and the{" "}
                <strong>ShopifyQL editor</strong>. Paste this, run it, then export the result as a CSV file.
              </p>
              <pre>
                <code>{QUERY}</code>
              </pre>
              <button type="button" className="ll-btn ll-btn-2" onClick={copyQuery}>
                Copy this
              </button>
              <h3 style={{ marginTop: 18 }}>Your bank statement</h3>
              <p>Sign in to your bank's website and download your recent activity as a CSV file, for the same dates.</p>
            </div>
          </details>
        </div>

        <div className="ll-block ll-step2">
          <div className="ll-title">
            <div className="ll-num" aria-hidden="true">2</div>
            <h2>See what needs your attention</h2>
          </div>

          {findings.length === 0 ? (
            <div className="ll-hero ll-good">
              <h2>Everything arrived</h2>
              <p>All {summary.matched} payouts we checked match a deposit in your bank.</p>
            </div>
          ) : (
            <div className="ll-hero ll-bad">
              <h2>
                We found {findings.length} {findings.length === 1 ? "thing" : "things"} to look at
              </h2>
              <p>About {usd(summary.amount_at_risk)} is involved. The details are below.</p>
            </div>
          )}

          <div className="ll-tiles">
            <div className="ll-tile ll-t-all">
              Payouts we checked
              <b>{summary.payouts_checked}</b>
            </div>
            <div className="ll-tile ll-t-ok">
              Arrived in your bank
              <b>{summary.matched}</b>
            </div>
            <div className="ll-tile ll-t-bad">
              Need your attention
              <b>{summary.exceptions}</b>
            </div>
            <div className="ll-tile ll-t-way">
              Still on the way
              <b>{summary.waiting}</b>
            </div>
          </div>

          {findings.length > 0 ? (
            <>
              <div className="ll-section-title">Things to look at</div>
              {findings.map((f, i) => {
                const label = LABELS[f.type];
                return (
                  <div key={i} className={`ll-card ${label.card}`}>
                    <h3>{label.title}</h3>
                    <div className="ll-amount">{usd(f.amount)}</div>
                    <p>{f.explanation}</p>
                    {f.ledger.length > 0 ? (
                      <p className="ll-small">
                        Your bank shows: {f.ledger.map((r) => `${r.date}, ${usd(r.amount)}`).join("; ")}
                      </p>
                    ) : null}
                    <div className="ll-todo">
                      <strong>What to do: </strong>
                      {f.suggestion}
                    </div>
                  </div>
                );
              })}
              <div className="ll-row" style={{ marginTop: 6 }}>
                <button type="button" className="ll-btn ll-btn-2" onClick={() => downloadProblems(findings)}>
                  Save this list for my bookkeeper
                </button>
              </div>
            </>
          ) : null}

          <div className="ll-section-title">All your payouts</div>
          <div className="ll-tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  {hasBreakdown ? (
                    <>
                      <th className="ll-r">Sales</th>
                      <th className="ll-r">Shopify fees</th>
                      <th className="ll-r">Refunds</th>
                      <th className="ll-r">Disputes</th>
                    </>
                  ) : null}
                  <th className="ll-r">Sent to your bank</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => {
                  const st = STATUS[p.status] || { text: p.status, pill: "ll-p-way" };
                  return (
                    <tr key={p.id}>
                      <td>
                        {p.issuedAt}
                        {isDateId(p.id) ? "" : <span className="ll-small"> (#{p.id})</span>}
                      </td>
                      <td>
                        <span className={`ll-pill ${st.pill}`}>{st.text}</span>
                      </td>
                      {hasBreakdown ? (
                        <>
                          <td className="ll-r">{usd(p.gross)}</td>
                          <td className="ll-r">{usd(p.fees)}</td>
                          <td className="ll-r">{usd(p.refunds)}</td>
                          <td className="ll-r">{usd(p.chargebacks)}</td>
                        </>
                      ) : null}
                      <td className="ll-r">
                        <strong>{usd(p.net.amount)}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
