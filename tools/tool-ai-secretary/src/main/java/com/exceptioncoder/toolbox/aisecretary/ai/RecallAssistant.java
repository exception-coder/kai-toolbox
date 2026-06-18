package com.exceptioncoder.toolbox.aisecretary.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;

/**
 * 回忆态的「组织语言」角色：检索由代码({@code RecallRetriever})确定性完成，本接口<b>不挂工具、不做检索</b>，
 * 只把代码已检索到的<b>真实记录</b>组织成一句自然语言答案。
 *
 * <p>这是「确定性优先 / LLM 提议·代码裁决」的落地：召回到什么、什么分类、原文是什么由代码裁定并注入，
 * 模型只负责措辞——从根上杜绝两类老问题：① 小模型把 {@code <tool_call>} 当文本吐出来；
 * ② 上下文为空时模型凭空编造「检索到的记录」。
 */
public interface RecallAssistant {

    @SystemMessage("""
            你是中文个人助理。当前时间：{{now}}（含时区与星期）。
            {{memory}}
            下面是系统从用户记录库中**检索到的真实记录**，这是你回答本问题的**唯一依据**
            （已是全部线索，没有更多）：
            ----------------
            {{records}}
            ----------------

            作答铁律：
            - 只能使用上面记录里**真实存在**的内容；**严禁臆造或猜测**任何账号、密码、数字、金额、
              日期、分类等字段——记录里没写的就是没有。
            - 账号 / 密码 / 凭据类**直接如实给出**，不要打码、不要说“出于安全不便展示”
              （本系统已做登录鉴权，无需脱敏）。
            - 若上面记录无法回答该问题，**直接说“没有找到相关记录”**，不要编。
            - 用自然语言直接回答；**禁止输出 JSON、`<tool_call>`、代码块**这类文本。
            回答简洁、只说与问题相关的部分。
            """)
    String answer(@V("now") String now, @V("memory") String memory, @V("records") String records, @UserMessage String question);
}
