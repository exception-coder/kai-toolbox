package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.auth.web.RequireAuthInterceptor;
import com.exceptioncoder.toolbox.foreconsult.api.dto.SaveSystemPrefsRequest;
import com.exceptioncoder.toolbox.foreconsult.service.SystemPrefService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SystemPrefControllerTest {
    private final SystemPrefService service = mock(SystemPrefService.class);
    private final SystemPrefController controller = new SystemPrefController(service);
    private final RequireAuthInterceptor interceptor = new RequireAuthInterceptor();

    @AfterEach void cleanup() { AuthContext.clear(); }

    @Test void onlyAdministratorsCanSaveSharedCandidateOrder() throws Exception {
        var handler = new HandlerMethod(controller, SystemPrefController.class.getMethod("save", SaveSystemPrefsRequest.class));
        var request = new MockHttpServletRequest("PUT", "/api/fore-consult/system-prefs");
        var response = new MockHttpServletResponse();
        assertThrows(AuthException.class, () -> interceptor.preHandle(request, response, handler));
        AuthContext.set(new AuthPrincipal(7, "tester", List.of("USER"), List.of(), "test", 0));
        assertThrows(AuthException.class, () -> interceptor.preHandle(request, response, handler));
        verifyNoInteractions(service);
        AuthContext.set(new AuthPrincipal(7, "admin", List.of("ADMIN"), List.of(), "test", 0));
        assertTrue(interceptor.preHandle(request, response, handler));
        var prefs = new SaveSystemPrefsRequest(List.of(new SaveSystemPrefsRequest.Item("api", "/api", null, true, 0)));
        when(service.save(prefs)).thenReturn(List.of());
        controller.save(prefs);
        verify(service).save(prefs);
    }

    @Test void ordinaryUsersCanReadTheConfiguredOrder() throws Exception {
        AuthContext.set(new AuthPrincipal(7, "tester", List.of("USER"), List.of(), "test", 0));
        var handler = new HandlerMethod(controller, SystemPrefController.class.getMethod("list"));
        assertTrue(interceptor.preHandle(new MockHttpServletRequest("GET", "/api/fore-consult/system-prefs"),
                new MockHttpServletResponse(), handler));
    }
}
