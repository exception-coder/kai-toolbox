// 索引脚本（scripts/build-java8gu-index.mjs）产出的静态 JSON 形状

export interface Java8guHeading {
  level: number
  text: string
}

export interface Java8guQuestion {
  id: string
  categoryId: string
  title: string
  tldr: string
  chars: number
  words: number
  readMin: number
  headings: Java8guHeading[]
  codeCount: number
  codeLangs: string[]
  hasTable: boolean
  hasImage: boolean
  /** 1-5 桶难度 */
  difficulty: number
  /** 用于排序的连续分数 */
  difficultyScore: number
  /** 形如 01_Java基础/0054_xxx.md，仅用于追溯，前端不靠它取文件 */
  sourceFile: string
}

export interface Java8guCategory {
  id: string
  label: string
  count: number
  /** 五桶（1-5）题量分布 */
  difficultyDist: number[]
  /** 0-359 主题色 hue */
  hue: number
  keywordChips: string[]
}

export interface Java8guIndex {
  generatedAt: string
  totalQuestions: number
  categories: Java8guCategory[]
  questions: Java8guQuestion[]
}
