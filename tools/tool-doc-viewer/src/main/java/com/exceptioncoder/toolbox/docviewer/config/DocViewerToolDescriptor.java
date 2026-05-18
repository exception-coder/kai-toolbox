package com.exceptioncoder.toolbox.docviewer.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class DocViewerToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "doc-viewer"; }
    @Override public String name()        { return "Markdown 文档浏览器"; }
    @Override public String icon()        { return "book-open"; }
    @Override public String route()       { return "/tools/doc-viewer"; }
    @Override public String group()       { return "学习/参考"; }
    @Override public String description() { return "浏览 GitHub 仓库或本地目录中的 markdown 文档，并支持就地编辑"; }
    @Override public int order()          { return 60; }
}
