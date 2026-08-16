import type { QaPair } from '../../api'
import type { DevDocEstimation } from '../../types'
import { DevDocClarifyHistorySheet } from '../dialogs/ClarificationHistorySheets'
import {
  DevDocHistorySheet,
  DevDocVersionViewDialog,
  ProgressHistorySheet,
  ProgressVersionViewDialog,
} from '../dialogs/ArtifactHistoryDialogs'
import { EstimateEffortDialog, EstimationDetailSheet, EvaluateProgressDialog } from '../dialogs/EstimationDialogs'
import { DevDocUpdateDialog } from '../dialogs/DevDocUpdateDialog'
import { StartDevDialog } from '../dialogs/StartDevDialog'
import type { ClarifyEngine } from '../dialogs/StartClarifyDialog'

type ArtifactVersion = { version: number; isCurrent: boolean }

interface EditingPanelDialogsProps {
  sessionId: string
  currentEngine: ClarifyEngine
  startDev: {
    open: boolean
    title: string
    projectName: string | null
    prdContent: string
    devDocContent: string
    onClose: () => void
  }
  generation: {
    mode: 'generate' | 'regenerate' | 'update' | null
    onClose: () => void
    onGenerate: (instructions: string, updateExisting: boolean, history: QaPair[], engine: ClarifyEngine) => void
  }
  history: {
    open: boolean
    clarificationOpen: boolean
    version: ArtifactVersion | null
    onClose: () => void
    onCloseClarification: () => void
    onViewVersion: (version: number, isCurrent: boolean) => void
    onCloseVersion: () => void
  }
  estimation: {
    dialogOpen: boolean
    detailOpen: boolean
    value: DevDocEstimation | null
    loading: boolean
    error: string | null
    onConfirm: (context: string) => void
    onCloseDialog: () => void
    onCloseDetail: () => void
  }
  progress: {
    dialogOpen: boolean
    historyOpen: boolean
    version: ArtifactVersion | null
    onGenerated: () => void
    onCloseDialog: () => void
    onCloseHistory: () => void
    onViewVersion: (version: number, isCurrent: boolean) => void
    onCloseVersion: () => void
  }
}

/** Owns the modal/sheet composition for the editing workspace. */
export function EditingPanelDialogs({
  sessionId,
  currentEngine,
  startDev,
  generation,
  history,
  estimation,
  progress,
}: EditingPanelDialogsProps) {
  const generationMode = generation.mode === 'update' ? 'update' : 'initial'

  return (
    <>
      {startDev.open && (
        <StartDevDialog
          title={startDev.title}
          sessionId={sessionId}
          projectName={startDev.projectName}
          content={startDev.prdContent}
          devDocContent={startDev.devDocContent}
          initialEngine={currentEngine}
          onClose={startDev.onClose}
        />
      )}

      {generation.mode && (
        <DevDocUpdateDialog
          sessionId={sessionId}
          mode={generationMode}
          initialEngine={currentEngine}
          onClose={generation.onClose}
          onConfirm={(instructions, qaHistory, engine) => {
            generation.onClose()
            generation.onGenerate(instructions, generation.mode === 'update', qaHistory, engine)
          }}
        />
      )}

      {history.open && (
        <DevDocHistorySheet sessionId={sessionId} onViewVersion={history.onViewVersion} onClose={history.onClose} />
      )}
      {history.clarificationOpen && (
        <DevDocClarifyHistorySheet sessionId={sessionId} onClose={history.onCloseClarification} />
      )}
      {history.version && (
        <DevDocVersionViewDialog
          sessionId={sessionId}
          version={history.version.version}
          isLatest={history.version.isCurrent}
          onClose={history.onCloseVersion}
        />
      )}

      {estimation.dialogOpen && (
        <EstimateEffortDialog
          loading={estimation.loading}
          error={estimation.error}
          onConfirm={estimation.onConfirm}
          onClose={estimation.onCloseDialog}
        />
      )}
      {estimation.detailOpen && estimation.value && (
        <EstimationDetailSheet estimation={estimation.value} onClose={estimation.onCloseDetail} />
      )}

      {progress.dialogOpen && (
        <EvaluateProgressDialog sessionId={sessionId} onGenerated={progress.onGenerated} onClose={progress.onCloseDialog} />
      )}
      {progress.historyOpen && (
        <ProgressHistorySheet sessionId={sessionId} onViewVersion={progress.onViewVersion} onClose={progress.onCloseHistory} />
      )}
      {progress.version && (
        <ProgressVersionViewDialog
          sessionId={sessionId}
          version={progress.version.version}
          isLatest={progress.version.isCurrent}
          onClose={progress.onCloseVersion}
        />
      )}
    </>
  )
}
