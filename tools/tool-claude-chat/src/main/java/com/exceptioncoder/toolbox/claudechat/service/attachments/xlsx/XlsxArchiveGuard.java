package com.exceptioncoder.toolbox.claudechat.service.attachments.xlsx;

import java.io.IOException;
import java.nio.file.Path;
import java.util.zip.ZipFile;

/** 在POI加载共享字符串及样式前限制真实解压量；不更改影响其它Office功能的全局POI阈值。 */
final class XlsxArchiveGuard {
    private static final long MAX_EXPANDED_BYTES = 32L * 1024 * 1024;
    private static final long MAX_ENTRY_BYTES = 16L * 1024 * 1024;
    private static final int MAX_ENTRIES = 1000;
    static final int MAX_STYLES_BYTES = 1024 * 1024;
    private final long deadline = System.nanoTime() + 12_000_000_000L;

    void checkTime() {
        if (System.nanoTime() > deadline || Thread.currentThread().isInterrupted()) {
            throw new IllegalArgumentException("XLSX解析超过12秒，请按工作表拆分文件后重试");
        }
    }

    void verify(Path file) throws IOException {
        try (var archive = new ZipFile(file.toFile())) {
            if (archive.size() > MAX_ENTRIES) {
                throw new IllegalArgumentException("XLSX压缩条目超过1000，请移除嵌入对象或拆分文件");
            }
            long total = 0;
            byte[] buffer = new byte[16384];
            var entries = archive.entries();
            while (entries.hasMoreElements()) {
                var entry = entries.nextElement();
                long limit = entry.getName().equals("xl/styles.xml") ? MAX_STYLES_BYTES : MAX_ENTRY_BYTES;
                long expanded = 0;
                try (var input = archive.getInputStream(entry)) {
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        checkTime();
                        expanded += count;
                        total += count;
                        if (expanded > limit || total > MAX_EXPANDED_BYTES) {
                            throw new IllegalArgumentException("XLSX解压规模超限（单条目16MiB、样式1MiB、合计32MiB），"
                                    + "请拆分工作簿或移除图片/样式后重新上传");
                        }
                    }
                }
            }
        }
    }
}
