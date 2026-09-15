import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionPendingSql } from '../types'
import { SessionDatabaseWorkspace } from './SessionDatabaseWorkspace'

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
  it('按登记时间、执行库和 SQL 标题展示简洁清单', () => {
    render(<SessionDatabaseWorkspace registration={registration} onManage={vi.fn()} />)

    expect(screen.getByText(/登记于/)).toBeInTheDocument()
    expect(screen.getByText('执行库')).toBeInTheDocument()
    expect(screen.getAllByText('SRM 测试库').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SCM 测试库').length).toBeGreaterThan(0)
    expect(screen.getByText('修改表 · quote')).toBeInTheDocument()
    expect(screen.getByText('更新数据 · supplier')).toBeInTheDocument()
    expect(screen.getByText('2 条')).toBeInTheDocument()
  })

  it('通过管理登记按钮进入原编辑面板', () => {
    const manage = vi.fn()
    render(<SessionDatabaseWorkspace registration={registration} onManage={manage} />)
    fireEvent.click(screen.getByRole('button', { name: '管理' }))
    expect(manage).toHaveBeenCalledTimes(1)
  })

  it('点击条目后才展示 SQL 正文', () => {
    render(<SessionDatabaseWorkspace registration={registration} onManage={vi.fn()} />)

    const sql = screen.getByText('ALTER TABLE quote ADD COLUMN expires_at DATETIME;')
    expect(sql).not.toBeVisible()
    fireEvent.click(screen.getByText('修改表 · quote'))
    expect(sql).toBeVisible()
  })
})
