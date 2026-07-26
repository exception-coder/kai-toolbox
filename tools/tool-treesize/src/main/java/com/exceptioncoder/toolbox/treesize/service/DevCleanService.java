package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.CleanupRecipe;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Dev-machine cleanup: measure the known disk hogs, then delete the ones the user ticked.
 *
 * <p>Two-phase on purpose. "Is it worth clicking?" and "delete it" are different questions,
 * and the first needs a real number — a checkbox list without measured sizes gets ticked
 * blindly. Measurement is a pure read, so it can run wide across virtual threads; execution
 * is the only phase that touches anything.
 *
 * <p>Callers identify work by recipe id only, never by path — see {@link DevCleanCatalog}.
 */
@Service
public class DevCleanService {

    private static final Logger log = LoggerFactory.getLogger(DevCleanService.class);

    private final DevCleanCatalog catalog;
    private final TrashBin trashBin;

    public DevCleanService(DevCleanCatalog catalog, TrashBin trashBin) {
        this.catalog = catalog;
        this.trashBin = trashBin;
    }

    /**
     * Measure every recipe concurrently.
     *
     * <p>One virtual thread per recipe: the work is almost entirely blocking {@code stat}
     * calls, and serially walking %TEMP% + every Chrome profile + the extensions folder takes
     * long enough that the panel would feel broken.
     */
    public List<RecipeReport> probeAll() {
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<RecipeReport>> futures = catalog.all().stream()
                    .map(recipe -> pool.submit(() -> probe(recipe)))
                    .toList();
            List<RecipeReport> out = new ArrayList<>(futures.size());
            for (Future<RecipeReport> f : futures) {
                try {
                    out.add(f.get());
                } catch (Exception e) {
                    log.warn("devclean: probe task failed", e);
                }
            }
            return out;
        }
    }

    private RecipeReport probe(CleanupRecipe recipe) {
        // "Not installed here" and "installed but already clean" must stay distinguishable:
        // availability is decided by whether the recipe's directories exist, NOT by whether it
        // found anything to delete. Otherwise a freshly-cleaned category greys itself out and
        // looks broken.
        boolean available = recipe.advisory() || !catalog.resolveTargets(recipe).isEmpty();
        List<Path> items = available ? workItems(recipe) : List.of();
        long size = 0L;
        for (Path item : items) {
            size += trashBin.sizeOf(item);
        }
        return new RecipeReport(recipe, size, items.size(), available, sampleOf(items));
    }

    /**
     * Delete the work items of each requested recipe.
     *
     * <p>Advisory recipes are rejected rather than ignored: silently skipping them would let
     * the UI report "done" for something that never ran.
     */
    public ExecutionReport execute(List<String> recipeIds) {
        List<CleanupRecipe> recipes = resolveRequested(recipeIds);
        if (!trashBin.available()) {
            throw new IllegalStateException("当前环境不支持回收站，已中止：本功能不做永久删除兜底");
        }

        List<RecipeOutcome> outcomes = new ArrayList<>();
        long freedTotal = 0L;
        int deletedTotal = 0;
        int failedTotal = 0;

        for (CleanupRecipe recipe : recipes) {
            long freed = 0L;
            int deleted = 0;
            List<String> errors = new ArrayList<>();
            for (Path item : workItems(recipe)) {
                // Measure before deleting — afterwards there is nothing left to measure.
                long size = trashBin.sizeOf(item);
                TrashBin.Result result = trashBin.trash(item);
                if (result.ok()) {
                    freed += size;
                    deleted++;
                } else {
                    errors.add(item + " — " + result.reason());
                }
            }
            log.info("devclean: recipe={} deleted={} failed={} freed={}B",
                    recipe.id(), deleted, errors.size(), freed);
            outcomes.add(new RecipeOutcome(recipe, freed, deleted, errors));
            freedTotal += freed;
            deletedTotal += deleted;
            failedTotal += errors.size();
        }
        return new ExecutionReport(freedTotal, deletedTotal, failedTotal, outcomes);
    }

    private List<CleanupRecipe> resolveRequested(List<String> recipeIds) {
        if (recipeIds == null || recipeIds.isEmpty()) {
            throw new IllegalArgumentException("未选择任何清理项");
        }
        // Dedup while preserving the caller's order so the result list matches the UI order.
        List<CleanupRecipe> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (String id : recipeIds) {
            if (!seen.add(id)) {
                continue;
            }
            CleanupRecipe recipe = catalog.find(id)
                    .orElseThrow(() -> new IllegalArgumentException("未知的清理项: " + id));
            if (recipe.advisory()) {
                throw new IllegalArgumentException("清理项「" + recipe.title() + "」只能手动执行，不支持一键清理");
            }
            out.add(recipe);
        }
        return out;
    }

    private List<Path> workItems(CleanupRecipe recipe) {
        return catalog.workItems(recipe);
    }

    /** A few example paths so the user can sanity-check what a category actually covers. */
    private static List<String> sampleOf(List<Path> items) {
        return items.stream().limit(3).map(Path::toString).toList();
    }

    public record RecipeReport(
            CleanupRecipe recipe,
            long size,
            int itemCount,
            boolean available,
            List<String> samplePaths
    ) {}

    public record RecipeOutcome(CleanupRecipe recipe, long freedBytes, int deleted, List<String> errors) {}

    public record ExecutionReport(
            long freedBytes,
            int deleted,
            int failed,
            List<RecipeOutcome> items
    ) {}
}
