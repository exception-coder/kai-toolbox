package com.exceptioncoder.toolbox.foreconsult.backend;

/** Only safe, contract-owned messages may leave the backend integration boundary. */
public class ConsultBackendException extends RuntimeException {
    private final int status;
    private final String code;
    private final boolean retryable;
    private final java.util.Map<String, Object> details;

    public ConsultBackendException(int status, String code, String message, boolean retryable) {
        this(status, code, message, retryable, java.util.Map.of());
    }

    public ConsultBackendException(int status, String code, String message, boolean retryable, java.util.Map<String, Object> details) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryable = retryable;
        this.details = java.util.Map.copyOf(details);
    }

    public int status() { return status; }
    public String code() { return code; }
    public boolean retryable() { return retryable; }
    public java.util.Map<String, Object> details() { return details; }

    public static ConsultBackendException invalid(String message) {
        return new ConsultBackendException(400, "INVALID_REQUEST", message, false);
    }
}
