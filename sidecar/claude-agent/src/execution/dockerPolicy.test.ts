import assert from 'node:assert/strict'
import test from 'node:test'
import { isDockerDependentCommand } from './dockerPolicy.js'
import { Permissions } from '../permissions.js'

test('supervised command classifier catches container startup but allows local database checks', () => {
  for (const command of [
    'docker compose up -d',
    'docker.exe ps',
    'Start-Process "Docker Desktop"',
    'wsl.exe --shutdown',
    'mvn test -Dtest=AccessTestcontainersTest',
  ]) assert.equal(isDockerDependentCommand(command), true, command)
  for (const command of ['mvn -Dtest=AccessSchemaH2Test test', 'git status --short', 'rg Docker docs']) {
    assert.equal(isDockerDependentCommand(command), false, command)
  }
})

test('automatic approval cannot override supervised Docker refusal', async () => {
  const permissions = new Permissions(() => {})
  permissions.setMode('bypassPermissions')
  permissions.setAvoidDocker(true)
  assert.equal((await permissions.canUseTool('Bash', { command: 'docker compose up' }, {})).behavior, 'deny')
  assert.equal((await permissions.canUseTool('Bash', { command: 'mvn -Dtest=AccessSchemaH2Test test' }, {})).behavior, 'allow')
  permissions.setAvoidDocker(false)
  assert.equal((await permissions.canUseTool('Bash', { command: 'docker ps' }, {})).behavior, 'allow')
})
