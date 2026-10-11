import { expect, it } from 'vitest'
import { currentFollowUpPrediction } from './followUpPrediction'

it('rejects another session, native thread, source turn or running engine despite a cached preview', () => {
  const prediction = { sessionId: 'forge-a', sdkSessionId: 'native-a', sourceTurnId: 'turn-a', text: '检查下一步' }
  const context = { ...prediction, running: false, engine: 'codex' }
  expect(currentFollowUpPrediction(prediction, context)).toEqual(prediction)
  for (const changed of [{ sessionId: 'forge-b' }, { sdkSessionId: 'native-b' }, { sourceTurnId: 'turn-b' }, { running: true }, { engine: 'claude' }]) {
    expect(currentFollowUpPrediction(prediction, { ...context, ...changed })).toBeNull()
  }
})
