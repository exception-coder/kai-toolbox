import { useEffect } from 'react'
import { AppearanceComfortControls } from './AppearanceComfortControls'
import { AppearanceMaterialPicker } from './AppearanceMaterialPicker'
import { AppearanceAccentPicker, AppearanceModePicker } from './AppearanceSelectors'
import { restoreCommittedTheme } from './theme'
import { useThemeState } from './useThemeState'

export function ThemeAppearanceSection() {
  const state = useThemeState()

  useEffect(() => restoreCommittedTheme, [])

  return (
    <div className="space-y-6">
      <AppearanceModePicker mode={state.mode} />
      <AppearanceMaterialPicker material={state.material} />
      <AppearanceAccentPicker accent={state.accent} />
      <AppearanceComfortControls state={state} />
    </div>
  )
}
