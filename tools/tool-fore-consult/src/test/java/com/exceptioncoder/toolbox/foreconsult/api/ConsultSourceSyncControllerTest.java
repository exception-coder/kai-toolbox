package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.web.*;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSourceRouting;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultSourceRoutingService;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultSourceSyncService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultSourceSyncControllerTest {
    private final ConsultSourceRoutingService routing = mock(ConsultSourceRoutingService.class);
    private final ConsultSourceSyncService sync = mock(ConsultSourceSyncService.class);
    private final ConsultSourceSyncController controller = new ConsultSourceSyncController(routing, sync);

    @AfterEach void cleanup() { AuthContext.clear(); }

    @Test void bothDiscoveryAndMutationRequireAdministrator() throws Exception {
        var interceptor = new RequireAuthInterceptor();
        for (var method : List.of(ConsultSourceSyncController.class.getMethod("candidates"),
                ConsultSourceSyncController.class.getMethod("synchronize", String.class))) {
            var handler = new HandlerMethod(controller, method);
            var request = new MockHttpServletRequest();
            var response = new MockHttpServletResponse();
            AuthContext.clear();
            assertThrows(AuthException.class, () -> interceptor.preHandle(request, response, handler));
            AuthContext.set(new AuthPrincipal(7, "user", List.of("USER"), List.of(), "test", 0));
            assertThrows(AuthException.class, () -> interceptor.preHandle(request, response, handler));
            AuthContext.set(new AuthPrincipal(7, "admin", List.of("ADMIN"), List.of(), "test", 0));
            assertTrue(interceptor.preHandle(request, response, handler));
        }
        verifyNoInteractions(routing, sync);
    }

    @Test void usesAuthoritativeCandidatesAndForwardsOnlyProjectIdentity() {
        var projects = List.of(new ConsultSourceRouting.Project("erp", "erp", "ERP", "/repo"));
        when(routing.candidates()).thenReturn(projects);
        assertEquals(projects, controller.candidates());
        verifyNoInteractions(sync);
        var result = new ConsultSourceSyncService.Result("UP_TO_DATE", "current", "main", "a".repeat(40), 1);
        when(sync.synchronizeCandidate("erp")).thenReturn(result);
        assertEquals(result, controller.synchronize("erp"));
        verify(sync).synchronizeCandidate("erp");
    }
}
