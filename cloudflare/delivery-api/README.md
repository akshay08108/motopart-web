# PartX delivery API on Cloudflare Workers

Production endpoint: `https://partx-delivery-api.akshaysinghkam.workers.dev`.
The customer, seller and rider web interfaces remain in the existing Next.js project.
Firebase Auth, Firestore, FCM and MapTiler remain in use. This backend needs no Firebase Cloud Functions or Blaze upgrade.

## Deployment

From the repository root:

```
npx wrangler@4 login
npx wrangler@4 deploy --config cloudflare/delivery-api/wrangler.jsonc
```

Use the existing Cloudflare account and Worker, not a temporary deployment account.
Wrangler needs account/user read and Workers deployment permissions. Other products such as R2, D1, Pages and KV are not required.

## Private Firebase connection

Create a dedicated service account named `partx-delivery` in `partx-production` using trusted Google Cloud administration. Grant only `roles/datastore.user` and `roles/firebasecloudmessaging.admin`. This grants project-wide Firestore document access and FCM sending; the application must enforce order ownership and rider assignment on every request. Do not grant Owner, Editor or Firebase Authentication Admin.

Store its Google service-account JSON as the Worker secret `FIREBASE_SERVICE_ACCOUNT`. For a key file available on your trusted operations machine:

```
npx wrangler@4 secret put FIREBASE_SERVICE_ACCOUNT --config cloudflare/delivery-api/wrangler.jsonc < /secure/path/service-account.json
```

Never add the key to Git, `NEXT_PUBLIC_*`, a frontend build, browser storage, or chat. Keep a key only in a secure credential store if operations requires a recovery copy. Rotate it by uploading a new key, validating access, then revoking the old Google key.

Public configuration in `wrangler.jsonc`:

- `FIREBASE_PROJECT_ID`: `partx-production`.
- `ALLOWED_ORIGINS`: exact comma-separated web origins, currently `https://motopart-web.vercel.app`.
- `NEXT_PUBLIC_PARTX_DELIVERY_API_URL` in the Next.js build can override the endpoint. The existing Worker URL is the default.

Health endpoint: `GET /health`. A 503 with `configuration: required` means the secret is missing or malformed. A 200 with `configuration: present` confirms configuration exists; it is not a database transaction or authentication test.

## Protected endpoints

POST JSON `{ "data": { ... } }` to:

- `/dispatchPartXDelivery`: seller assignment, cancellation or confirmed store return.
- `/updatePartXDelivery`: assigned rider acceptance, decline, pickup, issue reporting and delivery-code completion.
- `/getPartXDeliveryCode`: the associated customer's delivery code, after pickup.

Requests require `Authorization: Bearer <Firebase ID token>`. The Worker verifies Google's RS256 signature, audience, issuer, subject and token times. It then checks roles, store ownership and assignment using Firestore. CORS is restricted to configured origins. Responses and codes are never cached.

Firestore REST transactions preserve one active job per rider, retry aborted commits, apply server timestamp transforms and enforce creation/update preconditions. Wrong-code attempts commit before an error is returned; five attempts lock verification for five minutes. These behaviors share the same lifecycle implementation as the optional Cloud Functions adapter.

GPS remains a direct authenticated Firestore subscription/write with deployed security rules; coordinates do not flow through the Worker. There is no invented location, route or ETA. Browser sharing pauses when the portal is hidden.

Notifications run after successful transactions using existing `notificationDevices` registrations. A notification failure does not roll back a committed delivery. At most 20 registered devices per recipient are considered per event, in batches of five. For larger device fleets, add a dedicated queue rather than increasing request fan-out without reviewing Workers limits.

## Local verification

Install the root dependencies and `npm ci --prefix functions` for test fixtures only. Start the Firestore emulator on port 8082, then run:

```
FIRESTORE_EMULATOR_HOST=127.0.0.1:8082 node --test tests/firestore.rules.test.mjs functions/rider-service.test.js cloudflare/delivery-api/worker.test.mjs
npx wrangler@4 deploy --dry-run --config cloudflare/delivery-api/wrangler.jsonc
```

The tests use local demo projects, generated test signing keys and mocked OAuth/FCM responses. No production credentials or customer orders are needed.

Workers Free currently limits CPU time per request and daily requests. Firestore Spark also has daily read/write quotas. Monitor both during the pilot; being on Spark does not make database operations unlimited. SMS is not used for delivery codes: the customer sees the code in their order page.
