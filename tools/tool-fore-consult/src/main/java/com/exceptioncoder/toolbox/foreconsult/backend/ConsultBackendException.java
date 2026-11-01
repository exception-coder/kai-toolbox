package com.exceptioncoder.toolbox.foreconsult.backend;

/** Only safe, contract-owned messages may leave the backend integration boundary. */
public class ConsultBackendException extends RuntimeException {
    private final int status;
    private final String code;
    private final boolean retryable;

    public ConsultBackendException(int status, String code, String message, boolean retryable) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryable = retryable;
    }

    public int status() { return status; }
    public String code() { return code; }
    public boolean retryable() { return retryable; }

    public static ConsultBackendException invalid(String message) {
        return new ConsultBackendException(400, "INVALID_REQUEST", message, false);
    }
}
