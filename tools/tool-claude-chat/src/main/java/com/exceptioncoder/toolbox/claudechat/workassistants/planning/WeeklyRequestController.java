package com.exceptioncoder.toolbox.claudechat.workassistants.planning;

import com.exceptioncoder.toolbox.claudechat.workassistants.AssistantConversationService;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.web.bind.annotation.*;

/** 复用助理权限，规划不创建会话或执行 Git。 */
@RestController
@RequireAuth
@RequestMapping("/api/work-assistants/weekly")
public class WeeklyRequestController {
    private final WeeklyRequestPlanner planner;
    private final AssistantConversationService conversations;

    public WeeklyRequestController(WeeklyRequestPlanner planner, AssistantConversationService conversations) {
        this.planner = planner; this.conversations = conversations;
    }

    @PostMapping("/resolve")
    public WeeklyRequestPlanner.Plan resolve(@RequestBody WeeklyRequestPlanner.Request request) {
        conversations.user();
        return planner.resolve(request);
    }
}
