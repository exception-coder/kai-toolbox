package com.exceptioncoder.toolbox.prdclarify.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/** 从项目编码画像的 URL 路由表提取页面入口证据。 */
@Slf4j
@Service
public class PrdRouteContextService {

    private static final Pattern ACTION_URL = Pattern.compile(
            "(?:https?://[^\\s)]+)?/([A-Za-z0-9_./-]+\\.action)(?:\\?[^\\s)]*)?",
            Pattern.CASE_INSENSITIVE);
    private static final int MAX_ROUTE_MAPS = 12;
    private static final int MAX_HITS = 20;

    /** 按项目名和需求正文中的 action URL 查询已登记的路由映射。 */
    public String query(String project, String rawInput) {
        List<String> routeNames = extractRouteNames(rawInput);
        if (routeNames.isEmpty()) {
            return "";
        }
        List<Path> routeMaps = findRouteMaps(project);
        if (routeMaps.isEmpty()) {
            return "";
        }
        List<String> hits = new ArrayList<>();
        for (Path routeMap : routeMaps) {
            collectHits(routeMap, routeNames, hits);
            if (hits.size() >= MAX_HITS) {
                break;
            }
        }
        return String.join("\n", hits);
    }

    /** 返回项目实际匹配的首个路由表。 */
    public String traceTarget(String project) {
        List<Path> targets = findRouteMaps(project);
        return targets.isEmpty() ? null : targets.getFirst().toString();
    }

    private List<String> extractRouteNames(String rawInput) {
        if (rawInput == null || rawInput.isBlank()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        Matcher matcher = ACTION_URL.matcher(rawInput);
        while (matcher.find()) {
            String route = matcher.group(1);
            int slash = route.lastIndexOf('/');
            String name = slash >= 0 ? route.substring(slash + 1) : route;
            result.add(name.toLowerCase(Locale.ROOT));
        }
        return result.stream().distinct().toList();
    }

    private List<Path> findRouteMaps(String project) {
        Path pluginCache = Path.of(System.getProperty("user.home"), ".codex", "plugins", "cache",
                "project-coding-profiles");
        if (!Files.isDirectory(pluginCache)) {
            return List.of();
        }
        String normalizedProject = project == null ? "" : project.trim().toLowerCase(Locale.ROOT);
        try (Stream<Path> paths = Files.find(pluginCache, 8,
                (path, attributes) -> attributes.isRegularFile()
                        && "url-route-map.md".equalsIgnoreCase(path.getFileName().toString()))) {
            List<Path> all = paths.limit(MAX_ROUTE_MAPS).toList();
            if (normalizedProject.isBlank()) {
                return all;
            }
            List<Path> matched = all.stream()
                    .filter(path -> path.toString().toLowerCase(Locale.ROOT).contains(
                            "profiles" + java.io.File.separator + normalizedProject))
                    .toList();
            return matched.isEmpty() ? all : matched;
        } catch (IOException error) {
            log.debug("[prd-discovery] 路由画像扫描失败 project={}: {}", project, error.getMessage());
            return List.of();
        }
    }

    private void collectHits(Path routeMap, List<String> routeNames, List<String> hits) {
        try {
            List<String> lines = Files.readAllLines(routeMap);
            for (int index = 0; index < lines.size() && hits.size() < MAX_HITS; index++) {
                String lower = lines.get(index).toLowerCase(Locale.ROOT);
                if (routeNames.stream().noneMatch(lower::contains)) {
                    continue;
                }
                int from = Math.max(0, index - 1);
                int to = Math.min(lines.size(), index + 3);
                hits.add("来源: " + routeMap + "\n" + String.join("\n", lines.subList(from, to)));
            }
        } catch (IOException error) {
            log.debug("[prd-discovery] 路由画像读取失败 path={}: {}", routeMap, error.getMessage());
        }
    }
}
