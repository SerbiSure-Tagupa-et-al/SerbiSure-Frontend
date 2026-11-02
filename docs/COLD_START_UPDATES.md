# Cold-start OTA updates

For the newer APK-first flow, CI setup and distribution requirements, see [Release safety](RELEASE_SAFETY.md).

`App.tsx` mounts `ColdStartUpdateGate` before fonts, session restoration, providers and navigation. `coldStartUpdates.ts` shares one operation per JS launch, including root remounts. It does not listen for app resume.

- Development and web bypass the gate.
- A successful check with no update opens the app without displaying the update screen. The network check itself still takes time; there is no added timer.
- An available update displays the English update screen, downloads through Expo, then reloads. The old app never opens after a reload request.
- Check, download or reload errors show only Retry. Repeated taps do not start duplicate operations. A reload retry reuses the downloaded bundle.
- **Offline cold starts are blocked on Retry**, including when checking availability fails. This is the fail-closed behavior of the mandatory gate. Already-open sessions are not rechecked on resume.
- Expo manages asset verification, atomic installation and recovery. The app does not write bundles itself. Android Back cannot dismiss the gate; the OS can still background or terminate the app.

## Native configuration and rollout

`app.json` uses `updates.checkAutomatically: ON_ERROR_RECOVERY`; the checked-in Android manifest uses `ERROR_RECOVERY_ONLY`. This gives normal launch checking to JavaScript while retaining Expo error recovery. Runtime is now `2.1.2` for the native installer permission; the production channel is unchanged.

The native launch-policy change takes effect in a **rebuilt APK**. An OTA containing the gate can reach compatible installed APKs, but cannot rewrite their embedded native launch policy. Older APKs without this gate do not gain mandatory checking until they receive its code. OTA updates must still match each APK's native runtime; this feature is not an API-level minimum-version system.

See [Expo update download strategies](https://docs.expo.dev/eas-update/download-updates/) and [runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/).

## Automated checks

From the mobile project:

```cmd
node --test tests/cold-start-updates.test.cjs tests/remember-session.test.cjs tests/mediapipe-patch.test.cjs
npm run typecheck
```

The update tests mock Expo's native APIs. They cover cold-start deduplication, dev/web bypass, no-update continuation, deferred downloads, failures and Retry, rollback directives, root blocking, exact UI messages, and configuration. They do not prove a real native download/restart.

For the expanded APK-first flow, also run `npm test` and consult the release-safety QA report. After repairing incomplete fixtures and stale UI expectations, the full suite passes: 418 tests, zero failures or skips. Production startup behavior was not changed by those test repairs.

## Release-device checks still required

Use a separate test channel/runtime-compatible release build and a harmless test OTA. Do not publish to production just to run this checklist.

1. With no newer OTA, cold-launch: the normal app opens without an update screen.
2. Publish a newer compatible test OTA, then cold-launch: only the update screen appears, followed by automatic restart and the new code. It must not loop afterward.
3. Background/resume an already-open app: no new availability check or update screen.
4. Disconnect during download: loading stops on failure, Retry stays visible, main screens remain blocked. Restore connectivity and Retry: download/restart succeeds.
5. Force-stop during download, then reopen online: Expo starts safely and the gate completes or retries the update.
6. Cold-launch offline: Retry screen; reconnect and retry. Android Back cannot bypass it.
7. Check a small phone, large system text and screen reader: title, messages and Retry remain readable/reachable.

No APK build, OTA publish or device test is performed by the automated checks above.
