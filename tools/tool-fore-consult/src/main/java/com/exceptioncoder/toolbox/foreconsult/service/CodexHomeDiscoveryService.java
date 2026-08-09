package com.exceptioncoder.toolbox.foreconsult.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;

/** Discovers Codex authorization directories directly below the runtime user's home directory. */
@Service
public class CodexHomeDiscoveryService {

    private static final Logger log = LoggerFactory.getLogger(CodexHomeDiscoveryService.class);
    private static final String CODEX_HOME_PREFIX = ".codex";

    /**
     * Returns normalized absolute paths for direct child directories whose names start with {@code .codex}.
     *
     * @return sorted Codex authorization directory paths, or an empty list when the home cannot be scanned
     */
    public List<String> list() {
        Path userHome = Path.of(System.getProperty("user.home")).toAbsolutePath().normalize();
        return list(userHome);
    }

    List<String> list(Path userHome) {
        try (var children = Files.list(userHome)) {
            return children
                    .filter(Files::isDirectory)
                    .filter(path -> path.getFileName().toString().startsWith(CODEX_HOME_PREFIX))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString(), String.CASE_INSENSITIVE_ORDER))
                    .map(path -> path.toAbsolutePath().normalize().toString())
                    .toList();
        } catch (IOException | SecurityException e) {
            log.warn("[fore-consult] Failed to discover Codex homes under {}", userHome, e);
            return List.of();
        }
    }
}
