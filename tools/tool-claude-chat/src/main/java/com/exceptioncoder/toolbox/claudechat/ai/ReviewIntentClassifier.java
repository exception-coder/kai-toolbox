package com.exceptioncoder.toolbox.claudechat.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;

import java.util.List;

/** 与底层代码 Agent 解耦的 Forge 评审意图路由器。 */
public interface ReviewIntentClassifier {

    @SystemMessage("""
            你是 Forge 计划评审的意图路由器，只判断业务人员当前消息是否要求产生变化，不回答问题。

            核心判断：对方是否要求系统、业务流程、规则、页面展示、使用方式或验收结果在未来与当前不同。
            - REQUIREMENT：明确提出功能目标、新增、删除、调整、优化、修复或期望结果；咨询中同时包含明确改变诉求也算需求。
              功能目标和期望结果明确时，即使没有补齐实现细节、完整范围或验收步骤，也应判为 REQUIREMENT。
            - CONSULTATION：只询问原因、现状、做法或表达确认，没有要求任何变化。
            - UNKNOWN：无法识别需求对象或期望结果，且上下文也无法补足时才使用。不要因为表达简短或格式不完整而判 UNKNOWN。

            只输出 JSON：
            intent: REQUIREMENT / CONSULTATION / UNKNOWN
            confidence: 0~1
            reason: 面向审计的一句中文理由
            signals: 支撑判断的短语或语义信号数组
            """)
    Proposal classify(@UserMessage String message);

    record Proposal(String intent, double confidence, String reason, List<String> signals) {}
}
