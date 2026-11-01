package com.exceptioncoder.toolbox.foreconsult.backend;

import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Do not expose framework errors, raw model output, local paths or secrets to an external caller. */
@RestControllerAdvice(assignableTypes = {ConsultBackendController.class, ConsultBackendAdminController.class})
@org.springframework.core.annotation.Order(org.springframework.core.Ordered.HIGHEST_PRECEDENCE)
public class ConsultBackendErrors {
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(ConsultBackendErrors.class);
    @ExceptionHandler(ConsultBackendException.class)
    public ResponseEntity<Map<String, Object>> known(ConsultBackendException error) {
        var headers = new HttpHeaders();
        headers.setCacheControl("no-store");
        if (error.status() == 401) headers.set("WWW-Authenticate", "Bearer");
        if (error.status() == 429 || error.status() == 503) headers.set("Retry-After", "5");
        String traceId = UUID.randomUUID().toString();
        LOG.warn("Consult backend request rejected trace={} status={} code={}", traceId, error.status(), error.code());
        return ResponseEntity.status(error.status()).headers(headers).body(Map.of("code", error.code(),
                "message", error.getMessage(), "retryable", error.retryable(), "traceId", traceId));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unexpected(Exception error) {
        if (error instanceof com.exceptioncoder.toolbox.common.auth.AuthException auth) {
            return known(new ConsultBackendException(auth.getStatus().value(), auth.getCode(), "管理员认证未通过", false));
        }
        if (error instanceof org.springframework.web.bind.ServletRequestBindingException
                || error instanceof org.springframework.http.converter.HttpMessageNotReadableException
                || error instanceof IllegalArgumentException) return known(ConsultBackendException.invalid("请求参数不完整或无效"));
        if (error instanceof org.springframework.web.ErrorResponse response && response.getStatusCode().is4xxClientError())
            return known(new ConsultBackendException(response.getStatusCode().value(), "INVALID_REQUEST", "请求方法、类型或参数不符合接口合同", false));
        return known(new ConsultBackendException(500, "INTERNAL_ERROR", "请求暂未完成，请保留原 requestId 核对任务状态", true));
    }
}
