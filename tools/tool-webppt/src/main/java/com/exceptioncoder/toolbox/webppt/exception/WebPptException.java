package com.exceptioncoder.toolbox.webppt.exception;

import lombok.Getter;

@Getter
public class WebPptException extends RuntimeException {

    private final WebPptErrorCode code;

    public WebPptException(WebPptErrorCode code, String message) {
        super(message);
        this.code = code;
    }

    public WebPptException(WebPptErrorCode code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }
}
