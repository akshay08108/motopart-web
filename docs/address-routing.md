# Postal autofill and road routing

PIN lookup uses SearchPincode.in through `/api/locations/pincode?pin=505325`.
The response is cached for a day on the web server. The reusable address control
offers post-office selection, district/state lookup, retry and manual entry.
Postal details append to the building/street address; they never establish a map
pin. Updating postal details clears an existing pin so it cannot silently point
to the previous address. The control includes the provider's required attribution.

## Routing configuration

Create an API key at https://account.heigit.org/ and confirm the selected plan's
commercial-use terms and request allowance. Store it as the encrypted
`OPENROUTESERVICE_API_KEY` secret on `partx-delivery-api` using Wrangler secret put.
Do not put it in a NEXT_PUBLIC variable, repository, Android assets or browser.
Deploy the delivery Worker before publishing the updated web clients.
The integration calls the current `api.heigit.org/openrouteservice/v2/directions`
endpoint, not the deprecated `api.openrouteservice.org` endpoint.

`quotePartXRoute` requires Firebase authentication. Customers quote a store to
their selected destination; sellers quote only their own orders/after-sale rides.
It accepts no client-selected origin for store routes. Requests are limited to
30/minute per user per Worker instance (not a substitute for provider quotas).
Route summaries have a bounded five-minute in-memory cache. Provider failures
are not cached. Coordinates are sent over HTTPS to HeiGIT to obtain routes.

Checkout uses road distance for the existing fee bands and store delivery radius.
The first-two-deliveries promotion and free self pickup remain. Paid delivery
requires valid map pins and a successful route; no straight-line fee fallback is
used by checkout. Razorpay rechecks the saved destination and route server-side.
Direct UPI/COD continue through the existing Firestore transaction, re-requesting
the road quote and checking the displayed fee before creating an order. This
does not replace existing direct-payment verification with a payment gateway.

Rider assignment recomputes both route directions on the trusted Worker and
ignores a submitted distance when using per-km earnings. One-way roads can make
the return distance different. Existing ₹5/km / PartX-paid policy stays intact.
After-sale return rides start at the customer; replacement rides start at the
store. The quote is frozen on assignment and shown before the rider accepts.
Legacy records retain their seller-entered distance labels. Test payment rides
still earn no payable balance. Fixed-fee rider policies are unchanged.

Driving duration is an estimate, excluding traffic, packing and stops. This is
road routing, not rider GPS tracking or an audited odometer. MapTiler continues
to display maps. Retain the visible HeiGIT/OpenStreetMap attribution.

## Verification

Run `node --experimental-strip-types --test tests/address-routing.test.mjs` for
parsing, timeout/provider failures, independent return distance, cache and fee
band tests. Run lint, TypeScript checks, production build and the existing rider
and Worker emulator suites before publishing. A key is required for live routing;
sample tests use mocked responses and never consume a production order.
