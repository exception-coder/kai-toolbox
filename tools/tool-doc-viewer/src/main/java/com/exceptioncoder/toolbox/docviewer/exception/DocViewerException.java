package com.exceptioncoder.toolbox.docviewer.exception;

import lombok.Getter;

@Getter
public class DocViewerException extends RuntimeException {

    private final DocViewerErrorCode code;

    public DocViewerException(DocViewerErrorCode code, String message) {
        super(message);
        this.code = code;
    }

    public DocViewerException(DocViewerErrorCode code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }
}
