package com.exceptioncoder.toolbox.llm.observability;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OtlpConfigurationTest {

    @Test
    void normalizesGenericAndLangfuseEndpoints() {
        assertThat(OtlpConfiguration.normalizeTraceEndpoint("http://localhost:4318"))
                .isEqualTo("http://localhost:4318/v1/traces");
        assertThat(OtlpConfiguration.normalizeTraceEndpoint("https://example.com/api/public/otel/"))
                .isEqualTo("https://example.com/api/public/otel/v1/traces");
        assertThat(OtlpConfiguration.normalizeTraceEndpoint("https://example.com/v1/traces"))
                .isEqualTo("https://example.com/v1/traces");
        assertThat(OtlpConfiguration.normalizeLogEndpoint("http://localhost:4318"))
                .isEqualTo("http://localhost:4318/v1/logs");
        assertThat(OtlpConfiguration.normalizeLogEndpoint("https://example.com/v1/traces"))
                .isEqualTo("https://example.com/v1/logs");
    }

    @Test
    void parsesUrlEncodedOtelHeaders() {
        assertThat(OtlpConfiguration.parseHeaders(
                "Authorization=Basic%20YWJjZA%3D%3D,x-langfuse-ingestion-version=4"))
                .containsEntry("Authorization", "Basic YWJjZA==")
                .containsEntry("x-langfuse-ingestion-version", "4");
    }

    @Test
    void derivesLangfuseOtlpEndpointAndHeaders() {
        AgentTelemetryProperties properties = new AgentTelemetryProperties();
        properties.getLangfuse().setBaseUrl("https://langfuse.example.com/");
        properties.getLangfuse().setPublicKey("pk-test");
        properties.getLangfuse().setSecretKey("sk-test");

        String endpoint = OtlpConfiguration.resolveEndpoint(properties);

        assertThat(endpoint).isEqualTo("https://langfuse.example.com/api/public/otel");
        assertThat(OtlpConfiguration.resolveHeaders(properties, endpoint))
                .containsEntry("x-langfuse-ingestion-version", "4")
                .containsKey("Authorization");
    }
}
