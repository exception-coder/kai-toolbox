package com.exceptioncoder.toolbox.prdclarify.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

/**
 * PRD 澄清工具的后端注册描述符。
 * 前端菜单以 FeatureManifest 为准，本类仅供将来的跨工具服务发现使用。
 */
@Component
public class PrdClarifyToolDescriptor implements ToolDescriptor {

    @Override
    public String id() {
        return "prd-clarify";
    }

    @Override
    public String name() {
        return "PRD 澄清助手";
    }

    @Override
    public String icon() {
        return "file-text";
    }

    @Override
    public String route() {
        return "/tools/prd-clarify";
    }

    @Override
    public String group() {
        return "AI";
    }

    @Override
    public String description() {
        return "多轮澄清需求，自动生成结构化 PRD 文档";
    }

    @Override
    public int order() {
        return 55;
    }
}
