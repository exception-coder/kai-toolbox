package com.exceptioncoder.toolbox.treesize.service.packagecache;

import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
final class PipPackageCacheManager extends AbstractPackageCacheManager {

    private static final Pattern CACHE = Pattern.compile("(?im)^\\s*cache-dir\\s*=\\s*(.+?)\\s*$");
    private static final Pattern GLOBAL = Pattern.compile("(?im)^\\s*\\[global]\\s*$");

    @Override
    public String id() {
        return "pip";
    }

    @Override
    protected String displayName() {
        return "pip";
    }

    @Override
    protected Path defaultPath() {
        return localAppData().resolve("pip").resolve("Cache");
    }

    @Override
    protected Path configPath() {
        return appData().resolve("pip").resolve("pip.ini");
    }

    @Override
    protected String environmentOverride() {
        return System.getenv("PIP_CACHE_DIR");
    }

    @Override
    protected String environmentVariableName() {
        return "PIP_CACHE_DIR";
    }

    @Override
    protected String readConfiguredPath(Path configPath) {
        Matcher matcher = CACHE.matcher(readUtf8(configPath));
        return matcher.find() ? stripQuotes(matcher.group(1).trim()) : null;
    }

    @Override
    protected String updateConfig(String content, Path destination) {
        String replacement = "cache-dir = " + destination;
        if (CACHE.matcher(content).find()) {
            return CACHE.matcher(content).replaceFirst(Matcher.quoteReplacement(replacement));
        }
        Matcher global = GLOBAL.matcher(content);
        if (global.find()) {
            return content.substring(0, global.end()) + System.lineSeparator()
                    + replacement + content.substring(global.end());
        }
        return (content.isBlank() ? "" : ensureTrailingNewline(content))
                + "[global]" + System.lineSeparator()
                + replacement + System.lineSeparator();
    }

    @Override
    protected String configurationMethod() {
        return "pip.ini 用户配置";
    }

    @Override
    protected String configurationKey() {
        return "[global] cache-dir";
    }

    @Override
    protected String verificationCommand() {
        return "pip cache dir";
    }

    @Override
    protected String cleanupHint() {
        return "确认新配置后，可核对旧 pip Cache；清除后安装包需要重新下载，部分 wheel 会重建。";
    }
}
