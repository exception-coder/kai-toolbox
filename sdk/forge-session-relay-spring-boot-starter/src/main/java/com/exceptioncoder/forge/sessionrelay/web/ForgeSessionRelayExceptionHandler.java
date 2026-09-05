package com.exceptioncoder.forge.sessionrelay.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.RestClientResponseException;

import java.time.Instant;

/** 将本地身份错误和上游公共错误收敛为不含凭据的响应。 */
@RestControllerAdvice(assignableTypes = ForgeSessionRelayController.class)
public class ForgeSessionRelayExceptionHandler {
    @ExceptionHandler(RelayAccessException.class)
    ResponseEntity<ErrorView> access(RelayAccessException error) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorView("RELAY_AUTHENTICATION_REQUIRED", error.getMessage(), false, Instant.now()));
    }

    @ExceptionHandler(RestClientResponseException.class)
    ResponseEntity<byte[]> upstream(RestClientResponseException error) {
        return ResponseEntity.status(error.getStatusCode())
                .contentType(MediaTypeSupport.jsonOrOctet(error.getResponseHeaders()))
                .body(error.getResponseBodyAsByteArray());
    }

    record ErrorView(String code, String message, boolean retryable, Instant timestamp) { }

    private static final class MediaTypeSupport {
        private static org.springframework.http.MediaType jsonOrOctet(HttpHeaders headers) {
            return headers != null && headers.getContentType() != null
                    ? headers.getContentType() : org.springframework.http.MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
