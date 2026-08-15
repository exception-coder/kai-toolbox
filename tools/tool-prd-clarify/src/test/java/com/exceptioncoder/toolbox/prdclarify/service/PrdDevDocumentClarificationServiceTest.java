package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.api.dto.QaPairRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PrdDevDocumentClarificationServiceTest {

    @Test
    void questionLimitCompletesWithoutLoadingSessionOrCallingAgent() throws Exception {
        Fixture fixture = fixture();
        SseEmitter emitter = mock(SseEmitter.class);

        fixture.service.askNextQuestion(
                "session", PrdDevDocumentClarificationService.MAX_QUESTIONS,
                List.of(), null, "initial", emitter);

        verify(emitter, org.mockito.Mockito.times(2)).send(any(SseEmitter.SseEventBuilder.class));
        verify(emitter).complete();
        verify(fixture.repository, never()).findById(anyString());
        verify(fixture.runner, never()).stream(
                anyString(), anyString(), any(), anyString(), any());
    }

    @Test
    void batchNormalizesUntrustedOutputBeforePersistingQuestions() throws Exception {
        Fixture fixture = fixture();
        prepareInitialContext(fixture);
        String response = """
                ```json
                [" 事务怎么处理？ ",{"question":"事务怎么处理？"},{"question":""},
                 {"question":"问题2"},{"question":"问题3"},{"question":"问题4"},
                 {"question":"问题5"},{"question":"问题6"}]
                ```
                """;
        streamResponse(fixture.runner, response);

        fixture.service.generateQuestions("session", "保持兼容", "initial", false, mock(SseEmitter.class));

        String expected = """
                [{"id":1,"question":"事务怎么处理？","answer":""},
                 {"id":2,"question":"问题2","answer":""},
                 {"id":3,"question":"问题3","answer":""},
                 {"id":4,"question":"问题4","answer":""},
                 {"id":5,"question":"问题5","answer":""}]
                """.replaceAll("\\s+", "");
        verify(fixture.repository, timeout(3000)).updateDevDocQaDraft("session", expected);
        verify(fixture.repository, timeout(3000))
                .updateDevDocWorkStatus("session", "AWAITING_ANSWERS", null);
        verify(fixture.repository, timeout(3000)).updateDevDocQuestionsGeneratedAt(eq("session"), any(Long.class));
    }

    @Test
    void invalidBatchOutputMovesWorkStatusToError() throws Exception {
        Fixture fixture = fixture();
        prepareInitialContext(fixture);
        streamResponse(fixture.runner, "not-json");

        fixture.service.generateQuestions("session", null, "initial", false, mock(SseEmitter.class));

        verify(fixture.repository, timeout(3000))
                .updateDevDocWorkStatus(eq("session"), eq("ERROR"), anyString());
        verify(fixture.repository, never())
                .updateDevDocWorkStatus("session", "AWAITING_ANSWERS", null);
    }

    @Test
    void updateModeRejectsMissingCurrentTddBeforeAgentCall() throws Exception {
        Fixture fixture = fixture();
        prepareInitialContext(fixture);
        when(fixture.devDocumentService.readContent("session")).thenReturn("");

        fixture.service.generateQuestions("session", "更新接口", "update", false, mock(SseEmitter.class));

        verify(fixture.repository, timeout(3000)).updateDevDocWorkStatus(
                "session", "ERROR", "当前 TDD 内容为空，无法执行增量更新澄清");
        verify(fixture.runner, never()).stream(
                anyString(), anyString(), any(), anyString(), any());
    }

    @Test
    void progressiveQuestionIncludesKnownContextAndHistory() throws Exception {
        Fixture fixture = fixture();
        prepareInitialContext(fixture);
        when(fixture.graphifyQuery.query("kai-toolbox", "PRD", "订单需求"))
                .thenReturn("代码事实");
        when(fixture.domainKnowledgeQuery.query("kai-toolbox", "订单需求"))
                .thenReturn("业务事实");
        streamResponse(fixture.runner, "事务边界如何选择？");

        fixture.service.askNextQuestion("session", 1,
                List.of(new QaPairRequest("是否兼容旧接口？", "是")),
                "不改 API", "initial", mock(SseEmitter.class));

        org.mockito.ArgumentCaptor<String> prompt = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(fixture.runner, timeout(3000)).stream(
                anyString(), prompt.capture(), eq("gpt-5"), eq("codex"), any());
        assertThat(prompt.getValue())
                .contains("正式 PRD", "代码事实", "业务事实", "不改 API", "是否兼容旧接口？", "是")
                .contains("这是第 2 个问题");
    }

    @Test
    void oldFacadeDelegatesBothClarificationOperations() {
        PrdDevDocumentClarificationService clarificationService =
                mock(PrdDevDocumentClarificationService.class);
        SseEmitter emitter = mock(SseEmitter.class);
        List<QaPairRequest> history = List.of(new QaPairRequest("q", "a"));
        PrdClarifyService facade = new PrdClarifyService(
                mock(AgentOneShotRunner.class), mock(PrdSessionRepository.class), mock(PrdFileStore.class),
                mock(PrdArtifactService.class), new ObjectMapper(), mock(GraphifyQueryService.class),
                mock(DomainKnowledgeQueryService.class), mock(PrdImageInputResolver.class),
                mock(PrdEffortEstimationService.class), mock(PrdRequirementSplitService.class),
                mock(PrdProgressEvaluationService.class), mock(PrdDocRevisionService.class),
                mock(PrdDevDocumentService.class), clarificationService);

        facade.askNextDevDocQuestion("session", 2, history, "notes", "update", emitter);
        facade.generateDevDocQuestions("session", "notes", "update", true, emitter);

        verify(clarificationService).askNextQuestion(
                "session", 2, history, "notes", "update", emitter);
        verify(clarificationService).generateQuestions(
                "session", "notes", "update", true, emitter);
    }

    private static void prepareInitialContext(Fixture fixture) throws Exception {
        when(fixture.repository.findById("session")).thenReturn(Optional.of(session()));
        when(fixture.fileStore.read("session")).thenReturn("正式 PRD");
    }

    private static void streamResponse(AgentOneShotRunner runner, String response) {
        doAnswer(invocation -> {
            Consumer<String> onDelta = invocation.getArgument(4);
            onDelta.accept(response);
            return response;
        }).when(runner).stream(anyString(), anyString(), any(), anyString(), any());
    }

    private static Fixture fixture() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdSessionRepository repository = mock(PrdSessionRepository.class);
        PrdFileStore fileStore = mock(PrdFileStore.class);
        PrdDevDocumentService devDocumentService = mock(PrdDevDocumentService.class);
        GraphifyQueryService graphifyQuery = mock(GraphifyQueryService.class);
        DomainKnowledgeQueryService domainKnowledgeQuery = mock(DomainKnowledgeQueryService.class);
        PrdDevDocumentClarificationService service = new PrdDevDocumentClarificationService(
                runner, repository, fileStore, devDocumentService, new ObjectMapper(),
                graphifyQuery, domainKnowledgeQuery);
        return new Fixture(runner, repository, fileStore, devDocumentService,
                graphifyQuery, domainKnowledgeQuery, service);
    }

    private static PrdSession session() {
        return PrdSession.builder()
                .id("session")
                .title("订单需求")
                .project("kai-toolbox")
                .module("PRD")
                .model("gpt-5")
                .engine("codex")
                .build();
    }

    private record Fixture(
            AgentOneShotRunner runner,
            PrdSessionRepository repository,
            PrdFileStore fileStore,
            PrdDevDocumentService devDocumentService,
            GraphifyQueryService graphifyQuery,
            DomainKnowledgeQueryService domainKnowledgeQuery,
            PrdDevDocumentClarificationService service
    ) {
    }
}
