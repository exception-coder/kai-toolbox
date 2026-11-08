package com.exceptioncoder.toolbox.docviewer.imagehost;

import static com.exceptioncoder.toolbox.docviewer.imagehost.ImageHostModels.Stored;

/** Upload only; adapters never alter buckets, ACLs or existing objects. */
public interface ImageUploadGateway {
    void upload(Stored profile, String objectKey, byte[] bytes, String contentType) throws Exception;
}
