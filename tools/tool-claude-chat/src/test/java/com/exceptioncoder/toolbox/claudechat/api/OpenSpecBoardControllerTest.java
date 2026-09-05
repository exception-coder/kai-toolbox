package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.OpenSpecBoardService;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class OpenSpecBoardControllerTest {

    @Test
    void forwardsRefreshIntentToReadModel() {
        OpenSpecBoardService service = mock(OpenSpecBoardService.class);
        OpenSpecBoardController controller = new OpenSpecBoardController(service);

        controller.boards(true);
        controller.change("project", "change", true);

        verify(service).boards(true);
        verify(service).change("project", "change", true);
    }
}
