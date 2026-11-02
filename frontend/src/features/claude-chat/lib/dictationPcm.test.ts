import { expect, it } from 'vitest'
import { encodePcm16 } from './dictationPcm'

it('encodes signed 16 bit little endian PCM with clipping', () => {
  const view = new DataView(encodePcm16(new Float32Array([-2, -1, 0, 0.5, 1, 2])))
  expect(Array.from({ length: 6 }, (_, i) => view.getInt16(i * 2, true)))
    .toEqual([-32768, -32768, 0, 16384, 32767, 32767])
})
