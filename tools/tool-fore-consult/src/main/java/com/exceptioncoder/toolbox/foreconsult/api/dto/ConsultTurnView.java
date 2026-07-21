package com.exceptioncoder.toolbox.foreconsult.api.dto;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurn;

/**
 * 咨询轮次的前端视图（只读）。ref* 字段沿用库中 JSON 数组字符串原样透出，由前端解析渲染。
 *
 * @param turnId             轮次 ID（UUID）
 * @param turnIndex          轮次序号（从 1 开始）
 * @param question           用户提问原文
 * @param answer             业务解答原文
 * @param refMenuPaths       命中的菜单路径，JSON 数组字符串（可为 null）
 * @param refGraphifyNodes   命中的 graphify 节点，JSON 数组字符串（可为 null）
 * @param refDomainKnowledge 命中的 domain-knowledge 条目，JSON 数组字符串（可为 null）
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
        long createdAt
) {

    public static ConsultTurnView from(ConsultTurn t) {
        return new ConsultTurnView(
                t.getTurnId(), t.getTurnIndex(), t.getQuestion(), t.getAnswer(),
                t.getRefMenuPaths(), t.getRefGraphifyNodes(), t.getRefDomainKnowledge(), t.getCreatedAt());
    }
}
