package com.regentech_fashion.supplierquote.infrastructure.erp;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LegacyScmPasswordVerifierTest {
    private final LegacyScmPasswordVerifier verifier = new LegacyScmPasswordVerifier();

    @Test
    void matchesScmSaltedMd5Format() {
        assertThat(verifier.matches("123456", "supplier-demo", "68039f4545ad17dab03f90c5f6b5b3e0"))
                .isTrue();
    }

    @Test
    void rejectsWrongPassword() {
        assertThat(verifier.matches("wrong", "supplier-demo", "68039f4545ad17dab03f90c5f6b5b3e0"))
                .isFalse();
    }
}
