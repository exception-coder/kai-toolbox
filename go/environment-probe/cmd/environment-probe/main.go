package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/exception-coder/kai-toolbox/go/environment-probe/internal/probe"
)

func main() {
	if len(os.Args) != 1 {
		fmt.Fprintln(os.Stderr, "environment-probe accepts no commands or arguments")
		os.Exit(2)
	}
	response := probe.Inspect(context.Background())
	if err := json.NewEncoder(os.Stdout).Encode(response); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
