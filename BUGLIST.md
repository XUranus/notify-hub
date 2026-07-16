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
