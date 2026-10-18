import { createRef } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ConfirmProvider, useConfirm } from './confirm-dialog'

afterEach(cleanup)

it('returns focus to an explicit originating action after cancelling a confirmation', async () => {
  const target = createRef<HTMLButtonElement>()
  function Origin() {
    const confirm = useConfirm()
    return <button ref={target} onClick={() => void confirm({ title: '刷新使用新版', returnFocusRef: target })}>刷新入口</button>
  }
  render(<ConfirmProvider><Origin /></ConfirmProvider>)
  fireEvent.click(screen.getByRole('button', { name: '刷新入口' }))
  expect(await screen.findByRole('dialog')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '刷新入口' })).toHaveFocus())
})
