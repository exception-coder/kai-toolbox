package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.auth.web.*;
import com.exceptioncoder.toolbox.common.resource.*;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.core.io.ClassPathResource;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultPersonalWebServiceTest {
    final ConsultSessionRepository sessions = mock(ConsultSessionRepository.class);
    final WebResourceGateway gateway = mock(WebResourceGateway.class);
    final ResourceCredentialCipher cipher = mock(ResourceCredentialCipher.class);
    final AtomicLong now = new AtomicLong(1000);
    SingleConnectionDataSource data;
    JdbcTemplate jdbc;
    ConsultPersonalWebRepository accounts;
    ConsultPersonalWebService service;
    final ConsultSession session = session("consult", "7", "/erp");
    final ConsultPersonalWebService.Credentials credentials = new ConsultPersonalWebService.Credentials("https://test.example", "TEST", "person", "private-secret", "/login");
    static ConsultSession session(String id, String owner, String path) {
        return ConsultSession.builder().sessionId(id).userId(owner).systemSourcePath(path).archiveStatus("PENDING").build();
    }
    void authenticate() { AuthContext.set(new AuthPrincipal(7, "owner", List.of(), List.of(), "test", 0)); }
    ConsultPersonalWebService newService() { return new ConsultPersonalWebService(sessions, gateway, accounts, new ObjectMapper(), now::get); }
    @BeforeEach void setup() {
        data = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        var schema = new ResourceDatabasePopulator(new ClassPathResource("db/fore-consult-personal-web-schema.sql"));
        schema.execute(data); schema.execute(data);
        jdbc = new JdbcTemplate(data);
        when(cipher.encrypt("private-secret")).thenReturn("encrypted-fixture");
        when(cipher.decrypt("encrypted-fixture")).thenReturn("private-secret");
        accounts = new ConsultPersonalWebRepository(jdbc, cipher); service = newService();
        when(sessions.findById("consult")).thenReturn(Optional.of(session));
        when(gateway.readPersonal(anyString(), anyString(), any(), any())).thenReturn(Map.of("page", Map.of("status", "READY")));
        authenticate();
    }
    @AfterEach void cleanup() { AuthContext.clear(); data.destroy(); }
    @Test void onlyOwnerCanAuthorizeEvenIfOtherUserIsAdmin() {
        AuthContext.clear(); assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.login("consult", credentials));
        AuthContext.set(new AuthPrincipal(8, "other", List.of("ADMIN"), List.of(), "test", 0));
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.login("consult", credentials));
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.status("consult"));
        verifyNoInteractions(gateway);
    }
    @Test void persistsEncryptedBindingAcrossServiceRecreationAndConsultationsButNotUsersOrSystems() {
        session.setEvidenceRouteSnapshot(new com.exceptioncoder.toolbox.foreconsult.domain.ConsultSourceRouting(
                true, null, List.of(), null, null, null).wrap("[]"));
        assertTrue(service.login("consult", credentials).configured());
        assertEquals("encrypted-fixture", jdbc.queryForObject("SELECT password_cipher FROM fore_consult_personal_web_account", String.class));
        verify(cipher).encrypt("private-secret");
        service = newService(); now.addAndGet(16 * 60 * 1000);
        assertTrue(service.status("consult").configured());
        assertEquals("CHECK_REQUIRED", service.status("consult").loginStatus());
        var entries = service.discover(session);
        var request = new WebResourceGateway.Request(entries.getFirst().bindingId(), "/orders", "TEST", null);
        service.read(session("next", "7", "/erp"), request);
        assertThrows(IllegalArgumentException.class, () -> service.read(session("other", "8", "/erp"), request));
        assertThrows(IllegalArgumentException.class, () -> service.read(session("other", "7", "/srm"), request));
        var archived = session("old", "7", "/erp"); archived.setArchiveStatus("SUCCESS");
        assertTrue(service.discover(archived).isEmpty());
        service.logout("consult");
        assertTrue(newService().discover(session).isEmpty());
        verify(gateway).closePersonal("personal:" + entries.getFirst().bindingId());
    }
    @Test void failedCheckStopsAutomaticRetriesUntilUserExplicitlyChecks() {
        service.login("consult", credentials);
        var request = new WebResourceGateway.Request(service.discover(session).getFirst().bindingId(), "/orders", "TEST", null);
        when(gateway.readPersonal(anyString(), anyString(), any(), any())).thenReturn(Map.of("page", Map.of("status", "WAITING_LOGIN")));
        service.read(session, request);
        assertEquals("WAITING_LOGIN", service.status("consult").loginStatus());
        assertThrows(IllegalArgumentException.class, () -> service.read(session, request));
        verify(gateway, times(2)).readPersonal(anyString(), anyString(), any(), any());
        when(gateway.readPersonal(anyString(), anyString(), any(), any())).thenReturn(Map.of("page", Map.of("status", "READY")));
        assertEquals("READY", service.check("consult").loginStatus());
        service.read(session, request);
        verify(gateway).closePersonal(anyString());
    }
    @Test void failedInitialLoginIsBoundButNeverReportedReadyOrAutomaticallyRetried() {
        when(gateway.readPersonal(anyString(), anyString(), any(), any())).thenReturn(Map.of("page", Map.of("status", "WAITING_LOGIN")));
        assertEquals("WAITING_LOGIN", service.login("consult", credentials).loginStatus());
        assertTrue(service.status("consult").configured());
        var request = new WebResourceGateway.Request(service.discover(session).getFirst().bindingId(), "/", "TEST", null);
        assertThrows(IllegalArgumentException.class, () -> service.read(session, request));
        verify(gateway, times(1)).readPersonal(anyString(), anyString(), any(), any());
    }
    @Test void failedBusinessPathDoesNotInvalidateTheSavedLogin() {
        service.login("consult", credentials);
        String id = service.discover(session).getFirst().bindingId();
        when(gateway.readPersonal(anyString(), anyString(), any(), any()))
                .thenReturn(Map.of("page", Map.of("status", "FAILED")))
                .thenReturn(Map.of("page", Map.of("status", "READY")));
        service.read(session, new WebResourceGateway.Request(id, "/missing", "TEST", null));
        assertEquals("READY", service.status("consult").loginStatus());
        assertDoesNotThrow(() -> service.read(session, new WebResourceGateway.Request(id, "/orders", "TEST", null)));
        verify(gateway, never()).closePersonal(anyString());
    }
    @Test void replacementRevokesOldReferenceAndRejectsWrongEnvironment() {
        service.login("consult", credentials);
        String old = service.discover(session).getFirst().bindingId();
        service.login("consult", credentials);
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM fore_consult_personal_web_account", Integer.class));
        assertThrows(IllegalArgumentException.class, () -> service.read(session, new WebResourceGateway.Request(old, "/", "TEST", null)));
        String current = service.discover(session).getFirst().bindingId();
        assertThrows(IllegalArgumentException.class, () -> service.read(session, new WebResourceGateway.Request(current, "/", "UAT", null)));
        verify(gateway).closePersonal("personal:" + old);
    }
    @Test void secretsNeverSerializeAndGatewayRejectionDoesNotPersistCredentials() throws Exception {
        var mapper = new ObjectMapper();
        assertFalse(mapper.writeValueAsString(credentials).contains("private-secret"));
        assertFalse(credentials.toString().contains("private-secret"));
        when(gateway.readPersonal(anyString(), anyString(), any(), any())).thenThrow(new IllegalArgumentException("private-secret"));
        var failure = assertThrows(IllegalArgumentException.class, () -> service.login("consult", credentials));
        assertFalse(failure.getMessage().contains("private-secret"));
        assertFalse(service.status("consult").configured());
        verify(gateway).closePersonal(anyString());
    }
    @Test void statusDoesNotWaitForBrowserAndConcurrentMutationFailsFast() throws Exception {
        var started = new CountDownLatch(1); var release = new CountDownLatch(1);
        when(gateway.readPersonal(anyString(), anyString(), any(), any())).thenAnswer(call -> {
            started.countDown(); assertTrue(release.await(5, TimeUnit.SECONDS));
            return Map.of("page", Map.of("status", "READY"));
        });
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var pending = executor.submit(() -> { authenticate(); try { return service.login("consult", credentials); } finally { AuthContext.clear(); } });
            try {
                assertTrue(started.await(3, TimeUnit.SECONDS));
                assertTimeout(java.time.Duration.ofSeconds(1), () -> assertFalse(service.status("consult").configured()));
                assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.logout("consult"));
            } finally { release.countDown(); }
            assertTrue(pending.get(3, TimeUnit.SECONDS).configured());
        }
    }
}
