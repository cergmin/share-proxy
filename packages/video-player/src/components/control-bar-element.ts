import { createIcon } from '../icons';
import { defineTimelineElement, SpvpTimelineElement } from './timeline-element';

export class SpvpControlBarElement extends HTMLElement {
    connectedCallback(): void {
        if (this.dataset.initialized === 'true') {
            return;
        }

        this.dataset.initialized = 'true';
        this.innerHTML = `
          <spvp-timeline></spvp-timeline>
          <div class="spvp-controls">
            <div class="spvp-left">
              <button class="spvp-button" type="button" data-kind="play" aria-label="Play">${createIcon('play')}</button>
              <button class="spvp-button" type="button" data-kind="backward" aria-label="Rewind 10 seconds">${createIcon('backward')}</button>
              <button class="spvp-button" type="button" data-kind="forward" aria-label="Forward 10 seconds">${createIcon('forward')}</button>
              <div class="spvp-volume">
                <button class="spvp-button" type="button" data-kind="mute" aria-label="Mute">${createIcon('volume-big')}</button>
                <input class="spvp-volume-range" type="range" min="0" max="100" value="100" aria-label="Volume" />
              </div>
              <button class="spvp-time-toggle" type="button" aria-label="Toggle time display mode">
                <span class="spvp-time-primary">0:00</span><span class="spvp-time-secondary"> / --:--</span>
              </button>
            </div>
            <div class="spvp-right">
              <button class="spvp-button" type="button" data-kind="settings" aria-label="Settings">${createIcon('settings')}</button>
              <button class="spvp-button" type="button" data-kind="pip" aria-label="Picture in picture">${createIcon('pip-enter')}</button>
              <button class="spvp-button" type="button" data-kind="fullscreen" aria-label="Fullscreen">${createIcon('fullscreen-enter')}</button>
            </div>
          </div>
        `;
    }

    get timeline(): SpvpTimelineElement {
        return this.querySelector<SpvpTimelineElement>('spvp-timeline')!;
    }

    get refs() {
        return {
            fullscreenButton: this.querySelector<HTMLButtonElement>('[data-kind="fullscreen"]')!,
            forwardButton: this.querySelector<HTMLButtonElement>('[data-kind="forward"]')!,
            muteButton: this.querySelector<HTMLButtonElement>('[data-kind="mute"]')!,
            pipButton: this.querySelector<HTMLButtonElement>('[data-kind="pip"]')!,
            playButton: this.querySelector<HTMLButtonElement>('[data-kind="play"]')!,
            rewindButton: this.querySelector<HTMLButtonElement>('[data-kind="backward"]')!,
            settingsButton: this.querySelector<HTMLButtonElement>('[data-kind="settings"]')!,
            timePrimary: this.querySelector<HTMLElement>('.spvp-time-primary')!,
            timeSecondary: this.querySelector<HTMLElement>('.spvp-time-secondary')!,
            timeToggle: this.querySelector<HTMLButtonElement>('.spvp-time-toggle')!,
            volumeRange: this.querySelector<HTMLInputElement>('.spvp-volume-range')!,
            ...this.timeline.refs,
        };
    }
}

export function defineControlBarElement(): void {
    defineTimelineElement();
    if (!customElements.get('spvp-control-bar')) {
        customElements.define('spvp-control-bar', SpvpControlBarElement);
    }
}
