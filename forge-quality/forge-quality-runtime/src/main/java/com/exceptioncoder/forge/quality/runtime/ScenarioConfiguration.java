package com.exceptioncoder.forge.quality.runtime;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Typed access to untrusted scenario configuration values. */
final class ScenarioConfiguration {
    private final RuntimeScenario scenario;

    ScenarioConfiguration(RuntimeScenario scenario) {
        this.scenario = scenario;
    }

    String requiredText(String name) {
        Object value = scenario.configuration().get(name);
        if (!(value instanceof String text) || text.isBlank()) {
            throw new IllegalArgumentException("Scenario " + scenario.id() + " requires text field " + name);
        }
        return text;
    }

    String optionalText(String name, String defaultValue) {
        Object value = scenario.configuration().get(name);
        return value == null ? defaultValue : String.valueOf(value);
    }

    int optionalInteger(String name, int defaultValue) {
        Object value = scenario.configuration().get(name);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        return Integer.parseInt(String.valueOf(value));
    }

    List<Object> optionalList(String name) {
        Object value = scenario.configuration().get(name);
        if (value == null) {
            return List.of();
        }
        if (!(value instanceof List<?> list)) {
            throw new IllegalArgumentException("Scenario " + scenario.id() + " field " + name + " must be a list");
        }
        return new ArrayList<>(list);
    }

    Map<String, String> optionalStringMap(String name) {
        Object value = scenario.configuration().get(name);
        if (value == null) {
            return Map.of();
        }
        if (!(value instanceof Map<?, ?> map)) {
            throw new IllegalArgumentException("Scenario " + scenario.id() + " field " + name + " must be a map");
        }
        Map<String, String> result = new LinkedHashMap<>((int) (map.size() / 0.75F) + 1);
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            result.put(String.valueOf(entry.getKey()), String.valueOf(entry.getValue()));
        }
        return result;
    }

    Object value(String name) {
        return scenario.configuration().get(name);
    }

    String environmentValue(String fieldName) {
        Object value = scenario.configuration().get(fieldName);
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        String variableName = String.valueOf(value);
        String resolved = System.getenv(variableName);
        if (resolved == null) {
            throw new IllegalArgumentException("Environment variable is not set: " + variableName);
        }
        return resolved;
    }
}
