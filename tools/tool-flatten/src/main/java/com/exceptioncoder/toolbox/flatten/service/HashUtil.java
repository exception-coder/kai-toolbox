package com.exceptioncoder.toolbox.flatten.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

public final class HashUtil {

    private HashUtil() {}

    private static final int BUF_SIZE = 64 * 1024;

    /** Streaming MD5 of the given file. Used only for "is content equal" comparisons; not security-grade. */
    public static String md5(Path file) throws IOException {
        MessageDigest md;
        try {
            md = MessageDigest.getInstance("MD5");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("MD5 not available", e);
        }
        try (InputStream in = Files.newInputStream(file)) {
            byte[] buf = new byte[BUF_SIZE];
            int n;
            while ((n = in.read(buf)) > 0) {
                md.update(buf, 0, n);
            }
        }
        return HexFormat.of().formatHex(md.digest());
    }
}
