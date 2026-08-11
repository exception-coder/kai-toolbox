package com.exceptioncoder.toolbox.llm.observability;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** W3C Trace Context 的进程间传输契约。 */
public record TraceContext(String traceparent, String tracestate) {

    private static final Pattern TRACEPARENT = Pattern.compile(
            "^00-([0-9a-fA-F]{32})-([0-9a-fA-F]{16})-([0-9a-fA-F]{2})$");

    public TraceContext {
        traceparent = normalize(traceparent);
        tracestate = blankToNull(tracestate);
    }

    public boolean valid() {
        if (traceparent == null) {
            return false;
        }
        Matcher matcher = TRACEPARENT.matcher(traceparent);
        return matcher.matches()
                && !matcher.group(1).equals("00000000000000000000000000000000")
                && !matcher.group(2).equals("0000000000000000");
    }

    public String traceId() {
        if (!valid()) {
            return null;
        }
        return TRACEPARENT.matcher(traceparent).replaceFirst("$1");
    }

    public static TraceContext empty() {
        return new TraceContext(null, null);
    }

    private static String normalize(String value) {
        String normalized = blankToNull(value);
        return normalized == null ? null : normalized.toLowerCase(Locale.ROOT);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
