import { beforeAll, describe, expect, it } from 'vitest';
import { defineControlBarElement } from './control-bar-element';

describe('SpvpControlBarElement', () => {
    beforeAll(() => {
        defineControlBarElement();
    });

    it('renders controls and exposes refs', () => {
        const bar = document.createElement('spvp-control-bar') as HTMLElement & {
            refs: {
                playButton: HTMLButtonElement;
                settingsButton: HTMLButtonElement;
                timeToggle: HTMLButtonElement;
                progressInput: HTMLInputElement;
            };
        };
        document.body.appendChild(bar);

        expect(bar.refs.playButton.getAttribute('aria-label')).toBe('Play');
        expect(bar.refs.settingsButton.getAttribute('aria-label')).toBe('Settings');
        expect(bar.refs.timeToggle.getAttribute('aria-label')).toBe('Toggle time display mode');
        expect(bar.refs.progressInput).toBeTruthy();
    });
});
