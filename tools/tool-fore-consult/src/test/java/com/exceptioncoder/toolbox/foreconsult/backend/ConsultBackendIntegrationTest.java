package com.exceptioncoder.toolbox.foreconsult.backend;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.auth.web.RequireAuthInterceptor;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.common.project.ProjectCatalog;
import com.exceptioncoder.toolbox.foreconsult.api.dto.BusinessConsultModelPolicyView;
import com.exceptioncoder.toolbox.foreconsult.service.BusinessConsultModelPolicyService;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class ConsultBackendIntegrationTest {
    @TempDir Path directory;
    private final ObjectMapper mapper = new ObjectMapper();
    private final AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
    private final BusinessConsultModelPolicyService policy = mock(BusinessConsultModelPolicyService.class);
    private JdbcTemplate jdbc;
    private ConsultBackendStore store;
    private ConsultBackendAuth auth;
    private ConsultAnalysisService service;
    private ConsultAnalysisModel model;
    private ConsultAnalysisEvidence evidence;
    private ConsultBackendAuth.Credential credential;
    private ConsultBackendStore.Client principal;
    private MockMvc mvc;

    private static final String VALID_RESULT = """
        {"schemaVersion":"1.0","understanding":"用户报告标签打印没有反应",
         "category":"PRINTING","facts":[{"text":"调用方报告点击打印无反应","evidenceIds":["input"]}],
         "possibleCauses":[{"description":"可能为打印组件未就绪，需要核实","confidence":"POSSIBLE","evidenceIds":[]}],
         "recommendations":["先确认其他同事是否也无法打印"],"missingInformation":["是否出现报错提示？"],
         "unknowns":["尚未确认运行环境"],"humanHandoff":{"recommended":true,"reason":"需要核实现场环境"}}
        """;

    @BeforeEach void setup() throws Exception {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:sqlite:" + directory.resolve("test.db")));
        String ddl = new String(getClass().getResourceAsStream("/db/consult-backend-schema.sql").readAllBytes(), StandardCharsets.UTF_8);
        for (String part : ddl.split(";")) if (!part.isBlank()) jdbc.execute(part);
        store = new ConsultBackendStore(jdbc);
        var root = Files.createDirectory(directory.resolve("project"));
        Files.writeString(root.resolve("Print.java"), "class Print {\n  void print() {}\n}\n");
        ProjectCatalog catalog = excluded -> List.of(new ProjectCatalog.Entry("erp", "system", "ERP", root.toString(), directory.toString(), true, false, "registry"));
        ProjectAccess access = path -> !path.getFileName().toString().equals("excluded.java");
        auth = new ConsultBackendAuth(store, catalog, access, mapper, true, true);
        evidence = new ConsultAnalysisEvidence(catalog, access);
        when(runner.supportedEngines()).thenReturn(java.util.Set.of("codex"));
        when(runner.runManaged(any(AgentOneShotRunner.ExecutionRequest.class), anyString())).thenReturn(VALID_RESULT);
        when(policy.get()).thenReturn(new BusinessConsultModelPolicyView("model", "Model", "private-account", 1L, 4, "OK", 1L));
        var beans = new StaticListableBeanFactory(Map.of("runner", runner));
        model = new ConsultAnalysisModel(beans.getBeanProvider(AgentOneShotRunner.class), policy, mapper, store);
        service = new ConsultAnalysisService(store, auth, evidence, model, mapper, 1000);
        admin();
        credential = auth.create(new ConsultBackendAuth.GrantRequest("yoooni-agent", "tenant-a", List.of("erp"), System.currentTimeMillis() + 86400000));
        AuthContext.clear();
        principal = store.client(credential.clientId()).orElseThrow();
        mvc = MockMvcBuilders.standaloneSetup(new ConsultBackendController(auth, service), new ConsultBackendAdminController(auth, mapper))
                .setControllerAdvice(new ConsultBackendErrors()).addInterceptors(new RequireAuthInterceptor()).build();
    }

    @AfterEach void cleanup() { service.close(); AuthContext.clear(); }

    private void admin() { AuthContext.set(new AuthPrincipal(7, "operator", List.of("ADMIN"), List.of(), "jwt", Long.MAX_VALUE)); }
    private String input(String requestId) throws Exception {
        return mapper.writeValueAsString(Map.of("agentId", "it-support-partner", "tenantId", "tenant-a", "problemId", "IT-1",
                "conversationId", "conversation-1", "requestId", requestId, "title", "标签打印", "description", "点击打印没有反应",
                "systemIds", List.of("erp")));
    }
    private String token() {
        return auth.token("Basic " + Base64.getEncoder().encodeToString((credential.clientId() + ":" + credential.clientSecret()).getBytes(StandardCharsets.UTF_8)), "client_credentials").access_token();
    }
    private void awaitTerminal(String id) throws Exception {
        long until = System.currentTimeMillis() + 5000;
        while (List.of("QUEUED", "RUNNING", "CANCEL_REQUESTED").contains(store.task(id).orElseThrow().status()) && System.currentTimeMillis() < until) Thread.sleep(10);
        assertThat(store.task(id).orElseThrow().status()).isNotIn("QUEUED", "RUNNING", "CANCEL_REQUESTED");
    }

    @Test void credentialsAreHashedAndRotationRevokesTokensWithoutDeletingTasks() throws Exception {
        String token = token();
        assertThat(auth.authenticate("Bearer " + token).id()).isEqualTo(credential.clientId());
        assertThat(principal.secretHash()).doesNotContain(credential.clientSecret());
        assertThat(jdbc.queryForObject("SELECT token_hash FROM consult_service_token", String.class)).doesNotContain(token);
        var task = service.submit(principal, input("request-001"));
        admin(); var rotated = auth.rotate(credential.clientId()); AuthContext.clear();
        assertThat(rotated.clientSecret()).isNotEqualTo(credential.clientSecret());
        assertThatThrownBy(() -> auth.authenticate("Bearer " + token)).isInstanceOf(ConsultBackendException.class);
        credential = rotated;
        var next = auth.authenticate("Bearer " + token());
        assertThat(service.get(next, task.taskId()).taskId()).isEqualTo(task.taskId());
        admin(); auth.revoke(credential.clientId()); AuthContext.clear();
        assertThatThrownBy(this::token).isInstanceOf(ConsultBackendException.class);
    }

    @Test void managementRequiresAdministratorAndNeverSerializesSecretsOrDigests() throws Exception {
        mvc.perform(get("/api/fore-consult/backend-clients")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/fore-consult/backend-clients").header("Authorization", "Bearer " + token())).andExpect(status().isUnauthorized());
        AuthContext.set(new AuthPrincipal(8, "employee", List.of("USER"), List.of(), "jwt", Long.MAX_VALUE));
        mvc.perform(get("/api/fore-consult/backend-clients")).andExpect(status().isForbidden());
        admin();
        var response = mvc.perform(get("/api/fore-consult/backend-clients"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.clients[0].clientId").value(credential.clientId()))
                .andExpect(jsonPath("$.clients[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.projects[0].id").value("erp"))
                .andReturn().getResponse().getContentAsString();
        assertThat(response).doesNotContain(credential.clientSecret(), principal.secretHash(), "secretHash", "clientSecret", "token_hash");
        auth.create(new ConsultBackendAuth.GrantRequest("one_app", "tenant-a", List.of(), System.currentTimeMillis() + 86400000));
        assertThat(auth.management("one_").clients()).extracting(ConsultBackendAuth.ClientView::appId).containsExactly("one_app");
        assertThatThrownBy(() -> auth.management("x".repeat(101))).isInstanceOf(ConsultBackendException.class);
    }

    @Test void disabledAnalysisAllowsAdministratorPreparationButStillRejectsApplicationTokens() {
        var prepared = new ConsultBackendAuth(store, excluded -> List.of(), path -> true, mapper, false, true);
        admin();
        assertThat(prepared.management("").enabled()).isFalse();
        var next = prepared.create(new ConsultBackendAuth.GrantRequest("prepared-app", "tenant-a", List.of(), System.currentTimeMillis() + 86400000));
        prepared.revoke(next.clientId());
        long version = store.client(next.clientId()).orElseThrow().version();
        prepared.revoke(next.clientId());
        assertThat(store.client(next.clientId()).orElseThrow().version()).isEqualTo(version);
        assertThat(prepared.management("prepared-app").clients().getFirst().status()).isEqualTo("REVOKED");
        assertThatThrownBy(() -> prepared.token("Basic unused", "client_credentials"))
                .isInstanceOfSatisfying(ConsultBackendException.class, e -> assertThat(e.code()).isEqualTo("INTEGRATION_DISABLED"));
        AuthContext.clear();
        assertThatThrownBy(() -> prepared.management("")).isInstanceOf(ConsultBackendException.class);
    }

    @Test void repeatedAndConcurrentIssuanceReusesIntentWithoutRestrictingIndependentGrants() throws Exception {
        String intent = java.util.UUID.randomUUID().toString();
        try (var pool = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = java.util.stream.IntStream.range(0, 6).mapToObj(i -> pool.submit(() -> {
                admin();
                try {
                    auth.create(new ConsultBackendAuth.GrantRequest("new-app", "tenant-a", List.of(), System.currentTimeMillis() + 86400000), intent);
                    return "CREATED";
                } catch (ConsultBackendException e) { return e.code(); }
                finally { AuthContext.clear(); }
            })).toList();
            var results = new java.util.ArrayList<String>();
            for (var future : futures) results.add(future.get());
            assertThat(results).filteredOn("CREATED"::equals).hasSize(1);
            assertThat(results).filteredOn("CREDENTIAL_ALREADY_ISSUED"::equals).hasSize(5);
        }
        admin();
        jdbc.update("UPDATE consult_service_client SET expires_at = 1 WHERE app_id = 'new-app'");
        assertThat(auth.management("new-app").clients().getFirst().status()).isEqualTo("EXPIRED");
        String grantBody = mapper.writeValueAsString(new ConsultBackendAuth.GrantRequest("new-app", "tenant-a", List.of(), System.currentTimeMillis() + 86400000));
        mvc.perform(post("/api/fore-consult/backend-clients").header("Idempotency-Key", intent).contentType("application/json").content(grantBody))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CREDENTIAL_ALREADY_ISSUED"));
        mvc.perform(post("/api/fore-consult/backend-clients").header("Idempotency-Key", "invalid").contentType("application/json").content(grantBody))
                .andExpect(status().isBadRequest());
        assertThatThrownBy(() -> auth.create(new ConsultBackendAuth.GrantRequest("new-app", "tenant-a", List.of(), System.currentTimeMillis() + 86400000), intent))
                .isInstanceOfSatisfying(ConsultBackendException.class, e -> assertThat(e.code()).isEqualTo("CREDENTIAL_ALREADY_ISSUED"));
        auth.create(new ConsultBackendAuth.GrantRequest("new-app", "tenant-a", List.of(), System.currentTimeMillis() + 86400000));
        assertThat(auth.management("new-app").clients()).hasSize(2);
    }

    @Test void rejectsAnonymousAdministrationUserTokensWrongTenantAndOtherApplicationTasks() throws Exception {
        assertThatThrownBy(() -> auth.create(new ConsultBackendAuth.GrantRequest("app", "tenant", List.of(), System.currentTimeMillis() + 100000))).isInstanceOf(ConsultBackendException.class);
        mvc.perform(post("/api/fore-consult/backend-clients").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/fore-consult/v1/analysis-tasks/id").header("Authorization", "Bearer employee-jwt")).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> service.submit(principal, input("request-002").replace("tenant-a", "tenant-b"))).hasMessageContaining("企业");
        var task = service.submit(principal, input("request-002"));
        admin(); var other = auth.create(new ConsultBackendAuth.GrantRequest("other-app", "tenant-a", List.of("erp"), System.currentTimeMillis() + 100000)); AuthContext.clear();
        var outsider = store.client(other.clientId()).orElseThrow();
        assertThatThrownBy(() -> service.get(outsider, task.taskId())).hasMessageContaining("任务不存在");
        assertThatThrownBy(() -> service.cancel(outsider, task.taskId())).hasMessageContaining("任务不存在");
        admin(); var tenant = auth.create(new ConsultBackendAuth.GrantRequest("yoooni-agent", "tenant-b", List.of("erp"), System.currentTimeMillis() + 100000)); AuthContext.clear();
        assertThatThrownBy(() -> service.get(store.client(tenant.clientId()).orElseThrow(), task.taskId())).hasMessageContaining("任务不存在");
    }

    @Test void durableIdempotencySurvivesServiceRecreationAndRejectsChangedContentAndUnknownFields() throws Exception {
        String body = input("request-003");
        var first = service.submit(principal, body);
        assertThat(service.submit(principal, body).taskId()).isEqualTo(first.taskId());
        assertThatThrownBy(() -> service.submit(principal, body.replace("标签打印", "改了问题"))).hasMessageContaining("requestId");
        assertThatThrownBy(() -> service.submit(principal, body.replace("\"agentId\"", "\"codexHome\":\"other\",\"agentId\""))).hasMessageContaining("未知字段");
        assertThatThrownBy(() -> service.submit(principal, body.replace("\"tenant-a\"", "123"))).isInstanceOf(ConsultBackendException.class);
        assertThatThrownBy(() -> service.submit(principal, body.replace("\"tenantId\":\"tenant-a\"", "\"tenantId\":\"tenant-a\",\"tenantId\":\"tenant-a\""))).isInstanceOf(ConsultBackendException.class);
        var restored = new ConsultAnalysisService(store, auth, evidence, model, mapper, 1000);
        assertThat(restored.findRequest(principal, "request-003").taskId()).isEqualTo(first.taskId());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM consult_analysis_task", Integer.class)).isEqualTo(1);
    }

    @Test void concurrentSameRequestCreatesOneTask() throws Exception {
        String body = input("request-004");
        try (var pool = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = java.util.stream.IntStream.range(0, 8).mapToObj(i -> pool.submit(() -> service.submit(principal, body).taskId())).toList();
            var ids = new java.util.HashSet<String>(); for (var f : futures) ids.add(f.get());
            assertThat(ids).hasSize(1);
        }
    }

    @Test void completedAnalysisUsesCurrentDefaultPolicyNoToolsAndReturnsEvidenceGap() throws Exception {
        var task = service.submit(principal, input("request-005"));
        service.recover(); service.tick(); awaitTerminal(task.taskId());
        var result = service.get(principal, task.taskId());
        assertThat(result.status()).isEqualTo("NEEDS_INFORMATION");
        assertThat(result.policyVersion()).isEqualTo(4);
        assertThat(result.result().path("evidence").get(0).path("id").asText()).isEqualTo("input");
        assertThat(result.result().path("unknowns").toString()).contains("尚未确认运行环境");
        assertThat(result.result().path("evidenceLimitations").asText()).contains("未独立核验");
        var capture = org.mockito.ArgumentCaptor.forClass(AgentOneShotRunner.ExecutionRequest.class);
        verify(runner).runManaged(capture.capture(), eq(task.taskId()));
        assertThat(capture.getValue().cwd()).isNull();
        assertThat(capture.getValue().toolPolicy()).isEqualTo("disabled");
        assertThat(capture.getValue().codexHome()).isEqualTo("private-account");
        assertThat(capture.getValue().systemPrompt()).doesNotContain("点击打印没有反应");
    }

    @Test void cancellationKeepsPendingStateUntilWorkerExitsAndLateResultCannotWin() throws Exception {
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        when(runner.runManaged(any(AgentOneShotRunner.ExecutionRequest.class), anyString())).thenAnswer(call -> {
            entered.countDown();
            while (release.getCount() != 0) { try { release.await(); } catch (InterruptedException ignored) { } }
            return VALID_RESULT;
        });
        var task = service.submit(principal, input("request-006"));
        service.recover(); service.tick(); assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
        assertThat(service.cancel(principal, task.taskId()).status()).isEqualTo("CANCEL_REQUESTED");
        release.countDown(); awaitTerminal(task.taskId());
        assertThat(service.get(principal, task.taskId()).status()).isEqualTo("CANCELLED");
        assertThat(service.get(principal, task.taskId()).result()).isNull();
    }

    @Test void timeoutAndRestartNeverConvertUnknownWorkToSuccessOrReplayIt() throws Exception {
        var task = service.submit(principal, input("request-007"));
        store.claim(task.taskId());
        store.cancel(task.taskId(), "ANALYSIS_TIMEOUT");
        store.finish(task.taskId(), "SUCCEEDED", VALID_RESULT, null);
        assertThat(service.get(principal, task.taskId()).status()).isEqualTo("TIMED_OUT");
        var interrupted = service.submit(principal, input("request-008")); store.claim(interrupted.taskId());
        service.recover(); service.tick();
        assertThat(service.get(principal, interrupted.taskId()).status()).isEqualTo("INTERRUPTED");
        assertThat(service.submit(principal, input("request-008")).taskId()).isEqualTo(interrupted.taskId());
        verifyNoInteractions(runner);
    }

    @Test void validatesEvidencePathsAndRejectsInventedReferencesAndExtraJson() throws Exception {
        var input = service.parse(input("request-009"));
        var packets = evidence.collect(input);
        assertThatThrownBy(() -> model.validate(VALID_RESULT.replace("\"input\"", "\"invented\""), packets)).isInstanceOf(ConsultBackendException.class);
        assertThatThrownBy(() -> model.validate(VALID_RESULT + " {}", packets)).isInstanceOf(Exception.class);
        var withRef = new ConsultAnalysisInput(input.agentId(), input.tenantId(), input.problemId(), input.conversationId(), input.requestId(), input.title(), input.description(), List.of(), null,
                List.of("erp"), null, List.of(), List.of(new ConsultAnalysisInput.EvidenceRef("erp", "Print.java", 1, 3))).validated();
        assertThat(evidence.collect(withRef)).anyMatch(p -> p.kind().equals("SERVER_SOURCE") && p.text().contains("class Print"));
        var malicious = new ConsultAnalysisInput(withRef.agentId(), withRef.tenantId(), withRef.problemId(), withRef.conversationId(), withRef.requestId(), withRef.title(), withRef.description(), List.of(), null,
                List.of("erp"), null, List.of(), List.of(new ConsultAnalysisInput.EvidenceRef("erp", "../outside.java", 1, 1))).validated();
        assertThatThrownBy(() -> evidence.collect(malicious)).isInstanceOf(ConsultBackendException.class);
    }

    @Test void httpContractReturnsAcceptedLocationAndOwnerOnlyLookupWithoutLeakingSecrets() throws Exception {
        String bearer = "Bearer " + token();
        var response = mvc.perform(post("/api/fore-consult/v1/analysis-tasks").header("Authorization", bearer)
                .contentType("application/json").content(input("request-010"))).andExpect(status().isAccepted())
                .andExpect(header().exists("Location")).andExpect(header().string("Cache-Control", "no-store")).andReturn();
        String id = mapper.readTree(response.getResponse().getContentAsString()).path("taskId").asText();
        mvc.perform(get("/api/fore-consult/v1/analysis-tasks/" + id).header("Authorization", bearer))
                .andExpect(status().isOk()).andExpect(jsonPath("status").value("QUEUED"));
        mvc.perform(get("/api/fore-consult/v1/analysis-tasks").param("requestId", "request-010").header("Authorization", bearer))
                .andExpect(status().isOk()).andExpect(jsonPath("taskId").value(id));
        assertThat(response.getResponse().getContentAsString()).doesNotContain(credential.clientSecret(), "private-account", "secret_hash");
    }

    @Test void expiredTicketsAndClientsFailAndAdminRenewalRetainsOriginalTaskOwnership() throws Exception {
        var task = service.submit(principal, input("request-011"));
        String token = token();
        jdbc.update("UPDATE consult_service_token SET expires_at = 1");
        assertThatThrownBy(() -> auth.authenticate("Bearer " + token)).isInstanceOf(ConsultBackendException.class);
        jdbc.update("UPDATE consult_service_client SET expires_at = 1");
        assertThatThrownBy(this::token).isInstanceOf(ConsultBackendException.class);
        admin(); credential = auth.rotate(credential.clientId(), System.currentTimeMillis() + 100000); AuthContext.clear();
        var renewed = auth.authenticate("Bearer " + token());
        assertThat(service.get(renewed, task.taskId()).taskId()).isEqualTo(task.taskId());
    }

    @Test void queueAdmissionAndPayloadAndScopeAreBoundedBeforeModelExecution() throws Exception {
        for (int i = 0; i < 8; i++) service.submit(principal, input("bounded-" + i));
        assertThatThrownBy(() -> service.submit(principal, input("bounded-9"))).hasMessageContaining("繁忙");
        assertThat(service.cancel(principal, store.request(principal.id(), "bounded-0").orElseThrow().id()).status()).isEqualTo("CANCELLED");
        assertThat(service.submit(principal, input("bounded-9")).status()).isEqualTo("QUEUED");
        assertThatThrownBy(() -> service.submit(principal, input("unknown-project").replace("\"erp\"", "\"srm\""))).hasMessageContaining("授权范围");
        mvc.perform(post("/api/fore-consult/v1/analysis-tasks").header("Authorization", "Bearer " + token())
                .contentType("application/json").content("x".repeat(196609))).andExpect(status().isPayloadTooLarge());
        verifyNoInteractions(runner);
    }

    @Test void watchdogTimesOutActualBlockingRunnerAndDoesNotAcceptItsLateText() throws Exception {
        var entered = new CountDownLatch(1);
        var stopped = new CountDownLatch(1);
        when(runner.runManaged(any(AgentOneShotRunner.ExecutionRequest.class), anyString())).thenAnswer(call -> {
            entered.countDown(); stopped.await(); return VALID_RESULT;
        });
        when(runner.cancelManaged(anyString())).thenAnswer(call -> { stopped.countDown(); return true; });
        var task = service.submit(principal, input("timeout-actual"));
        service.recover(); service.tick(); assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
        jdbc.update("UPDATE consult_analysis_task SET started_at = 1 WHERE task_id = ?", task.taskId());
        service.tick(); awaitTerminal(task.taskId());
        assertThat(service.get(principal, task.taskId()).status()).isEqualTo("TIMED_OUT");
        assertThat(service.get(principal, task.taskId()).result()).isNull();
    }

    @Test void dedicatedRoutesKeepApplicationIdentitySeparateEvenWithGlobalJwtProtection() throws Exception {
        var properties = new com.exceptioncoder.toolbox.common.auth.config.AuthProperties();
        properties.setProtectedPatterns(List.of("/api/**"));
        properties.setWhitelist(List.of("/api/fore-consult/v1/token", "/api/fore-consult/v1/analysis-tasks", "/api/fore-consult/v1/analysis-tasks/**"));
        var jwt = mock(com.exceptioncoder.toolbox.common.auth.service.JwtService.class);
        var tokens = mock(com.exceptioncoder.toolbox.common.auth.service.TokenService.class);
        when(jwt.parse(anyString())).thenThrow(com.exceptioncoder.toolbox.common.auth.AuthException.tokenInvalid());
        var filter = new com.exceptioncoder.toolbox.common.auth.web.JwtAuthFilter(jwt, tokens, properties, mapper);
        var protectedMvc = MockMvcBuilders.standaloneSetup(new ConsultBackendController(auth, service), new ConsultBackendAdminController(auth, mapper))
                .setControllerAdvice(new ConsultBackendErrors()).addFilters(filter).addInterceptors(new RequireAuthInterceptor()).build();
        String bearer = "Bearer " + token();
        protectedMvc.perform(post("/api/fore-consult/v1/analysis-tasks").header("Authorization", bearer)
                .contentType("application/json").content(input("global-jwt-01"))).andExpect(status().isAccepted());
        protectedMvc.perform(post("/api/fore-consult/backend-clients").header("Authorization", bearer)
                .contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        protectedMvc.perform(post("/api/fore-consult/v1/analysis-tasks").header("Authorization", "Bearer employee-jwt")
                .contentType("application/json").content(input("global-jwt-02"))).andExpect(status().isUnauthorized());
    }
}
