package com.exceptioncoder.toolbox.docviewer.imagehost;

/** Public views deliberately exclude all credential material. */
public final class ImageHostModels {
    private ImageHostModels() {}

    public record Settings(String name, String provider, String endpoint, String region, String bucket,
                           String prefix, String publicBaseUrl, String repository, String branch, boolean pathStyle) {}
    public record SaveRequest(Settings settings, String accessKey, String secret, boolean makeDefault, String creationId) {
        @Override public String toString() { return "ImageHostSaveRequest[credentials=REDACTED]"; }
    }
    public record View(String id, Settings settings, boolean credentialsConfigured, boolean isDefault) {}
    public record Credentials(String accessKey, String secret) {
        @Override public String toString() { return "ImageHostCredentials[REDACTED]"; }
    }
    public record Stored(String id, long ownerId, Settings settings, Credentials credentials, boolean isDefault) {
        @Override public String toString() { return "ImageHostProfile[id=" + id + "]"; }
        public View view() { return new View(id, settings, true, isDefault); }
    }
    public record Receipt(String requestId, String profileId, String objectKey, String url, String fileName, String state) {
        public String getMarkdown() { return "![" + fileName.replaceAll("[\\\\\\[\\]\\r\\n]", "_") + "](<" + url + ">)"; }
    }
}
