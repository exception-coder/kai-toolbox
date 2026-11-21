package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 读写开源编程引擎的本机原生模型配置（服务商、模型、Key）。
 * 只改各引擎自己的配置文件，不经过会话网关；Key 从不返回给调用方，仅给出末 4 位。
 */
@Service
public class EngineNativeConfigService {

    public static final String DEEPSEEK = "deepseek";
    public static final String OPENAI_COMPATIBLE = "openai-compatible";
    static final String DEEPSEEK_BASE_URL = "https://api.deepseek.com";
    private static final String DEEPSEEK_ENV_KEY = "DEEPSEEK_API_KEY";
    private static final String CUSTOM_ENV_KEY = "OPENAI_API_KEY";
    private static final String CUSTOM_PROVIDER_ID = "forge-custom";

    private final ObjectMapper mapper;
    private final Locations locations;

    @Autowired
    public EngineNativeConfigService(ObjectMapper mapper) {
        this(mapper, Locations.forCurrentUser());
    }

    EngineNativeConfigService(ObjectMapper mapper, Locations locations) {
        this.mapper = mapper;
        this.locations = locations;
    }

    /** 各引擎原生配置文件位置；可注入以便测试。 */
    public record Locations(Path qwenSettings, Path opencodeAuth, Path opencodeConfig, Path piAuth, Path piSettings,
                            Path hermesEnv, Path hermesConfig, Path zcodeProviderConfig, Path dshCredentials) {
        static Locations forCurrentUser() {
            Path home = Path.of(System.getProperty("user.home"));
            Path qwen = env("QWEN_HOME").map(Path::of).orElse(home.resolve(".qwen"));
            Path ocData = env("XDG_DATA_HOME").map(Path::of).orElse(home.resolve(".local").resolve("share")).resolve("opencode");
            Path ocConfig = env("XDG_CONFIG_HOME").map(Path::of).orElse(home.resolve(".config")).resolve("opencode");
            Path pi = home.resolve(".pi").resolve("agent");
            boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
            Path hermes = env("HERMES_HOME").map(Path::of).orElseGet(() -> windows && env("LOCALAPPDATA").isPresent()
                    ? Path.of(env("LOCALAPPDATA").get(), "hermes") : home.resolve(".hermes"));
            return new Locations(qwen.resolve("settings.json"), ocData.resolve("auth.json"), ocConfig.resolve("opencode.json"),
                    pi.resolve("auth.json"), pi.resolve("settings.json"), hermes.resolve(".env"), hermes.resolve("config.yaml"),
                    home.resolve(".zcode").resolve("v2").resolve("provider_config.json"),
                    home.resolve(".dsh").resolve(".credentials.yaml"));
        }

        private static Optional<String> env(String name) {
            return Optional.ofNullable(System.getenv(name)).map(String::trim).filter(value -> !value.isEmpty());
        }
    }

    public enum Engine {
        QWEN("qwen", "Qwen Code", true, "下一轮对话"),
        OPENCODE("opencode", "OpenCode", true, "重启 Forge 引擎服务后"),
        PI("pi", "Pi", false, "下一轮对话"),
        HERMES("hermes", "Hermes Agent", true, "下一轮对话"),
        ZCODE("zcode", "ZCode", true, "下一轮对话"),
        DEEPSEEK_HARNESS("deepseekHarness", "DeepSeek Harness", false, "重启 Forge 引擎服务后");

        final String id;
        final String label;
        final boolean supportsCustom;
        final String takesEffect;

        Engine(String id, String label, boolean supportsCustom, String takesEffect) {
            this.id = id;
            this.label = label;
            this.supportsCustom = supportsCustom;
            this.takesEffect = takesEffect;
        }

        static Engine of(String id) {
            for (Engine engine : values()) if (engine.id.equals(id)) return engine;
            throw new IllegalArgumentException("不支持配置的引擎: " + id);
        }
    }

    public record EngineConfigView(String engine, String label, boolean configured, String provider, String baseUrl,
                                   String model, String keyHint, boolean supportsCustom, String takesEffect,
                                   String configPath, String note) {
    }

    public record ApplyRequest(List<String> engines, String provider, String baseUrl, String apiKey, String model) {
    }

    public record ApplyResult(List<String> applied, List<String> failures, List<EngineConfigView> engines) {
    }

    /** 当前状态，未配置或读取失败也返回一行，便于在面板中恢复。 */
    private record Current(String provider, String baseUrl, String model, String key, String note) {
        static final Current NONE = new Current(null, null, null, null, null);
    }

    public List<EngineConfigView> status() {
        List<EngineConfigView> views = new ArrayList<>();
        for (Engine engine : Engine.values()) {
            Current current;
            try {
                current = read(engine);
            } catch (RuntimeException e) {
                current = new Current(null, null, null, null, "配置文件无法解析：" + e.getMessage());
            }
            views.add(new EngineConfigView(engine.id, engine.label, current.key() != null && current.model() != null,
                    current.provider(), current.baseUrl(), current.model(), keyHint(current.key()),
                    engine.supportsCustom, engine.takesEffect, configPath(engine).toString(), current.note()));
        }
        return views;
    }

    public ApplyResult apply(ApplyRequest request) {
        if (request == null || request.engines() == null || request.engines().isEmpty()) {
            throw new IllegalArgumentException("请至少选择一个引擎");
        }
        String provider = DEEPSEEK.equals(request.provider()) ? DEEPSEEK
                : OPENAI_COMPATIBLE.equals(request.provider()) ? OPENAI_COMPATIBLE : null;
        if (provider == null) throw new IllegalArgumentException("服务商只支持 DeepSeek 或 OpenAI 兼容服务");
        String baseUrl = DEEPSEEK.equals(provider) ? DEEPSEEK_BASE_URL : normalizeBaseUrl(request.baseUrl());
        String model = trim(request.model());
        if (model == null || !model.matches("[A-Za-z0-9._:/@-]{1,128}")) throw new IllegalArgumentException("请填写有效的模型 ID");
        String typedKey = trim(request.apiKey());
        if (typedKey != null && (typedKey.length() < 8 || typedKey.matches(".*[\\s\"'].*"))) {
            throw new IllegalArgumentException("API Key 格式无效");
        }

        Set<Engine> engines = new LinkedHashSet<>();
        for (String id : request.engines()) engines.add(Engine.of(id));
        List<String> applied = new ArrayList<>();
        List<String> failures = new ArrayList<>();
        for (Engine engine : engines) {
            try {
                if (OPENAI_COMPATIBLE.equals(provider) && !engine.supportsCustom) {
                    throw new IllegalArgumentException("仅支持 DeepSeek");
                }
                String key = typedKey != null ? typedKey : reusableKey(engine, baseUrl)
                        .orElseThrow(() -> new IllegalArgumentException("未找到可沿用的 Key，请填写 API Key"));
                write(engine, provider, baseUrl, key, model);
                applied.add(engine.id);
            } catch (RuntimeException e) {
                failures.add(engine.label + "：" + e.getMessage());
            }
        }
        return new ApplyResult(applied, failures, status());
    }

    // ---------------------------------------------------------------- reading

    private Current read(Engine engine) {
        return switch (engine) {
            case QWEN -> readQwen();
            case OPENCODE -> readOpencode();
            case PI -> readPi();
            case HERMES -> readHermes();
            case ZCODE -> readZcode();
            case DEEPSEEK_HARNESS -> readDsh();
        };
    }

    private Current readQwen() {
        ObjectNode settings = readJson(locations.qwenSettings());
        String model = text(settings.path("model").path("name"));
        if (model == null) return Current.NONE;
        for (JsonNode entry : settings.path("modelProviders").path("openai")) {
            if (model.equals(text(entry.path("id")))) {
                String baseUrl = text(entry.path("baseUrl"));
                String envKey = text(entry.path("envKey"));
                String key = envKey == null ? null : text(settings.path("env").path(envKey));
                return new Current(providerOf(baseUrl), baseUrl, model, key, null);
            }
        }
        return new Current(null, null, model, null, "模型未绑定 OpenAI 兼容服务商");
    }

    private Current readOpencode() {
        ObjectNode config = readJson(locations.opencodeConfig());
        String route = text(config.path("model"));
        if (route == null || !route.contains("/")) return Current.NONE;
        String providerId = route.substring(0, route.indexOf('/'));
        String model = route.substring(route.indexOf('/') + 1);
        if (DEEPSEEK.equals(providerId)) {
            String key = text(readJson(locations.opencodeAuth()).path(DEEPSEEK).path("key"));
            return new Current(DEEPSEEK, DEEPSEEK_BASE_URL, model, key, null);
        }
        JsonNode options = config.path("provider").path(providerId).path("options");
        String baseUrl = text(options.path("baseURL"));
        return new Current(baseUrl == null ? providerId : providerOf(baseUrl), baseUrl, model, text(options.path("apiKey")), null);
    }

    private Current readPi() {
        ObjectNode settings = readJson(locations.piSettings());
        String providerId = text(settings.path("defaultProvider"));
        String model = text(settings.path("defaultModel"));
        if (providerId == null) return Current.NONE;
        String key = text(readJson(locations.piAuth()).path(providerId).path("key"));
        return new Current(providerId, DEEPSEEK.equals(providerId) ? DEEPSEEK_BASE_URL : null, model, key, null);
    }

    private Current readHermes() {
        Map<String, String> model = hermesModelBlock(readText(locations.hermesConfig()));
        String providerId = model.get("provider");
        String name = model.getOrDefault("default", model.get("model"));
        if (providerId == null && name == null) return Current.NONE;
        String baseUrl = model.get("base_url");
        String key = DEEPSEEK.equals(providerId) ? envValue(readText(locations.hermesEnv()), DEEPSEEK_ENV_KEY)
                : model.getOrDefault("api_key", envValue(readText(locations.hermesEnv()), CUSTOM_ENV_KEY));
        return new Current("custom".equals(providerId) ? providerOf(baseUrl) : providerId, baseUrl, name, key, null);
    }

    private Current readZcode() {
        JsonNode config = readJson(locations.zcodeProviderConfig()).path("config");
        JsonNode selection = config.path("defaultModelSelection");
        String providerId = text(selection.path("providerId"));
        if (providerId == null) return Current.NONE;
        for (JsonNode rule : config.path("providerConfigRules").path("providerRules")) {
            if (providerId.equals(text(rule.path("providerId")))) {
                String baseUrl = text(rule.path("config").path("api").path("baseUrl"));
                return new Current(DEEPSEEK.equals(providerId) ? DEEPSEEK : providerOf(baseUrl), baseUrl,
                        text(selection.path("modelId")), text(rule.path("config").path("access").path("apiKey")), null);
            }
        }
        return new Current(providerId, null, text(selection.path("modelId")), null, null);
    }

    private Current readDsh() {
        String key = dshKey(readText(locations.dshCredentials()));
        return key == null ? Current.NONE
                : new Current(DEEPSEEK, DEEPSEEK_BASE_URL, "由 Forge 运行配置决定", key,
                "模型取自 KAI_DEEPSEEK_HARNESS_MODEL；Forge 全局 DeepSeek 服务商优先于此 Key");
    }

    /** 沿用 Key：先用本引擎同一服务的 Key，再借用其他引擎同一服务的 Key；绝不跨服务地址借用。 */
    private Optional<String> reusableKey(Engine target, String baseUrl) {
        List<Engine> order = new ArrayList<>(List.of(target));
        for (Engine engine : Engine.values()) if (engine != target) order.add(engine);
        for (Engine engine : order) {
            try {
                Current current = read(engine);
                if (current.key() != null && sameService(current.baseUrl(), baseUrl)) return Optional.of(current.key());
            } catch (RuntimeException ignored) {
                // 损坏的配置不能作为 Key 来源，继续看其他引擎。
            }
        }
        return Optional.empty();
    }

    // ---------------------------------------------------------------- writing

    private void write(Engine engine, String provider, String baseUrl, String key, String model) {
        switch (engine) {
            case QWEN -> writeQwen(provider, baseUrl, key, model);
            case OPENCODE -> writeOpencode(provider, baseUrl, key, model);
            case PI -> writePi(key, model);
            case HERMES -> writeHermes(provider, baseUrl, key, model);
            case ZCODE -> writeZcode(provider, baseUrl, key, model);
            case DEEPSEEK_HARNESS -> writeDsh(key);
        }
    }

    /** 与 Qwen Code 自带 DeepSeek 预设安装器写入的结构一致：env + modelProviders.openai + 认证类型 + 模型。 */
    private void writeQwen(String provider, String baseUrl, String key, String model) {
        ObjectNode settings = readJson(locations.qwenSettings());
        String envKey = DEEPSEEK.equals(provider) ? DEEPSEEK_ENV_KEY : CUSTOM_ENV_KEY;
        ObjectNode providers = objectAt(settings, "modelProviders");
        ArrayNode kept = JsonNodeFactory.instance.arrayNode();
        for (JsonNode entry : providers.path("openai")) {
            boolean replaced = model.equals(text(entry.path("id"))) || (envKey.equals(text(entry.path("envKey")))
                    && sameService(text(entry.path("baseUrl")), baseUrl));
            if (!replaced) kept.add(entry);
        }
        ObjectNode entry = kept.addObject().put("id", model).put("name", model).put("baseUrl", baseUrl).put("envKey", envKey);
        if (DEEPSEEK.equals(provider)) entry.putObject("generationConfig").put("contextWindowSize", 1_000_000);
        providers.set("openai", kept);
        objectAt(settings, "env").put(envKey, key);
        objectAt(objectAt(settings, "security"), "auth").put("selectedType", "openai");
        objectAt(settings, "model").put("name", model);
        writeJson(locations.qwenSettings(), settings);
    }

    private void writeOpencode(String provider, String baseUrl, String key, String model) {
        ObjectNode config = readJson(locations.opencodeConfig());
        if (!config.has("$schema")) config.put("$schema", "https://opencode.ai/config.json");
        String route;
        if (DEEPSEEK.equals(provider)) {
            ObjectNode auth = readJson(locations.opencodeAuth());
            auth.putObject(DEEPSEEK).put("type", "api").put("key", key);
            writeJson(locations.opencodeAuth(), auth);
            route = DEEPSEEK + "/" + model;
        } else {
            ObjectNode custom = objectAt(config, "provider").putObject(CUSTOM_PROVIDER_ID);
            custom.put("npm", "@ai-sdk/openai-compatible").put("name", "Forge 自定义服务");
            custom.putObject("options").put("baseURL", baseUrl).put("apiKey", key);
            custom.putObject("models").putObject(model).put("name", model);
            route = CUSTOM_PROVIDER_ID + "/" + model;
        }
        config.put("model", route).put("small_model", route);
        writeJson(locations.opencodeConfig(), config);
    }

    private void writePi(String key, String model) {
        ObjectNode auth = readJson(locations.piAuth());
        auth.putObject(DEEPSEEK).put("type", "api_key").put("key", key);
        writeJson(locations.piAuth(), auth);
        ObjectNode settings = readJson(locations.piSettings());
        settings.put("defaultProvider", DEEPSEEK).put("defaultModel", model);
        writeJson(locations.piSettings(), settings);
    }

    /** config.yaml 带大量官方注释，只按行改 model 段的几个键，保留其余内容。 */
    private void writeHermes(String provider, String baseUrl, String key, String model) {
        boolean deepseek = DEEPSEEK.equals(provider);
        String env = readText(locations.hermesEnv());
        if (deepseek) writeText(locations.hermesEnv(), setEnvValue(env, DEEPSEEK_ENV_KEY, key));
        String config = readText(locations.hermesConfig());
        config = setHermesModelKey(config, "default", quote(model));
        config = setHermesModelKey(config, "provider", quote(deepseek ? DEEPSEEK : "custom"));
        config = setHermesModelKey(config, "base_url", deepseek ? DEEPSEEK_BASE_URL + "/v1" : baseUrl);
        config = deepseek ? removeHermesModelKey(config, "api_key") : setHermesModelKey(config, "api_key", quote(key));
        writeText(locations.hermesConfig(), config);
    }

    private void writeZcode(String provider, String baseUrl, String key, String model) {
        ObjectNode document = readJson(locations.zcodeProviderConfig());
        if (!document.has("schemaVersion")) document.put("schemaVersion", 1);
        ObjectNode config = objectAt(document, "config");
        ObjectNode ruleContainer = objectAt(config, "providerConfigRules");
        ArrayNode providerRules = ruleContainer.path("providerRules").isArray()
                ? (ArrayNode) ruleContainer.get("providerRules") : ruleContainer.putArray("providerRules");
        String providerId = DEEPSEEK.equals(provider) ? DEEPSEEK : CUSTOM_PROVIDER_ID;
        for (int i = providerRules.size() - 1; i >= 0; i--) {
            if (providerId.equals(text(providerRules.get(i).path("providerId")))) providerRules.remove(i);
        }
        ObjectNode rule = providerRules.addObject().put("providerId", providerId)
                .put("providerName", DEEPSEEK.equals(provider) ? "DeepSeek" : "Forge 自定义服务");
        ObjectNode ruleConfig = rule.putObject("config").put("group", "standard-personal");
        ruleConfig.putObject("access").put("type", "api-key").put("apiKey", key);
        ruleConfig.putObject("api").put("type", "openai-chat-completions")
                .put("baseUrl", DEEPSEEK.equals(provider) ? DEEPSEEK_BASE_URL + "/v1" : baseUrl);
        ruleConfig.putArray("personalModelIds").add(model);
        if (!config.has("modelConfigRules")) {
            config.putObject("modelConfigRules").putArray("providerModelRules");
            ((ObjectNode) config.get("modelConfigRules")).putArray("manualProviderModelRules");
        }
        config.putObject("defaultModelSelection").put("providerId", providerId).put("modelId", model);
        writeJson(locations.zcodeProviderConfig(), document);
    }

    private void writeDsh(String key) {
        String text = readText(locations.dshCredentials());
        String line = "  " + DEEPSEEK_ENV_KEY + ": " + key;
        Matcher existing = Pattern.compile("(?m)^\\s+" + DEEPSEEK_ENV_KEY + ":.*$").matcher(text);
        if (existing.find()) {
            text = existing.replaceFirst(Matcher.quoteReplacement(line));
        } else if (Pattern.compile("(?m)^refs:\\s*$").matcher(text).find()) {
            text = text.replaceFirst("(?m)^refs:\\s*$", Matcher.quoteReplacement("refs:\n" + line));
        } else {
            text = "version: 1\nrefs:\n" + line + "\n";
        }
        writeText(locations.dshCredentials(), text);
    }

    // ---------------------------------------------------------------- helpers

    private Path configPath(Engine engine) {
        return switch (engine) {
            case QWEN -> locations.qwenSettings();
            case OPENCODE -> locations.opencodeConfig();
            case PI -> locations.piSettings();
            case HERMES -> locations.hermesConfig();
            case ZCODE -> locations.zcodeProviderConfig();
            case DEEPSEEK_HARNESS -> locations.dshCredentials();
        };
    }

    static String keyHint(String key) {
        return key == null || key.length() < 8 ? null : "…" + key.substring(key.length() - 4);
    }

    static String normalizeBaseUrl(String value) {
        String url = trim(value);
        if (url == null) throw new IllegalArgumentException("请填写服务地址");
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("服务地址无效");
        }
        if (!Set.of("http", "https").contains(String.valueOf(uri.getScheme()).toLowerCase(Locale.ROOT))
                || uri.getHost() == null || uri.getUserInfo() != null) {
            throw new IllegalArgumentException("服务地址必须是不含账号密码的 HTTP(S) URL");
        }
        return url.replaceAll("/+$", "");
    }

    private static String providerOf(String baseUrl) {
        if (baseUrl == null) return null;
        return sameService(baseUrl, DEEPSEEK_BASE_URL) ? DEEPSEEK : OPENAI_COMPATIBLE;
    }

    /** 同一服务：主机相同即可（DeepSeek 不同引擎分别写 /v1 与根路径）。 */
    static boolean sameService(String first, String second) {
        if (first == null || second == null) return false;
        try {
            String a = URI.create(first.trim()).getHost();
            String b = URI.create(second.trim()).getHost();
            return a != null && a.equalsIgnoreCase(b);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String text(JsonNode node) {
        return node == null || !node.isTextual() || node.asText().isBlank() ? null : node.asText().trim();
    }

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static ObjectNode objectAt(ObjectNode parent, String field) {
        JsonNode node = parent.get(field);
        return node instanceof ObjectNode object ? object : parent.putObject(field);
    }

    private ObjectNode readJson(Path file) {
        String text = readText(file);
        if (text.isBlank()) return JsonNodeFactory.instance.objectNode();
        try {
            JsonNode node = mapper.readTree(text);
            if (node instanceof ObjectNode object) return object;
            throw new IllegalStateException(file.getFileName() + " 不是 JSON 对象");
        } catch (IOException e) {
            throw new IllegalStateException(file.getFileName() + " 不是有效 JSON");
        }
    }

    private void writeJson(Path file, ObjectNode node) {
        try {
            writeText(file, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(node) + "\n");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String readText(Path file) {
        try {
            return Files.exists(file) ? Files.readString(file, StandardCharsets.UTF_8) : "";
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** 首次改动前保留一份 .forge-bak，之后原子替换，避免写一半导致引擎无法启动。 */
    private static void writeText(Path file, String content) {
        try {
            Files.createDirectories(file.getParent());
            Path backup = file.resolveSibling(file.getFileName() + ".forge-bak");
            if (Files.exists(file) && !Files.exists(backup)) Files.copy(file, backup);
            Path temporary = file.resolveSibling(file.getFileName() + ".forge-tmp");
            Files.writeString(temporary, content, StandardCharsets.UTF_8);
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("写入 " + file.getFileName() + " 失败", e);
        }
    }

    static String envValue(String env, String name) {
        Matcher matcher = Pattern.compile("(?m)^" + Pattern.quote(name) + "=(.*)$").matcher(env);
        if (!matcher.find()) return null;
        String value = matcher.group(1).trim().replaceAll("^[\"']|[\"']$", "");
        return value.isEmpty() ? null : value;
    }

    static String setEnvValue(String env, String name, String value) {
        Matcher matcher = Pattern.compile("(?m)^" + Pattern.quote(name) + "=.*$").matcher(env);
        String line = name + "=" + value;
        if (matcher.find()) return matcher.replaceFirst(Matcher.quoteReplacement(line));
        return env.isEmpty() || env.endsWith("\n") ? env + line + "\n" : env + "\n" + line + "\n";
    }

    private static String dshKey(String yaml) {
        Matcher matcher = Pattern.compile("(?m)^\\s+" + DEEPSEEK_ENV_KEY + ":\\s*[\"']?([^\"'\\s]+)").matcher(yaml);
        return matcher.find() ? matcher.group(1) : null;
    }

    private static final Pattern HERMES_MODEL_KEY = Pattern.compile("^  ([a-z_]+):\\s*(.*?)\\s*(#.*)?$");

    /** 返回 model 段内两空格缩进的键值（去引号）。 */
    static Map<String, String> hermesModelBlock(String yaml) {
        Map<String, String> values = new java.util.LinkedHashMap<>();
        int[] range = hermesModelRange(yaml.split("\n", -1));
        String[] lines = yaml.split("\n", -1);
        for (int i = range[0]; i < range[1]; i++) {
            Matcher matcher = HERMES_MODEL_KEY.matcher(lines[i].replace("\r", ""));
            if (matcher.matches() && !matcher.group(2).isEmpty()) {
                values.put(matcher.group(1), matcher.group(2).replaceAll("^[\"']|[\"']$", ""));
            }
        }
        return values;
    }

    static String setHermesModelKey(String yaml, String key, String value) {
        List<String> lines = new ArrayList<>(List.of(yaml.split("\n", -1)));
        int[] range = hermesModelRange(lines.toArray(String[]::new));
        if (range[0] < 0) {
            if (!yaml.isEmpty() && !yaml.endsWith("\n")) lines.add("");
            int at = lines.isEmpty() || !lines.getLast().isEmpty() ? lines.size() : lines.size() - 1;
            lines.add(at, "model:");
            lines.add(at + 1, "  " + key + ": " + value);
            return String.join("\n", lines);
        }
        for (int i = range[0]; i < range[1]; i++) {
            if (lines.get(i).replace("\r", "").startsWith("  " + key + ":")) {
                lines.set(i, "  " + key + ": " + value + (lines.get(i).endsWith("\r") ? "\r" : ""));
                return String.join("\n", lines);
            }
        }
        lines.add(range[0], "  " + key + ": " + value);
        return String.join("\n", lines);
    }

    static String removeHermesModelKey(String yaml, String key) {
        List<String> lines = new ArrayList<>(List.of(yaml.split("\n", -1)));
        int[] range = hermesModelRange(lines.toArray(String[]::new));
        for (int i = range[1] - 1; i >= Math.max(range[0], 0); i--) {
            if (lines.get(i).replace("\r", "").startsWith("  " + key + ":")) lines.remove(i);
        }
        return String.join("\n", lines);
    }

    /** [model: 下一行, 段结束行)；没有 model 段时返回 {-1, -1}。 */
    private static int[] hermesModelRange(String[] lines) {
        int start = -1;
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].replace("\r", "");
            if (start < 0) {
                if (line.matches("^model:\\s*(#.*)?$")) start = i + 1;
            } else if (!line.isBlank() && !line.startsWith(" ") && !line.startsWith("#")) {
                return new int[]{start, i};
            }
        }
        return start < 0 ? new int[]{-1, -1} : new int[]{start, lines.length};
    }
}
