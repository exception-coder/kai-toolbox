package com.exceptioncoder.toolbox.foreconsult.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 业务系统咨询的单轮问答：对应 consult_turn 表的一行。
 * ref* 三个字段以 JSON 数组字符串形式存储命中的引用（菜单路径 / graphify 节点 / domain-knowledge 条目），
 * MVP 阶段可为 null（原始问答归档，引用清单回吐为后续迭代）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConsultTurn {

    private String turnId;
    private String sessionId;
    /** 轮次序号，从 1 开始。 */
    private int turnIndex;
    private String question;
    private String answer;
    /** 命中的前端菜单路径/菜单名，JSON 数组字符串，可为 null。 */
    private String refMenuPaths;
    /** 命中的 graphify 图谱节点，JSON 数组字符串，可为 null。 */
    private String refGraphifyNodes;
    /** 命中的 domain-knowledge 条目，JSON 数组字符串，可为 null。 */
    private String refDomainKnowledge;
    /** 本轮用户附件，JSON 数组字符串 [{name,path,mime}]，可为 null。 */
    private String attachments;
    private long createdAt;
}
