package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 安全切换 ERP 小程序运行模式，并在项目仓外保留原始项目配置。 */
@Service
public class ErpMiniProgramConfigService {

    private static final String FORMAL_APP_ID = "wxfb0d50888e966b01";
    private static final String TEST_APP_ID = "wxe46ae72760c1b8e9";
    private static final String FORMAL_API_BASE_URL = "https://wyoooni.net";
    private static final String WECHAT_SI_VERSION = "0.3.6";
    private static final String WECHAT_SI_PROVIDER = "wx069ba97219f66d99";
    private static final Pattern API_BASE_URL = Pattern.compile("https?://[^\\s'\\\"]+");
    private static final Pattern URL_CONFIG_LINE = Pattern.compile("(?m)^(\\s*url\\s*:\\s*).*(,\\s*(?://.*)?)$");
    private final ObjectMapper mapper;

    public ErpMiniProgramConfigService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /** 读取项目当前运行配置及恢复能力。 */
    public EnvironmentView read(String cwd) {
        Path project = projectDirectory(cwd);
        String appId = readJson(project.resolve("project.config.json")).path("appid").asText("");
        String appSource = readText(project.resolve("app.js"));
        String apiBaseUrl = readApiBaseUrl(appSource);
        boolean wechatSiEnabled = hasWechatSi(readJson(project.resolve("app.json")));
        EnvironmentMode mode = resolveMode(appId, apiBaseUrl, wechatSiEnabled);
        return new EnvironmentView(project.toString(), mode, appId, apiBaseUrl, wechatSiEnabled,
                fullBackupAvailable(project));
    }

    /** 成组应用正式或测试环境配置。 */
    public EnvironmentView apply(String cwd, EnvironmentMode mode, String apiBaseUrl) {
        if (mode == null || mode == EnvironmentMode.CUSTOM) {
            throw new IllegalArgumentException("请选择正式模式或测试模式");
        }
        String targetApiBaseUrl = mode == EnvironmentMode.FORMAL
                ? FORMAL_API_BASE_URL
                : normalizeApiBaseUrl(apiBaseUrl);
        Path project = projectDirectory(cwd);
        createBackupOnce(project);

        ObjectNode projectConfig = readObject(project.resolve("project.config.json"));
        projectConfig.put("appid", mode == EnvironmentMode.FORMAL ? FORMAL_APP_ID : TEST_APP_ID);
        ObjectNode appConfig = readObject(project.resolve("app.json"));
        setWechatSi(appConfig, mode == EnvironmentMode.FORMAL);
        String appSource = replaceApiBaseUrl(readText(project.resolve("app.js")), targetApiBaseUrl);

        writeAllOrRollback(project, projectConfig, appConfig, appSource);
        return read(cwd);
    }

    /** 恢复首次切换前的全部项目配置。 */
    public EnvironmentView restore(String cwd) {
        Path project = projectDirectory(cwd);
        Path backup = backupDirectory(project);
        if (!fullBackupAvailable(project)) {
            throw new IllegalStateException("没有可恢复的完整项目配置备份");
        }
        restoreFile(backup.resolve("project.config.json"), project.resolve("project.config.json"));
        restoreFile(backup.resolve("app.json"), project.resolve("app.json"));
        restoreFile(backup.resolve("app.js"), project.resolve("app.js"));
        return read(cwd);
    }

    private void createBackupOnce(Path project) {
        if (fullBackupAvailable(project)) {
            return;
        }
        Path backup = backupDirectory(project);
        try {
            Files.createDirectories(backup);
            backupProjectConfig(project, backup);
            Files.copy(project.resolve("app.json"), backup.resolve("app.json"), StandardCopyOption.REPLACE_EXISTING);
            Files.copy(project.resolve("app.js"), backup.resolve("app.js"), StandardCopyOption.REPLACE_EXISTING);
            ObjectNode manifest = mapper.createObjectNode();
            manifest.put("projectPath", project.toString());
            mapper.writerWithDefaultPrettyPrinter().writeValue(backup.resolve("manifest.json").toFile(), manifest);
        } catch (IOException e) {
            throw new IllegalStateException("保存原始项目配置备份失败：" + e.getMessage(), e);
        }
    }

    /** 兼容旧版仅备份 AppID 的数据，避免把已切换的测试 AppID 当成原始值。 */
    private void backupProjectConfig(Path project, Path backup) throws IOException {
        Path source = project.resolve("project.config.json");
        Path target = backup.resolve("project.config.json");
        Path legacyBackup = backup.resolve("appid-backup.json");
        if (!Files.isRegularFile(legacyBackup)) {
            Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
            return;
        }
        ObjectNode original = readObject(source);
        JsonNode legacy = mapper.readTree(legacyBackup.toFile());
        String originalAppId = legacy.path("originalAppId").asText("");
        if (!originalAppId.isBlank()) {
            original.put("appid", originalAppId);
        }
        mapper.writerWithDefaultPrettyPrinter().writeValue(target.toFile(), original);
    }

    private void writeAllOrRollback(Path project, ObjectNode projectConfig, ObjectNode appConfig, String appSource) {
        Path backup = backupDirectory(project);
        try {
            writeJson(project.resolve("project.config.json"), projectConfig);
            writeJson(project.resolve("app.json"), appConfig);
            writeText(project.resolve("app.js"), appSource);
        } catch (RuntimeException e) {
            restoreFile(backup.resolve("project.config.json"), project.resolve("project.config.json"));
            restoreFile(backup.resolve("app.json"), project.resolve("app.json"));
            restoreFile(backup.resolve("app.js"), project.resolve("app.js"));
            throw e;
        }
    }

    private ObjectNode readObject(Path file) {
        JsonNode node = readJson(file);
        if (node instanceof ObjectNode object) {
            return object;
        }
        throw new IllegalArgumentException(file.getFileName() + " 必须是 JSON 对象");
    }

    private JsonNode readJson(Path file) {
        requireFile(file);
        try {
            return mapper.readTree(file.toFile());
        } catch (IOException e) {
            throw new IllegalArgumentException("读取 " + file.getFileName() + " 失败：" + e.getMessage(), e);
        }
    }

    private String readText(Path file) {
        requireFile(file);
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalArgumentException("读取 " + file.getFileName() + " 失败：" + e.getMessage(), e);
        }
    }

    private void writeJson(Path target, ObjectNode value) {
        Path temporary = target.resolveSibling(target.getFileName() + ".kai-toolbox.tmp");
        try {
            mapper.writerWithDefaultPrettyPrinter().writeValue(temporary.toFile(), value);
            mapper.readTree(temporary.toFile());
            replaceFile(temporary, target);
        } catch (IOException e) {
            deleteTemporary(temporary);
            throw new IllegalStateException("写入 " + target.getFileName() + " 失败：" + e.getMessage(), e);
        }
    }

    private void writeText(Path target, String value) {
        Path temporary = target.resolveSibling(target.getFileName() + ".kai-toolbox.tmp");
        try {
            Files.writeString(temporary, value, StandardCharsets.UTF_8);
            replaceFile(temporary, target);
        } catch (IOException e) {
            deleteTemporary(temporary);
            throw new IllegalStateException("写入 " + target.getFileName() + " 失败：" + e.getMessage(), e);
        }
    }

    private static void replaceFile(Path temporary, Path target) throws IOException {
        try {
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException atomicFailure) {
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static void restoreFile(Path source, Path target) {
        try {
            Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new IllegalStateException("恢复 " + target.getFileName() + " 失败：" + e.getMessage(), e);
        }
    }

    private static void deleteTemporary(Path temporary) {
        try {
            Files.deleteIfExists(temporary);
        } catch (IOException ignored) {
            // 原始写入异常优先返回。
        }
    }

    private static String replaceApiBaseUrl(String source, String apiBaseUrl) {
        Matcher matcher = URL_CONFIG_LINE.matcher(source);
        if (!matcher.find()) {
            throw new IllegalArgumentException("app.js 未找到 globalData.url 配置行");
        }
        String replacement = matcher.group(1) + "\"" + apiBaseUrl + "\"" + matcher.group(2);
        String result = matcher.replaceFirst(Matcher.quoteReplacement(replacement));
        if (matcher.find()) {
            throw new IllegalArgumentException("app.js 存在多个 url 配置行，无法安全切换");
        }
        return result;
    }

    private static String readApiBaseUrl(String source) {
        Matcher lineMatcher = URL_CONFIG_LINE.matcher(source);
        if (!lineMatcher.find()) {
            return "";
        }
        Matcher urlMatcher = API_BASE_URL.matcher(lineMatcher.group());
        return urlMatcher.find() ? urlMatcher.group() : "";
    }

    private static String normalizeApiBaseUrl(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        if (!API_BASE_URL.matcher(normalized).matches()) {
            throw new IllegalArgumentException("ERP 接口地址必须是完整的 http:// 或 https:// 地址");
        }
        return normalized;
    }

    private static boolean hasWechatSi(JsonNode appConfig) {
        return appConfig.path("plugins").has("WechatSI");
    }

    private ObjectNode plugins(ObjectNode appConfig) {
        JsonNode plugins = appConfig.get("plugins");
        if (plugins instanceof ObjectNode object) {
            return object;
        }
        ObjectNode object = mapper.createObjectNode();
        appConfig.set("plugins", object);
        return object;
    }

    private void setWechatSi(ObjectNode appConfig, boolean enabled) {
        ObjectNode plugins = plugins(appConfig);
        if (!enabled) {
            plugins.remove("WechatSI");
            if (plugins.isEmpty()) {
                appConfig.remove("plugins");
            }
            return;
        }
        ObjectNode wechatSi = mapper.createObjectNode();
        wechatSi.put("version", WECHAT_SI_VERSION);
        wechatSi.put("provider", WECHAT_SI_PROVIDER);
        plugins.set("WechatSI", wechatSi);
    }

    private static EnvironmentMode resolveMode(String appId, String apiBaseUrl, boolean wechatSiEnabled) {
        if (FORMAL_APP_ID.equals(appId) && FORMAL_API_BASE_URL.equals(apiBaseUrl) && wechatSiEnabled) {
            return EnvironmentMode.FORMAL;
        }
        if (TEST_APP_ID.equals(appId) && !wechatSiEnabled) {
            return EnvironmentMode.TEST;
        }
        return EnvironmentMode.CUSTOM;
    }

    private static void requireFile(Path file) {
        if (!Files.isRegularFile(file)) {
            throw new IllegalArgumentException("所选目录不存在 " + file.getFileName() + "：" + file.getParent());
        }
    }

    private static Path projectDirectory(String cwd) {
        if (cwd == null || cwd.isBlank()) {
            throw new IllegalArgumentException("请选择小程序项目目录");
        }
        return Path.of(cwd).toAbsolutePath().normalize();
    }

    private static boolean fullBackupAvailable(Path project) {
        Path backup = backupDirectory(project);
        return Files.isRegularFile(backup.resolve("manifest.json"))
                && Files.isRegularFile(backup.resolve("project.config.json"))
                && Files.isRegularFile(backup.resolve("app.json"))
                && Files.isRegularFile(backup.resolve("app.js"));
    }

    private static Path backupDirectory(Path project) {
        return Path.of(System.getProperty("user.home"), ".kai-toolbox", "backups", "erp-mini-program",
                sha256(project.toString().toLowerCase()));
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("当前 JDK 不支持 SHA-256", e);
        }
    }

    /** 小程序运行模式。 */
    public enum EnvironmentMode {
        /** 正式 AppID、正式 ERP 地址和完整插件。 */
        FORMAL,
        /** 测试 AppID、指定 ERP 地址并跳过受限插件。 */
        TEST,
        /** 当前项目文件不是任一预设模式。 */
        CUSTOM
    }

    /** 当前小程序项目的运行配置视图。 */
    public record EnvironmentView(
            String projectPath,
            EnvironmentMode mode,
            String currentAppId,
            String apiBaseUrl,
            boolean wechatSiEnabled,
            boolean backupAvailable) {
    }
}
