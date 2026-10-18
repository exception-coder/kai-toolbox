package com.exceptioncoder.toolbox.hosts.files;

import com.exceptioncoder.toolbox.hosts.service.HostSshSessions;
import com.exceptioncoder.toolbox.hosts.service.HostsService;
import com.jcraft.jsch.*;
import java.io.*;
import java.security.*;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Bounded SFTP operations; never invokes a remote shell. */
@Service
public class SftpFiles {

    private static final Logger log = LoggerFactory.getLogger(SftpFiles.class);
    public static final int LIMIT = 20 * 1024 * 1024;
    private final HostsService hosts;
    private final HostSshSessions sessions;

    public SftpFiles(HostsService hosts, HostSshSessions sessions) {
        this.hosts = hosts;
        this.sessions = sessions;
    }

    /** Remote entry; name is server-supplied, modified is epoch seconds. */
    public record Entry(
        String name,
        boolean directory,
        boolean link,
        long size,
        int modified
    ) {}

    /** Server canonical path, bounded entries and truncation flag. */
    public record Listing(
        String path,
        List<Entry> entries,
        boolean truncated
    ) {}

    /** Bounded content with a digest used to prepare replacement. */
    public record Download(byte[] bytes, String sha256) {}

    /** Confirmed target, retained backup path if replaced, and content digest. */
    public record Uploaded(String path, String backup, String sha256) {}

    @FunctionalInterface
    interface Work<T> {
        T run(ChannelSftp channel) throws Exception;
    }

    private <T> T connected(String id, Work<T> work) {
        Session session = null;
        ChannelSftp channel = null;
        try {
            session = sessions.openVerified(hosts.findRequired(id));
            session.setTimeout(30_000);
            channel = (ChannelSftp) session.openChannel("sftp");
            channel.connect(15_000);
            return work.run(channel);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            log.warn(
                "SFTP operation failed hostId={} category={}",
                id,
                e.getClass().getSimpleName()
            );
            // SDK messages may contain remote data; expose only a bounded failure category.
            throw new IllegalStateException(
                "SFTP 操作失败（" +
                    e.getClass().getSimpleName() +
                    "）。请检查目录、权限、连接及服务端 known_hosts；替换失败请核对原文件和备份。",
                e
            );
        } finally {
            if (channel != null) { channel.disconnect(); }
            if (session != null) { session.disconnect(); }
        }
    }

    public Listing list(String id, String path) {
        return connected(id, c -> {
            c.cd(path(path));
            List<Entry> entries = new ArrayList<>();
            boolean[] truncated = { false };
            c.ls(".", e -> {
                String name = e.getFilename();
                if (name.equals(".") || name.equals("..")) {
                    return ChannelSftp.LsEntrySelector.CONTINUE;
                }
                if (entries.size() == 1000) {
                    truncated[0] = true;
                    return ChannelSftp.LsEntrySelector.BREAK;
                }
                SftpATTRS a = e.getAttrs();
                entries.add(
                    new Entry(
                        name,
                        a.isDir(),
                        a.isLink(),
                        a.getSize(),
                        a.getMTime()
                    )
                );
                return ChannelSftp.LsEntrySelector.CONTINUE;
            });
            return new Listing(c.pwd(), entries, truncated[0]);
        });
    }

    public Download download(String id, String path) {
        return connected(id, c -> read(c, path(path)));
    }

    static String path(String value) {
        if (value == null || value.isBlank()) {
            return ".";
        }
        if (
            value.length() > 2048 ||
            value.chars().anyMatch(ch -> ch < 32) ||
            value.contains("*") ||
            value.contains("?") ||
            value.contains("[") ||
            value.contains("]")
        ) {
            throw new IllegalArgumentException(
                "远端路径不能包含控制字符或通配符"
            );
        }
        return value.replace('\\', '/');
    }

    static String filename(String value) {
        if (
            value == null ||
            value.isBlank() ||
            value.equals(".") ||
            value.equals("..") ||
            value.contains("/") ||
            value.contains("\\") ||
            value.contains(":")
        ) {
            throw new IllegalArgumentException("文件名必须是不带目录的名称");
        }
        return path(value);
    }

    static String hash(byte[] bytes) throws NoSuchAlgorithmException {
        return HexFormat.of().formatHex(
            MessageDigest.getInstance("SHA-256").digest(bytes)
        );
    }

    private Download read(ChannelSftp c, String path) throws Exception {
        SftpATTRS stat = c.lstat(path);
        if (!stat.isReg() || stat.isDir() || stat.isLink() || stat.getSize() > LIMIT) {
            throw new IllegalArgumentException(
                "仅支持不超过 20 MiB 的普通文件"
            );
        }
        try (InputStream in = c.get(path)) {
            byte[] data = in.readNBytes(LIMIT + 1);
            if (data.length > LIMIT) {
                throw new IllegalArgumentException("文件超过20 MiB");
            }
            return new Download(data, hash(data));
        }
    }

    public Uploaded upload(
        String id,
        String directory,
        String name,
        byte[] bytes,
        String expected
    ) {
        filename(name);
        if (bytes.length > LIMIT) {
            throw new IllegalArgumentException("文件超过20 MiB");
        }
        return connected(id, c -> {
            c.cd(path(directory));
            String target = c.pwd() + "/" + name;
            boolean exists;
            try {
                c.lstat(name);
                exists = true;
            } catch (SftpException e) {
                if (e.id != ChannelSftp.SSH_FX_NO_SUCH_FILE) {
                    throw e;
                }
                exists = false;
            }
            checkTarget(c, name, expected, exists);
            return transfer(c, id, name, bytes, expected, exists, target);
        });
    }

    /** Existing files require the digest from an explicit preparation step. */
    private void checkTarget(
        ChannelSftp c,
        String name,
        String expected,
        boolean exists
    ) throws Exception {
        if (
            exists &&
            (expected == null || !read(c, name).sha256().equals(expected))
        ) {
            throw new IllegalArgumentException(
                "远端文件已变化，请重新下载并确认替换"
            );
        }
        if (!exists && expected != null && !expected.isBlank()) {
            throw new IllegalArgumentException("原文件已不存在，请重新确认");
        }
    }

    /** Transfer to a temporary name before the recoverable rename sequence. */
    private Uploaded transfer(
        ChannelSftp c,
        String id,
        String name,
        byte[] bytes,
        String expected,
        boolean exists,
        String target
    ) throws Exception {
        String suffix = UUID.randomUUID().toString();
        String temp = ".forge-upload-" + suffix;
        String backup = exists ? name + ".forge-backup-" + suffix : null;
        boolean staged = false,
            moved = false;
        try {
            staged = true;
            c.put(new ByteArrayInputStream(bytes), temp);
            if (!read(c, temp).sha256().equals(hash(bytes))) {
                throw new IOException("Upload digest mismatch");
            }
            if (exists) {
                if (!read(c, name).sha256().equals(expected)) {
                    throw new IOException("Target changed during transfer");
                }
                c.chmod(c.lstat(name).getPermissions() & 0777, temp);
                c.rename(name, backup);
                moved = true;
            } else {
                try {
                    c.lstat(name);
                    throw new IllegalArgumentException(
                        "上传期间出现同名文件，请刷新核对"
                    );
                } catch (SftpException e) {
                    if (e.id != ChannelSftp.SSH_FX_NO_SUCH_FILE) {
                        throw e;
                    }
                }
            }
            c.rename(temp, name);
            staged = false;
            log.info(
                "SFTP upload completed hostId={} operationId={} replaced={}",
                id,
                suffix,
                exists
            );
            return new Uploaded(
                target,
                backup == null ? null : c.pwd() + "/" + backup,
                hash(bytes)
            );
        } catch (Exception e) {
            if (moved) {
                restore(c, id, suffix, backup, name, e);
            }
            throw e;
        } finally {
            if (staged) {
                try {
                    c.rm(temp);
                } catch (SftpException ignored) {
                    log.warn(
                        "SFTP temporary file remains hostId={} operationId={}",
                        id,
                        suffix
                    );
                }
            }
        }
    }

    /** Recovery failure is observable without logging remote names or credentials. */
    private void restore(
        ChannelSftp c,
        String id,
        String operation,
        String backup,
        String name,
        Exception failure
    ) {
        try {
            c.rename(backup, name);
            log.warn(
                "SFTP original restored hostId={} operationId={}",
                id,
                operation
            );
        } catch (SftpException recovery) {
            failure.addSuppressed(recovery);
            log.error(
                "SFTP recovery required hostId={} operationId={} backupSuffix=.forge-backup-{}",
                id,
                operation,
                operation
            );
        }
    }
}
