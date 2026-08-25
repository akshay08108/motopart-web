# PartX

A responsive, vehicle-aware auto-parts marketplace built from the supplied product requirements. It supports customer and seller accounts through Firebase Authentication and Firestore role profiles. Catalogue, garage, fulfillment, offer, test-payment, order-history and customer-support data remain demo-backed while those collections are migrated.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Firebase Authentication and Cloud Firestore role profiles
- Route Handlers for the demo REST API
- Local, generated product imagery with no runtime image dependency
- Plain design-token CSS for a small production bundle

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Firebase setup

The web app is registered with the `partx-production` Firebase project. Complete these console steps before testing account creation:

1. Go to **Security → Authentication → Sign-in method** and enable **Email/Password**.
2. Go to **Databases & Storage → Firestore**, create the default database in production mode, and choose the closest permanent region.
3. Go to **Databases & Storage → Storage**, create the default Storage bucket, and keep the project-selected location.
4. Publish [`firestore.rules`](firestore.rules) and [`storage.rules`](storage.rules), or deploy both with the Firebase CLI:

```bash
firebase login
firebase deploy --only firestore:rules,storage --project partx-production
```

Customer registrations are active immediately. Seller registrations create a pending user and store. To approve a seller from the Firebase console, change `users/{uid}.sellerStatus` and the related `stores/{storeId}.status` from `pending` to `approved`. The user profile listener applies the approval without creating a new account.

Approved sellers can upload JPG, PNG or WebP product images up to 5 MB. Bulk inventory supports an optional Barcode column. Standard USB or Bluetooth scanners configured in HID/keyboard mode can scan directly into that field without a scanner SDK.

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Demo API

The UI talks to a typed `CommerceApi` interface in `lib/api/client.ts`. The current implementation uses same-origin demo Route Handlers:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/vehicles` | GET | Saved vehicle selection |
| `/api/parts?query=&category=&vehicleId=` | GET | Catalogue/OEM search and filtering |
| `/api/compatibility?partId=&vehicleId=` | GET | Fitment check |
| `/api/cart` | POST | Demo cart persistence contract |
| `/api/checkout` | POST | Validated checkout and order creation |
| `/api/orders` | GET | Order history |
| `/api/tracking?orderId=` | GET | Delivery status |
| `/api/stores` | GET, POST | Marketplace stores, prices and inventory |
| `/api/garages` | GET, POST | Saved installation garages |
| `/api/offers` | GET | New-user and promotional offers |
| `/api/payments/mock` | POST | Safe test-payment approval/decline contract |
| `/api/support` | POST | Per-order support ticket creation contract |

To connect a real backend later, implement `CommerceApi` with the production base URL and authentication strategy, then replace the exported `demoApi`. UI components do not depend on the data source.

## Vercel deployment

1. Push this folder to a GitHub repository.
2. Import the repository in Vercel.
3. Keep the detected framework as **Next.js** and deploy.

The Firebase web configuration identifies the public web app; access is enforced by Authentication and Firestore Rules. Never add a Firebase Admin service-account key to client code. To enable the same Google Places location picker pattern used by DiagHub, add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` locally and in Vercel. Restrict that browser key in Google Cloud to your deployed domains and the Maps JavaScript/Places APIs. The UI provides a manual-address fallback when the key is absent.

The fake payment screen never charges money. Use `4242 4242 4242 4242` for the approved card path; any other card number exercises the decline state. Replace only `processTestPayment` when integrating a real payment provider.

## Suggested production integration order

1. Firestore catalogue, saved garage and order collections
2. Search provider and seller inventory
3. Razorpay payment intents and webhook verification
4. Maps, ETA, order tracking, and notifications
5. Admin approval and moderation surfaces

Reference concepts are stored in `docs/design/`: the original storefront, expanded marketplace, store onboarding and checkout states.
