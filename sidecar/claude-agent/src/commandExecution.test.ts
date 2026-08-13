import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyCommandResult } from './commandExecution.js'

test('classifies PowerShell parser failures as shell syntax errors', () => {
  const result = classifyCommandResult('shell', 'mvn -Dtest=A,B test', 'ParserError: Missing argument in parameter list.', true)
  assert.equal(result?.outcome, 'shellSyntax')
  assert.equal(result?.severity, 'error')
})

test('classifies invalid Get-ChildItem pattern binding as argument escaping', () => {
  const result = classifyCommandResult(
    'Bash',
    'Get-ChildItem -Name mvnw*,pom.xml',
    "Cannot convert 'System.Object[]' to the type 'System.String' required by parameter 'Filter'.",
    true,
  )
  assert.equal(result?.outcome, 'argumentEscaping')
})

test('keeps Maven test failures as development feedback', () => {
  const result = classifyCommandResult('shell', 'mvn test', 'Tests run: 8, Failures: 1, Errors: 0\nBUILD FAILURE', true)
  assert.equal(result?.outcome, 'testFailure')
  assert.equal(result?.severity, 'warning')
})

test('treats empty rg exit as no matches instead of an execution error', () => {
  const result = classifyCommandResult('shell', 'rg "missing" src', '', true)
  assert.equal(result?.outcome, 'noMatches')
  assert.equal(result?.severity, 'info')
})

test('does not classify non-command tools', () => {
  assert.equal(classifyCommandResult('Read', undefined, 'failed', true), undefined)
})
