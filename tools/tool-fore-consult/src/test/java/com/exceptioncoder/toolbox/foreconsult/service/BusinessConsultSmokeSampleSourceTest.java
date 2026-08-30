package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurn;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class BusinessConsultSmokeSampleSourceTest {

    @Test
    void exposesSixHistoricalQuestionsAsBusinessConsultSmokeCases() throws Exception {
        ConsultSessionRepository sessions = mock(ConsultSessionRepository.class);
        ConsultTurnRepository turns = mock(ConsultTurnRepository.class);
        when(sessions.findById(anyString())).thenAnswer(invocation -> Optional.of(ConsultSession.builder()
                .sessionId(invocation.getArgument(0))
                .systemName("yoooni")
                .systemSourcePath("D:/work/yoooni")
                .moduleNames("[\"订单管理\"]")
                .role("IT")
                .engine("codex")
                .build()));
        when(turns.findBySession(anyString())).thenAnswer(invocation -> List.of(ConsultTurn.builder()
                .sessionId(invocation.getArgument(0))
                .turnIndex(turnIndex(invocation.getArgument(0)))
                .question("一个完整的历史业务问题")
                .answer("历史回答")
                .build()));

        BusinessConsultSmokeSampleSource source =
                new BusinessConsultSmokeSampleSource(sessions, turns, new ObjectMapper());

        assertThat(source.collect()).hasSize(6).allSatisfy(sample -> {
            assertThat(sample.sourceRef()).startsWith("consult_smoke:");
            assertThat(sample.tags()).contains("pending-human-baseline");
            assertThat(new ObjectMapper().readTree(sample.inputJson()).path("sessionContext")
                    .path("sourcePath").asText()).isEqualTo("D:/work/yoooni");
        });
        assertThat(source.preview().id()).isEqualTo("business-consult-smoke-v1");
        assertThat(source.preview().cases()).hasSize(6).allSatisfy(testCase -> {
            assertThat(testCase.question()).isEqualTo("一个完整的历史业务问题");
            assertThat(testCase.status()).isEqualTo("READY");
            assertThat(testCase.coverage()).isNotBlank();
        });
    }

    private static int turnIndex(String sessionId) {
        return switch (sessionId) {
            case "cc749cd0-5e7b-4e19-9bb3-b1057403fd0b" -> 5;
            case "a40d9868-5d3b-44de-863d-87f07913355c" -> 8;
            default -> 1;
        };
    }
}
