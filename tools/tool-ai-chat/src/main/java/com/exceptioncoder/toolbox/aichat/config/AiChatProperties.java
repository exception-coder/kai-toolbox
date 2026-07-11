package com.exceptioncoder.toolbox.aichat.config;

import com.exceptioncoder.toolbox.aichat.api.dto.ModelInfo;
import com.exceptioncoder.toolbox.aichat.api.dto.RolePreset;
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
@Getter
@Setter
public class AiChatProperties {

    // 凭据(base-url/api-key)已中心化到 toolbox.llm.gateway（LlmGatewayProperties，配置中心「LLM 网关」块）。
    // 本模块经 LlmGatewayProperties 取实时 baseUrl/apiKey，不再自存一份。

    /** 默认采样温度。 */
    private double temperature = 0.7;

    /** 单次请求超时（秒）。 */
    private int timeoutSeconds = 60;

    /** 拼上下文时取该会话最近多少条消息，超出丢最早，防 token 失控。 */
    private int maxHistoryMessages = 40;

    /** /v1/models 结果缓存 TTL（秒）。 */
    private int modelsCacheTtlSeconds = 300;

    /** New API 内部额度单位换算：1 货币单位 = 多少 quota（默认 500000）。用于把令牌用量换算成金额。 */
    private double quotaPerUnit = 500000;

    /** 用量展示的货币符号。4sapi 等中国服务商为人民币 ¥；字段名带 usd 只是 OpenAI 兼容 schema，与实际币种无关。 */
    private String currencySymbol = "¥";

    /** 模型 id 命中其一即判为多模态（小写子串匹配）。 */
    private List<String> multimodalPatterns = List.of(
            "gpt-4o", "gpt-4.1", "gpt-5", "o1", "o3", "o4", "claude", "gemini", "vision", "qwen-vl", "glm-4v");

    /**
     * 模型 id 命中其一即「不支持自定义温度」（小写子串匹配）：推理模型（o 系列、gpt-5 系列等）
     * 只接受默认温度，传 temperature 会被网关拒绝，故对其不下发该参数。
     */
    private List<String> noTemperaturePatterns = List.of(
            "o1", "o3", "o4-mini", "gpt-5", "reasoner", "thinking", "qwq");

    /** 视频生成模型名家族（小写子串匹配）；与 pricing 端点/标签共同把模型归类为 video。 */
    private List<String> videoModelPatterns = List.of(
            "veo", "sora", "kling", "runway", "pika", "seedance", "hailuo", "wan-video", "minimax-video");

    /** 绘图模型名家族；与 image-generation/edits 端点共同把模型归类为 image。 */
    private List<String> imageModelPatterns = List.of(
            "dall-e", "dalle", "gpt-image", "midjourney", "flux", "stable-diffusion", "sdxl",
            "cogview", "wanx", "seedream", "kolors", "irag");

    /** 其它非对话/绘图/视频模型名家族（音频/向量/重排等），无对应窗口形态，直接从清单剔除。 */
    private List<String> otherModelPatterns = List.of(
            "whisper", "-tts", "tts-", "embedding", "embed-", "rerank", "moderation");

    /** 可选 id→展示名美化映射；命中则覆盖默认（默认展示名=id）。 */
    private Map<String, String> modelLabels = Map.of();

    /** /v1/models 不可用时回退的静态模型清单，保证下拉不空。 */
    private List<ModelInfo> fallbackModels = List.of(
            new ModelInfo("gpt-4o", "GPT-4o", true, true, List.of(), null, 0, "chat"),
            new ModelInfo("gpt-4o-mini", "GPT-4o mini", true, true, List.of(), null, 0, "chat"),
            new ModelInfo("deepseek-chat", "DeepSeek V3", false, true, List.of(), null, 0, "chat"));

    /** 内置角色预设。 */
    private List<RolePreset> presets = List.of(
            new RolePreset("default", "默认助手", ""),
            new RolePreset("translator", "翻译助手",
                    "你是专业翻译。把用户输入在中英之间互译，只输出译文，不要解释。"),
            new RolePreset("coder", "编程助手",
                    "你是资深工程师。给出简洁、可运行的代码与关键说明，避免废话。"));

    /** 命令执行工具配置(默认关闭,高风险能力须显式开启)。 */
    private Shell shell = new Shell();

    /**
     * 命令执行工具(runCommand)的安全护栏配置。
     *
     * <p>默认 {@code enabled=false}——工具压根不注册。开启后仍受多层护栏约束:
     * 不经 shell(ProcessBuilder 直接分词,杜绝 ; | &gt; 等注入)、前缀白名单、
     * 元字符/路径逃逸拦截、工作目录沙箱、超时与输出截断。白名单本身即「预先确认」:
     * 你把某命令加入白名单 = 提前批准它,故第一版不做运行时弹框确认。</p>
     */
    @Getter
    @Setter
    public static class Shell {

        /** 总开关。默认关闭——不显式置 true 则 runCommand 工具不存在。 */
        private boolean enabled = false;

        /** 允许执行的命令前缀白名单(按空格分词后,与命令开头逐段匹配)。默认仅只读安全命令。 */
        private List<String> allow = List.of(
                "git status", "git log", "git diff", "git branch", "git show",
                "ls", "dir", "cat", "type", "echo",
                "node --version", "npm --version", "java -version", "mvn --version");

        /** 工作目录沙箱;命令在此目录下执行,不可逃逸。默认 ~/.kai-toolbox/ai-chat-workspace。 */
        private String workdir = System.getProperty("user.home") + "/.kai-toolbox/ai-chat-workspace";

        /** 单条命令超时(秒);超时强杀进程并返回超时错误。 */
        private int timeoutSeconds = 30;

        /** 输出(stdout+stderr)最大返回字符数,超出截断,防刷屏与 token 失控。 */
        private int maxOutputChars = 4000;
    }
}
