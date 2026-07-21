package com.exceptioncoder.toolbox.foreconsult.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

/**
 * Fore- 业务系统咨询工具的后端注册描述符。
 * 前端菜单以 FeatureManifest 为准，本类仅供将来的跨工具服务发现使用。
 */
@Component
public class ForeConsultToolDescriptor implements ToolDescriptor {

    @Override
    public String id() {
        return "fore-consult";
    }

    @Override
    public String name() {
        return "业务系统咨询";
    }

    @Override
    public String icon() {
        return "messages-square";
    }

    @Override
    public String route() {
        return "/tools/fore-consult";
    }

    @Override
    public String group() {
        return "AI";
    }

    @Override
    public String description() {
        return "选定业务系统与模块，复用 Vibe Coding 会话以业务口吻答疑并归档引用";
    }

    @Override
    public int order() {
        return 56;
    }
}
