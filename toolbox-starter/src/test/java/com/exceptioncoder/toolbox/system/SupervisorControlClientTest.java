package com.exceptioncoder.toolbox.system;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SupervisorControlClientTest {

    @TempDir
    Path tempDir;

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void validatesProtocolRepoCapabilityAndSendsInternalTokenAsHeader() throws Exception {
        Path repo = Files.createDirectory(tempDir.resolve("repo")).toRealPath();
        ObjectMapper mapper = new ObjectMapper();
        String statusJson = mapper.createObjectNode()
                .put("protocolVersion", 1)
                .put("repoRoot", repo.toString())
                .set("capabilities", mapper.createObjectNode().put("fullReload", true))
                .toString();
        HttpClient http = mock(HttpClient.class);
        HttpResponse<String> status = mock(HttpResponse.class);
        HttpResponse<String> accepted = mock(HttpResponse.class);
        when(status.statusCode()).thenReturn(200);
        when(status.body()).thenReturn(statusJson);
        when(accepted.statusCode()).thenReturn(200);
        when(accepted.body()).thenReturn("{\"ok\":true}");
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(status, status, accepted);
        RestartRuntime runtime = mock(RestartRuntime.class);
        when(runtime.environment("KAI_SUPERVISOR_CONTROL_TOKEN")).thenReturn("secret-internal-token");
        SystemProperties system = new SystemProperties();
        system.setSupervisorPort(18081);
        RestartProperties restart = new RestartProperties();
        SupervisorControlClient client = new SupervisorControlClient(system, restart, runtime, mapper, http);

        assertTrue(client.preflight(repo).accepted());
        assertTrue(client.requestFullReload(repo).accepted());

        ArgumentCaptor<HttpRequest> requests = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http, org.mockito.Mockito.times(3)).send(requests.capture(), any(HttpResponse.BodyHandler.class));
        List<HttpRequest> values = requests.getAllValues();
        assertEquals("/status", values.get(0).uri().getPath());
        assertEquals("/status", values.get(1).uri().getPath());
        assertEquals("/full-reload", values.get(2).uri().getPath());
        assertEquals("secret-internal-token",
                values.get(2).headers().firstValue("X-Restart-Token").orElseThrow());
        assertFalse(values.get(2).uri().getQuery() != null && values.get(2).uri().getQuery().contains("token"));
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void repoMismatchRejectsWithoutPostingReload() throws Exception {
        Path repo = Files.createDirectory(tempDir.resolve("repo")).toRealPath();
        Path other = Files.createDirectory(tempDir.resolve("other")).toRealPath();
        ObjectMapper mapper = new ObjectMapper();
        String statusJson = mapper.createObjectNode()
                .put("protocolVersion", 1)
                .put("repoRoot", other.toString())
                .set("capabilities", mapper.createObjectNode().put("fullReload", true))
                .toString();
        HttpClient http = mock(HttpClient.class);
        HttpResponse<String> status = mock(HttpResponse.class);
        when(status.statusCode()).thenReturn(200);
        when(status.body()).thenReturn(statusJson);
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(status);
        RestartRuntime runtime = mock(RestartRuntime.class);
        when(runtime.environment("KAI_SUPERVISOR_CONTROL_TOKEN")).thenReturn("token");
        SupervisorControlClient client = new SupervisorControlClient(
                new SystemProperties(), new RestartProperties(), runtime, mapper, http);

        var outcome = client.requestFullReload(repo);

        assertFalse(outcome.accepted());
        assertEquals(RestartCoordinator.Failure.SUPERVISOR_INCOMPATIBLE, outcome.failure());
        ArgumentCaptor<HttpRequest> request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any(HttpResponse.BodyHandler.class));
        assertEquals("/status", request.getValue().uri().getPath());
    }

    @Test
    void missingInternalTokenRejectsWithoutNetworkCall() throws Exception {
        HttpClient http = mock(HttpClient.class);
        RestartRuntime runtime = mock(RestartRuntime.class);
        when(runtime.environment("KAI_SUPERVISOR_CONTROL_TOKEN")).thenReturn("");
        SupervisorControlClient client = new SupervisorControlClient(
                new SystemProperties(), new RestartProperties(), runtime, new ObjectMapper(), http);
        Path repo = Files.createDirectory(tempDir.resolve("repo"));

        var outcome = client.preflight(repo);

        assertFalse(outcome.accepted());
        assertEquals(RestartCoordinator.Failure.SUPERVISOR_TOKEN_UNAVAILABLE, outcome.failure());
        verify(http, never()).send(any(), any());
    }

    @Test
    void errorLoggingRedactsUrlCredentialsAndSensitiveQueryValues() {
        Exception failure = new IOException("request to https://alice:password@example.test/status"
                + "?token=top-secret&mode=probe failed; Authorization: bearer-secret");

        String safe = SupervisorControlClient.safeError(failure);

        assertFalse(safe.contains("password"));
        assertFalse(safe.contains("top-secret"));
        assertFalse(safe.contains("bearer-secret"));
        assertTrue(safe.contains("<redacted>"));
    }
}
