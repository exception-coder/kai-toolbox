package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpenSpecBoardJsonAdapterTest {

    private final OpenSpecBoardJsonAdapter adapter = new OpenSpecBoardJsonAdapter(new ObjectMapper());

    @Test
    void acceptsCurrentAndLegacyListShapes() {
        assertThat(adapter.changes("{\"version\":\"1.6.0\",\"changes\":[{\"name\":\"board\"}]}"))
                .singleElement().satisfies(change -> assertThat(change.path("name").asText()).isEqualTo("board"));
        assertThat(adapter.changes("{\"changes\":[]}")) .isEmpty();
    }

    @Test
    void rejectsMalformedPartialAndUnsupportedOutput() {
        assertThatThrownBy(() -> adapter.changes("not-json")).hasMessageContaining("JSON 无法解析");
        assertThatThrownBy(() -> adapter.changes("{}")) .hasMessageContaining("changes 数组");
        assertThatThrownBy(() -> adapter.apply("{\"tasks\":[]}")) .hasMessageContaining("progress 对象");
        assertThatThrownBy(() -> adapter.status("{\"artifactPaths\":[]}"))
                .hasMessageContaining("artifactPaths 对象");
        assertThatThrownBy(() -> adapter.context("{\"version\":\"2.0.0\"}"))
                .hasMessageContaining("不支持的 CLI 版本");
    }
}
