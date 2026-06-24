package com.exceptioncoder.toolbox.visitoranalysis.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class VisitorAnalysisToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "visitor-analysis"; }
    @Override public String name()        { return "访客分析"; }
    @Override public String icon()        { return "user-search"; }
    @Override public String route()       { return "/tools/visitor-analysis"; }
    @Override public String group()       { return "智能体"; }
    @Override public String description() { return "确定性匹配优先 + LangChain4j 灰区判别：识别访客是新客/熟客/竞品/供应商等"; }
    @Override public int order()          { return 30; }
}
