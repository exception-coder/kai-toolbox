package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ModelInfo;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Loads the Codex model catalog used by Vibe Coding before a chat session exists. */
@Service
public class CodexModelCatalogService {

    private static final Logger log = LoggerFactory.getLogger(CodexModelCatalogService.class);
    private static final String CODEX_HOME_PREFIX = ".codex";
    private static final String MODEL_CACHE_FILE = "models_cache.json";
    private static final Pattern REASONING_EFFORT = Pattern.compile("^[a-z][a-z0-9_-]{0,31}$");

    private final ObjectMapper mapper;

    public CodexModelCatalogService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * Loads selectable models from the requested Codex authorization directory.
     *
     * @param codexHome selected Codex authorization directory
     * @return selectable models using the shared Vibe Coding model contract
     */
    public List<ModelInfo> list(String codexHome) {
        Path userHome = Path.of(System.getProperty("user.home")).toAbsolutePath().normalize();
        return list(userHome, Path.of(codexHome));
    }

    List<ModelInfo> list(Path userHome, Path requestedHome) {
        Path normalizedUserHome = userHome.toAbsolutePath().normalize();
        Path normalizedHome = requestedHome.toAbsolutePath().normalize();
        Path directoryName = normalizedHome.getFileName();
        if (!normalizedUserHome.equals(normalizedHome.getParent())
                || directoryName == null
                || !directoryName.toString().startsWith(CODEX_HOME_PREFIX)
                || !Files.isDirectory(normalizedHome)
                || Files.isSymbolicLink(normalizedHome)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Codex 授权目录不合法");
        }

        Path cacheFile = normalizedHome.resolve(MODEL_CACHE_FILE);
        if (!Files.isRegularFile(cacheFile)) {
            return List.of();
        }
        try {
            return parseModels(mapper.readTree(cacheFile.toFile()).path("models"));
        } catch (IOException e) {
            log.warn("[claude-chat] Failed to read Codex model catalog from {}", cacheFile, e);
            return List.of();
        }
    }

    private List<ModelInfo> parseModels(JsonNode modelsNode) {
        if (!modelsNode.isArray()) {
            return List.of();
        }
        List<ModelInfo> models = new ArrayList<>();
        for (JsonNode model : modelsNode) {
            String slug = model.path("slug").asText("").trim();
            if (slug.isEmpty()
                    || !"list".equals(model.path("visibility").asText())) {
                continue;
            }
            List<String> efforts = new ArrayList<>();
            for (JsonNode level : model.path("supported_reasoning_levels")) {
                String effort = level.path("effort").asText("");
                if (REASONING_EFFORT.matcher(effort).matches()) {
                    efforts.add(effort);
                }
            }
            String defaultEffort = model.path("default_reasoning_level").asText("");
            if (!REASONING_EFFORT.matcher(defaultEffort).matches()) {
                defaultEffort = null;
            }
            boolean fastSupported = false;
            for (JsonNode speedTier : model.path("additional_speed_tiers")) {
                if ("fast".equals(speedTier.asText())) {
                    fastSupported = true;
                    break;
                }
            }
            String displayName = model.path("display_name").asText("").trim();
            models.add(new ModelInfo(
                    slug,
                    displayName.isEmpty() ? slug : displayName,
                    model.path("description").asText(""),
                    List.copyOf(efforts),
                    defaultEffort,
                    fastSupported,
                    false
            ));
        }
        return List.copyOf(models);
    }
}
