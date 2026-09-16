# PartX

A responsive, vehicle-aware auto-parts marketplace built from the supplied product requirements. It supports customer and seller accounts through Firebase Authentication and Firestore role profiles, with Firestore-backed stores, products, orders, support tickets, reviews and inventory. Seed data and selected fallback APIs remain available for local development.

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

Customer and seller registrations are active immediately. Sellers can create their store and publish products without an approval queue.

Sellers can upload JPG, PNG or WebP product images up to 5 MB immediately after creating a store. Bulk inventory supports an optional Barcode column. Standard USB or Bluetooth scanners configured in HID/keyboard mode can scan directly into that field without a scanner SDK.

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

Checkout currently supports cash on delivery and direct seller UPI. A submitted UPI reference is a seller-review workflow, not proof of payment from a payment network. Before accepting live prepaid orders, integrate a payment gateway with server-side order creation, signature verification and webhooks; never approve payments from a customer-entered reference alone.

## PartX Android Development

PartX uses Capacitor to package a static copy of the existing application. The normal Next.js/Vercel build remains unchanged: web requests still use the Next.js route handlers, while the packaged app calls the HTTPS PartX API configured by `NEXT_PUBLIC_PARTX_API_BASE_URL`.

### Prerequisites

- Node.js 22 or newer and pnpm 11
- Java 21
- Android Studio with Android SDK Platform 36 and an emulator or USB-debugging device

Install dependencies and verify the normal web app:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
```

Build and sync the packaged Android web assets:

```bash
pnpm build:mobile
pnpm cap:sync
```

`pnpm build:mobile` creates the static application in `out/`. Capacitor copies that build into the native project at `android/`; it does not load the Vercel website as its primary interface.

Open or run the Android project:

```bash
pnpm android:open
pnpm android:run
```

Create a debug APK:

```bash
pnpm android:debug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

### Release signing and Play bundle

Create the release keystore in a secure directory outside this repository. Do not share or commit it:

```bash
keytool -genkeypair -v -keystore /absolute/secure/path/partx-release.jks -alias partx -keyalg RSA -keysize 2048 -validity 10000
```

Copy `android/key.properties.example` to `android/key.properties`, then fill in the absolute keystore path, alias, and passwords. The real properties file and all `.jks`/`.keystore` files are ignored by Git.

Build a signed release APK or AAB:

```bash
pnpm android:release
pnpm android:bundle
```

Outputs are written to:

- `android/app/build/outputs/apk/release/app-release.apk`
- `android/app/build/outputs/bundle/release/app-release.aab`

Without `android/key.properties`, Gradle can compile the release variant but will not produce an installable signed production artifact.

### Firebase and future native features

The current app uses the Firebase JavaScript SDK for email/password authentication and Firestore, so it does not need `google-services.json`. Authentication persistence remains in the Android WebView storage. Add `android/app/google-services.json` only when native Firebase features such as Firebase Cloud Messaging or native Google sign-in are introduced; that file is ignored by Git.

No camera, location, notification, contacts, microphone, or storage permission is currently requested. Add each permission only when its matching native feature is implemented. Browser file selection and existing UPI/deep-link behavior continue through the Android WebView.

After every future PartX web change, refresh Android with:

```bash
pnpm build:mobile
pnpm cap:sync
pnpm android:run
```

The static Android build intentionally uses query-based product and order detail routes. Keep using the helpers in `lib/navigation.ts` when adding new product/order links so both the Vercel and packaged routes remain valid.

## Suggested production integration order

1. Firestore catalogue, saved garage and order collections
2. Search provider and seller inventory
3. Razorpay payment intents and webhook verification
4. Maps, ETA, order tracking, and notifications
5. Admin approval and moderation surfaces

Reference concepts are stored in `docs/design/`: the original storefront, expanded marketplace, store onboarding and checkout states.
