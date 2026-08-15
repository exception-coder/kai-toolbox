package com.exceptioncoder.toolbox.prdclarify.delivery;

import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryClaimStatus;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryEvidenceStatus;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;

/** 在已配置项目根内校验模型提出的源码坐标。 */
@Component
public class DeliveryEvidenceVerifier {

    /** 校验全部 claim，并对无有效证据的完成声明降级。 */
    public VerifiedLedger verify(ProgressClaimLedgerParser.ProposedLedger proposed, String projectPath) {
        if (proposed == null || proposed.claims() == null || proposed.claims().isEmpty()) {
            throw new IllegalArgumentException("claim ledger 不能为空");
        }
        Path root = resolveProjectRoot(projectPath);
        List<VerifiedClaim> claims = proposed.claims().stream()
                .map(claim -> verifyClaim(root, claim))
                .toList();
        return new VerifiedLedger(claims);
    }

    private VerifiedClaim verifyClaim(Path root, ProgressClaimLedgerParser.ProposedClaim claim) {
        List<VerifiedEvidence> evidences = claim.evidences().stream()
                .map(evidence -> verifyEvidence(root, evidence))
                .toList();
        boolean verified = evidences.stream()
                .anyMatch(evidence -> evidence.status() == DeliveryEvidenceStatus.VERIFIED);
        DeliveryClaimStatus status = claim.status() == DeliveryClaimStatus.COMPLETED && !verified
                ? DeliveryClaimStatus.PARTIAL
                : claim.status();
        return new VerifiedClaim(claim.claimId(), claim.title(), status, claim.testItem(), evidences);
    }

    private VerifiedEvidence verifyEvidence(Path root, ProgressClaimLedgerParser.ProposedEvidence evidence) {
        String relativePath = evidence.relativePath();
        Path candidate;
        try {
            Path supplied = Path.of(relativePath);
            if (supplied.isAbsolute()) {
                return invalid(evidence, DeliveryEvidenceStatus.INVALID_PATH, "证据必须使用相对路径");
            }
            candidate = root.resolve(supplied).normalize();
        } catch (InvalidPathException exception) {
            return invalid(evidence, DeliveryEvidenceStatus.INVALID_PATH, "证据路径格式非法");
        }
        if (!candidate.startsWith(root)) {
            return invalid(evidence, DeliveryEvidenceStatus.INVALID_PATH, "证据路径离开项目根");
        }
        if (!Files.isRegularFile(candidate)) {
            return invalid(evidence, DeliveryEvidenceStatus.MISSING_FILE, "证据文件不存在");
        }
        try {
            Path realFile = candidate.toRealPath();
            if (!realFile.startsWith(root)) {
                return invalid(evidence, DeliveryEvidenceStatus.OUTSIDE_PROJECT, "证据真实路径离开项目根");
            }
            List<String> lines = Files.readAllLines(realFile, StandardCharsets.UTF_8);
            if (evidence.lineStart() < 1 || evidence.lineEnd() < evidence.lineStart()
                    || evidence.lineEnd() > lines.size()) {
                return invalid(evidence, DeliveryEvidenceStatus.INVALID_RANGE, "证据行范围无效");
            }
            return new VerifiedEvidence(
                    normalizeRelative(root.relativize(realFile)),
                    evidence.lineStart(),
                    evidence.lineEnd(),
                    evidence.symbol(),
                    sha256(realFile),
                    DeliveryEvidenceStatus.VERIFIED,
                    null);
        } catch (Exception exception) {
            return invalid(evidence, DeliveryEvidenceStatus.UNREADABLE, "证据文件无法读取");
        }
    }

    private static Path resolveProjectRoot(String projectPath) {
        if (projectPath == null || projectPath.isBlank()) {
            throw new IllegalArgumentException("项目根目录不能为空");
        }
        try {
            Path root = Path.of(projectPath).toRealPath();
            if (!Files.isDirectory(root)) {
                throw new IllegalArgumentException("项目根目录不可访问");
            }
            return root;
        } catch (Exception exception) {
            throw new IllegalArgumentException("项目根目录不可访问", exception);
        }
    }

    private static VerifiedEvidence invalid(
            ProgressClaimLedgerParser.ProposedEvidence evidence,
            DeliveryEvidenceStatus status,
            String error) {
        return new VerifiedEvidence(evidence.relativePath(), evidence.lineStart(), evidence.lineEnd(),
                evidence.symbol(), null, status, error);
    }

    private static String normalizeRelative(Path relative) {
        return relative.toString().replace('\\', '/');
    }

    private static String sha256(Path file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = Files.newInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                digest.update(buffer, 0, read);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    /** 已由服务端裁决的完整 claim 集合。 */
    public record VerifiedLedger(List<VerifiedClaim> claims) {
    }

    /** 已由服务端裁决的一条 claim。 */
    public record VerifiedClaim(
            String claimId,
            String title,
            DeliveryClaimStatus status,
            boolean testItem,
            List<VerifiedEvidence> evidences) {
    }

    /** 一条证据的服务端核验结果。 */
    public record VerifiedEvidence(
            String relativePath,
            int lineStart,
            int lineEnd,
            String symbol,
            String fileSha256,
            DeliveryEvidenceStatus status,
            String lastError) {
    }
}
