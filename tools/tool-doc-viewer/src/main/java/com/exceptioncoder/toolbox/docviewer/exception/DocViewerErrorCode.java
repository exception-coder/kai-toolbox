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
    UPSTREAM_UNAVAILABLE(HttpStatus.BAD_GATEWAY),
    // 本地目录相关
    INVALID_LOCAL_PATH(HttpStatus.BAD_REQUEST),
    LOCAL_PATH_NOT_DIRECTORY(HttpStatus.BAD_REQUEST),
    LOCAL_PATH_OUTSIDE_ROOT(HttpStatus.FORBIDDEN),
    LOCAL_FILE_TOO_LARGE(HttpStatus.BAD_REQUEST),
    LOCAL_IO_ERROR(HttpStatus.INTERNAL_SERVER_ERROR),
    LOCAL_FILE_NOT_FOUND(HttpStatus.NOT_FOUND);

    private final HttpStatus status;

    DocViewerErrorCode(HttpStatus status) {
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
