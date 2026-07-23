package com.exceptioncoder.toolbox.common.forge.config;

import com.exceptioncoder.toolbox.common.forge.model.PermissionDef;
import com.exceptioncoder.toolbox.common.forge.service.PermissionContributor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 应用菜单权限码声明：为每个工具 feature 声明一个 {@code menu:<id>} MENU 权限码，
 * 使各工具菜单可在「角色管理」里分配给角色（前端 featureRegistry 自动按 menu:id 门禁菜单显隐）。
 * 超管 / ADMIN bypass；showcase 公开页与已自带权限码的 forge 管理页不在此。
 * 新增工具默认仅超管可见，直到在此登记其 menu:id 码（与前端 feature 清单保持同步）。
 */
@Component
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class MenuPermissions implements PermissionContributor {

    private static final String MODULE = "应用菜单";

    @Override
    public List<PermissionDef> permissions() {
        return List.of(
                PermissionDef.menu("menu:account-admin", "账号管理", MODULE, 100),
                PermissionDef.menu("menu:ai-chat", "AI 对话", MODULE, 101),
                PermissionDef.menu("menu:ai-secretary", "AI 秘书", MODULE, 102),
                PermissionDef.menu("menu:architecture", "实现原理", MODULE, 103),
                PermissionDef.menu("menu:browser-request", "站点录制编排", MODULE, 104),
                PermissionDef.menu("menu:claude-chat", "Vibe Coding", MODULE, 105),
                PermissionDef.menu("menu:config-center", "配置中心", MODULE, 106),
                PermissionDef.menu("menu:crypto", "加解密工具", MODULE, 107),
                PermissionDef.menu("menu:doc-viewer", "Markdown 文档浏览器", MODULE, 108),
                PermissionDef.menu("menu:docker", "Docker 治理", MODULE, 109),
                PermissionDef.menu("menu:downloader", "智能加速下载器", MODULE, 110),
                PermissionDef.menu("menu:erp-dev", "ERP", MODULE, 111),
                PermissionDef.menu("menu:ffmpeg-lab", "FFmpeg 转码实验台", MODULE, 112),
                PermissionDef.menu("menu:flatten", "目录扁平化", MODULE, 113),
                PermissionDef.menu("menu:fore-consult", "业务系统咨询", MODULE, 114),
                PermissionDef.menu("menu:formatter", "格式化工具", MODULE, 115),
                PermissionDef.menu("menu:frp-config", "frp 可视化配置", MODULE, 116),
                PermissionDef.menu("menu:hosts", "主机管理", MODULE, 117),
                PermissionDef.menu("menu:image-mosaic", "图片打码", MODULE, 118),
                PermissionDef.menu("menu:java8gu", "Java 八股·卡片回顾", MODULE, 119),
                PermissionDef.menu("menu:kai-dev", "Forge", MODULE, 120),
                PermissionDef.menu("menu:lan-share", "局域网文件传输", MODULE, 121),
                PermissionDef.menu("menu:llm-monitor", "LLM 监控", MODULE, 122),
                PermissionDef.menu("menu:magnet", "磁力 / BT 下载", MODULE, 123),
                PermissionDef.menu("menu:mail", "收件箱", MODULE, 124),
                PermissionDef.menu("menu:markdown-card", "Markdown 转卡片", MODULE, 125),
                PermissionDef.menu("menu:media-parser", "媒体解析", MODULE, 126),
                PermissionDef.menu("menu:menu-settings", "菜单配置", MODULE, 127),
                PermissionDef.menu("menu:new-devmodule", "新增模块", MODULE, 128),
                PermissionDef.menu("menu:ops", "系统与中间件", MODULE, 129),
                PermissionDef.menu("menu:port-process", "端口进程查询", MODULE, 130),
                PermissionDef.menu("menu:prd-clarify", "PRD 澄清助手", MODULE, 131),
                PermissionDef.menu("menu:project-workspace", "项目工作台", MODULE, 132),
                PermissionDef.menu("menu:projects", "项目管理", MODULE, 133),
                PermissionDef.menu("menu:qrcode", "二维码工具", MODULE, 134),
                PermissionDef.menu("menu:reqpool", "Requirements", MODULE, 135),
                PermissionDef.menu("menu:resume", "个人简历", MODULE, 136),
                PermissionDef.menu("menu:srm-dev", "SRM", MODULE, 137),
                PermissionDef.menu("menu:task-center", "任务中心", MODULE, 138),
                PermissionDef.menu("menu:treesize", "磁盘空间分析", MODULE, 139),
                PermissionDef.menu("menu:video-condense", "视频智能变速", MODULE, 140),
                PermissionDef.menu("menu:video-library", "视频库", MODULE, 141),
                PermissionDef.menu("menu:visitor-analysis", "访客分析", MODULE, 142),
                PermissionDef.menu("menu:vscode-tunnel", "VS Code Tunnel", MODULE, 143),
                PermissionDef.menu("menu:webppt", "WebPPT 风格中心", MODULE, 144),
                PermissionDef.menu("menu:webterm", "Web 终端", MODULE, 145),
                PermissionDef.menu("menu:wechat", "微信监控", MODULE, 146),
                PermissionDef.menu("menu:welfare-sign", "福利签收", MODULE, 147),
                PermissionDef.menu("menu:workline", "工作线", MODULE, 148)
        );
    }
}
