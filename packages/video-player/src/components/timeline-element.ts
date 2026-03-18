export class SpvpTimelineElement extends HTMLElement {
    connectedCallback(): void {
        if (this.dataset.initialized === 'true') {
            return;
        }

        this.dataset.initialized = 'true';
        this.innerHTML = `
          <div class="spvp-progress-section">
            <div class="spvp-progress-shell">
              <div class="spvp-current-time" data-hidden="false" data-overlap="false">0:00</div>
              <div class="spvp-preview" data-visible="false">
                <div class="spvp-preview-frame" data-has-image="false">
                  <div class="spvp-preview-glow" aria-hidden="true"></div>
                  <div class="spvp-preview-image" aria-hidden="true"></div>
                </div>
                <div class="spvp-preview-time">--:--</div>
              </div>
              <div class="spvp-progress-track" aria-hidden="true">
                <div class="spvp-progress-buffer"></div>
                <div class="spvp-progress-hover" data-visible="false"></div>
                <div class="spvp-progress-played"></div>
              </div>
              <input class="spvp-progress" type="range" min="0" max="1000" value="0" aria-label="Seek" tabindex="-1" />
              <div class="spvp-progress-handle" aria-hidden="true"></div>
            </div>
          </div>
        `;
    }

    get refs() {
        return {
            currentTimeBadge: this.querySelector<HTMLElement>('.spvp-current-time')!,
            preview: this.querySelector<HTMLElement>('.spvp-preview')!,
            previewFrame: this.querySelector<HTMLElement>('.spvp-preview-frame')!,
            previewGlow: this.querySelector<HTMLElement>('.spvp-preview-glow')!,
            previewImage: this.querySelector<HTMLElement>('.spvp-preview-image')!,
            previewTime: this.querySelector<HTMLElement>('.spvp-preview-time')!,
            progressBuffer: this.querySelector<HTMLElement>('.spvp-progress-buffer')!,
            progressHandle: this.querySelector<HTMLElement>('.spvp-progress-handle')!,
            progressHover: this.querySelector<HTMLElement>('.spvp-progress-hover')!,
            progressInput: this.querySelector<HTMLInputElement>('.spvp-progress')!,
            progressPlayed: this.querySelector<HTMLElement>('.spvp-progress-played')!,
            progressShell: this.querySelector<HTMLElement>('.spvp-progress-shell')!,
        };
    }
}

export function defineTimelineElement(): void {
    if (!customElements.get('spvp-timeline')) {
        customElements.define('spvp-timeline', SpvpTimelineElement);
    }
}
