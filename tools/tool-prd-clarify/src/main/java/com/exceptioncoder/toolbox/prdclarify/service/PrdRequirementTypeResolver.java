package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;

import java.util.Map;

/**
 * 解析 PRD 需求类型与最大澄清轮数，集中管理显式选择、Agent 分类和确定性降级规则。
 *
 * <p>模型输出被视为不可信输入：类型只能来自固定白名单，轮数必须补默认值并限制在安全范围内。</p>
 */
@Slf4j
public class PrdRequirementTypeResolver {

    /** 缺陷修复类型。 */
    public static final String BUG_FIX = "BUG_FIX";

    /** 现有模块调整类型。 */
    public static final String MODULE_ADJUST = "MODULE_ADJUST";

    /** 新模块类型，也是自动判定失败时的保守降级类型。 */
    public static final String NEW_MODULE = "NEW_MODULE";

    private static final Map<String, Integer> DEFAULT_MAX_QUESTIONS = Map.of(
            BUG_FIX, 2,
            MODULE_ADJUST, 5,
            NEW_MODULE, 8
    );

    private static final String CLASSIFY_SYSTEM_PROMPT = """
            你是需求分诊助手。根据用户提供的标题和描述，判断这是哪种类型的开发需求，
            并给出建议的最大澄清轮数。

            三种类型：
            - BUG_FIX：现有功能出错/行为不符合预期。描述里通常有"应该是…但实际是…""不对""报错""失败"
              这类落差表述，或直接描述了一段有问题的逻辑/代码行为
            - MODULE_ADJUST：调整/优化现有功能的行为、界面、规则——功能本身已经存在，只是要改
            - NEW_MODULE：全新的功能/模块，之前完全不存在

            【严格输出要求】只输出一行 JSON，不加任何说明、前言、结语或 markdown 围栏：
            {"reqType":"BUG_FIX 或 MODULE_ADJUST 或 NEW_MODULE 三选一","maxQuestions":数字}

            maxQuestions 参考：BUG_FIX 给 1-2，MODULE_ADJUST 给 3-5，NEW_MODULE 给 5-8；
            描述已经很清楚具体时取区间下限，描述简略/信息不足时取区间上限。
            """;

    private final AgentOneShotRunner agentRunner;
    private final ObjectMapper objectMapper;

    /**
     * 创建需求类型解析器。
     *
     * @param agentRunner  一次性 Agent 执行能力
     * @param objectMapper JSON 解析器
     */
    public PrdRequirementTypeResolver(AgentOneShotRunner agentRunner, ObjectMapper objectMapper) {
        this.agentRunner = agentRunner;
        this.objectMapper = objectMapper;
    }

    /**
     * 解析需求类型和最大澄清轮数。
     *
     * <p>合法显式类型优先；类型缺失或非法时调用 Agent，且忽略调用方传入的轮数。</p>
     *
     * @param title        需求标题
     * @param rawInput     需求描述
     * @param model        模型名称
     * @param engine       Agent 引擎
     * @param reqType      可选显式需求类型
     * @param maxQuestions 可选显式澄清轮数
     * @return 已验证且可直接持久化的类型与轮数
     */
    public Resolution resolve(String title, String rawInput, String model, String engine,
                              String reqType, Integer maxQuestions) {
        if (reqType != null && DEFAULT_MAX_QUESTIONS.containsKey(reqType)) {
            int effectiveMaxQuestions = maxQuestions != null && maxQuestions > 0
                    ? maxQuestions
                    : defaultMaxQuestions(reqType);
            return new Resolution(reqType, effectiveMaxQuestions);
        }

        Resolution resolution = classify(title, rawInput, model, engine);
        log.info("[prd-clarify] 需求类型自动判定 title='{}' -> reqType={} maxQuestions={}",
                title, resolution.reqType(), resolution.maxQuestions());
        return resolution;
    }

    /**
     * 返回已知需求类型的默认澄清轮数。
     *
     * @param reqType 固定白名单中的需求类型
     * @return 默认澄清轮数
     * @throws IllegalArgumentException 类型不在白名单时
     */
    public static int defaultMaxQuestions(String reqType) {
        Integer value = DEFAULT_MAX_QUESTIONS.get(reqType);
        if (value == null) {
            throw new IllegalArgumentException("不支持的需求类型: " + reqType);
        }
        return value;
    }

    private Resolution classify(String title, String rawInput, String model, String engine) {
        try {
            String userPrompt = "标题：" + title + "\n描述：" + rawInput;
            String raw = agentRunner.runOnce(CLASSIFY_SYSTEM_PROMPT, userPrompt, model, engine);
            JsonNode node = objectMapper.readTree(stripFence(raw == null ? "" : raw.trim()));
            String type = normalizeType(node.path("reqType").asText(""));
            int maxQuestions = node.path("maxQuestions").asInt(0);
            if (maxQuestions <= 0) {
                maxQuestions = defaultMaxQuestions(type);
            }
            return new Resolution(type, Math.max(1, Math.min(10, maxQuestions)));
        } catch (Exception e) {
            log.warn("[prd-clarify] 需求类型自动判定失败，兜底 NEW_MODULE", e);
            return new Resolution(NEW_MODULE, defaultMaxQuestions(NEW_MODULE));
        }
    }

    private static String normalizeType(String reqType) {
        return DEFAULT_MAX_QUESTIONS.containsKey(reqType) ? reqType : NEW_MODULE;
    }

    private static String stripFence(String value) {
        if (!value.startsWith("```")) {
            return value;
        }
        int start = value.indexOf('\n');
        int end = value.lastIndexOf("```");
        return start > 0 && end > start ? value.substring(start + 1, end).trim() : value;
    }

    /** 已验证的需求类型与最大澄清轮数。 */
    public record Resolution(String reqType, int maxQuestions) {
    }
}
