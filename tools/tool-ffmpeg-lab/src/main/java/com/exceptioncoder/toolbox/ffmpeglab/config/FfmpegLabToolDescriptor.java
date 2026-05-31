package com.exceptioncoder.toolbox.ffmpeglab.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

/** 后端工具注册（供 {@code /api/tools} 服务发现用，前端菜单由 FeatureManifest 自注册）。 */
@Component
public class FfmpegLabToolDescriptor implements ToolDescriptor {
    @Override public String id()          { return "ffmpeg-lab"; }
    @Override public String name()        { return "FFmpeg 转码实验台"; }
    @Override public String icon()        { return "flask-conical"; }
    @Override public String route()       { return "/tools/ffmpeg-lab"; }
    @Override public String group()       { return "视频工具"; }
    @Override public String description() { return "输入本地视频路径，逐个试验多种转码/封装输出模式，判断哪种能把该格式正常输出到 web 播放"; }
    @Override public int order()          { return 60; }
}
