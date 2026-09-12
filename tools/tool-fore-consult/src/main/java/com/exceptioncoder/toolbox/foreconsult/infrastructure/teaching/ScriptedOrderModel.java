package com.exceptioncoder.toolbox.foreconsult.infrastructure.teaching;

import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingScenario;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.TextBlock;
import io.agentscope.core.message.ToolUseBlock;
import io.agentscope.core.model.ChatModelBase;
import io.agentscope.core.model.ChatResponse;
import io.agentscope.core.model.GenerateOptions;
import io.agentscope.core.model.ToolSchema;
import io.agentscope.core.util.JsonUtils;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import reactor.core.publisher.Flux;

/** 固定场景脚本，不解析自然语言，不生成伪造的模型用量。 */
final class ScriptedOrderModel extends ChatModelBase {
    private final TeachingScenario scenario;
    private final boolean lookupEnabled;
    private int call;

    ScriptedOrderModel(TeachingScenario scenario, boolean lookupEnabled) {
        this.scenario = scenario;
        this.lookupEnabled = lookupEnabled;
    }

    @Override
    public String getModelName() {
        return "scripted-demo";
    }

    @Override
    protected Flux<ChatResponse> doStream(List<Msg> messages, List<ToolSchema> tools, GenerateOptions options) {
        return Flux.defer(() -> {
            int step = call++;
            if (step == 0 && lookupEnabled) {
                return tool("lookup_sku", Map.of("styleCode", scenario.style()));
            }
            if (step == (lookupEnabled ? 1 : 0)) {
                Map<String, Object> arguments = new HashMap<>(4);
                arguments.put("styleCode", scenario.style());
                arguments.put("quantity", scenario.quantity());
                return tool("propose_draft", arguments);
            }
            return Flux.just(ChatResponse.builder().content(List.of(TextBlock.builder()
                    .text("演示完成，请以 Java 校验后的结构化草稿和问题列表为准。").build())).build());
        });
    }

    private Flux<ChatResponse> tool(String name, Map<String, Object> input) {
        return Flux.just(ChatResponse.builder().content(List.of(ToolUseBlock.builder()
                // SDK 校验 content，工具调用读取 input；两者必须表达同一份参数。
                .id("demo-" + call).name(name).input(input)
                .content(JsonUtils.getJsonCodec().toJson(input)).build())).build());
    }
}
