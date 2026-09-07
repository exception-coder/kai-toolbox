package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionUsageView;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.LinkedHashMap;
import java.util.Map;

/** 按真实文件和评审边界复用有限数量的历史索引，同一视图的更新与读取串行化。 */
final class CodexHistoryReader {
    private static final int MAX_CACHED_VIEWS = 16;
    private final ObjectMapper mapper;
    private final Map<Key, CachedIndex> indexes = new LinkedHashMap<>(MAX_CACHED_VIEWS, 0.75f, true);

    CodexHistoryReader(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    MessagePage page(Path path, String reviewCwd, Integer before, int limit) throws IOException {
        Key key = new Key(path.toRealPath(), CodexHistoryIndex.normalizeCwd(reviewCwd));
        CachedIndex cached = cached(key);
        synchronized (cached) {
            refresh(key, cached);
            try {
                MessagePage page = cached.index.page(mapper, key.path(), before, limit);
                verifySnapshot(key.path(), cached.stamp);
                return page;
            } catch (IOException | RuntimeException error) {
                cached.stamp = null;
                throw error;
            }
        }
    }

    SessionUsageView usage(Path path) throws IOException {
        Key key = new Key(path.toRealPath(), "");
        CachedIndex cached = cached(key);
        synchronized (cached) {
            refresh(key, cached);
            return cached.index.usage();
        }
    }

    private synchronized CachedIndex cached(Key key) {
        CachedIndex cached = indexes.computeIfAbsent(key, ignored -> new CachedIndex());
        while (indexes.size() > MAX_CACHED_VIEWS) {
            indexes.remove(indexes.keySet().iterator().next());
        }
        return cached;
    }

    private void refresh(Key key, CachedIndex cached) throws IOException {
        try {
            BasicFileAttributes attributes = Files.readAttributes(key.path(), BasicFileAttributes.class);
            if (cached.stamp == null || !cached.stamp.canAppend(key.path(), attributes)) {
                cached.index = new CodexHistoryIndex(key.reviewCwd());
            }
            CodexHistoryFileStamp snapshot = CodexHistoryFileStamp.capture(key.path(), attributes);
            cached.index.update(mapper, key.path(), attributes.size());
            verifySnapshot(key.path(), snapshot);
            cached.stamp = snapshot;
        } catch (IOException | RuntimeException error) {
            // 更新可能已消费部分记录，失败后不得从旧游标重放到同一个累计器。
            cached.stamp = null;
            throw error;
        }
    }

    private void verifySnapshot(Path path, CodexHistoryFileStamp snapshot) throws IOException {
        if (!snapshot.canAppend(path, Files.readAttributes(path, BasicFileAttributes.class))) {
            throw new IOException("Codex history changed during snapshot read: " + path);
        }
    }

    /** 累计解析记录数供性能回归验证，正文物化不计入索引扫描。 */
    long scannedRecords(Path path) throws IOException {
        CachedIndex cached = cached(new Key(path.toRealPath(), ""));
        synchronized (cached) {
            return cached.index == null ? 0 : cached.index.scannedRecords();
        }
    }

    /** 路径隔离 Codex home，工作目录隔离公开评审视图。 */
    private record Key(Path path, String reviewCwd) { }

    /** 锁对象在索引重建时保持不变。 */
    private static final class CachedIndex {
        private CodexHistoryIndex index;
        private CodexHistoryFileStamp stamp;
    }
}
