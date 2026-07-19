package com.exceptioncoder.toolbox.webppt.exception;

import org.springframework.http.HttpStatus;

public enum WebPptErrorCode {
    VERSION_NOT_FOUND(HttpStatus.NOT_FOUND),
    NO_VERSION_AVAILABLE(HttpStatus.NOT_FOUND),
    SAMPLE_NOT_FOUND(HttpStatus.NOT_FOUND),
    STYLE_ASSET_MALFORMED(HttpStatus.INTERNAL_SERVER_ERROR);

    private final HttpStatus status;

    WebPptErrorCode(HttpStatus status) {
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
