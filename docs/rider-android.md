# PartX Rider Android pilot

The rider app is a separate Android installation (`com.partx.rider`), with rider registration, sign-in, deliveries, earnings, history and profile routes. The customer and seller apps use `com.partx.app` and `com.partx.seller`. Rider access is still verified by Firebase and the delivery backend; hiding other routes does not grant permissions.

## Build

Use Node 22+, pnpm, Java 21 and Android SDK 36. Install dependencies with `pnpm install --frozen-lockfile`. Set `ANDROID_HOME` and `JAVA_HOME` for the build machine.

Create `android/rider-key.properties` using the structure below. Keep the keystore and passwords outside Git, back them up securely, and reuse the same signing key for updates:

```properties
storeFile=/absolute/private/path/partx-rider-release.jks
storePassword=YOUR_PRIVATE_PASSWORD
keyAlias=partx-rider
keyPassword=YOUR_PRIVATE_PASSWORD
```

Set `NEXT_PUBLIC_MAPTILER_API_KEY` to a MapTiler key permitted for `https://localhost`, then run:

```sh
pnpm android:rider
```

The signed APK is `android/app/build/outputs/apk/release/app-release.apk`. The rider flag must be present for both the static web build and Capacitor sync; the script handles this. Copy each APK to a separate location after building it. The role-specific build commands share the generated asset and APK output directories.

The delivery Worker explicitly permits the local Android origin `https://localhost`. Firebase ID tokens, role checks, assignment checks and delivery code verification remain required.

## Publish an app update

Riders who install the first update-enabled APK will see an **Update available** prompt when a newer rider release is published. The prompt opens the signed APK download in the browser. Android handles the installation and may ask the rider to allow installs from that browser.

1. Increase the rider `versionCode` and set the new `versionName` in `android/app/build.gradle`. Build the APK with `pnpm android:rider` and verify its signature matches the previous rider release. Keep the app ID `com.partx.rider`.
2. Upload that APK to a public GitHub release in `akshay08108/motopart-web`. Use the tag `android-rider-<versionCode>` and the asset name `PartX-Rider.apk`. Target the commit used to build the APK. Verify the download opens without signing in.
3. Update the `rider` entry in `public/android-releases.json` with that exact version code and name. Deploy the website after the APK download is ready. Confirm that the production manifest reports the new version and that an older update-enabled APK offers the download.

Version 0.3.0 and earlier must install the first update-enabled APK manually. The manifest currently announces rider releases.

## Pilot limits

- Live assignments, session sound and location sharing work while the app is open and connected. Android asks for location permission when the rider starts sharing. No background location permission is requested.
- Native background push notifications and background tracking are not included. Keep the app open during an active delivery; a dedicated background service/FCM integration is needed before promising closed-app notifications or continuous tracking.
- New riders register and verify their email. Existing riders use the sign-in link on that screen. Password reset uses Firebase email.
- Calls and navigation open installed phone/maps apps. Map rendering needs internet and a valid MapTiler key.
- Earnings are recorded by the existing backend; this APK does not transfer money automatically.

Verify a real assignment, Android location permission, customer-visible location updates, pickup, delivery code, earnings and sign-out on a physical phone before operational rollout. Emulator launch checks cannot validate real GPS accuracy or phone-specific power management.
