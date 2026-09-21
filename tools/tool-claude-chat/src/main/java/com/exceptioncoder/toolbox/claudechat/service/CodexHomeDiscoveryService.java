package com.exceptioncoder.toolbox.claudechat.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;

/** Discovers local Codex authorization directories without exposing unrelated home folders. */
@Service
public class CodexHomeDiscoveryService {

    private static final Logger log = LoggerFactory.getLogger(CodexHomeDiscoveryService.class);

    public List<String> list() {
        return list(Path.of(System.getProperty("user.home")).toAbsolutePath().normalize());
    }

    List<String> list(Path userHome) {
        try (var children = Files.list(userHome)) {
            return children
                    .filter(Files::isDirectory)
                    .filter(path -> path.getFileName().toString().startsWith(".codex"))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString(), String.CASE_INSENSITIVE_ORDER))
                    .map(path -> path.toAbsolutePath().normalize().toString())
                    .toList();
        } catch (IOException | SecurityException exception) {
            log.warn("[claude-chat] Failed to discover Codex homes under {}", userHome, exception);
            return List.of();
        }
    }
}
