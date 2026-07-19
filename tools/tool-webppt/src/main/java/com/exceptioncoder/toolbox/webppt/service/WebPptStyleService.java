package com.exceptioncoder.toolbox.webppt.service;

import com.exceptioncoder.toolbox.webppt.api.dto.DesignTokenResponse;
import com.exceptioncoder.toolbox.webppt.api.dto.PromptContent;
import com.exceptioncoder.toolbox.webppt.api.dto.SampleInfo;
import com.exceptioncoder.toolbox.webppt.api.dto.SamplesResponse;
import com.exceptioncoder.toolbox.webppt.api.dto.VersionInfo;
import com.exceptioncoder.toolbox.webppt.api.dto.VersionsResponse;
import com.exceptioncoder.toolbox.webppt.exception.WebPptErrorCode;
import com.exceptioncoder.toolbox.webppt.exception.WebPptException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 只读服务：扫描 classpath 下 {@code style/} 目录取得 Design Token / 提示词 / reveal.js 样例 / 版本变更记录。
 * 风格资产以版本化文件为单一真源，本类不做任何风格数据加工，只负责定位、解析、聚合。
 */
@Service
public class WebPptStyleService {

    private static final String LATEST = "latest";
    private static final Pattern CHANGELOG_HEADING = Pattern.compile("^##\\s+(\\S+)\\s*-\\s*(\\d{4}-\\d{2}-\\d{2})\\s*$");

    private final ObjectMapper mapper;
    private final PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();

    public WebPptStyleService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public DesignTokenResponse getDesignToken(String requestedVersion) {
        String version = resolveVersion(requestedVersion);
        Resource resource = resolver.getResource("classpath:style/design-token/" + version + ".json");
        JsonNode theme = readJson(resource, version);
        return DesignTokenResponse.builder().version(version).theme(theme).build();
    }

    public PromptContent getPrompt(String requestedVersion) {
        String version = resolveVersion(requestedVersion);
        Resource resource = resolver.getResource("classpath:style/prompt/" + version + ".md");
        String content = readText(resource, version);
        return PromptContent.builder().version(version).content(content).build();
    }

    public VersionsResponse listVersions() {
        List<String> versions = scanVersions();
        if (versions.isEmpty()) {
            return VersionsResponse.builder().versions(List.of()).build();
        }
        Map<String, String[]> changelog = parseChangelog();
        String latest = versions.get(0);
        List<VersionInfo> infos = new ArrayList<>();
        for (String version : versions) {
            String[] meta = changelog.get(version);
            infos.add(VersionInfo.builder()
                    .version(version)
                    .createdAt(meta != null ? meta[0] : null)
                    .summary(meta != null ? meta[1] : null)
                    .isActive(version.equals(latest))
                    .build());
        }
        return VersionsResponse.builder().versions(infos).build();
    }

    public SamplesResponse listSamples() {
        try {
            Resource[] resources = resolver.getResources("classpath*:style/samples/*/index.html");
            List<SampleInfo> samples = new ArrayList<>();
            for (Resource res : resources) {
                String path = res.getURL().toString().replace('\\', '/');
                String[] parts = path.split("/");
                String id = parts.length >= 2 ? parts[parts.length - 2] : res.getFilename();
                samples.add(SampleInfo.builder().id(id).name(id).build());
            }
            samples.sort(Comparator.comparing(SampleInfo::getId));
            return SamplesResponse.builder().samples(samples).build();
        } catch (IOException e) {
            throw new WebPptException(WebPptErrorCode.STYLE_ASSET_MALFORMED, "无法扫描 reveal.js 样例目录", e);
        }
    }

    public String getSampleContent(String sampleId) {
        Resource resource = resolver.getResource("classpath:style/samples/" + sampleId + "/index.html");
        if (!resource.exists()) {
            throw new WebPptException(WebPptErrorCode.SAMPLE_NOT_FOUND, "样例不存在: " + sampleId);
        }
        return readText(resource, sampleId);
    }

    private String resolveVersion(String requestedVersion) {
        List<String> versions = scanVersions();
        if (versions.isEmpty()) {
            throw new WebPptException(WebPptErrorCode.NO_VERSION_AVAILABLE, "尚未发布任何风格版本");
        }
        if (requestedVersion == null || requestedVersion.isBlank() || LATEST.equalsIgnoreCase(requestedVersion)) {
            return versions.get(0);
        }
        if (versions.contains(requestedVersion)) {
            return requestedVersion;
        }
        throw new WebPptException(WebPptErrorCode.VERSION_NOT_FOUND, "版本不存在: " + requestedVersion);
    }

    /** 扫描 design-token/*.json 得到版本号列表，按语义化版本从新到旧排序。 */
    private List<String> scanVersions() {
        try {
            Resource[] resources = resolver.getResources("classpath*:style/design-token/*.json");
            List<String> versions = new ArrayList<>();
            for (Resource res : resources) {
                String filename = res.getFilename();
                if (filename == null) continue;
                versions.add(filename.substring(0, filename.length() - ".json".length()));
            }
            versions.sort(Comparator.comparing(WebPptStyleService::versionKey, Comparator.reverseOrder()));
            return versions;
        } catch (IOException e) {
            throw new WebPptException(WebPptErrorCode.STYLE_ASSET_MALFORMED, "无法扫描 Design Token 目录", e);
        }
    }

    private Map<String, String[]> parseChangelog() {
        Resource resource = resolver.getResource("classpath:style/CHANGELOG.md");
        if (!resource.exists()) {
            return Map.of();
        }
        String text = readText(resource, "CHANGELOG.md");
        Map<String, String[]> result = new java.util.HashMap<>();
        String[] lines = text.split("\\R");
        for (int i = 0; i < lines.length; i++) {
            Matcher m = CHANGELOG_HEADING.matcher(lines[i].trim());
            if (!m.matches()) continue;
            String version = m.group(1);
            String createdAt = m.group(2);
            String summary = "";
            for (int j = i + 1; j < lines.length; j++) {
                String candidate = lines[j].trim();
                if (candidate.isEmpty()) continue;
                if (candidate.startsWith("#")) break;
                summary = candidate;
                break;
            }
            result.put(version, new String[]{createdAt, summary});
        }
        return result;
    }

    private JsonNode readJson(Resource resource, String version) {
        if (!resource.exists()) {
            throw new WebPptException(WebPptErrorCode.STYLE_ASSET_MALFORMED, "Design Token 文件缺失: " + version);
        }
        try {
            return mapper.readTree(resource.getInputStream());
        } catch (IOException e) {
            throw new WebPptException(WebPptErrorCode.STYLE_ASSET_MALFORMED, "Design Token 文件格式错误: " + version, e);
        }
    }

    private String readText(Resource resource, String label) {
        if (!resource.exists()) {
            throw new WebPptException(WebPptErrorCode.STYLE_ASSET_MALFORMED, "风格资产文件缺失: " + label);
        }
        try {
            return StreamUtils.copyToString(resource.getInputStream(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new WebPptException(WebPptErrorCode.STYLE_ASSET_MALFORMED, "风格资产文件读取失败: " + label, e);
        }
    }

    /**
     * 按语义化版本（v1.10.2 -> "0000100010"）编码为定宽字符串以便比较；
     * 非数字段一律按 0 处理，保证排序稳定、不抛异常，也不会因跨类型比较而报错。
     */
    private static String versionKey(String version) {
        String normalized = version.startsWith("v") ? version.substring(1) : version;
        String[] parts = normalized.split("\\.");
        StringBuilder key = new StringBuilder();
        for (int i = 0; i < 3; i++) {
            int component = 0;
            if (i < parts.length) {
                try {
                    component = Integer.parseInt(parts[i]);
                } catch (NumberFormatException ignored) {
                    // 非数字版本段按 0 处理，仍保持定宽排序
                }
            }
            key.append(String.format("%05d", component));
        }
        return key.toString();
    }
}
