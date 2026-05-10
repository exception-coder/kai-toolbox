package com.exceptioncoder.toolbox.mail.api.dto;

/** SMTP 内嵌服务器运行状态。 */
public record MailServerStatusView(
        boolean enabled,
        boolean running,
        int port,
        String hostname,
        String error
) {}
