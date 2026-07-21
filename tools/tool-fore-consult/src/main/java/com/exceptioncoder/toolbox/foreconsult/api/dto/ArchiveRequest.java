package com.exceptioncoder.toolbox.foreconsult.api.dto;

import java.util.List;

/**
 * 结束咨询并归档的请求体（一次性提交本次会话全部轮次）。
 *
 * @param rawReferenceJson 引擎回吐的引用清单原始 JSON，或前端序列化的原始对话（容错留档，可为 null）
 * @param parseStatus      引用清单解析状态：NONE | OK | FAILED（可选，null 时服务层按 NONE 兜底）
 * @param turns            本次会话的问答轮次（可为空列表）
 */
public record ArchiveRequest(
        String rawReferenceJson,
        String parseStatus,
        List<TurnItem> turns
) {

    /**
     * 单轮问答。
     *
     * @param turnIndex          轮次序号（从 1 开始；服务层若收到非正数会按列表顺序兜底重排）
     * @param question           用户提问原文
     * @param answer             业务解答原文
     * @param refMenuPaths       命中的菜单路径，JSON 数组字符串（可为 null）
     * @param refGraphifyNodes   命中的 graphify 节点，JSON 数组字符串（可为 null）
     * @param refDomainKnowledge 命中的 domain-knowledge 条目，JSON 数组字符串（可为 null）
     */
    public record TurnItem(
            int turnIndex,
            String question,
            String answer,
            String refMenuPaths,
            String refGraphifyNodes,
            String refDomainKnowledge
    ) {
    }
}
