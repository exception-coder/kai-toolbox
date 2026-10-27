package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultResourceAccess;
import com.exceptioncoder.toolbox.llm.spi.ConsultationHistoryReader;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultContextAuthorizationTest {
    @Test void aSignedHistoryToolCannotReadAnotherConsultation() {
        var access = new ConsultResourceAccess();
        var reader = mock(ConsultationHistoryReader.class);
        var controller = new ConsultContextController(access, mock(ConsultSessionRepository.class), reader);
        assertThatThrownBy(() -> controller.read("other-session", access.issue("own-session"), 0, 16000))
                .hasMessageContaining("签名无效");
        verifyNoInteractions(reader);
    }
}
