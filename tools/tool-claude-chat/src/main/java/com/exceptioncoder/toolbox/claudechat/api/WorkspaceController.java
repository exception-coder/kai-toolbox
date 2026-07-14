package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.CloneRequest;
import com.exceptioncoder.toolbox.claudechat.api.dto.CloneResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.KnowledgeEnsureResult;
import com.exceptioncoder.toolbox.claudechat.api.dto.ModuleResolveResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.ModuleSyncApplyRequest;
import com.exceptioncoder.toolbox.claudechat.api.dto.ModuleSyncPreview;
import com.exceptioncoder.toolbox.claudechat.api.dto.ModuleSyncResult;
import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectModulesResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import com.exceptioncoder.toolbox.claudechat.service.WorkspaceScanService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 工作目录查询：列出配置根目录下的一级子目录，供新建会话时下拉选 cwd。
 * 见设计文档：ai-docs/kai-toolbox/design/移动端 Claude 客户端/工作目录会话选择/
 */
@RestController
@RequestMapping("/api/claude-chat/workspaces")
public class WorkspaceController {

    private final WorkspaceScanService service;

    public WorkspaceController(WorkspaceScanService service) {
        this.service = service;
    }

    @GetMapping
    public WorkspaceListResponse list() {
        return service.scan();
    }

    /** 扫描某项目下的模块（确定性，按构建标志文件）；path 须在配置根内。供「项目工作台」列模块。 */
    @GetMapping("/modules")
    public ProjectModulesResponse modules(@RequestParam String path) {
        return service.scanModules(path);
    }

    /**
     * 模块路由：把一句自然语言（如「去开发 commodity 模块」「korepos 的 refund」）确定性地解析为
     * 候选 (项目, 模块)。0 个=未匹配，1 个=可直接确认拉起，多个=前端让用户选项目。供「模块路由」入口。
     */
    @GetMapping("/resolve")
    public ModuleResolveResponse resolve(@RequestParam("q") String query) {
        return service.resolveModule(query);
    }

    /** 拉取（git clone）新项目到指定工作区根（须为配置的 workspace 根之一）。返回落地路径，可直接当 cwd。 */
    @PostMapping("/clone")
    public CloneResponse clone(@RequestBody CloneRequest req) {
        return service.cloneProject(req.url(), req.root());
    }

    /** 自动确保知识库就绪：未配置/目录不存在时自动 clone 到 ~/.kai-toolbox 并绑定。供工作台进入时静默调用。 */
    @PostMapping("/knowledge/ensure")
    public KnowledgeEnsureResult ensureKnowledge() {
        return service.ensureKnowledgeBase();
    }

    /** 「更新项目模块」预览：按代码目录重新解析，与 modules.json 出 diff（只读）。供工作台弹窗展示差异。 */
    @GetMapping("/modules/sync/preview")
    public ModuleSyncPreview syncPreview(@RequestParam String path) {
        return service.previewModuleSync(path);
    }

    /** 「更新项目模块」应用：把勾选的新增候选追加进 modules.json（只新增、不删除）。 */
    @PostMapping("/modules/sync/apply")
    public ModuleSyncResult syncApply(@RequestBody ModuleSyncApplyRequest req) {
        return service.applyModuleSync(req.path(), req.modules());
    }
}
