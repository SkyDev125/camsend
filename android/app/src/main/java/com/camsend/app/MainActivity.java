package com.camsend.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String TAG = "Camsend";
    private static final int CAMERA_PERMISSION = 41;
    private static final int OPEN_FILE = 42;
    private static final int SAVE_FILE = 43;
    private static final String APP_URL = "https://camsend.local/";

    private FrameLayout root;
    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private byte[] pendingFile;
    private String pendingFileName;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private int normalUiVisibility;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(9, 10, 15));
        getWindow().setNavigationBarColor(Color.rgb(9, 10, 15));
        normalUiVisibility = getWindow().getDecorView().getSystemUiVisibility();

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(9, 10, 15));
        webView = new WebView(this);
        configureWebView();
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        if (android.os.Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
        }
        webView.loadUrl(APP_URL);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + " CamsendAndroid/0.1");
        webView.setBackgroundColor(Color.rgb(9, 10, 15));
        webView.setWebViewClient(new LocalWebViewClient());
        webView.setWebChromeClient(new CamsendChromeClient());
        webView.addJavascriptInterface(new NativeBridge(), "CamsendNative");
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> Log.i(TAG, "Download requested: " + url));
    }

    private final class LocalWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return localResponse(request.getUrl());
        }

        @SuppressWarnings("deprecation")
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return localResponse(Uri.parse(url));
        }

        private WebResourceResponse localResponse(Uri uri) {
            if (!"camsend.local".equals(uri.getHost())) return null;
            String path = uri.getPath();
            if (path == null || path.isEmpty() || "/".equals(path)) path = "/web/index.html";
            if (path.startsWith("/")) path = path.substring(1);
            if (!path.startsWith("web/") || path.contains("..")) return null;
            try {
                InputStream input = getAssets().open(path);
                return new WebResourceResponse(mimeType(path), "UTF-8", input);
            } catch (IOException error) {
                Log.w(TAG, "Asset not found: " + path, error);
                return null;
            }
        }

        private String mimeType(String path) {
            String lower = path.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".html")) return "text/html";
            if (lower.endsWith(".css")) return "text/css";
            if (lower.endsWith(".js")) return "application/javascript";
            if (lower.endsWith(".json")) return "application/json";
            if (lower.endsWith(".webmanifest")) return "application/manifest+json";
            if (lower.endsWith(".svg")) return "image/svg+xml";
            return "application/octet-stream";
        }
    }

    private final class CamsendChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> {
                if (request.getOrigin().toString().startsWith(APP_URL) || "https://camsend.local".equals(request.getOrigin().toString())) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    request.deny();
                }
            });
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = callback;
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            try {
                startActivityForResult(intent, OPEN_FILE);
                return true;
            } catch (ActivityNotFoundException error) {
                fileChooserCallback = null;
                return false;
            }
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage message) {
            Log.d(TAG, message.message() + " @" + message.lineNumber());
            return true;
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (customView != null) {
                callback.onCustomViewHidden();
                return;
            }
            customView = view;
            customViewCallback = callback;
            normalUiVisibility = getWindow().getDecorView().getSystemUiVisibility();
            root.addView(customView, new FrameLayout.LayoutParams(-1, -1));
            webView.setVisibility(View.GONE);
            getWindow().getDecorView().setSystemUiVisibility(5894);
        }

        @Override
        public void onHideCustomView() {
            hideCustomView();
        }
    }

    private void hideCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        webView.setVisibility(View.VISIBLE);
        getWindow().getDecorView().setSystemUiVisibility(normalUiVisibility);
        if (customViewCallback != null) customViewCallback.onCustomViewHidden();
        customViewCallback = null;
    }

    private final class NativeBridge {
        @JavascriptInterface
        public String capabilities() {
            return "{\"platform\":\"android-webview\",\"nativeCameraPermission\":true,\"nativeFullscreen\":true,\"nativeFileSave\":true,\"keepScreenOn\":true,\"brightnessControl\":true}";
        }

        @JavascriptInterface
        public void setKeepScreenOn(boolean enabled) {
            runOnUiThread(() -> {
                if (enabled) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void setScreenBrightness(int percent) {
            final float brightness = Math.max(0.1f, Math.min(1f, percent / 100f));
            runOnUiThread(() -> {
                WindowManager.LayoutParams params = getWindow().getAttributes();
                params.screenBrightness = brightness;
                getWindow().setAttributes(params);
            });
        }

        @JavascriptInterface
        public boolean saveFile(String fileName, String encodedBytes) {
            try {
                pendingFile = Base64.decode(encodedBytes, Base64.DEFAULT);
                pendingFileName = safeFileName(fileName);
                runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType("application/octet-stream");
                        intent.putExtra(Intent.EXTRA_TITLE, pendingFileName);
                        startActivityForResult(intent, SAVE_FILE);
                    } catch (ActivityNotFoundException error) {
                        Log.e(TAG, "No document provider is available", error);
                        pendingFile = null;
                        pendingFileName = null;
                    }
                });
                return true;
            } catch (RuntimeException error) {
                Log.e(TAG, "Could not prepare native save", error);
                pendingFile = null;
                return false;
            }
        }

        private String safeFileName(String name) {
            if (name == null || name.trim().isEmpty()) return "received.bin";
            return name.replaceAll("[\\\\/:*?\"<>|]", "_");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == OPEN_FILE) {
            if (fileChooserCallback == null) return;
            Uri[] result = resultCode == RESULT_OK && data != null && data.getData() != null ? new Uri[]{data.getData()} : null;
            fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
        } else if (requestCode == SAVE_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingFile != null) {
                try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                    if (output != null) output.write(pendingFile);
                } catch (IOException error) {
                    Log.e(TAG, "Native save failed", error);
                }
            }
            pendingFile = null;
            pendingFileName = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            hideCustomView();
        } else if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        hideCustomView();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
