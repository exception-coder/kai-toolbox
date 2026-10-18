package com.exceptioncoder.toolbox.ops.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.AclEntry;
import java.nio.file.attribute.AclEntryPermission;
import java.nio.file.attribute.AclEntryType;
import java.nio.file.attribute.AclFileAttributeView;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.EnumSet;
import java.util.List;

/** 原资源仓储的凭据封装；密钥独立于 SQLite，历史明文仅兼容读取。 */
@Component
public class OpsCredentialCipher {
    private static final String PREFIX = "forge-ops:v1:";
    private final Path keyFile;
    private final SecureRandom random = new SecureRandom();

    public OpsCredentialCipher(@Value("${toolbox.ops.credential-key-file:${user.home}/.kai-toolbox/secrets/ops.key}")
                               String keyFile) {
        this.keyFile = Path.of(keyFile).toAbsolutePath().normalize();
    }

    /** 只接受明文输入，新 IV 确保同一密码的密文不同。 */
    public String encrypt(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        try {
            byte[] iv = new byte[12];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key(true), "AES"), new GCMParameterSpec(128, iv));
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            return PREFIX + Base64.getEncoder().encodeToString(
                    ByteBuffer.allocate(iv.length + encrypted.length).put(iv).put(encrypted).array());
        } catch (Exception failure) {
            throw new IllegalStateException("资源凭据加密失败，请检查服务账号密钥文件权限");
        }
    }

    /** 缺失或错误密钥拒绝解密，绝不生成替代密钥掩盖丢失。 */
    public String decrypt(String value) {
        if (value == null || !value.startsWith(PREFIX)) {
            return value;
        }
        try {
            byte[] bytes = Base64.getDecoder().decode(value.substring(PREFIX.length()));
            if (bytes.length < 28) {
                throw new IllegalArgumentException("invalid envelope");
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key(false), "AES"),
                    new GCMParameterSpec(128, bytes, 0, 12));
            return new String(cipher.doFinal(bytes, 12, bytes.length - 12), StandardCharsets.UTF_8);
        } catch (Exception failure) {
            throw new IllegalStateException("资源凭据无法解密，请恢复原服务账号密钥文件");
        }
    }

    private synchronized byte[] key(boolean create) throws Exception {
        if (!create && !Files.isRegularFile(keyFile)) {
            throw new IllegalStateException("missing key");
        }
        Files.createDirectories(keyFile.getParent());
        try (FileChannel channel = FileChannel.open(keyFile, StandardOpenOption.READ, StandardOpenOption.WRITE,
                create ? StandardOpenOption.CREATE : StandardOpenOption.READ);
             var lock = channel.lock()) {
            if (channel.size() == 0 && create) {
                restrictKeyFile();
                byte[] generated = new byte[32];
                random.nextBytes(generated);
                channel.write(ByteBuffer.wrap(generated));
                channel.force(true);
            }
            if (channel.size() != 32) {
                throw new IllegalStateException("invalid key");
            }
            ByteBuffer buffer = ByteBuffer.allocate(32);
            channel.position(0);
            while (buffer.hasRemaining() && channel.read(buffer) >= 0) {
                // FileChannel may return a partial read.
            }
            return buffer.array();
        }
    }

    /** 用独立密钥签名请求，避免把凭据摘要变成可离线猜解的密码哈希。 */
    public String fingerprint(String value) {
        try {
            var mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key(true), "HmacSHA256"));
            return Base64.getEncoder().encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception failure) {
            throw new IllegalStateException("安全登记签名不可用");
        }
    }

    private void restrictKeyFile() throws Exception {
        AclFileAttributeView acl = Files.getFileAttributeView(keyFile, AclFileAttributeView.class);
        if (acl != null) {
            acl.setAcl(List.of(AclEntry.newBuilder().setType(AclEntryType.ALLOW).setPrincipal(acl.getOwner())
                    .setPermissions(EnumSet.allOf(AclEntryPermission.class)).build()));
        } else {
            Files.setPosixFilePermissions(keyFile, PosixFilePermissions.fromString("rw-------"));
        }
    }
}
