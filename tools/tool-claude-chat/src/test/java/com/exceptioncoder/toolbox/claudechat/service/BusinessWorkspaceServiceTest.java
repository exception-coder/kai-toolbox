package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BusinessWorkspaceServiceTest {

    @Test
    void protectsRepositoriesWithLocalRiskAndAllowsOnlySafeFastForward() {
        assertState("REMOTE_MISMATCH", false,
                BusinessWorkspaceService.classify(false, false, "master", "origin/master", 0, 0, null));
        assertState("DIRTY", false,
                BusinessWorkspaceService.classify(true, true, "master", "origin/master", 0, 1, null));
        assertState("DIVERGED", false,
                BusinessWorkspaceService.classify(true, false, "master", "origin/master", 1, 1, null));
        assertState("AHEAD", false,
                BusinessWorkspaceService.classify(true, false, "master", "origin/master", 1, 0, null));
        assertState("BEHIND", true,
                BusinessWorkspaceService.classify(true, false, "master", "origin/master", 0, 2, null));
        assertState("READY", true,
                BusinessWorkspaceService.classify(true, false, "master", "origin/master", 0, 0, null));
    }

    @Test
    void normalizesEquivalentGitRemoteForms() {
        assertThat(BusinessWorkspaceService.sameGitRemote(
                "https://gitee.com/wyoooni/SCM", "https://gitee.com/wyoooni/SCM.git")).isTrue();
    }

    private static void assertState(String status, boolean syncable,
                                    BusinessWorkspaceService.RepositoryState state) {
        assertThat(state.status()).isEqualTo(status);
        assertThat(state.syncable()).isEqualTo(syncable);
    }
}
