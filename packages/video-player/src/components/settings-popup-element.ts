import { SpvpPopupElement, definePopupElement } from './popup-element';

export class SpvpSettingsPopupElement extends SpvpPopupElement {
    connectedCallback(): void {
        super.connectedCallback();
        this.classList.add('spvp-settings-popup');
    }
}

export function defineSettingsPopupElement(): void {
    definePopupElement();
    if (!customElements.get('spvp-settings-popup')) {
        customElements.define('spvp-settings-popup', SpvpSettingsPopupElement);
    }
}
