package com.exceptioncoder.toolbox.vscodetunnel.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 按行扫描 code tunnel 的合并 stdout（stderr 已 redirectErrorStream 合流）。
 * 识别两类关键事件：GitHub 设备登录码、隧道就绪 URL。
 * 每条尾部环形缓冲保留最近 N 字节，供 ERROR 状态填 lastError。
 */
public final class TunnelOutputParser {

    private static final Logger log = LoggerFactory.getLogger(TunnelOutputParser.class);

    static final Pattern DEVICE_CODE = Pattern.compile("code\\s+([A-Z0-9]{4}-[A-Z0-9]{4})");
    static final Pattern TUNNEL_URL = Pattern.compile("https?://vscode\\.dev/tunnel/\\S+");

    private TunnelOutputParser() {}

    /**
     * 阻塞读 in 直到流结束。每读到一行：
     * 1. 追加到 tailBuffer
     * 2. 若尚未上报 URL，先尝试匹配 URL（命中即 onTunnelUrl 并停止再匹配设备码）
     * 3. 若 URL 还没出来且尚未上报设备码，尝试匹配设备码（命中即 onDeviceCode）
     * 解析异常仅日志，不抛出（保证 manager 状态机不被 IO 噪音打断）。
     */
    public static void parse(
            InputStream in,
            Consumer<String> onDeviceCode,
            Consumer<String> onTunnelUrl,
            TailBuffer tailBuffer
    ) {
        boolean deviceCodeReported = false;
        boolean tunnelUrlReported = false;

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.length() > 4096) {
                    line = line.substring(0, 4096);
                }
                tailBuffer.append(line);
                log.debug("[code tunnel] {}", line);

                if (!tunnelUrlReported) {
                    Matcher urlM = TUNNEL_URL.matcher(line);
                    if (urlM.find()) {
                        tunnelUrlReported = true;
                        onTunnelUrl.accept(urlM.group());
                        continue;
                    }
                }

                if (!deviceCodeReported && !tunnelUrlReported) {
                    Matcher codeM = DEVICE_CODE.matcher(line);
                    if (codeM.find()) {
                        deviceCodeReported = true;
                        onDeviceCode.accept(codeM.group(1));
                    }
                }
            }
        } catch (IOException e) {
            log.debug("code tunnel stdout closed: {}", e.getMessage());
        } catch (RuntimeException e) {
            log.warn("parser callback threw", e);
        }
    }

    /**
     * 简单字符环形缓冲。线程不安全：仅在解析线程内 append；快照在 manager 锁内调用。
     */
    public static final class TailBuffer {
        private final char[] buf;
        private int pos;
        private boolean wrapped;

        public TailBuffer(int capacity) {
            this.buf = new char[Math.max(64, capacity)];
        }

        public synchronized void append(String line) {
            for (int i = 0; i < line.length(); i++) {
                buf[pos] = line.charAt(i);
                pos = (pos + 1) % buf.length;
                if (pos == 0) wrapped = true;
            }
            buf[pos] = '\n';
            pos = (pos + 1) % buf.length;
            if (pos == 0) wrapped = true;
        }

        public synchronized String snapshot() {
            if (!wrapped) {
                return new String(buf, 0, pos);
            }
            StringBuilder sb = new StringBuilder(buf.length);
            sb.append(buf, pos, buf.length - pos);
            sb.append(buf, 0, pos);
            return sb.toString();
        }
    }
}
