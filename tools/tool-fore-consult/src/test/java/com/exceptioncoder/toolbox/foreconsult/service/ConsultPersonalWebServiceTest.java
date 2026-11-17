package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.auth.web.*;
import com.exceptioncoder.toolbox.common.resource.*;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import org.junit.jupiter.api.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultPersonalWebServiceTest {
    final ConsultSessionRepository sessions = mock(ConsultSessionRepository.class);
    final ConsultSourceRoutingService routing = mock(ConsultSourceRoutingService.class);
    final WebResourceGateway gateway = mock(WebResourceGateway.class);
    final AtomicLong now = new AtomicLong(1000);
    final ConsultPersonalWebService service = new ConsultPersonalWebService(sessions, routing, gateway, now::get);
    final ConsultSession session = ConsultSession.builder().sessionId("consult").userId("7").systemSourcePath("/erp").archiveStatus("PENDING").build();
    final ConsultPersonalWebService.Credentials credentials = new ConsultPersonalWebService.Credentials("https://test.example", "TEST", "person", "private-secret", "/login");

    @BeforeEach void setup() {
        when(sessions.findById("consult")).thenReturn(Optional.of(session));
        AuthContext.set(new AuthPrincipal(7, "owner", List.of(), List.of(), "test", 0));
    }
    @AfterEach void cleanup() { AuthContext.clear(); service.shutdown(); }

    @Test void onlyOwnerCanAuthorizeEvenIfOtherUserIsAdmin() {
        AuthContext.clear(); assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.login("consult", credentials));
        AuthContext.set(new AuthPrincipal(8, "other", List.of("ADMIN"), List.of(), "test", 0));
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.login("consult", credentials));
        verifyNoInteractions(gateway);
    }

    @Test void referencesCannotCrossConsultationsAndLogoutClosesBrowser() {
        assertTrue(service.login("consult", credentials).configured());
        var entries = service.discover(session);
        assertEquals(1, entries.size());
        var request = new WebResourceGateway.Request(entries.getFirst().bindingId(), "/orders", "TEST", null);
        var other = ConsultSession.builder().sessionId("other").userId("7").systemSourcePath("/erp").archiveStatus("PENDING").build();
        assertThrows(IllegalArgumentException.class, () -> service.read(other, request));
        service.read(session, request);
        service.logout("consult");
        assertTrue(service.discover(session).isEmpty());
        assertThrows(IllegalArgumentException.class, () -> service.read(session, request));
        verify(gateway).closePersonal("personal:" + entries.getFirst().bindingId());
    }

    @Test void expiryAndSystemSwitchRevokeInsteadOfReusingPersonalAccount() {
        service.login("consult", credentials);
        now.addAndGet(15 * 60 * 1000);
        assertFalse(service.status("consult").configured());
        service.login("consult", credentials);
        session.setSystemSourcePath("/srm");
        assertTrue(service.discover(session).isEmpty());
        verify(gateway, times(2)).closePersonal(anyString());
    }

    @Test void secretsNeverSerializeAndFailedAuthorizationIsNotRetained() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        assertFalse(mapper.writeValueAsString(credentials).contains("private-secret"));
        assertFalse(credentials.toString().contains("private-secret"));
        assertEquals("secret", mapper.readValue("{\"password\":\"secret\"}", ConsultPersonalWebService.Credentials.class).password());
        when(gateway.readPersonal(anyString(), anyString(), any(), any())).thenThrow(new IllegalArgumentException("private-secret"));
        var failure = assertThrows(IllegalArgumentException.class, () -> service.login("consult", credentials));
        assertFalse(failure.getMessage().contains("private-secret"));
        assertFalse(service.status("consult").configured());
        verify(gateway).closePersonal(anyString());
    }
}
