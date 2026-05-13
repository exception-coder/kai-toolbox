package com.exceptioncoder.toolbox.webterm.session;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;

/**
 * PTY 输出的环形缓冲，超出容量时丢最旧的整块。
 * 用途：客户端 WebSocket 重新 attach 时把最近这段输出 replay 给它，
 * 让用户立刻看到"我离开前终端长什么样"。整块淘汰是简化做法，可能略多丢一点，
 * 但避免了在 UTF-8 多字节字符中间切断的问题。
 */
public final class OutputBacklog {

    private final int capacity;
    private final ArrayDeque<byte[]> chunks = new ArrayDeque<>();
    private int currentBytes;

    public OutputBacklog(int capacity) {
        this.capacity = Math.max(1024, capacity);
    }

    public synchronized void append(String chunk) {
        if (chunk == null || chunk.isEmpty()) return;
        byte[] bytes = chunk.getBytes(StandardCharsets.UTF_8);
        chunks.addLast(bytes);
        currentBytes += bytes.length;
        while (currentBytes > capacity && !chunks.isEmpty()) {
            byte[] dropped = chunks.removeFirst();
            currentBytes -= dropped.length;
        }
    }

    public synchronized String snapshot() {
        if (chunks.isEmpty()) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream(currentBytes);
        for (byte[] b : chunks) out.writeBytes(b);
        return out.toString(StandardCharsets.UTF_8);
    }
}
