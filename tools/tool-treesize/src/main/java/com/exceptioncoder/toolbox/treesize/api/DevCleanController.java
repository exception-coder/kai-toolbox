package com.exceptioncoder.toolbox.treesize.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.treesize.api.dto.DevCleanExecuteRequest;
import com.exceptioncoder.toolbox.treesize.api.dto.DevCleanExecuteResultView;
import com.exceptioncoder.toolbox.treesize.api.dto.DevCleanEntriesView;
import com.exceptioncoder.toolbox.treesize.api.dto.DevCleanRecipeView;
import com.exceptioncoder.toolbox.treesize.api.dto.DiskUsageView;
import com.exceptioncoder.toolbox.treesize.api.dto.FixedDirectoryMigrationRequest;
import com.exceptioncoder.toolbox.treesize.api.dto.FixedDirectoryMigrationView;
import com.exceptioncoder.toolbox.treesize.api.dto.PackageCacheConfigureRequest;
import com.exceptioncoder.toolbox.treesize.api.dto.PackageCacheView;
import com.exceptioncoder.toolbox.treesize.service.DevCleanEntryQueryService;
import com.exceptioncoder.toolbox.treesize.service.DevCleanService;
import com.exceptioncoder.toolbox.treesize.service.DiskUsageAnalysisService;
import com.exceptioncoder.toolbox.treesize.service.FixedDirectoryMigrationService;
import com.exceptioncoder.toolbox.treesize.service.PackageCacheConfigService;
import com.exceptioncoder.toolbox.treesize.service.TrashBin;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
    private final DevCleanEntryQueryService entryQuery;
    private final PackageCacheConfigService packageCacheConfig;
    private final DiskUsageAnalysisService diskUsageAnalysis;
    private final FixedDirectoryMigrationService fixedDirectoryMigration;
    private final TrashBin trashBin;

    public DevCleanController(
            DevCleanService devClean,
            DevCleanEntryQueryService entryQuery,
            PackageCacheConfigService packageCacheConfig,
            DiskUsageAnalysisService diskUsageAnalysis,
            FixedDirectoryMigrationService fixedDirectoryMigration,
            TrashBin trashBin
    ) {
        this.devClean = devClean;
        this.entryQuery = entryQuery;
        this.packageCacheConfig = packageCacheConfig;
        this.diskUsageAnalysis = diskUsageAnalysis;
        this.fixedDirectoryMigration = fixedDirectoryMigration;
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

    /** Scan drive buckets and large per-user software data without exposing a delete action. */
    @GetMapping("/disk-usage")
    public DiskUsageView diskUsage() {
        return DiskUsageView.from(diskUsageAnalysis.analyze());
    }

    /** Return the current concrete targets for one trusted cleanup recipe. */
    @GetMapping("/recipes/{recipeId}/entries")
    public DevCleanEntriesView entries(@PathVariable String recipeId) {
        return DevCleanEntriesView.from(entryQuery.listEntries(recipeId));
    }

    /** 返回支持自动配置的包管理器缓存位置。 */
    @GetMapping("/package-caches")
    public List<PackageCacheView> packageCaches() {
        return packageCacheConfig.list().stream().map(PackageCacheView::from).toList();
    }

    /** 按指定管理器的原生配置语义切换未来缓存目录。 */
    @PostMapping("/package-caches/{managerId}/configure")
    public PackageCacheView configurePackageCache(
            @PathVariable String managerId,
            @Valid @RequestBody PackageCacheConfigureRequest request
    ) {
        return PackageCacheView.from(packageCacheConfig.configure(managerId, request.targetPath()));
    }

    /** 返回只能通过文件系统 Junction 改址的白名单软件目录。 */
    @GetMapping("/fixed-directory-migrations")
    public List<FixedDirectoryMigrationView> fixedDirectoryMigrations() {
        return fixedDirectoryMigration.list().stream().map(FixedDirectoryMigrationView::from).toList();
    }

    /** 复制、校验并将白名单软件目录切换为 Windows Junction。 */
    @PostMapping("/fixed-directory-migrations/{migrationId}/execute")
    public FixedDirectoryMigrationView migrateFixedDirectory(
            @PathVariable String migrationId,
            @Valid @RequestBody FixedDirectoryMigrationRequest request
    ) {
        return FixedDirectoryMigrationView.from(
                fixedDirectoryMigration.migrate(migrationId, request.targetPath())
        );
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
