#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="notifyhub-appimage-builder"

echo "==> Building Docker image (one-time, takes a few minutes)..."
docker build -t "$IMAGE_NAME" -f "$SCRIPT_DIR/Dockerfile.appimage" "$SCRIPT_DIR"

VERSION=$(grep '^version' "$SCRIPT_DIR/Cargo.toml" | head -1 | sed 's/.*"\(.*\)"/\1/')
echo "==> Building AppImage (version $VERSION)..."

docker run --rm \
    -v "$REPO_ROOT:/build" \
    -w /build/desktop \
    "$IMAGE_NAME" \
    bash -c "
        set -e
        # Install frontend deps
        cd ui && npm install && cd ..
        # Build AppImage
        cargo tauri build --bundles appimage

        # Patch AppRun to fix EGL_BAD_ALLOC on Arch/rolling-release distros
        APPIMAGE=\$(find target/release/bundle/appimage -name '*.AppImage' | head -1)
        TMPDIR=/tmp/appimage-patch
        rm -rf \$TMPDIR && mkdir -p \$TMPDIR
        cd \$TMPDIR
        \$APPIMAGE --appimage-extract >/dev/null 2>&1

        cat > squashfs-root/AppRun << 'APPRUN'
#!/usr/bin/env bash
set -e
this_dir=\"\$(readlink -f \"\$(dirname \"\$0\")\")\"
source \"\$this_dir\"/apprun-hooks/\"linuxdeploy-plugin-gtk.sh\"
# Fix EGL_BAD_ALLOC: disable GPU compositing before binary starts
export GDK_BACKEND=x11
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_GL=1
export LIBGL_ALWAYS_SOFTWARE=1
exec \"\$this_dir\"/AppRun.wrapped \"\$@\"
APPRUN
        chmod +x squashfs-root/AppRun

        # Remove bundled Wayland libs that conflict with host Mesa drivers
        rm -f squashfs-root/usr/lib/libwayland-egl.so.1
        rm -f squashfs-root/usr/lib/libwayland-client.so.0
        rm -f squashfs-root/usr/lib/libwayland-cursor.so.0
        rm -f squashfs-root/usr/lib/libwayland-server.so.0
        rm -f squashfs-root/usr/lib/im-waylandgtk.so
        rm -f squashfs-root/usr/lib/im-wayland.so
        rm -f squashfs-root/usr/lib/x86_64-linux-gnu/gtk-3.0/3.0.0/immodules/im-waylandgtk.so
        rm -f squashfs-root/usr/lib/x86_64-linux-gnu/gtk-3.0/3.0.0/immodules/im-wayland.so

        # Repackage
        OUT=\"/build/NotifyHub-Desktop_${VERSION}_linux-amd64.AppImage\"
        ARCH=x86_64 appimagetool squashfs-root \"\$OUT\" >/dev/null 2>&1
        echo \"==> Output: \$OUT\"
        ls -lh \"\$OUT\"
    "

echo "==> Done! Output: $REPO_ROOT/NotifyHub-Desktop_${VERSION}_linux-amd64.AppImage"
