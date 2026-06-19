package com.exceptioncoder.toolbox.aichat.service.tools;

import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * ai-chat 的内置工具集(阶段一:零外部依赖工具)。
 *
 * <p>用 LangChain4j 的 {@link Tool} 注解声明,{@code ChatToolService} 反射生成
 * ToolSpecification 并在工具循环里执行。方法返回值即喂回模型的 tool_result,
 * 故返回对模型友好的纯文本。</p>
 *
 * <p>设计取向「确定性优先」:能用代码精确算/取的(时间、算术)绝不交给 LLM 臆测,
 * LLM 只负责"判断何时该调用"。工具内部对入参做校验,非法输入回友好错误串而非抛异常,
 * 让模型能据此自我纠正、重试。</p>
 */
@Component
public class ChatTools implements ChatToolProvider {

    private static final Logger log = LoggerFactory.getLogger(ChatTools.class);
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss EEEE");

    @Tool("获取服务器当前的日期与时间(含星期)。当用户问'现在几点''今天几号''今天星期几'等与当前时刻相关的问题时调用。")
    public String currentTime() {
        String now = LocalDateTime.now(ZoneId.systemDefault()).format(FMT);
        log.info("[ai-chat][tool] currentTime -> {}", now);
        return "当前时间:" + now;
    }

    @Tool("计算一个数学算术表达式并返回精确结果。支持 + - * / %、括号、小数、负号。"
            + "当用户需要做算术运算时调用,不要自己心算。")
    public String calculate(@P("要计算的算术表达式,例如 (12+3)*4/2") String expression) {
        try {
            double result = Expr.eval(expression);
            // 整数结果去掉多余的 .0,更符合直觉
            String pretty = (result == Math.rint(result) && !Double.isInfinite(result))
                    ? String.valueOf((long) result)
                    : String.valueOf(result);
            log.info("[ai-chat][tool] calculate({}) -> {}", expression, pretty);
            return expression + " = " + pretty;
        } catch (RuntimeException e) {
            log.info("[ai-chat][tool] calculate({}) 失败: {}", expression, e.getMessage());
            return "计算失败:" + e.getMessage() + "。请检查表达式是否合法。";
        }
    }
}
