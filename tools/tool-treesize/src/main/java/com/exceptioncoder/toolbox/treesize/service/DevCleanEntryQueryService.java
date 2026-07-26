package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.CleanupRecipe;
import com.exceptioncoder.toolbox.treesize.domain.RecipeKind;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;

/**
 * Read-only query for the concrete file-system entries covered by one cleanup recipe.
 */
@Service
public class DevCleanEntryQueryService {

    private static final int MAX_RETURNED_ENTRIES = 500;

    private final DevCleanCatalog catalog;
    private final TrashBin trashBin;

    public DevCleanEntryQueryService(DevCleanCatalog catalog, TrashBin trashBin) {
        this.catalog = catalog;
        this.trashBin = trashBin;
    }

    /**
     * Build a bounded snapshot for user review without accepting any client-supplied path.
     *
     * @param recipeId trusted catalog recipe identifier
     * @return current entry snapshot
     */
    public EntryReport listEntries(String recipeId) {
        CleanupRecipe recipe = catalog.find(recipeId)
                .orElseThrow(() -> new IllegalArgumentException("未知的清理项: " + recipeId));
        if (recipe.advisory()) {
            throw new IllegalArgumentException("清理项「" + recipe.title() + "」只能手动执行");
        }

        List<Entry> entries = catalog.workItems(recipe).stream()
                .map(this::toEntry)
                .sorted(Comparator.comparingLong(Entry::size).reversed()
                        .thenComparing(Entry::path))
                .toList();
        List<Entry> returned = entries.stream().limit(MAX_RETURNED_ENTRIES).toList();
        List<Entry> retainedEntries = retainedEntries(recipe);
        List<Entry> returnedRetained = retainedEntries.stream().limit(MAX_RETURNED_ENTRIES).toList();
        return new EntryReport(
                recipe.id(),
                returned,
                entries.size(),
                returned.size(),
                entries.size() > returned.size(),
                returnedRetained,
                retainedEntries.size(),
                retainedEntries.size() > returnedRetained.size()
        );
    }

    private List<Entry> retainedEntries(CleanupRecipe recipe) {
        if (recipe.kind() != RecipeKind.VERSIONED_DIR) {
            return List.of();
        }
        return catalog.resolveTargets(recipe).stream()
                .flatMap(container ->
                        catalog.retainedVersions(container, recipe.keepLatest()).stream())
                .map(this::toEntry)
                .sorted(Comparator.comparing(Entry::path))
                .toList();
    }

    private Entry toEntry(Path path) {
        Path fileName = path.getFileName();
        return new Entry(
                path.toString(),
                fileName == null ? path.toString() : fileName.toString(),
                Files.isDirectory(path),
                trashBin.sizeOf(path)
        );
    }

    /**
     * One file-system entry visible in the review list.
     *
     * @param path absolute local path
     * @param name display name
     * @param directory whether the entry is a directory
     * @param size estimated bytes
     */
    public record Entry(String path, String name, boolean directory, long size) {}

    /**
     * Bounded snapshot of one recipe's concrete cleanup targets.
     *
     * @param recipeId catalog recipe identifier
     * @param entries returned entries
     * @param totalCount total number of current work items
     * @param returnedCount number of returned entries
     * @param truncated whether more entries exist
     * @param retainedEntries explicitly retained version entries
     * @param retainedCount total number of retained entries
     * @param retainedTruncated whether more retained entries exist
     */
    public record EntryReport(
            String recipeId,
            List<Entry> entries,
            int totalCount,
            int returnedCount,
            boolean truncated,
            List<Entry> retainedEntries,
            int retainedCount,
            boolean retainedTruncated
    ) {}
}
