package com.exceptioncoder.forge.sessionrelay.autoconfigure;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/** Forge Session Relay 的宿主配置。 */
@ConfigurationProperties("forge.session-relay")
public class ForgeSessionRelayProperties {
    private boolean enabled;
    private String forgeBaseUrl = "http://127.0.0.1:8080";
    private String clientId = "";
    private String clientSecret = "";
    private String apiPath = "/api/forge-session-relay/v1";
    private Duration localTicketTtl = Duration.ofSeconds(30);
    private int maxBindings = 1000;
    private int maxPendingFrames = 32;
    private int maxFrameBytes = 262144;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getForgeBaseUrl() { return forgeBaseUrl; }
    public void setForgeBaseUrl(String forgeBaseUrl) { this.forgeBaseUrl = forgeBaseUrl; }
    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }
    public String getClientSecret() { return clientSecret; }
    public void setClientSecret(String clientSecret) { this.clientSecret = clientSecret; }
    public String getApiPath() { return apiPath; }
    public void setApiPath(String apiPath) { this.apiPath = apiPath; }
    public Duration getLocalTicketTtl() { return localTicketTtl; }
    public void setLocalTicketTtl(Duration localTicketTtl) { this.localTicketTtl = localTicketTtl; }
    public int getMaxBindings() { return maxBindings; }
    public void setMaxBindings(int maxBindings) { this.maxBindings = maxBindings; }
    public int getMaxPendingFrames() { return maxPendingFrames; }
    public void setMaxPendingFrames(int maxPendingFrames) { this.maxPendingFrames = maxPendingFrames; }
    public int getMaxFrameBytes() { return maxFrameBytes; }
    public void setMaxFrameBytes(int maxFrameBytes) { this.maxFrameBytes = maxFrameBytes; }
}
