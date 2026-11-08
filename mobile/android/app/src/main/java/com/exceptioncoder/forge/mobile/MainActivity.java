package com.exceptioncoder.forge.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.File;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final int PICK_FILE = 10;
    private static final int AUDIO_PERMISSION = 11;
    private WebView web;
    private LinearLayout recovery;
    private ValueCallback<Uri[]> fileResult;
    private Uri cameraOutput;
    private PermissionRequest audioRequest;
    private NativeActions actions;
    private final Map<String, String> replies = new LinkedHashMap<>();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        actions = new NativeActions(this);
        NativeActions.cleanExpired(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
        } else { root.setFitsSystemWindows(true); }
        recovery = new LinearLayout(this);
        recovery.setOrientation(LinearLayout.VERTICAL);
        recovery.setPadding(32, 32, 32, 32);
        TextView explanation = new TextView(this);
        explanation.setText("Forge 暂时无法连接。请检查网络与服务地址；会话和任务仍在原服务器，重试不会重新发送消息。");
        Button retry = new Button(this); retry.setText("重新连接"); retry.setOnClickListener(view -> web.reload());
        Button browser = new Button(this); browser.setText("在浏览器打开"); browser.setOnClickListener(view -> external(Uri.parse(BuildConfig.FORGE_ORIGIN + BuildConfig.FORGE_PATH)));
        recovery.addView(explanation); recovery.addView(retry); recovery.addView(browser); recovery.setVisibility(View.GONE);
        root.addView(recovery);
        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " ForgeMobile/1 Android");
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "ForgeNative", Collections.singleton(BuildConfig.FORGE_ORIGIN),
                (view, message, source, mainFrame, reply) -> {
                    if (!mainFrame || !trusted(source) || !workspace(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))) { return; }
                    String id = "";
                    try {
                        String raw = message.getData();
                        if (raw == null || raw.length() > 24 * 1024 * 1024) { throw new IllegalArgumentException("请求过大"); }
                        JSONObject request = new JSONObject(raw);
                        id = request.getString("id");
                        if (!id.matches("[a-zA-Z0-9-]{1,64}") || request.getInt("version") != 1) { throw new IllegalArgumentException("手机协议版本不兼容"); }
                        if (replies.containsKey(id)) { reply.postMessage(replies.get(id)); return; }
                        JSONObject result = actions.execute(request.getString("method"), request.getJSONObject("payload"));
                        String response = new JSONObject().put("id", id).put("ok", true).put("result", result).toString();
                        remember(id, response); reply.postMessage(response);
                    } catch (Exception error) {
                        try {
                            String response = new JSONObject().put("id", id).put("ok", false)
                                .put("error", error instanceof IllegalArgumentException ? error.getMessage() : "手机操作未完成，请检查系统权限或重新选择").toString();
                            remember(id, response); reply.postMessage(response);
                        } catch (Exception ignored) { /* Destroyed documents cannot receive a reply. */ }
                    }
                });
        }
        if (state == null || web.restoreState(state) == null) { web.loadUrl(BuildConfig.FORGE_ORIGIN + BuildConfig.FORGE_PATH); }
    }

    private void remember(String id, String response) {
        replies.put(id, response);
        if (replies.size() > 64) { replies.remove(replies.keySet().iterator().next()); }
    }

    private boolean trusted(Uri uri) {
        return OriginPolicy.trusted(BuildConfig.FORGE_ORIGIN, uri.toString());
    }

    private boolean workspace(Uri uri) {
        return OriginPolicy.workspace(BuildConfig.FORGE_ORIGIN, uri.toString());
    }

    private void external(Uri uri) {
        if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme())) { return; }
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (android.content.ActivityNotFoundException error) { recovery.setVisibility(View.VISIBLE); }
    }

    private final class Client extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (workspace(request.getUrl())) { return false; }
            if (request.isForMainFrame() && request.hasGesture()) { external(request.getUrl()); }
            return true;
        }
        @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
            recovery.setVisibility(View.GONE);
            if (!workspace(Uri.parse(url))) { view.stopLoading(); recovery.setVisibility(View.VISIBLE); }
        }
        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) { recovery.setVisibility(View.VISIBLE); }
        }
        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame() && response.getStatusCode() >= 400) { recovery.setVisibility(View.VISIBLE); }
        }
        @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel(); recovery.setVisibility(View.VISIBLE);
        }
    }

    private final class Chrome extends WebChromeClient {
        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileResult != null) { fileResult.onReceiveValue(null); }
            fileResult = callback; cameraOutput = null;
            if (!workspace(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))) { finishPicker(null); return true; }
            try {
                Intent files = params.createIntent();
                files.addCategory(Intent.CATEGORY_OPENABLE);
                boolean images = java.util.Arrays.stream(params.getAcceptTypes()).anyMatch(type -> type.startsWith("image/"));
                Intent chooser = Intent.createChooser(files, images ? "选择照片或文件" : "选择文件");
                if (images) {
                    Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    if (camera.resolveActivity(getPackageManager()) != null) {
                        File output = File.createTempFile("camera-", ".jpg", NativeActions.imageCache(MainActivity.this));
                        cameraOutput = FileProvider.getUriForFile(MainActivity.this, BuildConfig.APPLICATION_ID + ".files", output);
                        camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutput);
                        camera.setClipData(android.content.ClipData.newRawUri("Forge 拍照", cameraOutput));
                        camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                    }
                }
                startActivityForResult(chooser, PICK_FILE);
            } catch (Exception error) { finishPicker(null); }
            return true;
        }
        @Override public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> {
                if (!trusted(request.getOrigin()) || !workspace(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))
                    || !java.util.Arrays.equals(request.getResources(), new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE})) {
                    request.deny(); return;
                }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    if (audioRequest != null) { audioRequest.deny(); }
                    audioRequest = request; requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION);
                }
            });
        }
        @Override public void onPermissionRequestCanceled(PermissionRequest request) {
            if (audioRequest == request) { audioRequest = null; }
        }
    }

    private void finishPicker(Uri[] uris) {
        if (fileResult != null) { fileResult.onReceiveValue(uris); }
        fileResult = null; cameraOutput = null;
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE) {
            Uri[] selected = resultCode == RESULT_OK ? WebChromeClient.FileChooserParams.parseResult(resultCode, data) : null;
            if (resultCode == RESULT_OK && selected == null && cameraOutput != null) { selected = new Uri[]{cameraOutput}; }
            finishPicker(selected);
        }
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == AUDIO_PERMISSION && audioRequest != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED && trusted(audioRequest.getOrigin())
                && workspace(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))) {
                audioRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else { audioRequest.deny(); }
            audioRequest = null;
        }
    }
    @Override public void onBackPressed() { if (web.canGoBack()) { web.goBack(); } else { super.onBackPressed(); } }
    @Override protected void onSaveInstanceState(Bundle out) { web.saveState(out); super.onSaveInstanceState(out); }
    @Override protected void onResume() { super.onResume(); if (web != null) { web.onResume(); } }
    @Override protected void onPause() { if (web != null) { web.onPause(); } super.onPause(); }
    @Override protected void onDestroy() {
        finishPicker(null);
        if (audioRequest != null) { audioRequest.deny(); }
        web.destroy(); super.onDestroy();
    }
}
