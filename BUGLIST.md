# Bug List

## AppImage EGL_BAD_ALLOC on Arch Linux (v0.6.0)

**Symptom:** AppImage crashes on Arch Linux with `Could not create surfaceless EGL display: EGL_BAD_ALLOC. Aborting...`. Window flashes briefly then disappears; tray icon visible but no window.

**Root Cause:** AppImage bundles Ubuntu 22.04's `libwayland-egl.so.1` and other Wayland libraries, which are incompatible with Arch Linux's rolling-release Mesa GPU drivers. WebKit tries to create an EGL display using the bundled libraries and fails.

**Fix:**
1. Remove bundled Wayland libraries from AppImage (`libwayland-egl.so.1`, `libwayland-client.so.0`, `libwayland-cursor.so.0`, `libwayland-server.so.0`, GTK Wayland IM modules) so the host system's libraries are used.
2. Patch `AppRun` to set `WEBKIT_DISABLE_GL=1` and `LIBGL_ALWAYS_SOFTWARE=1` as a fallback for systems where EGL still fails.
3. Set `GDK_BACKEND=x11`, `WEBKIT_DISABLE_DMABUF_RENDERER=1`, `WEBKIT_DISABLE_COMPOSITING_MODE=1` in AppRun to avoid GPU compositing issues.

**Note:** Environment variables set inside `main()` via `std::env::set_var` are too late — EGL initialization happens during dynamic library loading, before `main()` runs. The fix must be in the `AppRun` wrapper script.

**Affected:** All Linux AppImage builds (amd64, aarch64). Fixed in v0.6.0 CI by adding a post-build patch step.

**Note:** See "appimagetool was never extracted" below — this CI-side fix silently never ran in any release up to v0.6.1, because the patch step depended on an extraction that was failing with its error discarded.

**References:**
- https://github.com/niclas-niclasniclas/niclasniclasniclas/issues/1 (EGL_BAD_ALLOC with AppImage on rolling-release distros)

## Super+Space sidebar toggle cancels itself out (v0.6.2)

**Symptom:** `Super+Space` looks dead — the docked sidebar flashes for ~50ms and returns to its previous state, so it never actually opens. The window sits in that state indefinitely, which is also why `import -window` failed to capture it during development (the X window reported `IsUnMapped`).

**Root Cause:** `tauri_plugin_global_shortcut` fires the `on_shortcut` callback twice per physical keypress — once with `ShortcutState::Pressed`, once with `ShortcutState::Released`. The handler ignored the event state and called `toggle_docked_window()` both times, so the second toggle undid the first.

The callback signature made this invisible: it was written `|_app, _event, _shortcut|`, but the plugin actually passes `|app, shortcut, event|`. The names were swapped, so `event` — the argument carrying `state()` — sat in the `_shortcut` slot and was never read.

**Fix:**
1. Return early unless `event.state() == ShortcutState::Pressed`.
2. Correct the callback parameters to the real signature `|_app, _shortcut, event|`.

**Note:** Diagnostic `info!` logging was added alongside the fix and deliberately kept: in `toggle_docked_window` (branch + result), the shortcut callback (event state), both tray handlers, and the `CloseRequested` handler. Next time window visibility misbehaves, the log will show which path called `hide()`.

**Debugging gotcha:** `win.is_visible()` is GTK's own visibility flag, not the X server's Map State. `xwininfo` and `is_visible()` are independent sources of truth and can disagree — validating one against the other misdirects the investigation.

**Open (not fixed):** `CloseRequested -> hide` was logged twice with no in-app trigger. The app has no blur/focus auto-hide; the only in-repo sources are the UI ✕ button (`window_close` command) and an external `WM_DELETE_WINDOW`. Not yet reproduced deterministically.

**Affected:** Desktop client on all platforms — the global-shortcut plugin emits release events everywhere.

**Status:** Fixed in v0.6.2 (commit `5b49c1e`).

## appimagetool was never extracted — EGL fix silently a no-op (v0.6.2)

**Symptom:** Every Linux job failed at `Install system dependencies` with exit 1. On GitHub the failing line was never shown — the step's `dd`/`unsquashfs` output was discarded, so the log ended with the last successful `apt-get` line and then `##[error]Process completed with exit code 1.`

**Root Cause:** Two bugs stacked:

1. `SQFS_OFF=$(python3 -c "...print(d.find(b'hsqs'))")` takes the offset of the **first** occurrence of the four bytes `hsqs` anywhere in the file. In appimagetool's x86_64 build that first occurrence is machine code in `.text`:

   ```
   all 'hsqs' occurrences: [194183, 944632]
      off=194183  block_size=0x7b8d48dd   ← .text, not a superblock
      off=944632  block_size=0x20000      ← the real superblock
   ```

   The offset and the `dd` were both correct; the offset *source* was not. `dd` sliced from 194183, producing a payload with no valid superblock, and `unsquashfs` reported `FATAL ERROR: Can't find a valid SQUASHFS superblock`. `/tmp/squashfs-root` was therefore never created, while the wrapper script hardcodes `/tmp/squashfs-root/usr/bin/appimagetool`.

2. The failure was invisible, and had been for a release. The extraction arrived in `fba82d0` already muted (`unsquashfs ... >/dev/null 2>&1`), and every run until `ef41748` failed on it. `ef41748 "debug: show unsquashfs errors"` surfaced the output and appended `|| true` — deliberately, to get the job past the failure while diagnosing it — and that crutch is what let v0.6.1 ship. `49668de "chore: clean up debug output in CI"` then removed the debug output *together with* the `|| true`, restoring the silent form and removing the crutch. The next release failed on the still-broken extraction.

**Note:** This was not introduced by the v0.6.2 release, and it means the EGL workaround documented above **never ran in a released artifact** — v0.6.1's AppImage was produced by `/tmp/squashfs-root/usr/bin/appimagetool`, the real bundled binary, because the wrapper at `/usr/local/bin/appimagetool` pointed at a directory that was never created. The v0.6.1 tag passing was an artifact of the `|| true`, not of the fix working.

**Fix:** Stop guessing the offset — hand the job to the AppImage's own runtime, which knows where its payload is:

```bash
(cd /tmp && APPIMAGE_EXTRACT_AND_RUN=1 /tmp/appimagetool-src --appimage-extract >/dev/null)
test -x /tmp/squashfs-root/usr/bin/appimagetool
```

`APPIMAGE_EXTRACT_AND_RUN=1` is required because GitHub runners have no FUSE. The added `test -x` makes a silent extraction failure fail the step loudly instead of leaving the wrapper pointing at a missing directory.

**Affected:** Both `build-linux-amd64` and `build-linux-aarch64`.

**Status:** Fixed in v0.6.2 (commit `0feba2b`) — the build no longer fails. See the next entry: the fix it was meant to enable still had not taken effect.

## The EGL workaround never ran — appimagetool wrapper was unreachable (v0.6.2)

**Symptom:** No failure, no error — the released Linux AppImages looked fine and were identical in kind to every previous release. But they did not carry the EGL workaround documented at the top of this file: `AppRun` is linuxdeploy's autogenerated script with no exports, and `libwayland-egl.so.1`, `libwayland-client.so.0`, `libwayland-cursor.so.0`, `libwayland-server.so.0` and the `im-wayland*` GTK modules are all still bundled. Any Arch user hitting the original crash would still hit it.

**Root Cause:** The CI step wrote a wrapper to `/usr/local/bin/appimagetool` and expected `cargo tauri build` to invoke it, so that the wrapper could rewrite AppRun and delete the Wayland libraries from the AppDir on the way past. Neither tauri-cli nor tauri-bundler ever calls a PATH `appimagetool`. tauri-cli 2.12.1 drives the `appimage` output through linuxdeploy, and the appimage output plugin locates appimagetool inside the linuxdeploy-plugin-appimage AppImage that tauri-bundler downloads itself:

```
Downloading https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/releases/download/continuous/linuxdeploy-plugin-appimage-x86_64.AppImage
[appimage/stdout] Found appimagetool: /tmp/appimage_extracted_3e47bb3598c757625f89e196368f9fc3/usr/bin/appimagetool
[appimage/stderr] Running command: /tmp/appimage_extracted_3e47.../usr/bin/appimagetool "NotifyHub Client.AppDir" "...AppImage"
```

A file on `PATH` cannot intercept a path resolved inside another bundle. The wrapper was created (`wrapper created at /usr/local/bin/appimagetool`) and never executed — grep for its invocation in the run log returns zero.

**Diagnosis note:** A green build proved nothing here. The build had been *failing* on the extraction (see the previous entry) so the wrapper step never even completed on recent runs, which made it easy to assume it worked once that was repaired. What settled it was unpacking the published artifact — `--appimage-extract`, then read `AppRun` — rather than reading the CI log.

**Fix:** Stop trying to interpose. Patch the AppImage after it is built, in both linux jobs:

```yaml
- name: Patch AppImage (fix EGL_BAD_ALLOC)
  working-directory: desktop
  run: |
    APPIMAGE=$(find target/release/bundle/appimage -name "*.AppImage" | head -1)
    ./patch-appimage.sh "$APPIMAGE" x86_64
```

`desktop/patch-appimage.sh` extracts with the AppImage's own runtime (`APPIMAGE_EXTRACT_AND_RUN=1`), rewrites `AppRun`, removes the Wayland libraries and `im-wayland*` modules, repackages via appimagetool, swaps the result in only on success, and then re-extracts `AppRun` to assert `WEBKIT_DISABLE_GL` is present — failing loudly if the rewrite did not take, which is exactly the silence that hid this for two releases. The appimagetool extraction in the install step stays: the script needs that binary, and it doubles as the check on the extraction fix above.

**Affected:** Linux AppImages only, in every release since v0.6.0. The macOS `.dmg` and Windows `.msi` are unaffected — this is a Linux packaging path.

**Status:** Fixed in v0.6.2 (commit `8fc56b9`).

## Tauri npm/crate version mismatch blocks every desktop build (v0.6.2)

**Symptom:** `cargo tauri build` aborts ~0.3s in, before compiling anything:

```
Error [tauri_cli] Found version mismatched Tauri packages. Make sure the NPM package and Rust crate versions are on the same major/minor releases:
tauri (v2.11.5) : @tauri-apps/api (v2.12.1)
tauri-plugin-fs (v2.5.1) : @tauri-apps/plugin-fs (v2.6.0)
tauri-plugin-dialog (v2.7.1) : @tauri-apps/plugin-dialog (v2.8.1)
```

Hit linux-amd64, linux-aarch64, macOS and Windows — every platform that builds the desktop client.

**Root Cause:** `desktop/ui/package.json` specified `^2.x` for the Tauri npm packages, and `desktop/ui` had no committed lockfile. The repo's `.gitignore` contains a bare `package-lock.json` rule which, being unanchored, matches at every depth and so also excludes `desktop/ui/package-lock.json`; the root `pnpm-lock.yaml` does not cover `desktop/ui` because CI installs it with `npm install` in that directory. With nothing pinned, each run resolved to the newest matching minor. The Rust crates are pinned by `desktop/Cargo.lock`, so the two sides drift apart whenever upstream publishes ahead of the crate release.

v0.6.1 got through by luck: its log runs from `Looking up installed tauri packages` straight to `Running beforeBuildCommand` with no mismatch reported.

**Fix:** Pin the npm side to the minors the lockfile already resolved, so both sides are locked:

```
"@tauri-apps/api": "~2.11.1"
"@tauri-apps/plugin-dialog": "~2.7.1"
"@tauri-apps/plugin-fs": "~2.5.1"
```

plus the matching `specifier:` lines in `pnpm-lock.yaml`.

**Note:** Widening the Rust side instead is not an option — those crates are already at their newest releases, and the plugin crates remain on 2.x while their npm counterparts move to 3.x, so the majors are expected to diverge further over time.

**Affected:** All desktop platforms. Not a runtime bug — build-time only; shipped binaries are unaffected.

**Status:** Fixed in v0.6.2 (commit `0feba2b`).

## Android SDK job fails: "Failed to find package 'tools'" (v0.6.2)

**Symptom:** `build-android` failed 19s in, at the `Setup Android SDK` step, before `Build APK` was reached:

```
Warning: Failed to find package 'tools'
Error: The process '.../cmdline-tools/16.0/bin/sdkmanager' failed with exit code 1
```

**Root Cause:** `android-actions/setup-android@v3` defaults its `packages` input to `tools platform-tools`. The SDK `tools` package was retired, and `sdkmanager` from cmdline-tools 16.0 — which the runner image now ships — no longer resolves it. The action installs its defaults unconditionally, and a failure to resolve an already-obsolete package is fatal to the step.

**Fix:** The runner image already provides the SDK at `ANDROID_HOME`, which is what the Gradle build uses, so the action is only needed for license acceptance. Narrow its input to the package that still exists:

```yaml
- name: Accept Android SDK licenses
  uses: android-actions/setup-android@v3
  with:
    packages: platform-tools
```

**Affected:** `build-android`. Upstream breakage, not caused by any change in this repo.

**Status:** Fixed in v0.6.2 (commit `0feba2b`).

## Release job publishes an empty release when builds fail (v0.6.2)

**Symptom:** The v0.6.2 GitHub release was created while all five build jobs were red — a published release with zero release assets, where v0.6.1 has five. It had to be republished after the pipeline was fixed.

**Root Cause:** The `release` job declares `needs:` on all six build jobs *and* `if: always()`. `always()` overrides the implicit success requirement of `needs`, so the job runs even when everything it depends on failed. `download-artifact` then finds nothing and `softprops/action-gh-release` creates the release with an empty file list.

**Fix:** Not changed — the tag was moved to the fixing commit and re-pushed, which re-ran the pipeline and overwrote the empty release. Flagged here because an `always()` release job that publishes on total failure will mislead again the next time builds go red; the usual guard is `if: !cancelled() && !failure()` if only the docs deploy should run unconditionally.

**Affected:** The `release` job.

**Status:** Open — worked around, not fixed.
