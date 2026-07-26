package com.exceptioncoder.toolbox.eval.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class EvalToolDescriptor implements ToolDescriptor {

    @Override
    public String id() {
        return "eval";
    }

    @Override
    public String name() {
        return "能力评测";
    }

    @Override
    public String icon() {
        return "flask-conical";
    }

    @Override
    public String route() {
        return "/tools/eval";
    }

    @Override
    public String group() {
        return "AI";
    }

    @Override
    public String description() {
        return "黄金集回归评测：断言引擎、提示词版本对比、pass→fail 退化清单";
    }

    @Override
    public int order() {
        return 57;
    }
}
