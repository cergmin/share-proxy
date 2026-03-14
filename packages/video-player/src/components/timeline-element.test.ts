import { beforeAll, describe, expect, it } from 'vitest';
import { defineTimelineElement } from './timeline-element';

describe('SpvpTimelineElement', () => {
    beforeAll(() => {
        defineTimelineElement();
    });

    it('renders timeline structure and seek input', () => {
        const timeline = document.createElement('spvp-timeline') as HTMLElement & {
            refs: {
                progressInput: HTMLInputElement;
                currentTimeBadge: HTMLElement;
                preview: HTMLElement;
            };
        };
        document.body.appendChild(timeline);

        expect(timeline.refs.progressInput).toBeTruthy();
        expect(timeline.refs.progressInput.getAttribute('aria-label')).toBe('Seek');
        expect(timeline.refs.currentTimeBadge.textContent).toBe('0:00');
        expect(timeline.refs.preview.hidden).toBe(true);
    });
});
