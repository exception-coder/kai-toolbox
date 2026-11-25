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
    private ConsultAnalysisImages images;
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
        images = new ConsultAnalysisImages(new ConsultImageStore(jdbc));
        when(runner.supportedEngines()).thenReturn(java.util.Set.of("codex"));
        when(runner.runManaged(any(AgentOneShotRunner.ExecutionRequest.class), anyString())).thenReturn(VALID_RESULT);
        when(policy.get()).thenReturn(new BusinessConsultModelPolicyView("model", "Model", "private-account", 1L, 4, "OK", 1L));
        var beans = new StaticListableBeanFactory(Map.of("runner", runner));
        model = new ConsultAnalysisModel(beans.getBeanProvider(AgentOneShotRunner.class), policy, mapper, store);
        service = new ConsultAnalysisService(store, auth, evidence, model, images, mapper, 1000);
        admin();
        credential = auth.create(new ConsultBackendAuth.GrantRequest("yoooni-agent", "tenant-a", List.of("erp"), System.currentTimeMillis() + 86400000));
        AuthContext.clear();
        principal = store.client(credential.clientId()).orElseThrow();
        mvc = MockMvcBuilders.standaloneSetup(new ConsultBackendController(auth, service, images), new ConsultBackendAdminController(auth, mapper, images))
                .setControllerAdvice(new ConsultBackendErrors()).addInterceptors(new RequireAuthInterceptor()).build();
    }

    @AfterEach void cleanup() { service.close(); AuthContext.clear(); }

    private void admin() { AuthContext.set(new AuthPrincipal(7, "operator", List.of("ADMIN"), List.of(), "jwt", Long.MAX_VALUE)); }
    private String input(String requestId) throws Exception {
        return mapper.writeValueAsString(Map.of("agentId", "it-support-partner", "tenantId", "tenant-a", "problemId", "IT-1",
                "conversationId", "conversation-1", "requestId", requestId, "title", "标签打印", "description", "点击打印没有反应",
                "systemIds", List.of("erp"), "replyMode", "CALLER"));
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
        var restored = new ConsultAnalysisService(store, auth, evidence, model, images, mapper, 1000);
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
                List.of("erp"), null, List.of(), List.of(new ConsultAnalysisInput.EvidenceRef("erp", "Print.java", 1, 3)), List.of(), null, null, null, null).validated();
        assertThat(evidence.collect(withRef)).anyMatch(p -> p.kind().equals("SERVER_SOURCE") && p.text().contains("class Print"));
        var malicious = new ConsultAnalysisInput(withRef.agentId(), withRef.tenantId(), withRef.problemId(), withRef.conversationId(), withRef.requestId(), withRef.title(), withRef.description(), List.of(), null,
                List.of("erp"), null, List.of(), List.of(new ConsultAnalysisInput.EvidenceRef("erp", "../outside.java", 1, 1)), List.of(), null, null, null, null).validated();
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
        properties.setWhitelist(List.of("/api/fore-consult/v1/token", "/api/fore-consult/v1/analysis-tasks", "/api/fore-consult/v1/analysis-tasks/**", "/api/fore-consult/v1/attachments", "/api/fore-consult/v1/attachments/**"));
        var jwt = mock(com.exceptioncoder.toolbox.common.auth.service.JwtService.class);
        var tokens = mock(com.exceptioncoder.toolbox.common.auth.service.TokenService.class);
        when(jwt.parse(anyString())).thenThrow(com.exceptioncoder.toolbox.common.auth.AuthException.tokenInvalid());
        var filter = new com.exceptioncoder.toolbox.common.auth.web.JwtAuthFilter(jwt, tokens, properties, mapper);
        var protectedMvc = MockMvcBuilders.standaloneSetup(new ConsultBackendController(auth, service, images), new ConsultBackendAdminController(auth, mapper, images))
                .setControllerAdvice(new ConsultBackendErrors()).addFilters(filter).addInterceptors(new RequireAuthInterceptor()).build();
        String bearer = "Bearer " + token();
        protectedMvc.perform(post("/api/fore-consult/v1/analysis-tasks").header("Authorization", bearer)
                .contentType("application/json").content(input("global-jwt-01"))).andExpect(status().isAccepted());
        protectedMvc.perform(post("/api/fore-consult/backend-clients").header("Authorization", bearer)
                .contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        protectedMvc.perform(post("/api/fore-consult/v1/analysis-tasks").header("Authorization", "Bearer employee-jwt")
                .contentType("application/json").content(input("global-jwt-02"))).andExpect(status().isUnauthorized());
        protectedMvc.perform(post("/api/fore-consult/v1/attachments").param("uploadId", "upload-jwt-01").header("Authorization", bearer)
                .contentType("image/png").content(png())).andExpect(status().isOk());
        protectedMvc.perform(get("/api/fore-consult/v1/attachments").param("uploadId", "upload-jwt-01").header("Authorization", "Bearer employee-jwt"))
                .andExpect(status().isUnauthorized());
    }

    private byte[] png() throws Exception {
        var bytes = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(3, 2, java.awt.image.BufferedImage.TYPE_INT_RGB), "png", bytes);
        return bytes.toByteArray();
    }

    private String extendedInput(String request, List<String> ids, String mode) throws Exception {
        var value = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(input(request));
        value.set("attachmentIds", mapper.valueToTree(ids));
        value.put("replyMode", mode);
        return value.toString();
    }

    private com.fasterxml.jackson.databind.node.ObjectNode replies() throws Exception {
        var value = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(VALID_RESULT);
        value.put("schemaVersion", "1.1");
        var candidates = value.putArray("replyCandidates");
        for (String text : List.of("已看到您反馈的打印问题，请先确认其他同事是否也有相同情况。", "目前还不能确定原因，建议先查看页面是否有报错，再一起排查。", "为了继续判断，请补充打印时的报错提示或一张清晰截图。")) {
            candidates.addObject().put("text", text).putArray("evidenceIds").add("input");
        }
        return value;
    }

    @Test void originalImageUploadHasIndependentIdempotencyAndOwnerOnlyRecovery() throws Exception {
        byte[] bytes = png();
        var image = images.upload(principal, "upload-raw-01", "image/png", bytes);
        assertThat(images.upload(principal, "upload-raw-01", "image/png", bytes)).isEqualTo(image);
        try (var pool = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var uploads = pool.invokeAll(java.util.stream.IntStream.range(0, 4)
                    .<java.util.concurrent.Callable<ConsultImageStore.Image>>mapToObj(i -> () -> images.upload(principal, "upload-raw-01", "image/png", bytes)).toList());
            for (var upload : uploads) assertThat(upload.get()).isEqualTo(image);
        }
        byte[] changed = java.util.Arrays.copyOf(bytes, bytes.length + 1);
        assertThatThrownBy(() -> images.upload(principal, "upload-raw-01", "image/png", changed)).hasMessageContaining("不同图片");
        assertThat(images.get(principal, "upload-raw-01", true).attachmentId()).isEqualTo(image.attachmentId());
        var restored = new ConsultAnalysisImages(new ConsultImageStore(jdbc));
        assertThat(restored.resolve(principal, List.of(image.attachmentId()), true).images().getFirst().base64Data())
                .isEqualTo(Base64.getEncoder().encodeToString(bytes));
        assertThatThrownBy(() -> images.upload(principal, "upload-raw-01", "image/jpeg", bytes)).hasMessageContaining("不同图片");
        admin();
        var sameTenant = auth.create(new ConsultBackendAuth.GrantRequest("other-app", "tenant-a", List.of(), System.currentTimeMillis() + 86400000));
        var otherTenant = auth.create(new ConsultBackendAuth.GrantRequest("yoooni-agent", "tenant-b", List.of(), System.currentTimeMillis() + 86400000));
        AuthContext.clear();
        for (var credential : List.of(sameTenant, otherTenant)) {
            var foreign = store.client(credential.clientId()).orElseThrow();
            assertThatThrownBy(() -> images.get(foreign, image.attachmentId(), false)).hasMessageContaining("不存在");
            var json = extendedInput("foreign-image-01", List.of(image.attachmentId()), "FORGE").replace("\"systemIds\":[\"erp\"]", "\"systemIds\":[]")
                    .replace("\"tenantId\":\"tenant-a\"", "\"tenantId\":\"" + foreign.tenantId() + "\"");
            assertThatThrownBy(() -> service.submit(foreign, json)).hasMessageContaining("不存在");
        }
        mvc.perform(get("/api/fore-consult/v1/attachments/" + image.attachmentId()).header("Authorization", "Bearer " + token()))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.sha256").value(image.sha256())).andExpect(jsonPath("$.image_bytes").doesNotExist());
        mvc.perform(post("/api/fore-consult/v1/attachments").param("uploadId", "upload-no-auth").contentType("image/png").content(bytes))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/fore-consult/v1/attachments").param("uploadId", "upload-http-type").header("Authorization", "Bearer " + token())
                .contentType("application/pdf").content(bytes)).andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("IMAGE_FORMAT_UNSUPPORTED"));
    }

    @Test void imageValidationLimitsExpiryCleanupAndQuotaAreExplicit() throws Exception {
        assertThatThrownBy(() -> images.upload(principal, "upload-invalid", "image/png", new byte[] {1, 2})).hasMessageContaining("损坏");
        assertThatThrownBy(() -> images.upload(principal, "upload-wrongtype", "image/jpeg", png())).hasMessageContaining("类型不符");
        assertThatThrownBy(() -> images.upload(principal, "upload-format", "image/svg+xml", png())).hasMessageContaining("仅支持");
        assertThatThrownBy(() -> images.upload(principal, "upload-oversize", "image/png", new byte[ConsultAnalysisImages.MAX_BYTES + 1])).hasMessageContaining("5MiB");
        byte[] hugeDimensions = png();
        java.nio.ByteBuffer.wrap(hugeDimensions).putInt(16, 10001);
        assertThatThrownBy(() -> images.upload(principal, "upload-dimensions", "image/png", hugeDimensions)).hasMessageContaining("2000 万");
        var animated = new java.io.ByteArrayOutputStream();
        byte[] original = png();
        animated.write(original, 0, 33);
        animated.write(new byte[] {0, 0, 0, 8, 'a', 'c', 'T', 'L', 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0});
        animated.write(original, 33, original.length - 33);
        assertThatThrownBy(() -> images.upload(principal, "upload-animated", "image/png", animated.toByteArray())).hasMessageContaining("动画");
        var image = images.upload(principal, "upload-expire", "image/png", png());
        jdbc.update("UPDATE consult_analysis_attachment SET byte_size = ?", 256 * 1024 * 1024);
        assertThatThrownBy(() -> images.upload(principal, "upload-quota", "image/png", png())).hasMessageContaining("额度");
        jdbc.update("UPDATE consult_analysis_attachment SET expires_at = 1 WHERE attachment_id = ?", image.attachmentId());
        assertThatThrownBy(() -> images.get(principal, image.attachmentId(), false)).hasMessageContaining("过期");
        assertThatThrownBy(() -> images.upload(principal, "upload-expire", "image/png", png())).hasMessageContaining("过期");
        assertThatThrownBy(() -> service.submit(principal, extendedInput("expired-admit", List.of(image.attachmentId()), "FORGE"))).hasMessageContaining("过期");
        images.clean();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM consult_analysis_attachment WHERE image_bytes IS NULL", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM consult_analysis_attachment", Integer.class)).isEqualTo(1);
        jdbc.update("UPDATE consult_analysis_attachment SET created_at = 1");
        images.clean();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM consult_analysis_attachment", Integer.class)).isZero();
    }

    @Test void quotaReasonsAndConcurrentBoundaryAreIndependentOfMetadata() throws Exception {
        byte[] bytes = png();
        var limitedStore = new ConsultImageStore(jdbc, new ConsultImagePolicy(bytes.length * 2L, bytes.length * 4L, 2, 4, 1, 2, 48, 7));
        var limited = new ConsultAnalysisImages(limitedStore);
        try (var pool = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var results = pool.invokeAll(java.util.stream.IntStream.range(0, 4)
                    .<java.util.concurrent.Callable<String>>mapToObj(i -> () -> {
                        try { limited.upload(principal, "boundary-" + i, "image/png", bytes); return "OK"; }
                        catch (ConsultBackendException e) { return e.details().get("reason").toString(); }
                    }).toList());
            assertThat(results.stream().map(f -> { try { return f.get(); } catch (Exception e) { throw new RuntimeException(e); } }).toList())
                    .containsExactlyInAnyOrder("OK", "OK", "APP_BYTES", "APP_BYTES");
        }
        long now = System.currentTimeMillis();
        for (var entry : Map.of("APP_COUNT", new ConsultImagePolicy(10000, 20000, 2, 4, 1, 2, 48, 7),
                "GLOBAL_COUNT", new ConsultImagePolicy(10000, 20000, 2, 2, 1, 2, 48, 7),
                "GLOBAL_BYTES", new ConsultImagePolicy(bytes.length * 2L, bytes.length * 2L, 2, 4, 1, 2, 48, 7)).entrySet()) {
            String client = entry.getKey().equals("APP_COUNT") ? principal.id() : "another-client";
            assertThatThrownBy(() -> new ConsultImageStore(jdbc, entry.getValue()).requireCapacity(client, bytes.length, now))
                    .isInstanceOfSatisfying(ConsultBackendException.class, e -> assertThat(e.details().get("reason")).isEqualTo(entry.getKey()));
        }
        jdbc.update("UPDATE consult_analysis_attachment SET expires_at = ?", now - 1);
        assertThat(limitedStore.usage(principal.id(), now).expiredBytes()).isEqualTo(bytes.length * 2L);
        limited.clean();
        assertThat(limitedStore.usage(principal.id(), now).metadataCount()).isEqualTo(1);
        assertThat(limitedStore.usage(principal.id(), now).activeBytes()).isZero();
        limited.upload(principal, "after-cleanup", "image/png", bytes);
        assertThat(limited.diagnostics(principal.id()).cleanup().status()).isEqualTo("OK");
    }

    @Test void metadataPruningIsGlobalAndNeverRemovesLiveContent() throws Exception {
        var live = images.upload(principal, "metadata-live", "image/png", png());
        images.upload(principal, "metadata-old-1", "image/png", png());
        images.upload(principal, "metadata-old-2", "image/png", png());
        admin();
        var grant = auth.create(new ConsultBackendAuth.GrantRequest("metadata-other", "tenant-a", List.of(), System.currentTimeMillis() + 86400000));
        AuthContext.clear();
        var other = store.client(grant.clientId()).orElseThrow();
        images.upload(other, "metadata-old-3", "image/png", png());
        images.upload(other, "metadata-old-4", "image/png", png());
        jdbc.update("UPDATE consult_analysis_attachment SET expires_at = 1 WHERE attachment_id <> ?", live.attachmentId());
        var limited = new ConsultAnalysisImages(new ConsultImageStore(jdbc, new ConsultImagePolicy(100000, 200000, 10, 20, 1, 1, 48, 7)));
        limited.clean();
        var stats = limited.diagnostics(null);
        assertThat(stats.usage().metadataCount()).isEqualTo(1);
        assertThat(stats.usage().activeCount()).isEqualTo(1);
        assertThat(stats.cleanup().released()).isEqualTo(4);
        assertThat(stats.cleanup().removed()).isEqualTo(3);
        assertThat(limited.resolve(principal, List.of(live.attachmentId()), true).images()).hasSize(1);
    }

    @Test void reusableReceiptRequiresSameApplicationHashTypeAndLifetime() throws Exception {
        var image = images.upload(principal, "reuse-image-01", "image/png", png());
        mvc.perform(get("/api/fore-consult/v1/attachments/reusable").header("Authorization", "Bearer " + token())
                .param("sha256", image.sha256()).param("mediaType", "image/png"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.attachmentId").value(image.attachmentId()));
        assertThat(images.reusable(principal, image.sha256(), "image/png", 600)).isEqualTo(image);
        assertThat(images.diagnostics(principal.id()).usage().totalCount()).isEqualTo(1);
        assertThatThrownBy(() -> images.reusable(principal, image.sha256(), "image/jpeg", 600)).hasMessageContaining("没有可复用");
        admin();
        var foreign = auth.create(new ConsultBackendAuth.GrantRequest("foreign-reuse", "tenant-a", List.of(), System.currentTimeMillis() + 86400000));
        AuthContext.clear();
        assertThatThrownBy(() -> images.reusable(store.client(foreign.clientId()).orElseThrow(), image.sha256(), "image/png", 600))
                .hasMessageContaining("没有可复用");
        images.upload(principal, "reuse-image-02", "image/png", png());
        assertThat(images.diagnostics(principal.id()).duplicates().extraCount()).isEqualTo(1);
        jdbc.update("UPDATE consult_analysis_attachment SET expires_at = ?", System.currentTimeMillis() + 1000);
        assertThatThrownBy(() -> images.reusable(principal, image.sha256(), "image/png", 600)).hasMessageContaining("没有可复用");
    }

    @Test void admissionProtectsImagesAcrossCleanupRecoveryAndRollsBackOnFailure() throws Exception {
        var image = images.upload(principal, "lease-image-01", "image/png", png());
        var task = service.submit(principal, extendedInput("lease-task-01", List.of(image.attachmentId()), "FORGE"));
        long until = images.get(principal, image.attachmentId(), false).expiresAt();
        assertThat(until).isGreaterThan(image.expiresAt());
        service.submit(principal, extendedInput("lease-task-01", List.of(image.attachmentId()), "FORGE"));
        assertThat(images.get(principal, image.attachmentId(), false).expiresAt()).isEqualTo(until);
        new ConsultImageStore(jdbc).clean(image.expiresAt() + 1000);
        assertThat(store.claim(task.taskId())).isTrue();
        store.recover();
        assertThat(store.task(task.taskId()).orElseThrow().status()).isEqualTo("INTERRUPTED");
        var restored = new ConsultAnalysisImages(new ConsultImageStore(jdbc));
        assertThat(restored.resolve(principal, List.of(image.attachmentId()), true).images()).hasSize(1);
        var other = images.upload(principal, "lease-image-02", "image/png", png());
        assertThatThrownBy(() -> images.admit(principal, List.of(other.attachmentId()), () -> { throw new IllegalStateException("insertion failed"); }))
                .hasMessage("insertion failed");
        assertThat(images.get(principal, other.attachmentId(), false).expiresAt()).isEqualTo(other.expiresAt());
        new ConsultImageStore(jdbc).clean(until + 1);
        assertThat(jdbc.queryForObject("SELECT image_bytes IS NULL FROM consult_analysis_attachment WHERE attachment_id = ?", Boolean.class, image.attachmentId())).isTrue();
    }

    @Test void admissionCannotKeepRenewingAnOldImage() throws Exception {
        var image = images.upload(principal, "lease-limit-01", "image/png", png());
        jdbc.update("UPDATE consult_analysis_attachment SET created_at = ?", System.currentTimeMillis() - 6 * 86400000L);
        assertThatThrownBy(() -> service.submit(principal, extendedInput("lease-limit-task", List.of(image.attachmentId()), "FORGE")))
                .isInstanceOfSatisfying(ConsultBackendException.class, e -> assertThat(e.code()).isEqualTo("ATTACHMENT_RETENTION_LIMIT"));
        assertThat(store.request(principal.id(), "lease-limit-task")).isEmpty();
    }

    @Test void storageDiagnosticsRequireAdminAndQuotaResponseIdentifiesDimension() throws Exception {
        images.upload(principal, "diagnostic-01", "image/png", png());
        jdbc.update("UPDATE consult_analysis_attachment SET byte_size = ?", 256L * 1024 * 1024);
        mvc.perform(post("/api/fore-consult/v1/attachments").param("uploadId", "diagnostic-02")
                .header("Authorization", "Bearer " + token()).contentType("image/png").content(png()))
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("IMAGE_QUOTA_EXCEEDED"))
                .andExpect(jsonPath("$.details.reason").value("APP_BYTES"));
        mvc.perform(get("/api/fore-consult/backend-clients/image-storage").header("Authorization", "Bearer " + token()))
                .andExpect(status().isUnauthorized());
        admin();
        mvc.perform(get("/api/fore-consult/backend-clients/image-storage").param("clientId", principal.id()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.application.usage.activeBytes").value(268435456))
                .andExpect(jsonPath("$.global.limits.globalBytes").value(1073741824))
                .andExpect(jsonPath("$.storage.diskUsableBytes").isNumber());
    }

    @Test void directAnalysisReturnsResultsWithoutPersistingTasksOrImages() throws Exception {
        String raw = input("direct-test-01");
        mvc.perform(post("/api/fore-consult/v1/analyze-once").header("Authorization", "Bearer " + token())
                .contentType("application/json").content(raw))
                .andExpect(status().isOk()).andExpect(jsonPath("$.requestId").value("direct-test-01"))
                .andExpect(jsonPath("$.result.schemaVersion").value("1.0"));
        assertThat(store.request(principal.id(), "direct-test-01")).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM consult_analysis_attachment", Integer.class)).isZero();
        mvc.perform(post("/api/fore-consult/v1/analyze-once").contentType("application/json").content(raw))
                .andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> service.analyzeOnce(principal, extendedInput("direct-test-02",
                List.of("img_11111111-1111-4111-8111-111111111111"), "FORGE")))
                .hasMessageContaining("不接受已上传附件");
    }

    @Test void externalImageRunsFromReferenceWithoutAttachmentStorage() throws Exception {
        byte[] bytes = png();
        String digest = java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));
        var ref = new ConsultAnalysisInput.ImageRef("itcs-picture", digest, "image/png");
        var input = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(input("external-task-01"));
        input.put("replyMode", "FORGE");
        input.set("imageRefs", mapper.valueToTree(List.of(ref)));
        assertThatThrownBy(() -> service.submit(principal, input.toString())).hasMessageContaining("未配置");
        var source = mock(ConsultExternalImageSource.class);
        when(source.read(principal, ref, ConsultAnalysisImages.MAX_BYTES)).thenReturn(bytes);
        var output = replies();
        output.putArray("imageObservations").addObject().put("attachmentId", "external-itcs-picture")
                .put("readable", true).put("observation", "截图包含矩形");
        when(runner.supportsManagedImages(any())).thenReturn(true);
        when(runner.runManaged(any(AgentOneShotRunner.ExecutionRequest.class), anyString(), anyList())).thenReturn(output.toString());
        service.close();
        service = new ConsultAnalysisService(store, auth, evidence, model, images, mapper, source, 5000);
        var task = service.submit(principal, input.toString());
        verify(source, never()).read(any(), any(), anyInt());
        service.recover();
        service.tick();
        awaitTerminal(task.taskId());
        var completed = service.get(principal, task.taskId());
        assertThat(completed.status()).isEqualTo("NEEDS_INFORMATION");
        assertThat(completed.result().path("imageInputs").get(0).path("sha256").asText()).isEqualTo(digest);
        verify(runner).runManaged(any(AgentOneShotRunner.ExecutionRequest.class), anyString(),
                eq(List.of(new AgentOneShotRunner.ImageInput(Base64.getEncoder().encodeToString(bytes), "image/png"))));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM consult_analysis_attachment", Integer.class)).isZero();
        assertThat(store.task(task.taskId()).orElseThrow().input()).doesNotContain(Base64.getEncoder().encodeToString(bytes));
        assertThatThrownBy(() -> images.resolveExternal(principal, List.of(ref),
                mock(ConsultExternalImageSource.class, invocation -> new byte[] {1}))).hasMessageContaining("摘要");
    }

    @Test void directScreenshotLookupUsesCurrentApplicationProjectsAndKeepsSourceInternal() throws Exception {
        var root = directory.resolve("project");
        var another = Files.createDirectory(directory.resolve("another"));
        var ui = Files.createDirectories(root.resolve("WebRoot"));
        Files.writeString(ui.resolve("Shipment.jsp"), """
                <h2>染整生产单</h2>
                <label>净重出货</label>
                const restricted = orderStatus === "CLOSED";
                """);
        Files.writeString(Files.createDirectories(another.resolve("WebRoot")).resolve("Outside.jsp"),
                "<h2>染整生产单</h2><p>净重出货</p>FORBIDDEN_PROJECT_MARKER");
        ProjectCatalog catalog = excluded -> List.of(
                new ProjectCatalog.Entry("erp", "system", "ERP", root.toString(), directory.toString(), true, false, "registry"),
                new ProjectCatalog.Entry("other", "other", "Other", another.toString(), directory.toString(), true, false, "registry"));
        ProjectAccess access = path -> true;
        var search = new ConsultScreenshotSourceSearch(catalog, access);
        assertThat(search.find(List.of("erp", "other"), List.of("净重出货", "染整生产单"))).isEmpty();
        var feature = new ConsultScreenshotEvidence(search, mapper, List.of(principal.id()));
        var beans = new StaticListableBeanFactory(Map.of("runner", runner));
        model = new ConsultAnalysisModel(beans.getBeanProvider(AgentOneShotRunner.class), policy, mapper, store, feature);

        byte[] bytes = png();
        String digest = java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));
        var ref = new ConsultAnalysisInput.ImageRef("itcs-picture", digest, "image/png");
        var source = mock(ConsultExternalImageSource.class);
        when(source.read(principal, ref, ConsultAnalysisImages.MAX_BYTES)).thenReturn(bytes);
        service.close();
        service = new ConsultAnalysisService(store, auth, evidence, model, images, mapper, source, 5000);

        var input = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(input("screenshot-rule-01"));
        input.remove("systemIds");
        input.put("title", "出货方式");
        input.put("description", "为什么这张单不能选图中的选项？");
        input.set("imageRefs", mapper.valueToTree(List.of(ref)));

        var output = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(VALID_RESULT);
        output.put("schemaVersion", "1.1");
        output.putArray("imageObservations").addObject().put("attachmentId", "external-itcs-picture")
                .put("readable", true).put("observation", "图中可见毛重和净重选项");
        output.putArray("facts").addObject().put("text", "单据关闭时限制切换")
                .putArray("evidenceIds").add("screenshot-source-1");
        when(runner.supportsManagedImages(any())).thenReturn(true);
        when(runner.runManaged(any(AgentOneShotRunner.ExecutionRequest.class), anyString(), anyList())).thenAnswer(call -> {
            AgentOneShotRunner.ExecutionRequest request = call.getArgument(0);
            assertThat(request.toolPolicy()).isEqualTo(AgentOneShotRunner.TOOL_POLICY_DISABLED);
            if (request.systemPrompt().startsWith("只定位业务截图")) {
                return "[\"净重出货\",\"染整生产单\"]";
            }
            assertThat(request.userPrompt()).contains("orderStatus", "screenshot-source-1").doesNotContain("FORBIDDEN_PROJECT_MARKER");
            return output.toString();
        });

        var result = service.analyzeOnce(principal, input.toString()).result();
        assertThat(result.path("evidence").toString()).contains("screenshot-source-1").doesNotContain("Shipment.jsp", "orderStatus");
        assertThat(result.path("evidenceLimitations").asText()).contains("未核验运行版本");
        verify(runner, times(2)).runManaged(any(AgentOneShotRunner.ExecutionRequest.class), anyString(), anyList());

        output.putArray("unknowns").add("内部实现位于 WebRoot/Shipment.jsp");
        assertThatThrownBy(() -> service.analyzeOnce(principal, input.toString()))
                .isInstanceOfSatisfying(ConsultBackendException.class, error -> assertThat(error.code()).isEqualTo("INVALID_ANALYSIS_OUTPUT"));
    }

    @Test void taskActuallyPassesOriginalBytesAndPersistsThreeStableCandidates() throws Exception {
        var image = images.upload(principal, "upload-model-01", "image/png", png());
        var output = replies();
        output.putArray("imageObservations").addObject().put("attachmentId", image.attachmentId()).put("readable", true).put("observation", "图中有一个黑色矩形，未显示打印错误文字");
        when(runner.supportsManagedImages(any())).thenReturn(true);
        when(runner.runManaged(any(), anyString(), anyList())).thenAnswer(call -> {
            AgentOneShotRunner.ExecutionRequest request = call.getArgument(0);
            List<AgentOneShotRunner.ImageInput> actual = call.getArgument(2);
            assertThat(actual).containsExactly(new AgentOneShotRunner.ImageInput(Base64.getEncoder().encodeToString(png()), "image/png"));
            assertThat(request.userPrompt()).contains(image.attachmentId(), image.sha256());
            assertThat(request.systemPrompt()).contains(com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultPlainWritingSkill.instructions());
            assertThat(request.systemPrompt()).contains("不得为了区分候选而追加操作或信息追问", "对外候选只保留能直接回复的话")
                    .doesNotContain("可分别侧重说明、处理步骤、信息追问", "信息不足时给最少追问。");
            assertThat(request.toolPolicy()).isEqualTo("disabled");
            assertThat(request.cwd()).isNull();
            return output.toString();
        });
        String json = extendedInput("images-model-01", List.of(image.attachmentId()), "FORGE");
        var task = service.submit(principal, json);
        assertThat(task.attachmentIds()).containsExactly(image.attachmentId());
        assertThatThrownBy(() -> service.submit(principal, json.replace("FORGE", "CALLER"))).hasMessageContaining("不同内容");
        service.recover(); service.tick(); awaitTerminal(task.taskId());
        var complete = service.get(principal, task.taskId());
        assertThat(complete.status()).isEqualTo("NEEDS_INFORMATION");
        assertThat(complete.result().path("replyCandidatesGeneratedBy").asText()).isEqualTo("FORGE");
        assertThat(complete.result().path("replyCandidates")).hasSize(3);
        assertThat(complete.result().path("replyCandidates").get(2).path("id").asText()).isEqualTo("reply-3");
        assertThat(complete.result().path("imageInputs").get(0).path("sha256").asText()).isEqualTo(image.sha256());
        assertThat(complete.result().path("evidence").toString()).contains("CALLER_IMAGE");
        jdbc.update("UPDATE consult_analysis_attachment SET expires_at = 1"); images.clean();
        assertThat(service.submit(principal, json).result()).isEqualTo(complete.result());
        assertThat(service.findRequest(principal, task.requestId()).result()).isEqualTo(complete.result());
        verify(runner, never()).runManaged(any(), anyString());
        verify(runner, times(1)).runManaged(any(), anyString(), anyList());
    }

    @Test void unsupportedExpiredAndUnreadableImagesNeverBecomeSuccessfulTextOnlyAnalysis() throws Exception {
        var image = images.upload(principal, "upload-unsupported", "image/png", png());
        var unsupported = service.submit(principal, extendedInput("image-unsupported", List.of(image.attachmentId()), "CALLER"));
        service.recover(); service.tick(); awaitTerminal(unsupported.taskId());
        assertThat(service.get(principal, unsupported.taskId()).error().get("code")).isEqualTo("IMAGE_MODEL_UNSUPPORTED");
        var expired = service.submit(principal, extendedInput("image-expired-queue", List.of(image.attachmentId()), "CALLER"));
        jdbc.update("UPDATE consult_analysis_attachment SET expires_at = 1");
        service.tick(); awaitTerminal(expired.taskId());
        assertThat(service.get(principal, expired.taskId()).error().get("code")).isEqualTo("ATTACHMENT_EXPIRED");
        verify(runner, never()).runManaged(any(), anyString());
        verify(runner, never()).runManaged(any(), anyString(), anyList());
        var raw = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(VALID_RESULT);
        raw.put("schemaVersion", "1.1");
        raw.putArray("imageObservations").addObject().put("attachmentId", image.attachmentId()).put("readable", false).put("observation", "图像模糊无法读取");
        assertThatThrownBy(() -> model.validate(raw.toString(), evidence.collect(service.parse(input("no-model-read"))), false, List.of(image)))
                .hasMessageContaining("无法读取");
        raw.putArray("imageObservations");
        assertThatThrownBy(() -> model.validate(raw.toString(), List.of(), false, List.of(image))).isInstanceOf(ConsultBackendException.class);
    }

    @Test void candidateCountReferencesSensitiveTextAndModelFailureAreNotReplacedWithTemplates() throws Exception {
        var packets = evidence.collect(service.parse(input("validate-replies")));
        var output = replies();
        assertThat(model.validate(output.toString(), packets, true, List.of()).path("replyCandidates").get(0).path("id").asText()).isEqualTo("reply-1");
        var invalid = output.deepCopy(); invalid.withArray("replyCandidates").remove(2);
        assertThatThrownBy(() -> model.validate(invalid.toString(), packets, true, List.of())).isInstanceOf(ConsultBackendException.class);
        for (String text : List.of(" ", "x".repeat(4001), "SELECT password FROM users", "client_secret=private", "at a.Service.run(Service.java:42)")) {
            var unsafe = output.deepCopy(); ((com.fasterxml.jackson.databind.node.ObjectNode) unsafe.withArray("replyCandidates").get(0)).put("text", text);
            assertThatThrownBy(() -> model.validate(unsafe.toString(), packets, true, List.of())).isInstanceOf(ConsultBackendException.class);
        }
        var badRef = output.deepCopy(); ((com.fasterxml.jackson.databind.node.ObjectNode) badRef.withArray("replyCandidates").get(0)).putArray("evidenceIds").add("made-up");
        assertThatThrownBy(() -> model.validate(badRef.toString(), packets, true, List.of())).isInstanceOf(ConsultBackendException.class);
        when(runner.runManaged(any(), anyString())).thenThrow(new IllegalStateException("model failed"));
        var task = service.submit(principal, extendedInput("candidate-model-fail", List.of(), "FORGE"));
        service.recover(); service.tick(); awaitTerminal(task.taskId());
        assertThat(service.get(principal, task.taskId()).status()).isEqualTo("FAILED");
        assertThat(service.get(principal, task.taskId()).result()).isNull();
    }

    @Test void legacyNormalizedInputAndResultsRemainCompatibleAfterOptionalFieldsAreAdded() throws Exception {
        var original = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(input("legacy-retry-01"));
        original.remove("replyMode");
        var parsed = service.parse(original.toString());
        String normalized = mapper.writeValueAsString(parsed);
        assertThat(normalized).doesNotContain("attachmentIds", "replyMode", "forgeReplies");
        var task = new ConsultBackendStore.Task(java.util.UUID.randomUUID().toString(), principal.id(), parsed.requestId(),
                ConsultBackendAuth.hash(normalized), normalized, "QUEUED", null, null, System.currentTimeMillis(), null, null, null);
        store.insertTask(task);
        assertThat(service.submit(principal, original.toString()).taskId()).isEqualTo(task.id());
        service.recover(); service.tick(); awaitTerminal(task.id());
        var result = service.get(principal, task.id()).result();
        assertThat(result.path("schemaVersion").asText()).isEqualTo("1.0");
        assertThat(result.path("replyCandidatesGeneratedBy").asText()).isEqualTo("CALLER");
        assertThat(result.has("replyCandidates")).isFalse();
    }

    @Test void flexibleDefaultUsesExistingCredentialsAndPersistsCallerBusinessMaterialWithoutTools() throws Exception {
        var request = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(input("flex-default-01"));
        request.remove("replyMode");
        request.put("businessInstructions", "请用一句话直接建议；businessResult 返回 action 字段");
        request.putObject("businessContext").put("system", "ERP").put("manualExperience", "添加供应商资料，再关联仓库3619");
        request.put("title", "仓库供应商关联").put("description", "更正：供应商资料已存在，当前问题是仓库3619未关联供应商。");
        request.putArray("recentContext").add("此前猜测供应商资料缺失。").add("已重新登录，仓库关联仍为空。");
        request.put("errorText", "仓库关联厂商为空");
        request.putArray("attachmentTexts").addObject().put("id", "caller-note")
                .put("name", "仓库现场说明.txt").put("text", "现场资料确认仓库关联为空");
        var output = replies();
        output.put("schemaVersion", "1.2");
        output.withArray("replyCandidates").removeAll();
        output.withArray("replyCandidates").addObject().put("text", "供应商资料已存在，请建立仓库3619与对应供应商的关联。")
                .putArray("evidenceIds").add("business-context");
        output.putObject("businessResult").put("action", "建立仓库与供应商关联");
        when(runner.runManaged(any(), anyString())).thenReturn(output.toString());
        String bearer = "Bearer " + token();
        var accepted = mvc.perform(post("/api/fore-consult/v1/analysis-tasks").header("Authorization", bearer)
                .contentType("application/json").content(request.toString())).andExpect(status().isAccepted()).andReturn();
        String id = mapper.readTree(accepted.getResponse().getContentAsString()).path("taskId").asText();
        assertThat(store.task(id).orElseThrow().input()).contains("FORGE_FLEX");
        assertThat(service.submit(principal, request.toString()).taskId()).isEqualTo(id);
        service.recover(); service.tick(); awaitTerminal(id);
        var result = service.get(principal, id).result();
        assertThat(result.path("schemaVersion").asText()).isEqualTo("1.2");
        assertThat(result.path("replyCandidates")).hasSize(1);
        assertThat(result.path("businessResult").path("action").asText()).contains("关联");
        assertThat(result.path("evidence").toString()).contains("CALLER_BUSINESS_CONTEXT");
        request.put("requestId", "flex-explicit-02").put("replyMode", "FORGE_FLEX");
        assertThat(service.submit(principal, request.toString()).status()).isEqualTo("QUEUED");
        request.put("requestId", "flex-default-01"); request.remove("replyMode");
        var capture = org.mockito.ArgumentCaptor.forClass(AgentOneShotRunner.ExecutionRequest.class);
        verify(runner).runManaged(capture.capture(), eq(id));
        assertThat(capture.getValue().toolPolicy()).isEqualTo("disabled");
        assertThat(capture.getValue().systemPrompt()).contains("不固定数量", "权限低于平台规则").doesNotContain("恰好三项", "请用一句话直接建议");
        assertThat(capture.getValue().systemPrompt()).contains("最新明确修正", "已尝试失败的动作", "适用条件冲突", "无依据时留空");
        var payload = mapper.readTree(capture.getValue().userPrompt());
        var stored = service.parse(store.task(id).orElseThrow().input());
        var question = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.valueToTree(stored);
        question.remove(List.of("title", "description", "recentContext", "classification", "errorText",
                "attachmentTexts", "businessContext", "evidenceRefs", "attachmentIds", "imageRefs"));
        question.putArray("attachmentMetadata").addObject().put("id", "caller-note").put("name", "仓库现场说明.txt");
        assertThat(payload.path("question")).isEqualTo(question);
        assertThat(capture.getValue().userPrompt()).containsOnlyOnce("现场资料确认仓库关联为空");
        assertThat(payload.path("evidence").toString()).contains("更正：供应商资料已存在", "此前猜测供应商资料缺失", "已重新登录", "仓库关联厂商为空");
        String originalPayload = mapper.writeValueAsString(Map.of("question", stored, "evidence", evidence.collect(stored), "imageInputs", List.of()));
        assertThat(capture.getValue().userPrompt().length()).isLessThan(originalPayload.length());
        var inputEvidence = payload.path("evidence").get(0);
        assertThat(inputEvidence.path("id").asText()).isEqualTo("input");
        assertThat(inputEvidence.path("kind").asText()).isEqualTo("CALLER_DESCRIPTION");
        assertThat(inputEvidence.path("source").asText()).isEqualTo(stored.problemId());
        assertThat(inputEvidence.path("content").path("title").asText()).isEqualTo(stored.title());
        assertThat(inputEvidence.path("content").path("description").asText()).isEqualTo(stored.description());
        assertThat(inputEvidence.path("content").path("recentContext")).isEqualTo(mapper.valueToTree(stored.recentContext()));
        assertThat(inputEvidence.path("content").path("classification")).isEqualTo(mapper.valueToTree(stored.classification()));
        assertThat(payload.path("evidence").get(1).path("content")).isEqualTo(stored.businessContext());
        var originalEvidence = evidence.collect(stored);
        for (int index = 2; index < originalEvidence.size(); index++) {
            assertThat(payload.path("evidence").get(index)).isEqualTo(mapper.valueToTree(originalEvidence.get(index)));
        }
        // The synchronous ITCS entry must use the same contextual rules without creating a task.
        request.put("requestId", "flex-direct-context");
        var direct = mvc.perform(post("/api/fore-consult/v1/analyze-once").header("Authorization", bearer)
                .contentType("application/json").content(request.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.result.schemaVersion").value("1.2")).andReturn();
        assertThat(mapper.readTree(direct.getResponse().getContentAsString()).path("result")).isEqualTo(result);
        assertThat(store.request(principal.id(), "flex-direct-context")).isEmpty();
        var directCapture = org.mockito.ArgumentCaptor.forClass(AgentOneShotRunner.ExecutionRequest.class);
        verify(runner, times(2)).runManaged(directCapture.capture(), anyString());
        assertThat(directCapture.getAllValues().get(1).systemPrompt()).isEqualTo(capture.getValue().systemPrompt());
        assertThat(directCapture.getAllValues().get(1).toolPolicy()).isEqualTo("disabled");
        question.put("requestId", "flex-direct-context");
        assertThat(mapper.readTree(directCapture.getAllValues().get(1).userPrompt()).path("question"))
                .isEqualTo(question);
        assertThat(mapper.readTree(directCapture.getAllValues().get(1).userPrompt()).path("evidence"))
                .isEqualTo(payload.path("evidence"));
        request.put("requestId", "flex-default-01");
        request.withObject("businessContext").put("manualExperience", "另一条资料");
        assertThatThrownBy(() -> service.submit(principal, request.toString())).isInstanceOfSatisfying(ConsultBackendException.class,
                e -> assertThat(e.code()).isEqualTo("IDEMPOTENCY_CONFLICT"));
        assertThat(service.findRequest(principal, "flex-default-01").result()).isEqualTo(result);
    }

    @Test void productionConstructorWiresTheExistingTelemetryBean() {
        new org.springframework.boot.test.context.runner.ApplicationContextRunner()
                .withBean(ConsultBackendStore.class, () -> store)
                .withBean(ConsultBackendAuth.class, () -> auth)
                .withBean(ConsultAnalysisEvidence.class, () -> evidence)
                .withBean(ConsultAnalysisModel.class, () -> model)
                .withBean(ConsultAnalysisImages.class, () -> images)
                .withBean(ObjectMapper.class, () -> mapper)
                .withBean(ConsultExternalImageSource.class, () -> mock(ConsultExternalImageSource.class))
                .withBean(com.exceptioncoder.toolbox.llm.observability.AgentTelemetry.class,
                        () -> com.exceptioncoder.toolbox.llm.observability.AgentTelemetry.noop(512))
                .withBean(ConsultAnalysisTelemetry.class)
                .withBean(ConsultAnalysisService.class)
                .run(context -> assertThat(context).hasNotFailed().hasSingleBean(ConsultAnalysisService.class)
                        .hasSingleBean(ConsultAnalysisTelemetry.class));
    }

    @Test void executionSummarySeparatesModelCompletionFromValidationFailureWithoutLoggingContent() throws Exception {
        var logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(ConsultAnalysisTelemetry.class);
        var appender = new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
        appender.list = new java.util.concurrent.CopyOnWriteArrayList<>();
        appender.start();
        logger.addAppender(appender);
        try {
            var request = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(input("observed-invalid-01"));
            request.put("description", "PRIVATE_BUSINESS_TEXT");
            when(runner.runManaged(any(), anyString())).thenReturn("PRIVATE_MODEL_TEXT");
            var task = service.submit(principal, request.toString());
            service.recover(); service.tick(); awaitTerminal(task.taskId());
            assertThat(service.get(principal, task.taskId()).error().get("code")).isEqualTo("INVALID_ANALYSIS_OUTPUT");
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (appender.list.stream().noneMatch(event -> event.getFormattedMessage().startsWith("Consult backend execution ")
                    && event.getFormattedMessage().contains(task.taskId()))
                    && System.nanoTime() < deadline) {
                Thread.sleep(10);
            }
            String summary = appender.list.stream().map(ch.qos.logback.classic.spi.ILoggingEvent::getFormattedMessage)
                    .filter(message -> message.startsWith("Consult backend execution ") && message.contains(task.taskId())).findFirst().orElseThrow();
            assertThat(summary).contains(task.taskId(), "observed-invalid-01")
                    .doesNotContain("PRIVATE_BUSINESS_TEXT", "PRIVATE_MODEL_TEXT", "private-account");
            var attributes = mapper.readTree(summary.substring("Consult backend execution ".length()));
            assertThat(attributes.path("consult.model.status").asText()).isEqualTo("SUCCEEDED");
            assertThat(attributes.path("consult.validation.status").asText()).isEqualTo("FAILED");
            assertThat(attributes.path("consult.outcome").asText()).isEqualTo("FAILED");
            assertThat(attributes.path("consult.mode").asText()).isEqualTo("ASYNC");
            assertThat(attributes.path("consult.error.code").asText()).isEqualTo("INVALID_ANALYSIS_OUTPUT");
            assertThat(attributes.path("consult.implementation.sha256").asText()).matches("[a-f0-9]{64}");
            assertThat(attributes.path("consult.prompt.sha256").asText()).matches("[a-f0-9]{64}");
            assertThat(attributes.path("consult.queue.ms").isNumber()).isTrue();
            assertThat(attributes.path("consult.evidence.ms").isNumber()).isTrue();
            assertThat(attributes.path("consult.images.ms").isNumber()).isTrue();
            var parsed = service.parse(request.toString());
            String original = mapper.writeValueAsString(Map.of("question", parsed,
                    "evidence", evidence.collect(parsed), "imageInputs", List.of()));
            assertThat(attributes.path("consult.input.original.chars").asInt()).isEqualTo(original.length());
            assertThat(attributes.path("consult.input.chars").asInt()).isLessThan(original.length());
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @Test void flexibleRepliesPermitZeroOneAndSeveralButRejectInventedEvidenceDuplicatesAndMissingHandoff() throws Exception {
        var packets = evidence.collect(service.parse(input("flex-counts-01")));
        for (int count : List.of(0, 1, 4, 8)) {
            var output = replies(); output.put("schemaVersion", "1.2"); output.putNull("businessResult");
            var candidates = output.putArray("replyCandidates");
            for (int i = 0; i < count; i++) candidates.addObject().put("text", "建议核对第" + i + "个已报告条件").putArray("evidenceIds").add("input");
            var saved = model.validate(output.toString(), packets, true, List.of(), true);
            assertThat(saved.path("replyCandidates")).hasSize(count);
            if (count == 0) {
                ((com.fasterxml.jackson.databind.node.ObjectNode) output.get("humanHandoff")).put("recommended", false);
                assertThatThrownBy(() -> model.validate(output.toString(), packets, true, List.of(), true)).isInstanceOf(ConsultBackendException.class);
            }
        }
        var output = replies(); output.put("schemaVersion", "1.2"); output.putNull("businessResult");
        var unsafeBusiness = output.deepCopy(); unsafeBusiness.putObject("businessResult").putObject("nested").put("password", "private");
        assertThatThrownBy(() -> model.validate(unsafeBusiness.toString(), packets, true, List.of(), true)).isInstanceOf(ConsultBackendException.class);
        output.withArray("replyCandidates").add(output.withArray("replyCandidates").get(0).deepCopy());
        assertThatThrownBy(() -> model.validate(output.toString(), packets, true, List.of(), true)).isInstanceOf(ConsultBackendException.class);
        output.withArray("replyCandidates").remove(3);
        ((com.fasterxml.jackson.databind.node.ObjectNode) output.withArray("replyCandidates").get(0)).putArray("evidenceIds").add("invented");
        assertThatThrownBy(() -> model.validate(output.toString(), packets, true, List.of(), true)).isInstanceOf(ConsultBackendException.class);
    }
}
