package com.exceptioncoder.toolbox.browserrequest.preview;

import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.forge.service.ForgeGuardService;
import com.exceptioncoder.toolbox.common.resource.BrowserLoginResources;
import com.exceptioncoder.toolbox.common.resource.BrowserLoginTarget;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PreviewTargetsTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final AuthPrincipal user = new AuthPrincipal(12, "ordinary", List.of("USER"), List.of("menu:fore-consult"),
            "jti", System.currentTimeMillis() + 600000);
    private PreviewRequest request(String origin, String route, String resource) {
        return new PreviewRequest("request", origin, route, resource, null, null, "phone", "page", "source");
    }
    @Test void currentIdentityRemainsOrdinaryAndOnlyTrustedOriginReceivesState() throws Exception {
        PreviewTargets targets = new PreviewTargets("https://localhost:5173", List.of(), mapper, mock(ForgeGuardService.class));
        PreviewPlan plan = targets.resolve(request("https://localhost:5173", "/tools/fore-consult", null), user, "actual-token");
        var state = mapper.readTree(plan.storageState());
        assertEquals("https://localhost:5173", state.path("origins").get(0).path("origin").asText());
        assertTrue(plan.storageState().contains("actual-token"));
        assertTrue(plan.storageState().contains("ordinary"));
        assertFalse(plan.storageState().contains("ADMIN"));
        assertFalse(plan.toString().contains("actual-token"));
        assertThrows(IllegalArgumentException.class, () -> targets.resolve(request("https://evil.example", "/", null), user, "actual-token"));
        assertThrows(IllegalArgumentException.class, () -> targets.resolve(request("https://localhost:5173", "//evil.example", null), user, "actual-token"));
    }
    @Test void credentialsStayServerSideAndExternalAccountRequiresAdmin() throws Exception {
        BrowserLoginResources provider = mock(BrowserLoginResources.class);
        BrowserLoginTarget target = new BrowserLoginTarget("test-app", "测试应用", "TEST", "https://test.example",
                "test-user", "private-secret", "username", "password");
        when(provider.targets()).thenReturn(List.of(target));
        when(provider.require("test-app")).thenReturn(target);
        PreviewTargets targets = new PreviewTargets("https://localhost:5173", List.of(provider), mapper, mock(ForgeGuardService.class));
        assertTrue(targets.resources(user).isEmpty());
        assertThrows(RuntimeException.class, () -> targets.resolve(request(null, "/", "test-app"), user, null));
        AuthPrincipal admin = new AuthPrincipal(1, "admin", List.of("ADMIN"), List.of(), "jti", user.expiresAt());
        assertNotNull(targets.resolve(request(null, "/", "test-app"), admin, null).login());
        assertEquals("/app/employees?view=runtime", targets.resolve(request(null, "/app/employees?view=runtime", "test-app"), admin, null).loginPage());
        assertFalse(mapper.writeValueAsString(targets.resources(admin)).contains("private-secret"));
        assertFalse(target.toString().contains("private-secret"));
    }
    @Test void rejectsCredentialUrlsAndOriginRedirects() {
        for (String path : List.of("https://evil.example", "//evil.example", "/x?access_token=secret", "/x?password=p", "/\\evil")) {
            assertThrows(IllegalArgumentException.class, () -> PreviewTargets.path(path));
        }
        assertThrows(IllegalArgumentException.class, () -> PreviewTargets.origin("https://user:pass@host"));
        assertTrue(PlaywrightPreviewBrowser.sameOrigin("https://host", "https://host/path"));
        assertFalse(PlaywrightPreviewBrowser.sameOrigin("https://host", "https://host.evil/path"));
        assertFalse(PlaywrightPreviewBrowser.sameOrigin("https://host", "http://host/path"));
    }
}
