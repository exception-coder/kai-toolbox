package com.exceptioncoder.toolbox.downloader.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class DownloaderToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "downloader"; }
    @Override public String name()        { return "智能加速下载器"; }
    @Override public String icon()        { return "download"; }
    @Override public String route()       { return "/tools/downloader"; }
    @Override public String group()       { return "网络工具"; }
    @Override public String description() { return "粘贴 URL 直接开始下载，自动选直连/代理中更快的链路，支持分段并发与断点续传"; }
    @Override public int order()          { return 25; }
}
