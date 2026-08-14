package com.exceptioncoder.toolbox.common.launchintent.api;

import com.exceptioncoder.toolbox.common.launchintent.service.LaunchIntentService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class LaunchIntentControllerTest {

    private final LaunchIntentService service = mock(LaunchIntentService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final LaunchIntentController controller = new LaunchIntentController(service, objectMapper);

    @Test
    void shouldRejectMalformedPayloadBeforePersistence() throws Exception {
        var request = new LaunchIntentController.CreateLaunchIntentRequest(
                1, "CHAT_OPEN_AND_SEND", objectMapper.readTree("{\"cwd\":\"D:/repo\",\"seed\":\"执行\"}"));

        assertThatThrownBy(() -> controller.create(request))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(400));
        verifyNoInteractions(service);
    }

    @Test
    void shouldRejectUnsupportedPanel() throws Exception {
        var request = new LaunchIntentController.CreateLaunchIntentRequest(
                1, "CHAT_OPEN_PANEL", objectMapper.readTree("{\"panel\":\"shell-admin\"}"));

        assertThatThrownBy(() -> controller.create(request))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(service);
    }
}
