import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handle } from "../web/handler.js";

const post = (fields) => {
  const fd = new FormData();
  for (const [k, [name, text]] of Object.entries(fields)) fd.append(k, new File([text], name, { type: "text/csv" }));
  return handle(new Request("http://x/", { method: "POST", body: fd }));
};

test("the page opens with an example", async () => {
  const res = await handle(new Request("http://x/"));
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /You are looking at an example/);
  assert.match(html, /We found 4 things to look at/);
});

test("health check works", async () => {
  assert.equal(await (await handle(new Request("http://x/health"))).text(), "ok");
});

test("uploading the two sample files shows the four problems", async () => {
  const res = await post({
    payouts: ["sample_shopify_transactions.csv", readFileSync("samples/sample_shopify_transactions.csv", "utf8")],
    bank: ["sample_bank.csv", readFileSync("samples/sample_bank.csv", "utf8")],
  });
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /We checked your files/);
  assert.match(html, /We found 4 things to look at/);
  assert.match(html, /Money did not arrive in your bank/);
});

test("a ShopifyQL file works too", async () => {
  const res = await post({
    payouts: ["q.csv", readFileSync("samples/sample_shopifyql_payouts.csv", "utf8")],
    bank: ["b.csv", readFileSync("samples/sample_bank.csv", "utf8")],
  });
  assert.match(await res.text(), /We checked your files/);
});

test("the wrong file in the wrong box gives a friendly message", async () => {
  const res = await post({
    payouts: ["b.csv", readFileSync("samples/sample_bank.csv", "utf8")],
    bank: ["b.csv", readFileSync("samples/sample_bank.csv", "utf8")],
  });
  const html = await res.text();
  assert.equal(res.status, 400);
  assert.match(html, /looks like a bank statement/);
});

test("anything from a file is escaped, so it cannot inject code", async () => {
  const res = await post({
    payouts: ["p.csv", readFileSync("samples/sample_shopify_transactions.csv", "utf8")],
    bank: ["<script>alert(1)</script>.csv", "<img src=x onerror=alert(1)>,b\n1,2\n"],
  });
  const html = await res.text();
  assert.ok(!html.includes("<script>alert(1)"));
  assert.ok(!html.includes("<img src=x"));
});

test("missing files and unknown pages are handled", async () => {
  const none = await handle(new Request("http://x/", { method: "POST", body: new FormData() }));
  assert.equal(none.status, 400);
  assert.equal((await handle(new Request("http://x/nope"))).status, 404);
});
