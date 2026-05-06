package com.exceptioncoder.toolbox.flatten.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class FlattenToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "flatten"; }
    @Override public String name()        { return "目录扁平化"; }
    @Override public String icon()        { return "folder-input"; }
    @Override public String route()       { return "/tools/flatten"; }
    @Override public String group()       { return "系统工具"; }
    @Override public String description() { return "把嵌套目录中的文件平铺到一处；迁移前先检测重复并选择性删除"; }
    @Override public int order()          { return 20; }
}
