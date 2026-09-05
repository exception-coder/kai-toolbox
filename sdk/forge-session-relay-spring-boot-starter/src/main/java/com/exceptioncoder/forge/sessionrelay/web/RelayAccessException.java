package com.exceptioncoder.forge.sessionrelay.web;

/** Relay 本地身份或绑定不可用。 */
public final class RelayAccessException extends RuntimeException {
    public RelayAccessException(String message) { super(message); }
}
