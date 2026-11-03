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
        mvc = MockMvcBuilders.standaloneSetup(new ConsultBackendController(auth, service, images), new ConsultBackendAdminController(auth, mapper))
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
                List.of("erp"), null, List.of(), List.of(new ConsultAnalysisInput.EvidenceRef("erp", "Print.java", 1, 3)), List.of(), null).validated();
        assertThat(evidence.collect(withRef)).anyMatch(p -> p.kind().equals("SERVER_SOURCE") && p.text().contains("class Print"));
        var malicious = new ConsultAnalysisInput(withRef.agentId(), withRef.tenantId(), withRef.problemId(), withRef.conversationId(), withRef.requestId(), withRef.title(), withRef.description(), List.of(), null,
                List.of("erp"), null, List.of(), List.of(new ConsultAnalysisInput.EvidenceRef("erp", "../outside.java", 1, 1)), List.of(), null).validated();
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
        var protectedMvc = MockMvcBuilders.standaloneSetup(new ConsultBackendController(auth, service, images), new ConsultBackendAdminController(auth, mapper))
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
        jdbc.update("UPDATE consult_analysis_attachment SET byte_size = ?", 25 * 1024 * 1024);
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
        var parsed = service.parse(input("legacy-retry-01"));
        String normalized = mapper.writeValueAsString(parsed);
        assertThat(normalized).doesNotContain("attachmentIds", "replyMode", "forgeReplies");
        var task = new ConsultBackendStore.Task(java.util.UUID.randomUUID().toString(), principal.id(), parsed.requestId(),
                ConsultBackendAuth.hash(normalized), normalized, "QUEUED", null, null, System.currentTimeMillis(), null, null, null);
        store.insertTask(task);
        assertThat(service.submit(principal, input("legacy-retry-01")).taskId()).isEqualTo(task.id());
        service.recover(); service.tick(); awaitTerminal(task.id());
        var result = service.get(principal, task.id()).result();
        assertThat(result.path("schemaVersion").asText()).isEqualTo("1.0");
        assertThat(result.path("replyCandidatesGeneratedBy").asText()).isEqualTo("CALLER");
        assertThat(result.has("replyCandidates")).isFalse();
    }
}
