package com.exceptioncoder.toolbox.claudechat.service.usage;

import com.exceptioncoder.toolbox.claudechat.api.UsageController;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SidecarClient;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SubscriptionQuotaServiceTest {
    private final ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
    private final SidecarClient sidecar = mock(SidecarClient.class);
    private final ClaudeQuotaClient claude = mock(ClaudeQuotaClient.class);
    private final SubscriptionQuotaService service = new SubscriptionQuotaService(sessions, sidecar, claude);

    @Test void queriesPersistedAccountWithoutGlobalCache() {
        var a = ClaudeChatSession.builder().id("a").engine("codex").codexHome("home-a").selectedModel("model-a").build();
        var b = ClaudeChatSession.builder().id("b").engine("codex").codexHome("home-b").selectedModel("model-b").build();
        when(sessions.findById("a")).thenReturn(Optional.of(a));
        when(sessions.findById("b")).thenReturn(Optional.of(b));
        var quota = JsonNodeFactory.instance.objectNode().put("available", true);
        when(sidecar.querySubscriptionQuota(any(), any(), anyLong())).thenReturn(Optional.of(quota));
        service.read("a"); service.read("b"); service.read("a");
        verify(sidecar, times(2)).querySubscriptionQuota("home-a", "model-a", 45_000);
        verify(sidecar).querySubscriptionQuota("home-b", "model-b", 45_000);
    }

    @Test void unsupportedAndThirdPartyNeverQuerySubscription() {
        for (var session : new ClaudeChatSession[] {
                ClaudeChatSession.builder().engine("qwen").build(),
                ClaudeChatSession.builder().engine("codex").apiBaseUrl("https://gateway.test").build(),
                ClaudeChatSession.builder().engine("codex").authToken("test-only").build() }) {
            when(sessions.findById("a")).thenReturn(Optional.of(session));
            assertFalse(service.read("a").path("available").asBoolean());
            assertTrue(service.read("a").path("fetchedAt").isNull());
        }
        verifyNoInteractions(sidecar);
        verifyNoInteractions(claude);
    }

    @Test void claudeMapsActualSnapshotWithoutRestampingCache() {
        when(sessions.findById("a")).thenReturn(Optional.of(ClaudeChatSession.builder().engine("claude").build()));
        when(claude.get()).thenReturn(new EngineUsageScanner.QuotaSnapshot(
                25.0, 300, 2_000_000_000L, 70.0, 10080, null, "Pro", 1234));
        var quota = service.read("a");
        assertEquals(75, quota.path("windows").get(0).path("remainingPercent").asDouble());
        assertEquals(30, quota.path("windows").get(1).path("remainingPercent").asDouble());
        assertEquals(1234, quota.path("fetchedAt").asLong());
        assertTrue(quota.path("shared").asBoolean());
        verifyNoInteractions(sidecar);
    }

    @Test void routeChangeDuringRequestInvalidatesSnapshot() {
        var before = ClaudeChatSession.builder().engine("codex").codexHome("a").build();
        var after = ClaudeChatSession.builder().engine("codex").codexHome("b").build();
        when(sessions.findById("a")).thenReturn(Optional.of(before), Optional.of(after));
        when(sidecar.querySubscriptionQuota(any(), any(), anyLong())).thenReturn(Optional.of(JsonNodeFactory.instance.objectNode().put("available", true)));
        assertFalse(service.read("a").path("available").asBoolean());
    }

    @Test void inaccessibleSessionCannotReadQuota() {
        var access = mock(ClaudeChatSessionAccessPolicy.class);
        var quotaService = mock(SubscriptionQuotaService.class);
        var controller = new UsageController(mock(UsageService.class), quotaService, access);
        assertEquals(403, controller.subscription("other-user-session").getStatusCode().value());
        verifyNoInteractions(quotaService);
    }
}
