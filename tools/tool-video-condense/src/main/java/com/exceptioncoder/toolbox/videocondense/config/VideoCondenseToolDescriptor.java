package com.exceptioncoder.toolbox.videocondense.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

/** 后端工具注册（供 {@code /api/tools} 服务发现用，前端菜单由 FeatureManifest 自注册）。 */
@Component
public class VideoCondenseToolDescriptor implements ToolDescriptor {
    @Override public String id()          { return "video-condense"; }
    @Override public String name()        { return "视频智能变速"; }
    @Override public String icon()        { return "gauge"; }
    @Override public String route()       { return "/tools/video-condense"; }
    @Override public String group()       { return "媒体"; }
    @Override public String description() { return "分析录屏的画面活动度，生成动态速度曲线，无聊段加速、关键段保速，输出浓缩视频"; }
    @Override public int order()          { return 22; }
}
