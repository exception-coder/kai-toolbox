package com.exceptioncoder.toolbox.foreconsult.backend;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner.ImageInput;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Raw bytes stay in the module's private DB. No caller path, URL, filename or employee session. */
@Service
public class ConsultAnalysisImages {
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(ConsultAnalysisImages.class);
    public static final int MAX_BYTES = 5 * 1024 * 1024;
    private final ConsultImageStore store;
    private volatile Cleanup cleanup = new Cleanup(null, null, 0, 0, "NOT_RUN");

    public record Cleanup(Long attemptedAt, Long succeededAt, int released, int removed, String status) {}

    public ConsultAnalysisImages(ConsultImageStore store) { this.store = store; }

    public record Inputs(List<ConsultImageStore.Image> metadata, List<ImageInput> images) {}

    public synchronized ConsultImageStore.Image upload(ConsultBackendStore.Client client, String uploadId, String mediaType, byte[] bytes) {
        validateUploadId(uploadId);
        if (mediaType == null || !List.of("image/png", "image/jpeg").contains(mediaType)) throw new ConsultBackendException(415, "IMAGE_FORMAT_UNSUPPORTED", "仅支持 PNG/JPEG 原图", false);
        if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new ConsultBackendException(413, "IMAGE_TOO_LARGE", "原图须为 1 字节至 5MiB", false);
        String hash;
        try { hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
        var old = store.find(client.id(), uploadId, true);
        if (old.isPresent()) {
            if (!old.get().sha256().equals(hash) || !old.get().mediaType().equals(mediaType))
                throw new ConsultBackendException(409, "UPLOAD_IDEMPOTENCY_CONFLICT", "相同 uploadId 已用于不同图片或类型", false);
            return live(old.get());
        }
        clean();
        store.requireCapacity(client.id(), bytes.length, System.currentTimeMillis());
        int[] dimensions = decode(bytes, mediaType);
        long now = System.currentTimeMillis();
        var image = new ConsultImageStore.Image("img_" + UUID.randomUUID(), uploadId, hash, mediaType, bytes.length,
                dimensions[0], dimensions[1], now, now + 86400000);
        store.insert(client.id(), image, bytes);
        return image;
    }

    public ConsultImageStore.Image get(ConsultBackendStore.Client client, String value, boolean byUpload) {
        if (byUpload) validateUploadId(value);
        return live(store.find(client.id(), value, byUpload).orElseThrow(() -> new ConsultBackendException(404, "ATTACHMENT_NOT_FOUND", "图片不存在或不在当前应用企业范围", false)));
    }

    public ConsultImageStore.Image reusable(ConsultBackendStore.Client client, String hash, String mediaType, long minValiditySeconds) {
        if (hash == null || !hash.matches("[a-fA-F0-9]{64}") || !List.of("image/png", "image/jpeg").contains(mediaType)
                || minValiditySeconds < 0 || minValiditySeconds > 86400) {
            throw ConsultBackendException.invalid("复用查询须提供SHA256、PNG/JPEG类型及0至86400秒剩余有效期");
        }
        return store.reusable(client.id(), hash.toLowerCase(java.util.Locale.ROOT), mediaType,
                System.currentTimeMillis() + minValiditySeconds * 1000)
                .orElseThrow(() -> new ConsultBackendException(404, "ATTACHMENT_NOT_FOUND", "没有可复用的有效图片，请使用稳定uploadId上传", false));
    }

    /** Shares the cleanup/upload monitor so admission cannot lose bytes between validation and lease. */
    public synchronized void admit(ConsultBackendStore.Client client, List<String> ids, Runnable insertTask) {
        var inputs = resolve(client, ids, false);
        store.admit(client.id(), inputs.metadata(), System.currentTimeMillis(), insertTask);
    }

    public record Diagnostics(ConsultImagePolicy limits, ConsultImageStore.Usage usage,
                              ConsultImageStore.Duplicates duplicates, Cleanup cleanup, long measuredAt, long queryMillis) {}

    public Diagnostics diagnostics(String client) {
        long start = System.nanoTime(), now = System.currentTimeMillis();
        var usage = store.usage(client, now);
        var duplicates = store.duplicates(client, now);
        return new Diagnostics(store.policy(), usage, duplicates, cleanup, now, (System.nanoTime() - start) / 1000000);
    }

    public ConsultImageStore.Storage storage() { return store.storage(); }

    public Inputs resolve(ConsultBackendStore.Client client, List<String> ids, boolean readBytes) {
        var metadata = new ArrayList<ConsultImageStore.Image>();
        var images = new ArrayList<ImageInput>();
        long total = 0;
        for (String id : ids) {
            var image = get(client, id, false);
            total += image.size();
            if (total > 20L * 1024 * 1024) throw new ConsultBackendException(413, "IMAGES_TOO_LARGE", "任务图片合计不得超过 20MiB", false);
            metadata.add(image);
            if (readBytes) {
                byte[] bytes = store.bytes(client.id(), id, System.currentTimeMillis());
                if (bytes == null) throw new ConsultBackendException(410, "ATTACHMENT_EXPIRED", "原图已过期或不可读，请重新上传并使用新 requestId", false);
                images.add(new ImageInput(Base64.getEncoder().encodeToString(bytes), image.mediaType()));
            }
        }
        return new Inputs(List.copyOf(metadata), List.copyOf(images));
    }

    private ConsultImageStore.Image live(ConsultImageStore.Image image) {
        if (image.expiresAt() <= System.currentTimeMillis()) throw new ConsultBackendException(410, "ATTACHMENT_EXPIRED", "原图已过期，请重新上传并使用新的 uploadId/requestId", false);
        return image;
    }

    private void validateUploadId(String id) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{8,100}")) throw ConsultBackendException.invalid("uploadId 须为 8–100 位字母数字、下划线或短横线");
    }

    private int[] decode(byte[] bytes, String mediaType) {
        try (var stream = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw unreadable();
            var reader = readers.next();
            try {
                String expected = mediaType.equals("image/png") ? "png" : "JPEG";
                if (!expected.equalsIgnoreCase(reader.getFormatName())) throw unreadable();
                reader.setInput(stream, true, true);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > 10000 || height > 10000 || (long) width * height > 20000000)
                    throw new ConsultBackendException(413, "IMAGE_DIMENSIONS_EXCEEDED", "图片边长不得超过 10000，总像素不得超过 2000 万", false);
                // APNG must not silently degrade to a single frame.
                if (mediaType.equals("image/png")) {
                    int offset = 8;
                    var buffer = java.nio.ByteBuffer.wrap(bytes);
                    while (offset + 12 <= bytes.length) {
                        int length = buffer.getInt(offset);
                        if (length < 0 || (long) offset + length + 12 > bytes.length) throw unreadable();
                        if (buffer.getInt(offset + 4) == 0x6163544c) throw new ConsultBackendException(415, "IMAGE_FORMAT_UNSUPPORTED", "不支持动画图片，请提供静态 PNG/JPEG", false);
                        offset += length + 12;
                    }
                }
                if (reader.read(0) == null) throw unreadable();
                return new int[] {width, height};
            } finally { reader.dispose(); }
        } catch (IOException | IllegalArgumentException error) { throw unreadable(); }
    }

    private ConsultBackendException unreadable() { return new ConsultBackendException(422, "IMAGE_NOT_READABLE", "图片内容损坏或与声明类型不符，请重新导出 PNG/JPEG", false); }

    @Scheduled(fixedDelay = 60000, initialDelay = 60000)
    public synchronized void clean() {
        long now = System.currentTimeMillis();
        try {
            var result = store.clean(now);
            cleanup = new Cleanup(now, System.currentTimeMillis(), result.released(), result.removed(), "OK");
        } catch (RuntimeException error) {
            cleanup = new Cleanup(now, cleanup.succeededAt(), 0, 0, "FAILED");
            LOG.error("Consult image cleanup failed", error);
            throw error;
        }
    }
}
