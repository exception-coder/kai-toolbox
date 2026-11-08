import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onWindowStageCreate(stage: window.WindowStage): void {
    // Keep the system's safe area and keyboard avoidance; no second custom viewport resizer.
    stage.loadContent('pages/Index');
  }
}
