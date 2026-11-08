package com.exceptioncoder.forge.mobile;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.UUID;

/** Only user-facing clipboard and system share operations; never paths, URLs or arbitrary intents from JS. */
final class NativeActions {
    private static final int MAX_PNG_BYTES = 8 * 1024 * 1024;
    private final Activity activity;

    NativeActions(Activity activity) { this.activity = activity; }

    JSONObject execute(String method, JSONObject payload) throws Exception {
        return switch (method) {
            case "capabilities" -> new JSONObject().put("version", 1).put("platform", "android")
                    .put("methods", new JSONArray(new String[]{"copyText", "copyImage", "shareImages"}));
            case "copyText" -> {
                String text = payload.getString("text");
                if (text.length() > 1_000_000) { throw new IllegalArgumentException("文本过长，请分段复制"); }
                ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newPlainText("Forge", text));
                yield new JSONObject().put("status", "copied");
            }
            case "copyImage" -> {
                Uri uri = png(payload);
                ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newUri(activity.getContentResolver(), "Forge 卡片", uri));
                yield new JSONObject().put("status", "copied");
            }
            case "shareImages" -> {
                JSONArray images = payload.getJSONArray("images");
                if (images.length() < 1 || images.length() > 8) { throw new IllegalArgumentException("一次可分享 1～8 张图片"); }
                ArrayList<Uri> uris = new ArrayList<>();
                for (int i = 0; i < images.length(); i++) { uris.add(png(images.getJSONObject(i))); }
                Intent send = new Intent(uris.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE);
                send.setType("image/png");
                if (uris.size() == 1) { send.putExtra(Intent.EXTRA_STREAM, uris.get(0)); }
                else { send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris); }
                ClipData clip = ClipData.newUri(activity.getContentResolver(), "Forge 卡片", uris.get(0));
                for (int i = 1; i < uris.size(); i++) { clip.addItem(new ClipData.Item(uris.get(i))); }
                send.setClipData(clip);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                activity.startActivity(Intent.createChooser(send, "分享 Forge 卡片"));
                // Opening the chooser does not prove a recipient sent or even accepted the images.
                yield new JSONObject().put("status", "handed-off");
            }
            default -> throw new IllegalArgumentException("当前手机应用不支持此操作，请更新应用");
        };
    }

    private Uri png(JSONObject payload) throws Exception {
        String encoded = payload.getString("data");
        if (encoded.isEmpty() || encoded.length() > (MAX_PNG_BYTES * 4L / 3 + 8)) {
            throw new IllegalArgumentException("PNG 图片必须小于 8MB");
        }
        byte[] data = Base64.decode(encoded, Base64.NO_WRAP);
        byte[] signature = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};
        if (data.length < signature.length || data.length > MAX_PNG_BYTES) { throw new IllegalArgumentException("无效 PNG 图片"); }
        for (int i = 0; i < signature.length; i++) {
            if (data[i] != signature[i]) { throw new IllegalArgumentException("仅支持 PNG 图片"); }
        }
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(data, 0, data.length, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || (long) bounds.outWidth * bounds.outHeight > 40_000_000L) {
            throw new IllegalArgumentException("图片尺寸无效或过大");
        }
        File file = new File(imageCache(activity), UUID.randomUUID() + ".png");
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(data); }
        return FileProvider.getUriForFile(activity, BuildConfig.APPLICATION_ID + ".files", file);
    }

    static File imageCache(Context context) throws Exception {
        cleanExpired(context);
        File directory = new File(context.getCacheDir(), "forge-images");
        if (!directory.isDirectory() && !directory.mkdirs()) { throw new IllegalStateException("无法准备手机临时目录"); }
        File[] cached = directory.listFiles();
        if (cached == null || cached.length >= 64) { throw new IllegalStateException("手机临时图片较多，请稍后重试或清理应用缓存"); }
        return directory;
    }

    static void cleanExpired(Context context) {
        File[] files = new File(context.getCacheDir(), "forge-images").listFiles();
        if (files == null) { return; }
        long expiry = System.currentTimeMillis() - 24 * 60 * 60 * 1000L;
        for (File file : files) {
            if (file.isFile() && file.lastModified() < expiry) { file.delete(); }
        }
    }
}
