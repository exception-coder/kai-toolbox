package com.exceptioncoder.toolbox.llm.spi;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;
import java.util.Set;
import java.util.function.Consumer;

/**
 * 公共一次性 Agent 能力：按类型注入已有 Spring Bean，提交任务并获取文本或流式结果。
 *
 * <p>接口定义在 toolbox-llm，使各 tool 模块通过此接口注入能力，
 * 而无需直接依赖 tool-claude-chat（避免跨工具 Maven 强耦合）。
 * 实现类（{@code AgentOneShotService}）在 tool-claude-chat，由 Spring 在运行时注入。
 *
 * <p>调用此接口应在虚拟线程中进行，不要在 Spring MVC 请求线程中直接调。
 */
public interface AgentOneShotRunner {
    String DEFAULT_ENGINE = "claude";
    String TOOL_POLICY_DISABLED = "disabled";
    String TOOL_POLICY_CONSULT_READONLY = "consult-readonly";

    /** 返回实现声明支持的引擎；空集合表示未声明，不代表安装、登录或额度检查通过。 */
    default Set<String> supportedEngines() {
        return Set.of();
    }

    /** 使用默认引擎执行纯文本任务并返回全文；禁用工具，失败向调用方抛出。 */
    default String runText(String userPrompt) {
        return runOnce(ExecutionRequest.textBuilder().userPrompt(userPrompt).build());
    }

    /** 使用默认引擎执行纯文本任务；回调增量并返回全文，禁用工具。 */
    default String streamText(String userPrompt, Consumer<String> onDelta) {
        return stream(ExecutionRequest.textBuilder().userPrompt(userPrompt).build(), onDelta);
    }

    /**
     * 流式执行：每产出一片文本回调一次 {@code onDelta}，全部完成后返回全文。
     *
     * @param systemPrompt 系统提示词
     * @param userPrompt   用户消息（本次任务上下文）
     * @param model        模型名称，传 {@code null} 则由实现类使用默认模型
     * @param onDelta      文本增量回调，可为 {@code null}（等价于非流式执行）
     * @return 完整文本
     * @throws RuntimeException 引擎不可用、超时或推理失败时
     */
    default String stream(String systemPrompt, String userPrompt, String model, Consumer<String> onDelta) {
        return stream(systemPrompt, userPrompt, model, DEFAULT_ENGINE, onDelta);
    }

    String stream(String systemPrompt, String userPrompt, String model, String engine, Consumer<String> onDelta);

    /**
     * 非流式执行：等待推理完成后返回全文。
     *
     * @param systemPrompt 系统提示词
     * @param userPrompt   用户消息
     * @param model        模型名称，传 {@code null} 则使用默认模型
     * @return 完整文本
     */
    default String runOnce(String systemPrompt, String userPrompt, String model) {
        return runOnce(systemPrompt, userPrompt, model, DEFAULT_ENGINE);
    }

    String runOnce(String systemPrompt, String userPrompt, String model, String engine);

    /**
     * 按指定的开发会话执行配置运行独立任务。
     *
     * @param request 一次性任务及其运行配置；敏感字段仅供底层引擎使用
     * @return 完整文本
     */
    default String runOnce(ExecutionRequest request) {
        return runOnce(request.systemPrompt(), request.userPrompt(), request.model(), request.engine());
    }

    /** Executes one task and returns the observable facts emitted by the runtime. */
    default ObservedResult runObserved(ExecutionRequest request) {
        return new ObservedResult(runOnce(request), null, null, null, null);
    }

    /** 带图片运行并返回运行时可观测身份；默认实现兼容仅支持文本的执行器。 */
    default ObservedResult runObserved(ExecutionRequest request, List<ImageInput> images) {
        return new ObservedResult(
                runOnce(request.systemPrompt(), request.userPrompt(), request.model(), request.engine(), images),
                null, null, null, null);
    }

    /**
     * 按指定执行配置流式运行任务，允许调用方同时传入项目目录和只读工具策略。
     *
     * @param request 一次性任务及其运行配置
     * @param onDelta 文本增量回调，可为 {@code null}
     * @return 完整文本
     */
    default String stream(ExecutionRequest request, Consumer<String> onDelta) {
        return stream(request.systemPrompt(), request.userPrompt(), request.model(), request.engine(), onDelta);
    }

    /** 流式执行，附带图片（真正多模态，Claude 能看到图片内容）。默认委托纯文本版本，图片被忽略。 */
    default String stream(String systemPrompt, String userPrompt, String model,
                          Consumer<String> onDelta, List<ImageInput> images) {
        return stream(systemPrompt, userPrompt, model, DEFAULT_ENGINE, onDelta, images);
    }

    default String stream(String systemPrompt, String userPrompt, String model, String engine,
                          Consumer<String> onDelta, List<ImageInput> images) {
        return stream(systemPrompt, userPrompt, model, engine, onDelta);
    }

    /** 非流式执行，附带图片；语义同 {@link #stream(String, String, String, Consumer, List)}。 */
    default String runOnce(String systemPrompt, String userPrompt, String model, List<ImageInput> images) {
        return runOnce(systemPrompt, userPrompt, model, DEFAULT_ENGINE, images);
    }

    default String runOnce(String systemPrompt, String userPrompt, String model, String engine,
                           List<ImageInput> images) {
        return runOnce(systemPrompt, userPrompt, model, engine);
    }

    /** mimeType 仅支持 image/jpeg|png|gif|webp，调用方需自行过滤。 */
    record ImageInput(String base64Data, String mimeType) {
    }

    /** 一次性任务的强类型执行配置。 */
    record ExecutionRequest(
            String systemPrompt,
            String userPrompt,
            String cwd,
            String model,
            String engine,
            String reasoningEffort,
            String speed,
            String apiBaseUrl,
            String authToken,
            String codexHome,
            String toolPolicy
    ) {
        /** 构造禁用工具的纯文本请求；textBuilder 提供命名参数，模型为空时使用引擎默认值。 */
        public static ExecutionRequest text(String systemPrompt, String userPrompt, String model, String engine) {
            String selectedEngine = engine == null || engine.isBlank() ? DEFAULT_ENGINE : engine;
            return new ExecutionRequest(systemPrompt, userPrompt, null, model, selectedEngine,
                    null, null, null, null, null, TOOL_POLICY_DISABLED);
        }

        /** 创建纯文本请求构建器，每次调用返回独立实例。 */
        public static AgentTextRequestBuilder textBuilder() {
            return new AgentTextRequestBuilder();
        }
    }

    record ObservedResult(
            String text,
            String traceId,
            JsonNode evidence,
            JsonNode trajectory,
            String executionSessionId
    ) {
    }
}
