package com.exceptioncoder.toolbox.foreconsult.backend;

import static java.nio.file.FileVisitResult.CONTINUE;
import static java.nio.file.FileVisitResult.SKIP_SUBTREE;
import static java.nio.file.FileVisitResult.TERMINATE;
import static java.nio.file.LinkOption.NOFOLLOW_LINKS;

import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.common.project.ProjectCatalog;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Locale;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Literal search in conventional source directories of application-authorized projects. */
@Component
class ConsultScreenshotSourceSearch {
    private static final List<String> SOURCE_DIRS = List.of("WebRoot", "frontend/src", "web/src", "src");
    private static final Set<String> SKIP_DIRS = Set.of("config", "credentials", "secrets", "node_modules", "vendor",
            "target", "dist", "build", "test", "tests", "graphify-out");
    private static final Pattern SOURCE_FILE = Pattern.compile(".+\\.(java|js|jsx|ts|tsx|vue|html?|jsp|cshtml)$");
    private static final Pattern PRIVATE_NAME = Pattern.compile(
            "secret|password|credential|token|keystore|application[.-]|settings[.-]");
    private static final Pattern PRIVATE_CONTENT = Pattern.compile(
            "(?i)(-----BEGIN |(?:password|secret|access.token|private.key)\\s*[=:]\\s*['\"]|(?:sk-|fct_)[a-z0-9_-]{16,})");
    private static final Charset LEGACY_CHINESE = Charset.forName("GB18030");
    private static final Pattern HAN = Pattern.compile("\\p{IsHan}");
    private static final int CONTEXT_BEFORE = 650;
    private static final int CONTEXT_AFTER = 950;
    private static final int MAX_ANCHORS_PER_LABEL = 8;
    private static final int MAX_FILE_BYTES = 128 * 1024;
    private static final int MAX_ENTRIES = 1800;
    private static final int MAX_BYTES = 12 * 1024 * 1024;
    private static final int MAX_HITS = 4;
    private static final long SEARCH_NANOS = Duration.ofMillis(1500).toNanos();
    static final String KIND = "SERVER_SCREENSHOT_SOURCE";

    private final ProjectCatalog projects;
    private final ProjectAccess access;

    ConsultScreenshotSourceSearch(ProjectCatalog projects, ProjectAccess access) {
        this.projects = projects;
        this.access = access;
    }

    List<ConsultAnalysisEvidence.Packet> find(List<String> scope, List<String> labels) {
        return find(scope, labels, 1);
    }

    List<ConsultAnalysisEvidence.Packet> find(List<String> scope, List<String> labels, int minimumMatches) {
        if (scope.isEmpty() || labels.isEmpty()) {
            return List.of();
        }
        var budget = new Budget();
        var matches = new ArrayList<Hit>();
        boolean allowLegacy = labels.stream().anyMatch(label -> HAN.matcher(label).find());
        for (var project : projects.list(false)) {
            if (budget.exhausted()) {
                break;
            }
            if (scope.contains(project.id()) && project.available() && !project.excluded()) {
                searchProject(project, labels, allowLegacy, budget, matches);
            }
        }
        if (matches.isEmpty()) {
            return List.of();
        }
        matches.sort(Comparator.comparingInt(Hit::score).reversed());
        var best = matches.getFirst();
        if (best.score() < minimumMatches || matches.stream().anyMatch(hit ->
                hit.score() == best.score() && !hit.projectId().equals(best.projectId()))) {
            return List.of();
        }
        var packets = new ArrayList<ConsultAnalysisEvidence.Packet>();
        for (var hit : matches) {
            if (hit.projectId().equals(best.projectId()) && hit.score() >= minimumMatches) {
                packets.add(new ConsultAnalysisEvidence.Packet("screenshot-source-" + (packets.size() + 1),
                        KIND, hit.relativePath(), hit.text()));
            }
            if (packets.size() == MAX_HITS) {
                break;
            }
        }
        return List.copyOf(packets);
    }

    private void searchProject(ProjectCatalog.Entry project, List<String> labels, boolean allowLegacy, Budget budget, List<Hit> matches) {
        try {
            var root = Path.of(project.path()).toRealPath();
            access.requireAllowed(root);
            for (String relative : SOURCE_DIRS) {
                if (budget.exhausted()) {
                    break;
                }
                Path dir = root.resolve(relative);
                if (Files.isDirectory(dir, NOFOLLOW_LINKS) && dir.equals(dir.toRealPath())) {
                    access.requireAllowed(dir);
                    searchDirectory(project.id(), root, dir, labels, allowLegacy, budget, matches);
                }
            }
        } catch (IOException | IllegalArgumentException ignored) {
            // Unavailable source does not establish a business fact.
        }
    }

    private void searchDirectory(String projectId, Path root, Path dir, List<String> labels, boolean allowLegacy,
            Budget budget, List<Hit> hits)
            throws IOException {
        Files.walkFileTree(dir, Set.of(), 12, new SimpleFileVisitor<Path>() {
            @Override
            public FileVisitResult preVisitDirectory(Path path, BasicFileAttributes attrs) {
                if (budget.exhausted()) {
                    return TERMINATE;
                }
                budget.entries++;
                String name = name(path);
                return name.startsWith(".") || SKIP_DIRS.contains(name) || PRIVATE_NAME.matcher(name).find()
                        || !access.allowed(path) ? SKIP_SUBTREE : CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path path, BasicFileAttributes attrs) {
                if (budget.exhausted()) {
                    return TERMINATE;
                }
                budget.entries++;
                String name = name(path);
                if (attrs.isRegularFile() && attrs.size() <= MAX_FILE_BYTES && !name.startsWith(".")
                        && SOURCE_FILE.matcher(name).matches() && !PRIVATE_NAME.matcher(name).find()) {
                    readHit(projectId, root, path, labels, allowLegacy, budget, hits);
                }
                return CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path path, IOException error) {
                budget.entries++;
                return budget.exhausted() ? TERMINATE : CONTINUE;
            }
        });
    }

    private void readHit(String projectId, Path root, Path candidate, List<String> labels, boolean allowLegacy,
            Budget budget, List<Hit> hits) {
        try {
            Path file = candidate.toRealPath();
            if (!file.startsWith(root) || !file.equals(candidate)) {
                return;
            }
            access.requireAllowed(file);
            try (var stream = Files.newInputStream(file, NOFOLLOW_LINKS)) {
                byte[] bytes = stream.readNBytes(MAX_FILE_BYTES + 1);
                budget.bytes += bytes.length;
                if (bytes.length <= MAX_FILE_BYTES) {
                    String text = decode(bytes, labels, allowLegacy);
                    addHit(projectId, root.relativize(candidate), text, labels, hits);
                }
            }
        } catch (IOException | IllegalArgumentException ignored) {
            // An unreadable or excluded file must not prevent the ordinary answer.
        }
    }

    private static String decode(byte[] bytes, List<String> labels, boolean allowLegacy) throws CharacterCodingException {
        try {
            return StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException malformedUtf8) {
            if (!allowLegacy) {
                throw malformedUtf8;
            }
            String decoded = LEGACY_CHINESE.newDecoder().decode(ByteBuffer.wrap(bytes)).toString();
            if (labels.stream().noneMatch(label -> HAN.matcher(label).find() && decoded.contains(label))) {
                throw malformedUtf8;
            }
            return decoded;
        }
    }

    private static String name(Path path) {
        return path.getFileName().toString().toLowerCase(Locale.ROOT);
    }

    private static void addHit(String projectId, Path relative, String text, List<String> labels, List<Hit> hits) {
        List<String> present = labels.stream().filter(text::contains).toList();
        if (present.isEmpty() || PRIVATE_CONTENT.matcher(text).find()) {
            return;
        }
        int bestScore = 0;
        String bestExcerpt = "";
        for (String anchor : present) {
            int position = text.indexOf(anchor);
            for (int i = 0; position >= 0 && i < MAX_ANCHORS_PER_LABEL; i++) {
                String excerpt = text.substring(Math.max(0, position - CONTEXT_BEFORE),
                        Math.min(text.length(), position + CONTEXT_AFTER));
                List<String> matched = present.stream().filter(excerpt::contains).toList();
                int score = (int) matched.stream().filter(label -> matched.stream()
                        .noneMatch(other -> other.length() > label.length() && other.contains(label))).count();
                if (score > bestScore) {
                    bestScore = score;
                    bestExcerpt = excerpt;
                }
                if (bestScore == present.size()) {
                    break;
                }
                position = text.indexOf(anchor, position + anchor.length());
            }
        }
        hits.add(new Hit(bestScore, projectId, relative.toString().replace('\\', '/'), bestExcerpt));
    }

    private record Hit(int score, String projectId, String relativePath, String text) {}

    private static final class Budget {
        private final long start = System.nanoTime();
        private int entries;
        private int bytes;

        private boolean exhausted() {
            return entries >= MAX_ENTRIES || bytes >= MAX_BYTES || Thread.currentThread().isInterrupted()
                    || System.nanoTime() - start >= SEARCH_NANOS;
        }
    }
}
