package com.exceptioncoder.toolbox.llm.observability;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Agent 可观测配置。默认关闭，外部观测故障不得影响模型和工具主链路。
 */
@ConfigurationProperties(prefix = "toolbox.observability")
public class AgentTelemetryProperties {

    private boolean enabled;
    private String endpoint;
    private String headers;
    private String serviceName = "kai-toolbox";
    private String environment = "local";
    private long exportTimeoutMs = 3000;
    private int maxAttributeLength = 512;
    private double sampleRatio = 1.0;
    private boolean captureContent;
    private final Langfuse langfuse = new Langfuse();

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(String endpoint) {
        this.endpoint = endpoint;
    }

    public String getHeaders() {
        return headers;
    }

    public void setHeaders(String headers) {
        this.headers = headers;
    }

    public String getServiceName() {
        return serviceName;
    }

    public void setServiceName(String serviceName) {
        this.serviceName = serviceName;
    }

    public String getEnvironment() {
        return environment;
    }

    public void setEnvironment(String environment) {
        this.environment = environment;
    }

    public long getExportTimeoutMs() {
        return exportTimeoutMs;
    }

    public void setExportTimeoutMs(long exportTimeoutMs) {
        this.exportTimeoutMs = exportTimeoutMs;
    }

    public int getMaxAttributeLength() {
        return maxAttributeLength;
    }

    public void setMaxAttributeLength(int maxAttributeLength) {
        this.maxAttributeLength = maxAttributeLength;
    }

    public double getSampleRatio() {
        return sampleRatio;
    }

    public void setSampleRatio(double sampleRatio) {
        this.sampleRatio = sampleRatio;
    }

    public boolean isCaptureContent() {
        return captureContent;
    }

    public void setCaptureContent(boolean captureContent) {
        this.captureContent = captureContent;
    }

    public Langfuse getLangfuse() {
        return langfuse;
    }

    public static class Langfuse {
        private String baseUrl;
        private String publicKey;
        private String secretKey;

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public String getPublicKey() {
            return publicKey;
        }

        public void setPublicKey(String publicKey) {
            this.publicKey = publicKey;
        }

        public String getSecretKey() {
            return secretKey;
        }

        public void setSecretKey(String secretKey) {
            this.secretKey = secretKey;
        }
    }
}
