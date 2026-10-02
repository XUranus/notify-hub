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

**References:**
- https://github.com/niclas-niclasniclas/niclasniclasniclas/issues/1 (EGL_BAD_ALLOC with AppImage on rolling-release distros)

## Super+Space sidebar toggle cancels itself out (v0.6.1)

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

**Status:** Unreleased, on `master` after v0.6.1.
