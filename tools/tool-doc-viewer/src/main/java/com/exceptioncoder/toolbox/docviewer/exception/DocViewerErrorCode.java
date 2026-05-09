package com.exceptioncoder.toolbox.docviewer.exception;

import org.springframework.http.HttpStatus;

public enum DocViewerErrorCode {
    INVALID_GITHUB_URL(HttpStatus.BAD_REQUEST),
    REPO_NOT_FOUND(HttpStatus.NOT_FOUND),
    REPO_FORBIDDEN(HttpStatus.FORBIDDEN),
    TREE_TOO_LARGE(HttpStatus.BAD_REQUEST),
    SOURCE_NOT_FOUND(HttpStatus.NOT_FOUND),
    FILE_NOT_IN_TREE(HttpStatus.NOT_FOUND),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS),
    UPSTREAM_UNAVAILABLE(HttpStatus.BAD_GATEWAY);

    private final HttpStatus status;

    DocViewerErrorCode(HttpStatus status) {
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
