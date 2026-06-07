package com.exceptioncoder.toolbox.resume.service;

import com.exceptioncoder.toolbox.resume.api.dto.ResumeOptimizationRequest;
import com.exceptioncoder.toolbox.resume.api.dto.SectionType;
import com.exceptioncoder.toolbox.resume.api.dto.WholeOptimizationRequest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.Map;

/**
 * 简历优化 prompt 模板的唯一加载点。
 *
 * <p>模板放在 {@code classpath:prompts/resume-optimize-*.txt}，启动时一次性读入内存。
 * 用简单的 {@code {{占位符}}} 文本替换渲染——刻意不引入 Spring AI PromptTemplate / StringTemplate，
 * 避免分隔符语义与简历 JSON 中的花括号冲突，也让「改提示词不改 Java」这一目标最直接。
 */
@Component
public class ResumePromptTemplateLoader {

    private final String systemTemplate;
    private final String wholeTemplate;
    private final Map<SectionType, String> userTemplates = new EnumMap<>(SectionType.class);

    public ResumePromptTemplateLoader() {
        this.systemTemplate = load("prompts/resume-optimize-system.txt");
        this.wholeTemplate = load("prompts/resume-optimize-whole.txt");
        userTemplates.put(SectionType.WORK, load("prompts/resume-optimize-work.txt"));
        userTemplates.put(SectionType.PROJECT, load("prompts/resume-optimize-project.txt"));
        userTemplates.put(SectionType.SELF_INTRO, load("prompts/resume-optimize-self-intro.txt"));
    }

    /** 共享 system 提示词：角色设定 + JSON 输出契约 + 不臆造红线。 */
    public String systemPrompt() {
        return systemTemplate;
    }

    /** 按段类型渲染 user 提示词，填入岗位上下文与原文。 */
    public String render(ResumeOptimizationRequest req) {
        String template = userTemplates.get(req.sectionType());
        if (template == null) {
            throw new IllegalArgumentException("unsupported sectionType: " + req.sectionType());
        }
        return template
                .replace("{{targetRole}}", nullToEmpty(req.targetRole()))
                .replace("{{experienceYears}}", req.experienceYears() == null ? "未提供" : req.experienceYears() + " 年")
                .replace("{{seniorityLevel}}", req.seniorityLevel() == null ? "未指定" : seniorityLabel(req.seniorityLevel().name()))
                .replace("{{otherSectionsBrief}}", nullToEmpty(req.otherSectionsBrief()))
                .replace("{{originalContent}}", nullToEmpty(req.originalContent()));
    }

    /** 渲染整篇优化 user 提示词，填入整张简历 JSON 与岗位上下文。 */
    public String renderWhole(WholeOptimizationRequest req) {
        return wholeTemplate
                .replace("{{targetRole}}", nullToEmpty(req.targetRole()))
                .replace("{{experienceYears}}", req.experienceYears() == null ? "未提供" : req.experienceYears() + " 年")
                .replace("{{seniorityLevel}}", req.seniorityLevel() == null ? "未指定" : seniorityLabel(req.seniorityLevel().name()))
                .replace("{{resumeJson}}", nullToEmpty(req.resumeJson()));
    }

    private static String seniorityLabel(String level) {
        return switch (level) {
            case "JUNIOR" -> "初级（0-2 年）";
            case "INTERMEDIATE" -> "中级（3-5 年）";
            case "SENIOR" -> "高级（6-9 年）";
            case "EXPERT" -> "资深（10+ 年）";
            default -> level;
        };
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private static String load(String path) {
        try {
            return StreamUtils.copyToString(
                    new ClassPathResource(path).getInputStream(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("加载简历优化 prompt 模板失败: " + path, e);
        }
    }
}
