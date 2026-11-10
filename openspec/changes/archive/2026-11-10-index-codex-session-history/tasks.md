## 1. Implementation

- [x] 1.1 Add streaming offset index and shared incremental history/usage snapshots with invalidation and review isolation.
- [x] 1.2 Route SessionHistoryService through the index, preserving shared turn and usage semantics.

## 2. Verification

- [x] 2.1 Add regression coverage for pagination, tool pairing, append, partial and invalid records, replacement, concurrent calls and bounded cold parsing.
- [x] 2.2 Run existing history tests and measure cold/hot page and usage against the supplied real transcript without modifying it.
- [x] 2.3 Run Forge quality verification and strict OpenSpec validation; record actual executed checks and any remaining release limitations.
- [x] 2.4 Update the existing bug record and personal work log with implementation and validation evidence.

## Evidence

## Response-item recovery verification (2026-09-06)

- [x] Decode response-item text through the streaming reader, exclude startup context and analysis, and deduplicate paired legacy events.
- [x] Run history-reader and capsule-history tests: 15 passed.
- [x] Verify the original garment page session in the test browser: three messages restored, optimization count one, complete draft visible in the consumer AI feedback detail (six total records).

The local Forge runtime loaded the repair. Existing analysis archived the draft without manual SQL insertion. Consumer title/expected-effect projection of requirement-json remains a separate display limitation; the complete original is stored. No consumer deployment is needed for this server-side reader repair.

## Earlier index evidence

- Targeted regression: SessionHistoryServiceTest 9, CodexHistoryReaderTest 12, CodexHistoryPerformanceTest 1; all passed.
- Full module and reactor dependencies: `mvn -pl tools/tool-claude-chat -am test -q`, exit 0. The last two added boundary cases then passed in the targeted run.
- Real read-only rollout: 1,060,434,120 bytes / 39,646 records; final cold page 2,103.379 ms, hot page 7.896 ms, usage 2.964 ms; source size and mtime unchanged.
- Baseline comparison against HEAD parser: all 4,788 ChatMessageView values equal, latest page JSON equal, usage JSON equal. Isolated baseline parse 5,689.060 ms; this is distinct from the earlier live HTTP measurement of 28.102 seconds.
- Forge all: exit 0, JSON PASSED; executedCheckers empty, so no static checker claimed. API-RUNTIME-001 verified the existing `/api/tools` endpoint only.
- Existing bug document and its module index updated, work log merged into 2026-09-05.
- Deployment limitation: current running backend was not restarted. In-memory code takes effect when that backend reloads the compiled workspace. No raw conversation data was modified and no persistent index migration is needed.
