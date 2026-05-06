package com.exceptioncoder.toolbox.mediaparser.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class MediaParserToolDescriptor implements ToolDescriptor {
    @Override public String id()          { return "media-parser"; }
    @Override public String name()        { return "媒体解析"; }
    @Override public String icon()        { return "download"; }
    @Override public String route()       { return "/tools/media-parser"; }
    @Override public String group()       { return "网络工具"; }
    @Override public String description() { return "解析 TikTok、抖音、Instagram、YouTube、Twitter 等平台的分享链接，提取无水印视频与图片"; }
    @Override public int order()          { return 50; }
}
