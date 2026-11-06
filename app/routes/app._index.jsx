import { Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { CSS } from "../payouts/styles.js";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="LedgerLight">
      <style>{CSS}</style>
      <div className="ll">
        <div className="ll-block ll-step1">
          <h2 style={{ fontSize: 32 }}>Did all your Shopify money reach your bank?</h2>
          <p>
            Shopify sends the money from your sales to your bank in batches called payouts. LedgerLight checks every payout
            against your bank and tells you, in plain words, if anything is missing, doubled, failed or different.
          </p>
          <div className="ll-row">
            <Link to="/app/payouts" className="ll-btn" style={{ textDecoration: "none", display: "inline-block" }}>
              Check my payouts
            </Link>
          </div>
          <p className="ll-small" style={{ marginTop: 12 }}>
            You will see an example first, so you can see how it works.
          </p>
        </div>

        <div className="ll-section-title">It takes three easy steps</div>
        <div className="ll-tiles">
          <div className="ll-tile ll-t-way">
            <h3>1. Get two files</h3>
            <p>Download your payouts from Shopify and your statement from your bank.</p>
          </div>
          <div className="ll-tile ll-t-ok">
            <h3>2. Add them here</h3>
            <p>Choose the two files. Nothing is saved.</p>
          </div>
          <div className="ll-tile ll-t-bad">
            <h3>3. See what to fix</h3>
            <p>Each problem comes with what happened and what to do next.</p>
          </div>
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
