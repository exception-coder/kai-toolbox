package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ReviewTokenCipherTest {
    private final ReviewTokenCipher cipher =
            new ReviewTokenCipher("test-secret-for-review-links-at-least-32-bytes");

    @Test
    void encryptsWithRandomNonceAndDecryptsOriginalToken() {
        String first = cipher.encrypt("original-token");
        String second = cipher.encrypt("original-token");

        assertThat(first).isNotEqualTo(second);
        assertThat(cipher.decrypt(first)).contains("original-token");
        assertThat(cipher.decrypt(second)).contains("original-token");
    }

    @Test
    void rejectsTamperedCiphertext() {
        String encrypted = cipher.encrypt("original-token");
        String tampered = encrypted.substring(0, encrypted.length() - 1) + "A";

        assertThat(cipher.decrypt(tampered)).isEmpty();
    }
}
