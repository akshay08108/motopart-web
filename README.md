# PartX

A responsive, vehicle-aware auto-parts marketplace built from the supplied product requirements. It now supports the customer, seller, garage, fulfillment, offer, test-payment, order-history and customer-support flows end to end. Demo-created stores, garages, locations, orders and theme preference persist in the browser; the typed service layer can be replaced with real providers later.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Route Handlers for the demo REST API
- Local, generated product imagery with no runtime image dependency
- Plain design-token CSS for a small production bundle

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

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

No secrets are required for demo mode. To enable the same Google Places location picker pattern used by DiagHub, add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` locally and in Vercel. Restrict that browser key in Google Cloud to your deployed domains and the Maps JavaScript/Places APIs. The UI provides a manual-address fallback when the key is absent.

The fake payment screen never charges money. Use `4242 4242 4242 4242` for the approved card path; any other card number exercises the decline state. Replace only `processTestPayment` when integrating a real payment provider.

## Suggested production integration order

1. PostgreSQL catalogue and vehicle fitment service
2. Auth and saved garage
3. Search provider and seller inventory
4. Razorpay payment intents and webhook verification
5. Maps, ETA, order tracking, and notifications
6. Admin and seller role-based surfaces

Reference concepts are stored in `docs/design/`: the original storefront, expanded marketplace, store onboarding and checkout states.
