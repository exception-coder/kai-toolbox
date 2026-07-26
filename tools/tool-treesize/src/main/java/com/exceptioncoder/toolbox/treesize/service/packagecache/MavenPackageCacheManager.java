package com.exceptioncoder.toolbox.treesize.service.packagecache;

import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
final class MavenPackageCacheManager extends AbstractPackageCacheManager {

    private static final Pattern REPOSITORY = Pattern.compile(
            "(?is)<localRepository>\\s*(.*?)\\s*</localRepository>");
    private static final Pattern SETTINGS = Pattern.compile("(?is)<settings(?:\\s[^>]*)?>");

    @Override
    public String id() {
        return "maven";
    }

    @Override
    protected String displayName() {
        return "Maven";
    }

    @Override
    protected Path defaultPath() {
        return userHome.resolve(".m2").resolve("repository");
    }

    @Override
    protected Path configPath() {
        return userHome.resolve(".m2").resolve("settings.xml");
    }

    @Override
    protected String environmentOverride() {
        return null;
    }

    @Override
    protected String environmentVariableName() {
        return "";
    }

    @Override
    protected String readConfiguredPath(Path configPath) {
        Matcher matcher = REPOSITORY.matcher(readUtf8(configPath));
        return matcher.find() ? unescapeXml(matcher.group(1).trim()) : null;
    }

    @Override
    protected String updateConfig(String content, Path destination) {
        String element = "<localRepository>" + escapeXml(destination.toString()) + "</localRepository>";
        if (REPOSITORY.matcher(content).find()) {
            return REPOSITORY.matcher(content).replaceFirst(Matcher.quoteReplacement(element));
        }
        Matcher settings = SETTINGS.matcher(content);
        if (settings.find()) {
            return content.substring(0, settings.end()) + System.lineSeparator()
                    + "  " + element + content.substring(settings.end());
        }
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" + System.lineSeparator()
                + "<settings xmlns=\"http://maven.apache.org/SETTINGS/1.0.0\">" + System.lineSeparator()
                + "  " + element + System.lineSeparator()
                + "</settings>" + System.lineSeparator();
    }

    @Override
    protected String configurationMethod() {
        return "settings.xml 用户配置";
    }

    @Override
    protected String configurationKey() {
        return "settings/localRepository";
    }

    @Override
    protected String verificationCommand() {
        return "mvn help:evaluate -Dexpression=settings.localRepository -q -DforceStdout";
    }

    @Override
    protected String cleanupHint() {
        return "确认新仓库生效后再处理旧 .m2/repository；现有 Java 项目后续构建会重新下载依赖。";
    }

    private static String escapeXml(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String unescapeXml(String value) {
        return value.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
    }
}
