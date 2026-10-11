package com.exceptioncoder.toolbox.claudechat.service.storage;

import com.exceptioncoder.toolbox.claudechat.api.dto.SessionStorageView;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 按逻辑会话聚合已保存的引擎句柄，不推断未知引擎的存储或字节数。 */
@Service
public class SessionStorageService {
    private static final String SCOPE = "本地原生记录；不含工作区源码、Forge 上传附件及共享数据库";
    private final ObjectMapper mapper;
    private final NativeSessionStorage nativeStorage;

    @Autowired
    public SessionStorageService(ObjectMapper mapper) {
        this(mapper, new NativeSessionStorage(Path.of(System.getProperty("user.home"))));
    }

    SessionStorageService(ObjectMapper mapper, Path userHome) {
        this(mapper, new NativeSessionStorage(userHome, userHome.resolve(".copilot")));
    }

    private SessionStorageService(ObjectMapper mapper, NativeSessionStorage nativeStorage) {
        this.mapper = mapper;
        this.nativeStorage = nativeStorage;
    }

    /** 调用方先批量核对会话权限；这里仅处理受信任的持久化定位信息。 */
    public List<SessionStorageView> inspect(List<ClaudeChatSession> sessions) {
        long checkedAt = System.currentTimeMillis();
        long deadline = System.nanoTime() + 3_000_000_000L;
        Map<NativeIdentity, NativeSessionStorage.Measurement> measured = new LinkedHashMap<>();
        return sessions.stream().map(session -> inspect(session, checkedAt, deadline, measured)).toList();
    }

    private SessionStorageView inspect(ClaudeChatSession session, long checkedAt, long deadline,
                                       Map<NativeIdentity, NativeSessionStorage.Measurement> measured) {
        List<SessionStorageView.EngineStorage> engines = new ArrayList<>();
        Map<Path, Long> files = new LinkedHashMap<>();
        for (var entry : handles(session).entrySet()) {
            NativeIdentity identity = new NativeIdentity(entry.getKey(), entry.getValue(),
                    session.getCwd(), session.getCodexHome());
            var result = measured.computeIfAbsent(identity,
                    key -> System.nanoTime() >= deadline
                            ? NativeSessionStorage.unavailable(key.engine(), "unavailable", "本批文件读取达到时间上限，请稍后刷新")
                            : nativeStorage.measure(key.engine(), key.handle(), key.cwd(), key.codexHome()));
            engines.add(result.view());
            files.putAll(result.files());
        }
        boolean complete = engines.stream().allMatch(engine -> "available".equals(engine.status()));
        boolean known = engines.stream().anyMatch(engine -> engine.bytes() != null);
        String status = complete ? "available" : known ? "partial"
                : engines.stream().map(SessionStorageView.EngineStorage::status).distinct().count() == 1
                ? engines.getFirst().status() : "unavailable";
        Long bytes = known ? files.values().stream().mapToLong(Long::longValue).sum() : null;
        return new SessionStorageView(session.getId(), status, bytes, files.size(), checkedAt,
                complete ? SCOPE : SCOPE + "；总大小未完整获取", List.copyOf(engines));
    }

    private Map<String, String> handles(ClaudeChatSession session) {
        Map<String, String> handles = new LinkedHashMap<>();
        String stored = session.getEngineSessions();
        if (stored != null && !stored.isBlank()) {
            try {
                var node = mapper.readTree(stored);
                if (node.isObject() && node.size() <= 16) {
                    node.fields().forEachRemaining(entry -> {
                        if (entry.getValue().isTextual() && !entry.getValue().asText().isBlank()) {
                            handles.put(entry.getKey(), entry.getValue().asText());
                        } else {
                            handles.put("unknown", null);
                        }
                    });
                } else {
                    handles.put("unknown", null);
                }
            } catch (java.io.IOException exception) {
                handles.put("unknown", null);
            }
        }
        String currentEngine = session.getEngine() == null ? "claude" : session.getEngine();
        if (session.getEngines() != null) {
            for (String engine : session.getEngines().split(",")) {
                if (!engine.isBlank()) {
                    handles.putIfAbsent(engine.trim(), null);
                }
            }
        }
        String activeHandle = session.getSdkSessionId();
        if (activeHandle != null && !activeHandle.isBlank()) {
            handles.put(currentEngine, activeHandle);
        } else {
            handles.putIfAbsent(currentEngine, null);
        }
        return handles;
    }

    private record NativeIdentity(String engine, String handle, String cwd, String codexHome) { }
}
