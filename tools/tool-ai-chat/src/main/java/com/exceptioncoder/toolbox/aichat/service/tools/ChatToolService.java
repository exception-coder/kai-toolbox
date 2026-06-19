package com.exceptioncoder.toolbox.aichat.service.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.agent.tool.ToolSpecifications;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.lang.reflect.Method;
import java.lang.reflect.Parameter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 工具登记与执行:扫描 {@link ChatTools} 上的 {@link Tool} 方法,生成发给网关的
 * {@link ToolSpecification} 列表,并按模型回传的 {@link ToolExecutionRequest} 反射执行。
 *
 * <p>不引入 langchain4j 主包的 DefaultToolExecutor(那会拖入整个 AiServices 体系),
 * 这里自写极简执行器:参数名取 {@link P} 注解,值从 arguments JSON 按名绑定,
 * 支持 String/数值/布尔基本类型,够当前工具用。「LLM 提议、代码裁决」——
 * 模型只给出要调哪个工具及入参,真正执行与校验在代码侧。</p>
 */
@Service
public class ChatToolService {

    private static final Logger log = LoggerFactory.getLogger(ChatToolService.class);

    private final ObjectMapper json;
    private final List<ToolSpecification> specifications = new ArrayList<>();
    private final Map<String, Method> methodsByName = new HashMap<>();
    private final Map<String, Object> beanByMethod = new HashMap<>();

    public ChatToolService(List<ChatToolProvider> providers, ObjectMapper json) {
        this.json = json;
        for (ChatToolProvider provider : providers) {
            specifications.addAll(ToolSpecifications.toolSpecificationsFrom(provider));
            for (Method m : provider.getClass().getDeclaredMethods()) {
                if (m.isAnnotationPresent(Tool.class)) {
                    methodsByName.put(m.getName(), m);
                    beanByMethod.put(m.getName(), provider);
                }
            }
        }
        log.info("[ai-chat] 已登记 {} 个对话工具: {}", specifications.size(), methodsByName.keySet());
    }

    /** 发往网关的工具规格(空则本轮不带工具)。 */
    public List<ToolSpecification> specifications() {
        return specifications;
    }

    public boolean hasTools() {
        return !specifications.isEmpty();
    }

    /** 执行一次工具调用,返回喂回模型的文本结果。异常统一转可读错误串,不向上抛。 */
    public String execute(ToolExecutionRequest req) {
        Method m = methodsByName.get(req.name());
        if (m == null) {
            return "未知工具: " + req.name();
        }
        try {
            Object[] args = bindArgs(m, req.arguments());
            Object result = m.invoke(beanByMethod.get(req.name()), args);
            return result == null ? "" : result.toString();
        } catch (Exception e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            log.warn("[ai-chat] 工具 {} 执行失败: {}", req.name(), cause.toString());
            return "工具执行失败: " + cause.getMessage();
        }
    }

    /** 把 arguments(JSON 对象)按方法参数的 @P 名绑定为实参。 */
    private Object[] bindArgs(Method m, String argumentsJson) throws Exception {
        Parameter[] params = m.getParameters();
        if (params.length == 0) {
            return new Object[0];
        }
        JsonNode root = (argumentsJson == null || argumentsJson.isBlank())
                ? json.createObjectNode()
                : json.readTree(argumentsJson);
        // 单参数工具:直接取 JSON 里第一个字段值,避开参数名歧义(未带 -parameters 时为 arg0)。
        if (params.length == 1 && root.isObject() && root.size() >= 1) {
            JsonNode only = root.fields().next().getValue();
            return new Object[]{convert(only, params[0].getType())};
        }
        List<Object> out = new ArrayList<>(params.length);
        for (Parameter p : params) {
            // 参数名与 ToolSpecifications 生成 spec 同源(parameter.getName()),故网关回传能对上。
            JsonNode v = root.get(p.getName());
            out.add(convert(v, p.getType()));
        }
        return out.toArray();
    }

    /** 基本类型转换;缺值给类型零值/空串,避免 NPE。 */
    private Object convert(JsonNode v, Class<?> type) {
        boolean missing = v == null || v.isNull();
        if (type == String.class) {
            return missing ? "" : (v.isTextual() ? v.asText() : v.toString());
        }
        if (type == int.class || type == Integer.class) {
            return missing ? 0 : v.asInt();
        }
        if (type == long.class || type == Long.class) {
            return missing ? 0L : v.asLong();
        }
        if (type == double.class || type == Double.class) {
            return missing ? 0d : v.asDouble();
        }
        if (type == boolean.class || type == Boolean.class) {
            return !missing && v.asBoolean();
        }
        // 兜底:其它类型按字符串喂入
        return missing ? null : v.asText();
    }
}
