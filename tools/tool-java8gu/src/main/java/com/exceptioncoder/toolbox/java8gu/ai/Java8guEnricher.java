package com.exceptioncoder.toolbox.java8gu.ai;

import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;

/**
 * Java 八股「知识补全器」：给一道题的原文，补全 markdown 里**缺失**的结构化字段
 * ——图解(mermaid)、面试问答、易错点、深度讲解。
 *
 * <p>与复习助手({@link Java8guAssistant})分工不同：助手是据检索卡片作答；本接口是**内容加工**，
 * 把非结构化正文加工成结构化知识，结果落 SQLite 缓存，绝不重复生成。
 *
 * <p>严格约束：只依据给定原文，产出**纯 JSON**（无 markdown 代码围栏、无解释性前后缀）。
 */
public interface Java8guEnricher {

    @UserMessage("""
            你是 Java 面试知识库的内容加工器。下面是一道八股题的原文（markdown）：
            ====== 原文开始 ======
            {{card}}
            ====== 原文结束 ======

            请**只依据原文**，补全这道题在结构化展示时需要、但原文里缺失或零散的字段，
            输出**一个 JSON 对象**，字段如下（全部必填，无内容时给空数组/空字符串）：

            {
              "diagram": "一段 mermaid 源码，用 flowchart/sequenceDiagram 等把核心流程或关系图形化；原文若已足够简单可为空字符串",
              "qa": [ { "q": "高频面试追问", "a": "简洁准确的答案（1-3 句）" } ],
              "pitfalls": [ "一条易错点/坑（一句话）" ],
              "explanation": "面向面试复习的深度讲解（markdown，200-400 字，先给结论再展开）"
            }

            硬性要求：
            - 严禁编造原文没有依据的结论、数字、API 名；拿不准就少写。
            - mermaid 语法必须可渲染：节点文本用双引号包裹，避免特殊字符破坏语法。
            - 直接输出 JSON 本体，**不要**用 ```json 围栏包裹，**不要**任何前后缀文字。
            """)
    String enrich(@V("card") String card);
}
