# LedgerLight for Shopify

Checks that every Shopify payout actually arrived in your bank. Upload a Shopify payouts file and a bank statement (both CSV); it flags missing, duplicate, short and unexplained deposits. Nothing is stored.

## Run the free tester page

    node web/server.js

Then open http://localhost:3000. Needs Node 22 or newer. No install step.

Optional: set `FEEDBACK_EMAIL` to show a contact address in the page footer.

## Deploy on Render

Create a new Blueprint from this repository. `render.yaml` does the rest.

## Tests

    node --test tests/payouts.test.js tests/csv.test.js tests/web.test.js

The `app/` folder also holds the embedded Shopify app (React Router template) that uses the same checking code.
