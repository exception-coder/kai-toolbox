package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;

/** 有界窗口的可恢复游标，不含正文或可由客户端指定的文件路径。 */
record CodexHistoryCursor(int version, long snapshotSize, String modified, String identity,
                          String prefix, String suffix, long start, long end, int before) {
    private static final int SAMPLE_BYTES = 512;

    static CodexHistoryCursor capture(Path path) throws IOException {
        var attributes = Files.readAttributes(path, BasicFileAttributes.class);
        long size = attributes.size();
        return new CodexHistoryCursor(1, size, attributes.lastModifiedTime().toString(), identity(path, attributes),
                sample(path, 0, size), sample(path, Math.max(0, size - SAMPLE_BYTES), size), 0, size, 0);
    }

    CodexHistoryCursor window(long from, long through, int index) {
        return new CodexHistoryCursor(version, snapshotSize, modified, identity, prefix, suffix, from, through, index);
    }

    String encode(ObjectMapper mapper) throws IOException {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(mapper.writeValueAsBytes(this));
    }

    static CodexHistoryCursor decode(ObjectMapper mapper, String value) {
        if (value == null || value.length() > 2048) {
            throw stale();
        }
        try {
            var cursor = mapper.readValue(Base64.getUrlDecoder().decode(value), CodexHistoryCursor.class);
            if (cursor.version != 1 || cursor.start < 0 || cursor.start >= cursor.end
                    || cursor.end > cursor.snapshotSize || cursor.before < 0
                    || cursor.end - cursor.start > CodexHistoryWindowLocator.MAX_WINDOW_BYTES) {
                throw stale();
            }
            return cursor;
        } catch (IOException | IllegalArgumentException invalid) {
            throw stale();
        }
    }

    void verify(Path path) throws IOException {
        var attributes = Files.readAttributes(path, BasicFileAttributes.class);
        if (attributes.size() < snapshotSize || !identity(path, attributes).equals(identity)
                || attributes.size() == snapshotSize && !attributes.lastModifiedTime().toString().equals(modified)
                || !sample(path, 0, snapshotSize).equals(prefix)
                || !sample(path, Math.max(0, snapshotSize - SAMPLE_BYTES), snapshotSize).equals(suffix)) {
            throw stale();
        }
    }

    static ResponseStatusException stale() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "历史文件已变化，请重新加载最近消息");
    }

    private static String identity(Path path, BasicFileAttributes attributes) throws IOException {
        String value = path.toRealPath() + "\n" + attributes.creationTime() + "\n" + attributes.fileKey();
        return digest(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String sample(Path path, long offset, long snapshotSize) throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate((int) Math.min(SAMPLE_BYTES, snapshotSize - offset));
        try (FileChannel channel = FileChannel.open(path)) {
            while (buffer.hasRemaining()) {
                int count = channel.read(buffer, offset + buffer.position());
                if (count < 0) {
                    throw stale();
                }
            }
        }
        return digest(buffer.array());
    }

    private static String digest(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
