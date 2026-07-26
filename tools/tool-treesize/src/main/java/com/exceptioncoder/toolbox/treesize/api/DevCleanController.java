package com.exceptioncoder.toolbox.treesize.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.treesize.api.dto.DevCleanExecuteRequest;
import com.exceptioncoder.toolbox.treesize.api.dto.DevCleanExecuteResultView;
import com.exceptioncoder.toolbox.treesize.api.dto.DevCleanRecipeView;
import com.exceptioncoder.toolbox.treesize.service.DevCleanService;
import com.exceptioncoder.toolbox.treesize.service.TrashBin;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Dev-machine cleanup: the recipe-driven half of the disk tool.
 *
 * <p>Separate controller from {@link TreeSizeController} because it shares none of its state —
 * no scan id, no {@code treesize_node} rows, no {@code PathAccessGuard} roots. Everything it
 * can touch is declared in {@code DevCleanCatalog}.
 *
 * <p>{@code VIDEO_LIBRARY} is deliberately excluded from the role list: that role exists for
 * browsing media, and nothing about it implies permission to delete IDE and browser caches.
 */
@RestController
@RequestMapping("/api/treesize/devclean")
@RequireRole({"ADMIN", "DISK_ADMIN"})
public class DevCleanController {

    private final DevCleanService devClean;
    private final TrashBin trashBin;

    public DevCleanController(DevCleanService devClean, TrashBin trashBin) {
        this.devClean = devClean;
        this.trashBin = trashBin;
    }

    /**
     * Measure every recipe. This is a pure read and is the only way the UI learns sizes —
     * there is no cached snapshot, because a stale "12 GB reclaimable" is worse than a wait.
     */
    @GetMapping("/probe")
    public List<DevCleanRecipeView> probe() {
        return devClean.probeAll().stream().map(DevCleanRecipeView::from).toList();
    }

    /** Whether the recycle bin works here; the UI disables the run button when it does not. */
    @GetMapping("/capability")
    public Capability capability() {
        return new Capability(trashBin.available(), isWindows());
    }

    @PostMapping("/execute")
    public DevCleanExecuteResultView execute(@Valid @RequestBody DevCleanExecuteRequest req) {
        return DevCleanExecuteResultView.from(devClean.execute(req.recipeIds()));
    }

    public record Capability(boolean recycleBinAvailable, boolean windows) {}

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase().contains("win");
    }
}
