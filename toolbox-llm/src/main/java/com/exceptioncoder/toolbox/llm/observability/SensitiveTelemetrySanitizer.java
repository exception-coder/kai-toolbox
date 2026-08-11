package com.exceptioncoder.toolbox.llm.observability;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** 集中处理 Trace 属性限长与常见凭据脱敏。 */
public class SensitiveTelemetrySanitizer {

    private static final Set<String> SENSITIVE_KEYS = Set.of(
            "authorization", "auth_token", "authtoken", "token", "password", "secret",
            "api_key", "apikey", "connection_string", "connectionstring", "cookie");
    private static final Pattern BEARER = Pattern.compile("(?i)bearer\\s+[a-z0-9._~+\\-/]+=*");
    private static final Pattern URL_CREDENTIAL = Pattern.compile("(?i)(https?://)[^/@\\s:]+:[^/@\\s]+@");
    private static final Pattern SECRET_ASSIGNMENT = Pattern.compile(
            "(?i)(token|api[_-]?key|password|secret)=([^&\\s]+)");

    private final int maxLength;

    public SensitiveTelemetrySanitizer(int maxLength) {
        this.maxLength = Math.max(64, maxLength);
    }

    public Map<String, Object> sanitizeAttributes(Map<String, ?> attributes) {
        if (attributes == null || attributes.isEmpty()) {
            return Map.of();
        }
        Map<String, Object> sanitized = new LinkedHashMap<>();
        attributes.forEach((key, value) -> {
            String safeKey = sanitizeKey(key);
            if (safeKey == null || value == null) {
                return;
            }
            if (isSensitiveKey(safeKey)) {
                sanitized.put(safeKey, "[REDACTED]");
            } else if (value instanceof Boolean || value instanceof Number) {
                sanitized.put(safeKey, value);
            } else {
                sanitized.put(safeKey, sanitizeText(String.valueOf(value)));
            }
        });
        return Map.copyOf(sanitized);
    }

    public String sanitizeText(String value) {
        if (value == null) {
            return null;
        }
        String redacted = BEARER.matcher(value).replaceAll("Bearer [REDACTED]");
        redacted = URL_CREDENTIAL.matcher(redacted).replaceAll("$1[REDACTED]@");
        redacted = SECRET_ASSIGNMENT.matcher(redacted).replaceAll("$1=[REDACTED]");
        return truncate(redacted);
    }

    private String sanitizeKey(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        return truncate(key.trim());
    }

    private boolean isSensitiveKey(String key) {
        String compact = key.toLowerCase(Locale.ROOT).replace('-', '_').replace('.', '_');
        return SENSITIVE_KEYS.stream().anyMatch(compact::contains);
    }

    private String truncate(String value) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }
}
