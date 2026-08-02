package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.ConversationEntry;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.DevelopmentChangeContext;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.GitRepositoryChange;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdDocChangeCandidate;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

/** 将会话、代码、文档和澄清回答规整为带稳定 ID 的证据包。 */
@Service
public class PrdDocChangeEvidenceBuilder {

    private static final int MAX_DOCUMENT_CHARS = 60_000;
    private static final int MAX_GIT_CHARS = 80_000;

    private final ObjectMapper mapper;

    public PrdDocChangeEvidenceBuilder(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /** 构造不会包含鉴权信息的分析证据包。 */
    public PrdDocChangeEvidenceBundle build(PrdSession session, DevelopmentChangeContext context,
                                            String prd, String tdd, String clarificationHistoryJson) {
        return build(session, context, prd, tdd, clarificationHistoryJson, null);
    }

    /** 再次分析时把上一轮结论作为基线证据，并只追加其后的会话事实。 */
    public PrdDocChangeEvidenceBundle build(PrdSession session, DevelopmentChangeContext context,
                                            String prd, String tdd, String clarificationHistoryJson,
                                            PrdDocChangeCandidate previousAnalysis) {
        List<PrdDocChangeEvidenceBundle.EvidenceItem> items = new ArrayList<>();
        addDocuments(items, prd, tdd);
        addPreviousAnalysis(items, previousAnalysis);
        addConversation(items, context.conversation());
        addRepositories(items, context.repositories());
        addClarifications(items, clarificationHistoryJson);
        addWarnings(items, context.warnings());
        return new PrdDocChangeEvidenceBundle(
                session.getTitle(), session.getProject(), session.getModule(),
                truncate(prd, MAX_DOCUMENT_CHARS), truncate(tdd, MAX_DOCUMENT_CHARS),
                hash(prd), hash(tdd), List.copyOf(items), context.warnings(), context.executionProfile());
    }

    private void addPreviousAnalysis(List<PrdDocChangeEvidenceBundle.EvidenceItem> items,
                                     PrdDocChangeCandidate previous) {
        if (previous == null) return;
        String content = "上次范围=" + previous.getDecision()
                + "\n摘要=" + value(previous.getSummary())
                + "\n理由=" + value(previous.getReasoning())
                + "\n已分析到会话序号=" + previous.getConversationToSeq();
        items.add(new PrdDocChangeEvidenceBundle.EvidenceItem(
                "ANALYSIS-PREV", "PREVIOUS_ANALYSIS", "上次文档差异分析结论", content, false));
    }

    private void addDocuments(List<PrdDocChangeEvidenceBundle.EvidenceItem> items, String prd, String tdd) {
        items.add(new PrdDocChangeEvidenceBundle.EvidenceItem(
                "DOC-PRD", "DOCUMENT", "当前 PRD", truncate(prd, MAX_DOCUMENT_CHARS),
                prd.length() > MAX_DOCUMENT_CHARS));
        if (!tdd.isBlank()) {
            items.add(new PrdDocChangeEvidenceBundle.EvidenceItem(
                    "DOC-TDD", "DOCUMENT", "当前 TDD", truncate(tdd, MAX_DOCUMENT_CHARS),
                    tdd.length() > MAX_DOCUMENT_CHARS));
        }
    }

    private void addConversation(List<PrdDocChangeEvidenceBundle.EvidenceItem> items,
                                 List<ConversationEntry> conversation) {
        int index = 1;
        for (ConversationEntry entry : conversation) {
            String type = switch (entry.role()) {
                case "user" -> "USER_MESSAGE";
                case "tool" -> "TOOL_RESULT";
                default -> "ASSISTANT_MESSAGE";
            };
            items.add(new PrdDocChangeEvidenceBundle.EvidenceItem(
                    "CONV-%04d".formatted(index++), type,
                    entry.role() + "@" + entry.sequence(), entry.content(), false));
        }
    }

    private void addRepositories(List<PrdDocChangeEvidenceBundle.EvidenceItem> items,
                                 List<GitRepositoryChange> repositories) {
        int index = 1;
        for (GitRepositoryChange repository : repositories) {
            String summary = "仓库 " + shortKey(repository.repositoryKey())
                    + "，基线 " + shortHash(repository.baseCommit())
                    + "，当前 " + shortHash(repository.headCommit())
                    + "，变化文件 " + repository.changedFiles().size();
            String content = "files=" + repository.changedFiles() + "\n" + repository.diff();
            if (repository.error() != null && !repository.error().isBlank()) {
                content += "\nerror=" + repository.error();
            }
            items.add(new PrdDocChangeEvidenceBundle.EvidenceItem(
                    "GIT-%04d".formatted(index++), "GIT_CHANGE", summary,
                    truncate(content, MAX_GIT_CHARS), repository.truncated() || content.length() > MAX_GIT_CHARS));
        }
    }

    private void addClarifications(List<PrdDocChangeEvidenceBundle.EvidenceItem> items, String historyJson) {
        try {
            JsonNode history = mapper.readTree(historyJson == null ? "[]" : historyJson);
            if (!history.isArray()) {
                return;
            }
            int index = 1;
            for (JsonNode item : history) {
                String content = "问题：" + item.path("question").asText("")
                        + "\n回答：" + item.path("answer").asText("");
                items.add(new PrdDocChangeEvidenceBundle.EvidenceItem(
                        "CLARIFY-%04d".formatted(index++), "CLARIFICATION",
                        "用户澄清回答", content, false));
            }
        } catch (Exception e) {
            items.add(new PrdDocChangeEvidenceBundle.EvidenceItem(
                    "CLARIFY-WARN", "WARNING", "澄清历史无法解析",
                    "澄清历史无法解析：" + e.getMessage(), false));
        }
    }

    private void addWarnings(List<PrdDocChangeEvidenceBundle.EvidenceItem> items, List<String> warnings) {
        for (int index = 0; index < warnings.size(); index++) {
            items.add(new PrdDocChangeEvidenceBundle.EvidenceItem(
                    "WARN-%04d".formatted(index + 1), "WARNING", warnings.get(index),
                    warnings.get(index), false));
        }
    }

    private static String hash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("生成文档哈希失败", e);
        }
    }

    private static String shortKey(String value) {
        return value == null || value.length() <= 12 ? String.valueOf(value) : value.substring(0, 12);
    }

    private static String shortHash(String value) {
        return value == null || value.isBlank() ? "无" : value.substring(0, Math.min(8, value.length()));
    }

    private static String truncate(String value, int maxChars) {
        String normalized = value == null ? "" : value;
        return normalized.length() <= maxChars
                ? normalized : normalized.substring(0, maxChars) + "\n…（已截断）";
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }
}
