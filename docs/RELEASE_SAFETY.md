# Release safety and app updates

## One-time setup by the organization repository administrator

These source files do not alter GitHub settings. Before relying on the merge lock:

1. In **SerbiSure-Tagupa-et-al/SerbiSure-Frontend → Settings → Rules → Rulesets**, protect `main`, require a pull request and the **Release safety gate** check from GitHub Actions. Run the workflow once if the check is not yet selectable.
2. Require branches to be up to date (or use a merge queue), code-owner review, and disallow bypass/direct pushes, force pushes and branch deletion. Review CODEOWNERS: the named owner must have write access and the repository plan must support these protections.
3. Add an organization/repository Actions secret **EXPO_TOKEN** with access to this Expo project. Enable Actions read/write contents permission for the official release job. PR jobs have read-only access and receive no publishing secret.
4. Ensure Expo's existing `production` channel points to its `production` branch. The OTA job checks the mapping and fails instead of changing it silently.
5. Deploy the new backend endpoint before distributing an APK that requires it. No database migration is needed. The endpoint uses the public official GitHub repository; a private repository would require a separate authorized authentication change.

Branch protection, Expo credentials and actual CI runs require repository access; they cannot be validated from local source files. Never report the merge lock as enabled until checked in GitHub.

## What runs

- `pr-check.yml` (**Release safety**) runs for every PR to main, main push and merge group. Every run executes `npm ci`, typecheck and **all tests**. It computes a single native-vs-OTA plan over the whole change range, including deletions. Native/config/dependency changes also compile all release APKs with Gradle. The final `always()` gate fails when any required job fails or is unexpectedly skipped.
- On a successful **main push** only, `build-and-release-apk.yml` publishes the APKs from that exact verified CI run. It does not rebuild different bytes after checking them. All three ABI variants must be present and match the package version and Android metadata. SHA256SUMS accompany the APKs. Upload into a draft first, then publish, so the backend never advertises a half-uploaded release. Tags are `vX.Y.Z`; existing published releases cannot be overwritten.
- Write PR titles in English: GitHub's generated release notes copy those titles and do not translate them.
- On a JS/assets-only successful main push, `ota-update.yml` publishes Android OTA to production. Native changes win over JS when both changed. Root `App.tsx` changes count too. Docs/tests-only changes do not deploy unless they carry JavaScript changes since the current published native tag, so a later docs merge cannot silently lose a queued OTA. Native models, build/patch scripts, app configuration, dependencies and workflow policy changes use the conservative APK track.
- Both publishing workflows are triggered by completion of Release safety, rather than racing the checks on the same push. They verify the source event, official repository, exact SHA and trusted artifact run. Fork syncs and PR completions cannot publish. Quality jobs also skip direct main pushes in forks, so Sync fork does not compile APKs there. PR checks still run for PRs targeting main.
- OTA requires an existing published APK tag for the current runtime and no native changes since that tag. If a native release is still running, OTA fails closed; rerun the failed OTA workflow after the APK is published. Never remove this check to rush a release.

## Versions and Android installation

This native release is **2.1.3**, base versionCode **24**, runtime **2.1.3**. The native window now keeps the existing splash logo visible until React draws; this change requires a rebuilt APK. Existing users without the native installer permission must install a compatible APK once; JavaScript cannot inject a missing Android permission.

For future native changes, increase X.Y.Z in package.json, both root versions in package-lock.json, app.json version + android.runtimeVersion, Android versionName, and strings.xml expo_runtime_version. Increase the base versionCode in app.json and Gradle. CI rejects mismatches or native changes without a version increase. Do not bump for JS-only changes.

APK output version codes are `base * 1000 + 1` (ARM32), `+2` (ARM64), `+3` (Universal). Giving Universal the highest code lets it upgrade previously installed ABI-specific APKs. The backend advertises the universal APK automatically; installed **native** version comparisons handle 2.1.10 correctly relative to 2.1.9.

The existing Android release signing uses the repository's debug keystore. It is preserved for compatibility with existing local releases, **not made secure by this task**. Anyone with that key can sign another APK. A production signing-key migration and Play distribution need a separate explicit decision; never change the key silently or tell users to uninstall (that can lose local data). APKs signed with another key cannot upgrade in place.

## Phone behavior

On each fresh launch, a bundled logo, system-font "Starting SerbiSure..." message and spinner stay visible during checks. Android calls `/api/v1/app-version/` before OTA. Both availability checks share a single six-second deadline, including response parsing. Failure or timeout shows "Connection is taking too long. Please check your internet connection." and Retry, without opening the app. Retry starts a fresh check; late results from an expired check cannot unlock the app or trigger a download/reload. The native fetch is aborted; Expo's non-cancellable check can finish internally, but its late result is ignored. Actual update downloads are not limited to six seconds. Font loading and saved-login restoration also display the branded loader after the update gate succeeds.

A newer APK shows its version, release notes and Download & Install Update. A partial file is never sent to the installer: HTTP status and the published asset size are checked, then the complete file is renamed. Android validates the package/signature and the user approves installation. A size check is not a cryptographic authenticity check.

If installation is cancelled or permission is denied, the app remains blocked with Install Update / Allow installation. Returning from Settings does not run another cold-start check. A missing cached file can be downloaded again. Downloads restart on Retry rather than implementing complicated persistent resume state. Completed and partial files use app cache, not shared Downloads. After Android finishes the installation, the user may need to tap Open in the system installer; this is not a silent installation or a guaranteed automatic APK restart.

If the native version is current, the existing mandatory OTA gate downloads and reloads through Expo. Checks are skipped in development and on web; iOS retains the OTA-only path. Network/version-service errors block startup with Retry; they do not silently claim the app is current. No available update means normal navigation without displaying an update screen, after the network check completes. Already-open sessions do not check on resume. Backend API compatibility still matters: this does not force updates onto a phone that never closes its app.

## Verification before enabling production

Startup-screen fix validation (November 2, 2026): all **425 tests** pass with zero failures or skips; TypeScript and `assembleRelease -x lint -x test --no-daemon` pass. Regression checks cover the shared six-second deadline, aborted native requests, late native/Expo results, duplicate Retry taps, loading during fonts/session restoration and downloads lasting longer than the availability-check deadline. The rebuilt 2.1.3 startup experience still needs a real-phone visual check; this change has not been published.

Local validation on November 2, 2026: TypeScript, 26 focused update/release tests, 12 backend tests and native APK compilation passed. The subsequent full-suite repair passes all 418 tests, with zero failures or skips. Incomplete session/image/location fixtures were supplied, and superseded booking/translation interactions were updated to the current UI. Date, pay, consent, retry and submission checks remain covered; an additional test protects the official support logo alongside worker-photo tests. No production source or release workflow was changed during that repair. No production release or hosted workflow run has been performed; repository setup and device validation are still required below.

Run `npm test` and `npm run typecheck`. Run backend `venv\Scripts\python.exe -m pytest core/test_app_version.py -q`. Confirm a native PR actually runs Gradle and fails if compilation fails; confirm a JS-only PR skips only native compilation. Test mixed changes and fork syncs. Do not fake failures by changing workflows or disabling assertions.

On a budget Android phone, test native version current/newer, network loss during download, low storage, cancelled installer, denied installation permission, Allow installation return, app termination mid-download and successful in-place upgrade. Test OTA-only restart, no-update launch, dev bypass and background/resume. Verify screenshots/release notes remain readable with large text. These require a real release build, a test release/channel and the same signing identity. Do not publish to production just to test.

References: [GitHub required checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks), [GitHub releases API](https://docs.github.com/en/rest/releases/releases), [Expo runtimes](https://docs.expo.dev/eas-update/runtime-versions/), [Android installation permission](https://android-developers.googleblog.com/2017/08/making-it-safer-to-get-apps-on-android-o.html).
