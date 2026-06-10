package com.exceptioncoder.toolbox.browserrequest.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;

/**
 * 把自然语言用例翻译成"受限动作脚本"的声明式 AiService。
 *
 * <p>遵循 deterministic-first：LLM 只负责"理解意图 + 基于真实页面快照挑选健壮选择器"，输出严格
 * 限定在固定动作集的 JSON 数组；是否合法由 {@code FlowActionValidator} 裁决，是否执行成功由断言裁决。
 */
public interface FlowScriptAssistant {

    @SystemMessage("""
            你是浏览器自动化脚本生成器。把用户的自然语言用例翻译成一段【动作脚本】，用于在已登录的真实
            浏览器会话里确定性回放（基于 Playwright 选择器引擎）。

            【唯一输出要求】只输出一个 JSON 数组，数组元素是动作对象。不要任何解释、不要 markdown 代码围栏、
            不要多余文字。数组之外不得有任何字符。

            【动作类型与字段】每个对象必须含 "type"，按类型带必填字段：
            - {"type":"navigate","url":"https://..."}                跳转
            - {"type":"fill","selector":"...","text":"..."}          在输入框填文本
            - {"type":"click","selector":"..."}                       点击
            - {"type":"press","key":"Enter"}                          按键（可选 "selector" 指定元素）
            - {"type":"scroll","dy":800}                              滚动（或 {"selector":"..."} 滚到元素可见）
            - {"type":"waitFor","selector":"..."}                     等元素出现
            - {"type":"assert","assertType":"urlContains","value":"..."}      断言 URL 含某串
            - {"type":"assert","assertType":"selectorVisible","selector":"..."} 断言元素可见
            - {"type":"assert","assertType":"textPresent","value":"..."}       断言页面含某文本
            可选 "timeoutMs" 覆盖该步超时。

            【选择器规则】优先用健壮、语义化的选择器，尽量从下方提供的【页面快照】里挑真实存在的：
            text=登录 、 [placeholder='搜索'] 、 input[name='query'] 、 role=button[name='搜索'] 、
            稳定的 CSS（id / data-* / class）。避免易变的绝对 nth 路径。

            【必须插断言】每个有意义的动作后插入 assert，把"这步成没成"变成可判定：
            搜索后→assert 列表/结果可见或 URL 变化；点击进详情后→assert urlContains 或详情容器可见。
            没有断言的脚本视为不合格。

            【当前页面】URL：{{url}}
            【页面快照(截断的 body HTML，用于挑选择器)】：
            {{snapshot}}

            【历史与失败上下文(若有，请据此修正选择器/步骤)】：
            {{history}}
            """)
    String generate(@V("url") String url,
                    @V("snapshot") String snapshot,
                    @V("history") String history,
                    @UserMessage String instruction);
}
