package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientErrorCode;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SessionClientApiExceptionHandlerTest {

    private final SessionClientApiExceptionHandler handler = new SessionClientApiExceptionHandler();

    @Test
    void mapsEveryPublicErrorCodeToStableStatusAndRetryability() {
        Map<SessionClientErrorCode, HttpStatus> expected = Map.ofEntries(
                Map.entry(SessionClientErrorCode.AUTHENTICATION_REQUIRED, HttpStatus.UNAUTHORIZED),
                Map.entry(SessionClientErrorCode.INVITATION_INVALID, HttpStatus.UNAUTHORIZED),
                Map.entry(SessionClientErrorCode.CONNECTION_TICKET_INVALID, HttpStatus.UNAUTHORIZED),
                Map.entry(SessionClientErrorCode.GRANT_REVOKED, HttpStatus.GONE),
                Map.entry(SessionClientErrorCode.GRANT_EXPIRED, HttpStatus.GONE),
                Map.entry(SessionClientErrorCode.GRANT_PAUSED, HttpStatus.LOCKED),
                Map.entry(SessionClientErrorCode.SESSION_VERSION_CONFLICT, HttpStatus.CONFLICT),
                Map.entry(SessionClientErrorCode.LIMIT_EXCEEDED, HttpStatus.TOO_MANY_REQUESTS),
                Map.entry(SessionClientErrorCode.COMMAND_UNSUPPORTED, HttpStatus.BAD_REQUEST),
                Map.entry(SessionClientErrorCode.INVALID_INPUT, HttpStatus.BAD_REQUEST),
                Map.entry(SessionClientErrorCode.REPLAY_GAP, HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE),
                Map.entry(SessionClientErrorCode.HOST_OFFLINE, HttpStatus.SERVICE_UNAVAILABLE),
                Map.entry(SessionClientErrorCode.SERVER_ERROR, HttpStatus.SERVICE_UNAVAILABLE));

        for (Map.Entry<SessionClientErrorCode, HttpStatus> entry : expected.entrySet()) {
            var response = handler.handleGrantError(new SessionGrantException(entry.getKey(), "safe message"));
            assertThat(response.getStatusCode()).isEqualTo(entry.getValue());
            assertThat(response.getBody()).isNotNull();
            assertThat(response.getBody().code()).isEqualTo(entry.getKey().name());
            assertThat(response.getBody().retryable()).isEqualTo(entry.getKey().retryable());
            assertThat(response.getBody().message()).isEqualTo("safe message");
        }
    }
}
