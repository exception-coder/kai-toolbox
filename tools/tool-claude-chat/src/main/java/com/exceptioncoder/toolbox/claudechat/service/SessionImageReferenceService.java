package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** 仅授权当前开发会话的助手回复已引用的具体图片，不扩大项目目录读权限。 */
@Service
public class SessionImageReferenceService {
    private static final int MAX_SESSIONS = 128;
    private static final int MAX_IMAGES = 512;
    private static final Pattern IMAGE = Pattern.compile("!\\[[^\\]\\r\\n]*\\]\\((?:<([^>\\r\\n]+)>|([^\\r\\n]*?))(?:\\s+\"[^\"]*\")?\\)");
    private final SessionHistoryService history;
    private final ProjectAccess projectAccess;
    private final ObjectMapper mapper;
    private final Map<String, Set<Path>> references = new LinkedHashMap<>(16, 0.75f, true);

    public SessionImageReferenceService(SessionHistoryService history, ProjectAccess projectAccess, ObjectMapper mapper) {
        this.history = history;
        this.projectAccess = projectAccess;
        this.mapper = mapper;
    }

    /** 调用方必须先完成会话及原生句柄鉴权。按已读取页收集，避免图片请求扫描整份历史。 */
    public synchronized MessagePage remember(ClaudeChatSession session, MessagePage page) {
        if (session == null || !SessionExecutionPolicy.STANDARD.equals(SessionExecutionPolicy.normalize(session.getExecutionPolicy()))) return page;
        Set<Path> paths = references.computeIfAbsent(session.getId(), ignored -> new LinkedHashSet<>());
        for (var item : page.items()) {
            if (!"assistant".equals(item.kind()) || item.text() == null) continue;
            var matches = IMAGE.matcher(item.text());
            while (matches.find()) {
                Path path = localPath(matches.group(1) == null ? matches.group(2) : matches.group(1));
                if (path != null && path.isAbsolute()) paths.add(path.normalize());
            }
        }
        while (paths.size() > MAX_IMAGES) paths.remove(paths.iterator().next());
        while (references.size() > MAX_SESSIONS) references.remove(references.keySet().iterator().next());
        return page;
    }

    public Path resolve(ClaudeChatSession session, String linkedPath) {
        Path target = Path.of(linkedPath).normalize();
        if (!target.isAbsolute() || !SessionExecutionPolicy.STANDARD.equals(SessionExecutionPolicy.normalize(session.getExecutionPolicy()))) {
            throw new IllegalArgumentException("图片路径不属于当前开发会话");
        }
        projectAccess.requireAllowed(target);
        if (contains(session.getId(), target)) return target;
        Set<String> handles = new LinkedHashSet<>();
        if (session.getSdkSessionId() != null) handles.add(session.getSdkSessionId());
        try {
            if (session.getEngineSessions() != null) for (var value : mapper.readTree(session.getEngineSessions())) {
                if (value.isTextual() && !value.asText().isBlank() && handles.size() < 8) handles.add(value.asText());
            }
        } catch (java.io.IOException failure) { /* 无效映射不能扩大原生句柄范围。 */ }
        for (String handle : handles) {
            // 仅最近一页兜底直播消息；更早图片由正常历史分页登记，不全量解析大文件。
            remember(session, history.readCursorMessages(session.getCwd(), handle, session.getCodexHome(), null, null, 100));
            if (contains(session.getId(), target)) return target;
        }
        throw new IllegalArgumentException("图片不在当前项目范围，且未核验到该会话的助手图片引用；请重新加载对应历史消息后重试");
    }

    private synchronized boolean contains(String sessionId, Path path) {
        Set<Path> paths = references.get(sessionId);
        return paths != null && paths.contains(path);
    }

    private static Path localPath(String raw) {
        if (raw == null) return null;
        try {
            String value = raw.trim();
            if (value.regionMatches(true, 0, "file:", 0, 5)) return Path.of(URI.create(value)).normalize();
            if (value.matches("(?i)^(?:https?|data|blob):.*") || value.startsWith("//")) return null;
            value = URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8);
            if (value.matches("^/[a-zA-Z]:/.*")) value = value.substring(1);
            return Path.of(value).normalize();
        } catch (IllegalArgumentException failure) { return null; }
    }
}
