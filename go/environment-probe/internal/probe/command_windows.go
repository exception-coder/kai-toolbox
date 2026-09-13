package probe

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func command(ctx context.Context, name string, args ...string) (*exec.Cmd, error) {
	resolved, err := exec.LookPath(name)
	if err != nil {
		return nil, err
	}
	extension := strings.ToLower(filepath.Ext(resolved))
	cmd := exec.CommandContext(ctx, resolved, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if extension == ".cmd" || extension == ".bat" {
		// cmd.exe uses different quoting from CommandLineToArgvW; preserve paths with spaces.
		cmd = exec.CommandContext(ctx, filepath.Join(os.Getenv("SystemRoot"), "System32", "cmd.exe"),
			"/d", "/s", "/c")
		quoted := make([]string, len(args))
		for index, argument := range args {
			quoted[index] = `"` + argument + `"`
		}
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true,
			CmdLine: `cmd.exe /d /s /c ""` + resolved + `" ` + strings.Join(quoted, " ") + `"`}
	}
	cmd.Cancel = func() error {
		cleanup, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		kill := exec.CommandContext(cleanup, filepath.Join(os.Getenv("SystemRoot"), "System32", "taskkill.exe"),
			"/PID", strconv.Itoa(cmd.Process.Pid), "/T", "/F")
		kill.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		if err := kill.Run(); err != nil {
			return cmd.Process.Kill()
		}
		return nil
	}
	return cmd, nil
}
