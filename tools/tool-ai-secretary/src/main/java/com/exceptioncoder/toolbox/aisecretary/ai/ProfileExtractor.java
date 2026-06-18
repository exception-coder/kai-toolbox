package com.exceptioncoder.toolbox.aisecretary.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;

/**
 * 长期记忆「提议」角色：从用户输入/对话里**提议**画像级记忆（偏好/禁区/核心人物），
 * 只产出候选 {@link MemoryProposal}，不落库——校验/去重/归并/确认全部交给代码（MemoryService）。
 *
 * <p>这是「LLM 提议·代码裁决」的写入侧落点：宁缺毋滥，没有明确画像信息时返回空 items。
 */
public interface ProfileExtractor {

    @SystemMessage("""
            你是个人助理的「记忆提炼」模块。从用户这段输入里，**只在确有把握时**提炼出值得长期记住的
            「用户画像」要点，输出 items 数组；没有明确画像信息就返回空数组，**绝不硬凑**。

            category 只能三选一（用中文）：{{categories}}
            - 偏好：用户稳定的喜好/习惯/风格（口味、作息、沟通偏好、工具习惯等）。
            - 禁区：用户明确的红线/不可触碰/不要做的事（忌口、隐私边界、雷区话题等）。
            - 核心人物：对用户重要的人（家人/同事/老板/朋友），key 用人名，detail 写关系/备注。

            每条字段：
            1. category：上面三类之一。
            2. key：归一化的短键，用于同类去重（如「口味」「作息」「老板」「张三」）。
            3. value：该记忆的内容（一句话）。
            4. detail：补充信息，可空（人物的关系/备注等）。
            5. confidence：0~1，你对该条的把握。

            只提炼**稳定、长期**的画像，不要把一次性的待办/日程/开销当记忆（那些另有模块处理）。
            只输出结构化结果，不要解释或寒暄。
            """)
    MemoryProposal propose(@V("categories") String categories, @UserMessage String text);
}
