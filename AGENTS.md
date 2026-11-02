# SerbiSure mobile release rules

Read `docs/RELEASE_SAFETY.md` before changing release or update code.

- JavaScript/assets ship through Expo OTA. Native/dependency/configuration changes ship through a new APK from the official organization repository only.
- All PRs to main must pass typecheck and **the entire** `npm test` suite. Native changes must also compile using `./gradlew assembleRelease -x lint -x test --no-daemon`. The required GitHub check is **Release safety gate**; configure main protection as documented. A local YAML file alone does not enforce branch protection.
- Never delete, disable, skip, relax or falsify workflows, test assertions, build steps or required checks to make a failing PR mergeable. Fix the root cause. Do not add `continue-on-error`, excluded test lists or success fallbacks. Test fixture repairs must represent real dependencies while retaining assertions and coverage, never hide a failing behavior.
- Changes to release policy/workflows require explicit authorization and owner review. This initial release-safety implementation is authorized by the user's master task; it is not permission to weaken future checks.
- Only native releases bump the stable `X.Y.Z` version. Keep package.json, both root lockfile versions, app.json version/runtime/versionCode, Android versionName/versionCode and expo_runtime_version aligned. Increase Android versionCode too. JavaScript-only updates keep the existing runtime/version.
- Do not publish an OTA to a runtime whose APK has not been published. Mixed native/JS changes use only the APK track. Native model assets and build/patch scripts also require the native track.
- Never publish from forks or PR jobs. Never use `pull_request_target` to execute contributor code with publishing secrets. Release only artifacts from the successful main-push run, at that exact SHA.
- Updates run on cold start only and bypass `__DEV__`. Check the public backend app-version endpoint first on Android, then OTA. Never treat failed checks as proof of being up to date or unlock after an installer is cancelled.
- Use the installed version from expo-application, not the OTA bundle's app.json version. Android requires user approval and may require Allow installation. No silent-install claims.
- Preserve the signing identity of installed APKs. Do not replace the keystore, change applicationId, or silently switch to a different signing key. The inherited debug-key signing limitation is documented; migration needs an explicit distribution decision.
- No database changes are needed for updates. Never commit secrets or publish/merge/deploy just to test this work.
