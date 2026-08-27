import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionPendingSql } from '../types'
import { SessionDatabaseWorkspace } from './SessionDatabaseWorkspace'

vi.mock('./PendingSqlReviewWorkspace', () => ({
  PendingSqlReviewWorkspace: ({ sqlText, allowEditing }: { sqlText: string; allowEditing?: boolean }) => (
    <div data-testid="sql-review" data-editable={String(allowEditing)}>{sqlText}</div>
  ),
}))

afterEach(cleanup)

const registration: SessionPendingSql = {
  sessionId: 'session-1',
  title: '报价有效期调整',
  targetEnvironment: '2 个目标库',
  changeType: 'MIXED',
  sqlText: '',
  status: 'PENDING',
  createdAt: 1,
  updatedAt: 2,
  executedAt: null,
  ddlEvidenceStatus: 'VERIFIED',
  ddlProject: 'SRM',
  ddlBaselinePath: 'ddl.sql',
  ddlEvidenceId: 'evidence-1',
  ddlVerifiedTables: ['quote'],
  ddlMissingTables: [],
  ddlCheckedAt: 2,
  targets: [
    { targetId: '1', targetKey: 'srm', datasourceId: 'srm', targetEnvironment: 'SRM 测试库', changeType: 'DDL', sqlText: 'ALTER TABLE quote ADD COLUMN expires_at DATETIME;', status: 'PENDING', sortOrder: 0, createdAt: 1, updatedAt: 2, executedAt: null },
    { targetId: '2', targetKey: 'scm', datasourceId: 'scm', targetEnvironment: 'SCM 测试库', changeType: 'DML', sqlText: 'UPDATE supplier SET enabled = 1;', status: 'PENDING', sortOrder: 1, createdAt: 1, updatedAt: 2, executedAt: null },
  ],
}

describe('SessionDatabaseWorkspace', () => {
  it('按目标库切换只读 SQL 正文', async () => {
    render(<SessionDatabaseWorkspace registration={registration} onManage={vi.fn()} />)

    expect(await screen.findByTestId('sql-review')).toHaveTextContent('ALTER TABLE quote')
    expect(screen.getByTestId('sql-review')).toHaveAttribute('data-editable', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'SCM 测试库' }))
    expect(screen.getByTestId('sql-review')).toHaveTextContent('UPDATE supplier')
  })

  it('通过管理登记按钮进入原编辑面板', () => {
    const manage = vi.fn()
    render(<SessionDatabaseWorkspace registration={registration} onManage={manage} />)
    fireEvent.click(screen.getByRole('button', { name: '管理登记' }))
    expect(manage).toHaveBeenCalledTimes(1)
  })
})
