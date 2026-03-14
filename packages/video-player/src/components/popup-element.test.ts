import { beforeAll, describe, expect, it } from 'vitest';
import { definePopupElement } from './popup-element';

describe('SpvpPopupElement', () => {
    beforeAll(() => {
        definePopupElement();
    });

    it('renders header and list containers on connect', () => {
        const popup = document.createElement('spvp-popup') as HTMLElement;
        document.body.appendChild(popup);

        expect(popup.classList.contains('spvp-menu')).toBe(true);
        expect(popup.querySelector('.spvp-menu-header')).toBeTruthy();
        expect(popup.querySelector('.spvp-menu-list')).toBeTruthy();
    });

    it('updates the header state through the public API', () => {
        const popup = document.createElement('spvp-popup') as HTMLElement & {
            setHeaderState: (title: string, showBack: boolean) => void;
            header: HTMLElement;
            backButton: HTMLButtonElement;
            headerTitle: HTMLElement;
        };
        document.body.appendChild(popup);

        popup.setHeaderState('Ambient', true);

        expect(popup.header.hidden).toBe(false);
        expect(popup.backButton.hidden).toBe(false);
        expect(popup.headerTitle.textContent).toBe('Ambient');
    });
});
