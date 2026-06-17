package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.AddMembersRequest;
import com.exceptioncoder.toolbox.claudechat.api.dto.CreateTaskspaceRequest;
import com.exceptioncoder.toolbox.claudechat.api.dto.RemoveLinksRequest;
import com.exceptioncoder.toolbox.claudechat.api.dto.SubdirListResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.TaskspaceView;
import com.exceptioncoder.toolbox.claudechat.api.dto.TeardownRequest;
import com.exceptioncoder.toolbox.claudechat.service.TaskspaceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 「合并工作区」(taskspace)：在任意父目录下用软链接聚合多个项目为一个新目录，直接当 Vibe Coding 会话 cwd。
 * 全生命周期：列子目录 / 创建 / 查看 / 追加 / 移除 / 拆除。非法入参由 GlobalExceptionHandler 统一转 4xx。
 */
@RestController
@RequestMapping("/api/claude-chat/taskspace")
public class TaskspaceController {

    private final TaskspaceService service;

    public TaskspaceController(TaskspaceService service) {
        this.service = service;
    }

    /** 列父目录下的一级子目录，供多选。 */
    @GetMapping("/subdirs")
    public SubdirListResponse subdirs(@RequestParam String parent) {
        return service.listSubdirs(parent);
    }

    /** 创建工作区并为选中目录建链接。 */
    @PostMapping("/create")
    public TaskspaceView create(@RequestBody CreateTaskspaceRequest req) {
        return service.create(req.base(), req.name(), req.members());
    }

    /** 查看某工作区的成员与链接存活状态。 */
    @GetMapping("/info")
    public TaskspaceView info(@RequestParam String dir) {
        return service.read(dir);
    }

    /** 向工作区追加链接。 */
    @PostMapping("/add")
    public TaskspaceView add(@RequestBody AddMembersRequest req) {
        return service.add(req.dir(), req.members());
    }

    /** 从工作区移除若干链接（只删链接，不动源目录）。 */
    @PostMapping("/remove")
    public TaskspaceView remove(@RequestBody RemoveLinksRequest req) {
        return service.removeLinks(req.dir(), req.links());
    }

    /** 整体拆除工作区（只删链接 + 清单，源目录绝不触碰）。 */
    @PostMapping("/teardown")
    public void teardown(@RequestBody TeardownRequest req) {
        service.teardown(req.dir());
    }
}
