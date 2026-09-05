package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.io.InputStream;

/** 在项目级 Claude/Codex skills 目录原子部署 Forge 拥有的连续执行 Skill。 */
@Service
public class ContinuousExecutionSkillProvisioner {

    public static final String SKILL_NAME = "forge-openspec-continuous-execution";
    public static final String VERSION = "1.0.0";
    private static final String RESOURCE = "skills/" + SKILL_NAME + "/SKILL.md";
    private static final String OWNERSHIP_MARKER = "x-forge-owned: true";

    public ProvisioningResult provision(Path projectRoot) {
        byte[] content = readCanonicalAsset();
        String fingerprint = sha256(content);
        List<String> installed = new ArrayList<>();
        List<String> collisions = new ArrayList<>();
        for (Path relative : List.of(
                Path.of(".claude", "skills", SKILL_NAME, "SKILL.md"),
                Path.of(".agents", "skills", SKILL_NAME, "SKILL.md"))) {
            Path destination = projectRoot.resolve(relative).toAbsolutePath().normalize();
            if (!destination.startsWith(projectRoot.toAbsolutePath().normalize())) {
                throw new IllegalArgumentException("Skill 目标目录越过项目边界");
            }
            if (Files.exists(destination) && !isForgeOwned(destination)) {
                collisions.add(relative.toString().replace('\\', '/'));
                continue;
            }
            writeAtomically(destination, content);
            installed.add(relative.toString().replace('\\', '/'));
        }
        return new ProvisioningResult(VERSION, fingerprint, List.copyOf(installed), List.copyOf(collisions));
    }

    private byte[] readCanonicalAsset() {
        try (InputStream input = new ClassPathResource(RESOURCE).getInputStream()) {
            return input.readAllBytes();
        } catch (IOException exception) {
            throw new IllegalStateException("无法读取 Continuous Execution Skill 资源", exception);
        }
    }

    private boolean isForgeOwned(Path destination) {
        try {
            String existing = Files.readString(destination, StandardCharsets.UTF_8);
            return existing.contains(OWNERSHIP_MARKER);
        } catch (IOException exception) {
            throw new IllegalStateException("无法核验已有 Skill 所有权", exception);
        }
    }

    private void writeAtomically(Path destination, byte[] content) {
        try {
            Files.createDirectories(destination.getParent());
            Path temporary = Files.createTempFile(destination.getParent(), ".forge-skill-", ".tmp");
            try {
                Files.write(temporary, content);
                try {
                    Files.move(temporary, destination, StandardCopyOption.ATOMIC_MOVE,
                            StandardCopyOption.REPLACE_EXISTING);
                } catch (IOException atomicMoveUnsupported) {
                    Files.move(temporary, destination, StandardCopyOption.REPLACE_EXISTING);
                }
            } finally {
                Files.deleteIfExists(temporary);
            }
        } catch (IOException exception) {
            throw new IllegalStateException("无法部署 Continuous Execution Skill: " + destination, exception);
        }
    }

    private String sha256(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("运行环境不支持 SHA-256", exception);
        }
    }

    public record ProvisioningResult(String version, String fingerprint,
                                     List<String> installedPaths, List<String> collisions) {
        public boolean ready() {
            return collisions.isEmpty() && installedPaths.size() == 2;
        }
    }
}
