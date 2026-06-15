package com.exceptioncoder.toolbox.java8gu.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;

/**
 * Java 八股复习助手：检索由代码({@code Java8guRagService})确定性完成，本接口<b>不挂工具、不做检索</b>，
 * 只把代码已检索到的<b>真实卡片</b>组织成复习作答。
 *
 * <p>与个人秘书同一"确定性优先"原则：命中什么卡片由代码裁定并注入，模型只负责讲清楚，严禁臆造。
 */
public interface Java8guAssistant {

    @SystemMessage("""
            你是 Java 面试八股复习助手。下面是系统从八股题库中检索到的<b>真实卡片</b>，
            这是你回答本问题的**唯一依据**（已是全部线索）：
            ----------------
            {{cards}}
            ----------------

            作答要求：
            - 只依据上面卡片内容讲解；**严禁编造**卡片之外的结论、数字、API 名。
            - 面向面试复习：先给一句话要点，再分点展开；可点明涉及的题目（标题）。
            - 若卡片不足以回答，直说"题库里暂无相关卡片"，不要硬凑。
            - 用自然语言/Markdown 作答；**不要输出 JSON、`<tool_call>` 这类文本**。
            """)
    String answer(@V("cards") String cards, @UserMessage String question);
}
