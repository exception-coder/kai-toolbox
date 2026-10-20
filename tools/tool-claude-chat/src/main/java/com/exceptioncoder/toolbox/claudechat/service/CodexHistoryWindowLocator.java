package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Path;

/** 从文件尾部按倍增窗口寻找完整轮次；不解析页外工具正文。 */
final class CodexHistoryWindowLocator {
    static final int MAX_WINDOW_BYTES = 32 * 1024 * 1024;
    private static final int INITIAL_BYTES = 2 * 1024 * 1024;
    private static final int MAX_BOUNDARY_BYTES = 64 * 1024;

    static long start(ObjectMapper mapper, Path path, long end) throws IOException {
        for (int bytes = INITIAL_BYTES; bytes <= MAX_WINDOW_BYTES; bytes *= 2) {
            long low = Math.max(0, end - bytes);
            if (low == 0) {
                return 0;
            }
            byte[] window = read(path, low, end);
            int lineStart = 0;
            for (int position = 0; position < window.length; position++) {
                if (window[position] != '\n') {
                    continue;
                }
                if (lineStart > 0 && position - lineStart <= MAX_BOUNDARY_BYTES) {
                    String boundary = boundary(mapper, window, lineStart, position - lineStart);
                    if ("task_started".equals(boundary)) {
                        return low + lineStart;
                    }
                }
                lineStart = position + 1;
            }
        }
        throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                "快速窗口内无法确认完整轮次，请点击使用完整历史读取（可能较慢）");
    }

    private static String boundary(ObjectMapper mapper, byte[] bytes, int start, int length) {
        try {
            var node = mapper.readTree(bytes, start, length);
            return "event_msg".equals(node.path("type").asText()) ? node.path("payload").path("type").asText() : "";
        } catch (IOException invalidLine) {
            return "";
        }
    }

    private static byte[] read(Path path, long start, long end) throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate((int) (end - start));
        try (FileChannel channel = FileChannel.open(path)) {
            while (buffer.hasRemaining()) {
                if (channel.read(buffer, start + buffer.position()) < 0) {
                    throw CodexHistoryCursor.stale();
                }
            }
        }
        return buffer.array();
    }
}
