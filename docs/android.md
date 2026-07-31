# Android build and device testing

The Android deliverable is a small native Activity that packages the offline web endpoint. The Activity serves assets from a local HTTPS origin, grants camera permission only to that origin, handles the browser file chooser, implements fullscreen, keeps the display awake during transfers, exposes brightness/capability information to the page, and saves verified output through `ACTION_CREATE_DOCUMENT`.

## Build

```powershell
npm.cmd run build:web
$env:ANDROID_SDK_ROOT = 'C:\path\to\Android\Sdk'
& 'C:\path\to\gradle\bin\gradle.bat' --no-daemon assembleDebug
```

Install `android/app/build/outputs/apk/debug/app-debug.apk` with `adb install -r` or Android Studio. The app does not request internet permission and does not upload files.

## Device test checklist

1. Open Send, choose a small file, and display the optical canvas at maximum brightness.
2. On a second phone or computer, open Receive and grant camera permission.
3. Start with Robust / 2-bit calibrated mode; keep the marker corners visible and fill most of the camera preview.
4. Download/save only after the receiver reports `verified`.
5. Export diagnostics. The export omits payload bytes and file names; attach it with the source and receiver device models, browser/WebView versions, and a short description of the setup.

The VM build has no physical camera/display. Until device fixtures are returned, measured goodput must be treated as simulator-only.
