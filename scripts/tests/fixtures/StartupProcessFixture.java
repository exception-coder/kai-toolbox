import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/** 测量器进程协议夹具；只用于验证启动、退出和超时，不代表 Spring 性能。 */
public class StartupProcessFixture {

    public static void main(String[] args) throws Exception {
        String mode = System.getenv("STARTUP_TEST_MODE");
        if ("fail".equals(mode)) {
            System.exit(19);
        }
        if (!"hang".equals(mode)) {
            Path report = Path.of(System.getProperty("toolbox.performance.report-path"));
            Path temporary = report.resolveSibling("fixture.tmp");
            String json = """
                    {"runId":"%s","processId":%d,"milestones":{"applicationReady":{"status":"COMPLETED"}}}
                    """.formatted(System.getProperty("toolbox.performance.run-id"), ProcessHandle.current().pid());
            Files.writeString(temporary, json);
            Files.move(temporary, report, StandardCopyOption.ATOMIC_MOVE);
        }
        Thread.sleep(60000);
    }
}
