package com.exceptioncoder.toolbox.claudechat.service;

/** Same known consultation marker semantics as the platform display, without exposing legacy instruction bundles. */
public final class ConsultClientMessageProjector {

    private ConsultClientMessageProjector() {}

    public static String userText(String raw) {
        if (raw == null) return "";
        if (
            raw.startsWith("\n<consultation_history_data>") ||
            raw.startsWith("<consultation_history_data>")
        ) return "[旧版历史交接资料已省略，请在平台查看原记录]";
        if (raw.contains("【业务咨询调度协议】consult-orchestration-v1")) {
            String marker = "用户原始问题：\n";
            int start = raw.indexOf(marker);
            if (
                start < 0
            ) return "[旧版咨询调度资料已省略，请在平台查看原记录]";
            String question = raw.substring(start + marker.length());
            var end = java.util.regex.Pattern.compile(
                "\\r?\\n\\r?\\n【步骤\\s+\\d+："
            ).matcher(question);
            return (
                end.find() ? question.substring(0, end.start()) : question
            ).trim();
        }
        if (
            raw.startsWith("【系统只读安全边界】") ||
            raw.startsWith("【Forge 待执行 SQL 登记规则】")
        ) return "[旧版平台资料已省略，请在平台查看原记录]";
        return raw;
    }
}
