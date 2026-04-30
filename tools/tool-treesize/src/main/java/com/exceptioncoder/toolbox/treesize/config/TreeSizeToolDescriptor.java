package com.exceptioncoder.toolbox.treesize.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class TreeSizeToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "treesize"; }
    @Override public String name()        { return "磁盘空间分析"; }
    @Override public String icon()        { return "hard-drive"; }
    @Override public String route()       { return "/tools/treesize"; }
    @Override public String group()       { return "系统工具"; }
    @Override public String description() { return "扫描目录、按大小可视化、找出占用最多空间的文件夹"; }
    @Override public int order()          { return 10; }
}
