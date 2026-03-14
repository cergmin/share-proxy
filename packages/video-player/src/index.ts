export {
    getVideoPlayerMarkup,
    getVideoPlayerStyles,
    mountVideoPlayer,
    renderVideoPlayerDocument,
    type AmbientMode,
    type PreviewTrackEntry,
    type PreviewTracksPayload,
    type VideoPlayerHandle,
    type VideoPlayerOptions,
    type VideoPlayerQualityOption,
} from './player-controller';

export {
    SpvpPopupElement,
    definePopupElement,
} from './components/popup-element';
export {
    SpvpSettingsPopupElement,
    defineSettingsPopupElement,
} from './components/settings-popup-element';
export {
    SpvpTimelineElement,
    defineTimelineElement,
} from './components/timeline-element';
export {
    SpvpControlBarElement,
    defineControlBarElement,
} from './components/control-bar-element';
export { defineVideoPlayerCustomElements } from './components/register';
