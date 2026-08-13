package com.exceptioncoder.toolbox.ops.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class RedisKeyPatternPolicyTest {

    @Test
    void normalizesWhitespaceAndDuplicatesWithoutChangingOrder() {
        List<String> patterns = RedisKeyPatternPolicy.normalize(List.of(
                " system_menu:* ",
                "menu_role_ids:*",
                "system_menu:*"
        ));

        assertThat(patterns).containsExactly("system_menu:*", "menu_role_ids:*");
    }

    @Test
    void rejectsBroadOrEmbeddedWildcardPatterns() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> RedisKeyPatternPolicy.normalize(List.of("*")));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> RedisKeyPatternPolicy.normalize(List.of("system_*:menu")));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> RedisKeyPatternPolicy.normalize(List.of("menu_role_ids:?")));
    }

    @Test
    void rejectsEmptyAndOversizedPatternLists() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> RedisKeyPatternPolicy.normalize(List.of()));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> RedisKeyPatternPolicy.normalize(List.of(
                        "key01:*", "key02:*", "key03:*", "key04:*", "key05:*", "key06:*",
                        "key07:*", "key08:*", "key09:*", "key10:*", "key11:*"
                )));
    }
}

