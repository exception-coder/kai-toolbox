export interface ExperienceExample {
  id: string; kind: string; text: string; explanation: string
  fact?: { field: string; value: string; evidence: string; section: string }
  expected?: string; expectedValue?: string
}
export interface ExperienceRule {
  id: string; name: string; description: string; source: string; coverage: string; implementation: string; examples: ExperienceExample[]
}
export interface ExperienceCatalog { version: string; rules: ExperienceRule[] }
export interface ExampleRun {
  id: string; createdAt: string; catalogVersion: string; ruleVersion: string; schemaVersion: number; passed: number; total: number
  outcomes: { ruleId: string; exampleId: string; passed: boolean; actual: string; actualValue: string; example: ExperienceExample;
    review: { rejected: { reason: string }[] } }[]
}
