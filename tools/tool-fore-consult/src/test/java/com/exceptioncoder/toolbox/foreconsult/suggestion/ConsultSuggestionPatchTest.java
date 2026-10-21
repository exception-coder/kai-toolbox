package com.exceptioncoder.toolbox.foreconsult.suggestion;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 使用真实 Git/Node/类型检查/测试验证产物；仅模型响应为固定夹具，不声称真实模型效果。 */
class ConsultSuggestionPatchTest {
    @TempDir Path temp;

    @Test void createsVerifiedCommitInIsolatedBranchWithoutChangingSourceCheckout() throws Exception {
        Path source = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (!Files.isDirectory(source.resolve("frontend/node_modules"))) source = source.getParent();
        Path root = temp.resolve("repository"), worktrees = temp.resolve("worktrees");
        Files.createDirectories(root.resolve("tools/tool-fore-consult"));
        Files.createDirectories(root.resolve("frontend/scripts"));
        Files.createDirectories(root.resolve("forge-quality/forge-quality-cli/target"));
        Files.copy(source.resolve("frontend/scripts/check-consult-suggestion-patch.mjs"), root.resolve("frontend/scripts/check-consult-suggestion-patch.mjs"));
        Files.copy(source.resolve("forge-quality/forge-quality-cli/target/forge-quality-cli.jar"), root.resolve("forge-quality/forge-quality-cli/target/forge-quality-cli.jar"));
        Files.writeString(root.resolve(".gitignore"), "node_modules/\n*.tsbuildinfo\n");
        Files.writeString(root.resolve("frontend/package.json"), "{\"type\":\"module\"}");
        Files.writeString(root.resolve("frontend/tsconfig.json"), "{\"compilerOptions\":{\"noEmit\":true,\"jsx\":\"react-jsx\",\"skipLibCheck\":true,\"types\":[]},\"include\":[\"src/**/*.tsx\"]}");
        Files.writeString(root.resolve("frontend/scripts/check-feature-boundaries.mjs"), "console.log('fixture has only consultation files')");
        for (String path : ConsultSuggestionPatch.FILES) {
            Files.createDirectories(root.resolve(path).getParent());
            Files.writeString(root.resolve(path), "export const Example = () => <button title=\"复制\">复制</button>\n");
        }
        Path test = root.resolve("frontend/src/features/fore-consult/components/ImageLightbox.test.ts");
        Files.writeString(test, "import {it,expect} from 'vitest'; import {readFileSync} from 'node:fs'; it('shows clear copy action',()=>expect(readFileSync('src/features/fore-consult/components/ImageLightbox.tsx','utf8')).toContain('复制回答'));\n");
        command(root, "git", "init");
        String author = command(source, "git", "config", "user.name").strip(), email = command(source, "git", "config", "user.email").strip();
        command(root, "git", "config", "user.name", author); command(root, "git", "config", "user.email", email);
        command(root, "git", "add", ".gitignore", "frontend"); command(root, "git", "commit", "-m", "test: 建立咨询展示验证夹具");
        String initial = command(root, "git", "rev-parse", "HEAD").strip();
        Path dependencies = root.resolve("frontend/node_modules");
        if (System.getProperty("os.name").startsWith("Windows")) command(root, "cmd.exe", "/c", "mklink", "/J", dependencies.toString(), source.resolve("frontend/node_modules").toString());
        else Files.createSymbolicLink(dependencies, source.resolve("frontend/node_modules"));
        var model = mock(ConsultSuggestionModel.class); var review = mock(ConsultSuggestionReview.class);
        String file = ConsultSuggestionPatch.FILES.getFirst();
        when(model.ask(anyString(), any())).thenReturn(new ObjectMapper().valueToTree(Map.of("outcome", "PATCH", "edits", List.of(Map.of("path", file, "before", ">复制</button>", "after", ">复制回答</button>")))));
        String id = UUID.randomUUID().toString();
        Path work = worktrees.resolve(id);
        try {
            var result = new ConsultSuggestionPatch(model, review, root.toString(), worktrees).develop(
                    new ConsultSuggestion(id, "复制按钮文字明确一点", "明确复制按钮", "操作含义不清", "显示复制回答", "按钮显示复制回答", 0));
            assertThat(result.commit()).matches("[a-f0-9]{40}");
            assertThat(command(root, "git", "rev-parse", "HEAD").strip()).isEqualTo(initial);
            assertThat(command(root, "git", "show", result.commit() + ":" + file)).contains("复制回答");
            assertThat(Files.readString(root.resolve(file))).doesNotContain("复制回答");
            assertThat(command(root, "git", "show", "-s", "--format=%an <%ae>", result.commit()).strip()).isEqualTo(author + " <" + email + ">");
            verify(review, atLeastOnce()).reviewPatch(any(), contains("复制回答"));
            verify(review, atMost(3)).reviewPatch(any(), anyString());
        } finally {
            // 先移除自己的依赖目录链接，避免临时目录清理遍历共享依赖。
            if (Files.exists(work.resolve("frontend/node_modules"))) Files.delete(work.resolve("frontend/node_modules"));
            Files.deleteIfExists(dependencies);
        }
    }

    private static String command(Path root, String... args) throws Exception {
        Path log = Files.createTempFile("consult-patch-test-", ".log");
        try {
            Process process = new ProcessBuilder(args).directory(root.toFile()).redirectErrorStream(true).redirectOutput(log.toFile()).start();
            if (!process.waitFor(45, java.util.concurrent.TimeUnit.SECONDS)) { process.destroy(); throw new IllegalStateException("fixture timeout"); }
            String output = new String(Files.readAllBytes(log), java.nio.charset.StandardCharsets.UTF_8);
            assertThat(process.exitValue()).describedAs(output).isZero(); return output;
        } finally { Files.deleteIfExists(log); }
    }
}
