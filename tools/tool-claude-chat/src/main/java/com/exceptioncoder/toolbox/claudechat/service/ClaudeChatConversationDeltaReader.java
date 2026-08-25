package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.common.assistant.AssistantCapabilityPort;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 从 Claude/Codex transcript 读取稳定排序的会话增量。 */
@Service
public class ClaudeChatConversationDeltaReader {

    private static final Logger log = LoggerFactory.getLogger(ClaudeChatConversationDeltaReader.class);
    private static final int MAX_ENTRY_CHARS = 4_000;
    private static final int MAX_BATCH_ENTRIES = 100;

    private final ClaudeChatSessionRepository sessionRepository;
    private final SessionHistoryService historyService;
    private final ObjectMapper mapper;

    public ClaudeChatConversationDeltaReader(ClaudeChatSessionRepository sessionRepository,
                                             SessionHistoryService historyService,
                                             ObjectMapper mapper) {
        this.sessionRepository = sessionRepository;
        this.historyService = historyService;
        this.mapper = mapper;
    }

    /** 读取指定水位之后的首个有界批次，保留较老增量以避免跳跃丢失。 */
    public ConversationDelta read(String sessionId, long afterWatermark) {
        List<AssistantCapabilityPort.ConversationMessage> all = readAllWithWarnings(sessionId).messages();
        List<AssistantCapabilityPort.ConversationMessage> remaining = all.stream()
                .filter(entry -> entry.sequence() > afterWatermark)
                .toList();
        List<AssistantCapabilityPort.ConversationMessage> batch = remaining.size() <= MAX_BATCH_ENTRIES
                ? remaining : remaining.subList(0, MAX_BATCH_ENTRIES);
        long toWatermark = batch.isEmpty()
                ? afterWatermark : batch.get(batch.size() - 1).sequence();
        return new ConversationDelta(afterWatermark, toWatermark, List.copyOf(batch),
                remaining.size() <= MAX_BATCH_ENTRIES);
    }

    /** 读取完整会话事实，供既有开发上下文 Provider 复用同一排序算法。 */
    public List<AssistantCapabilityPort.ConversationMessage> readAll(String sessionId) {
        return readAllWithWarnings(sessionId).messages();
    }

    /** 读取完整会话事实和可恢复告警。 */
    public ConversationRead readAllWithWarnings(String sessionId) {
        ClaudeChatSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        return readAllWithWarnings(session);
    }

    List<AssistantCapabilityPort.ConversationMessage> readAll(ClaudeChatSession session) {
        return readAllWithWarnings(session).messages();
    }

    ConversationRead readAllWithWarnings(ClaudeChatSession session) {
        List<String> warnings = new ArrayList<>();
        Set<String> sessionIds = resolveEngineSessionIds(session, warnings);
        List<TimedConversationEntry> collected = new ArrayList<>();
        long fallbackOffset = 0L;
        for (String sdkSessionId : sessionIds) {
            MessagePage page = historyService.readMessages(
                    session.getCwd(), sdkSessionId, session.getCodexHome(), null, Integer.MAX_VALUE);
            if (page.transcriptMissing()) {
                warnings.add("会话段 " + sdkSessionId + " 的 transcript 已丢失");
                continue;
            }
            for (ChatMessageView item : page.items()) {
                String content = content(item);
                if (content == null || content.isBlank()) {
                    continue;
                }
                long timestamp = item.ts() != null ? item.ts() : session.getStartedAt() + fallbackOffset++;
                collected.add(new TimedConversationEntry(
                        timestamp, collected.size(), item.kind(), truncate(content, MAX_ENTRY_CHARS)));
            }
        }
        collected.sort(Comparator.comparingLong(TimedConversationEntry::timestamp)
                .thenComparingLong(TimedConversationEntry::stableOrder));
        return new ConversationRead(sequence(collected), List.copyOf(warnings));
    }

    private Set<String> resolveEngineSessionIds(ClaudeChatSession session, List<String> warnings) {
        Set<String> sessionIds = new LinkedHashSet<>();
        String engineSessions = session.getEngineSessions();
        if (engineSessions != null && !engineSessions.isBlank()) {
            try {
                Map<?, ?> parsed = mapper.readValue(engineSessions, LinkedHashMap.class);
                parsed.values().stream()
                        .filter(String.class::isInstance)
                        .map(String.class::cast)
                        .filter(value -> !value.isBlank())
                        .forEach(sessionIds::add);
            } catch (Exception exception) {
                warnings.add("引擎会话映射无法解析，已回退当前会话段");
                log.warn("[assistant] 会话引擎映射无法解析", exception);
            }
        }
        if (session.getSdkSessionId() != null && !session.getSdkSessionId().isBlank()) {
            sessionIds.add(session.getSdkSessionId());
        }
        return sessionIds;
    }

    private String content(ChatMessageView item) {
        return switch (item.kind()) {
            case "user", "assistant" -> item.text();
            case "tool" -> formatTool(item);
            default -> null;
        };
    }

    private String formatTool(ChatMessageView item) {
        StringBuilder text = new StringBuilder("工具 ").append(item.toolName());
        if (item.input() != null) {
            text.append("\n输入：").append(safeJson(item.input()));
        }
        if (item.output() != null && !item.output().isBlank()) {
            text.append("\n结果：").append(item.output());
        }
        if (Boolean.TRUE.equals(item.isError())) {
            text.append("\n状态：失败");
        }
        return text.toString();
    }

    private List<AssistantCapabilityPort.ConversationMessage> sequence(List<TimedConversationEntry> collected) {
        List<AssistantCapabilityPort.ConversationMessage> entries = new ArrayList<>(collected.size());
        long previousTimestamp = Long.MIN_VALUE;
        int tie = 0;
        for (TimedConversationEntry item : collected) {
            tie = item.timestamp() == previousTimestamp ? tie + 1 : 0;
            previousTimestamp = item.timestamp();
            entries.add(new AssistantCapabilityPort.ConversationMessage(
                    item.timestamp() * 1_000 + tie, item.role(), item.content()));
        }
        return entries;
    }

    private String safeJson(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception exception) {
            return String.valueOf(value);
        }
    }

    private static String truncate(String value, int maxChars) {
        return value.length() <= maxChars ? value : value.substring(0, maxChars) + "\n…（已截断）";
    }

    private record TimedConversationEntry(long timestamp, long stableOrder, String role, String content) {
    }

    /** 一个不会跳过较老消息的有界会话增量批次。 */
    public record ConversationDelta(long fromWatermark, long toWatermark,
                                    List<AssistantCapabilityPort.ConversationMessage> messages,
                                    boolean caughtUp) {
    }

    /** 完整会话事实和读取告警。 */
    public record ConversationRead(List<AssistantCapabilityPort.ConversationMessage> messages,
                                   List<String> warnings) {
    }
}
