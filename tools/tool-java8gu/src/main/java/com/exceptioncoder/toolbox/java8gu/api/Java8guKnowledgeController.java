package com.exceptioncoder.toolbox.java8gu.api;

import com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge.Detail;
import com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge.Interview;
import com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge.Relation;
import com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge.TreeNode;
import com.exceptioncoder.toolbox.java8gu.service.Java8KnowledgeService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/** Java 8 本地知识节点只读 API。 */
@RestController
@RequestMapping("/api/java8")
public class Java8guKnowledgeController {

    private final Java8KnowledgeService knowledgeService;

    public Java8guKnowledgeController(Java8KnowledgeService knowledgeService) {
        this.knowledgeService = knowledgeService;
    }

    /** 返回完整知识树。 */
    @GetMapping("/categories")
    public List<TreeNode> categories() {
        return knowledgeService.categories();
    }

    /** 返回阅读页聚合详情。 */
    @GetMapping("/nodes/{id}")
    public Detail node(@PathVariable String id) {
        return knowledgeService.detail(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Java8 knowledge node not found"));
    }

    /** 返回节点的双向关系。 */
    @GetMapping("/nodes/{id}/relations")
    public List<Relation> relations(@PathVariable String id) {
        return knowledgeService.relations(id);
    }

    /** 返回节点面试卡片。 */
    @GetMapping("/interviews/{nodeId}")
    public List<Interview> interviews(@PathVariable String nodeId) {
        return knowledgeService.interviews(nodeId);
    }
}
