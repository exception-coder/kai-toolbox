package com.exceptioncoder.toolbox.mail.config;

import com.exceptioncoder.toolbox.mail.repository.MailInboxRepository;
import com.exceptioncoder.toolbox.mail.smtp.MailMessageHandler;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.subethamail.smtp.server.SMTPServer;

/**
 * 内嵌 SMTP 服务器生命周期管理，由 {@link MailProperties#isEnabled()} 控制是否启动。
 * 服务器配置（端口/连接数/消息大小）来自 {@link MailProperties}。
 * 启动状态可通过 {@link #status()} 查询，供前端 WebUI 展示。
 */
@Component
public class SmtpServerManager {

    private static final Logger log = LoggerFactory.getLogger(SmtpServerManager.class);

    private final MailProperties props;
    private final MailInboxRepository repo;
    private SMTPServer smtpServer;
    private volatile String startupError;

    public SmtpServerManager(MailProperties props, MailInboxRepository repo) {
        this.props = props;
        this.repo = repo;
    }

    @PostConstruct
    public void start() {
        if (!props.isEnabled()) {
            log.info("内嵌 SMTP 服务器已禁用（toolbox.mail.enabled=false），跳过启动");
            return;
        }
        try {
            smtpServer = new SMTPServer(ctx -> new MailMessageHandler(repo, props));
            smtpServer.setHostName(props.getHostname());
            smtpServer.setPort(props.getPort());
            smtpServer.setMaxConnections(props.getMaxConnections());
            smtpServer.setMaxRecipients(props.getMaxRecipients());
            smtpServer.setMaxMessageSize(props.getMaxMessageSizeBytes());
            smtpServer.start();
            startupError = null;
            log.info("内嵌 SMTP 服务器已启动: port={}, hostname={}, maxConn={}, maxRcpt={}, maxSize={}",
                    props.getPort(), props.getHostname(),
                    props.getMaxConnections(), props.getMaxRecipients(), props.getMaxMessageSizeBytes());
        } catch (Exception e) {
            startupError = e.getClass().getSimpleName() + ": " + e.getMessage();
            log.error("内嵌 SMTP 服务器启动失败，端口: {}", props.getPort(), e);
        }
    }

    @PreDestroy
    public void stop() {
        if (smtpServer != null && smtpServer.isRunning()) {
            smtpServer.stop();
            log.info("内嵌 SMTP 服务器已停止");
        }
    }

    /** 当前 SMTP 服务运行状态快照，供 API 暴露给前端。 */
    public Status status() {
        boolean running = smtpServer != null && smtpServer.isRunning();
        return new Status(props.isEnabled(), running, props.getPort(), props.getHostname(), startupError);
    }

    public record Status(boolean enabled, boolean running, int port, String hostname, String error) {}
}
