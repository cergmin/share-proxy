import { defineControlBarElement } from './control-bar-element';
import { definePopupElement } from './popup-element';
import { defineSettingsPopupElement } from './settings-popup-element';
import { defineTimelineElement } from './timeline-element';

export function defineVideoPlayerCustomElements(): void {
    definePopupElement();
    defineSettingsPopupElement();
    defineTimelineElement();
    defineControlBarElement();
}
