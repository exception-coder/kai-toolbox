package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdAiRunStatus;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptDefinition;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptPurpose;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdAiRunRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static com.exceptioncoder.toolbox.prdclarify.repository.PrdAiRunRepositoryTest.createAiRunTable;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PrdAiRunServiceTest {

    private PrdAiRunRepository repository;
    private PrdAiRunService service;

    @BeforeEach
    void setUp() {
        JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        createAiRunTable(jdbc);
        repository = new PrdAiRunRepository(jdbc);
        service = new PrdAiRunService(repository);
    }

    @Test
    void recordsOnlyFingerprintsAndCompletesSuccessfulRun() {
        PrdAiRunService.RunHandle handle = service.begin(
                prompt(), "sensitive user input",
                new PrdAiRunService.RunContext("session-1", "codex", "gpt-5.6"));

        service.succeed(handle, "sensitive model output");
        service.bindCandidate(java.util.List.of(handle.id()), "candidate-1");

        assertThat(repository.findById(handle.id())).get().satisfies(saved -> {
            assertThat(saved.status()).isEqualTo(PrdAiRunStatus.SUCCEEDED);
            assertThat(saved.inputFingerprint()).hasSize(64).doesNotContain("sensitive");
            assertThat(saved.outputSha256()).hasSize(64).doesNotContain("sensitive");
            assertThat(saved.promptVersion()).isEqualTo("v1");
            assertThat(saved.candidateId()).isEqualTo("candidate-1");
        });
    }

    @Test
    void recordsContractFailureAndRejectsSecondCompletion() {
        PrdAiRunService.RunHandle handle = service.begin(prompt(), "input", PrdAiRunService.RunContext.empty());

        service.fail(handle, "invalid-json", "x".repeat(700));

        assertThat(repository.findById(handle.id())).get().satisfies(saved -> {
            assertThat(saved.status()).isEqualTo(PrdAiRunStatus.FAILED);
            assertThat(saved.lastError()).hasSize(500);
            assertThat(saved.outputSha256()).hasSize(64);
        });
        assertThatThrownBy(() -> service.succeed(handle, "late output"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("已结束");
    }

    private PrdPromptDefinition prompt() {
        return new PrdPromptDefinition(
                PrdPromptPurpose.DOC_CHANGE_ANALYZER, "v1", "system", "prompt-sha");
    }
}
