package probe

import (
	"context"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestBatchBoundsConcurrencyAndPreservesOrder(t *testing.T) {
	var active, maximum atomic.Int32
	results := inspectBatch(context.Background(), commandIDs, func(_ context.Context, id string) Result {
		count := active.Add(1)
		for previous := maximum.Load(); count > previous; previous = maximum.Load() {
			if maximum.CompareAndSwap(previous, count) {
				break
			}
		}
		time.Sleep(10 * time.Millisecond)
		active.Add(-1)
		return Result{ID: id, Completed: true}
	})
	if maximum.Load() < 2 || maximum.Load() > concurrency {
		t.Fatalf("concurrency = %d", maximum.Load())
	}
	for index, result := range results {
		if result.ID != commandIDs[index] {
			t.Fatalf("unexpected order: %v", results)
		}
	}
}

func TestMissingCommand(t *testing.T) {
	result := runCommand(context.Background(), "forge-command-that-does-not-exist")
	if result.Completed || result.ExitCode != 127 {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestOutputIsBounded(t *testing.T) {
	t.Setenv("FORGE_PROBE_TEST_HELPER", "output")
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	result := runCommand(context.Background(), binary, "-test.run=TestProcessHelper")
	if !result.Completed || result.ExitCode != 0 || len(result.Output) != outputLimit {
		t.Fatalf("completed=%v exit=%d output=%d", result.Completed, result.ExitCode, len(result.Output))
	}
}

func TestTimeoutReturnsAttentionEvidence(t *testing.T) {
	t.Setenv("FORGE_PROBE_TEST_HELPER", "sleep")
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	result := runCommand(ctx, binary, "-test.run=TestProcessHelper")
	if result.Completed || result.ExitCode != -1 || time.Since(start) > 3*time.Second {
		t.Fatalf("timeout result: %+v", result)
	}
}

func TestProcessHelper(t *testing.T) {
	switch os.Getenv("FORGE_PROBE_TEST_HELPER") {
	case "output":
		_, _ = os.Stdout.WriteString(strings.Repeat("x", outputLimit*4))
		os.Exit(0)
	case "sleep":
		time.Sleep(30 * time.Second)
		os.Exit(0)
	}
}
