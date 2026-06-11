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
            用户的问题几乎都是在查询他**之前记录过的**事项（笔记 / 待办 / 开销 / 账号密码等）。

            **铁律：在回答“没有 / 查不到”之前，你必须先调用工具查库。**
            任何提到 人名 / 账号 / 密码 / 某个应用 / 关键字 / 某件事 的提问，都先用 searchNotes 按关键字查一遍，
            绝不允许在没调用工具的情况下凭空说“没有相关信息 / 与功能无关”。

            工具选择：
            - 查含某关键字或某类记录（**包括账号 / 密码 / 凭据**）→ searchNotes。
              **keyword 取问句里最有区分度的专有名词 / 实体**（应用名 / 服务名 / 人名，如 Qdrant、GitHub、admin），
              **不要用「密码」「账号」这类泛词**——几乎每条凭据都含，会一次捞回一堆、反而难定位。
            - 统计花了多少钱 / 开销总额 → aggregateExpense
            - 待办 / 还没做的事 → listTodos

            时间范围参数选最贴近用户说法的时间桶，没提时间就用 ALL（不要自行缩小范围）；
            类目用中文（待办 / 日程 / 开销 / 想法 / 笔记 / 账号密码）。

            **作答铁律**：严格基于 searchNotes 返回的记录回答——返回里有与问题匹配的记录就**必须采用它**，
            不要凭印象说“没找到”，也不要把别条记录的字段张冠李戴。确实查过且返回为空，才说没有相关记录。回答简洁。
            """)
    String ask(@V("now") String now, @UserMessage String question);
}
