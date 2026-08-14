package com.exceptioncoder.toolbox.system.update;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AutoUpdateCommandRunnerTest {

    @Test
    void redactsCredentialsAndTokensFromDiagnostics() {
        String sanitized = AutoUpdateCommandRunner.sanitize(
                "fatal https://alice:secret@example.test/repo?access_token=abc password=hunter2\n"
                        + "Authorization: Bearer secret-token");

        assertThat(sanitized)
                .doesNotContain("alice:secret")
                .doesNotContain("abc")
                .doesNotContain("hunter2")
                .doesNotContain("secret-token")
                .contains("access_token=***")
                .contains("password=***");
    }
}
