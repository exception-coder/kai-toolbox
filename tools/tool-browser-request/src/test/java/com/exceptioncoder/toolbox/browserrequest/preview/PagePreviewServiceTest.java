package com.exceptioncoder.toolbox.browserrequest.preview;

import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.function.Consumer;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PagePreviewServiceTest {
    private final AuthPrincipal owner = new AuthPrincipal(1, "one", List.of("USER"), List.of(), "jti", System.currentTimeMillis() + 600000);
    private final AuthPrincipal other = new AuthPrincipal(2, "two", List.of("ADMIN"), List.of(), "jti", owner.expiresAt());
    private final PreviewRequest request = new PreviewRequest("stable-request", "https://localhost:5173", "/tools/fore-consult", null,
            null, null, "phone", "page", "revision");

    @Test void repeatedRequestReusesOnePreviewAndDoesNotExposeAuthentication() throws Exception {
        PreviewTargets targets = mock(PreviewTargets.class);
        PreviewBrowser browser = mock(PreviewBrowser.class);
        when(targets.resolve(eq(request), eq(owner), anyString())).thenReturn(new PreviewPlan("https://localhost:5173", "/", null, null, "page", true, "private-state", null));
        PagePreviewService service = new PagePreviewService(targets, browser);
        try {
            var first = service.create(request, owner, "token");
            var repeated = service.create(request, owner, "token");
            assertEquals(first.id(), repeated.id());
            verify(browser, timeout(2000).times(1)).open(eq(first.id()), any(), any(), any());
            assertFalse(first.toString().contains("private-state"));
            assertFalse(first.toString().contains("token"));
            assertThrows(RuntimeException.class, () -> service.get(first.id(), other));
            assertThrows(RuntimeException.class, () -> service.screenshot(first.id(), other));
            assertThrows(RuntimeException.class, () -> service.close(first.id(), other));
        } finally { service.shutdown(); }
    }

    @Test void readinessAndCloseAreSeparateFromVersionVerification() {
        PreviewTargets targets = mock(PreviewTargets.class);
        PreviewBrowser browser = mock(PreviewBrowser.class);
        when(targets.resolve(any(), any(), any())).thenReturn(new PreviewPlan("https://localhost:5173", "/", null, null, "page", true, null, null));
        doAnswer(call -> { Consumer<String> stage = call.getArgument(2); stage.accept("READY"); return null; })
                .when(browser).open(any(), any(), any(), any());
        PagePreviewService service = new PagePreviewService(targets, browser);
        try {
            var view = service.create(request, owner, "token");
            verify(browser, timeout(2000)).open(eq(view.id()), any(), any(), any());
            org.awaitility.Awaitility.await().until(() -> "READY".equals(service.get(view.id(), owner).status()));
            assertEquals("运行版本尚未核验", service.get(view.id(), owner).runtimeVersion());
            service.close(view.id(), owner);
            assertEquals("CLOSED", service.get(view.id(), owner).status());
            assertThrows(IllegalArgumentException.class, () -> service.screenshot(view.id(), owner));
            PreviewRequest changed = new PreviewRequest(request.requestKey(), request.origin(), "/different", null, null, null, "phone", "page", null);
            assertThrows(IllegalArgumentException.class, () -> service.create(changed, owner, "token"));
        } finally { service.shutdown(); }
    }
    @Test void manualLoginContinuesInTheSameContextWithoutRetainingCredentials() {
        PreviewTargets targets = mock(PreviewTargets.class);
        PreviewBrowser browser = mock(PreviewBrowser.class);
        when(targets.resolve(any(), any(), any())).thenReturn(new PreviewPlan("https://localhost:5173", "/", null, null, "page", true, "private-state", null));
        doAnswer(call -> { Consumer<String> stage = call.getArgument(2); stage.accept("WAITING_LOGIN"); return null; })
                .when(browser).open(any(), any(), any(), any());
        doAnswer(call -> {
            PreviewPlan plan = call.getArgument(1);
            assertNull(plan.storageState()); assertNull(plan.login());
            Consumer<String> stage = call.getArgument(2); stage.accept("READY"); return null;
        }).when(browser).resume(any(), any(), any(), any());
        PagePreviewService service = new PagePreviewService(targets, browser);
        try {
            var view = service.create(request, owner, "token");
            org.awaitility.Awaitility.await().until(() -> "WAITING_LOGIN".equals(service.get(view.id(), owner).status()));
            assertThrows(RuntimeException.class, () -> service.resume(view.id(), other));
            assertEquals(view.id(), service.resume(view.id(), owner).id());
            org.awaitility.Awaitility.await().until(() -> "READY".equals(service.get(view.id(), owner).status()));
            verify(browser, times(1)).open(eq(view.id()), any(), any(), any());
            verify(browser, times(1)).resume(eq(view.id()), any(), any(), any());
        } finally { service.shutdown(); }
    }

    @Test void foregroundReadsSlideTheLeaseAndOldDeadlineDoesNotCloseTheBrowser() {
        PreviewTargets targets = mock(PreviewTargets.class);
        PreviewBrowser browser = mock(PreviewBrowser.class);
        long start = System.currentTimeMillis();
        var now = new java.util.concurrent.atomic.AtomicLong(start);
        var clock = mock(java.time.Clock.class); when(clock.millis()).thenAnswer(call -> now.get());
        var principal = new AuthPrincipal(1, "one", List.of("USER"), List.of(), "jti", start + 7200000);
        when(targets.resolve(any(), any(), any())).thenReturn(new PreviewPlan("https://localhost:5173", "/", null, null, "page", true, null, null));
        doAnswer(call -> { Consumer<String> stage = call.getArgument(2); stage.accept("READY"); return null; })
                .when(browser).open(any(), any(), any(), any());
        PagePreviewService service = new PagePreviewService(targets, browser, clock);
        try {
            var first = service.create(request, principal, "token");
            org.awaitility.Awaitility.await().until(() -> "READY".equals(service.get(first.id(), principal).status()));
            now.set(start + 14 * 60000);
            service.screenshot(first.id(), principal);
            now.set(start + 16 * 60000);
            service.checkExpiry(first.id());
            assertEquals("READY", service.get(first.id(), principal).status());
            assertTrue(service.get(first.id(), principal).expiresAt() > first.expiresAt());
            verify(browser, never()).close(any());
            now.set(start + 32 * 60000);
            service.checkExpiry(first.id());
            assertEquals("EXPIRED", service.get(first.id(), principal).status());
            verify(browser, timeout(2000).times(1)).close(first.id());
            assertEquals("EXPIRED", service.get(first.id(), principal).status());
        } finally { service.shutdown(); }
    }

    @Test void refreshedOwnerTokenCanRenewButOtherUsersAndExpiredTokensCannot() {
        PreviewTargets targets = mock(PreviewTargets.class);
        PreviewBrowser browser = mock(PreviewBrowser.class);
        long start = System.currentTimeMillis();
        var now = new java.util.concurrent.atomic.AtomicLong(start);
        var clock = mock(java.time.Clock.class); when(clock.millis()).thenAnswer(call -> now.get());
        var initial = new AuthPrincipal(1, "one", List.of("USER"), List.of(), "old", start + 300000);
        var fresh = new AuthPrincipal(1, "one", List.of("USER"), List.of(), "new", start + 7200000);
        when(targets.resolve(any(), any(), any())).thenReturn(new PreviewPlan("https://localhost:5173", "/", null, null, "page", true, null, null));
        PagePreviewService service = new PagePreviewService(targets, browser, clock);
        try {
            var first = service.create(request, initial, "token");
            now.set(start + 240000);
            long renewed = service.get(first.id(), fresh).expiresAt();
            assertTrue(renewed > initial.expiresAt());
            assertEquals(renewed, service.get(first.id(), initial).expiresAt());
            assertThrows(RuntimeException.class, () -> service.get(first.id(), other));
            now.set(start + 360000);
            assertThrows(RuntimeException.class, () -> service.get(first.id(), initial));
            assertNotEquals("EXPIRED", service.get(first.id(), fresh).status());
            service.close(first.id(), fresh);
            now.set(start + 400000);
            service.checkExpiry(first.id());
            assertEquals("CLOSED", service.get(first.id(), fresh).status());
            verify(browser, timeout(2000).times(1)).close(first.id());
        } finally { service.shutdown(); }
    }

}
