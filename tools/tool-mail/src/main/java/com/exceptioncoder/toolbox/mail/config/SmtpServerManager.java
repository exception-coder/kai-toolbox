package com.exceptioncoder.toolbox.mail.config;

import com.exceptioncoder.toolbox.mail.repository.MailInboxRepository;
import com.exceptioncoder.toolbox.mail.smtp.MailMessageHandler;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;
import org.subethamail.smtp.server.SMTPServer;

/**
 * 内嵌 SMTP 服务器生命周期管理。
 * 由 {@link MailProperties#isEnabled()} 控制是否真正启动。
 */
@Component
@EnableConfigurationProperties(MailProperties.class)
public class SmtpServerManager {

    private static final Logger log = LoggerFactory.getLogger(SmtpServerManager.class);

    private final MailProperties props;
    private final MailInboxRepository repo;
    private SMTPServer smtpServer;

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
            smtpServer.start();
            log.info("内嵌 SMTP 服务器已启动，端口: {}, hostname: {}", props.getPort(), props.getHostname());
        } catch (Exception e) {
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
}
