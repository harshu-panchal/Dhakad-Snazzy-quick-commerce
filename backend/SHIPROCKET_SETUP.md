# Shiprocket setup

The application implements forward Shiprocket fulfilment for single-seller orders on the admin manual-assignment page.

## Production configuration

1. Add the values documented in `.env.example` to the backend environment. Use a dedicated Shiprocket API user, not the dashboard login. Set `SHIPROCKET_BILLING_EMAIL` to a valid company order-support email; it is used only for legacy/phone-first customers whose stored email is invalid.
2. In Shiprocket, configure the webhook URL as `https://<api-domain>/api/v1/logistics/events` and set its token to the same value as `SHIPROCKET_WEBHOOK_TOKEN`. The public path intentionally does not contain the word `shiprocket` because Shiprocket rejects such webhook URLs.
3. Deploy the backend and frontend.
4. Run `npm run shiprocket:migrate-pickups` once from the backend directory. Invalid legacy addresses remain `Failed`; correct state/PIN/address in Admin > Sellers and click **Retry**.
5. Verify a test PIN pair on Admin > Manual Assign: enter package weight/dimensions, fetch couriers, select one, book it, and confirm AWB, pickup, label, manifest, invoice, and tracking.

## Runtime behavior

- Seller registration and address edits do not roll back when Shiprocket is unavailable. Sync is recorded as `Pending`, `Synced`, or `Failed` and retried by the background worker and admin action.
- Address changes create a versioned Shiprocket pickup location and make it the location for future orders. Existing booked shipments retain their original pickup.
- Webhooks update orders immediately. The tracking worker polls active AWBs as a recovery path, and admins can also refresh one order manually.
- For COD, seller proceeds remain unsettled until an admin records Shiprocket's remittance reference on the delivered order.
- Shipment cancellation calls Shiprocket before the local order is cancelled.
