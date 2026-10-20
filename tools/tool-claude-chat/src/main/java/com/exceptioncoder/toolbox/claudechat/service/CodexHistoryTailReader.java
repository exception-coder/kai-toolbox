package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/** 最近页与用量全量索引分离；只缓存最多八个有界窗口的定位元数据。 */
final class CodexHistoryTailReader {
    private final ObjectMapper mapper;
    private final Map<Key, Window> windows = new LinkedHashMap<>(8, 0.75f, true);

    CodexHistoryTailReader(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    MessagePage page(Path file, String token, int limit) throws IOException {
        Path path = file.toRealPath();
        CodexHistoryCursor snapshot = token == null ? CodexHistoryCursor.capture(path)
                : CodexHistoryCursor.decode(mapper, token);
        snapshot.verify(path);
        long end = token == null ? snapshot.snapshotSize()
                : snapshot.before() == 0 ? snapshot.start() : snapshot.end();
        if (end == 0) {
            return MessagePage.empty();
        }
        long start = token != null && snapshot.before() > 0 ? snapshot.start()
                : CodexHistoryWindowLocator.start(mapper, path, end);
        Integer before = token != null && snapshot.before() > 0 ? snapshot.before() : null;
        CodexHistoryIndex index = window(path, snapshot, start, end);
        MessagePage page = index.page(mapper, path, before, Math.clamp(limit, 1, 100));
        snapshot.verify(path);
        String next = page.nextBefore() > 0 ? snapshot.window(start, end, page.nextBefore()).encode(mapper)
                : start > 0 ? snapshot.window(start, end, 0).encode(mapper) : null;
        return new MessagePage(page.items(), next == null ? 0 : null, false, next);
    }

    private CodexHistoryIndex window(Path path, CodexHistoryCursor snapshot, long start, long end)
            throws IOException {
        Key key = new Key(path, snapshot.identity(), snapshot.modified(), start, end);
        Window window;
        synchronized (windows) {
            window = windows.computeIfAbsent(key, ignored -> new Window());
            while (windows.size() > 8) {
                windows.remove(windows.keySet().iterator().next());
            }
        }
        synchronized (window) {
            if (window.index == null) {
                var index = new CodexHistoryIndex(null, start, true);
                index.update(mapper, path, end);
                snapshot.verify(path);
                window.index = index;
            }
            return window.index;
        }
    }

    private record Key(Path path, String identity, String modified, long start, long end) { }

    private static final class Window {
        private CodexHistoryIndex index;
    }
}
