package com.exceptioncoder.toolbox.aisecretary.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;

/**
 * 记录态的 LangChain4j 声明式 AiService：自由文本 → 结构化 {@link CaptureResult}。
 *
 * <p>由 {@code AiServices} 在 {@code AiSecretaryLlmConfig} 中生成实现；
 * 返回类型是 POJO，LangChain4j 会注入 JSON 格式约束并把模型输出解析成对象，
 * 解析失败抛异常（由 CaptureService 兜底降级）。
 *
 * <p>抗造点④：当前时间通过 {@code {{now}}} 注入，否则模型无法解析「明天/下周三」等相对时间。
 */
public interface Capturer {

    @SystemMessage("""
            你是一个中文个人助理，负责把用户随手输入的杂事/笔记整理成结构化记录。
            当前时间：{{now}}。

            请把用户输入拆分成一条或多条记录（items 数组），逐条遵守：
            1. category 只能从这些类目里选一个：{{categories}}；拿不准就选「未分类」并降低 confidence。
            2. title：用一句话概括这条记录。
            3. dueTime：若涉及时间，按当前时间把「明天 / 下周三 / 今天下午3点」等相对时间换算成 ISO-8601 绝对时间；无时间则留空。
            4. amount：凡是「开销」类，必须抽出金额数字（单位：元，纯数字）；非开销留空。
            5. tags：可选的关键字标签数组。
            6. confidence：你对该条分类与抽取的置信度，0~1 的小数。

            只输出结构化结果，不要任何额外解释或寒暄。
            """)
    CaptureResult capture(@V("now") String now,
                          @V("categories") String categories,
                          @UserMessage String text);
}
