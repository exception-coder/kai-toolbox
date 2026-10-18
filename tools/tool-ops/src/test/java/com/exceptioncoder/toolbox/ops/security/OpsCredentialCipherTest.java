package com.exceptioncoder.toolbox.ops.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;

class OpsCredentialCipherTest {
    @TempDir Path temp;

    @Test void encryptsWithRandomNonceAndRecoversAcrossInstances() throws Exception {
        Path key = temp.resolve("private/ops.key");
        var cipher = new OpsCredentialCipher(key.toString());
        String first = cipher.encrypt("test-secret-123"), second = cipher.encrypt("test-secret-123");
        assertThat(first).startsWith("forge-ops:v1:").doesNotContain("test-secret").isNotEqualTo(second);
        assertThat(new OpsCredentialCipher(key.toString()).decrypt(first)).isEqualTo("test-secret-123");
        assertThat(Files.size(key)).isEqualTo(32);
        assertThat(cipher.decrypt("legacy")).isEqualTo("legacy");
        assertThat(cipher.decrypt(null)).isNull();
        assertThat(cipher.fingerprint("request")).isEqualTo(cipher.fingerprint("request"));
    }

    @Test void refusesLostCorruptOrWrongKeyWithoutCreatingAReplacement() throws Exception {
        Path key = temp.resolve("ops.key");
        var cipher = new OpsCredentialCipher(key.toString());
        String encrypted = cipher.encrypt("sensitive");
        Files.delete(key);
        assertThatThrownBy(() -> cipher.decrypt(encrypted)).hasMessageContaining("恢复原");
        assertThat(key).doesNotExist();
        Files.write(key, new byte[32]);
        assertThatThrownBy(() -> cipher.decrypt(encrypted)).hasMessageNotContaining("sensitive");
        Files.write(key, new byte[5]);
        assertThatThrownBy(() -> cipher.encrypt("next-sensitive")).hasMessageNotContaining("next-sensitive");
    }
}
