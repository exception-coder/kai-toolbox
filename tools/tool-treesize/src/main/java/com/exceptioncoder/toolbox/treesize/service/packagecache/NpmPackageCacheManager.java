package com.exceptioncoder.toolbox.treesize.service.packagecache;

import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
final class NpmPackageCacheManager extends AbstractPackageCacheManager {

    private static final Pattern CACHE = Pattern.compile("(?im)^\\s*cache\\s*=\\s*(.+?)\\s*$");

    @Override
    public String id() {
        return "npm";
    }

    @Override
    protected String displayName() {
        return "npm";
    }

    @Override
    protected Path defaultPath() {
        return localAppData().resolve("npm-cache");
    }

    @Override
    protected Path configPath() {
        return userHome.resolve(".npmrc");
    }

    @Override
    protected String environmentOverride() {
        return System.getenv("NPM_CONFIG_CACHE");
    }

    @Override
    protected String environmentVariableName() {
        return "NPM_CONFIG_CACHE";
    }

    @Override
    protected String readConfiguredPath(Path configPath) {
        Matcher matcher = CACHE.matcher(readUtf8(configPath));
        return matcher.find() ? stripQuotes(matcher.group(1).trim()) : null;
    }

    @Override
    protected String updateConfig(String content, Path destination) {
        String replacement = "cache=" + destination.toString().replace('\\', '/');
        if (CACHE.matcher(content).find()) {
            return CACHE.matcher(content).replaceFirst(Matcher.quoteReplacement(replacement));
        }
        return (content.isBlank() ? "" : ensureTrailingNewline(content))
                + replacement + System.lineSeparator();
    }

    @Override
    protected String configurationMethod() {
        return ".npmrc 用户配置（等价 npm config set cache --global）";
    }

    @Override
    protected String configurationKey() {
        return "cache";
    }

    @Override
    protected String verificationCommand() {
        return "npm config get cache";
    }

    @Override
    protected String cleanupHint() {
        return "确认新配置后，可核对并删除旧 npm-cache；不要改 prefix，避免影响全局命令。";
    }
}
