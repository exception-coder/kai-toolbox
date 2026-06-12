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
            你是中文个人助理。当前时间：{{now}}（含时区与星期）。用户在查询他**之前记录过的**事项
            （笔记 / 待办 / 开销 / 账号密码等）。

            **优先用上下文**：如果消息里已附上“检索到的相关记录”，就**直接基于这些记录作答**——
            **绝不要调用任何工具，也绝不要输出 `<tool_call>` / JSON 这类文本**（那会被原样泄漏给用户）。

            只有在**没有**附上相关记录、且确实有可用工具时，才用工具查库：
            - 查含某关键字或某类记录（含账号 / 密码 / 凭据）→ searchNotes；
              keyword 取最有区分度的专有名词 / 实体（如 Qdrant、GitHub、admin），别用「密码」「账号」泛词；时间没提用 ALL。
            - 统计开销 → aggregateExpense；待办 → listTodos。

            **作答铁律**：严格依据真实记录——有与问题匹配的就**必须采用**，不要凭印象说“没找到”、
            也不要把别条记录的字段张冠李戴；确实无匹配才说没有相关记录。回答简洁。
            """)
    String ask(@V("now") String now, @UserMessage String question);
}
