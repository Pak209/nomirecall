# iOS Dev Build and TestFlight

Nomi is configured iOS-first. Use Expo Go only for quick JavaScript checks; use an iOS development build for native behavior and TestFlight confidence.

## Local Development Build

1. Install dependencies:
   ```sh
   npm install
   ```

2. Build a simulator development client:
   ```sh
   npm run build:ios:simulator
   ```

3. Start Metro for the development client:
   ```sh
   npm run ios:dev
   ```

Metro is still expected for development builds. If Metro disconnects, restart `npm run ios:dev`; TestFlight builds do not depend on Metro.

## Physical iPhone Testing

Build an internal development client for a real device:

```sh
npm run build:ios:device
```

This is the best lane for testing native iOS-only features before TestFlight, including the future iOS Share Extension for sharing from X, YouTube, Reddit, Safari, and other apps into Nomi.

## TestFlight

1. Confirm the App Store Connect app uses bundle id `com.dkimoto.nomi`.
2. Increment `expo.ios.buildNumber` in `app.json`.
3. Create the store build:
   ```sh
   npm run build:ios:production
   ```
4. Submit the latest build:
   ```sh
   npm run submit:ios
   ```

EAS will prompt for Apple credentials and App Store Connect details if they are not already configured locally.

## Later Android Transition

Keep app features inside Expo/React Native modules where possible. Native iOS additions, such as the Share Extension, should be isolated so the Android share target can be added later without rewriting capture or ingest logic.
