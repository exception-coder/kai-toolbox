package com.exceptioncoder.toolbox.hosts.files;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.exceptioncoder.toolbox.hosts.domain.Host;
import com.exceptioncoder.toolbox.hosts.service.*;
import com.jcraft.jsch.*;
import java.io.*;
import org.junit.jupiter.api.*;

class SftpFilesTest {

  SftpFiles files;
  ChannelSftp channel;
  Session session;

  @BeforeEach
  void setup() throws Exception {
    var hosts = mock(HostsService.class);
    var sessions = mock(HostSshSessions.class);
    var host = new Host();
    session = mock(Session.class);
    channel = mock(ChannelSftp.class);
    when(hosts.findRequired("erp")).thenReturn(host);
    when(sessions.openVerified(host)).thenReturn(session);
    when(session.openChannel("sftp")).thenReturn(channel);
    when(channel.pwd()).thenReturn("/server");
    var attrs = mock(SftpATTRS.class);
    when(attrs.isReg()).thenReturn(true);
    when(attrs.getSize()).thenReturn(3L);
    when(attrs.getPermissions()).thenReturn(0644);
    when(channel.lstat(anyString())).thenReturn(attrs);
    when(channel.get(anyString())).thenReturn(
      new ByteArrayInputStream("old".getBytes())
    );
    files = new SftpFiles(hosts, sessions);
  }

  @Test
  void rejectsUnexpectedOverwriteAndDisconnects() throws Exception {
    assertThrows(IllegalArgumentException.class, () ->
      files.upload("erp", "/server", "app.txt", "new".getBytes(), null)
    );
    verify(channel, never()).put(any(InputStream.class), anyString());
    verify(channel).disconnect();
    verify(session).disconnect();
  }

  @Test
  void backupAndReplacementAreOrdered() throws Exception {
    when(channel.get(startsWith(".forge-upload-"))).thenAnswer(i ->
      new ByteArrayInputStream("new".getBytes())
    );
    when(channel.get("app.txt")).thenAnswer(i ->
      new ByteArrayInputStream("old".getBytes())
    );
    var result = files.upload(
      "erp",
      "/server",
      "app.txt",
      "new".getBytes(),
      SftpFiles.hash("old".getBytes())
    );
    assertTrue(result.backup().contains(".forge-backup-"));
    var order = inOrder(channel);
    order
      .verify(channel)
      .put(any(InputStream.class), startsWith(".forge-upload-"));
    order
      .verify(channel)
      .rename(eq("app.txt"), startsWith("app.txt.forge-backup-"));
    order.verify(channel).rename(startsWith(".forge-upload-"), eq("app.txt"));
  }

  @Test
  void restoresOriginalWhenFinalRenameFails() throws Exception {
    when(channel.get(anyString())).thenAnswer(i ->
      new ByteArrayInputStream(
        i.<String>getArgument(0).startsWith(".forge-upload-")
          ? "new".getBytes()
          : "old".getBytes()
      )
    );
    doThrow(new SftpException(4, "failed"))
      .when(channel)
      .rename(startsWith(".forge-upload-"), eq("app.txt"));
    assertThrows(IllegalStateException.class, () ->
      files.upload(
        "erp",
        "/server",
        "app.txt",
        "new".getBytes(),
        SftpFiles.hash("old".getBytes())
      )
    );
    verify(channel).rename(startsWith("app.txt.forge-backup-"), eq("app.txt"));
  }

  @Test
  void pathsDoNotUseLocalOsOrPermitDirectoryInFilename() {
    assertEquals("C:/ERP/bin", SftpFiles.path("C:\\ERP\\bin"));
    assertThrows(IllegalArgumentException.class, () ->
      SftpFiles.filename("../app.txt")
    );
    assertThrows(IllegalArgumentException.class, () ->
      SftpFiles.filename("C:app.txt")
    );
    assertThrows(IllegalArgumentException.class, () -> SftpFiles.path("/erp/*.txt"));
  }

  @Test
  void createsNewFileWithoutBackup() throws Exception {
    when(channel.lstat("new.txt")).thenThrow(new SftpException(ChannelSftp.SSH_FX_NO_SUCH_FILE, "missing"));
    when(channel.get(startsWith(".forge-upload-"))).thenAnswer(i -> new ByteArrayInputStream("new".getBytes()));
    var result = files.upload("erp", "/server", "new.txt", "new".getBytes(), null);
    assertNull(result.backup());
    verify(channel).rename(startsWith(".forge-upload-"), eq("new.txt"));
    verify(channel, never()).rename(eq("new.txt"), anyString());
  }

  @Test
  void cleansPartialUploadWhenPutFails() throws Exception {
    doThrow(new SftpException(4, "connection lost")).when(channel).put(any(InputStream.class), anyString());
    assertThrows(IllegalStateException.class, () -> files.upload("erp", "/server", "app.txt", "new".getBytes(), SftpFiles.hash("old".getBytes())));
    verify(channel).rm(startsWith(".forge-upload-"));
    verify(channel, never()).rename(anyString(), anyString());
  }

  @Test
  void refusesSymlinksAndOversizedDownloads() throws Exception {
    var attrs = mock(SftpATTRS.class);
    when(attrs.isReg()).thenReturn(true);
    when(attrs.isLink()).thenReturn(true);
    when(channel.lstat("link")).thenReturn(attrs);
    assertThrows(IllegalArgumentException.class, () ->
      files.download("erp", "link")
    );
    when(attrs.isLink()).thenReturn(false);
    when(attrs.getSize()).thenReturn((long) SftpFiles.LIMIT + 1);
    assertThrows(IllegalArgumentException.class, () ->
      files.download("erp", "link")
    );
    verify(channel, never()).get("link");
  }
}
