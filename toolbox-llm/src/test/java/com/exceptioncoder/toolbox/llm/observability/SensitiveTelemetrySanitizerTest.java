package com.exceptioncoder.toolbox.llm.observability;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SensitiveTelemetrySanitizerTest {

    private final SensitiveTelemetrySanitizer sanitizer = new SensitiveTelemetrySanitizer(80);

    @Test
    void redactsSensitiveKeysAndEmbeddedCredentials() {
        Map<String, Object> attributes = sanitizer.sanitizeAttributes(Map.of(
                "api.key", "secret-value",
                "safe", "Bearer abc.def",
                "endpoint", "https://user:pass@example.com?q=1&token=abc"));

        assertThat(attributes.get("api.key")).isEqualTo("[REDACTED]");
        assertThat(attributes.get("safe")).isEqualTo("Bearer [REDACTED]");
        assertThat(attributes.get("endpoint").toString())
                .doesNotContain("user", "pass", "token=abc")
                .contains("[REDACTED]");
    }

    @Test
    void limitsAttributeLengthAndKeepsPrimitiveValues() {
        Map<String, Object> attributes = sanitizer.sanitizeAttributes(Map.of(
                "count", 3,
                "enabled", true,
                "long", "x".repeat(200)));

        assertThat(attributes.get("count")).isEqualTo(3);
        assertThat(attributes.get("enabled")).isEqualTo(true);
        assertThat(attributes.get("long").toString()).hasSize(80);
    }
}
