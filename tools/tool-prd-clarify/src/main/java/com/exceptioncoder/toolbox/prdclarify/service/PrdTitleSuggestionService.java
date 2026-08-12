package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import lombok.extern.slf4j.Slf4j;

import java.util.List;

/**
 * PRD 标题建议用例，集中管理 Agent 提示、输出裁决与确定性回退。
 *
 * <p>这是从 {@link PrdClarifyService} 迁出的第一段绞杀式服务，暂由原门面创建并委托。</p>
 */
@Slf4j
public class PrdTitleSuggestionService {

    /** 业务短标题的最大 Unicode code point 数。 */
    private static final int MAX_SUGGESTED_TITLE_CODE_POINTS = 40;

    /** 标题建议的唯一系统提示词。 */
    private static final String TITLE_SUGGESTION_SYSTEM = """
            你是软件需求命名助手。根据系统、模块、需求描述和图片，提炼一个准确的中文业务短标题。
            只输出短标题，不要包含系统名、模块名、序号、引号、句号、解释或 Markdown。
            标题使用“动作 + 对象”或“对象 + 能力”结构，最多 20 个汉字，避免“需求”“功能优化”等空泛表述。
            """;

    /** 一次性 Agent 执行能力。 */
    private final AgentOneShotRunner agentRunner;

    /** PRD 图片输入解析能力。 */
    private final PrdImageInputResolver imageInputResolver;

    /**
     * 创建标题建议服务。
     *
     * @param agentRunner        一次性 Agent 执行能力
     * @param imageInputResolver PRD 图片输入解析能力
     */
    public PrdTitleSuggestionService(AgentOneShotRunner agentRunner,
                                     PrdImageInputResolver imageInputResolver) {
        this.agentRunner = agentRunner;
        this.imageInputResolver = imageInputResolver;
    }

    /**
     * 从需求文本和图片提炼业务短标题，Agent 异常时使用描述首行降级。
     *
     * @param project  系统或项目名称
     * @param module   业务模块名称
     * @param rawInput 需求描述及附件引用
     * @return 确定性格式化后的标题建议
     */
    public TitleSuggestion suggest(String project, String module, String rawInput) {
        String normalizedProject = requireTitlePart(project, "系统");
        String normalizedModule = requireTitlePart(module, "模块");
        String fallback = fallbackShortTitle(rawInput);
        String candidate = requestCandidate(normalizedProject, normalizedModule, rawInput, fallback);
        String shortTitle = normalizeShortTitle(candidate, normalizedProject, normalizedModule, fallback);
        return new TitleSuggestion(shortTitle, String.join("-", normalizedProject, normalizedModule, shortTitle));
    }

    /**
     * 调用 Agent 生成候选标题，异常时返回确定性回退值。
     */
    private String requestCandidate(String project, String module, String rawInput, String fallback) {
        try {
            String prompt = "系统：" + project + "\n模块：" + module + "\n需求描述：\n" + rawInput;
            List<AgentOneShotRunner.ImageInput> images = imageInputResolver.resolve(rawInput);
            return agentRunner.runOnce(
                    TITLE_SUGGESTION_SYSTEM, prompt, null, AgentOneShotRunner.DEFAULT_ENGINE, images);
        } catch (Exception e) {
            log.warn("[prd-clarify] 标题建议生成失败，使用描述摘要", e);
            return fallback;
        }
    }

    /**
     * 校验并收敛完整标题组成部分。
     */
    private static String requireTitlePart(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + "不能为空");
        }
        return value.trim().replaceAll("\\s*-\\s*", "-");
    }

    /**
     * 将不可信模型文本归一化为受长度约束的业务短标题。
     */
    private static String normalizeShortTitle(String value, String project, String module, String fallback) {
        String title = stripFence(value == null ? "" : value.trim())
                .lines()
                .filter(line -> !line.isBlank())
                .findFirst()
                .orElse(fallback)
                .trim()
                .replaceFirst("^(标题|短标题)\\s*[:：]\\s*", "")
                .replaceFirst("^#{1,6}\\s*", "")
                .replaceFirst("^[-*]\\s+", "")
                .replaceAll("^[\"'“”‘’《》]+|[\"'“”‘’《》。！？!?；;]+$", "");
        String combinedPrefix = project + "-" + module + "-";
        if (title.startsWith(combinedPrefix)) {
            title = title.substring(combinedPrefix.length()).trim();
        } else {
            title = removeTitlePrefix(removeTitlePrefix(title, project), module);
        }
        if (title.isBlank()) {
            title = fallback;
        }
        return truncateCodePoints(title, MAX_SUGGESTED_TITLE_CODE_POINTS);
    }

    /**
     * 移除模型重复输出的单个标题前缀。
     */
    private static String removeTitlePrefix(String title, String prefix) {
        if (!title.startsWith(prefix)) {
            return title;
        }
        return title.substring(prefix.length()).replaceFirst("^\\s*[-—:：]\\s*", "").trim();
    }

    /**
     * 从需求描述提取第一个有效文本行作为降级短标题。
     */
    private static String fallbackShortTitle(String rawInput) {
        if (rawInput == null) {
            return "新需求";
        }
        return rawInput.lines()
                .map(String::trim)
                .filter(line -> !line.isBlank())
                .filter(line -> !line.startsWith("![") && !line.startsWith("[📎"))
                .map(line -> line.replaceFirst("^#{1,6}\\s*", "").replaceFirst("^[-*]\\s*", ""))
                .filter(line -> !line.isBlank())
                .findFirst()
                .map(line -> truncateCodePoints(line, MAX_SUGGESTED_TITLE_CODE_POINTS))
                .orElse("新需求");
    }

    /**
     * 按 Unicode code point 安全截断文本。
     */
    private static String truncateCodePoints(String value, int maxCodePoints) {
        int count = value.codePointCount(0, value.length());
        if (count <= maxCodePoints) {
            return value;
        }
        return value.substring(0, value.offsetByCodePoints(0, maxCodePoints));
    }

    /**
     * 去除模型可能输出的 Markdown 围栏。
     */
    private static String stripFence(String value) {
        if (value.startsWith("```")) {
            int start = value.indexOf('\n');
            int end = value.lastIndexOf("```");
            if (start > 0 && end > start) {
                return value.substring(start + 1, end).trim();
            }
        }
        return value;
    }

    /**
     * 确定性标题建议。
     *
     * @param shortTitle 业务短标题
     * @param title      系统、模块与短标题组成的完整标题
     */
    public record TitleSuggestion(String shortTitle, String title) {
    }
}
