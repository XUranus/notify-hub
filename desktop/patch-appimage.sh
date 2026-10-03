#!/usr/bin/env bash
#
# Patch a Tauri-built AppImage so it survives rolling-release distros.
#
# This is the CI half of the fix documented in BUGLIST.md ("AppImage EGL_BAD_ALLOC
# on Arch Linux"). Run it after `cargo tauri build --bundles appimage`; it rewrites
# the AppImage in place.
#
# Why the AppRun rewrite is necessary: EGL initialises while the dynamic loader is
# still resolving the webkit2gtk libraries, long before main() runs, so the
# environment variables cannot be set from Rust. They have to be in place before the
# wrapped binary is exec'd, which is exactly what AppRun is for.
#
# Usage: patch-appimage.sh <AppImage> <x86_64|aarch64> [appimagetool path]

set -euo pipefail

APPIMAGE="${1:?usage: patch-appimage.sh <AppImage> <x86_64|aarch64> [appimagetool]}"
ARCH="${2:?usage: patch-appimage.sh <AppImage> <x86_64|aarch64> [appimagetool]}"
TOOL="${3:-/tmp/squashfs-root/usr/bin/appimagetool}"

# Absolutise before anything changes directory. The AppImage name Tauri produces
# contains spaces ("NotifyHub Client_0.6.2_amd64.AppImage"), and the extract below
# cd's into a scratch dir, so a relative argument would no longer resolve.
APPIMAGE="$(readlink -f "$APPIMAGE")"

[ -f "$APPIMAGE" ] || { echo "patch-appimage: no such file: $APPIMAGE" >&2; exit 1; }
[ -x "$TOOL" ] || { echo "patch-appimage: appimagetool not executable: $TOOL" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# APPIMAGE_EXTRACT_AND_RUN because GitHub runners have no FUSE; using the AppImage's
# own runtime also avoids having to locate the squashfs superblock by hand.
( cd "$WORK" && APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGE" --appimage-extract >/dev/null )

cat > "$WORK/squashfs-root/AppRun" <<'APPRUN'
#!/usr/bin/env bash
set -e
this_dir="$(readlink -f "$(dirname "$0")")"
source "$this_dir"/apprun-hooks/"linuxdeploy-plugin-gtk.sh"
# Fix EGL_BAD_ALLOC: disable GPU compositing before the binary starts.
export GDK_BACKEND=x11
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_GL=1
export LIBGL_ALWAYS_SOFTWARE=1
exec "$this_dir"/AppRun.wrapped "$@"
APPRUN
chmod +x "$WORK/squashfs-root/AppRun"

# Strip the bundled Wayland stack: it is built against an older Mesa than
# rolling-release distros ship, and loading it is what triggers the EGL failure.
rm -f "$WORK/squashfs-root/usr/lib/libwayland-egl.so.1" \
      "$WORK/squashfs-root/usr/lib/libwayland-client.so.0" \
      "$WORK/squashfs-root/usr/lib/libwayland-cursor.so.0" \
      "$WORK/squashfs-root/usr/lib/libwayland-server.so.0"
find "$WORK/squashfs-root/usr/lib" -name 'im-wayland*' -delete 2>/dev/null || true

# Repackage to a sibling path, then swap it in, so a failed run cannot leave a
# half-written AppImage where the release step expects a good one.
ARCH="$ARCH" "$TOOL" "$WORK/squashfs-root" "$WORK/out.AppImage" >/dev/null
mv "$WORK/out.AppImage" "$APPIMAGE"
chmod +x "$APPIMAGE"

# Fail loudly if the rewrite did not take -- the whole point of this script is the
# AppRun replacement, and a silent miss is how the previous attempt shipped a
# workaround that never ran.
VERIFY="$(mktemp -d)"
if ! ( cd "$VERIFY" && APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGE" --appimage-extract AppRun >/dev/null 2>&1 \
       && grep -q 'WEBKIT_DISABLE_GL' squashfs-root/AppRun ); then
  rm -rf "$VERIFY"
  echo "patch-appimage: AppRun in $APPIMAGE does not carry the EGL exports" >&2
  exit 1
fi
rm -rf "$VERIFY"

echo "patch-appimage: patched $APPIMAGE ($ARCH)"
