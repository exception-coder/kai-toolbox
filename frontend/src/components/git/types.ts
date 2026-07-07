// 通用 git 提交/diff 类型，供 projects、claude-chat 等多 feature 复用。

export interface CommitInfo {
  hash: string
  shortHash: string
  author: string
  /** ISO-8601 提交时间 */
  date: string
  subject: string
}

export interface CommitsResponse {
  commits: CommitInfo[]
}

/** 工作目录下的一个 git 仓库：name 空串=目录自身即仓库，否则为子目录名（查询提交时回传）。 */
export interface GitRepoRef {
  name: string
  label: string
  isRoot: boolean
}

export interface CommitDiff {
  hash: string
  shortHash: string
  author: string
  date: string
  subject: string
  /** git show --stat --patch 原文 */
  diff: string
  /** 超上限被截断 */
  truncated: boolean
}
