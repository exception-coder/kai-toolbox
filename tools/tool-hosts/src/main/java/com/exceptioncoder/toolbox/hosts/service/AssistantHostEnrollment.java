package com.exceptioncoder.toolbox.hosts.service;

import com.exceptioncoder.toolbox.common.resource.HostEnrollmentGateway;
import com.exceptioncoder.toolbox.hosts.api.dto.HostRequest;
import org.springframework.stereotype.Service;

/** 助理只登记连接；不测试 SSH、不创建终端或执行命令。 */
@Service
public class AssistantHostEnrollment implements HostEnrollmentGateway {
    private final HostsService hosts;

    public AssistantHostEnrollment(HostsService hosts) { this.hosts = hosts; }

    @Override
    public String register(Command command) {
        if (command.username() == null || command.username().isBlank() || command.password() == null || command.password().isBlank()) {
            throw new IllegalArgumentException("请补充主机账号和密码；密钥认证请在主机管理中配置");
        }
        String tag = command.environment() + (command.systemId() == null || command.systemId().isBlank() ? "" : " · " + command.systemId());
        if (hosts.findAll().stream().anyMatch(value -> value.getHost().equalsIgnoreCase(command.host())
                && value.getPort() == command.port() && value.getUsername().equals(command.username()))) {
            throw new IllegalArgumentException("主机账号已登记，请到主机管理核对原记录");
        }
        return hosts.create(new HostRequest(command.name(), command.host(), command.port(), command.username(),
                "PASSWORD", command.password(), null, null, tag, "由资源管家登记")).getId();
    }
}
