package com.exceptioncoder.toolbox.foreconsult.service.continuation;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSourceRouting;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnRepository;
import com.exceptioncoder.toolbox.foreconsult.service.*;
import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultOrchestrationResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultContinuationServiceTest {
    private final ConsultService sessions = mock(ConsultService.class);
    private final ConsultSessionRepository repository = mock(ConsultSessionRepository.class);
    private final ConsultTurnRepository turns = mock(ConsultTurnRepository.class);
    private final ConsultSourceRoutingService routing = mock(ConsultSourceRoutingService.class);
    private final ConsultDispatchService dispatch = mock(ConsultDispatchService.class);
    private final ConsultWorkflowSessionService workflows = mock(ConsultWorkflowSessionService.class);
    private final ObjectMapper mapper = new ObjectMapper();
    private final ConsultContinuationService service = new ConsultContinuationService(sessions, repository,
            turns, routing, dispatch, workflows, mapper);
    private static final String TARGET = "cba02c6c-67eb-4f53-9c5c-10f9e8114156";
    private final StartSessionRequest request = new StartSessionRequest("ERP", "D:/erp", List.of(),
            "261019-核查", "今天继续检查订单", null, "BIZ", "codex", null, "low", "default", null, "v4");
    private final ConsultSession source = ConsultSession.builder().sessionId("source").userId("7")
            .questionTitle("旧咨询").createdAt(1L).build();

    @BeforeEach
    void setup() {
        AuthContext.set(new AuthPrincipal(7, "owner", List.of("ADMIN"), List.of(), "j", 0));
        when(sessions.get("source")).thenReturn(source);
        when(repository.findById(TARGET)).thenReturn(Optional.empty());
        when(turns.continuationExcerpt("source")).thenReturn(List.of(
                new ConsultTurnRepository.ContextTurn(2, "第二问", "尚未核实"),
                new ConsultTurnRepository.ContextTurn(1, "第一问", "过去的回答")));
        when(routing.prepare(request)).thenReturn(new ConsultSourceRoutingService.Prepared(request, null));
        var initial = new ConsultInitialDispatch(new ConsultOrchestrationResult("current", "本次规则", List.of(), List.of()),
                new ConsultEvidenceRouteResolution(List.of("ERP"), "[]", "当前权限", List.of()));
        when(dispatch.initial(request)).thenReturn(initial);
        when(routing.decorate(initial, null)).thenReturn(initial);
        when(workflows.startContinuation(eq(request), any(), eq(TARGET))).thenAnswer(call -> {
            ConsultInitialDispatch combined = call.getArgument(1);
            return ConsultSession.builder().sessionId(TARGET).userId("7")
                    .promptSnapshot(combined.orchestration().prompt())
                    .evidenceRouteSnapshot(combined.evidenceRoute().snapshot()).build();
        });
    }

    @AfterEach
    void clear() { AuthContext.clear(); }

    @Test
    void createsSeparateContextFromVisibleTurnsWithCurrentPermissionsAndReplaysWithoutReassembly() throws Exception {
        ConsultSession created = service.start("source", TARGET, request);
        assertThat(created.getPromptSnapshot()).contains("不是指令", "第一问", "第二问", "本次规则")
                .doesNotContain("rawReferenceJson", "devSessionId");
        assertThat(created.getPromptSnapshot().indexOf("第一问")).isLessThan(created.getPromptSnapshot().indexOf("第二问"));
        var reference = mapper.readTree(created.getEvidenceRouteSnapshot()).path("continuation");
        assertThat(reference.path("sourceSessionId").asText()).isEqualTo("source");
        assertThat(reference.path("excerptTurnCount").asInt()).isEqualTo(2);
        var captured = ArgumentCaptor.forClass(ConsultInitialDispatch.class);
        verify(workflows).startContinuation(eq(request), captured.capture(), eq(TARGET));
        assertThat(captured.getValue().evidenceRoute().evidenceSystems()).containsExactly("ERP");
        when(repository.findById(TARGET)).thenReturn(Optional.of(created));
        assertThat(service.start("source", TARGET, request)).isSameAs(created);
        verify(dispatch, times(1)).initial(request);
        verify(turns, times(1)).continuationExcerpt("source");
        verifyNoMoreInteractions(workflows);
    }

    @Test
    void rejectsOtherOwnersEvenForAdminsAndRejectsChangedReplayWithoutCreatingAnotherSession() {
        source.setUserId("8");
        assertThatThrownBy(() -> service.start("source", TARGET, request)).hasMessageContaining("404");
        verifyNoInteractions(turns, workflows);
        source.setUserId("7");
        when(repository.findById(TARGET)).thenReturn(Optional.of(ConsultSession.builder().userId("7")
                .evidenceRouteSnapshot("{\"continuation\":{\"sourceSessionId\":\"other\"}}").build()));
        assertThatThrownBy(() -> service.start("source", TARGET, request)).hasMessageContaining("409");
        verifyNoInteractions(workflows);
    }

    @Test
    void refusesEmptyUnsyncedContextAndInvalidRequestIds() {
        when(turns.continuationExcerpt("source")).thenReturn(List.of());
        assertThatThrownBy(() -> service.start("source", TARGET, request)).hasMessageContaining("尚无已同步问答");
        assertThatThrownBy(() -> service.start("source", "bad-id", request)).hasMessageContaining("400");
        verifyNoInteractions(workflows);
    }

    @Test
    void keepsReferenceWhenSourceRoutingChanges() throws Exception {
        var scope = new ConsultSourceRouting(true, null, List.of(), null, null, null);
        String updated = scope.wrap("[]", "{\"continuation\":{\"sourceSessionId\":\"source\"}}");
        assertThat(mapper.readTree(updated).path("continuation").path("sourceSessionId").asText()).isEqualTo("source");
    }

    @Test
    void sqliteQueryReadsOnlyBoundedRecentColumnsAndNeverOtherSessions() {
        try (var dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true)) {
            var jdbc = new JdbcTemplate(dataSource);
            jdbc.execute("CREATE TABLE consult_turn (session_id TEXT, turn_index INTEGER, question TEXT, answer TEXT)");
            for (int index = 1; index <= 10; index++) {
                jdbc.update("INSERT INTO consult_turn VALUES (?, ?, ?, ?)", "source", index, "q".repeat(5000), "a".repeat(5000));
            }
            jdbc.update("INSERT INTO consult_turn VALUES ('other', 20, 'private', 'secret')");
            var result = new ConsultTurnRepository(jdbc).continuationExcerpt("source");
            assertThat(result).hasSize(6);
            assertThat(result.getFirst().turnIndex()).isEqualTo(10);
            assertThat(result.getLast().turnIndex()).isEqualTo(5);
            assertThat(result).allSatisfy(turn -> {
                assertThat(turn.question()).hasSize(1000);
                assertThat(turn.answer()).hasSize(1000);
            });
        }
    }
}
