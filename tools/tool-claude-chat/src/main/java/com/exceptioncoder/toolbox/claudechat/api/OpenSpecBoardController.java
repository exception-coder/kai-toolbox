package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.BoardList;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.ChangeDetail;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecBoardService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** OpenSpec 研发任务看板只读接口。 */
@RestController
@RequestMapping("/api/claude-chat/openspec/boards")
public class OpenSpecBoardController {

    private final OpenSpecBoardService service;

    public OpenSpecBoardController(OpenSpecBoardService service) {
        this.service = service;
    }

    /** 返回允许工作区中的项目与活动需求摘要。 */
    @GetMapping
    public BoardList boards(@RequestParam(defaultValue = "false") boolean refresh) {
        return service.boards(refresh);
    }

    /** 返回指定项目中活动需求的结构化任务。 */
    @GetMapping("/{projectId}/changes/{changeId}")
    public ChangeDetail change(@PathVariable String projectId, @PathVariable String changeId,
                               @RequestParam(defaultValue = "false") boolean refresh) {
        return service.change(projectId, changeId, refresh);
    }
}
