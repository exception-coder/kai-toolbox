package com.exceptioncoder.toolbox.docviewer.imagehost;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import java.net.InetAddress;
import java.net.URI;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import static com.exceptioncoder.toolbox.docviewer.imagehost.ImageHostModels.*;

@Component
public class ImageHostPolicy {
    private final Set<String> privateHosts;
    public ImageHostPolicy(@Value("${toolbox.doc-viewer.image-host.allowed-custom-hosts:}") String hosts) {
        privateHosts = Arrays.stream(hosts.split(",")).map(String::trim).filter(s -> !s.isEmpty()).collect(Collectors.toSet());
    }

    public Settings validate(Settings s) {
        if (s == null || s.provider() == null || !Set.of("OSS", "S3", "GITHUB").contains(s.provider())) bad("请选择 OSS、S3 或 GitHub 图床");
        String name = text(s.name());
        if (name.isEmpty() || name.length() > 80) bad("配置名称为1至80字");
        String prefix = text(s.prefix()).replaceAll("^/+|/+$", "");
        if (!prefix.isEmpty() && (!prefix.matches("[a-zA-Z0-9_/-]{1,120}") || prefix.contains("..") || prefix.contains("//"))) bad("图片目录只支持英文、数字、下划线、短横线和目录分隔符");
        String endpoint = text(s.endpoint()).replaceAll("/+$", "");
        String publicBase = text(s.publicBaseUrl()).replaceAll("/+$", "");
        if (!"GITHUB".equals(s.provider())) {
            URI uri = https(endpoint);
            if (!uri.getPath().isEmpty()) bad("Endpoint 只填写服务地址，不含存储桶或目录");
            if ("OSS".equals(s.provider()) && !uri.getHost().endsWith(".aliyuncs.com")) bad("OSS Endpoint 必须为阿里云官方域名");
            if (!text(s.bucket()).matches("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]")) bad("请填写有效的 Bucket 名称");
            if (!text(s.region()).matches("[a-zA-Z0-9-]{1,64}")) bad("请填写 Region；R2 可填写 auto");
            https(publicBase);
        } else {
            if (!text(s.repository()).matches("[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+")) bad("仓库格式为 owner/repository");
            if (!text(s.branch()).matches("[a-zA-Z0-9_./-]{1,100}") || s.branch().contains("..")) bad("请填写有效分支名称");
            if (!publicBase.isEmpty()) https(publicBase);
        }
        return new Settings(name, s.provider(), "GITHUB".equals(s.provider()) ? "" : endpoint, text(s.region()),
                text(s.bucket()), prefix, publicBase, text(s.repository()), text(s.branch()), s.pathStyle());
    }

    public void checkUploadTarget(Settings s) {
        if ("GITHUB".equals(s.provider())) return;
        String host = https(s.endpoint()).getHost();
        if (privateHosts.contains(host)) return;
        if ("S3".equals(s.provider()) && !host.endsWith(".amazonaws.com") && !host.endsWith(".amazonaws.com.cn")
                && !host.endsWith(".r2.cloudflarestorage.com")) {
            bad("自托管或其他 S3 服务需由管理员在服务端 allowed-custom-hosts 中放行精确主机名");
        }
        try {
            for (InetAddress address : InetAddress.getAllByName(host)) {
                byte[] bytes = address.getAddress();
                boolean reservedV6 = bytes.length == 16 && (bytes[0] & 0xfe) == 0xfc;
                boolean carrierNat = bytes.length == 4 && (bytes[0] & 255) == 100 && (bytes[1] & 255) >= 64 && (bytes[1] & 255) <= 127;
                if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                        || address.isSiteLocalAddress() || address.isMulticastAddress() || reservedV6 || carrierNat) bad("Endpoint 指向私有或保留网络；内网存储需由管理员在服务端放行指定主机");
            }
        } catch (ResponseStatusException e) { throw e; }
        catch (Exception e) { bad("无法解析图床 Endpoint，请核对地址"); }
    }

    public String extension(byte[] b) {
        if (b.length >= 8 && b[0] == (byte)137 && b[1] == 80 && b[2] == 78 && b[3] == 71 && b[4] == 13 && b[5] == 10 && b[6] == 26 && b[7] == 10) return "png";
        if (b.length >= 3 && b[0] == (byte)255 && b[1] == (byte)216 && b[2] == (byte)255) return "jpg";
        if (b.length >= 6 && new String(b,0,6,java.nio.charset.StandardCharsets.US_ASCII).matches("GIF8[79]a")) return "gif";
        if (b.length >= 12 && new String(b,0,4,java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF") && new String(b,8,4,java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")) return "webp";
        bad("只支持 PNG、JPEG、GIF、WebP 图片；文件内容与图片类型不符"); return "";
    }

    static URI https(String value) {
        try {
            URI uri = URI.create(value);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getRawQuery() != null || uri.getRawFragment() != null || uri.getPort() == 0 || uri.getPort() > 65535
                    || value.contains("<") || value.contains(">")) bad("请填写不含账号、参数和片段的 HTTPS 地址");
            return uri;
        } catch (IllegalArgumentException e) { bad("图床地址格式不正确"); return null; }
    }
    static String text(String value) { return value == null ? "" : value.trim(); }
    static void bad(String message) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
}
