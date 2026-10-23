## ADDED Requirements

### Requirement: Sidecar follows its owning backend lifetime

The Java-owned Sidecar MUST monitor its private parent input pipe and terminate after its owner exits. Shutdown MUST release the listener before awaiting asynchronous cleanup, bound cleanup time, and prevent new starts during backend shutdown.

#### Scenario: Parent exits without a shutdown hook

- **WHEN** the owning backend exits and its input pipe closes
- **THEN** Sidecar begins shutdown once and exits even if exporter cleanup hangs

#### Scenario: Process does not acknowledge termination

- **WHEN** Java has requested shutdown but its child remains alive after bounded waits
- **THEN** Java retains the process handle and reports failure instead of claiming the child stopped

### Requirement: Recover verified orphans without making unknown listeners trusted

Startup MUST wait for normal release and MAY terminate an orphan only after verifying the actual listener, Node executable, exact absolute workspace entry and absent parent. It MUST recheck identity before termination. Unknown, changed, active-parent or ambiguous legacy processes MUST remain untouched.

#### Scenario: Verified workspace orphan occupies the port

- **WHEN** the grace period expires and the listener is confirmed as an orphan from this workspace
- **THEN** startup rechecks identity, requests termination and confirms port release before modifying dependencies or build outputs

#### Scenario: Legacy or unrelated listener occupies the port

- **WHEN** the listener cannot be safely attributed or has a live parent
- **THEN** startup preserves that process and its files and does not adopt it as a healthy Sidecar

### Requirement: Sidecar port conflicts do not abort host startup

An unresolved Sidecar port conflict MUST block AI startup with an explicit recovery reason while allowing the backend to start. This MUST NOT be reported as AI readiness or successful Sidecar build, and MUST NOT hide unrelated compilation failures.

#### Scenario: Port remains occupied after recovery attempts

- **WHEN** startup cannot release the Sidecar port
- **THEN** it skips Sidecar dependency changes and build promotion, supplies a startup diagnostic to Java and continues host startup
- **AND** AI operations fail through the existing unavailable-runtime path with the recovery explanation

#### Scenario: Listener appears during build

- **WHEN** Sidecar build fails while a new listener holds its port
- **THEN** host startup continues with an explicit AI block and no claim of successful build
