package com.exceptioncoder.forge.quality.application;

import com.exceptioncoder.forge.quality.runtime.RuntimeScenario;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Loads project-owned runtime scenarios from safe YAML. */
final class RuntimeScenarioLoader {
    private RuntimeScenarioLoader() {
    }

    static List<RuntimeScenario> load(Path projectRoot) throws IOException {
        Path config = projectRoot.resolve(".forge/verify.yml");
        if (!Files.exists(config)) {
            throw new IllegalArgumentException("Runtime configuration does not exist: " + config);
        }
        LoaderOptions options = new LoaderOptions();
        options.setAllowDuplicateKeys(false);
        Object document;
        try (InputStream input = Files.newInputStream(config)) {
            document = new Yaml(new SafeConstructor(options)).load(input);
        }
        return parseScenarios(document);
    }

    private static List<RuntimeScenario> parseScenarios(Object document) {
        if (!(document instanceof Map<?, ?> root) || !(root.get("runtime") instanceof Map<?, ?> runtime)) {
            throw new IllegalArgumentException("Runtime configuration requires runtime.scenarios");
        }
        if (!(runtime.get("scenarios") instanceof List<?> scenarioList)) {
            throw new IllegalArgumentException("runtime.scenarios must be a list");
        }
        List<RuntimeScenario> result = new ArrayList<>();
        for (Object item : scenarioList) {
            result.add(parseScenario(item));
        }
        return List.copyOf(result);
    }

    private static RuntimeScenario parseScenario(Object item) {
        if (!(item instanceof Map<?, ?> scenarioMap)) {
            throw new IllegalArgumentException("Each runtime scenario must be a map");
        }
        String id = requiredText(scenarioMap, "id");
        String type = requiredText(scenarioMap, "type");
        Map<String, Object> configuration = new LinkedHashMap<>((int) (scenarioMap.size() / 0.75F) + 1);
        for (Map.Entry<?, ?> entry : scenarioMap.entrySet()) {
            String key = String.valueOf(entry.getKey());
            if (!key.equals("id") && !key.equals("type")) {
                configuration.put(key, entry.getValue());
            }
        }
        return new RuntimeScenario(id, type, configuration);
    }

    private static String requiredText(Map<?, ?> map, String name) {
        Object value = map.get(name);
        if (!(value instanceof String text) || text.isBlank()) {
            throw new IllegalArgumentException("Runtime scenario requires text field " + name);
        }
        return text;
    }
}
