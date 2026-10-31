package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewTodo;
import com.exceptioncoder.toolbox.claudechat.service.ReviewTodoService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReviewTodoControllerTest {
    @Test
    void publicProgressDoesNotExposeDeveloperEditsOrInternalExecutionIdentity() throws Exception {
        var service = mock(ReviewTodoService.class);
        when(service.publicList("token")).thenReturn(List.of(new ReviewTodo("todo", "space", "private-source",
                "feedback", "requirement", 2, 3, "开发侧调整标题", "私有执行正文", "EXCEPTION", "private-message",
                "内部诊断", 1, 2)));
        String json = new ObjectMapper().writeValueAsString(new ReviewTodoController(service).publicTasks("token"));
        assertThat(json).contains("requirement", "EXCEPTION", "sourceRevision")
                .doesNotContain("开发侧调整", "私有执行正文", "private-source", "private-message", "内部诊断", "note", "content");
    }
}
