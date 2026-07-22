package com.exceptioncoder.toolbox.foreconsult.api.dto;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurn;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * 咨询轮次的前端视图（只读）。ref* 字段沿用库中 JSON 数组字符串原样透出；attachments 解析为结构化列表。
 *
 * @param turnId             轮次 ID（UUID）
 * @param turnIndex          轮次序号（从 1 开始）
 * @param question           用户提问原文
 * @param answer             业务解答原文
 * @param refMenuPaths       命中的菜单路径，JSON 数组字符串（可为 null）
 * @param refGraphifyNodes   命中的 graphify 节点，JSON 数组字符串（可为 null）
 * @param refDomainKnowledge 命中的 domain-knowledge 条目，JSON 数组字符串（可为 null）
 * @param attachments        本轮用户附件列表（由 JSON 解析，空时为空列表）
 * @param createdAt          创建时间（Unix 毫秒）
 */
public record ConsultTurnView(
        String turnId,
        int turnIndex,
        String question,
        String answer,
        String refMenuPaths,
        String refGraphifyNodes,
        String refDomainKnowledge,
        List<AttView> attachments,
        long createdAt
) {

    private static final Logger log = LoggerFactory.getLogger(ConsultTurnView.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<AttView>> ATT_LIST = new TypeReference<>() {};

    /** 附件视图。path 位于 .kai-chat-attachments 下，前端图片可经 claude-chat serve 端点回显。 */
    public record AttView(String name, String path, String mime) {}

    public static ConsultTurnView from(ConsultTurn t) {
        return new ConsultTurnView(
                t.getTurnId(), t.getTurnIndex(), t.getQuestion(), t.getAnswer(),
                t.getRefMenuPaths(), t.getRefGraphifyNodes(), t.getRefDomainKnowledge(),
                parseAttachments(t.getAttachments()), t.getCreatedAt());
    }

    private static List<AttView> parseAttachments(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            List<AttView> parsed = MAPPER.readValue(json, ATT_LIST);
            return parsed != null ? parsed : List.of();
        } catch (Exception e) {
            log.warn("[fore-consult] 附件 JSON 解析失败: {}", e.getMessage());
            return List.of();
        }
    }
}
