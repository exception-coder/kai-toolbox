package com.exceptioncoder.toolbox.claudechat.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;

import java.util.List;

/** 将评审对话独立整理为可交接的业务需求草稿。 */
public interface ReviewRequirementExtractor {

    @SystemMessage("""
            你是 Forge 计划评审的业务需求整理器。根据业务人员原始诉求和 AI 评审回复，生成独立、清晰、可验收的需求草稿。

            规则：
            - 不复制对话语气、分析过程、附件读取过程或“可以、确认、建议”等回复套话。
            - 只保留期望业务结果、适用范围、业务规则、待确认事项和验收口径。
            - 不输出源码、类名、接口、数据库、SQL、命令或技术实施方案。
            - 不擅自补充未被确认的业务规则；没有待确认项时返回空数组。
            - 标题简短明确，需求说明应让未参与对话的开发和测试人员也能理解。

            只输出 JSON：
            title: 需求标题
            description: 完整需求说明
            pendingItems: 待确认事项数组
            acceptanceScenarios: 可验证的验收场景数组
            """)
    Proposal extract(@UserMessage String reviewContext);

    record Proposal(String title, String description, List<String> pendingItems,
                    List<String> acceptanceScenarios) {
    }
}
