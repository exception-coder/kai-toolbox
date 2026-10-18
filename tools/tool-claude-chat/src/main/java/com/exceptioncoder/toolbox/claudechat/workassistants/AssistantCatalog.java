package com.exceptioncoder.toolbox.claudechat.workassistants;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;

/** 随平台发布的可信助理与 Skill；不从浏览器接收任意文件路径或执行指令。 */
@Component
public class AssistantCatalog {
    public List<Definition> list() {
        return List.of(load("weekly", "周报助理", "把真实提交整理成能直接交付的工作周报", "git-weekly-report"),
                load("resources", "资源管家", "整理各环境资源，通过安全入口登记连接与账号", "resource-steward"));
    }

    public Definition required(String id) {
        return list().stream().filter(value -> value.id().equals(id)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("未知工作助理"));
    }

    private Definition load(String id, String name, String description, String skill) {
        try (var input = new ClassPathResource("work-assistants/" + id + "/SKILL.md").getInputStream()) {
            String text = new String(input.readNBytes(32_769), StandardCharsets.UTF_8);
            if (text.length() > 32_768 || !text.contains("name: " + skill)) {
                throw new IllegalStateException("invalid skill");
            }
            return new Definition(id, name, description, skill,
                    HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))), text);
        } catch (Exception failure) {
            throw new IllegalStateException("助理 Skill 未就绪，请检查部署文件");
        }
    }

    /** 平台加载的能力定义；API 不输出完整提示词。 */
    public record Definition(String id, String name, String description, String skill, String hash, String text) { }
}
