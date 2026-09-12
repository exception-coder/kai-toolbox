package com.exceptioncoder.toolbox.foreconsult.infrastructure.teaching;

import com.exceptioncoder.toolbox.foreconsult.domain.teaching.OrderDraft;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingOrderRules;
import io.agentscope.core.tool.Tool;
import io.agentscope.core.tool.ToolParam;
import java.util.List;

/** AgentScope 注解工具适配；只读草稿与模拟 ERP。 */
public final class TeachingOrderTools {
    private final int maximum;
    private final TeachingTrace trace;

    TeachingOrderTools(int maximum, TeachingTrace trace) {
        this.maximum = maximum;
        this.trace = trace;
    }

    @Tool(name = "propose_draft", description = "提议未提交的订单草稿。未知字段传 null；Java 校验款号和数量。",
            readOnly = true, concurrencySafe = false)
    public OrderDraft proposeDraft(
            @ToolParam(name = "styleCode", description = "用户明确给出的款号，未知时 null。", required = false)
            String styleCode,
            @ToolParam(name = "quantity", description = "用户明确给出的整数数量，未知时 null。", required = false)
            Integer quantity) {
        OrderDraft draft = TeachingOrderRules.validate(styleCode, quantity, maximum);
        trace.add("TOOL", "propose_draft · 款号=" + styleCode + " · 数量=" + quantity);
        trace.add("VALIDATION", draft.status() + " · " + String.join("；", draft.issues()));
        trace.draft(draft);
        return draft;
    }

    /** 单独注册查询对象，保证开关影响实际工具集合。 */
    public static final class Lookup {
        private final TeachingTrace trace;

        Lookup(TeachingTrace trace) {
            this.trace = trace;
        }

        @Tool(name = "lookup_sku", description = "查询模拟 ERP 候选款号，多个结果必须澄清，无真实 ERP 访问。",
                readOnly = true, concurrencySafe = true)
        public List<String> lookup(
                @ToolParam(name = "styleCode", description = "待核对的款号。") String styleCode) {
            List<String> matches = TeachingOrderRules.lookup(styleCode);
            trace.add("TOOL", "lookup_sku(" + styleCode + ") → " + matches);
            return matches;
        }
    }
}
