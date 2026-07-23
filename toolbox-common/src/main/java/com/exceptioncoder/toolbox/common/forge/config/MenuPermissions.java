package com.exceptioncoder.toolbox.common.forge.config;

import com.exceptioncoder.toolbox.common.forge.model.PermissionDef;
import com.exceptioncoder.toolbox.common.forge.service.PermissionContributor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 应用菜单权限码声明：为每个工具 feature 声明一个 {@code menu:<id>} MENU 权限码。
 * module 取该 feature 的分类（前端 FeatureManifest.group，如 系统/AI/网络/运维/媒体/内容 等），
 * 使「角色管理」权限面板按分类分组展示；同一分类内按 feature id 排序。
 * 超管 / ADMIN bypass；showcase 公开页与已自带权限码的 forge 管理页不在此。
 * 新增工具默认仅超管可见，直到在此登记其 menu:&lt;id&gt; 码（与前端 feature 清单保持同步）。
 */
@Component
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class MenuPermissions implements PermissionContributor {

    @Override
    public List<PermissionDef> permissions() {
        return List.of(
                PermissionDef.menu("menu:account-admin", "账号管理", "系统", 100),
                PermissionDef.menu("menu:config-center", "配置中心", "系统", 101),
                PermissionDef.menu("menu:flatten", "目录扁平化", "系统", 102),
                PermissionDef.menu("menu:ops", "系统与中间件", "系统", 103),
                PermissionDef.menu("menu:port-process", "端口进程查询", "系统", 104),
                PermissionDef.menu("menu:projects", "项目管理", "系统", 105),
                PermissionDef.menu("menu:task-center", "任务中心", "系统", 106),
                PermissionDef.menu("menu:treesize", "磁盘空间分析", "系统", 107),
                PermissionDef.menu("menu:vscode-tunnel", "VS Code Tunnel", "系统", 108),
                PermissionDef.menu("menu:webterm", "Web 终端", "系统", 109),
                PermissionDef.menu("menu:ai-chat", "AI 对话", "AI", 110),
                PermissionDef.menu("menu:claude-chat", "Vibe Coding", "AI", 111),
                PermissionDef.menu("menu:fore-consult", "业务系统咨询", "AI", 112),
                PermissionDef.menu("menu:prd-clarify", "PRD 澄清助手", "AI", 113),
                PermissionDef.menu("menu:project-workspace", "项目工作台", "AI", 114),
                PermissionDef.menu("menu:reqpool", "Requirements", "AI", 115),
                PermissionDef.menu("menu:erp-dev", "ERP", "项目开发", 116),
                PermissionDef.menu("menu:kai-dev", "Forge", "项目开发", 117),
                PermissionDef.menu("menu:new-devmodule", "新增模块", "项目开发", 118),
                PermissionDef.menu("menu:srm-dev", "SRM", "项目开发", 119),
                PermissionDef.menu("menu:browser-request", "站点录制编排", "网络", 120),
                PermissionDef.menu("menu:downloader", "智能加速下载器", "网络", 121),
                PermissionDef.menu("menu:lan-share", "局域网文件传输", "网络", 122),
                PermissionDef.menu("menu:magnet", "磁力 / BT 下载", "网络", 123),
                PermissionDef.menu("menu:mail", "收件箱", "网络", 124),
                PermissionDef.menu("menu:media-parser", "媒体解析", "网络", 125),
                PermissionDef.menu("menu:docker", "Docker 治理", "运维", 126),
                PermissionDef.menu("menu:frp-config", "frp 可视化配置", "运维", 127),
                PermissionDef.menu("menu:hosts", "主机管理", "运维", 128),
                PermissionDef.menu("menu:llm-monitor", "LLM 监控", "运维", 129),
                PermissionDef.menu("menu:ffmpeg-lab", "FFmpeg 转码实验台", "媒体", 130),
                PermissionDef.menu("menu:video-condense", "视频智能变速", "媒体", 131),
                PermissionDef.menu("menu:video-library", "视频库", "媒体", 132),
                PermissionDef.menu("menu:ai-secretary", "AI 秘书", "内容", 133),
                PermissionDef.menu("menu:crypto", "加解密工具", "内容", 134),
                PermissionDef.menu("menu:formatter", "格式化工具", "内容", 135),
                PermissionDef.menu("menu:image-mosaic", "图片打码", "内容", 136),
                PermissionDef.menu("menu:markdown-card", "Markdown 转卡片", "内容", 137),
                PermissionDef.menu("menu:qrcode", "二维码工具", "内容", 138),
                PermissionDef.menu("menu:resume", "个人简历", "内容", 139),
                PermissionDef.menu("menu:webppt", "WebPPT 风格中心", "内容", 140),
                PermissionDef.menu("menu:workline", "工作线", "内容", 141),
                PermissionDef.menu("menu:wechat", "微信监控", "效率", 142),
                PermissionDef.menu("menu:welfare-sign", "福利签收", "企业", 143),
                PermissionDef.menu("menu:visitor-analysis", "访客分析", "智能体", 144),
                PermissionDef.menu("menu:architecture", "实现原理", "参考", 145),
                PermissionDef.menu("menu:doc-viewer", "Markdown 文档浏览器", "参考", 146),
                PermissionDef.menu("menu:java8gu", "Java 八股·卡片回顾", "参考", 147),
                PermissionDef.menu("menu:menu-settings", "菜单配置", "其他", 148)
        );
    }
}
