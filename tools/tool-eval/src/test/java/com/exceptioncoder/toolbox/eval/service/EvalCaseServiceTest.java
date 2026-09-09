package com.exceptioncoder.toolbox.eval.service;

import com.exceptioncoder.toolbox.common.eval.EvalSampleSource;
import com.exceptioncoder.toolbox.eval.domain.EvalCase;
import com.exceptioncoder.toolbox.eval.repository.EvalCaseRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EvalCaseServiceTest {

    @Test
    void movesExistingCaseFromSourceNamedDatasetToStableTargetWithoutOverwritingContent() {
        EvalCaseRepository repository = mock(EvalCaseRepository.class);
        EvalSampleSource source = source("bug-extraction-v1");
        EvalCase existing = EvalCase.builder()
                .id("case-1")
                .scenario("EXTRACTION")
                .dataset("fore-consult-bugs")
                .title("人工修订标题")
                .inputJson("{\"question\":\"人工修订输入\"}")
                .expectedJson("{\"isBug\":true}")
                .sourceRef("consult_bug:1")
                .enabled(true)
                .createdAt(1L)
                .updatedAt(1L)
                .build();
        when(repository.findBySourceRef("consult_bug:1")).thenReturn(Optional.of(existing));
        EvalCaseService service = new EvalCaseService(repository, new ObjectMapper(), List.of(source));

        EvalCaseService.HarvestResult result = service.harvest(source.id(), null, false);

        assertThat(result.dataset()).isEqualTo("bug-extraction-v1");
        assertThat(result.moved()).isEqualTo(1);
        assertThat(result.updated()).isZero();
        assertThat(result.skipped()).isZero();
        assertThat(existing.getDataset()).isEqualTo("bug-extraction-v1");
        assertThat(existing.getTitle()).isEqualTo("人工修订标题");
        verify(repository).update(existing);
    }

    @Test
    void sourceStatsExposeTargetDatasetAndTurnBoundary() {
        EvalCaseRepository repository = mock(EvalCaseRepository.class);
        EvalSampleSource source = source("bug-extraction-v1");
        when(repository.findDatasetsBySourceRefs(List.of("consult_bug:1"))).thenReturn(Map.of());
        EvalCaseService service = new EvalCaseService(repository, new ObjectMapper(), List.of(source));

        EvalCaseService.SourceStat stat = service.listSources().getFirst();

        assertThat(stat.targetDataset()).isEqualTo("bug-extraction-v1");
        assertThat(stat.sampleUnit()).isEqualTo("TURN");
        assertThat(stat.labelStrength()).isEqualTo("HUMAN_STRONG");
        assertThat(stat.pending()).isEqualTo(1);
    }

    private EvalSampleSource source(String targetDataset) {
        return new EvalSampleSource() {
            @Override
            public String id() {
                return "fore-consult-bugs";
            }

            @Override
            public String displayName() {
                return "已裁决缺陷";
            }

            @Override
            public String scenario() {
                return "EXTRACTION";
            }

            @Override
            public String targetDataset() {
                return targetDataset;
            }

            @Override
            public String sampleUnit() {
                return "TURN";
            }

            @Override
            public String labelStrength() {
                return "HUMAN_STRONG";
            }

            @Override
            public List<Sample> collect() {
                return List.of(new Sample("consult_bug:1", "来源标题", "{}", "{}", null, "[]"));
            }
        };
    }
}
