package com.exceptioncoder.toolbox.mail.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class MailToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "mail"; }
    @Override public String name()        { return "收件箱"; }
    @Override public String icon()        { return "mail"; }
    @Override public String route()       { return "/tools/mail"; }
    @Override public String group()       { return "网络工具"; }
    @Override public String description() { return "内嵌 SMTP 服务器，统一接收各电商店铺验证邮件"; }
    @Override public int order()          { return 30; }
}
