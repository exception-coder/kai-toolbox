package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurn;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnExtractionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnRepository;
import com.exceptioncoder.toolbox.llm.spi.BugExtractionRunner;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 进行中轮次与归档轮次的 BUG 抽取边界测试。 */
class TurnBugExtractionServiceTest {

    @Test
    void ongoingSyncDoesNotExtractLatestTurn() {
        Fixture fixture = fixture(List.of(turn(1, "question-1", "answer-1")));

        fixture.service().extractCompletedTurnsAsync("session-1", "model-1");

        verify(fixture.turnRepo(), timeout(1_000)).findBySession("session-1");
        verify(fixture.extractionService(), never()).extract(any(), any(), any(), any());
        verify(fixture.extractionRepo(), never()).upsert(any());
    }

    @Test
    void ongoingSyncExtractsOnlyTurnsBeforeLatest() {
        Fixture fixture = fixture(List.of(
                turn(1, "question-1", "answer-1"),
                turn(2, "question-2", "answer-2")));

        fixture.service().extractCompletedTurnsAsync("session-1", "model-1");

        verify(fixture.extractionService(), timeout(1_000))
                .extract("question-1", "answer-1", "model-1", null);
        verify(fixture.extractionService(), after(200).never())
                .extract(eq("question-2"), eq("answer-2"), eq("model-1"), isNull());
    }

    @Test
    void archivedSessionStillExtractsLatestTurn() {
        Fixture fixture = fixture(List.of(turn(1, "question-1", "answer-1")));

        TurnBugExtractionService.Summary summary =
                fixture.service().extractSession("session-1", "model-1", false);

        assertThat(summary.extracted()).isEqualTo(1);
        verify(fixture.extractionService())
                .extract("question-1", "answer-1", "model-1", null);
        verify(fixture.extractionRepo()).upsert(any());
    }

    private static Fixture fixture(List<ConsultTurn> turns) {
        ConsultTurnRepository turnRepo = mock(ConsultTurnRepository.class);
        ConsultTurnExtractionRepository extractionRepo = mock(ConsultTurnExtractionRepository.class);
        BugExtractionService extractionService = mock(BugExtractionService.class);
        BugService bugService = mock(BugService.class);
        when(turnRepo.findBySession("session-1")).thenReturn(turns);
        when(extractionRepo.find(any(), any(Integer.class))).thenReturn(java.util.Optional.empty());
        when(extractionService.extract(any(), any(), any(), any())).thenReturn(notBugResult());
        return new Fixture(
                new TurnBugExtractionService(turnRepo, extractionRepo, extractionService, bugService),
                turnRepo, extractionRepo, extractionService);
    }

    private static ConsultTurn turn(int index, String question, String answer) {
        return ConsultTurn.builder()
                .sessionId("session-1")
                .turnIndex(index)
                .question(question)
                .answer(answer)
                .build();
    }

    private static BugExtractionRunner.Result notBugResult() {
        return new BugExtractionRunner.Result(
                new BugExtractionRunner.Extracted(
                        false, null, null, null, null, null, null, null, null, null, null),
                "{}", 1, 1L);
    }

    private record Fixture(TurnBugExtractionService service,
                           ConsultTurnRepository turnRepo,
                           ConsultTurnExtractionRepository extractionRepo,
                           BugExtractionService extractionService) {
    }
}
