# BCL (bcl.my / Bayarcash) payments

## Form setup
- One form per product with two price items: monthly (e.g. RM20) and yearly (e.g. RM200). Allow quantity so a buyer can prepay several months/years.
- Add a required custom field "E-mel Google untuk sistem" (the account they sign in with). The payer e-mail is often different (spouse, bursar). Optional custom field for school/business name.
- Redirect URLs back to the app (thank-you page or home).
- If a BCL MCP connector is available (tools like `get_form`, `update_form_prices`, `update_form_webhook`, `list_transactions`, `get_transaction`), use it to inspect and edit the form. `update_form_prices` needs the field `price`. Tool results may echo the webhook URL including its secret key: never repeat it in chat.

## Webhook
- URL: `https://<licence-worker>/bcl/<BCL_WEBHOOK_KEY>` (long random key, e.g. `openssl rand -hex 24`).
- Events: Payment Success; add Direct Debit events if auto-debit is offered.
- BCL webhooks are not signed and are not retried. Failed deliveries must be resent manually: BCL > Tools > Webhook Logs > Resend. Make the handler idempotent (`bcl:<order>` key) so resends are safe.
- Respond 200 quickly; do the work in `ctx.waitUntil`.

## Verification (never trust the body)
- `GET https://api.bcl.my/v1/transactions/{order_number}` with `Authorization: Bearer bcl_...` (API token with "API Read" only) and your own `User-Agent`.
- Response: `data.main_data` (status, amount, order number, payer e-mail, items) and `data.custom_fields_data` (custom fields).
- Paid when status is 3, or `is_paid` true/1, or status text says success. Order number must match, amount must match the body.
- API tokens expire (about a year): put a calendar reminder a month before and update the Worker secret.

## Direct debit (auto-debit)
- Enrolment/approval event carries the mandate; store `mandate:<order>` with e-mail and plan.
- Each deduction event extends the licence once (`bcl:dd:<reference>`). The API has no endpoint to verify deductions, so security relies on the secret webhook URL and the stored mandate.

## Testing
1. Unit: feed recorded webhook bodies to `handle()` with a fake `fetch` that returns a matching transaction.
2. BCL "Send Test Webhook": accepted only when `BCL_ACCEPT_TEST=1` (remove afterwards).
3. Real RM1 payment before launch: temporary RM1 item, pay with a test Google e-mail in the custom field, confirm `bcl:<order>` and the licence in the admin list, then remove the item.

## Owner support cases
- "Paid but still not licensed": check transaction status, webhook log, resend; if the e-mail was mistyped, add months to the correct e-mail with the admin API.
- Refund or transfer: adjust with `expires`/`addMonths`, delete the old key.
