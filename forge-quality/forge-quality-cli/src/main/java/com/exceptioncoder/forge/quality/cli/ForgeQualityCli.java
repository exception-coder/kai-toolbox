package com.exceptioncoder.forge.quality.cli;

import com.exceptioncoder.forge.quality.application.DetectionReport;
import com.exceptioncoder.forge.quality.application.ForgeVerificationService;
import com.exceptioncoder.forge.quality.application.VerificationIssue;
import com.exceptioncoder.forge.quality.application.VerificationPhase;
import com.exceptioncoder.forge.quality.application.VerificationReport;
import com.exceptioncoder.forge.quality.core.Finding;
import com.exceptioncoder.forge.quality.core.GateStatus;
import com.exceptioncoder.forge.quality.core.QualityReport;
import com.exceptioncoder.forge.quality.core.StackCapability;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Command line entry point shared by coding agents, developers, and CI. */
public final class ForgeQualityCli {
    private static final int EXIT_PASSED = 0;
    private static final int EXIT_FAILED = 1;
    private static final int EXIT_USAGE = 2;

    private ForgeQualityCli() {
    }

    /** Starts the CLI process. */
    public static void main(String[] args) {
        System.exit(run(args, System.out, System.err));
    }

    static int run(String[] rawArgs, PrintStream output, PrintStream error) {
        try {
            Arguments arguments = Arguments.parse(rawArgs);
            ForgeVerificationService service = new ForgeVerificationService();
            return execute(arguments, service, output);
        } catch (IllegalArgumentException | IOException exception) {
            error.println("forge verify: " + exception.getMessage());
            error.println(Arguments.usage());
            return EXIT_USAGE;
        }
    }

    private static int execute(Arguments arguments, ForgeVerificationService service,
                               PrintStream output) throws IOException {
        return switch (arguments.command()) {
            case "detect" -> printDetection(service.detect(arguments.project()), arguments.format(), output);
            case "check" -> printStaticReport(service.checkStatic(arguments.project()), arguments.format(), output);
            case "init" -> initialize(service, arguments.project(), output);
            case "verify" -> verify(arguments, service, output);
            default -> throw new IllegalArgumentException("Unknown command: " + arguments.command());
        };
    }

    private static int verify(Arguments arguments, ForgeVerificationService service,
                              PrintStream output) throws IOException {
        VerificationReport report = service.verify(arguments.project(), VerificationPhase.parse(arguments.phase()));
        printVerificationReport(report, arguments.format(), output);
        return report.status().equals("PASSED") ? EXIT_PASSED : EXIT_FAILED;
    }

    private static int printDetection(DetectionReport report, String format,
                                      PrintStream output) throws IOException {
        if (format.equals("json")) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("plugins", report.plugins());
            result.put("capabilities", report.capabilities());
            output.println(objectMapper().writeValueAsString(result));
        } else {
            output.println("Detected stack");
            report.capabilities().forEach(capability -> output.printf("[x] %s (%s)%n",
                    capability.displayName(), capability.id()));
        }
        return EXIT_PASSED;
    }

    private static int printStaticReport(QualityReport report, String format, PrintStream output) throws IOException {
        if (format.equals("json")) {
            output.println(objectMapper().writeValueAsString(report));
        } else {
            output.printf("Forge Static Gate: %s%n", report.status());
            output.printf("Plugins: %s%n", String.join(", ", report.plugins()));
            output.printf("Checkers: %s%n", String.join(", ", report.executedCheckers()));
            for (Finding finding : report.findings()) {
                String location = finding.file().isBlank() ? "" : " " + finding.file();
                output.printf("[%s] %s%s - %s%n", finding.severity(), finding.ruleId(), location, finding.message());
            }
        }
        return report.status() == GateStatus.PASSED ? EXIT_PASSED : EXIT_FAILED;
    }

    private static void printVerificationReport(VerificationReport report, String format,
                                                PrintStream output) throws IOException {
        if (format.equals("json")) {
            output.println(objectMapper().writeValueAsString(report));
            return;
        }
        output.printf("Forge Verification: %s%n", report.status());
        output.printf("Static Verification: %s%n", report.staticStatus());
        output.printf("Runtime Verification: %s%n", report.runtimeStatus());
        for (VerificationIssue issue : report.issues()) {
            output.printf("[%s] %s %s - %s%n", issue.phase(), issue.ruleId(), issue.scenarioId(), issue.message());
        }
    }

    private static int initialize(ForgeVerificationService service, Path project, PrintStream output) throws IOException {
        Path root = project.toAbsolutePath().normalize();
        DetectionReport detection = service.detect(root);
        Path forgeDirectory = root.resolve(".forge");
        Files.createDirectories(forgeDirectory);
        boolean created = createStaticConfiguration(detection, root, forgeDirectory, output);
        created |= createRuntimeConfiguration(forgeDirectory, output);
        if (!created) {
            throw new IllegalArgumentException("Forge verification configuration already exists");
        }
        return EXIT_PASSED;
    }

    private static boolean createStaticConfiguration(DetectionReport detection, Path projectRoot,
                                                     Path forgeDirectory, PrintStream output) throws IOException {
        Path config = forgeDirectory.resolve("quality.yml");
        if (Files.exists(config)) {
            return false;
        }
        StringBuilder yaml = new StringBuilder("quality:\n  version: 1\n  capabilities:\n");
        for (StackCapability capability : detection.capabilities()) {
            yaml.append("    - ").append(capability.id()).append('\n');
        }
        yaml.append("  gates:\n    failOn: ERROR\n");
        Files.writeString(config, yaml.toString(), StandardCharsets.UTF_8);
        output.println("Created " + projectRoot.relativize(config));
        return true;
    }

    private static boolean createRuntimeConfiguration(Path forgeDirectory, PrintStream output) throws IOException {
        Path config = forgeDirectory.resolve("verify.yml");
        if (Files.exists(config)) {
            return false;
        }
        Files.writeString(config, "runtime:\n  scenarios: []\n", StandardCharsets.UTF_8);
        output.println("Created .forge/verify.yml");
        return true;
    }

    private static ObjectMapper objectMapper() {
        return new ObjectMapper().registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    private record Arguments(String command, String phase, Path project, String format) {
        private static Arguments parse(String[] rawArgs) {
            List<String> args = new ArrayList<>(Arrays.asList(rawArgs));
            if (!args.isEmpty() && args.getFirst().equals("quality")) {
                args.removeFirst();
            }
            if (args.isEmpty()) {
                throw new IllegalArgumentException("A command is required");
            }
            String command = args.removeFirst();
            String phase = command.equals("verify") && !args.isEmpty() && !args.getFirst().startsWith("--")
                    ? args.removeFirst() : "all";
            ParsedOptions options = parseOptions(args);
            return new Arguments(command, phase, options.project(), options.format());
        }

        private static ParsedOptions parseOptions(List<String> args) {
            Path project = Path.of(".");
            String format = "human";
            for (int index = 0; index < args.size(); index++) {
                String argument = args.get(index);
                if (argument.equals("--project")) {
                    project = Path.of(requireValue(args, ++index, argument));
                } else if (argument.equals("--format")) {
                    format = requireValue(args, ++index, argument);
                } else {
                    throw new IllegalArgumentException("Unknown argument: " + argument);
                }
            }
            if (!format.equals("human") && !format.equals("json")) {
                throw new IllegalArgumentException("Format must be human or json");
            }
            return new ParsedOptions(project, format);
        }

        private static String requireValue(List<String> args, int index, String option) {
            if (index >= args.size()) {
                throw new IllegalArgumentException("Missing value for " + option);
            }
            return args.get(index);
        }

        private static String usage() {
            return "Usage: forge verify [static|runtime] [--project <path>] [--format human|json]";
        }
    }

    private record ParsedOptions(Path project, String format) {
    }
}
