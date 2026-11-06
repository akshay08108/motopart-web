# Seller payment list and notification registration

- Sellers can remove only their own `VERIFICATION_FAILED` payment entries from the active list. `orders/{id}.paymentArchivedAt` records this as a server timestamp; restore sets it to null. The order, UTR, amount, payment state, stock and fulfilment history are unchanged.
- Removed entries are available in the **Removed** tab. A new customer submission is always visible. If that attempt is rejected too, its newer `paymentSubmittedAt` makes it visible again rather than inheriting an earlier attempt's archive.
- Firestore permits only the owning seller to change the archive timestamp, only for a failed payment, with no accompanying financial/state mutations. Customer checkout cannot create an already-archived order.
- Notification device IDs hash both account UID and FCM token. Account changes retire the old browser token; the existing trusted notification senders prune unregistered legacy records. Client apps never overwrite or delete another account's record.
- Registration and unregistration run in sequence, check the current Firebase UID before saving, and ignore stale UI results after account changes. Browser notification permission and successful device registration are distinct states. Errors identify notifications and offer a retry instead of appearing to be payment failures.

Checks:
```
node --experimental-strip-types --test tests/push-registration.test.mjs tests/seller-payment-state.test.mjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8082 node --test tests/firestore.rules.test.mjs
```
