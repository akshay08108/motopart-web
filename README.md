# MotoPart

A responsive, vehicle-aware auto-parts storefront built from the supplied product requirements. The demo focuses on the MVP customer journey: select a vehicle, search by part or OEM number, verify fitment, browse inventory and ETA, add to cart, complete a three-step checkout, and track an order.

## Stack

- Next.js 15 App Router, React 19, and TypeScript
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

To connect a real backend later, implement `CommerceApi` with the production base URL and authentication strategy, then replace the exported `demoApi`. UI components do not depend on the data source.

## Vercel deployment

1. Push this folder to a GitHub repository.
2. Import the repository in Vercel.
3. Keep the detected framework as **Next.js** and deploy.

No required secrets are needed for demo mode. Add real API and provider credentials as Vercel environment variables when integrating authentication, payments, maps, search, and notifications. Never expose server credentials with a `NEXT_PUBLIC_` prefix.

## Suggested production integration order

1. PostgreSQL catalogue and vehicle fitment service
2. Auth and saved garage
3. Search provider and seller inventory
4. Razorpay payment intents and webhook verification
5. Maps, ETA, order tracking, and notifications
6. Admin and seller role-based surfaces

The reference visual concept is stored in `docs/design/storefront-concept.png`.
