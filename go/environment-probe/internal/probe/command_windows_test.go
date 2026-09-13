package probe

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestBatchPathContainingSpaces(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "path with spaces")
	if err := os.MkdirAll(directory, 0700); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(directory, "version.cmd")
	if err := os.WriteFile(file, []byte("@echo off\r\necho 1.2.3\r\n"), 0600); err != nil {
		t.Fatal(err)
	}
	result := runCommand(context.Background(), file, "--version")
	if result.ExitCode != 0 || result.Output != "1.2.3" {
		t.Fatalf("batch result: %+v", result)
	}
}
