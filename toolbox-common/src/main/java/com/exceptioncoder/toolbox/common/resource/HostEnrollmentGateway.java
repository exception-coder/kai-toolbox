package com.exceptioncoder.toolbox.common.resource;

/** 主机模块拥有登记和凭据，调用方不能直接写 host 表。 */
public interface HostEnrollmentGateway {
    String register(Command command);

    record Command(String name, String environment, String systemId, String host, int port, String username, String password) {
        @Override public String toString() { return "HostEnrollment[redacted]"; }
    }
}
