package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.OnboardView;
import com.exceptioncoder.toolbox.claudechat.api.dto.OnboardView.OnboardRepo;
import com.exceptioncoder.toolbox.claudechat.api.dto.OnboardView.OnboardStage;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * 「项目初始化流水线」进度镜像：只读 {@code ~/.kai-toolbox/onboard-*.json}（pipeline.mjs 写的状态文件），
 * 把六阶段进度展示到工作台「更多功能」里。后端不调用 pipeline.mjs、不推进流水线——
 * 推进由 yoooni-onboard-pipeline skill 在 Vibe Coding 会话内驱动（机械步骤自动、判断点设人工关卡）。
 */
@Slf4j
@Service
public class OnboardService {

    /** 六阶段固定顺序与内置兜底文案（状态文件缺字段时回退）。 */
    private static final String[][] STAGES = {
            {"fetch", "① 拉取/定位项目", "full", "确认仓库地址与前后端角色"},
            {"profile", "② 项目画像 + CLAUDE.md", "semi", "确认技术栈识别、编码(GBK/UTF-8)"},
            {"knowledge", "③ 业务知识图谱", "human", "模块切分、边界判定、stable 与否"},
            {"coding", "④ 编码 profile", "semi", "编码守护 vs 框架规范定性"},
            {"aggregate", "⑤ 前后端聚合工作区", "full", "确认哪些仓属同一系统"},
            {"topology", "⑥ 跨项目拓扑登记", "human", "确认集成关系是否登记"},
    };

    private final ObjectMapper objectMapper;

    public OnboardService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    private static Path stateDir() {
        return Path.of(System.getProperty("user.home"), ".kai-toolbox");
    }

    /** 列出所有 onboard 状态文件（按 createdAt 倒序）。无目录/无文件返回空列表，绝不抛异常打断面板。 */
    public List<OnboardView> list() {
        Path dir = stateDir();
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        List<OnboardView> out = new ArrayList<>();
        try (Stream<Path> files = Files.list(dir)) {
            files.filter(p -> {
                String n = p.getFileName().toString();
                return n.startsWith("onboard-") && n.endsWith(".json");
            }).forEach(p -> {
                OnboardView v = parse(p);
                if (v != null) {
                    out.add(v);
                }
            });
        } catch (IOException e) {
            log.warn("列出 onboard 状态文件失败：{}", e.getMessage());
            return List.of();
        }
        out.sort(Comparator.comparing(
                (OnboardView v) -> v.createdAt() == null ? "" : v.createdAt()).reversed());
        return out;
    }

    private OnboardView parse(Path file) {
        try {
            JsonNode root = objectMapper.readTree(Files.readString(file));
            String system = text(root, "system");
            if (system == null || system.isBlank()) {
                // 兜底：从文件名 onboard-<系统>.json 推断
                String n = file.getFileName().toString();
                system = n.substring("onboard-".length(), n.length() - ".json".length());
            }
            boolean separated = root.path("separated").asBoolean(false);
            String createdAt = text(root, "createdAt");

            List<OnboardRepo> repos = new ArrayList<>();
            JsonNode reposNode = root.path("repos");
            if (reposNode.isArray()) {
                for (JsonNode r : reposNode) {
                    repos.add(new OnboardRepo(
                            text(r, "path"),
                            r.path("exists").asBoolean(false),
                            textOr(r, "role", "unknown"),
                            stringList(r.path("stack")),
                            textOr(r, "encoding", "unknown")));
                }
            }

            JsonNode stagesNode = root.path("stages");
            List<OnboardStage> stages = new ArrayList<>(STAGES.length);
            for (String[] def : STAGES) {
                JsonNode s = stagesNode.path(def[0]);
                stages.add(new OnboardStage(
                        def[0],
                        textOr(s, "name", def[1]),
                        textOr(s, "auto", def[2]),
                        textOr(s, "gate", def[3]),
                        textOr(s, "status", "pending"),
                        text(s, "at")));
            }
            return new OnboardView(system, separated, createdAt, repos, stages);
        } catch (Exception e) {
            log.warn("解析 onboard 状态文件 {} 失败：{}", file.getFileName(), e.getMessage());
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isTextual() ? v.asText() : null;
    }

    private static String textOr(JsonNode node, String field, String fallback) {
        String v = text(node, field);
        return v == null || v.isBlank() ? fallback : v;
    }

    private static List<String> stringList(JsonNode arr) {
        if (!arr.isArray()) {
            return List.of();
        }
        List<String> out = new ArrayList<>(arr.size());
        for (JsonNode n : arr) {
            out.add(n.asText());
        }
        return out;
    }
}
