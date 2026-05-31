package com.exceptioncoder.toolbox.magnet.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class MagnetToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "magnet"; }
    @Override public String name()        { return "磁力 / BT 下载"; }
    @Override public String icon()        { return "magnet"; }
    @Override public String route()       { return "/tools/magnet"; }
    @Override public String group()       { return "网络工具"; }
    @Override public String description() { return "本地 aria2 下载磁力 / torrent / HTTP；提交前并发查公共种子缓存跳过 DHT 解析"; }
    @Override public int order()          { return 26; }
}
