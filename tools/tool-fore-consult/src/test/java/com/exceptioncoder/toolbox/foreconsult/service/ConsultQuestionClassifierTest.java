package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.ClassifyQuestionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurn;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnRepository;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ConsultQuestionClassifierTest {

    @Test
    void timeoutFallsBackToFollowUpAndInterruptsRunner() throws Exception {
        ConsultSessionRepository sessionRepo = mock(ConsultSessionRepository.class);
        ConsultTurnRepository turnRepo = mock(ConsultTurnRepository.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<AgentOneShotRunner> runnerProvider = mock(ObjectProvider.class);
        CountDownLatch interrupted = new CountDownLatch(1);
        AgentOneShotRunner runner = new AgentOneShotRunner() {
            @Override
            public String stream(String systemPrompt, String userPrompt, String model, String engine,
                                 Consumer<String> onDelta) {
                return runOnce(systemPrompt, userPrompt, model, engine);
            }

            @Override
            public String runOnce(String systemPrompt, String userPrompt, String model, String engine) {
                try {
                    Thread.sleep(60_000);
                    return "";
                } catch (InterruptedException e) {
                    interrupted.countDown();
                    Thread.currentThread().interrupt();
                    throw new RuntimeException(e);
                }
            }
        };
        when(runnerProvider.getIfAvailable()).thenReturn(runner);
        when(sessionRepo.findById("session-1")).thenReturn(Optional.of(
                ConsultSession.builder().sessionId("session-1").userId("7").build()));
        when(turnRepo.findBySession("session-1")).thenReturn(List.of(
                ConsultTurn.builder().question("首个问题").build()));
        ConsultQuestionClassifier classifier = new ConsultQuestionClassifier(
                runnerProvider, sessionRepo, turnRepo, new ObjectMapper(), 100);

        long startedAt = System.nanoTime();
        var result = classifier.classify(
                "session-1", new ClassifyQuestionRequest("继续追问", "首个问题"));
        long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);

        assertThat(result.classification()).isEqualTo("FOLLOW_UP");
        assertThat(result.reason()).contains("超时");
        assertThat(elapsedMs).isLessThan(1_000);
        assertThat(interrupted.await(1, TimeUnit.SECONDS)).isTrue();
    }
}
