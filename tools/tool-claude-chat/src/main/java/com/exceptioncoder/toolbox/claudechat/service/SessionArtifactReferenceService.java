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

/** 仅授权当前开发会话的助手回复已引用的具体图片或图文件，不扩大项目目录读权限。 */
@Service
public class SessionArtifactReferenceService {
    private static final int MAX_SESSIONS = 128;
    private static final int MAX_REFERENCES = 512;
    private static final Pattern IMAGE = Pattern.compile("!\\[[^\\]\\r\\n]*\\]\\((?:<([^>\\r\\n]+)>|([^\\r\\n]*?))(?:\\s+\"[^\"]*\")?\\)");
    private static final Pattern LINK = Pattern.compile("(?<!!)\\[[^\\]\\r\\n]*\\]\\((?:<([^>\\r\\n]+)>|([^\\r\\n]*?))(?:\\s+\"[^\"]*\")?\\)");
    private static final Pattern LOCATION_SUFFIX = Pattern.compile("(?::\\d+(?::\\d+)?|#L\\d+)$", Pattern.CASE_INSENSITIVE);
    public enum Kind { IMAGE, DIAGRAM }
    private record Reference(Kind kind, Path path) { }
    private final SessionHistoryService history;
    private final ProjectAccess projectAccess;
    private final ObjectMapper mapper;
    private final Map<String, Set<Reference>> references = new LinkedHashMap<>(16, 0.75f, true);

    public SessionArtifactReferenceService(SessionHistoryService history, ProjectAccess projectAccess, ObjectMapper mapper) {
        this.history = history;
        this.projectAccess = projectAccess;
        this.mapper = mapper;
    }

    /** 调用方必须先完成会话及原生句柄鉴权。按已读取页收集，避免文件请求扫描整份历史。 */
    public synchronized MessagePage remember(ClaudeChatSession session, MessagePage page) {
        if (session == null || !SessionExecutionPolicy.STANDARD.equals(SessionExecutionPolicy.normalize(session.getExecutionPolicy()))) return page;
        Set<Reference> paths = references.computeIfAbsent(session.getId(), ignored -> new LinkedHashSet<>());
        for (var item : page.items()) {
            if (!"assistant".equals(item.kind()) || item.text() == null) continue;
            for (Kind kind : Kind.values()) {
                var matches = (kind == Kind.IMAGE ? IMAGE : LINK).matcher(item.text());
                while (matches.find()) {
                    String raw = matches.group(1) == null ? matches.group(2) : matches.group(1);
                    Path path = localPath(kind == Kind.DIAGRAM ? LOCATION_SUFFIX.matcher(raw).replaceFirst("") : raw);
                    if (path != null && path.isAbsolute() && (kind == Kind.IMAGE || isDiagram(path))) {
                        paths.add(new Reference(kind, path.normalize()));
                    }
                }
            }
        }
        while (paths.size() > MAX_REFERENCES) paths.remove(paths.iterator().next());
        while (references.size() > MAX_SESSIONS) references.remove(references.keySet().iterator().next());
        return page;
    }

    public Path resolve(ClaudeChatSession session, String linkedPath) {
        return resolve(session, linkedPath, Kind.IMAGE);
    }

    public Path resolve(ClaudeChatSession session, String linkedPath, Kind kind) {
        Path target = Path.of(linkedPath).normalize();
        if (!target.isAbsolute() || !SessionExecutionPolicy.STANDARD.equals(SessionExecutionPolicy.normalize(session.getExecutionPolicy()))) {
            throw new IllegalArgumentException("文件路径不属于当前开发会话");
        }
        projectAccess.requireAllowed(target);
        projectAccess.requireAllowed(realPath(target));
        if (kind == Kind.DIAGRAM && !isDiagram(target)) {
            throw new IllegalArgumentException("请选择 .drawio 或 .drawio.xml 图文件");
        }
        if (contains(session.getId(), kind, target)) return target;
        Set<String> handles = new LinkedHashSet<>();
        if (session.getSdkSessionId() != null) handles.add(session.getSdkSessionId());
        try {
            if (session.getEngineSessions() != null) for (var value : mapper.readTree(session.getEngineSessions())) {
                if (value.isTextual() && !value.asText().isBlank() && handles.size() < 8) handles.add(value.asText());
            }
        } catch (java.io.IOException failure) { /* 无效映射不能扩大原生句柄范围。 */ }
        for (String handle : handles) {
            // 仅最近一页兜底直播消息；更早引用由正常历史分页登记，不全量解析大文件。
            remember(session, history.readCursorMessages(session.getCwd(), handle, session.getCodexHome(), null, null, 100));
            if (contains(session.getId(), kind, target)) return target;
        }
        throw new IllegalArgumentException("文件不在当前项目范围，且未核验到该会话的助手引用；请重新加载对应历史消息后重试");
    }

    private synchronized boolean contains(String sessionId, Kind kind, Path path) {
        Set<Reference> paths = references.get(sessionId);
        return paths != null && paths.contains(new Reference(kind, path));
    }

    private static boolean isDiagram(Path path) {
        String name = path.getFileName() == null ? "" : path.getFileName().toString().toLowerCase(java.util.Locale.ROOT);
        return name.endsWith(".drawio") || name.endsWith(".drawio.xml");
    }

    private static Path realPath(Path target) {
        try {
            return target.toRealPath();
        } catch (java.io.IOException failure) {
            return target; // 存在性与可读性由对应的有界读取接口报告。
        }
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
