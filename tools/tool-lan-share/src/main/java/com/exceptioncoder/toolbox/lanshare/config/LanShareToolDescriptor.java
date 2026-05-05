package com.exceptioncoder.toolbox.lanshare.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class LanShareToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "lan-share"; }
    @Override public String name()        { return "局域网文件传输"; }
    @Override public String icon()        { return "share-2"; }
    @Override public String route()       { return "/tools/lan-share"; }
    @Override public String group()       { return "网络工具"; }
    @Override public String description() { return "输入相同房间号，组内设备 P2P 互传文件，单发或群发"; }
    @Override public int order()          { return 20; }
}
