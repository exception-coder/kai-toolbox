package com.exceptioncoder.toolbox.common.exception;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.dynamicconfig.DynamicConfigException;
import com.exceptioncoder.toolbox.common.featureconfig.FeatureConfigNotFoundException;
import com.exceptioncoder.toolbox.common.forge.exception.DepartmentInUseException;
import com.exceptioncoder.toolbox.common.forge.exception.ForbiddenException;
import com.exceptioncoder.toolbox.common.forge.exception.UnauthorizedException;
import com.exceptioncoder.toolbox.common.media.FfmpegUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.NoSuchFileException;
import java.time.Instant;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArg(IllegalArgumentException e) {
        return body(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .orElse("validation failed");
        return body(HttpStatus.BAD_REQUEST, msg);
    }

    /**
     * 客户端在 SSE / 异步响应过程中提前断开（切页面、关 tab、网络抖动）时 Spring 抛出的信号。
     * 真正的清理已经在 {@code SseEmitterRegistry.publish} 的 catch 分支里完成（移除 emitter）。
     * 这里只为压住"unhandled exception"误报：返回 void 让 Spring 跳过响应体写入，
     * 因为底层 socket 已经不可写了。
     */
    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public void handleAsyncRequestNotUsable(AsyncRequestNotUsableException e) {
        log.debug("async request closed by client: {}", e.getMessage());
    }

    @ExceptionHandler(FfmpegUnavailableException.class)
    public ResponseEntity<Map<String, Object>> handleFfmpegUnavailable(FfmpegUnavailableException e) {
        return body(HttpStatus.SERVICE_UNAVAILABLE, e.getMessage());
    }

    @ExceptionHandler(NoSuchFileException.class)
    public ResponseEntity<Map<String, Object>> handleNoSuchFile(NoSuchFileException e) {
        return body(HttpStatus.NOT_FOUND, "file not found: " + e.getFile());
    }

    @ExceptionHandler(FeatureConfigNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleFeatureConfigNotFound(FeatureConfigNotFoundException e) {
        return body(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(AuthException.class)
    public ResponseEntity<Map<String, Object>> handleAuth(AuthException e) {
        return ResponseEntity.status(e.getStatus()).body(Map.of(
                "timestamp", Instant.now().toString(),
                "status", e.getStatus().value(),
                "error", e.getStatus().getReasonPhrase(),
                "code", e.getCode(),
                "message", e.getMessage() == null ? "" : e.getMessage()
        ));
    }

    // ===== Forge 权限体系：硬鉴权语义（取代 SoftGuard 静默降级）=====
    // 显式登记，避免被下方 catch-all(Exception.class) 吞成 500。

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<Map<String, Object>> handleUnauthorized(UnauthorizedException e) {
        return body(HttpStatus.UNAUTHORIZED, e.getMessage());
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<Map<String, Object>> handleForbidden(ForbiddenException e) {
        return body(HttpStatus.FORBIDDEN, e.getMessage());
    }

    @ExceptionHandler(DepartmentInUseException.class)
    public ResponseEntity<Map<String, Object>> handleDepartmentInUse(DepartmentInUseException e) {
        return body(HttpStatus.CONFLICT, e.getMessage());
    }

    @ExceptionHandler(DynamicConfigException.class)
    public ResponseEntity<Map<String, Object>> handleDynamicConfig(DynamicConfigException e) {
        return ResponseEntity.status(e.getStatus()).body(Map.of(
                "timestamp", Instant.now().toString(),
                "status", e.getStatus().value(),
                "error", e.getStatus().getReasonPhrase(),
                "code", e.getCode(),
                "message", e.getMessage() == null ? "" : e.getMessage()
        ));
    }

    /**
     * 标准 Spring {@link ResponseStatusException}：尊重其携带的状态码与 reason，
     * 否则会被下方 catch-all 误判为 500。供各工具模块用 {@code throw new ResponseStatusException(BAD_REQUEST, "...")}
     * 表达受控的 4xx，无需各自定义异常类型。
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatus(ResponseStatusException e) {
        HttpStatus status = HttpStatus.resolve(e.getStatusCode().value());
        if (status == null) {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
        }
        return body(status, e.getReason());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleAny(Exception e) {
        log.error("unhandled exception", e);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, e.getClass().getSimpleName() + ": " + e.getMessage());
    }

    private ResponseEntity<Map<String, Object>> body(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of(
                "timestamp", Instant.now().toString(),
                "status", status.value(),
                "error", status.getReasonPhrase(),
                "message", message == null ? "" : message
        ));
    }
}
