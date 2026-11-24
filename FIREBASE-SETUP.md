# Google sign-in + cloud sync setup (Android app)

1. Firebase console → Authentication → Sign-in method → enable **Google**.
2. Firebase console → Firestore Database → create (production mode), then **Rules** tab →
   paste the contents of `firestore.rules` → Publish.
3. Project settings → Your apps → Android (`com.visal.sinsubz`) → add the **SHA-1** of
   your debug keystore AND your release/Play signing key (Play Console → App signing).
   Download `google-services.json` again afterwards and put it in `android/app/`.
4. `npm install` then `npm run cap:sync` (this reads the project id from
   `google-services.json` and wires `app-account.js` into the app build).
5. Build the Android app. Settings tab → "Sign in with Google".

Synced per user in Firestore document `users/<uid>`: translation history,
translate settings (language), app settings (theme, release alerts).
