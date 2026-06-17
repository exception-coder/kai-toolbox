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
 * 「合并工作区」(taskspace) 接口：列任意父目录的子目录、多选建链接成新工作区，并支持
 * 查看 / 追加 / 移除 / 拆除全生命周期。建好的目录可直接作为新会话 cwd。
 * 非法入参抛 {@link IllegalArgumentException}，由 common 的 GlobalExceptionHandler 统一转 4xx。
 */
@RestController
@RequestMapping("/api/claude-chat/taskspace")
public class TaskspaceController {

    private final TaskspaceService service;

    public TaskspaceController(TaskspaceService service) {
        this.service = service;
    }

    /** 列父目录的一级子目录，供多选。 */
    @GetMapping("/subdirs")
    public SubdirListResponse subdirs(@RequestParam String parent) {
        return service.listSubdirs(parent);
    }

    /** 创建工作区：base 下建 name 目录并为每个 member 建链接。 */
    @PostMapping("/create")
    public TaskspaceView create(@RequestBody CreateTaskspaceRequest req) {
        return service.create(req.base(), req.name(), req.members());
    }

    /** 读工作区清单 + 链接存活状态。 */
    @GetMapping("/info")
    public TaskspaceView info(@RequestParam String dir) {
        return service.read(dir);
    }

    /** 向工作区追加链接。 */
    @PostMapping("/add")
    public TaskspaceView add(@RequestBody AddMembersRequest req) {
        return service.add(req.dir(), req.members());
    }

    /** 从工作区移除若干链接（只删链接）。 */
    @PostMapping("/remove")
    public TaskspaceView remove(@RequestBody RemoveLinksRequest req) {
        return service.removeLinks(req.dir(), req.links());
    }

    /** 整体拆除工作区（只删链接 + 清单，源目录不触碰）。 */
    @PostMapping("/teardown")
    public void teardown(@RequestBody TeardownRequest req) {
        service.teardown(req.dir());
    }
}
