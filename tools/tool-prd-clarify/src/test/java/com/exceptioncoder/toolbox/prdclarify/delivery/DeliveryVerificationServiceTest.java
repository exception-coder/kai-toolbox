package com.exceptioncoder.toolbox.prdclarify.delivery;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class DeliveryVerificationServiceTest {

    @Test
    void resolvesWindowsCommandEntrypointWithoutInvokingShell() {
        assumeTrue(System.getProperty("os.name", "").toLowerCase().contains("win"));

        assertThat(DeliveryVerificationService.platformArgv(List.of("npm", "--version")))
                .containsExactly("npm.cmd", "--version");
    }
}
