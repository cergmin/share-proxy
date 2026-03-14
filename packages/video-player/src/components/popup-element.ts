import { createIcon } from '../icons';

export class SpvpPopupElement extends HTMLElement {
    connectedCallback(): void {
        if (this.dataset.initialized === 'true') {
            return;
        }

        this.dataset.initialized = 'true';
        this.classList.add('spvp-menu');
        this.hidden = true;
        this.innerHTML = `
          <div class="spvp-menu-header" hidden>
            <button class="spvp-menu-back" type="button" aria-label="Back" hidden>
              <span class="spvp-menu-back-icon" aria-hidden="true">${createIcon('menu-back')}</span>
              <span class="spvp-menu-header-title"></span>
            </button>
          </div>
          <div class="spvp-menu-scroll">
            <div class="spvp-menu-list"></div>
          </div>
        `;
    }

    get header(): HTMLElement {
        return this.querySelector<HTMLElement>('.spvp-menu-header')!;
    }

    get backButton(): HTMLButtonElement {
        return this.querySelector<HTMLButtonElement>('.spvp-menu-back')!;
    }

    get headerTitle(): HTMLElement {
        return this.querySelector<HTMLElement>('.spvp-menu-header-title')!;
    }

    get scrollContainer(): HTMLElement {
        return this.querySelector<HTMLElement>('.spvp-menu-scroll')!;
    }

    get list(): HTMLElement {
        return this.querySelector<HTMLElement>('.spvp-menu-list')!;
    }

    setHeaderState(title: string, showBack: boolean): void {
        this.header.hidden = !showBack;
        this.backButton.hidden = !showBack;
        this.headerTitle.textContent = title;
    }
}

export function definePopupElement(): void {
    if (!customElements.get('spvp-popup')) {
        customElements.define('spvp-popup', SpvpPopupElement);
    }
}
