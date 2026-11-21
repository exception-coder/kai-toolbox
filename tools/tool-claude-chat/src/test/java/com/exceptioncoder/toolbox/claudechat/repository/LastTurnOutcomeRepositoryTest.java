package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.api.dto.TurnFailure;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import static org.assertj.core.api.Assertions.assertThat;

class LastTurnOutcomeRepositoryTest {
    @Test
    void restoresFailureAndRejectsLateOrDuplicateResults() {
        var source = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        try {
            new ResourceDatabasePopulator(new ClassPathResource("db/claude-chat-schema.sql"),
                    new ClassPathResource("db/claude-chat-last-outcome-schema.sql")).execute(source);
            var jdbc = new JdbcTemplate(source);
            jdbc.update("INSERT INTO claude_chat_session(id,cwd,status,started_at,last_seen_at) VALUES('s','.','IDLE',1,1)");
            var outcomes = new LastTurnOutcomeRepository(jdbc);
            outcomes.begin("s", "first");
            outcomes.finish("s", "first", new TurnFailure("network", "CONNECTION_FAILED"));
            assertThat(new LastTurnOutcomeRepository(jdbc).failure("s").orElseThrow().failure().category()).isEqualTo("network");
            outcomes.finish("s", "first", null);
            assertThat(outcomes.failure("s")).isPresent();
            outcomes.begin("s", "second");
            outcomes.finish("s", "first", new TurnFailure("unknown", null));
            assertThat(outcomes.failure("s")).isEmpty();
            outcomes.finish("s", "second", null);
            assertThat(outcomes.failure("s")).isEmpty();
            assertThat(outcomes.failure("other")).isEmpty();
        } finally {
            source.destroy();
        }
    }
}
