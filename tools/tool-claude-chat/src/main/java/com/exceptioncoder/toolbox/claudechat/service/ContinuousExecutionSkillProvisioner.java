package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.LinkedHashMap;

/** 在项目级 Claude/Codex skills 目录原子部署 Forge 拥有的连续执行 Skill。 */
@Service
public class ContinuousExecutionSkillProvisioner {

    public static final String SKILL_NAME = "forge-openspec-continuous-execution";
    public static final String VERSION = "1.0.17";
    private static final String RESOURCE = "skills/" + SKILL_NAME + "/";
    private static final List<String> ASSETS = List.of("SKILL.md",
            "references/writer-recovery.md", "references/database-verification.md");
    private static final String OWNERSHIP_MARKER = "x-forge-owned: true";

    public ProvisioningResult provision(Path projectRoot) {
        var assets = new LinkedHashMap<String, byte[]>();
        ASSETS.forEach(name -> assets.put(name, readCanonicalAsset(name)));
        var fingerprintInput = new ByteArrayOutputStream();
        assets.forEach((name, content) -> {
            fingerprintInput.writeBytes(name.getBytes(StandardCharsets.UTF_8));
            fingerprintInput.write(0);
            fingerprintInput.writeBytes(content);
            fingerprintInput.write(0);
        });
        String fingerprint = sha256(fingerprintInput.toByteArray());
        List<String> installed = new ArrayList<>();
        List<String> collisions = new ArrayList<>();
        for (Path relative : List.of(
                Path.of(".claude", "skills", SKILL_NAME, "SKILL.md"),
                Path.of(".agents", "skills", SKILL_NAME, "SKILL.md"))) {
            Path destination = projectRoot.resolve(relative).toAbsolutePath().normalize();
            if (!destination.startsWith(projectRoot.toAbsolutePath().normalize())) {
                throw new IllegalArgumentException("Skill 目标目录越过项目边界");
            }
            Path directory = destination.getParent();
            List<Path> conflicting = ASSETS.stream().map(directory::resolve)
                    .filter(path -> Files.exists(path) && !isForgeOwned(path)).toList();
            if (!conflicting.isEmpty()) {
                conflicting.forEach(path -> collisions.add(projectRoot.toAbsolutePath().normalize()
                        .relativize(path).toString().replace('\\', '/')));
                continue;
            }
            // Publish references before the entry point so a new entry never links missing assets.
            assets.forEach((name, content) -> {
                if (!name.equals("SKILL.md")) {
                    writeAtomically(directory.resolve(name), content);
                }
            });
            writeAtomically(destination, assets.get("SKILL.md"));
            installed.add(relative.toString().replace('\\', '/'));
        }
        return new ProvisioningResult(VERSION, fingerprint, List.copyOf(installed), List.copyOf(collisions));
    }

    private byte[] readCanonicalAsset(String name) {
        try (InputStream input = new ClassPathResource(RESOURCE + name).getInputStream()) {
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
