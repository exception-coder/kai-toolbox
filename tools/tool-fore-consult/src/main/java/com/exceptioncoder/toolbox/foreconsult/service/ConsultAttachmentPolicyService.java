package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.attachment.SessionAttachmentPolicy;
import com.exceptioncoder.toolbox.common.dynamicconfig.service.DynamicConfigService;
import com.exceptioncoder.toolbox.foreconsult.config.ConsultAttachmentProperties;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import org.springframework.boot.autoconfigure.web.servlet.MultipartProperties;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;

/** 管理员配置与上传执行共用生效值；不改变普通开发会话限制。 */
@Service
public class ConsultAttachmentPolicyService implements SessionAttachmentPolicy {
    private static final long MIB = 1024L * 1024;
    private final ConsultAttachmentProperties properties;
    private final DynamicConfigService config;
    private final MultipartProperties multipart;
    private final ConsultSessionRepository sessions;

    public ConsultAttachmentPolicyService(ConsultAttachmentProperties properties, DynamicConfigService config,
                                         MultipartProperties multipart, ConsultSessionRepository sessions) {
        this.properties = properties; this.config = config; this.multipart = multipart; this.sessions = sessions;
    }

    /** @return 全局配置及当前部署的传输层硬上限，不包含任何连接凭据 */
    public View get() {
        long transport = Math.min(positive(multipart.getMaxFileSize().toBytes()), positive(multipart.getMaxRequestSize().toBytes()));
        long upload = Math.min(properties.getUploadMaxMb() * MIB, transport);
        return new View(properties.getUploadMaxMb(), properties.getReadMaxMb(), upload,
                Math.min(properties.getReadMaxMb() * MIB, upload), transport, 10);
    }

    /** @return 持久化并刷新后的策略；拒绝超过当前部署硬上限的配置 */
    public View save(int uploadMaxMb, int readMaxMb) {
        var candidate = new ConsultAttachmentProperties();
        candidate.setUploadMaxMb(uploadMaxMb); candidate.setReadMaxMb(readMaxMb); candidate.validateConfiguration();
        if (uploadMaxMb * MIB > get().transportMaxBytes()) throw new IllegalArgumentException("上传上限超过当前部署的传输层限制，请先调整部署配置");
        config.applyOverrides(ConsultAttachmentProperties.PREFIX, Map.of(
                ConsultAttachmentProperties.PREFIX + ".upload-max-mb", String.valueOf(uploadMaxMb),
                ConsultAttachmentProperties.PREFIX + ".read-max-mb", String.valueOf(readMaxMb)), List.of());
        return get();
    }

    @Override public OptionalLong uploadLimit(String sessionId) {
        return sessions.findByDevSessionId(sessionId).isPresent() ? OptionalLong.of(get().effectiveUploadBytes()) : OptionalLong.empty();
    }

    private static long positive(long bytes) { return bytes < 0 ? Long.MAX_VALUE : bytes; }

    /** 配置以MiB显示，执行值为字节；单条数量仍沿用原有10个限制。 */
    public record View(int uploadMaxMb, int readMaxMb, long effectiveUploadBytes, long effectiveReadBytes,
                       long transportMaxBytes, int maxAttachments) { }
}
