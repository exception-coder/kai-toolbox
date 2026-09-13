// Package probe owns the bounded, read-only environment command batch.
package probe

import (
	"context"
	"errors"
	"os/exec"
	"strings"
	"sync"
	"time"
)

const concurrency = 4
const commandTimeout = 10 * time.Second
const outputLimit = 16000

var commandIDs = []string{"git", "node", "npm", "python", "uv", "claude", "codex", "graphify", "openspec", "java", "mvn"}

// Result contains execution evidence; shared Java rules evaluate readiness.
type Result struct {
	ID         string `json:"id"`
	ExitCode   int    `json:"exitCode"`
	Completed  bool   `json:"completed"`
	Output     string `json:"output"`
	DurationMs int64  `json:"durationMs"`
}

// Response is the versioned stdout protocol consumed by the Java adapter.
type Response struct {
	ProtocolVersion int      `json:"protocolVersion"`
	Engine          string   `json:"engine"`
	Results         []Result `json:"results"`
}

// Inspect executes only the fixed catalog and preserves its order.
func Inspect(ctx context.Context) Response {
	return Response{1, "go", inspectBatch(ctx, commandIDs, run)}
}

func inspectBatch(ctx context.Context, ids []string, execute func(context.Context, string) Result) []Result {
	results := make([]Result, len(ids))
	jobs := make(chan int)
	var workers sync.WaitGroup
	for range concurrency {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for index := range jobs {
				results[index] = execute(ctx, ids[index])
			}
		}()
	}
	for index := range ids {
		jobs <- index
	}
	close(jobs)
	workers.Wait()
	return results
}

func run(parent context.Context, id string) Result {
	start := time.Now()
	ctx, cancel := context.WithTimeout(parent, commandTimeout)
	defer cancel()
	result := runCommand(ctx, id, "--version")
	result.ID = id
	result.DurationMs = time.Since(start).Milliseconds()
	return result
}

func runCommand(ctx context.Context, name string, args ...string) Result {
	cmd, err := command(ctx, name, args...)
	if err != nil {
		return Result{ExitCode: 127, Output: "未找到命令：" + name}
	}
	output := &boundedOutput{}
	cmd.Stdout, cmd.Stderr = output, output
	cmd.WaitDelay = time.Second
	err = cmd.Run()
	result := Result{Completed: true, Output: strings.TrimSpace(strings.ToValidUTF8(output.String(), "�"))}
	if ctx.Err() != nil {
		result.Completed, result.ExitCode = false, -1
		result.Output = "命令检测超时或中断：" + name
	} else if err != nil {
		var exit *exec.ExitError
		result.ExitCode = -1
		if errors.As(err, &exit) {
			result.ExitCode = exit.ExitCode()
		} else {
			result.Output = err.Error()
		}
	}
	return result
}

type boundedOutput struct {
	mu   sync.Mutex
	data []byte
}

func (output *boundedOutput) Write(data []byte) (int, error) {
	output.mu.Lock()
	defer output.mu.Unlock()
	remaining := outputLimit - len(output.data)
	if remaining > 0 {
		output.data = append(output.data, data[:min(remaining, len(data))]...)
	}
	return len(data), nil
}

func (output *boundedOutput) String() string {
	output.mu.Lock()
	defer output.mu.Unlock()
	return string(output.data)
}
