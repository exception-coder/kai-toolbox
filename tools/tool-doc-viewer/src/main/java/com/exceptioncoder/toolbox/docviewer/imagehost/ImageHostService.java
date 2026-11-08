package com.exceptioncoder.toolbox.docviewer.imagehost;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import static com.exceptioncoder.toolbox.docviewer.imagehost.ImageHostModels.*;
import static com.exceptioncoder.toolbox.docviewer.imagehost.ImageHostPolicy.*;

@Service
public class ImageHostService {
    public static final int MAX_BYTES = 10 * 1024 * 1024;
    private final ImageHostRepository repository;
    private final ImageHostPolicy policy;
    private final ImageUploadGateway gateway;

    public ImageHostService(ImageHostRepository repository, ImageHostPolicy policy, ImageUploadGateway gateway) {
        this.repository = repository; this.policy = policy; this.gateway = gateway;
    }
    public List<View> list(long owner) { return repository.list(owner); }
    public List<Receipt> recent(long owner) { return repository.recent(owner); }

    public View save(long owner, String id, SaveRequest input) {
        Settings settings = policy.validate(input.settings());
        String targetId = id;
        if (id == null) {
            try { targetId = UUID.nameUUIDFromBytes((owner + ":" + UUID.fromString(input.creationId())).getBytes(StandardCharsets.UTF_8)).toString(); }
            catch (IllegalArgumentException | NullPointerException e) { bad("新增配置需要有效的请求编号"); }
        }
        Stored previous = id == null ? repository.find(owner,targetId).orElse(null) : required(owner,id);
        if (previous == null && repository.list(owner).size() >= 20) bad("每个账号最多保存20套图床配置");
        boolean sameProvider = previous != null && previous.settings().provider().equals(settings.provider());
        String accessKey = text(input.accessKey());
        String secret = text(input.secret());
        if (sameProvider) {
            if (accessKey.isEmpty()) accessKey = previous.credentials().accessKey();
            if (secret.isEmpty()) secret = previous.credentials().secret();
        }
        if (secret.isEmpty() || secret.length() > 4000 || secret.contains("\r") || secret.contains("\n")) bad("请填写有效密钥或 Token");
        if (!"GITHUB".equals(settings.provider()) && (accessKey.isEmpty() || accessKey.length() > 200)) bad("请填写有效 AccessKey ID");
        if ("GITHUB".equals(settings.provider())) accessKey = "";
        return repository.save(new Stored(targetId, owner, settings,
                new Credentials(accessKey, secret), input.makeDefault() || previous != null && previous.isDefault()));
    }

    public void delete(long owner, String id) { required(owner,id); repository.delete(owner,id); }

    public Receipt upload(long owner, String profileId, String requestId, String fileName, byte[] bytes) {
        try { if (!UUID.fromString(requestId).toString().equals(requestId)) bad("上传请求编号无效"); }
        catch (IllegalArgumentException | NullPointerException e) { bad("上传请求编号无效"); }
        if (bytes.length == 0 || bytes.length > MAX_BYTES) bad("请选择10MiB以内的图片");
        String extension = policy.extension(bytes);
        String digest;
        try { digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (Exception e) { throw new IllegalStateException("图片摘要计算失败"); }
        var existing = repository.receipt(owner,requestId);
        if (existing.isPresent()) return replay(owner, profileId, requestId, digest, existing.get());
        Stored profile = required(owner, profileId);
        policy.checkUploadTarget(profile.settings());
        String key = (profile.settings().prefix().isEmpty() ? "" : profile.settings().prefix() + "/")
                + LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM")) + "/" + requestId + "." + extension;
        String base = profile.settings().publicBaseUrl();
        if (base.isEmpty()) base = "https://raw.githubusercontent.com/" + profile.settings().repository() + "/"
                + OfficialImageUploadGateway.encodePath(profile.settings().branch());
        String name = text(fileName).replaceAll("[\\p{Cntrl}]", "_");
        if (name.isEmpty()) name = "图片." + extension;
        if (name.length() > 160) name = name.substring(0,160);
        var receipt = new Receipt(requestId,profileId,key,base + "/" + OfficialImageUploadGateway.encodePath(key),name,"UPLOADING");
        if (!repository.claim(owner, receipt, digest)) return replay(owner,profileId,requestId,digest,repository.receipt(owner,requestId).orElseThrow());
        try {
            gateway.upload(profile,key,bytes,"image/" + (extension.equals("jpg") ? "jpeg" : extension));
            repository.finish(owner,requestId,"SUCCESS");
        } catch (Exception failure) {
            repository.finish(owner,requestId,"UNKNOWN");
            if (failure instanceof InterruptedException) Thread.currentThread().interrupt();
            // Provider exceptions can embed signed URLs, access keys and remote bodies: never expose or log them.
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"上传未获成功确认，请先到图床核对是否已有图片；检查地址、凭据和写入权限后再操作，不自动重试");
        }
        return repository.receipt(owner,requestId).orElseThrow();
    }

    private Receipt replay(long owner, String profile, String request, String digest, Receipt existing) {
        if (!repository.matches(owner,request,profile,digest)) throw new ResponseStatusException(HttpStatus.CONFLICT,"相同上传编号的图片或图床配置不一致");
        if (!existing.state().equals("SUCCESS")) throw new ResponseStatusException(HttpStatus.CONFLICT,"上传仍在执行或结果待核对，请查看最近上传并到存储端确认，不自动重试");
        return existing;
    }
    private Stored required(long owner, String id) {
        return repository.find(owner,id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,"图床配置不存在或无访问权限"));
    }
}
