# Delivery address maps

Customers can change their delivery address from **My Garage → Delivery Location → Edit**, or **Checkout → Change delivery location**.

The picker supports MapTiler address search, map clicks, a draggable pin and device location. Customers should add the flat/building number and landmark in the full-address field before saving.

## Configuration

Set `NEXT_PUBLIC_MAPTILER_API_KEY` in Vercel and local `.env.local`, then rebuild. This is a browser-visible MapTiler key: restrict its allowed origins in MapTiler to your production domain and any development/native origins you use. Keep the MapTiler/OpenStreetMap attribution visible.

Device location requires browser permission and HTTPS (or localhost). Address entry remains available when maps or location permission are unavailable.

## Data

The default address is stored in `users/{uid}/deliveryLocations/default`. Its Firestore rules allow only that user to read and write it and validate coordinate ranges and address length. Deploy `firestore.rules` when enabling the feature.

New doorstep-delivery orders receive an immutable `deliveryLocation` snapshot. The seller order detail shows the full address and a map link when coordinates are available. Changing a saved address applies to future orders; it does not reroute an already-placed order.

Address selection does not calculate road distance, delivery coverage or tracking. Those require separate delivery/routing logic.
