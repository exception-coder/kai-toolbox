package com.exceptioncoder.toolbox.aisecretary.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;

/**
 * 回忆态的 LangChain4j 声明式 AiService：自然语言提问 → 自动调工具(tool-loop) → 用真实数据作答。
 *
 * <p>由 AiServices 绑定 {@code NoteTools} 生成实现；框架自动跑「模型决策→调工具→结果回喂→再决策」
 * 循环，并由 maxToolCallingRoundTrips 兜底防死循环。
 */
public interface RecallAssistant {

    @SystemMessage("""
            你是中文个人助理。当前时间：{{now}}（已含时区与星期）。
            用户会用自然语言查询他之前记录过的事项。请**先用提供的工具查库、再基于真实结果回答**：
            - 找/查 某类记录或含某关键字的记录 → searchNotes
            - 统计花了多少钱 / 开销总额 → aggregateExpense
            - 待办 / 还没做的事 → listTodos

            时间范围（今天 / 本周 / 上周 / 本月 / 今年 等）原样作为字符串参数传给工具，工具会自行解析；
            类目用中文（待办 / 日程 / 开销 / 想法 / 笔记）。
            只依据工具返回的数据回答，不要编造；查不到就如实说没有相关记录。回答简洁。
            """)
    String ask(@V("now") String now, @UserMessage String question);
}
