package com.exceptioncoder.toolbox.aichat.config;

import com.exceptioncoder.toolbox.aichat.api.dto.ModelInfo;
import com.exceptioncoder.toolbox.aichat.api.dto.RolePreset;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 「AI 对话」模块配置，绑定 {@code toolbox.ai-chat.*}。
 *
 * <p>标 {@link Refreshable} 纳入运行时动态配置中心：base-url / api-key / 默认参数 / 模型推断规则
 * 均可在线改、不重启生效。改动后 {@code ChatModelFactory} 与 {@code ModelCatalogService} 会清缓存重建。
 * api-key 本地明文存（单机单用户，与 claude-chat 一致口径）。</p>
 */
@Component
@ConfigurationProperties(prefix = "toolbox.ai-chat")
@Refreshable(name = "AI 对话")
@Getter
@Setter
public class AiChatProperties {

    /** 4sapi（OpenAI 兼容）基址，须含 /v1。 */
    private String baseUrl = "https://4sapi.com/v1";

    /** API Key；建议走环境变量 TOOLBOX_AI_CHAT_API_KEY。 */
    private String apiKey = "";

    /** 默认采样温度。 */
    private double temperature = 0.7;

    /** 单次请求超时（秒）。 */
    private int timeoutSeconds = 60;

    /** 拼上下文时取该会话最近多少条消息，超出丢最早，防 token 失控。 */
    private int maxHistoryMessages = 40;

    /** /v1/models 结果缓存 TTL（秒）。 */
    private int modelsCacheTtlSeconds = 300;

    /** 模型 id 命中其一即判为多模态（小写子串匹配）。 */
    private List<String> multimodalPatterns = List.of(
            "gpt-4o", "gpt-4.1", "gpt-5", "o1", "o3", "o4", "claude", "gemini", "vision", "qwen-vl", "glm-4v");

    /**
     * 模型 id 命中其一即「不支持自定义温度」（小写子串匹配）：推理模型（o 系列、gpt-5 系列等）
     * 只接受默认温度，传 temperature 会被网关拒绝，故对其不下发该参数。
     */
    private List<String> noTemperaturePatterns = List.of(
            "o1", "o3", "o4-mini", "gpt-5", "reasoner", "thinking", "qwq");

    /** 可选 id→展示名美化映射；命中则覆盖默认（默认展示名=id）。 */
    private Map<String, String> modelLabels = Map.of();

    /** /v1/models 不可用时回退的静态模型清单，保证下拉不空。 */
    private List<ModelInfo> fallbackModels = List.of(
            new ModelInfo("gpt-4o", "GPT-4o", true, true),
            new ModelInfo("gpt-4o-mini", "GPT-4o mini", true, true),
            new ModelInfo("deepseek-chat", "DeepSeek V3", false, true));

    /** 内置角色预设。 */
    private List<RolePreset> presets = List.of(
            new RolePreset("default", "默认助手", ""),
            new RolePreset("translator", "翻译助手",
                    "你是专业翻译。把用户输入在中英之间互译，只输出译文，不要解释。"),
            new RolePreset("coder", "编程助手",
                    "你是资深工程师。给出简洁、可运行的代码与关键说明，避免废话。"));
}
