package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientErrorCode;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;

/** 将会话委托领域拒绝映射为稳定且不泄漏资源存在性的公共错误。 */
@RestControllerAdvice(assignableTypes = {SessionDelegationController.class, SessionClientController.class,
        SessionClientRelayController.class})
public class SessionClientApiExceptionHandler {

    /**
     * 映射领域错误。
     *
     * @param error 委托领域异常
     * @return 稳定公共错误
     */
    @ExceptionHandler(SessionGrantException.class)
    public ResponseEntity<ErrorView> handleGrantError(SessionGrantException error) {
        HttpStatus status = switch (error.code()) {
            case AUTHENTICATION_REQUIRED, INVITATION_INVALID, CONNECTION_TICKET_INVALID -> HttpStatus.UNAUTHORIZED;
            case GRANT_REVOKED, GRANT_EXPIRED -> HttpStatus.GONE;
            case GRANT_PAUSED -> HttpStatus.LOCKED;
            case SESSION_VERSION_CONFLICT -> HttpStatus.CONFLICT;
            case LIMIT_EXCEEDED -> HttpStatus.TOO_MANY_REQUESTS;
            case COMMAND_UNSUPPORTED, INVALID_INPUT -> HttpStatus.BAD_REQUEST;
            case REPLAY_GAP -> HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE;
            case HOST_OFFLINE, SERVER_ERROR -> HttpStatus.SERVICE_UNAVAILABLE;
        };
        return ResponseEntity.status(status).body(new ErrorView(status.value(), error.code().name(),
                error.getMessage(), error.code().retryable(), Instant.now()));
    }

    /** Session Client 稳定错误响应。 */
    public record ErrorView(int status, String code, String message, boolean retryable, Instant timestamp) {
    }
}
