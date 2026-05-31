package com.exceptioncoder.toolbox.hosts.service;

import com.exceptioncoder.toolbox.hosts.api.dto.HostRequest;
import com.exceptioncoder.toolbox.hosts.domain.Host;
import com.exceptioncoder.toolbox.hosts.domain.HostAuthType;
import com.exceptioncoder.toolbox.hosts.repository.HostRepository;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.Session;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/** 全局 SSH 主机管理：CRUD + 连通性测试 + 旧表迁移。 */
@Service
public class HostsService {

    private static final Logger log = LoggerFactory.getLogger(HostsService.class);

    private final HostRepository hosts;
    private final HostSshSessions sessions;

    public HostsService(HostRepository hosts, HostSshSessions sessions) {
        this.hosts = hosts;
        this.sessions = sessions;
    }

    /** 启动时尝试从旧 treesize_ssh_host 拷一份数据过来。幂等。 */
    @PostConstruct
    public void bootstrap() {
        try {
            int n = hosts.migrateFromTreesizeIfNeeded();
            if (n > 0) {
                log.info("已从 treesize_ssh_host 迁移 {} 条主机记录到 host 表", n);
            }
        } catch (Exception e) {
            // 旧表可能不存在或字段不匹配；不阻塞启动
            log.warn("迁移旧 treesize_ssh_host 数据失败: {}", e.getMessage());
        }
    }

    /* ---------- CRUD ---------- */

    public List<Host> findAll() {
        return hosts.findAll();
    }

    public Host findRequired(String id) {
        return hosts.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("host not found: " + id));
    }

    public Host create(HostRequest req) {
        long now = System.currentTimeMillis();
        Host h = toHost(req, null);
        h.setId(UUID.randomUUID().toString());
        h.setCreatedAt(now);
        h.setUpdatedAt(now);
        hosts.insert(h);
        return h;
    }

    public Host update(String id, HostRequest req) {
        Host existing = findRequired(id);
        Host next = toHost(req, existing);
        next.setId(id);
        next.setCreatedAt(existing.getCreatedAt());
        next.setUpdatedAt(System.currentTimeMillis());
        hosts.update(next);
        return next;
    }

    public void delete(String id) {
        hosts.deleteById(id);
    }

    /* ---------- 连通性测试 ---------- */

    public String test(Host host) {
        Session session = null;
        ChannelExec channel = null;
        try {
            session = sessions.open(host);
            channel = (ChannelExec) session.openChannel("exec");
            ByteArrayOutputStream err = new ByteArrayOutputStream();
            channel.setCommand("printf connected");
            channel.setInputStream(null);
            channel.setErrStream(err);
            var in = channel.getInputStream();
            channel.connect(10_000);
            byte[] body = in.readAllBytes();
            while (!channel.isClosed()) {
                Thread.sleep(50);
            }
            if (channel.getExitStatus() != 0) {
                String msg = err.toString(StandardCharsets.UTF_8);
                throw new IllegalStateException(msg.isBlank() ? "ssh command failed" : msg);
            }
            return new String(body, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage(), e);
        } finally {
            if (channel != null) channel.disconnect();
            if (session != null) session.disconnect();
        }
    }

    public String test(HostRequest req) {
        return test(toHost(req, null));
    }

    /* ---------- 内部工具 ---------- */

    private static Host toHost(HostRequest req, Host existing) {
        HostAuthType authType = HostAuthType.valueOf(req.authType().toUpperCase());
        String password = normalizeSecret(req.password(), existing == null ? null : existing.getPassword());
        String passphrase = normalizeSecret(req.passphrase(), existing == null ? null : existing.getPassphrase());
        String privateKey = blankToNull(req.privateKey());
        if (authType == HostAuthType.KEY && privateKey == null && existing != null) {
            privateKey = existing.getPrivateKey();
        }
        return Host.builder()
                .name(req.name().trim())
                .host(req.host().trim())
                .port(req.port() == null ? 22 : req.port())
                .username(req.username().trim())
                .authType(authType)
                .password(authType == HostAuthType.PASSWORD ? password : null)
                .privateKey(authType == HostAuthType.KEY ? privateKey : null)
                .passphrase(authType == HostAuthType.KEY ? passphrase : null)
                .tag(blankToNull(req.tag()))
                .note(blankToNull(req.note()))
                .build();
    }

    private static String normalizeSecret(String candidate, String existing) {
        if (candidate == null) return existing;
        String trimmed = candidate.trim();
        return trimmed.isEmpty() ? existing : trimmed;
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }
}
