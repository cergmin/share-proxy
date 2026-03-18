import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Video } from './Video';

const originalPlay = HTMLMediaElement.prototype.play;
const originalPause = HTMLMediaElement.prototype.pause;
const PLAYER_SETTINGS_COOKIE_NAME = 'spvp_settings';
const PLAYER_PROGRESS_COOKIE_NAME = 'spvp_progress';

function clearKnownCookies() {
    document.cookie = `${PLAYER_SETTINGS_COOKIE_NAME}=; Max-Age=0; Path=/`;
    document.cookie = `${PLAYER_PROGRESS_COOKIE_NAME}=; Max-Age=0; Path=/`;
}

function parseCookieJson<T>(name: string): T | undefined {
    const prefix = `${name}=`;
    const rawCookie = document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(prefix));

    if (!rawCookie) {
        return undefined;
    }

    return JSON.parse(decodeURIComponent(rawCookie.slice(prefix.length))) as T;
}

describe('Video', () => {
    beforeEach(() => {
        clearKnownCookies();
        Object.defineProperty(globalThis, 'shaka', {
            configurable: true,
            value: {
                Player: {
                    isBrowserSupported: () => false,
                },
            },
        });

        HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
        HTMLMediaElement.prototype.pause = vi.fn();
    });

    afterEach(() => {
        clearKnownCookies();
        HTMLMediaElement.prototype.play = originalPlay;
        HTMLMediaElement.prototype.pause = originalPause;
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        // @ts-expect-error test-only cleanup
        delete globalThis.shaka;
    });

    it('toggles playback when clicking play', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);

        const playButton = await screen.findByRole('button', { name: 'Play' });
        const video = container.querySelector('video') as HTMLVideoElement;

        Object.defineProperty(video, 'paused', {
            configurable: true,
            get: () => true,
        });

        fireEvent.click(playButton);

        expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    it('toggles playback when clicking the video surface', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);

        const video = container.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'paused', {
            configurable: true,
            get: () => true,
        });

        fireEvent.click(video);

        expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    it('rewinds and forwards via control buttons', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);

        const video = container.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'duration', {
            configurable: true,
            value: 120,
        });
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            writable: true,
            value: 50,
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Rewind 10 seconds' }));
        expect(video.currentTime).toBe(40);

        fireEvent.click(await screen.findByRole('button', { name: 'Forward 10 seconds' }));
        expect(video.currentTime).toBe(50);
    });

    it('shows time next to volume and toggles between elapsed and remaining modes', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);

        const video = container.querySelector('video') as HTMLVideoElement;
        const timeToggle = await screen.findByRole('button', { name: 'Toggle time display mode' });

        Object.defineProperty(video, 'duration', {
            configurable: true,
            value: 767,
        });
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            writable: true,
            value: 32,
        });

        fireEvent(video, new Event('durationchange'));
        fireEvent(video, new Event('timeupdate'));

        expect(container.querySelector('.spvp-remaining')).toBeNull();
        expect(timeToggle.textContent?.trim()).toBe('0:32 / 12:47');

        fireEvent.click(timeToggle);

        await waitFor(() => {
            expect(timeToggle.textContent?.trim()).toBe('-12:15 / 12:47');
        });
    });

    it('debounces rapid scrubbing on the timeline', () => {
        vi.useFakeTimers();

        try {
            const { container, unmount } = render(<Video title="Demo" streamUrl="/stream.mp4" />);

            const video = container.querySelector('video') as HTMLVideoElement;
            const seek = container.querySelector('.spvp-progress') as HTMLInputElement;
            let currentTimeValue = 0;
            const assignedTimes: number[] = [];

            Object.defineProperty(video, 'duration', {
                configurable: true,
                value: 100,
            });
            Object.defineProperty(video, 'currentTime', {
                configurable: true,
                get: () => currentTimeValue,
                set: (value: number) => {
                    currentTimeValue = value;
                    assignedTimes.push(value);
                },
            });

            fireEvent.input(seek, { target: { value: '100' } });
            fireEvent.input(seek, { target: { value: '200' } });
            fireEvent.input(seek, { target: { value: '300' } });

            expect(assignedTimes).toHaveLength(0);

            vi.advanceTimersByTime(19);
            expect(assignedTimes).toHaveLength(0);

            vi.advanceTimersByTime(1);
            expect(assignedTimes).toEqual([30]);

            vi.runAllTimers();
            unmount();
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps the progress handle centered under the cursor while scrubbing', () => {
        vi.useFakeTimers();

        try {
            const { container, unmount } = render(<Video title="Demo" streamUrl="/stream.mp4" />);

            const video = container.querySelector('video') as HTMLVideoElement;
            const seek = container.querySelector('.spvp-progress') as HTMLInputElement;
            const handle = container.querySelector('.spvp-progress-handle') as HTMLDivElement;
            const played = container.querySelector('.spvp-progress-played') as HTMLDivElement;
            const shell = container.querySelector('.spvp-progress-shell') as HTMLDivElement;
            let currentTimeValue = 0;

            Object.defineProperty(video, 'duration', {
                configurable: true,
                value: 100,
            });
            Object.defineProperty(video, 'currentTime', {
                configurable: true,
                get: () => currentTimeValue,
                set: (value: number) => {
                    currentTimeValue = value;
                },
            });
            Object.defineProperty(seek, 'getBoundingClientRect', {
                configurable: true,
                value: () => ({
                    width: 1000,
                    height: 22,
                    top: 0,
                    right: 1000,
                    bottom: 22,
                    left: 0,
                    x: 0,
                    y: 0,
                    toJSON: () => undefined,
                }),
            });
            Object.defineProperty(shell, 'getBoundingClientRect', {
                configurable: true,
                value: () => ({
                    width: 1000,
                    height: 22,
                    top: 0,
                    right: 1000,
                    bottom: 22,
                    left: 0,
                    x: 0,
                    y: 0,
                    toJSON: () => undefined,
                }),
            });

            fireEvent.pointerDown(seek, { clientX: 750 });
            fireEvent.input(seek, { target: { value: '300' } });

            expect(handle.style.left).toBe('75%');
            expect(played.style.width).toBe('75%');

            fireEvent.pointerUp(seek);
            vi.advanceTimersByTime(20);

            expect(currentTimeValue).toBe(75);

            unmount();
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps the timeline out of keyboard focus order', () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);

        expect((container.querySelector('.spvp-progress') as HTMLInputElement).tabIndex).toBe(-1);
    });

    it('changes playback rate from settings menu', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);

        const video = container.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'playbackRate', {
            configurable: true,
            writable: true,
            value: 1,
        });
        Object.defineProperty(video, 'defaultPlaybackRate', {
            configurable: true,
            writable: true,
            value: 1,
        });
        const menu = container.querySelector('.spvp-menu') as HTMLDivElement;

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Open playback speed settings' }));

        await waitFor(() => {
            expect(menu.hidden).toBe(false);
            expect(screen.getByText('2x')).toBeTruthy();
            expect(screen.getByText('4x')).toBeTruthy();
        });

        fireEvent.click(menu.querySelector('[data-rate="2"]') as HTMLButtonElement);

        await waitFor(() => {
            expect(video.playbackRate).toBe(2);
            expect(video.defaultPlaybackRate).toBe(2);
        });
    });

    it('shows the section title in the settings header and lets the whole header go back', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Open ambient settings' }));

        await waitFor(() => {
            expect(container.querySelector('.spvp-menu-header-title')?.textContent).toBe('Ambient');
        });

        fireEvent.click(container.querySelector('.spvp-menu-header-title') as HTMLElement);

        await waitFor(() => {
            expect(container.querySelector('.spvp-menu-header')?.hasAttribute('hidden')).toBe(true);
            expect(screen.getByRole('button', { name: 'Open ambient settings' })).toBeTruthy();
        });
    });

    it('restores root menu height after closing a nested settings screen', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);
        const menu = container.querySelector('.spvp-menu') as HTMLDivElement;
        const menuHeader = container.querySelector('.spvp-menu-header') as HTMLDivElement;
        const menuScroll = container.querySelector('.spvp-menu-scroll') as HTMLDivElement;
        const menuList = container.querySelector('.spvp-menu-list') as HTMLDivElement;

        Object.defineProperty(menuHeader, 'offsetHeight', {
            configurable: true,
            get: () => (menuHeader.hidden ? 0 : 40),
        });
        Object.defineProperty(menuList, 'offsetHeight', {
            configurable: true,
            get: () => menuList.querySelectorAll('.spvp-menu-button').length * 48,
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));

        let rootHeight = '';
        await waitFor(() => {
            rootHeight = menu.style.height;
            expect(rootHeight).not.toBe('');
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Open playback speed settings' }));

        await waitFor(() => {
            expect(Number.parseFloat(menu.style.height)).toBeGreaterThan(Number.parseFloat(rootHeight));
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));

        await waitFor(() => {
            expect(menu.hidden).toBe(true);
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));

        await waitFor(() => {
            expect(menu.style.height).toBe(rootHeight);
        });
    });

    it('reopens the root settings menu while a nested menu is still closing after selecting playback speed', async () => {
        vi.useFakeTimers();
        const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

        try {
            const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);
            const menu = container.querySelector('.spvp-menu') as HTMLDivElement;
            const menuHeader = container.querySelector('.spvp-menu-header') as HTMLDivElement;
            const menuList = container.querySelector('.spvp-menu-list') as HTMLDivElement;

            Object.defineProperty(menuHeader, 'offsetHeight', {
                configurable: true,
                get: () => (menuHeader.hidden ? 0 : 56),
            });
            Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
                configurable: true,
                get() {
                    if (this instanceof HTMLElement && this.classList.contains('spvp-menu-button')) {
                        return 64;
                    }
                    if (this instanceof HTMLElement && this.classList.contains('spvp-slider-card')) {
                        return 172;
                    }
                    return 0;
                },
            });

            fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
            await vi.advanceTimersByTimeAsync(16);

            const rootHeight = menu.style.height;
            expect(rootHeight).not.toBe('');

            fireEvent.click(screen.getByRole('button', { name: 'Open playback speed settings' }));
            await vi.advanceTimersByTimeAsync(16);

            expect(screen.getByRole('button', { name: 'Set speed to 3x' })).toBeTruthy();
            fireEvent.click(screen.getByRole('button', { name: 'Set speed to 3x' }));

            // The menu is in its close timeout window here. Reopening should still go to root.
            fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
            await vi.advanceTimersByTimeAsync(16);

            expect(screen.getByRole('button', { name: 'Open playback speed settings' })).toBeTruthy();
            expect(menu.style.height).toBe(rootHeight);
            expect(menuList.textContent).toContain('Playback speed');
            expect(menuList.textContent).toContain('Ambient');
            expect(menuList.textContent).not.toContain('0.5x');
        } finally {
            if (originalOffsetHeight) {
                Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
            } else {
                // @ts-expect-error test cleanup
                delete HTMLElement.prototype.offsetHeight;
            }
            vi.useRealTimers();
        }
    });

    it('shrinks the menu height back to root size after going back from playback speed', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);
        const menu = container.querySelector('.spvp-menu') as HTMLDivElement;
        const menuHeader = container.querySelector('.spvp-menu-header') as HTMLDivElement;
        const menuScroll = container.querySelector('.spvp-menu-scroll') as HTMLDivElement;
        const menuList = container.querySelector('.spvp-menu-list') as HTMLDivElement;

        Object.defineProperty(menu, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                width: 420,
                height: Number.parseFloat(menu.style.height || '0') || 0,
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                x: 0,
                y: 0,
                toJSON: () => undefined,
            }),
        });
        Object.defineProperty(menuHeader, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                width: 396,
                height: menuHeader.hidden ? 0 : 75,
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                x: 0,
                y: 0,
                toJSON: () => undefined,
            }),
        });
        Object.defineProperty(menuList, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                width: 396,
                height: menuList.querySelectorAll('.spvp-menu-button').length * 76 + Math.max(0, menuList.querySelectorAll('.spvp-menu-button').length - 1) * 8,
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                x: 0,
                y: 0,
                toJSON: () => undefined,
            }),
        });
        Object.defineProperty(menuList, 'scrollHeight', {
            configurable: true,
            get: () => {
                const count = menuList.querySelectorAll('.spvp-menu-button').length;
                return count * 76 + Math.max(0, count - 1) * 8;
            },
        });
        Object.defineProperty(menuScroll, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                width: 396,
                height: Number.parseFloat(menuScroll.style.maxHeight || menu.style.height || '0') || 352,
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                x: 0,
                y: 0,
                toJSON: () => undefined,
            }),
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));

        let rootHeight = '';
        await waitFor(() => {
            rootHeight = menu.style.height;
            expect(rootHeight).not.toBe('');
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Open playback speed settings' }));

        let speedHeight = '';
        await waitFor(() => {
            speedHeight = menu.style.height;
            expect(Number.parseFloat(speedHeight)).toBeGreaterThan(Number.parseFloat(rootHeight));
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Back' }));

        await waitFor(() => {
            expect(menu.style.height).toBe(rootHeight);
        });
    });

    it('restores root menu height after a fast playback speed -> back interaction', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);
        const menu = container.querySelector('.spvp-menu') as HTMLDivElement;
        const menuHeader = container.querySelector('.spvp-menu-header') as HTMLDivElement;
        const menuScroll = container.querySelector('.spvp-menu-scroll') as HTMLDivElement;
        const menuList = container.querySelector('.spvp-menu-list') as HTMLDivElement;

        Object.defineProperty(menu, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                width: 420,
                height: Number.parseFloat(menu.style.height || '0') || 0,
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                x: 0,
                y: 0,
                toJSON: () => undefined,
            }),
        });
        Object.defineProperty(menuHeader, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                width: 396,
                height: menuHeader.hidden ? 0 : 64,
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                x: 0,
                y: 0,
                toJSON: () => undefined,
            }),
        });
        Object.defineProperty(menuList, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                width: 396,
                height: menuList.querySelectorAll('.spvp-menu-button').length * 76 + Math.max(0, menuList.querySelectorAll('.spvp-menu-button').length - 1) * 8,
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                x: 0,
                y: 0,
                toJSON: () => undefined,
            }),
        });
        Object.defineProperty(menuList, 'scrollHeight', {
            configurable: true,
            get: () => menuList.querySelectorAll('.spvp-menu-button').length * 76 + Math.max(0, menuList.querySelectorAll('.spvp-menu-button').length - 1) * 8,
        });
        Object.defineProperty(menuScroll, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                width: 396,
                height: Number.parseFloat(menuScroll.style.maxHeight || menu.style.height || '0') || 352,
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                x: 0,
                y: 0,
                toJSON: () => undefined,
            }),
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
        let rootHeight = '';
        await waitFor(() => {
            rootHeight = menu.style.height;
            expect(rootHeight).not.toBe('');
        });
        fireEvent.click(await screen.findByRole('button', { name: 'Open playback speed settings' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Back' }));

        await waitFor(() => {
            expect(menu.style.height).toBe(rootHeight);
        });
    });

    it('enables menu scrolling when the settings popup is taller than the viewport', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);
        const menu = container.querySelector('.spvp-menu') as HTMLDivElement;
        const menuHeader = container.querySelector('.spvp-menu-header') as HTMLDivElement;
        const menuScroll = container.querySelector('.spvp-menu-scroll') as HTMLDivElement;
        const menuList = container.querySelector('.spvp-menu-list') as HTMLDivElement;
        const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

        vi.stubGlobal('innerHeight', 520);
        Object.defineProperty(window, 'visualViewport', {
            configurable: true,
            value: { height: 520 },
        });
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
            configurable: true,
            get() {
                if (this === menuHeader) {
                    return menuHeader.hidden ? 0 : 56;
                }
                if (this instanceof HTMLElement && this.classList.contains('spvp-menu-button')) {
                    return 64;
                }
                if (this === menuList) {
                    return menuList.querySelectorAll('.spvp-menu-button').length * 64;
                }
                if (this === menu) {
                    const headerHeight = menuHeader.hidden ? 0 : 56;
                    const listHeight = menuList.querySelectorAll('.spvp-menu-button').length * 64;
                    return headerHeight + listHeight + 16;
                }
                return 0;
            },
        });

        try {
            fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
            fireEvent.click(await screen.findByRole('button', { name: 'Open playback speed settings' }));

            const expectedMenuHeight = 412;
            const expectedListMaxHeight = `${expectedMenuHeight - 1 - 1 - 56}px`;
            await waitFor(() => {
                expect(menu.style.overflowY).toBe('hidden');
                expect(menuScroll.style.overflowY).toBe('auto');
                expect(menuScroll.style.maxHeight).toBe(expectedListMaxHeight);
                expect(menu.style.height).toBe(`${expectedMenuHeight}px`);
            });
        } finally {
            if (originalOffsetHeight) {
                Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
            } else {
                // @ts-expect-error test cleanup
                delete HTMLElement.prototype.offsetHeight;
            }
        }
    });

    it('switches quality through Shaka tracks without clearing the buffer', async () => {
        const loadMock = vi.fn().mockResolvedValue(undefined);
        const attachMock = vi.fn().mockResolvedValue(undefined);
        const configureMock = vi.fn();
        const selectVariantTrackMock = vi.fn();
        const variantTracks = [
            { active: true, bandwidth: 8_000_000, height: 1080, id: 101 },
            { active: false, bandwidth: 4_500_000, height: 720, id: 102 },
        ];

        class FakePlayer {
            static isBrowserSupported() {
                return true;
            }

            addEventListener = vi.fn();
            attach = attachMock;
            configure = configureMock;
            destroy = vi.fn();
            getVariantTracks = () => variantTracks;
            load = loadMock;
            removeEventListener = vi.fn();
            selectVariantTrack = selectVariantTrackMock;
        }

        Object.defineProperty(globalThis, 'shaka', {
            configurable: true,
            value: {
                Player: FakePlayer,
                polyfill: {
                    installAll: vi.fn(),
                },
            },
        });

        render(
            <Video
                title="Demo"
                manifestUrl="/master.m3u8"
                streamUrl="/stream.mp4"
            />,
        );

        await waitFor(() => {
            expect(loadMock).toHaveBeenCalledWith('/master.m3u8');
            expect(configureMock).toHaveBeenCalledWith(expect.objectContaining({
                abr: expect.objectContaining({
                    clearBufferSwitch: false,
                    enabled: true,
                    restrictToElementSize: true,
                    restrictToScreenSize: true,
                }),
                streaming: expect.objectContaining({
                    bufferBehind: 60,
                    bufferingGoal: 60,
                    rebufferingGoal: 3,
                }),
            }));
        });

        const menu = document.querySelector('.spvp-menu') as HTMLDivElement;

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));

        await waitFor(() => {
            expect(screen.getByText('Auto (1080p · 8 Mbps)')).toBeTruthy();
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Open quality settings' }));

        await waitFor(() => {
            expect(menu.hidden).toBe(false);
            expect(screen.getByText('1080p')).toBeTruthy();
            expect(screen.getByText('8 Mbps')).toBeTruthy();
        });

        fireEvent.click(menu.querySelector('[data-quality-id="102"]') as HTMLButtonElement);

        await waitFor(() => {
            expect(configureMock).toHaveBeenCalledWith({ abr: { enabled: false } });
            expect(selectVariantTrackMock).toHaveBeenCalledWith(
                expect.objectContaining({ id: 102 }),
                false,
            );
        });
    });

    it('persists manual quality selection and restores it on the next mount', async () => {
        const loadMock = vi.fn().mockResolvedValue(undefined);
        const attachMock = vi.fn().mockResolvedValue(undefined);
        const configureMock = vi.fn();
        const selectVariantTrackMock = vi.fn();
        const variantTracks = [
            { active: true, bandwidth: 8_000_000, height: 1080, id: 101 },
            { active: false, bandwidth: 4_500_000, height: 720, id: 102 },
        ];

        class FakePlayer {
            static isBrowserSupported() {
                return true;
            }

            addEventListener = vi.fn();
            attach = attachMock;
            configure = configureMock;
            destroy = vi.fn();
            getVariantTracks = () => variantTracks;
            load = loadMock;
            removeEventListener = vi.fn();
            selectVariantTrack = selectVariantTrackMock;
        }

        Object.defineProperty(globalThis, 'shaka', {
            configurable: true,
            value: {
                Player: FakePlayer,
                polyfill: {
                    installAll: vi.fn(),
                },
            },
        });

        const first = render(
            <Video
                title="Demo"
                manifestUrl="/master.m3u8"
                persistenceKey="link-quality"
                streamUrl="/stream.mp4"
            />,
        );

        await waitFor(() => {
            expect(loadMock).toHaveBeenCalledWith('/master.m3u8');
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Open quality settings' }));
        fireEvent.click(first.container.querySelector('[data-quality-id="102"]') as HTMLButtonElement);

        await waitFor(() => {
            const cookie = parseCookieJson<Array<{ k: string; qualityMode: 'auto' | number }>>(PLAYER_SETTINGS_COOKIE_NAME);
            expect(cookie?.[0]?.k).toBe('link-quality');
            expect(cookie?.[0]?.qualityMode).toBe(102);
        });

        first.unmount();
        configureMock.mockClear();
        selectVariantTrackMock.mockClear();
        loadMock.mockClear();

        render(
            <Video
                title="Demo"
                manifestUrl="/master.m3u8"
                persistenceKey="link-quality"
                streamUrl="/stream.mp4"
            />,
        );

        await waitFor(() => {
            expect(loadMock).toHaveBeenCalledWith('/master.m3u8');
            expect(configureMock).toHaveBeenCalledWith({ abr: { enabled: false } });
            expect(selectVariantTrackMock).toHaveBeenCalledWith(
                expect.objectContaining({ id: 102 }),
                false,
            );
        });
    });

    it('shows actual playback quality in debug overlay instead of selected quality', async () => {
        const loadMock = vi.fn().mockResolvedValue(undefined);
        const attachMock = vi.fn().mockResolvedValue(undefined);
        const configureMock = vi.fn();
        const listeners = new Map<string, Array<(event: Event) => void>>();
        const variantTracks = [
            { active: true, bandwidth: 8_000_000, height: 1080, id: 101, width: 1920 },
            { active: false, bandwidth: 420_000, height: 234, id: 102, width: 416 },
        ];

        class FakePlayer {
            static isBrowserSupported() {
                return true;
            }

            addEventListener = vi.fn((eventName: string, listener: EventListenerOrEventListenerObject) => {
                const callback = typeof listener === 'function'
                    ? listener
                    : listener.handleEvent.bind(listener);
                listeners.set(eventName, [...(listeners.get(eventName) ?? []), callback]);
            });
            attach = attachMock;
            configure = configureMock;
            destroy = vi.fn();
            getStats = vi.fn(() => ({
                height: 234,
                streamBandwidth: 420_000,
                width: 416,
            }));
            getVariantTracks = () => variantTracks;
            load = loadMock;
            removeEventListener = vi.fn();
            selectVariantTrack = vi.fn((track) => {
                for (const variantTrack of variantTracks) {
                    variantTrack.active = variantTrack.id === track.id;
                }
            });
        }

        Object.defineProperty(globalThis, 'shaka', {
            configurable: true,
            value: {
                Player: FakePlayer,
                polyfill: {
                    installAll: vi.fn(),
                },
            },
        });

        const { container } = render(
            <Video
                title="Demo"
                manifestUrl="/master.m3u8"
                persistenceKey="link-debug"
                streamUrl="/stream.mp4"
            />,
        );

        const video = container.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            writable: true,
            value: 30,
        });
        Object.defineProperty(video, 'buffered', {
            configurable: true,
            get: () => ({
                end: () => 90,
                length: 1,
                start: () => 0,
            }),
        });

        await waitFor(() => {
            expect(loadMock).toHaveBeenCalledWith('/master.m3u8');
        });

        const emit = (eventName: string, payload: Record<string, unknown>) => {
            for (const listener of listeners.get(eventName) ?? []) {
                listener(payload as Event);
            }
        };

        emit('mediaqualitychanged', {
            mediaQuality: {
                bandwidth: 8_000_000,
                contentType: 'video',
                height: 1080,
                width: 1920,
            },
            position: 0,
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Toggle debug overlay' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Open quality settings' }));
        fireEvent.click(container.querySelector('[data-quality-id="102"]') as HTMLButtonElement);

        emit('mediaqualitychanged', {
            mediaQuality: {
                bandwidth: 420_000,
                contentType: 'video',
                height: 234,
                width: 416,
            },
            position: 30,
        });

        await waitFor(() => {
            expect((container.querySelector('[data-debug-size]') as HTMLElement).textContent).toBe('1080p');
            expect((container.querySelector('[data-debug-bitrate]') as HTMLElement).textContent).toBe('8 Mbps');
        });

        video.currentTime = 95;
        fireEvent.timeUpdate(video);

        await waitFor(() => {
            expect((container.querySelector('[data-debug-size]') as HTMLElement).textContent).toBe('234p');
            expect((container.querySelector('[data-debug-bitrate]') as HTMLElement).textContent).toBe('420 kbps');
        });
    });

    it('does not create a second Shaka player for ambient sampling on manifests', async () => {
        const loadMock = vi.fn().mockResolvedValue(undefined);
        const attachMock = vi.fn().mockResolvedValue(undefined);
        let playerCount = 0;
        const frameCallbacks: Array<(now: number, metadata: { presentedFrames?: number }) => void> = [];
        const drawImageMock = vi.fn();
        const originalRequestVideoFrameCallback = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
        const originalCancelVideoFrameCallback = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'cancelVideoFrameCallback');
        const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');

        class FakePlayer {
            constructor() {
                playerCount += 1;
            }

            static isBrowserSupported() {
                return true;
            }

            addEventListener = vi.fn();
            attach = attachMock;
            configure = vi.fn();
            destroy = vi.fn();
            getVariantTracks = () => [];
            load = loadMock;
            removeEventListener = vi.fn();
            selectVariantTrack = vi.fn();
        }

        Object.defineProperty(globalThis, 'shaka', {
            configurable: true,
            value: {
                Player: FakePlayer,
                polyfill: {
                    installAll: vi.fn(),
                },
            },
        });

        Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
            configurable: true,
            value(callback: (now: number, metadata: { presentedFrames?: number }) => void) {
                frameCallbacks.push(callback);
                return frameCallbacks.length;
            },
        });
        Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
            configurable: true,
            value: vi.fn(),
        });
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: vi.fn(() => ({
                clearRect: vi.fn(),
                drawImage: drawImageMock,
                restore: vi.fn(),
                save: vi.fn(),
                scale: vi.fn(),
            })),
        });

        try {
            const { container, unmount } = render(
                <Video
                    title="Ambient Demo"
                    ambient="bright"
                    manifestUrl="/master.m3u8"
                    streamUrl="/stream.mp4"
                />,
            );

            const video = container.querySelector('video') as HTMLVideoElement;
            Object.defineProperty(video, 'readyState', {
                configurable: true,
                get: () => 4,
            });
            Object.defineProperty(video, 'videoWidth', {
                configurable: true,
                get: () => 1920,
            });
            Object.defineProperty(video, 'videoHeight', {
                configurable: true,
                get: () => 1080,
            });
            Object.defineProperty(video, 'currentTime', {
                configurable: true,
                writable: true,
                value: 10,
            });
            Object.defineProperty(video, 'duration', {
                configurable: true,
                value: 120,
            });
            Object.defineProperty(video, 'paused', {
                configurable: true,
                get: () => false,
            });
            Object.defineProperty(video, 'buffered', {
                configurable: true,
                get: () => ({
                    end: () => 40,
                    length: 1,
                    start: () => 0,
                }),
            });

            await waitFor(() => {
                expect(loadMock).toHaveBeenCalledWith('/master.m3u8');
                expect(frameCallbacks.length).toBeGreaterThan(0);
            });

            frameCallbacks[0]?.(1000, { presentedFrames: 1 });

            await waitFor(() => {
                expect(drawImageMock).toHaveBeenCalled();
                expect(container.querySelector('.spvp-ambient-layer')).not.toBeNull();
            });

            expect(playerCount).toBe(1);

            unmount();
        } finally {
            if (originalRequestVideoFrameCallback) {
                Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', originalRequestVideoFrameCallback);
            } else {
                // @ts-expect-error test cleanup
                delete HTMLVideoElement.prototype.requestVideoFrameCallback;
            }

            if (originalCancelVideoFrameCallback) {
                Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', originalCancelVideoFrameCallback);
            } else {
                // @ts-expect-error test cleanup
                delete HTMLVideoElement.prototype.cancelVideoFrameCallback;
            }

            if (originalGetContext) {
                Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalGetContext);
            } else {
                // @ts-expect-error test cleanup
                delete HTMLCanvasElement.prototype.getContext;
            }
        }
    });

    it('shows saved progress immediately before playback resumes', async () => {
        document.cookie = `${PLAYER_PROGRESS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify([
            {
                d: 168,
                k: 'link-resume',
                t: 42,
                u: 1000,
            },
        ]))}; Path=/`;

        const { container } = render(
            <Video
                title="Demo"
                persistenceKey="link-resume"
                streamUrl="/stream.mp4"
            />,
        );

        expect((container.querySelector('.spvp-time-primary') as HTMLElement).textContent).toBe('0:42');
        expect((container.querySelector('.spvp-progress-handle') as HTMLElement).style.left).toBe('25%');
        expect((container.querySelector('.spvp-progress-played') as HTMLElement).style.width).toBe('25%');
    });

    it('reapplies saved progress when playback starts after the initial seek was ignored', async () => {
        document.cookie = `${PLAYER_PROGRESS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify([
            {
                d: 168,
                k: 'link-resume-play',
                t: 42,
                u: 1000,
            },
        ]))}; Path=/`;

        const loadMock = vi.fn().mockResolvedValue(undefined);
        let currentTimeValue = 0;
        let canSeek = false;

        class FakePlayer {
            static isBrowserSupported() {
                return true;
            }

            addEventListener = vi.fn();
            attach = vi.fn().mockResolvedValue(undefined);
            configure = vi.fn();
            destroy = vi.fn();
            getVariantTracks = () => [];
            load = loadMock;
            removeEventListener = vi.fn();
            selectVariantTrack = vi.fn();
        }

        Object.defineProperty(globalThis, 'shaka', {
            configurable: true,
            value: {
                Player: FakePlayer,
                polyfill: {
                    installAll: vi.fn(),
                },
            },
        });

        const { container } = render(
            <Video
                title="Resume Demo"
                manifestUrl="/master.m3u8"
                persistenceKey="link-resume-play"
                streamUrl="/stream.mp4"
            />,
        );

        const video = container.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            get: () => currentTimeValue,
            set: (value: number) => {
                if (canSeek) {
                    currentTimeValue = value;
                }
            },
        });
        Object.defineProperty(video, 'duration', {
            configurable: true,
            value: 168,
        });

        await waitFor(() => {
            expect(loadMock).toHaveBeenCalledWith('/master.m3u8');
            expect((container.querySelector('.spvp-time-primary') as HTMLElement).textContent).toBe('0:42');
        });

        expect(currentTimeValue).toBe(0);

        canSeek = true;
        fireEvent.play(video);

        await waitFor(() => {
            expect(currentTimeValue).toBe(42);
            expect((container.querySelector('.spvp-time-primary') as HTMLElement).textContent).toBe('0:42');
        });
    });

    it('reapplies saved progress when the initial seek appears to stick but playback resets it to zero', async () => {
        document.cookie = `${PLAYER_PROGRESS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify([
            {
                d: 168,
                k: 'link-resume-reset',
                t: 42,
                u: 1000,
            },
        ]))}; Path=/`;

        const loadMock = vi.fn().mockResolvedValue(undefined);
        let currentTimeValue = 0;
        let optimisticSeek = true;

        class FakePlayer {
            static isBrowserSupported() {
                return true;
            }

            addEventListener = vi.fn();
            attach = vi.fn().mockResolvedValue(undefined);
            configure = vi.fn();
            destroy = vi.fn();
            getVariantTracks = () => [];
            load = loadMock;
            removeEventListener = vi.fn();
            selectVariantTrack = vi.fn();
        }

        Object.defineProperty(globalThis, 'shaka', {
            configurable: true,
            value: {
                Player: FakePlayer,
                polyfill: {
                    installAll: vi.fn(),
                },
            },
        });

        const { container } = render(
            <Video
                title="Resume Reset Demo"
                manifestUrl="/master.m3u8"
                persistenceKey="link-resume-reset"
                streamUrl="/stream.mp4"
            />,
        );

        const video = container.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            get: () => currentTimeValue,
            set: (value: number) => {
                if (optimisticSeek) {
                    currentTimeValue = value;
                    optimisticSeek = false;
                    return;
                }

                currentTimeValue = value;
            },
        });
        Object.defineProperty(video, 'duration', {
            configurable: true,
            value: 168,
        });

        await waitFor(() => {
            expect(loadMock).toHaveBeenCalledWith('/master.m3u8');
            expect(currentTimeValue).toBe(42);
        });

        currentTimeValue = 0;
        fireEvent.play(video);

        await waitFor(() => {
            expect(currentTimeValue).toBe(42);
        });

        fireEvent.timeUpdate(video);

        await waitFor(() => {
            expect((container.querySelector('.spvp-time-primary') as HTMLElement).textContent).toBe('0:42');
        });
    });

    it('reapplies saved progress when playback resets after play and only playing arrives later', async () => {
        document.cookie = `${PLAYER_PROGRESS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify([
            {
                d: 168,
                k: 'link-resume-playing',
                t: 42,
                u: 1000,
            },
        ]))}; Path=/`;

        const loadMock = vi.fn().mockResolvedValue(undefined);
        let currentTimeValue = 0;
        let seekAttempts = 0;

        class FakePlayer {
            static isBrowserSupported() {
                return true;
            }

            addEventListener = vi.fn();
            attach = vi.fn().mockResolvedValue(undefined);
            configure = vi.fn();
            destroy = vi.fn();
            getVariantTracks = () => [];
            load = loadMock;
            removeEventListener = vi.fn();
            selectVariantTrack = vi.fn();
        }

        Object.defineProperty(globalThis, 'shaka', {
            configurable: true,
            value: {
                Player: FakePlayer,
                polyfill: {
                    installAll: vi.fn(),
                },
            },
        });

        const { container } = render(
            <Video
                title="Resume Playing Demo"
                manifestUrl="/master.m3u8"
                persistenceKey="link-resume-playing"
                streamUrl="/stream.mp4"
            />,
        );

        const video = container.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            get: () => currentTimeValue,
            set: (value: number) => {
                seekAttempts += 1;
                if (seekAttempts === 1) {
                    currentTimeValue = value;
                    return;
                }

                currentTimeValue = value;
            },
        });
        Object.defineProperty(video, 'duration', {
            configurable: true,
            value: 168,
        });

        await waitFor(() => {
            expect(loadMock).toHaveBeenCalledWith('/master.m3u8');
            expect(currentTimeValue).toBe(42);
        });

        fireEvent.play(video);
        currentTimeValue = 0;
        fireEvent.playing(video);

        await waitFor(() => {
            expect(currentTimeValue).toBe(42);
        });
    });

    it('uses bright ambient by default and persists the slider state by persistenceKey', async () => {
        const { container } = render(
            <Video
                title="Demo"
                persistenceKey="link-ambient"
                streamUrl="/stream.mp4"
            />,
        );

        const root = container.querySelector('.spvp-root') as HTMLDivElement;
        expect(root.dataset.ambient).toBe('bright');

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Open ambient settings' }));
        fireEvent.input(await screen.findByRole('slider', { name: 'Ambient level' }), { target: { value: '0' } });

        await waitFor(() => {
            expect(root.dataset.ambient).toBe('off');
            const cookie = parseCookieJson<Array<{ ambientLevel: number; k: string }>>(PLAYER_SETTINGS_COOKIE_NAME);
            expect(cookie?.[0]?.k).toBe('link-ambient');
            expect(cookie?.[0]?.ambientLevel).toBe(0);
        });
    });

    it('lets ambient presets be selected by clicking Off, Bright and Spatial labels', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);
        const root = container.querySelector('.spvp-root') as HTMLDivElement;

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Open ambient settings' }));

        await screen.findByRole('slider', { name: 'Ambient level' });

        fireEvent.click(screen.getByRole('button', { name: 'Spatial' }));
        await waitFor(() => {
            expect(root.dataset.ambient).toBe('spatial');
            expect((screen.getByRole('slider', { name: 'Ambient level' }) as HTMLInputElement).value).toBe('200');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Off' }));
        await waitFor(() => {
            expect(root.dataset.ambient).toBe('off');
            expect((screen.getByRole('slider', { name: 'Ambient level' }) as HTMLInputElement).value).toBe('0');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Bright' }));
        await waitFor(() => {
            expect(root.dataset.ambient).toBe('bright');
            expect((screen.getByRole('slider', { name: 'Ambient level' }) as HTMLInputElement).value).toBe('100');
        });
    });

    it('keeps ambient preset labels active only for the exact slider preset values', async () => {
        render(<Video title="Demo" streamUrl="/stream.mp4" />);

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Open ambient settings' }));

        const slider = await screen.findByRole('slider', { name: 'Ambient level' });
        const offButton = screen.getByRole('button', { name: 'Off' });
        const brightButton = screen.getByRole('button', { name: 'Bright' });
        const spatialButton = screen.getByRole('button', { name: 'Spatial' });

        fireEvent.click(offButton);
        await waitFor(() => {
            expect(offButton.getAttribute('data-active')).toBe('true');
            expect(brightButton.getAttribute('data-active')).toBe('false');
            expect(spatialButton.getAttribute('data-active')).toBe('false');
        });

        fireEvent.input(slider, { target: { value: '23' } });
        await waitFor(() => {
            expect(offButton.getAttribute('data-active')).toBe('false');
            expect(brightButton.getAttribute('data-active')).toBe('false');
            expect(spatialButton.getAttribute('data-active')).toBe('false');
        });

        fireEvent.input(slider, { target: { value: '100' } });
        await waitFor(() => {
            expect(offButton.getAttribute('data-active')).toBe('false');
            expect(brightButton.getAttribute('data-active')).toBe('true');
            expect(spatialButton.getAttribute('data-active')).toBe('false');
        });
    });

    it('allows ambient to be disabled from props', () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" ambient="off" />);

        expect((container.querySelector('.spvp-root') as HTMLDivElement).dataset.ambient).toBe('off');
    });

    it('supports spatial ambient mode', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" ambient="spatial" />);

        const root = container.querySelector('.spvp-root') as HTMLDivElement;

        expect(root.dataset.ambient).toBe('spatial');

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Open ambient settings' }));
        fireEvent.input(await screen.findByRole('slider', { name: 'Ambient level' }), { target: { value: '100' } });

        await waitFor(() => {
            expect(root.dataset.ambient).toBe('bright');
        });
    });

    it('applies ambient brightness to the ambient container instead of scaling queued layer opacity', async () => {
        vi.useFakeTimers();

        try {
            const fakeContext = {
                clearRect: vi.fn(),
                drawImage: vi.fn(),
                getImageData: vi.fn(() => ({
                    data: new Uint8ClampedArray(Array.from({ length: 24 * 14 * 4 }, (_, index) => {
                        const channel = index % 4;
                        if (channel === 0) return 90;
                        if (channel === 1) return 120;
                        if (channel === 2) return 180;
                        return 255;
                    })),
                    height: 14,
                    width: 24,
                })),
                restore: vi.fn(),
                save: vi.fn(),
                scale: vi.fn(),
                translate: vi.fn(),
            };
            vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext as unknown as CanvasRenderingContext2D);

            const { container } = render(
                <Video
                    title="Demo"
                    streamUrl="/stream.mp4"
                    ambientFrameIntervalSeconds={5}
                    ambientBlendWindowSeconds={10}
                />,
            );

            const root = container.querySelector('.spvp-root') as HTMLDivElement;
            const ambient = container.querySelector('.spvp-ambient') as HTMLDivElement;
            const stage = container.querySelector('.spvp-stage') as HTMLDivElement;
            const video = container.querySelector('video') as HTMLVideoElement;

            Object.defineProperty(stage, 'getBoundingClientRect', {
                configurable: true,
                value: () => ({
                    bottom: 900,
                    height: 900,
                    left: 0,
                    right: 1280,
                    top: 0,
                    width: 1280,
                    x: 0,
                    y: 0,
                    toJSON: () => ({}),
                }),
            });
            Object.defineProperty(video, 'readyState', {
                configurable: true,
                get: () => 3,
            });
            Object.defineProperty(video, 'videoWidth', {
                configurable: true,
                get: () => 1920,
            });
            Object.defineProperty(video, 'videoHeight', {
                configurable: true,
                get: () => 1080,
            });
            Object.defineProperty(video, 'duration', {
                configurable: true,
                value: 120,
            });
            Object.defineProperty(video, 'currentTime', {
                configurable: true,
                writable: true,
                value: 0,
            });

            fireEvent.loadedMetadata(video);
            fireEvent.timeUpdate(video);
            await vi.advanceTimersByTimeAsync(0);

            fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
            await vi.advanceTimersByTimeAsync(16);
            fireEvent.click(screen.getByRole('button', { name: 'Open ambient settings' }));
            await vi.advanceTimersByTimeAsync(16);
            fireEvent.input(screen.getByRole('slider', { name: 'Ambient level' }), { target: { value: '50' } });
            await vi.advanceTimersByTimeAsync(16);

            expect(root.dataset.ambient).toBe('bright');
            expect(ambient.style.opacity).toBe('0.5');

            const activeLayerOpacities = Array.from(container.querySelectorAll<HTMLElement>('.spvp-ambient-layer'))
                .filter((layer) => layer.dataset.active === 'true')
                .map((layer) => Number.parseFloat(layer.style.opacity || '0'));

            expect(activeLayerOpacities.some((opacity) => Math.abs(opacity - 1) < 0.001)).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps an opaque ambient base layer while newer layers blend in on top', async () => {
        vi.useFakeTimers();

        try {
            const fakeContext = {
                clearRect: vi.fn(),
                drawImage: vi.fn(),
                getImageData: vi.fn(() => ({
                    data: new Uint8ClampedArray(Array.from({ length: 24 * 14 * 4 }, (_, index) => {
                        const channel = index % 4;
                        if (channel === 0) return 90;
                        if (channel === 1) return 120;
                        if (channel === 2) return 180;
                        return 255;
                    })),
                    height: 14,
                    width: 24,
                })),
                restore: vi.fn(),
                save: vi.fn(),
                scale: vi.fn(),
                translate: vi.fn(),
            };
            vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }));
            Object.defineProperty(window.navigator, 'deviceMemory', {
                configurable: true,
                value: 8,
            });
            Object.defineProperty(window.navigator, 'hardwareConcurrency', {
                configurable: true,
                value: 8,
            });
            vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext as unknown as CanvasRenderingContext2D);

            const { container } = render(
                <Video
                    title="Demo"
                    streamUrl="/stream.mp4"
                    ambientFrameIntervalSeconds={5}
                    ambientBlendWindowSeconds={10}
                />,
            );

            const stage = container.querySelector('.spvp-stage') as HTMLDivElement;
            const video = container.querySelector('video') as HTMLVideoElement;

            Object.defineProperty(stage, 'getBoundingClientRect', {
                configurable: true,
                value: () => ({
                    bottom: 900,
                    height: 900,
                    left: 0,
                    right: 1280,
                    top: 0,
                    width: 1280,
                    x: 0,
                    y: 0,
                    toJSON: () => ({}),
                }),
            });

            Object.defineProperty(video, 'readyState', {
                configurable: true,
                get: () => 3,
            });
            Object.defineProperty(video, 'videoWidth', {
                configurable: true,
                get: () => 1920,
            });
            Object.defineProperty(video, 'videoHeight', {
                configurable: true,
                get: () => 1080,
            });
            Object.defineProperty(video, 'duration', {
                configurable: true,
                value: 120,
            });
            Object.defineProperty(video, 'currentTime', {
                configurable: true,
                writable: true,
                value: 0,
            });

            const activeLayerOpacities = () => Array.from(container.querySelectorAll<HTMLElement>('.spvp-ambient-layer'))
                .filter((layer) => layer.dataset.active === 'true')
                .map((layer) => Number.parseFloat(layer.style.opacity || '0'));
            const flushTasks = async (count = 6) => {
                for (let index = 0; index < count; index += 1) {
                    await Promise.resolve();
                }
            };
            const flushAmbient = async (advanceMs = 0) => {
                await vi.advanceTimersByTimeAsync(advanceMs);
                await flushTasks();
            };

            fireEvent.loadedMetadata(video);
            fireEvent.timeUpdate(video);
            await flushTasks();
            await flushAmbient();

            expect(activeLayerOpacities().some((opacity) => Math.abs(opacity - 1) < 0.001)).toBe(true);

            video.currentTime = 5;
            fireEvent.seeked(video);
            await flushTasks();
            await flushAmbient();
            video.currentTime = 11;
            fireEvent.seeked(video);
            await flushTasks();
            await flushAmbient(10_000);

            {
                const opacities = activeLayerOpacities();
                expect(opacities.length).toBeGreaterThan(1);
                expect(opacities.some((opacity) => Math.abs(opacity - 1) < 0.001)).toBe(true);
            }

            video.currentTime = 16;
            fireEvent.seeked(video);
            await flushTasks();
            await flushAmbient();
            await flushAmbient(10_000);

            video.currentTime = 26;
            fireEvent.seeked(video);
            await flushTasks();
            await flushAmbient();
            await flushAmbient(10_000);

            {
                const opacities = activeLayerOpacities();
                expect(opacities.length).toBeGreaterThan(1);
                expect(opacities.some((opacity) => Math.abs(opacity - 1) < 0.001)).toBe(true);
            }
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps existing ambient layers and appends a new one after a backward seek', async () => {
        const fakeContext = {
            clearRect: vi.fn(),
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({
                data: new Uint8ClampedArray(Array.from({ length: 24 * 14 * 4 }, (_, index) => {
                    const channel = index % 4;
                    if (channel === 0) return 90;
                    if (channel === 1) return 120;
                    if (channel === 2) return 180;
                    return 255;
                })),
                height: 14,
                width: 24,
            })),
            restore: vi.fn(),
            save: vi.fn(),
            scale: vi.fn(),
            translate: vi.fn(),
        };
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }));
        Object.defineProperty(window.navigator, 'deviceMemory', {
            configurable: true,
            value: 8,
        });
        Object.defineProperty(window.navigator, 'hardwareConcurrency', {
            configurable: true,
            value: 8,
        });
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext as unknown as CanvasRenderingContext2D);

        const { container } = render(
            <Video
                title="Demo"
                streamUrl="/stream.mp4"
                ambientFrameIntervalSeconds={5}
                ambientBlendWindowSeconds={10}
            />,
        );

        const stage = container.querySelector('.spvp-stage') as HTMLDivElement;
        const video = container.querySelector('video') as HTMLVideoElement;

        Object.defineProperty(stage, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                bottom: 900,
                height: 900,
                left: 0,
                right: 1280,
                top: 0,
                width: 1280,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }),
        });

        Object.defineProperty(video, 'readyState', {
            configurable: true,
            get: () => 3,
        });
        Object.defineProperty(video, 'videoWidth', {
            configurable: true,
            get: () => 1920,
        });
        Object.defineProperty(video, 'videoHeight', {
            configurable: true,
            get: () => 1080,
        });
        Object.defineProperty(video, 'duration', {
            configurable: true,
            value: 120,
        });
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            writable: true,
            value: 0,
        });

        const activeLayers = () => Array.from(container.querySelectorAll<HTMLElement>('.spvp-ambient-layer'))
            .filter((layer) => layer.dataset.active === 'true');
        const flushTasks = async (count = 6) => {
            for (let index = 0; index < count; index += 1) {
                await Promise.resolve();
            }
        };

        fireEvent.loadedMetadata(video);
        fireEvent.timeUpdate(video);
        await flushTasks();
        await waitFor(() => {
            expect(activeLayers().length).toBe(1);
            expect(container.querySelectorAll('.spvp-ambient-layer')).toHaveLength(1);
        });
        const firstLayer = activeLayers()[0];
        video.currentTime = 20;
        fireEvent.seeked(video);
        await flushTasks();

        await waitFor(() => {
            expect(activeLayers().length).toBe(2);
            expect(container.querySelectorAll('.spvp-ambient-layer')).toHaveLength(2);
            expect(activeLayers()[0]).toBe(firstLayer);
        });
        const secondLayer = activeLayers()[1];

        video.currentTime = 2;
        fireEvent.seeked(video);
        await Promise.resolve();

        await waitFor(() => {
            expect(activeLayers().length).toBe(3);
            expect(container.querySelectorAll('.spvp-ambient-layer')).toHaveLength(3);
            expect(activeLayers()[0]).toBe(firstLayer);
            expect(activeLayers()[1]).toBe(secondLayer);
            expect(activeLayers()[2]).not.toBe(secondLayer);
        });
    });

    it('stores settings in a cookie keyed by persistenceKey', async () => {
        const { container } = render(
            <Video
                title="Demo"
                persistenceKey="link-settings"
                streamUrl="/stream.mp4"
            />,
        );

        const video = container.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'playbackRate', {
            configurable: true,
            writable: true,
            value: 1,
        });
        Object.defineProperty(video, 'defaultPlaybackRate', {
            configurable: true,
            writable: true,
            value: 1,
        });
        Object.defineProperty(video, 'volume', {
            configurable: true,
            writable: true,
            value: 1,
        });
        const menu = container.querySelector('.spvp-menu') as HTMLDivElement;

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Open playback speed settings' }));
        fireEvent.click((container.querySelector('[data-rate="1.5"]') as HTMLButtonElement));

        await waitFor(() => {
            expect(menu.hidden).toBe(true);
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));

        await waitFor(() => {
            expect(menu.hidden).toBe(false);
            expect(container.querySelector('[data-toggle-debug="true"]')).toBeTruthy();
        });

        fireEvent.click(container.querySelector('[data-toggle-debug="true"]') as HTMLButtonElement);

        const volume = container.querySelector('.spvp-volume-range') as HTMLInputElement;
        fireEvent.input(volume, { target: { value: '35' } });

        await waitFor(() => {
            const cookie = parseCookieJson<Array<{ ambientBlurPx: number; ambientLevel: number; k: string; playbackRate: number; debugEnabled: boolean; volume: number }>>(
                PLAYER_SETTINGS_COOKIE_NAME,
            );
            expect(cookie?.[0]?.k).toBe('link-settings');
            expect(cookie?.[0]?.ambientLevel).toBe(1);
            expect(cookie?.[0]?.ambientBlurPx).toBe(92);
            expect(cookie?.[0]?.playbackRate).toBe(1.5);
            expect(cookie?.[0]?.debugEnabled).toBe(true);
            expect(cookie?.[0]?.volume).toBeCloseTo(0.35, 5);
        });
    });

    it('stores progress for the latest 10 videos keyed by persistenceKey', async () => {
        document.cookie = `${PLAYER_PROGRESS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(
            Array.from({ length: 10 }, (_, index) => ({
                k: `link-${index}`,
                t: index * 10,
                u: 1000 - index,
            })),
        ))}; Path=/`;

        const { container } = render(
            <Video
                title="Demo"
                persistenceKey="link-11"
                streamUrl="/stream.mp4"
            />,
        );

        const video = container.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            writable: true,
            value: 42,
        });

        fireEvent.timeUpdate(video);
        fireEvent.pause(video);

        await waitFor(() => {
            const cookie = parseCookieJson<Array<{ d?: number; k: string; t: number }>>(PLAYER_PROGRESS_COOKIE_NAME) ?? [];
            expect(cookie).toHaveLength(10);
            expect(cookie[0]?.k).toBe('link-11');
            expect(cookie[0]?.t).toBe(42);
            expect(cookie[0]?.d).toBeUndefined();
            expect(cookie.some((entry) => entry.k === 'link-9')).toBe(false);
        });
    });

    it('clears invalid settings and progress cookies on read', async () => {
        document.cookie = `${PLAYER_SETTINGS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify([
            {
                ambientMode: false,
                k: 'legacy-settings',
                u: 1000,
            },
        ]))}; Path=/`;
        document.cookie = `${PLAYER_PROGRESS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify([
            {
                k: 'legacy-progress',
                t: 42,
                u: 1000,
                v: 2,
            },
        ]))}; Path=/`;

        render(
            <Video
                title="Demo"
                persistenceKey="link-invalid-cookie"
                streamUrl="/stream.mp4"
            />,
        );

        await waitFor(() => {
            expect(parseCookieJson(PLAYER_SETTINGS_COOKIE_NAME)).toBeUndefined();
            expect(parseCookieJson(PLAYER_PROGRESS_COOKIE_NAME)).toBeUndefined();
        });
    });

    it('shows preview time on timeline hover', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                entries: [{
                    start: 150,
                    end: 160,
                    url: '/preview.jpg',
                    tileX: 2,
                    tileY: 1,
                    layoutColumns: 10,
                    layoutRows: 10,
                    tileWidth: 320,
                    tileHeight: 180,
                }],
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { container } = render(
            <Video title="Demo" streamUrl="/stream.mp4" previewTracksUrl="/preview-tracks.json" />,
        );

        const video = container.querySelector('video') as HTMLVideoElement;
        const seek = await screen.findByRole('slider', { name: 'Seek' });
        const shell = container.querySelector('.spvp-progress-shell') as HTMLDivElement;
        const previewFrame = container.querySelector('.spvp-preview-frame') as HTMLDivElement;
        const previewImage = container.querySelector('.spvp-preview-image') as HTMLDivElement;
        const previewGlow = container.querySelector('.spvp-preview-glow') as HTMLDivElement;
        const hoverBar = container.querySelector('.spvp-progress-hover') as HTMLDivElement;
        const preview = container.querySelector('.spvp-preview') as HTMLDivElement;
        const currentTime = container.querySelector('.spvp-current-time') as HTMLDivElement;

        Object.defineProperty(video, 'duration', {
            configurable: true,
            value: 300,
        });
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            writable: true,
            value: 42,
        });
        vi.spyOn(seek, 'getBoundingClientRect').mockReturnValue({
            bottom: 16,
            height: 16,
            left: 0,
            right: 1000,
            top: 0,
            width: 1000,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });
        vi.spyOn(shell, 'getBoundingClientRect').mockReturnValue({
            bottom: 16,
            height: 16,
            left: 0,
            right: 1000,
            top: 0,
            width: 1000,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });
        vi.spyOn(previewFrame, 'getBoundingClientRect').mockReturnValue({
            bottom: 180,
            height: 135,
            left: 0,
            right: 240,
            top: 0,
            width: 240,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        fireEvent.loadedMetadata(video);
        fireEvent.pointerEnter(seek);
        fireEvent.mouseMove(seek, { clientX: 500 });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith('/preview-tracks.json');
            expect(screen.getByText('2:30')).toBeTruthy();
            expect(previewImage.style.backgroundImage).toContain('/preview.jpg');
            expect(previewImage.style.backgroundSize).toBe('1000% 1000%');
            expect(previewImage.style.backgroundPosition).toBe('22.22222222222222% 11.11111111111111%');
            expect(previewGlow.style.backgroundImage).toContain('/preview.jpg');
            expect(hoverBar.dataset.visible).toBe('true');
            expect(hoverBar.style.width).toBe('50%');
            expect(preview.style.left).toBe('500px');
            expect(currentTime.dataset.hidden).toBe('true');
            expect(currentTime.dataset.overlap).toBe('false');
        });

        fireEvent.mouseMove(seek, { clientX: 220 });
        await waitFor(() => {
            expect(currentTime.dataset.hidden).toBe('true');
            expect(currentTime.dataset.overlap).toBe('false');
        });

        fireEvent.mouseMove(seek, { clientX: 145 });
        await waitFor(() => {
            expect(currentTime.dataset.overlap).toBe('false');
            expect(currentTime.dataset.hidden).toBe('true');
        });

        fireEvent.mouseMove(seek, { clientX: 10 });
        await waitFor(() => {
            expect(preview.style.left).toBe('120px');
        });

        fireEvent.mouseMove(seek, { clientX: 990 });
        await waitFor(() => {
            expect(preview.style.left).toBe('880px');
        });

        fireEvent.pointerLeave(seek);
        await waitFor(() => {
            expect(hoverBar.dataset.visible).toBe('false');
            expect(hoverBar.style.width).toBe('99%');
        });
    });

    it('toggles the debug overlay from settings', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);

        const debugBox = container.querySelector('.spvp-debug') as HTMLDivElement;
        expect(debugBox.hidden).toBe(true);

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Toggle debug overlay' }));

        await waitFor(() => {
            expect(debugBox.hidden).toBe(false);
            expect(container.querySelector('[data-debug-ambient]')).toBeNull();
            expect(container.querySelector('[data-debug-ambient-source]')).toBeNull();
            expect(container.querySelector('[data-debug-ambient-tier]')).toBeNull();
            expect(container.querySelector('[data-debug-ambient-blur]')).toBeNull();
        });
    });

    it('keeps the hover line visible while suppressing preview and hover badges when settings are open', async () => {
        const { container } = render(
            <Video title="Demo" streamUrl="/stream.mp4" previewTracksUrl="/preview-tracks.json" />,
        );

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                entries: [{
                    start: 30,
                    end: 40,
                    url: '/preview.jpg',
                    tileX: 0,
                    tileY: 0,
                    layoutColumns: 1,
                    layoutRows: 1,
                    tileWidth: 320,
                    tileHeight: 180,
                }],
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const video = container.querySelector('video') as HTMLVideoElement;
        const seek = await screen.findByRole('slider', { name: 'Seek' });
        const shell = container.querySelector('.spvp-progress-shell') as HTMLDivElement;
        const hoverBar = container.querySelector('.spvp-progress-hover') as HTMLDivElement;
        const preview = container.querySelector('.spvp-preview') as HTMLDivElement;
        const currentTime = container.querySelector('.spvp-current-time') as HTMLDivElement;

        Object.defineProperty(video, 'duration', {
            configurable: true,
            value: 300,
        });
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            writable: true,
            value: 42,
        });
        vi.spyOn(seek, 'getBoundingClientRect').mockReturnValue({
            bottom: 16,
            height: 16,
            left: 0,
            right: 1000,
            top: 0,
            width: 1000,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });
        vi.spyOn(shell, 'getBoundingClientRect').mockReturnValue({
            bottom: 16,
            height: 16,
            left: 0,
            right: 1000,
            top: 0,
            width: 1000,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        fireEvent.loadedMetadata(video);
        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
        fireEvent.pointerEnter(seek);
        fireEvent.mouseMove(seek, { clientX: 500 });

        await waitFor(() => {
            expect(hoverBar.dataset.visible).toBe('true');
            expect(hoverBar.style.width).toBe('50%');
            expect(preview.dataset.visible).toBe('false');
            expect(currentTime.dataset.hidden).toBe('true');
        });
    });

    it('updates ambient sliders without leaking ambient controls into debug', async () => {
        const fakeContext = {
            clearRect: vi.fn(),
            drawImage: vi.fn(),
            restore: vi.fn(),
            save: vi.fn(),
            scale: vi.fn(),
            translate: vi.fn(),
        };
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext as unknown as CanvasRenderingContext2D);

        const { container } = render(
            <Video
                title="Demo"
                persistenceKey="link-ambient-slider"
                streamUrl="/stream.mp4"
            />,
        );

        const root = container.querySelector('.spvp-root') as HTMLDivElement;
        const stage = container.querySelector('.spvp-stage') as HTMLDivElement;
        const video = container.querySelector('video') as HTMLVideoElement;

        Object.defineProperty(stage, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                bottom: 900,
                height: 900,
                left: 0,
                right: 1280,
                top: 0,
                width: 1280,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }),
        });

        Object.defineProperty(video, 'readyState', {
            configurable: true,
            get: () => 3,
        });
        Object.defineProperty(video, 'videoWidth', {
            configurable: true,
            get: () => 1920,
        });
        Object.defineProperty(video, 'videoHeight', {
            configurable: true,
            get: () => 1080,
        });
        Object.defineProperty(video, 'duration', {
            configurable: true,
            value: 120,
        });
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            writable: true,
            value: 30,
        });

        fireEvent.loadedMetadata(video);
        fireEvent.timeUpdate(video);

        await waitFor(() => {
            expect(container.querySelectorAll('.spvp-ambient-layer').length).toBeGreaterThan(0);
            expect(fakeContext.drawImage).toHaveBeenCalled();
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Open ambient settings' }));

        await waitFor(() => {
            expect(screen.getByRole('slider', { name: 'Ambient level' })).toBeTruthy();
            expect(screen.getByRole('slider', { name: 'Ambient blur' })).toBeTruthy();
        });

        fireEvent.input(screen.getByRole('slider', { name: 'Ambient blur' }), { target: { value: '12' } });

        await waitFor(() => {
            expect(root.style.getPropertyValue('--spvp-ambient-blur')).toBe('12px');
        });

        fireEvent.input(screen.getByRole('slider', { name: 'Ambient level' }), { target: { value: '200' } });

        await waitFor(() => {
            expect(root.dataset.ambient).toBe('spatial');
        });

        fireEvent.input(screen.getByRole('slider', { name: 'Ambient level' }), { target: { value: '0' } });

        await waitFor(() => {
            expect(root.dataset.ambient).toBe('off');
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Toggle debug overlay' }));

        await waitFor(() => {
            expect(container.querySelector('[data-debug-ambient]')).toBeNull();
            expect(container.querySelector('[data-debug-ambient-source]')).toBeNull();
            expect(container.querySelector('[data-debug-ambient-tier]')).toBeNull();
            expect(container.querySelector('[data-debug-ambient-blur]')).toBeNull();
        });

        const cookie = parseCookieJson<Array<Record<string, unknown>>>(PLAYER_SETTINGS_COOKIE_NAME) ?? [];
        expect(cookie[0]?.ambientLevel).toBe(0);
        expect(cookie[0]?.ambientBlurPx).toBe(12);
    });

    it('handles keyboard playback shortcuts', async () => {
        const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);

        const video = container.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'duration', {
            configurable: true,
            value: 120,
        });
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            writable: true,
            value: 20,
        });
        Object.defineProperty(video, 'paused', {
            configurable: true,
            get: () => true,
        });

        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(video.currentTime).toBe(30);

        fireEvent.keyDown(window, { key: ' ' });
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    it('shows volume HUD for keyboard changes, supports shift step, and allows boosting to 1000%', () => {
        class FakeAudioContext {
            state: AudioContextState = 'running';

            createGain() {
                return {
                    connect: vi.fn(),
                    disconnect: vi.fn(),
                    gain: {
                        value: 1,
                    },
                } as unknown as GainNode;
            }

            createMediaElementSource() {
                return {
                    connect: vi.fn(),
                    disconnect: vi.fn(),
                } as unknown as MediaElementAudioSourceNode;
            }

            close = vi.fn().mockResolvedValue(undefined);
            resume = vi.fn().mockResolvedValue(undefined);
        }

        vi.stubGlobal('AudioContext', FakeAudioContext);

        const { container } = render(
            <Video
                title="Demo"
                persistenceKey="link-volume"
                streamUrl="/stream.mp4"
            />,
        );

        fireEvent.keyDown(window, { key: 'ArrowUp' });
        expect((container.querySelector('.spvp-top-toast') as HTMLElement).textContent).toBe('105%');

        fireEvent.keyDown(window, { key: 'ArrowUp', shiftKey: true });
        expect((container.querySelector('.spvp-top-toast') as HTMLElement).textContent).toBe('130%');

        for (let index = 0; index < 200; index += 1) {
            fireEvent.keyDown(window, { key: 'ArrowUp' });
        }

        expect((container.querySelector('.spvp-top-toast') as HTMLElement).textContent).toBe('1000%');
    });

    it('keeps the volume HUD visible while keyboard volume is repeated', () => {
        vi.useFakeTimers();

        try {
            class FakeAudioContext {
                state: AudioContextState = 'running';

                createGain() {
                    return {
                        connect: vi.fn(),
                        disconnect: vi.fn(),
                        gain: {
                            value: 1,
                        },
                    } as unknown as GainNode;
                }

                createMediaElementSource() {
                    return {
                        connect: vi.fn(),
                        disconnect: vi.fn(),
                    } as unknown as MediaElementAudioSourceNode;
                }

                close = vi.fn().mockResolvedValue(undefined);
                resume = vi.fn().mockResolvedValue(undefined);
            }

            vi.stubGlobal('AudioContext', FakeAudioContext);

            const { container } = render(<Video title="Demo" streamUrl="/stream.mp4" />);
            const topToast = container.querySelector('.spvp-top-toast') as HTMLElement;

            fireEvent.keyDown(window, { key: 'ArrowUp' });
            expect(topToast.dataset.visible).toBe('true');

            vi.advanceTimersByTime(500);
            fireEvent.keyDown(window, { key: 'ArrowUp' });
            expect(topToast.dataset.visible).toBe('true');

            vi.advanceTimersByTime(500);
            expect(topToast.dataset.visible).toBe('true');

            vi.advanceTimersByTime(900);
            expect(topToast.dataset.visible).toBe('false');
        } finally {
            vi.useRealTimers();
        }
    });
});
