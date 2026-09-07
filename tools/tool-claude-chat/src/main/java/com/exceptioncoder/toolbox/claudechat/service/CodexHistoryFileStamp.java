package com.exceptioncoder.toolbox.claudechat.service;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileTime;
import java.util.Arrays;
import java.util.Objects;

/** 文件身份与固定大小校验片段，用于识别截断、替换和常见的伪追加。 */
record CodexHistoryFileStamp(long size, FileTime modified, FileTime created, Object fileKey,
                             byte[] prefix, byte[] tail) {
    private static final int SAMPLE_BYTES = 512;

    static CodexHistoryFileStamp capture(Path path, BasicFileAttributes attributes) throws IOException {
        int count = (int) Math.min(SAMPLE_BYTES, attributes.size());
        return new CodexHistoryFileStamp(attributes.size(), attributes.lastModifiedTime(), attributes.creationTime(),
                attributes.fileKey(), sample(path, 0, count), sample(path, attributes.size() - count, count));
    }

    boolean canAppend(Path path, BasicFileAttributes attributes) throws IOException {
        if (attributes.size() < size || !created.equals(attributes.creationTime())
                || !Objects.equals(fileKey, attributes.fileKey())) {
            return false;
        }
        if (attributes.size() == size && !modified.equals(attributes.lastModifiedTime())) {
            return false;
        }
        return Arrays.equals(prefix, sample(path, 0, prefix.length))
                && Arrays.equals(tail, sample(path, size - tail.length, tail.length));
    }

    private static byte[] sample(Path path, long offset, int count) throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate(count);
        try (FileChannel channel = FileChannel.open(path)) {
            channel.position(offset);
            while (buffer.hasRemaining()) {
                if (channel.read(buffer) < 0) {
                    throw new IOException("Codex history changed during index validation: " + path);
                }
            }
        }
        return buffer.array();
    }
}
