package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.api.dto.SshHostRequest;
import com.exceptioncoder.toolbox.treesize.domain.SshAuthType;
import com.exceptioncoder.toolbox.treesize.domain.SshHost;
import com.exceptioncoder.toolbox.treesize.repository.SshHostRepository;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.Session;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@Service
public class SshHostService {

    private final SshHostRepository hosts;
    private final SshClientFactory ssh;

    public SshHostService(SshHostRepository hosts, SshClientFactory ssh) {
        this.hosts = hosts;
        this.ssh = ssh;
    }

    public List<SshHost> findAll() {
        return hosts.findAll();
    }

    public SshHost findRequired(String id) {
        return hosts.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("ssh host not found: " + id));
    }

    public SshHost create(SshHostRequest req) {
        long now = System.currentTimeMillis();
        SshHost host = toHost(req, null);
        host.setId(UUID.randomUUID().toString());
        host.setCreatedAt(now);
        host.setUpdatedAt(now);
        hosts.insert(host);
        return host;
    }

    public SshHost update(String id, SshHostRequest req) {
        SshHost existing = findRequired(id);
        SshHost next = toHost(req, existing);
        next.setId(id);
        next.setCreatedAt(existing.getCreatedAt());
        next.setUpdatedAt(System.currentTimeMillis());
        hosts.update(next);
        return next;
    }

    public void delete(String id) {
        hosts.deleteById(id);
    }

    public String test(SshHost host) {
        Session session = null;
        ChannelExec channel = null;
        try {
            session = ssh.openSession(host);
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
            throw new IllegalArgumentException(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage(), e);
        } finally {
            if (channel != null) channel.disconnect();
            if (session != null) session.disconnect();
        }
    }

    public String test(SshHostRequest req) {
        return test(toHost(req, null));
    }

    private static SshHost toHost(SshHostRequest req, SshHost existing) {
        SshAuthType authType = SshAuthType.valueOf(req.authType().toUpperCase());
        String password = normalizeSecret(req.password(), existing == null ? null : existing.getPassword());
        String passphrase = normalizeSecret(req.passphrase(), existing == null ? null : existing.getPassphrase());
        String privateKey = blankToNull(req.privateKey());
        if (authType == SshAuthType.KEY && privateKey == null && existing != null) {
            privateKey = existing.getPrivateKey();
        }
        return SshHost.builder()
                .name(req.name().trim())
                .host(req.host().trim())
                .port(req.port() == null ? 22 : req.port())
                .username(req.username().trim())
                .authType(authType)
                .password(authType == SshAuthType.PASSWORD ? password : null)
                .privateKey(authType == SshAuthType.KEY ? privateKey : null)
                .passphrase(authType == SshAuthType.KEY ? passphrase : null)
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
