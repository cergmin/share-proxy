import * as shakaModule from 'shaka-player';
import { z } from 'zod';
import { defineVideoPlayerCustomElements } from './components/register';
import type { SpvpControlBarElement } from './components/control-bar-element';
import type { SpvpSettingsPopupElement } from './components/settings-popup-element';
import { createIcon } from './icons';

const STYLE_ELEMENT_ID = 'share-proxy-video-player-styles';
const ROOT_CLASSNAME = 'spvp-root';
const ROOT_ID = 'share-proxy-video-player-root';
const PLAYER_SETTINGS_COOKIE_NAME = 'spvp_settings';
const PLAYER_PROGRESS_COOKIE_NAME = 'spvp_progress';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 10;
const MAX_PROGRESS_ENTRIES = 10;
const PROGRESS_SAVE_INTERVAL_SECONDS = 2;
const SEEK_DEBOUNCE_MS = 20;
const SAFE_AREA_FALLBACK_PX = 16;
const MENU_BOTTOM_OFFSET_PX = 68;
const MENU_VIEWPORT_MARGIN_PX = 8;
const AMBIENT_EDGE_OVERLAP_PX = 92;
const DEFAULT_AMBIENT_FRAME_INTERVAL_SECONDS = 5;
const DEFAULT_AMBIENT_BLEND_WINDOW_SECONDS = 10;
const MAX_SPATIAL_EDGE_FADE_PX = 64;
const MAX_AMBIENT_BLUR_PX = 92;
const DEFAULT_AMBIENT_LEVEL = 1;
const DEFAULT_AMBIENT_BLUR_PX = MAX_AMBIENT_BLUR_PX;

export interface PreviewTrackEntry {
    end: number;
    layoutColumns?: number;
    layoutRows?: number;
    start: number;
    tileHeight?: number;
    tileWidth?: number;
    tileX?: number;
    tileY?: number;
    url: string;
}

export interface PreviewTracksPayload {
    entries: PreviewTrackEntry[];
}

export interface VideoPlayerQualityOption {
    id: string;
    label: string;
    sourceType: 'manifest' | 'stream';
    url: string;
}

export interface VideoPlayerOptions {
    ambient?: AmbientMode;
    ambientBlendWindowSeconds?: number;
    ambientBlurPx?: number;
    ambientFrameIntervalSeconds?: number;
    autoPlay?: boolean;
    embed?: boolean;
    fullViewport?: boolean;
    manifestUrl?: string;
    persistenceKey?: string;
    posterUrl?: string;
    previewTracksUrl?: string;
    qualityOptions?: VideoPlayerQualityOption[];
    streamUrl: string;
    title: string;
}

export interface VideoPlayerHandle {
    destroy: () => Promise<void>;
    video: HTMLVideoElement;
}

interface ShakaVariantTrack {
    active?: boolean;
    bandwidth?: number;
    height?: number | null;
    id: number;
    language?: string;
    videoId?: number | null;
    width?: number | null;
}

interface ShakaMediaQualityInfo {
    bandwidth?: number | null;
    contentType?: string;
    height?: number | null;
    width?: number | null;
}

interface ShakaStats {
    estimatedBandwidth?: number;
    height?: number;
    streamBandwidth?: number;
    width?: number;
}

interface ShakaPlayerInstance {
    addEventListener?: (eventName: string, listener: EventListenerOrEventListenerObject) => void;
    attach?: (element: HTMLVideoElement) => Promise<void>;
    configure?: (config: unknown, value?: unknown) => void;
    destroy?: () => Promise<void> | void;
    getStats?: () => ShakaStats;
    getVariantTracks?: () => ShakaVariantTrack[];
    load?: (uri: string) => Promise<void>;
    removeEventListener?: (eventName: string, listener: EventListenerOrEventListenerObject) => void;
    selectVariantTrack?: (track: ShakaVariantTrack, clearBuffer?: boolean) => void;
}

interface VideoFrameMetadataLike {
    presentedFrames?: number;
}

interface VideoQualitySample {
    mediaQuality: ShakaMediaQualityInfo;
    position: number;
}

interface StoredPlayerSettings {
    ambientBlurPx?: number;
    ambientLevel?: number;
    debugEnabled?: boolean;
    muted?: boolean;
    playbackRate?: number;
    qualityMode?: 'auto' | number;
    selectedQualityId?: string;
    volume?: number;
}

type TimeDisplayMode = 'elapsed' | 'remaining';

interface AmbientVisual {
    centerLayout?: AmbientPanelLayout;
    key: string;
    panelLayouts?: Partial<Record<AmbientSideName, AmbientPanelLayout>>;
    renderMode: AmbientRenderMode;
    sourceCanvas?: HTMLCanvasElement;
    source: AmbientSourceActual;
}

interface AmbientQueueEntry {
    insertedAtMs: number;
    key: string;
    layer: HTMLElement;
    samplePlaybackTime: number;
    visual: AmbientVisual;
}

interface AmbientPanelLayout {
    contentHeight: number;
    contentWidth: number;
    height: number;
    left: number;
    offsetX: number;
    offsetY: number;
    top: number;
    transform: string;
    width: number;
}

interface AmbientStageGeometry {
    stageHeight: number;
    stageWidth: number;
    videoHeight: number;
    videoLeft: number;
    videoTop: number;
    videoWidth: number;
}

export type AmbientMode = 'bright' | 'off' | 'spatial';
type AmbientRenderMode = 'frame';
type AmbientSourceActual = 'off' | 'unavailable' | 'video';
type AmbientSideName = 'bottom' | 'left' | 'right' | 'top';

const AmbientModeSchema = z.enum(['bright', 'off', 'spatial']);
const StoredPlayerSettingsEntrySchema = z.object({
    ambientBlurPx: z.number().finite().min(0).max(MAX_AMBIENT_BLUR_PX).optional(),
    ambientLevel: z.number().finite().min(0).max(2).optional(),
    debugEnabled: z.boolean().optional(),
    k: z.string(),
    muted: z.boolean().optional(),
    playbackRate: z.number().finite().optional(),
    qualityMode: z.union([z.literal('auto'), z.number().finite()]).optional(),
    selectedQualityId: z.string().optional(),
    u: z.number().finite(),
    volume: z.number().finite().optional(),
}).strict();
const StoredPlayerSettingsCookieSchema = z.array(StoredPlayerSettingsEntrySchema);
const StoredProgressEntrySchema = z.object({
    d: z.number().finite().nonnegative().optional(),
    k: z.string(),
    t: z.number().finite().nonnegative(),
    u: z.number().finite(),
}).strict();
const StoredProgressCookieSchema = z.array(StoredProgressEntrySchema);

interface AudioBoostState {
    context: AudioContext;
    gainNode: GainNode;
    sourceNode: MediaElementAudioSourceNode;
}

interface StoredPlayerSettingsEntry extends StoredPlayerSettings {
    k: string;
    u: number;
}

interface StoredProgressEntry {
    d?: number;
    k: string;
    t: number;
    u: number;
}

type ShakaRuntime = {
    Player?: {
        isBrowserSupported?: () => boolean;
        new(): ShakaPlayerInstance;
    };
    polyfill?: {
        installAll?: () => void;
    };
};

const bundledShakaRuntime = shakaModule as unknown as ShakaRuntime;
const SHAKA_STREAMING_CONFIG = {
    bufferBehind: 60,
    bufferingGoal: 60,
    rebufferingGoal: 3,
};

function getDefaultAbrBandwidthEstimate(win: Window): number {
    const nav = win.navigator as Navigator & {
        connection?: {
            downlink?: number;
            effectiveType?: string;
            saveData?: boolean;
        };
    };

    const downlink = nav.connection?.downlink;
    if (typeof downlink === 'number' && Number.isFinite(downlink) && downlink > 0) {
        return clamp(downlink * 1_000_000, 2_500_000, 20_000_000);
    }

    if (nav.connection?.effectiveType === '4g') {
        return 12_000_000;
    }

    return 12_000_000;
}

function getShakaAbrConfig(win: Window) {
    return {
        enabled: true,
        clearBufferSwitch: false,
        defaultBandwidthEstimate: getDefaultAbrBandwidthEstimate(win),
        ignoreDevicePixelRatio: false,
        restrictToElementSize: true,
        restrictToScreenSize: true,
        switchInterval: 3,
    };
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function serializeForInlineScript(value: unknown): string {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

function parseCookieValue(doc: Document, name: string): string | undefined {
    const cookiePrefix = `${name}=`;
    for (const part of doc.cookie.split(';')) {
        const normalized = part.trim();
        if (normalized.startsWith(cookiePrefix)) {
            return decodeURIComponent(normalized.slice(cookiePrefix.length));
        }
    }

    return undefined;
}

function writeCookie(doc: Document, name: string, value: string, maxAge = COOKIE_MAX_AGE_SECONDS): void {
    doc.cookie = [
        `${name}=${encodeURIComponent(value)}`,
        'Path=/',
        `Max-Age=${maxAge}`,
        'SameSite=Lax',
    ].join('; ');
}

function clearCookie(doc: Document, name: string): void {
    doc.cookie = [
        `${name}=`,
        'Path=/',
        'Max-Age=0',
        'SameSite=Lax',
    ].join('; ');
}

function readValidatedCookie<T>(doc: Document, name: string, schema: z.ZodType<T>): T | undefined {
    const rawValue = parseCookieValue(doc, name);
    if (!rawValue) {
        return undefined;
    }

    let stored: unknown;
    try {
        stored = JSON.parse(rawValue);
    } catch {
        clearCookie(doc, name);
        return undefined;
    }

    const parsed = schema.safeParse(stored);
    if (!parsed.success) {
        clearCookie(doc, name);
        return undefined;
    }

    return parsed.data;
}

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '--:--';
    }

    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function getAmbientStageGeometry(stage: HTMLElement, video: HTMLVideoElement): AmbientStageGeometry | undefined {
    const stageRect = stage.getBoundingClientRect();
    const stageWidth = stageRect.width || stage.clientWidth || video.videoWidth;
    const stageHeight = stageRect.height || stage.clientHeight || video.videoHeight;

    if (!Number.isFinite(stageWidth) || !Number.isFinite(stageHeight) || stageWidth <= 0 || stageHeight <= 0) {
        return undefined;
    }

    const intrinsicWidth = video.videoWidth || stageWidth;
    const intrinsicHeight = video.videoHeight || stageHeight;
    const stageAspect = stageWidth / stageHeight;
    const videoAspect = intrinsicWidth / intrinsicHeight;

    let videoWidth = stageWidth;
    let videoHeight = stageHeight;
    let videoLeft = 0;
    let videoTop = 0;

    if (stageAspect > videoAspect) {
        videoHeight = stageHeight;
        videoWidth = videoHeight * videoAspect;
        videoLeft = (stageWidth - videoWidth) / 2;
    } else {
        videoWidth = stageWidth;
        videoHeight = videoWidth / videoAspect;
        videoTop = (stageHeight - videoHeight) / 2;
    }

    return {
        stageHeight,
        stageWidth,
        videoHeight,
        videoLeft,
        videoTop,
        videoWidth,
    };
}

function buildMirroredAmbientVisual(options: {
    key: string;
    source: AmbientSourceActual;
    sourceCanvas: HTMLCanvasElement;
    stage: HTMLElement;
    video: HTMLVideoElement;
}): AmbientVisual | undefined {
    const geometry = getAmbientStageGeometry(options.stage, options.video);
    if (!geometry) {
        return undefined;
    }

    const { stageHeight, stageWidth, videoHeight, videoLeft, videoTop, videoWidth } = geometry;
    const topGap = Math.max(0, videoTop);
    const bottomGap = Math.max(0, stageHeight - (videoTop + videoHeight));
    const leftGap = Math.max(0, videoLeft);
    const rightGap = Math.max(0, stageWidth - (videoLeft + videoWidth));
    const panelLayouts: Partial<Record<AmbientSideName, AmbientPanelLayout>> = {};

    if (topGap > 0) {
        const width = videoWidth + (AMBIENT_EDGE_OVERLAP_PX * 2);
        const height = topGap + AMBIENT_EDGE_OVERLAP_PX;
        const contentWidth = videoWidth;
        const contentHeight = Math.max(videoHeight * 2, height);
        panelLayouts.top = {
            contentHeight,
            contentWidth,
            height,
            left: videoLeft - AMBIENT_EDGE_OVERLAP_PX,
            offsetX: AMBIENT_EDGE_OVERLAP_PX,
            offsetY: 0,
            top: -AMBIENT_EDGE_OVERLAP_PX,
            transform: 'scaleY(-1)',
            width,
        };
    }

    if (bottomGap > 0) {
        const width = videoWidth + (AMBIENT_EDGE_OVERLAP_PX * 2);
        const height = bottomGap + AMBIENT_EDGE_OVERLAP_PX;
        const contentWidth = videoWidth;
        const contentHeight = Math.max(videoHeight * 2, height);
        panelLayouts.bottom = {
            contentHeight,
            contentWidth,
            height,
            left: videoLeft - AMBIENT_EDGE_OVERLAP_PX,
            offsetX: AMBIENT_EDGE_OVERLAP_PX,
            offsetY: height - contentHeight,
            top: videoTop + videoHeight,
            transform: 'scaleY(-1)',
            width,
        };
    }

    if (leftGap > 0) {
        const width = leftGap + AMBIENT_EDGE_OVERLAP_PX;
        const height = videoHeight + (AMBIENT_EDGE_OVERLAP_PX * 2);
        const contentWidth = Math.max(videoWidth * 2, width);
        const contentHeight = videoHeight;
        panelLayouts.left = {
            contentHeight,
            contentWidth,
            height,
            left: -AMBIENT_EDGE_OVERLAP_PX,
            offsetX: 0,
            offsetY: AMBIENT_EDGE_OVERLAP_PX,
            top: videoTop - AMBIENT_EDGE_OVERLAP_PX,
            transform: 'scaleX(-1)',
            width,
        };
    }

    if (rightGap > 0) {
        const width = rightGap + AMBIENT_EDGE_OVERLAP_PX;
        const height = videoHeight + (AMBIENT_EDGE_OVERLAP_PX * 2);
        const contentWidth = Math.max(videoWidth * 2, width);
        const contentHeight = videoHeight;
        panelLayouts.right = {
            contentHeight,
            contentWidth,
            height,
            left: videoLeft + videoWidth,
            offsetX: width - contentWidth,
            offsetY: AMBIENT_EDGE_OVERLAP_PX,
            top: videoTop - AMBIENT_EDGE_OVERLAP_PX,
            transform: 'scaleX(-1)',
            width,
        };
    }

    return {
        centerLayout: {
            contentHeight: videoHeight,
            contentWidth: videoWidth,
            height: videoHeight,
            left: videoLeft - AMBIENT_EDGE_OVERLAP_PX,
            offsetX: AMBIENT_EDGE_OVERLAP_PX,
            offsetY: 0,
            top: videoTop,
            transform: '',
            width: videoWidth + (AMBIENT_EDGE_OVERLAP_PX * 2),
        },
        key: options.key,
        panelLayouts,
        renderMode: 'frame',
        sourceCanvas: options.sourceCanvas,
        source: options.source,
    };
}

function getSmoothSpatialMaskGradient(axis: 'x' | 'y', enabled: boolean, fadePx: number): string {
    const direction = axis === 'x' ? '90deg' : '180deg';
    if (!enabled || fadePx <= 0.5) {
        return `linear-gradient(${direction} in oklab, black 0%, black 100%)`;
    }

    const softPx = Math.max(1, fadePx * 0.34);
    const midPx = Math.max(softPx + 1, fadePx * 0.68);
    return `linear-gradient(${direction} in oklab,
      transparent 0px,
      rgba(0, 0, 0, 0.2) ${softPx}px,
      rgba(0, 0, 0, 0.62) ${midPx}px,
      black ${fadePx}px,
      black calc(100% - ${fadePx}px),
      rgba(0, 0, 0, 0.62) calc(100% - ${midPx}px),
      rgba(0, 0, 0, 0.2) calc(100% - ${softPx}px),
      transparent 100%)`;
}

function getLabelWidth(element: HTMLElement): number {
    const rectWidth = element.getBoundingClientRect().width;
    if (rectWidth > 0) {
        return rectWidth;
    }

    if (element.offsetWidth > 0) {
        return element.offsetWidth;
    }

    const text = element.textContent?.trim() ?? '';
    return text.length > 0 ? (text.length * 11) + 12 : 0;
}

function dedupeVariantTracks(tracks: ShakaVariantTrack[]): ShakaVariantTrack[] {
    const unique = new Map<string, ShakaVariantTrack>();

    for (const track of tracks) {
        if (track.videoId == null && track.height == null && track.bandwidth == null) {
            continue;
        }

        const key = `${track.height ?? 0}:${track.bandwidth ?? 0}:${track.id}`;
        if (!unique.has(key)) {
            unique.set(key, track);
        }
    }

    return Array.from(unique.values()).sort((left, right) => {
        const leftScore = (left.height ?? 0) * 1_000_000 + (left.bandwidth ?? 0);
        const rightScore = (right.height ?? 0) * 1_000_000 + (right.bandwidth ?? 0);
        return rightScore - leftScore;
    });
}

function formatBandwidth(bandwidth: number): string {
    if (bandwidth >= 1_000_000) {
        const mbps = bandwidth / 1_000_000;
        return `${Number.isInteger(mbps) ? mbps.toFixed(0) : mbps.toFixed(1)} Mbps`;
    }

    return `${Math.round(bandwidth / 1_000)} kbps`;
}

function formatResolution(track: ShakaVariantTrack): string | null {
    if (track.height) {
        return `${track.height}p`;
    }

    if (track.width) {
        return `${track.width}px`;
    }

    return null;
}

function describeVariantTrack(track: ShakaVariantTrack): { primary: string; secondary: string | null } {
    const resolution = formatResolution(track);
    const bitrate = track.bandwidth ? formatBandwidth(track.bandwidth) : null;

    if (resolution) {
        return {
            primary: resolution,
            secondary: bitrate,
        };
    }

    return {
        primary: bitrate ?? 'Original',
        secondary: null,
    };
}

function formatResolutionValue(height?: number | null, width?: number | null): string | null {
    if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
        return `${Math.round(height)}p`;
    }

    if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
        return `${Math.round(width)}px`;
    }

    return null;
}

function getTrackDebugSummary(
    track: ShakaVariantTrack | undefined,
    video: HTMLVideoElement,
    mediaQuality?: ShakaMediaQualityInfo,
    stats?: ShakaStats,
): { bitrate: string; size: string } {
    const size = formatResolutionValue(mediaQuality?.height, mediaQuality?.width)
        ?? formatResolutionValue(stats?.height, stats?.width)
        ?? (video.videoWidth && video.videoHeight ? `${video.videoHeight}p` : null)
        ?? (track ? formatResolution(track) : null)
        ?? '--';
    const bitrateValue = mediaQuality?.bandwidth
        ?? stats?.streamBandwidth
        ?? track?.bandwidth;
    const bitrate = typeof bitrateValue === 'number' && Number.isFinite(bitrateValue) && bitrateValue > 0
        ? formatBandwidth(bitrateValue)
        : '--';

    return {
        bitrate,
        size,
    };
}

function areMediaQualitiesEquivalent(
    left: ShakaMediaQualityInfo | undefined,
    right: ShakaMediaQualityInfo | undefined,
): boolean {
    if (!left || !right) {
        return false;
    }

    return left.bandwidth === right.bandwidth
        && left.width === right.width
        && left.height === right.height
        && left.contentType === right.contentType;
}

function dedupeByKey<T extends { k: string; u: number }>(entries: T[]): T[] {
    const byKey = new Map<string, T>();
    for (const entry of entries.sort((left, right) => right.u - left.u)) {
        if (!byKey.has(entry.k)) {
            byKey.set(entry.k, entry);
        }
    }

    return Array.from(byKey.values())
        .sort((left, right) => right.u - left.u)
        .slice(0, MAX_PROGRESS_ENTRIES);
}

function ambientModeToLevel(mode: AmbientMode | undefined): number {
    if (mode === 'off') {
        return 0;
    }
    if (mode === 'spatial') {
        return 2;
    }
    return 1;
}

function clampAmbientLevel(value: number): number {
    return clamp(value, 0, 2);
}

function clampAmbientBlurPx(value: number): number {
    return clamp(value, 0, MAX_AMBIENT_BLUR_PX);
}

function getAmbientStageLabel(level: number): AmbientMode {
    if (level <= 0.001) {
        return 'off';
    }
    if (level > 1) {
        return 'spatial';
    }
    return 'bright';
}

function getAmbientBrightnessScale(level: number): number {
    if (level <= 0) {
        return 0;
    }
    if (level < 1) {
        return level;
    }
    return 1;
}

function getSpatialEdgeFadePx(level: number): number {
    if (level <= 1) {
        return 0;
    }
    return (level - 1) * MAX_SPATIAL_EDGE_FADE_PX;
}

function getAmbientSummaryLabel(level: number): string {
    if (level <= 0.001) {
        return 'Off';
    }
    if (level < 0.995) {
        return `Bright ${Math.round(level * 100)}%`;
    }
    if (level <= 1.005) {
        return 'Bright';
    }
    return `Spatial ${Math.round(getSpatialEdgeFadePx(level))}px`;
}

function renderTimeDisplay(mode: TimeDisplayMode, currentTime: number, duration: number): { primary: string; secondary: string } {
    const safeCurrent = Math.max(0, currentTime);
    if (duration <= 0) {
        if (mode === 'remaining') {
            return { primary: '--:--', secondary: ' / --:--' };
        }
        return { primary: formatTime(safeCurrent), secondary: ' / --:--' };
    }

    if (mode === 'remaining') {
        return {
            primary: `-${formatTime(Math.max(duration - safeCurrent, 0))}`,
            secondary: ` / ${formatTime(duration)}`,
        };
    }

    return {
        primary: formatTime(safeCurrent),
        secondary: ` / ${formatTime(duration)}`,
    };
}

function readStoredPlayerSettings(doc: Document, persistenceKey?: string): StoredPlayerSettings {
    if (!persistenceKey) {
        return {};
    }

    const entries = readValidatedCookie(doc, PLAYER_SETTINGS_COOKIE_NAME, StoredPlayerSettingsCookieSchema);
    if (!entries) {
        return {};
    }

    const entry = entries.find((item) => item.k === persistenceKey);
    if (!entry) {
        return {};
    }

    return {
        ambientBlurPx: entry.ambientBlurPx,
        ambientLevel: entry.ambientLevel,
        debugEnabled: entry.debugEnabled,
        muted: entry.muted,
        playbackRate: entry.playbackRate,
        qualityMode: entry.qualityMode,
        selectedQualityId: entry.selectedQualityId,
        volume: entry.volume,
    };
}

function writeStoredPlayerSettings(doc: Document, persistenceKey: string | undefined, settings: StoredPlayerSettings): void {
    if (!persistenceKey) {
        return;
    }

    const updatedEntries = dedupeByKey<StoredPlayerSettingsEntry>([
        {
            ...settings,
            k: persistenceKey,
            u: Date.now(),
        },
        ...(readValidatedCookie(doc, PLAYER_SETTINGS_COOKIE_NAME, StoredPlayerSettingsCookieSchema) ?? []),
    ]);

    writeCookie(doc, PLAYER_SETTINGS_COOKIE_NAME, JSON.stringify(updatedEntries));
}

function readStoredProgress(doc: Document): StoredProgressEntry[] {
    return readValidatedCookie(doc, PLAYER_PROGRESS_COOKIE_NAME, StoredProgressCookieSchema) ?? [];
}

function writeStoredProgress(doc: Document, entries: StoredProgressEntry[]): void {
    writeCookie(
        doc,
        PLAYER_PROGRESS_COOKIE_NAME,
        JSON.stringify(dedupeByKey(entries)),
    );
}

function findPreviewEntry(entries: PreviewTrackEntry[], time: number): PreviewTrackEntry | undefined {
    return entries.find((entry) => time >= entry.start && time < entry.end)
        ?? entries.find((entry) => Math.abs(entry.start - time) <= Math.max(entry.end - entry.start, 1));
}

function getBufferedEnd(video: HTMLVideoElement): number {
    try {
        const ranges = video.buffered;
        if (!ranges || ranges.length === 0) {
            return 0;
        }

        const currentTime = video.currentTime;
        let bestEnd = 0;

        for (let index = 0; index < ranges.length; index += 1) {
            const start = ranges.start(index);
            const end = ranges.end(index);

            if (currentTime >= start && currentTime <= end) {
                return end;
            }

            if (end > bestEnd) {
                bestEnd = end;
            }
        }

        return bestEnd;
    } catch {
        return 0;
    }
}

export function getVideoPlayerStyles(): string {
    return `
.${ROOT_CLASSNAME} {
  --spvp-bg-0: #050505;
  --spvp-bg-1: #141414;
  --spvp-text: #f8fafc;
  --spvp-muted: rgba(226, 232, 240, 0.78);
  --spvp-brand: #ff6a00;
  --spvp-brand-soft: rgba(255, 106, 0, 0.24);
  --spvp-track: rgba(255, 255, 255, 0.18);
  --spvp-buffer: rgba(255, 255, 255, 0.34);
  --spvp-shadow: 0 24px 80px rgba(2, 6, 23, 0.52);
  color: var(--spvp-text);
  width: 100%;
  height: 100%;
  min-height: 320px;
  position: relative;
  display: block;
  overflow: hidden;
  font-family: "Sora", "IBM Plex Sans", "Segoe UI", sans-serif;
  background: linear-gradient(180deg, var(--spvp-bg-0), var(--spvp-bg-1));
}
.${ROOT_CLASSNAME} *,
.${ROOT_CLASSNAME} *::before,
.${ROOT_CLASSNAME} *::after {
  box-sizing: border-box;
}
.${ROOT_CLASSNAME} .spvp-stage,
.${ROOT_CLASSNAME} .spvp-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.${ROOT_CLASSNAME} .spvp-stage {
  overflow: hidden;
}
.${ROOT_CLASSNAME} .spvp-ambient {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 1;
  transition: opacity 220ms ease;
  overflow: hidden;
}
.${ROOT_CLASSNAME}[data-ambient="off"] .spvp-ambient,
.${ROOT_CLASSNAME}[data-ambient="off"] .spvp-ambient {
  opacity: 0;
}
.${ROOT_CLASSNAME} .spvp-ambient-layer {
  position: absolute;
  inset: 0;
  opacity: 0;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  filter: blur(var(--spvp-ambient-blur, ${MAX_AMBIENT_BLUR_PX}px)) saturate(1.04);
  will-change: opacity;
  transition: opacity 1000ms linear;
}
.${ROOT_CLASSNAME} .spvp-ambient-side {
  position: absolute;
  display: block;
  width: 0;
  height: 0;
  transform-origin: center center;
  opacity: 1;
}
.${ROOT_CLASSNAME} .spvp-ambient-center {
  position: absolute;
  display: block;
  width: 0;
  height: 0;
  opacity: 1;
}
.${ROOT_CLASSNAME} .spvp-ambient-side[hidden] {
  display: none;
}
.${ROOT_CLASSNAME} .spvp-ambient-center[hidden] {
  display: none;
}
.${ROOT_CLASSNAME} .spvp-video {
  display: block;
  z-index: 2;
  background: transparent;
  object-fit: contain;
}
.${ROOT_CLASSNAME}[data-ambient="spatial"] .spvp-video {
  --spvp-spatial-mask-horizontal: linear-gradient(to right, black 0, black 100%);
  --spvp-spatial-mask-vertical: linear-gradient(to bottom, black 0, black 100%);
  -webkit-mask-repeat: no-repeat, no-repeat;
  -webkit-mask-size:
    var(--spvp-spatial-mask-width, 100%) var(--spvp-spatial-mask-height, 100%),
    var(--spvp-spatial-mask-width, 100%) var(--spvp-spatial-mask-height, 100%);
  -webkit-mask-position:
    var(--spvp-spatial-mask-left, 0px) var(--spvp-spatial-mask-top, 0px),
    var(--spvp-spatial-mask-left, 0px) var(--spvp-spatial-mask-top, 0px);
  -webkit-mask-image:
    var(--spvp-spatial-mask-horizontal),
    var(--spvp-spatial-mask-vertical);
  -webkit-mask-composite: source-in;
  mask-repeat: no-repeat, no-repeat;
  mask-size:
    var(--spvp-spatial-mask-width, 100%) var(--spvp-spatial-mask-height, 100%),
    var(--spvp-spatial-mask-width, 100%) var(--spvp-spatial-mask-height, 100%);
  mask-position:
    var(--spvp-spatial-mask-left, 0px) var(--spvp-spatial-mask-top, 0px),
    var(--spvp-spatial-mask-left, 0px) var(--spvp-spatial-mask-top, 0px);
  mask-image: var(--spvp-spatial-mask-horizontal), var(--spvp-spatial-mask-vertical);
  mask-composite: intersect;
}
.${ROOT_CLASSNAME} .spvp-noise {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  opacity: 0.07;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 3px 3px;
  mask-image: radial-gradient(circle at center, black, transparent 82%);
}
.${ROOT_CLASSNAME} .spvp-top-shade {
  position: absolute;
  inset: 0 0 auto;
  height: 140px;
  z-index: 3;
  pointer-events: none;
  background: linear-gradient(180deg in oklab, rgba(0, 0, 0, 0.58) 0%, rgba(0, 0, 0, 0.44) 18%, rgba(0, 0, 0, 0.24) 42%, rgba(0, 0, 0, 0.1) 68%, rgba(0, 0, 0, 0.03) 86%, transparent 100%);
  transition: opacity 180ms ease, visibility 0s linear 180ms;
  visibility: visible;
  will-change: opacity;
}
.${ROOT_CLASSNAME} .spvp-bottom-shade {
  position: absolute;
  inset: auto 0 0;
  height: 220px;
  z-index: 3;
  pointer-events: none;
  background: linear-gradient(180deg in oklab, transparent 0%, rgba(0, 0, 0, 0.03) 10%, rgba(0, 0, 0, 0.16) 26%, rgba(0, 0, 0, 0.38) 56%, rgba(0, 0, 0, 0.62) 82%, rgba(0, 0, 0, 0.78) 100%);
  transition: opacity 180ms ease, visibility 0s linear 180ms;
  visibility: visible;
  will-change: opacity;
}
.${ROOT_CLASSNAME} .spvp-header {
  position: absolute;
  top: max(16px, env(safe-area-inset-top));
  left: max(18px, env(safe-area-inset-left));
  right: max(18px, env(safe-area-inset-right));
  z-index: 4;
  pointer-events: auto;
  transition: opacity 180ms ease, visibility 0s linear 180ms;
  visibility: visible;
  will-change: opacity;
  user-select: text;
}
.${ROOT_CLASSNAME} .spvp-title {
  margin: 0;
  font-size: clamp(1rem, 2vw, 1.45rem);
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: 0.01em;
  text-shadow: 0 8px 28px rgba(0, 0, 0, 0.52);
  cursor: text;
  display: inline-block;
}
.${ROOT_CLASSNAME} .spvp-debug {
  position: absolute;
  top: max(18px, env(safe-area-inset-top));
  right: max(18px, env(safe-area-inset-right));
  z-index: 6;
  min-width: 164px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.52);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(18px);
  pointer-events: auto;
  transition: opacity 180ms ease, transform 180ms ease, visibility 0s linear 180ms;
  visibility: visible;
}
.${ROOT_CLASSNAME} .spvp-debug[hidden] {
  display: none;
}
.${ROOT_CLASSNAME} .spvp-debug-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.8rem;
  line-height: 1.35;
}
.${ROOT_CLASSNAME} .spvp-debug-row + .spvp-debug-row {
  margin-top: 6px;
}
.${ROOT_CLASSNAME} .spvp-debug-key {
  color: rgba(255, 255, 255, 0.56);
}
.${ROOT_CLASSNAME} .spvp-debug-value {
  color: rgba(255, 255, 255, 0.94);
}
.${ROOT_CLASSNAME} .spvp-slider-card {
  display: grid;
  gap: 16px;
  padding: 18px 12px 12px;
}
.${ROOT_CLASSNAME} .spvp-slider-card + .spvp-slider-card {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 8px;
}
.${ROOT_CLASSNAME} .spvp-slider-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.${ROOT_CLASSNAME} .spvp-slider-label {
  font-size: 1.28rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.96);
}
.${ROOT_CLASSNAME} .spvp-slider-value {
  font-size: 1.08rem;
  color: rgba(255, 255, 255, 0.62);
}
.${ROOT_CLASSNAME} .spvp-menu-range {
  width: 100%;
  margin: 0;
  height: 28px;
  display: block;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.${ROOT_CLASSNAME} .spvp-menu-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.28));
}
.${ROOT_CLASSNAME} .spvp-menu-range::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.28));
}
.${ROOT_CLASSNAME} .spvp-menu-range::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  margin-top: -7px;
  border: 0;
  background: var(--spvp-brand);
  box-shadow:
    0 3px 9px rgba(255, 106, 0, 0.14),
    0 0 18px 8px rgba(255, 106, 0, 0.1);
}
.${ROOT_CLASSNAME} .spvp-menu-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 0;
  background: var(--spvp-brand);
  box-shadow:
    0 3px 9px rgba(255, 106, 0, 0.14),
    0 0 18px 8px rgba(255, 106, 0, 0.1);
}
.${ROOT_CLASSNAME} .spvp-menu-range-labels {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.${ROOT_CLASSNAME} .spvp-menu-range-option {
  padding: 6px 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.52);
  font-size: 1.08rem;
  font-weight: 500;
  cursor: pointer;
  transition: color 160ms ease;
}
.${ROOT_CLASSNAME} .spvp-menu-range-option:hover,
.${ROOT_CLASSNAME} .spvp-menu-range-option:focus-visible {
  color: rgba(255, 255, 255, 0.92);
  outline: none;
}
.${ROOT_CLASSNAME} .spvp-menu-range-option[data-active="true"] {
  color: rgba(255, 255, 255, 0.96);
}
.${ROOT_CLASSNAME} .spvp-menu-range-option:nth-child(1) {
  text-align: left;
}
.${ROOT_CLASSNAME} .spvp-menu-range-option:nth-child(2) {
  text-align: center;
}
.${ROOT_CLASSNAME} .spvp-menu-range-option:nth-child(3) {
  text-align: right;
}
.${ROOT_CLASSNAME} .spvp-center-toast {
  position: absolute;
  inset: 50% auto auto 50%;
  z-index: 8;
  display: grid;
  place-items: center;
  transform: translate(-50%, -50%) scale(0.88);
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}
.${ROOT_CLASSNAME} .spvp-center-toast[data-visible="true"] {
  opacity: 1;
  visibility: visible;
}
.${ROOT_CLASSNAME} .spvp-center-toast svg {
  width: 72px;
  height: 72px;
  fill: #fff;
  filter:
    drop-shadow(0 14px 24px rgba(0, 0, 0, 0.34))
    drop-shadow(0 4px 12px rgba(0, 0, 0, 0.54));
}
.${ROOT_CLASSNAME} .spvp-top-toast {
  position: absolute;
  top: max(18px, calc(env(safe-area-inset-top) + 12px));
  left: 50%;
  z-index: 8;
  transform: translateX(-50%) translateY(-8px);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  font-size: 1.22rem;
  font-weight: 600;
  line-height: 1;
  color: rgba(255, 255, 255, 0.98);
  font-variant-numeric: tabular-nums;
  text-shadow:
    0 14px 24px rgba(0, 0, 0, 0.42),
    0 4px 12px rgba(0, 0, 0, 0.62);
  transition:
    opacity 180ms ease,
    transform 180ms ease,
    visibility 0s linear 180ms;
}
.${ROOT_CLASSNAME} .spvp-top-toast[data-visible="true"] {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
  transition-delay: 0s;
}
.${ROOT_CLASSNAME} .spvp-overlay {
  position: absolute;
  inset: auto 0 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding:
    0 max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
  transition: opacity 180ms ease, visibility 0s linear 180ms;
  visibility: visible;
  will-change: opacity;
}
.${ROOT_CLASSNAME}[data-idle="true"] .spvp-overlay,
.${ROOT_CLASSNAME}[data-idle="true"] .spvp-header,
.${ROOT_CLASSNAME}[data-idle="true"] .spvp-top-shade,
.${ROOT_CLASSNAME}[data-idle="true"] .spvp-bottom-shade {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}
.${ROOT_CLASSNAME}[data-idle="false"] .spvp-overlay,
.${ROOT_CLASSNAME}[data-idle="false"] .spvp-header,
.${ROOT_CLASSNAME}[data-idle="false"] .spvp-top-shade,
.${ROOT_CLASSNAME}[data-idle="false"] .spvp-bottom-shade {
  opacity: 1;
  visibility: visible;
  transition-delay: 0s;
}
.${ROOT_CLASSNAME} .spvp-progress-section {
  position: relative;
  display: grid;
  align-items: end;
  padding-top: 76px;
  z-index: 2;
}
.${ROOT_CLASSNAME} .spvp-progress-shell {
  position: relative;
  height: 22px;
}
.${ROOT_CLASSNAME} .spvp-progress-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 6px;
  border-radius: 999px;
  transform: translateY(-50%);
  background: var(--spvp-track);
  overflow: hidden;
}
.${ROOT_CLASSNAME} .spvp-progress-buffer,
.${ROOT_CLASSNAME} .spvp-progress-hover,
.${ROOT_CLASSNAME} .spvp-progress-played {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0;
  border-radius: inherit;
}
.${ROOT_CLASSNAME} .spvp-progress-buffer {
  background: var(--spvp-buffer);
}
.${ROOT_CLASSNAME} .spvp-progress-hover {
  background: rgba(255, 255, 255, 0.22);
  opacity: 0;
  transition: opacity 140ms ease;
}
.${ROOT_CLASSNAME} .spvp-progress-hover[data-visible="true"] {
  opacity: 1;
}
.${ROOT_CLASSNAME} .spvp-progress-played {
  background: var(--spvp-brand);
}
.${ROOT_CLASSNAME} .spvp-progress {
  position: absolute;
  inset: 0;
  width: 100%;
  margin: 0;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.${ROOT_CLASSNAME} .spvp-progress::-webkit-slider-runnable-track {
  height: 22px;
  background: transparent;
}
.${ROOT_CLASSNAME} .spvp-progress::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 22px;
  margin-top: 0;
  border-radius: 999px;
  background: transparent;
  border: none;
}
.${ROOT_CLASSNAME} .spvp-progress::-moz-range-track {
  height: 22px;
  background: transparent;
}
.${ROOT_CLASSNAME} .spvp-progress::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: transparent;
  border: none;
}
.${ROOT_CLASSNAME} .spvp-progress-handle {
  position: absolute;
  top: 50%;
  left: 0;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  transform: translate(-50%, -50%);
  background: var(--spvp-brand);
  box-shadow: 0 3px 9px rgba(255, 106, 0, 0.14);
  pointer-events: none;
  isolation: isolate;
}
.${ROOT_CLASSNAME} .spvp-progress-handle::before {
  content: "";
  position: absolute;
  inset: -13px;
  border-radius: 999px;
  background:
    radial-gradient(
      circle,
      rgba(255, 106, 0, 0.22) 0%,
      rgba(255, 106, 0, 0.14) 30%,
      rgba(255, 106, 0, 0.06) 56%,
      rgba(255, 106, 0, 0.015) 76%,
      rgba(255, 106, 0, 0) 100%
    );
  filter: blur(6px);
  z-index: -1;
}
.${ROOT_CLASSNAME} .spvp-current-time {
  display: none;
}
.${ROOT_CLASSNAME} .spvp-preview {
  position: absolute;
  left: 0;
  bottom: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 2;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 180ms ease,
    visibility 0s linear 180ms;
}
.${ROOT_CLASSNAME} .spvp-preview[data-visible="true"] {
  opacity: 1;
  visibility: visible;
  transition-delay: 60ms, 0s;
}
.${ROOT_CLASSNAME} .spvp-preview-frame {
  position: relative;
  width: 240px;
  aspect-ratio: 16 / 9;
  border-radius: 14px;
  overflow: visible;
  background: transparent;
  box-shadow:
    0 26px 48px rgba(0, 0, 0, 0.32),
    0 12px 22px rgba(0, 0, 0, 0.2);
}
.${ROOT_CLASSNAME} .spvp-preview-frame[data-has-image="false"] {
  display: none;
}
.${ROOT_CLASSNAME} .spvp-preview-glow,
.${ROOT_CLASSNAME} .spvp-preview-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  background-repeat: no-repeat;
  background-size: cover;
  background-position: center;
  border-radius: inherit;
}
.${ROOT_CLASSNAME} .spvp-preview-glow {
  inset: 10px;
  opacity: 0.28;
  filter: blur(9px) saturate(1.02) brightness(0.5);
  z-index: 0;
  transform: scale(1.02);
}
.${ROOT_CLASSNAME} .spvp-preview-image {
  z-index: 1;
  overflow: hidden;
  background-color: rgba(18, 18, 18, 0.24);
}
.${ROOT_CLASSNAME} .spvp-preview-time {
  position: relative;
  z-index: 4;
  font-size: 0.98rem;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.94);
  text-shadow: 0 8px 18px rgba(0, 0, 0, 0.52);
}
.${ROOT_CLASSNAME} .spvp-controls {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 18px;
  z-index: 1;
}
.${ROOT_CLASSNAME} .spvp-left,
.${ROOT_CLASSNAME} .spvp-right {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  min-width: 0;
}
.${ROOT_CLASSNAME} .spvp-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--spvp-text);
  cursor: pointer;
  transition: background-color 140ms ease, transform 140ms ease, opacity 140ms ease;
}
.${ROOT_CLASSNAME} .spvp-button:hover,
.${ROOT_CLASSNAME} .spvp-button:focus-visible {
  background: rgba(255, 255, 255, 0.08);
  outline: none;
}
.${ROOT_CLASSNAME} .spvp-button:active {
  transform: scale(0.97);
}
.${ROOT_CLASSNAME} .spvp-button svg {
  width: 28px;
  height: 28px;
  fill: currentColor;
}
.${ROOT_CLASSNAME} .spvp-button[data-kind="settings"] svg,
.${ROOT_CLASSNAME} .spvp-button[data-kind="pip"] svg,
.${ROOT_CLASSNAME} .spvp-button[data-kind="fullscreen"] svg {
  width: 26px;
  height: 26px;
}
.${ROOT_CLASSNAME} .spvp-button[data-kind="backward"],
.${ROOT_CLASSNAME} .spvp-button[data-kind="forward"] {
  width: 54px;
}
.${ROOT_CLASSNAME} .spvp-volume {
  --spvp-volume-slider-width: 96px;
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  z-index: 0;
}
.${ROOT_CLASSNAME} .spvp-volume-slider-shell {
  --spvp-volume-slider-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --spvp-volume-slider-duration: 350ms;
  display: flex;
  align-items: center;
  width: 0;
  height: 44px;
  min-width: 0;
  overflow: hidden;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  padding: 0;
  box-sizing: content-box;
  transition:
    width var(--spvp-volume-slider-duration) var(--spvp-volume-slider-ease),
    padding var(--spvp-volume-slider-duration) var(--spvp-volume-slider-ease),
    opacity var(--spvp-volume-slider-duration) var(--spvp-volume-slider-ease),
    visibility 0s linear var(--spvp-volume-slider-duration);
}
.${ROOT_CLASSNAME} .spvp-controls[data-volume-open="true"] .spvp-volume-slider-shell {
  width: calc(var(--spvp-volume-slider-width) + 4px);
  padding: 0 2px;
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition-delay: 0s, 0s, 0s, 0s;
}
.${ROOT_CLASSNAME} .spvp-time-toggle {
  min-width: 132px;
  display: inline-block;
  padding: 0 0 1px;
  border: none;
  background: transparent;
  color: rgba(248, 250, 252, 0.92);
  font-size: 0.98rem;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;
}
.${ROOT_CLASSNAME} .spvp-time-toggle:hover,
.${ROOT_CLASSNAME} .spvp-time-toggle:focus-visible {
  outline: none;
  color: rgba(255, 255, 255, 0.98);
}
.${ROOT_CLASSNAME} .spvp-time-primary {
  color: currentColor;
}
.${ROOT_CLASSNAME} .spvp-time-secondary {
  color: rgba(255, 255, 255, 0.58);
  white-space: break-spaces;
}
.${ROOT_CLASSNAME} .spvp-volume-range {
  width: var(--spvp-volume-slider-width);
  min-width: var(--spvp-volume-slider-width);
  -webkit-appearance: none;
  appearance: none;
  height: 44px;
  border-radius: 999px;
  background: transparent;
}
.${ROOT_CLASSNAME} .spvp-volume-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--spvp-text) 0 var(--spvp-volume, 100%), var(--spvp-track) var(--spvp-volume, 100%) 100%);
}
.${ROOT_CLASSNAME} .spvp-volume-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4px;
  border-radius: 999px;
  background: var(--spvp-text);
  border: none;
}
.${ROOT_CLASSNAME} .spvp-volume-range::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: var(--spvp-track);
}
.${ROOT_CLASSNAME} .spvp-volume-range::-moz-range-progress {
  height: 4px;
  border-radius: 999px;
  background: var(--spvp-text);
}
.${ROOT_CLASSNAME} .spvp-volume-range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--spvp-text);
  border: none;
}
.${ROOT_CLASSNAME} .spvp-menu {
  position: absolute;
  right: max(14px, env(safe-area-inset-right));
  bottom: calc(max(${SAFE_AREA_FALLBACK_PX}px, env(safe-area-inset-bottom)) + ${MENU_BOTTOM_OFFSET_PX}px);
  z-index: 7;
  display: flex;
  flex-direction: column;
  min-width: 330px;
  max-width: min(420px, calc(100% - 32px));
  max-height: calc(100% - max(${SAFE_AREA_FALLBACK_PX}px, env(safe-area-inset-top)) - max(${SAFE_AREA_FALLBACK_PX}px, env(safe-area-inset-bottom)) - ${MENU_BOTTOM_OFFSET_PX + MENU_VIEWPORT_MARGIN_PX}px);
  padding: 0 12px;
  border-radius: 24px;
  background: hsl(0deg 0% 10% / 90%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: var(--spvp-shadow);
  backdrop-filter: blur(18px);
  opacity: 0;
  transform: translateY(10px) scale(0.98);
  overflow: hidden;
  transition: opacity 180ms ease, transform 180ms ease, visibility 0s linear 180ms;
  visibility: hidden;
}
.${ROOT_CLASSNAME} .spvp-menu[hidden] {
  display: none;
}
.${ROOT_CLASSNAME} .spvp-menu[data-open="true"] {
  opacity: 1;
  transform: translateY(0) scale(1);
  visibility: visible;
  transition-delay: 0s;
}
.${ROOT_CLASSNAME} .spvp-menu-header {
  position: relative;
  flex: 0 0 auto;
  display: block;
  padding: 12px 0;
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 0;
}
.${ROOT_CLASSNAME} .spvp-menu-header[hidden] {
  display: none;
}
.${ROOT_CLASSNAME} .spvp-menu-back {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--spvp-text);
  cursor: pointer;
  text-align: left;
}
.${ROOT_CLASSNAME} .spvp-menu-back:hover,
.${ROOT_CLASSNAME} .spvp-menu-back:focus-visible {
  outline: none;
  background: rgba(255, 255, 255, 0.08);
}
.${ROOT_CLASSNAME} .spvp-menu-back[hidden] {
  display: none;
}
.${ROOT_CLASSNAME} .spvp-menu-back svg {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  fill: currentColor;
  display: block;
}
.${ROOT_CLASSNAME} .spvp-menu-back-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.${ROOT_CLASSNAME} .spvp-menu-header-title {
  font-size: 1.22rem;
  font-weight: 600;
  line-height: 1.2;
  color: rgba(255, 255, 255, 0.96);
}
.${ROOT_CLASSNAME} .spvp-menu-scroll {
  --spvp-menu-scroll-edge: 12px;
  flex: 1 1 auto;
  min-height: 0;
  box-sizing: border-box;
  padding: var(--spvp-menu-scroll-edge) 0;
  overflow-x: hidden;
  overflow-y: hidden;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 var(--spvp-menu-scroll-edge),
    #000 calc(100% - var(--spvp-menu-scroll-edge)),
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 var(--spvp-menu-scroll-edge),
    #000 calc(100% - var(--spvp-menu-scroll-edge)),
    transparent 100%
  );
}
.${ROOT_CLASSNAME} .spvp-menu-scroll::-webkit-scrollbar {
  display: none;
}
.${ROOT_CLASSNAME} .spvp-menu-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.${ROOT_CLASSNAME} .spvp-menu-list[data-animating="true"] {
  pointer-events: none;
}
.${ROOT_CLASSNAME} .spvp-menu-button {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--spvp-text);
  cursor: pointer;
  font-size: 1.18rem;
}
.${ROOT_CLASSNAME} .spvp-menu-button:hover,
.${ROOT_CLASSNAME} .spvp-menu-button:focus-visible {
  outline: none;
  background: rgba(255, 255, 255, 0.08);
}
.${ROOT_CLASSNAME} .spvp-menu-button[data-active="true"] {
  background: rgba(255, 106, 0, 0.12);
  color: #fff4ec;
}
.${ROOT_CLASSNAME} .spvp-menu-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.${ROOT_CLASSNAME} .spvp-menu-label {
  font-size: 1.18rem;
}
.${ROOT_CLASSNAME} .spvp-menu-value {
  font-size: 1rem;
  color: var(--spvp-muted);
}
.${ROOT_CLASSNAME} .spvp-menu-chevron {
  width: 24px;
  height: 24px;
  color: rgba(248, 250, 252, 0.72);
  fill: currentColor;
  flex: 0 0 auto;
}
.${ROOT_CLASSNAME} .spvp-menu-chevron svg {
  width: 100%;
  height: 100%;
  display: block;
  fill: currentColor;
}
.${ROOT_CLASSNAME} .spvp-menu-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--spvp-brand);
  opacity: 0;
}
.${ROOT_CLASSNAME} .spvp-menu-button[data-active="true"] .spvp-menu-dot {
  opacity: 1;
}
.${ROOT_CLASSNAME} .spvp-error {
  position: absolute;
  left: max(${SAFE_AREA_FALLBACK_PX}px, env(safe-area-inset-left));
  right: max(${SAFE_AREA_FALLBACK_PX}px, env(safe-area-inset-right));
  bottom: calc(max(${SAFE_AREA_FALLBACK_PX}px, env(safe-area-inset-bottom)) + 108px);
  z-index: 6;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(127, 29, 29, 0.82);
  border: 1px solid rgba(252, 165, 165, 0.24);
  color: #fee2e2;
  box-shadow: var(--spvp-shadow);
}
.${ROOT_CLASSNAME} .spvp-error[hidden] {
  display: none;
}
@media (max-width: 720px) {
  .${ROOT_CLASSNAME} {
    min-height: 240px;
  }
  .${ROOT_CLASSNAME} .spvp-progress-section {
    gap: 12px;
    padding-top: 72px;
  }
  .${ROOT_CLASSNAME} .spvp-controls {
    gap: 10px;
  }
  .${ROOT_CLASSNAME} .spvp-left,
  .${ROOT_CLASSNAME} .spvp-right {
    gap: 4px;
  }
  .${ROOT_CLASSNAME} .spvp-button {
    width: 40px;
    height: 40px;
  }
  .${ROOT_CLASSNAME} .spvp-button[data-kind="backward"],
  .${ROOT_CLASSNAME} .spvp-button[data-kind="forward"] {
    width: 46px;
  }
  .${ROOT_CLASSNAME} .spvp-volume {
    --spvp-volume-slider-width: 60px;
  }
  .${ROOT_CLASSNAME} .spvp-preview-frame {
    width: 180px;
  }
}
@media (max-width: 600px) {
  .${ROOT_CLASSNAME} .spvp-controls {
    gap: 8px;
  }
  .${ROOT_CLASSNAME} .spvp-left,
  .${ROOT_CLASSNAME} .spvp-right {
    gap: 2px;
  }
  .${ROOT_CLASSNAME} .spvp-button {
    width: 36px;
    height: 36px;
  }
  .${ROOT_CLASSNAME} .spvp-button[data-kind="backward"],
  .${ROOT_CLASSNAME} .spvp-button[data-kind="forward"] {
    width: 42px;
  }
  .${ROOT_CLASSNAME} .spvp-button svg {
    width: 24px;
    height: 24px;
  }
  .${ROOT_CLASSNAME} .spvp-button[data-kind="settings"] svg,
  .${ROOT_CLASSNAME} .spvp-button[data-kind="pip"] svg,
  .${ROOT_CLASSNAME} .spvp-button[data-kind="fullscreen"] svg {
    width: 22px;
    height: 22px;
  }
  .${ROOT_CLASSNAME} .spvp-volume {
    --spvp-volume-slider-width: 56px;
    gap: 3px;
  }
  .${ROOT_CLASSNAME} .spvp-time-toggle {
    min-width: 96px;
    font-size: 0.9rem;
  }
  .${ROOT_CLASSNAME} .spvp-time-secondary {
    white-space: nowrap;
  }
}
`;
}

export function getVideoPlayerMarkup(title: string, options: { embed?: boolean; fullViewport?: boolean } = {}): string {
    return `
  <div class="${ROOT_CLASSNAME}" data-embed="${options.embed ? 'true' : 'false'}" data-full-viewport="${options.fullViewport ? 'true' : 'false'}" data-idle="false">
  <div class="spvp-stage">
    <div class="spvp-ambient" aria-hidden="true"></div>
    <video class="spvp-video" playsinline preload="metadata"></video>
    <div class="spvp-noise" aria-hidden="true"></div>
    <div class="spvp-top-shade" aria-hidden="true"></div>
    <div class="spvp-bottom-shade" aria-hidden="true"></div>
    <div class="spvp-header">
      <h1 class="spvp-title">${escapeHtml(title)}</h1>
    </div>
    <div class="spvp-debug" hidden>
      <div class="spvp-debug-row"><span class="spvp-debug-key">Size</span><span class="spvp-debug-value" data-debug-size>--</span></div>
      <div class="spvp-debug-row"><span class="spvp-debug-key">Bitrate</span><span class="spvp-debug-value" data-debug-bitrate>--</span></div>
      <div class="spvp-debug-row"><span class="spvp-debug-key">FPS</span><span class="spvp-debug-value" data-debug-fps>--</span></div>
    </div>
    <div class="spvp-top-toast" data-visible="false" aria-hidden="true"></div>
    <div class="spvp-center-toast" data-visible="false" aria-hidden="true"></div>
    <div class="spvp-error" hidden></div>
    <div class="spvp-overlay">
      <spvp-control-bar></spvp-control-bar>
    </div>
    <spvp-settings-popup hidden></spvp-settings-popup>
  </div>
</div>
`;
}

function ensureStyleElement(doc: Document): void {
    if (doc.getElementById(STYLE_ELEMENT_ID)) {
        return;
    }

    const style = doc.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = getVideoPlayerStyles();
    doc.head.appendChild(style);
}

function getShakaRuntime(): ShakaRuntime | undefined {
    const globalShaka = (globalThis as { shaka?: ShakaRuntime }).shaka;
    return globalShaka ?? bundledShakaRuntime;
}

function getClientXFromEvent(event: Event): number | undefined {
    const eventWithClientX = event as Event & { clientX?: number; touches?: ArrayLike<{ clientX: number }> };
    if (typeof eventWithClientX.clientX === 'number' && Number.isFinite(eventWithClientX.clientX)) {
        return eventWithClientX.clientX;
    }

    const firstTouch = eventWithClientX.touches?.[0];
    if (firstTouch && typeof firstTouch.clientX === 'number' && Number.isFinite(firstTouch.clientX)) {
        return firstTouch.clientX;
    }

    return undefined;
}

function applyPreviewImage(
    previewFrame: HTMLElement,
    previewGlow: HTMLElement,
    previewImage: HTMLElement,
    previewEntry: PreviewTrackEntry,
): void {
    const columns = previewEntry.layoutColumns ?? 1;
    const rows = previewEntry.layoutRows ?? 1;
    const tileX = previewEntry.tileX ?? 0;
    const tileY = previewEntry.tileY ?? 0;
    const backgroundSize = `${columns * 100}% ${rows * 100}%`;
    const backgroundPosition = `${(tileX * 100) / Math.max(columns - 1, 1)}% ${(tileY * 100) / Math.max(rows - 1, 1)}%`;

    previewFrame.style.aspectRatio = previewEntry.tileWidth && previewEntry.tileHeight
        ? `${previewEntry.tileWidth} / ${previewEntry.tileHeight}`
        : '16 / 9';

    for (const node of [previewGlow, previewImage]) {
        node.style.backgroundImage = `url("${previewEntry.url.replace(/"/g, '\\"')}")`;
        node.style.backgroundSize = backgroundSize;
        node.style.backgroundPosition = backgroundPosition;
    }
}

function resetPreviewImage(previewFrame: HTMLElement, previewGlow: HTMLElement, previewImage: HTMLElement): void {
    previewFrame.style.aspectRatio = '16 / 9';
    for (const node of [previewGlow, previewImage]) {
        node.style.backgroundImage = '';
        node.style.backgroundSize = '';
        node.style.backgroundPosition = '';
    }
}

function eventIncludesMatchingElement(event: Event, selector: string): boolean {
    if (typeof event.composedPath !== 'function') {
        const target = event.target;
        return target instanceof Element ? Boolean(target.closest(selector)) : false;
    }

    return event.composedPath().some((node) => node instanceof Element && node.matches(selector));
}

function rewritePlayButtonIcon(playButton: HTMLButtonElement, paused: boolean, icon: (name: string) => string): void {
    playButton.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    playButton.innerHTML = icon(paused ? 'play' : 'pause');
}

function bootVideoPlayer(target: HTMLElement, options: VideoPlayerOptions): Promise<VideoPlayerHandle> {
    const doc = target.ownerDocument;
    const win = doc.defaultView;

    if (!win) {
        return Promise.reject(new Error('No window available for video player.'));
    }

    ensureStyleElement(doc);
    defineVideoPlayerCustomElements();
    target.innerHTML = getVideoPlayerMarkup(options.title, {
        embed: options.embed,
        fullViewport: options.fullViewport,
    });

    const createAmbientLayerElement = () => {
        const layer = doc.createElement('div');
        layer.className = 'spvp-ambient-layer';
        layer.dataset.active = 'false';
        layer.innerHTML = `
          <canvas class="spvp-ambient-side" data-side="top" hidden></canvas>
          <canvas class="spvp-ambient-side" data-side="right" hidden></canvas>
          <canvas class="spvp-ambient-side" data-side="bottom" hidden></canvas>
          <canvas class="spvp-ambient-side" data-side="left" hidden></canvas>
          <canvas class="spvp-ambient-center" hidden></canvas>
        `;
        return layer;
    };

    const root = target.querySelector<HTMLElement>(`.${ROOT_CLASSNAME}`);
    const stage = target.querySelector<HTMLElement>('.spvp-stage');
    const ambient = target.querySelector<HTMLElement>('.spvp-ambient');
    const video = target.querySelector<HTMLVideoElement>('.spvp-video');
    const controls = target.querySelector<SpvpControlBarElement>('spvp-control-bar');
    const errorBox = target.querySelector<HTMLElement>('.spvp-error');
    const debugBox = target.querySelector<HTMLElement>('.spvp-debug');
    const debugSize = target.querySelector<HTMLElement>('[data-debug-size]');
    const debugBitrate = target.querySelector<HTMLElement>('[data-debug-bitrate]');
    const debugFps = target.querySelector<HTMLElement>('[data-debug-fps]');
    const topToast = target.querySelector<HTMLElement>('.spvp-top-toast');
    const centerToast = target.querySelector<HTMLElement>('.spvp-center-toast');
    const menu = target.querySelector<SpvpSettingsPopupElement>('spvp-settings-popup');

    const {
        currentTimeBadge,
        forwardButton,
        fullscreenButton,
        muteButton,
        pipButton,
        playButton,
        preview,
        previewFrame,
        previewGlow,
        previewImage,
        previewTime,
        progressBuffer,
        progressHandle,
        progressHover,
        progressInput,
        progressPlayed,
        progressShell,
        rewindButton,
        settingsButton,
        timePrimary,
        timeSecondary,
        timeToggle,
        volumeRange,
    } = controls?.refs ?? {};

    const menuHeader = menu?.header;
    const menuBackButton = menu?.backButton;
    const menuHeaderTitle = menu?.headerTitle;
    const menuScroll = menu?.scrollContainer;
    const menuList = menu?.list;

    if (
        !root || !stage || !ambient || !video || !controls || !progressShell || !progressInput || !progressBuffer || !progressHover || !progressPlayed
        || !progressHandle || !currentTimeBadge || !preview || !previewFrame || !previewGlow || !previewImage
        || !previewTime || !timeToggle || !timePrimary || !timeSecondary || !errorBox || !debugBox || !debugSize || !debugBitrate || !debugFps || !topToast || !centerToast
        || !menu || !menuHeader || !menuBackButton || !menuHeaderTitle || !menuList || !menuScroll
        || !playButton || !rewindButton || !forwardButton || !muteButton
        || !volumeRange || !settingsButton || !pipButton || !fullscreenButton
    ) {
        return Promise.reject(new Error('Video player markup failed to initialize.'));
    }

    const cleanup: Array<() => void> = [];
    cleanup.push(() => {
        if (ambientOpacityTimer !== undefined) {
            win.clearInterval(ambientOpacityTimer);
        }
    });
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4];
    const shaka = getShakaRuntime();
    const storageKey = options.persistenceKey;
    root.dataset.menuOpen = 'false';
    const storedSettings = readStoredPlayerSettings(doc, storageKey);
    const isJsdomEnvironment = /\bjsdom\b/i.test(win.navigator.userAgent);
    const ambientFrameIntervalSeconds = Math.max(0.5, options.ambientFrameIntervalSeconds ?? DEFAULT_AMBIENT_FRAME_INTERVAL_SECONDS);
    const ambientBlendWindowSeconds = Math.max(ambientFrameIntervalSeconds, options.ambientBlendWindowSeconds ?? DEFAULT_AMBIENT_BLEND_WINDOW_SECONDS);
    const ambientFrameIntervalMs = ambientFrameIntervalSeconds * 1000;
    let destroyed = false;
    let idleTimer: number | undefined;
    let player: ShakaPlayerInstance | undefined;
    let previewTracksPromise: Promise<PreviewTrackEntry[]> | undefined;
    let previewTracks: PreviewTrackEntry[] | undefined;
    let previewHideTimer: number | undefined;
    let hoverPercent: number | null = null;
    let scrubPercent: number | null = null;
    let isScrubbing = false;
    let menuView: 'ambient' | 'quality' | 'root' | 'speed' = 'root';
    let timeDisplayMode: TimeDisplayMode = 'elapsed';
    let qualityMode: 'auto' | number = storedSettings.qualityMode ?? 'auto';
    let selectedQualityId = storedSettings.selectedQualityId ?? options.qualityOptions?.[0]?.id;
    let ambientLevel = clampAmbientLevel(storedSettings.ambientLevel ?? ambientModeToLevel(options.ambient ?? 'bright'));
    let ambientBlurPx = clampAmbientBlurPx(storedSettings.ambientBlurPx ?? options.ambientBlurPx ?? DEFAULT_AMBIENT_BLUR_PX);
    let ambientActualSource: AmbientSourceActual = ambientLevel <= 0.001 ? 'off' : 'unavailable';
    let ambientFrameQueue: AmbientQueueEntry[] = [];
    let ambientFrameQueueSerial = 0;
    let ambientRefreshInFlight = false;
    let ambientRefreshQueued = false;
    let ambientRefreshQueuedForce = false;
    let ambientRefreshQueuedNow = 0;
    let ambientIntersectionVisible = true;
    let ambientObserver: IntersectionObserver | undefined;
    let ambientOpacityTimer: number | undefined;
    let ambientFrameCanvas: HTMLCanvasElement | undefined;
    let ambientFrameContext: CanvasRenderingContext2D | null | undefined;
    let ambientProbeVideo: HTMLVideoElement | undefined;
    let ambientProbePlayer: ShakaPlayerInstance | undefined;
    let ambientProbeSourceType: 'manifest' | 'stream' | undefined;
    let ambientProbeSourceUrl: string | undefined;
    let debugEnabled = storedSettings.debugEnabled === true;
    let playbackFps: number | null = null;
    let frameCallbackId: number | undefined;
    let lastFrameSample: { frames: number; timestamp: number } | undefined;
    let menuHideTimer: number | undefined;
    let menuHeightRaf: number | undefined;
    let menuHeightSettledRaf: number | undefined;
    let menuHeightSettleTimer: number | undefined;
    let menuResizeObserver: ResizeObserver | undefined;
    let centerToastTimer: number | undefined;
    let topToastTimer: number | undefined;
    let seekDebounceTimer: number | undefined;
    let qualityTimeline: VideoQualitySample[] = [];
    let currentPlaybackQuality: ShakaMediaQualityInfo | undefined;
    let lastSavedProgressSecond = -1;
    let pendingResumeDisplayTime = 0;
    let pendingResumeDisplayDuration = 0;
    let pendingResumeSeekTime = 0;
    let pendingSeekTime: number | null = null;
    let currentSourceType: 'manifest' | 'stream' = options.manifestUrl ? 'manifest' : 'stream';
    let currentSourceUrl = options.manifestUrl ?? options.streamUrl;
    let volumeLevel = typeof storedSettings.volume === 'number' && Number.isFinite(storedSettings.volume)
        ? clamp(storedSettings.volume, 0, 10)
        : 1;
    let audioBoost: AudioBoostState | undefined;
    if (typeof storedSettings.muted === 'boolean') {
        video.muted = storedSettings.muted;
    }
    if (typeof storedSettings.playbackRate === 'number' && Number.isFinite(storedSettings.playbackRate)) {
        video.defaultPlaybackRate = storedSettings.playbackRate;
        video.playbackRate = storedSettings.playbackRate;
    }

    const setError = (message?: string) => {
        if (!message) {
            errorBox.hidden = true;
            errorBox.textContent = '';
            return;
        }

        errorBox.hidden = false;
        errorBox.textContent = message;
    };

    const setIdle = (idle: boolean) => {
        root.dataset.idle = idle ? 'true' : 'false';
    };

    const showActivity = () => {
        setIdle(false);
        if (idleTimer !== undefined) {
            win.clearTimeout(idleTimer);
        }

        idleTimer = win.setTimeout(() => {
            if (!video.paused) {
                setIdle(true);
            }
        }, 2200);
    };

    const setButtonContent = (button: HTMLButtonElement, kind: string) => {
        button.innerHTML = createIcon(kind);
    };

    const getVolumeIconName = (): string => {
        const effectiveVolume = video.muted ? 0 : volumeLevel;
        if (effectiveVolume <= 0) {
            return 'volume-off';
        }
        if (effectiveVolume > 1) {
            return 'volume-very-loud';
        }
        if (effectiveVolume < 0.5) {
            return 'volume-small';
        }
        return 'volume-big';
    };

    const updateMuteState = () => {
        const volume = video.muted ? 0 : Math.min(volumeLevel, 1);
        volumeRange.value = String(Math.round(volume * 100));
        volumeRange.style.setProperty('--spvp-volume', `${volumeRange.value}%`);
        muteButton.setAttribute('aria-label', video.muted || volumeLevel === 0 ? 'Unmute' : 'Mute');
        setButtonContent(muteButton, getVolumeIconName());
    };

    const syncSpatialVideoMaskGeometry = (geometry?: AmbientStageGeometry) => {
        if (ambientLevel <= 1) {
            video.style.removeProperty('--spvp-spatial-mask-left');
            video.style.removeProperty('--spvp-spatial-mask-top');
            video.style.removeProperty('--spvp-spatial-mask-width');
            video.style.removeProperty('--spvp-spatial-mask-height');
            video.style.removeProperty('--spvp-spatial-mask-horizontal');
            video.style.removeProperty('--spvp-spatial-mask-vertical');
            return;
        }

        const nextGeometry = geometry ?? getAmbientStageGeometry(stage, video);
        if (!nextGeometry) {
            return;
        }

        const topGap = Math.max(0, nextGeometry.videoTop);
        const bottomGap = Math.max(0, nextGeometry.stageHeight - (nextGeometry.videoTop + nextGeometry.videoHeight));
        const leftGap = Math.max(0, nextGeometry.videoLeft);
        const rightGap = Math.max(0, nextGeometry.stageWidth - (nextGeometry.videoLeft + nextGeometry.videoWidth));
        const hasVerticalPanels = topGap > 0 || bottomGap > 0;
        const hasHorizontalPanels = leftGap > 0 || rightGap > 0;
        const fadePx = getSpatialEdgeFadePx(ambientLevel);
        const horizontalMask = getSmoothSpatialMaskGradient('x', hasHorizontalPanels, fadePx);
        const verticalMask = getSmoothSpatialMaskGradient('y', hasVerticalPanels, fadePx);

        video.style.setProperty('--spvp-spatial-mask-left', `${Math.max(0, nextGeometry.videoLeft)}px`);
        video.style.setProperty('--spvp-spatial-mask-top', `${Math.max(0, nextGeometry.videoTop)}px`);
        video.style.setProperty('--spvp-spatial-mask-width', `${Math.max(1, nextGeometry.videoWidth)}px`);
        video.style.setProperty('--spvp-spatial-mask-height', `${Math.max(1, nextGeometry.videoHeight)}px`);
        video.style.setProperty('--spvp-spatial-mask-horizontal', horizontalMask);
        video.style.setProperty('--spvp-spatial-mask-vertical', verticalMask);
    };

    const updatePipState = () => {
        const documentWithPip = doc as Document & {
            pictureInPictureElement?: Element | null;
        };
        setButtonContent(pipButton, documentWithPip.pictureInPictureElement ? 'pip-exit' : 'pip-enter');
    };

    const updateFullscreenState = () => {
        setButtonContent(fullscreenButton, doc.fullscreenElement ? 'fullscreen-exit' : 'fullscreen-enter');
    };

    const syncAmbientUiState = () => {
        root.dataset.ambient = getAmbientStageLabel(ambientLevel);
        ambient.style.opacity = String(getAmbientBrightnessScale(ambientLevel));
        root.style.setProperty('--spvp-ambient-blur', `${ambientBlurPx}px`);
        syncSpatialVideoMaskGeometry();
    };

    const persistSettings = () => {
        writeStoredPlayerSettings(doc, storageKey, {
            ambientBlurPx,
            ambientLevel,
            debugEnabled,
            muted: video.muted,
            playbackRate: video.playbackRate,
            qualityMode,
            selectedQualityId,
            volume: volumeLevel,
        });
    };

    const persistProgress = (force = false) => {
        if (!storageKey) {
            return;
        }

        const currentTime = Number.isFinite(video.currentTime) ? Math.max(0, Math.floor(video.currentTime)) : 0;
        const duration = Number.isFinite(video.duration) && video.duration > 0
            ? Math.floor(video.duration)
            : undefined;
        if (pendingResumeSeekTime > 0 && currentTime <= 0) {
            return;
        }
        if (!force && currentTime > 0 && Math.abs(currentTime - lastSavedProgressSecond) < PROGRESS_SAVE_INTERVAL_SECONDS) {
            return;
        }

        lastSavedProgressSecond = currentTime;
        writeStoredProgress(doc, [
            {
                d: duration,
                k: storageKey,
                t: currentTime,
                u: Date.now(),
            },
            ...readStoredProgress(doc),
        ]);
    };

    const getSavedProgressEntry = (): StoredProgressEntry | undefined => {
        if (!storageKey) {
            return undefined;
        }

        return readStoredProgress(doc).find((entry) => entry.k === storageKey);
    };

    const savedProgressEntry = getSavedProgressEntry();
    pendingResumeDisplayTime = savedProgressEntry?.t ?? 0;
    pendingResumeDisplayDuration = savedProgressEntry?.d ?? 0;
    pendingResumeSeekTime = savedProgressEntry?.t ?? 0;

    const maybeApplyPendingResumeSeek = () => {
        if (!(pendingResumeSeekTime > 0)) {
            return;
        }

        const duration = Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : pendingResumeDisplayDuration;
        const maxTime = duration > 0 ? Math.max(0, duration - 0.05) : pendingResumeSeekTime;
        const targetTime = clamp(pendingResumeSeekTime, 0, maxTime);
        const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;

        if (Math.abs(currentTime - targetTime) <= 0.25) {
            return;
        }

        try {
            video.currentTime = targetTime;
        } catch {
            return;
        }
    };

    const pushVideoQualitySample = (mediaQuality: ShakaMediaQualityInfo, position: number) => {
        if (mediaQuality.contentType === 'audio' || !Number.isFinite(position)) {
            return;
        }

        qualityTimeline = [
            ...qualityTimeline.filter((sample) => sample.position !== position),
            {
                mediaQuality,
                position,
            },
        ].sort((left, right) => left.position - right.position);
    };

    const getVideoQualityForTime = (time: number): ShakaMediaQualityInfo | undefined => {
        const currentTime = Number.isFinite(time) ? time : 0;

        for (let index = qualityTimeline.length - 1; index >= 0; index -= 1) {
            const sample = qualityTimeline[index];
            if (sample.position <= currentTime + 0.05) {
                return sample.mediaQuality;
            }
        }

        return undefined;
    };

    const syncCurrentPlaybackQuality = () => {
        const nextPlaybackQuality = getVideoQualityForTime(video.currentTime);
        if (nextPlaybackQuality) {
            currentPlaybackQuality = nextPlaybackQuality;
            return;
        }

        if (qualityTimeline.length === 0) {
            currentPlaybackQuality = undefined;
        }
    };

    const updateDebugOverlay = () => {
        debugBox.hidden = !debugEnabled;
        syncAmbientUiState();
        if (!debugEnabled) {
            return;
        }

        const activeTrack = getActiveVariantTrack();
        const summary = getTrackDebugSummary(
            activeTrack,
            video,
            currentPlaybackQuality,
            qualityTimeline.length === 0 ? player?.getStats?.() : undefined,
        );
        debugSize.textContent = summary.size;
        debugBitrate.textContent = summary.bitrate;
        debugFps.textContent = playbackFps === null ? '--' : playbackFps.toFixed(1);
    };

    const applyAmbientSettingsChange = (previousLevel: number) => {
        ambientLevel = clampAmbientLevel(ambientLevel);
        ambientBlurPx = clampAmbientBlurPx(ambientBlurPx);
        persistSettings();
        syncAmbientUiState();

        if (ambientLevel <= 0.001) {
            hideAmbientVisual('off');
            return;
        }

        const previousStage = getAmbientStageLabel(previousLevel);
        const nextStage = getAmbientStageLabel(ambientLevel);
        if (previousLevel <= 0.001 || previousStage === 'off' || ambientFrameQueue.length === 0 || ambientActualSource !== 'video') {
            void refreshAmbient(true);
            return;
        }

        if (previousStage !== nextStage) {
            void refreshAmbient(true);
            return;
        }

        syncAmbientQueueLayers(win.performance.now());
        updateDebugOverlay();
    };

    const syncMenuHeight = () => {
        const menuStyles = win.getComputedStyle(menu);
        const menuHeaderStyles = win.getComputedStyle(menuHeader);
        const menuScrollStyles = win.getComputedStyle(menuScroll);
        const menuListStyles = win.getComputedStyle(menuList);
        menu.style.height = 'auto';
        menuScroll.style.flex = '0 0 auto';
        menuScroll.style.maxHeight = '';
        menuScroll.style.overflowY = 'hidden';
        const paddingTop = Number.parseFloat(menuStyles.paddingTop) || 0;
        const paddingBottom = Number.parseFloat(menuStyles.paddingBottom) || 0;
        const borderTop = Number.parseFloat(menuStyles.borderTopWidth) || 0;
        const borderBottom = Number.parseFloat(menuStyles.borderBottomWidth) || 0;
        const headerMarginBottom = menuHeader.hidden ? 0 : (Number.parseFloat(menuHeaderStyles.marginBottom) || 0);
        const scrollPaddingTop = Number.parseFloat(menuScrollStyles.paddingTop) || 0;
        const scrollPaddingBottom = Number.parseFloat(menuScrollStyles.paddingBottom) || 0;
        const listGap = Number.parseFloat(menuListStyles.rowGap || menuListStyles.gap) || 0;
        const listChildren = Array.from(menuList.children) as HTMLElement[];
        const listChildrenHeight = listChildren.reduce((sum, child) => {
            const childHeight = child.offsetHeight || child.scrollHeight || child.getBoundingClientRect().height || 0;
            return sum + childHeight;
        }, 0);
        const listBodyHeight = Math.ceil(
            scrollPaddingTop
            + listChildrenHeight
            + Math.max(0, listChildren.length - 1) * listGap
            + scrollPaddingBottom,
        );
        const listScrollHeight = Math.ceil((menuList.scrollHeight || 0) + scrollPaddingTop + scrollPaddingBottom);
        const contentBodyHeight = Math.max(listBodyHeight, listScrollHeight);
        const headerHeight = menuHeader.hidden
            ? 0
            : (menuHeader.offsetHeight || menuHeader.scrollHeight || menuHeader.getBoundingClientRect().height);
        const fallbackHeight = Math.ceil(
            paddingTop
            + headerHeight
            + headerMarginBottom
            + contentBodyHeight
            + paddingBottom
            + borderTop
            + borderBottom,
        );
        const naturalMenuHeight = Math.ceil(menu.scrollHeight || fallbackHeight);
        const rootRect = root.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        const viewportHeight = Math.floor(
            rootRect.height
            || stageRect.height
            || root.clientHeight
            || stage.clientHeight
            || win.innerHeight,
        );
        const safeTopInset = SAFE_AREA_FALLBACK_PX;
        const safeBottomInset = SAFE_AREA_FALLBACK_PX;
        const menuBottomOffset = safeBottomInset + MENU_BOTTOM_OFFSET_PX;
        const availableHeight = Math.max(240, viewportHeight - safeTopInset - menuBottomOffset - MENU_VIEWPORT_MARGIN_PX);
        const contentHeight = Math.max(fallbackHeight, naturalMenuHeight);
        const nextHeight = Math.min(contentHeight, availableHeight);
        const availableBodyHeight = Math.max(
            80,
            nextHeight
            - paddingTop
            - paddingBottom
            - borderTop
            - borderBottom
            - headerHeight
            - headerMarginBottom,
        );
        const needsScroll = contentHeight > availableHeight + 1;
        menu.style.overflowY = 'hidden';
        menuScroll.style.flex = needsScroll ? '1 1 auto' : '0 0 auto';
        menuScroll.style.overflowY = needsScroll ? 'auto' : 'hidden';
        menuScroll.style.maxHeight = needsScroll ? `${availableBodyHeight}px` : '';
        menu.style.height = `${nextHeight}px`;
        if (!needsScroll) {
            menuScroll.scrollTop = 0;
        }
    };

    const cancelScheduledMenuHeightSync = () => {
        if (menuHeightRaf !== undefined) {
            win.cancelAnimationFrame(menuHeightRaf);
            menuHeightRaf = undefined;
        }
        if (menuHeightSettledRaf !== undefined) {
            win.cancelAnimationFrame(menuHeightSettledRaf);
            menuHeightSettledRaf = undefined;
        }
        if (menuHeightSettleTimer !== undefined) {
            win.clearTimeout(menuHeightSettleTimer);
            menuHeightSettleTimer = undefined;
        }
    };

    const scheduleMenuHeightSync = () => {
        cancelScheduledMenuHeightSync();
        menuHeightRaf = win.requestAnimationFrame(() => {
            menuHeightRaf = undefined;
            if (menu.hidden) {
                return;
            }
            syncMenuHeight();
            menuHeightSettledRaf = win.requestAnimationFrame(() => {
                menuHeightSettledRaf = undefined;
                if (!menu.hidden) {
                    syncMenuHeight();
                }
            });
        });
    };

    const scheduleMenuHeightSyncAfterFontsReady = () => {
        const fonts = doc.fonts;
        if (!fonts?.ready) {
            return;
        }

        void fonts.ready.then(() => {
            if (!menu.hidden) {
                syncMenuHeight();
                scheduleMenuHeightSync();
            }
        }).catch(() => undefined);
    };

    const scheduleMenuHeightResettle = () => {
        if (menuHeightSettleTimer !== undefined) {
            win.clearTimeout(menuHeightSettleTimer);
        }

        menuHeightSettleTimer = win.setTimeout(() => {
            menuHeightSettleTimer = undefined;
            if (!menu.hidden) {
                syncMenuHeight();
                scheduleMenuHeightSyncAfterFontsReady();
            }
        }, 220);
    };

    const animateMenuList = (direction: -1 | 0 | 1) => {
        if (typeof menuList.animate !== 'function') {
            return;
        }

        menuList.dataset.animating = 'true';
        menuList.animate(
            [
                { opacity: 0, transform: `translateX(${direction * 12}px)` },
                { opacity: 1, transform: 'translateX(0)' },
            ],
            {
                duration: 170,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'both',
            },
        ).finished
            .catch(() => undefined)
            .finally(() => {
                delete menuList.dataset.animating;
            });
    };

    if ('ResizeObserver' in win) {
        menuResizeObserver = new ResizeObserver(() => {
            if (!menu.hidden) {
                scheduleMenuHeightSync();
            }
        });
        menuResizeObserver.observe(menuHeader);
        menuResizeObserver.observe(menuList);
    }

    const showCenterToast = (iconName: string) => {
        if (centerToastTimer !== undefined) {
            win.clearTimeout(centerToastTimer);
        }

        centerToast.innerHTML = createIcon(iconName);
        centerToast.dataset.visible = 'true';
        if (typeof centerToast.animate === 'function') {
            centerToast.animate(
                [
                    { opacity: 0, transform: 'translate(-50%, -50%) scale(0.86)' },
                    { opacity: 1, transform: 'translate(-50%, -50%) scale(1.08)' },
                    { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
                    { opacity: 0, transform: 'translate(-50%, -50%) scale(1.02)' },
                ],
                {
                    duration: 900,
                    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    fill: 'both',
                },
            );
        }
        centerToastTimer = win.setTimeout(() => {
            centerToast.dataset.visible = 'false';
        }, 900);
    };

    const showTopToast = (label: string) => {
        if (topToastTimer !== undefined) {
            win.clearTimeout(topToastTimer);
        }

        topToast.textContent = label;
        topToast.dataset.visible = 'true';
        topToastTimer = win.setTimeout(() => {
            topToast.dataset.visible = 'false';
        }, 900);
    };

    const ensureAudioBoost = (): AudioBoostState | undefined => {
        if (audioBoost) {
            return audioBoost;
        }

        const AudioContextCtor = win.AudioContext ?? (win as typeof window & {
            webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;

        if (!AudioContextCtor) {
            return undefined;
        }

        try {
            const context = new AudioContextCtor();
            const sourceNode = context.createMediaElementSource(video);
            const gainNode = context.createGain();
            sourceNode.connect(gainNode);
            gainNode.connect(context.destination);
            audioBoost = {
                context,
                gainNode,
                sourceNode,
            };
            return audioBoost;
        } catch {
            return undefined;
        }
    };

    const syncBoostState = () => {
        const boostState = volumeLevel > 1 ? ensureAudioBoost() : audioBoost;
        const audibleLevel = video.muted ? 0 : volumeLevel;
        video.volume = clamp(audibleLevel, 0, 1);

        if (!boostState) {
            return;
        }

        boostState.gainNode.gain.value = audibleLevel > 1 ? audibleLevel : 1;
        if (audibleLevel > 1 && boostState.context.state === 'suspended') {
            void boostState.context.resume().catch(() => undefined);
        }
    };

    const applyVolumeLevel = (nextLevel: number, optionsValue: { persist?: boolean } = {}) => {
        volumeLevel = clamp(nextLevel, 0, 10);
        syncBoostState();
        updateMuteState();
        if (optionsValue.persist) {
            persistSettings();
        }
    };

    const resumeAudioBoost = () => {
        if (volumeLevel <= 1) {
            return;
        }

        const boostState = ensureAudioBoost();
        if (boostState?.context.state === 'suspended') {
            void boostState.context.resume().catch(() => undefined);
        }
    };

    const updateProgress = () => {
        const duration = Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : pendingResumeDisplayDuration;
        const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
        const displayCurrentTime = pendingSeekTime
            ?? (currentTime > 0 ? currentTime : pendingResumeDisplayTime);
        const playedPercent = duration > 0 ? clamp((displayCurrentTime / duration) * 100, 0, 100) : 0;
        const visualPlayedPercent = scrubPercent ?? playedPercent;
        const bufferedPercent = duration > 0 ? clamp((getBufferedEnd(video) / duration) * 100, playedPercent, 100) : 0;
        const progressValue = Math.round((visualPlayedPercent / 100) * 1000);

        progressInput.value = String(progressValue);
        progressPlayed.style.width = `${visualPlayedPercent}%`;
        progressBuffer.style.width = `${bufferedPercent}%`;
        if (hoverPercent !== null) {
            progressHover.style.width = `${hoverPercent}%`;
        }
        progressHover.dataset.visible = hoverPercent === null ? 'false' : 'true';
        progressHandle.style.left = `${visualPlayedPercent}%`;
        currentTimeBadge.textContent = formatTime(displayCurrentTime);
        currentTimeBadge.dataset.hidden = 'true';
        currentTimeBadge.dataset.overlap = 'false';
        const timeDisplay = renderTimeDisplay(timeDisplayMode, displayCurrentTime, duration);
        timePrimary.textContent = timeDisplay.primary;
        timeSecondary.textContent = timeDisplay.secondary;
    };

    const clearTimelineHover = () => {
        hoverPercent = null;
        updateProgress();
        hidePreview();
    };

    const applySeek = (time: number) => {
        if (!Number.isFinite(time)) {
            return;
        }

        pendingSeekTime = null;
        pendingResumeSeekTime = 0;
        pendingResumeDisplayTime = 0;
        video.currentTime = time;
        updateProgress();
    };

    const scheduleSeek = (time: number) => {
        pendingSeekTime = time;
        updateProgress();

        if (seekDebounceTimer !== undefined) {
            win.clearTimeout(seekDebounceTimer);
        }

        seekDebounceTimer = win.setTimeout(() => {
            seekDebounceTimer = undefined;
            applySeek(time);
        }, SEEK_DEBOUNCE_MS);
    };

    const flushPendingSeek = () => {
        if (seekDebounceTimer !== undefined) {
            win.clearTimeout(seekDebounceTimer);
            seekDebounceTimer = undefined;
        }

        if (pendingSeekTime !== null) {
            applySeek(pendingSeekTime);
        }
    };

    const getTimelineRatioFromClientX = (clientX: number) => {
        const rect = progressInput.getBoundingClientRect();
        return clamp((clientX - rect.left) / rect.width, 0, 1);
    };

    const updateScrubPercent = (clientX: number) => {
        scrubPercent = getTimelineRatioFromClientX(clientX) * 100;
        updateProgress();
    };

    cleanup.push(() => {
        cancelScheduledMenuHeightSync();
        menuResizeObserver?.disconnect();
        if (seekDebounceTimer !== undefined) {
            win.clearTimeout(seekDebounceTimer);
            seekDebounceTimer = undefined;
        }
        if (topToastTimer !== undefined) {
            win.clearTimeout(topToastTimer);
            topToastTimer = undefined;
        }
        if (centerToastTimer !== undefined) {
            win.clearTimeout(centerToastTimer);
            centerToastTimer = undefined;
        }
        if (previewHideTimer !== undefined) {
            win.clearTimeout(previewHideTimer);
            previewHideTimer = undefined;
        }
        if (audioBoost) {
            audioBoost.sourceNode.disconnect?.();
            audioBoost.gainNode.disconnect?.();
            const closeResult = audioBoost.context.close?.();
            if (closeResult && typeof closeResult.catch === 'function') {
                void closeResult.catch(() => undefined);
            }
            audioBoost = undefined;
        }
    });

    const closeMenu = () => {
        cancelScheduledMenuHeightSync();
        menuView = 'root';
        settingsButton.dataset.open = 'false';
        root.dataset.menuOpen = 'false';
        menu.dataset.open = 'false';
        if (menuHideTimer !== undefined) {
            win.clearTimeout(menuHideTimer);
        }
        menuHideTimer = win.setTimeout(() => {
            menu.hidden = true;
            menu.style.height = '';
            menuScroll.style.maxHeight = '';
            menuScroll.style.overflowY = 'hidden';
            renderMenu();
        }, 180);
    };

    const getSpeedLabel = (rate = video.playbackRate || 1): string => `${rate}x`;

    const getVariantTracks = (): ShakaVariantTrack[] => dedupeVariantTracks(player?.getVariantTracks?.() ?? []);

    const getActiveVariantTrack = (): ShakaVariantTrack | undefined => {
        const tracks = getVariantTracks();
        return tracks.find((track) => track.active) ?? tracks[0];
    };

    const getCurrentQualityLabel = (): string | null => {
        if (options.qualityOptions?.length) {
            return options.qualityOptions.find((option) => option.id === selectedQualityId)?.label ?? null;
        }

        const tracks = getVariantTracks();
        if (tracks.length < 2) {
            return null;
        }

        if (qualityMode === 'auto') {
            const activeTrack = getActiveVariantTrack();
            if (!activeTrack) {
                return 'Auto';
            }

            const { primary, secondary } = describeVariantTrack(activeTrack);
            return secondary ? `Auto (${primary} · ${secondary})` : `Auto (${primary})`;
        }

        const activeTrack = tracks.find((track) => track.id === qualityMode);
        if (!activeTrack) {
            return 'Auto';
        }

        const { primary, secondary } = describeVariantTrack(activeTrack);
        return secondary ? `${primary} · ${secondary}` : primary;
    };

    const getAmbientMenuLabel = (): string => getAmbientSummaryLabel(ambientLevel);

    const syncAmbientMenuControls = () => {
        const roundedAmbientValue = Math.round(clampAmbientLevel(ambientLevel) * 100);
        const roundedBlurValue = Math.round(clampAmbientBlurPx(ambientBlurPx));
        const ambientRange = menuList.querySelector<HTMLInputElement>('[data-ambient-level-range="true"]');
        const blurRange = menuList.querySelector<HTMLInputElement>('[data-ambient-blur-range="true"]');
        const ambientValueNode = menuList.querySelector<HTMLElement>('[data-ambient-level-value]');
        const blurValueNode = menuList.querySelector<HTMLElement>('[data-ambient-blur-value]');

        if (ambientRange) {
            ambientRange.value = String(roundedAmbientValue);
        }
        if (blurRange) {
            blurRange.value = String(roundedBlurValue);
        }
        if (ambientValueNode) {
            ambientValueNode.textContent = getAmbientSummaryLabel(ambientLevel);
        }
        if (blurValueNode) {
            blurValueNode.textContent = `${roundedBlurValue}px`;
        }

        menuList.querySelectorAll<HTMLButtonElement>('[data-ambient-preset]').forEach((button) => {
            const presetValue = Number(button.dataset.ambientPreset);
            button.dataset.active = presetValue === roundedAmbientValue ? 'true' : 'false';
        });
    };

    const getMenuTitle = (): string => {
        if (menuView === 'ambient') {
            return 'Ambient';
        }
        if (menuView === 'quality') {
            return 'Quality';
        }
        if (menuView === 'speed') {
            return 'Playback speed';
        }
        return 'Settings';
    };

    const renderMenu = () => {
        const qualityLabel = getCurrentQualityLabel();
        menuBackButton.hidden = menuView === 'root';
        menuHeader.hidden = menuView === 'root';
        menuHeaderTitle.textContent = getMenuTitle();

        if (menuView === 'root') {
            menuList.innerHTML = [
                qualityLabel
                    ? `
                <button class="spvp-menu-button" type="button" data-menu-view="quality" aria-label="Open quality settings">
                  <span class="spvp-menu-copy">
                    <span class="spvp-menu-label">Quality</span>
                    <span class="spvp-menu-value">${escapeHtml(qualityLabel)}</span>
                  </span>
                  <span class="spvp-menu-chevron" aria-hidden="true">${createIcon('menu-forward')}</span>
                </button>`
                    : '',
                `
                <button class="spvp-menu-button" type="button" data-menu-view="speed" aria-label="Open playback speed settings">
                  <span class="spvp-menu-copy">
                    <span class="spvp-menu-label">Playback speed</span>
                    <span class="spvp-menu-value">${escapeHtml(getSpeedLabel())}</span>
                  </span>
                  <span class="spvp-menu-chevron" aria-hidden="true">${createIcon('menu-forward')}</span>
                </button>`,
                `
                <button class="spvp-menu-button" type="button" data-menu-view="ambient" aria-label="Open ambient settings">
                  <span class="spvp-menu-copy">
                    <span class="spvp-menu-label">Ambient</span>
                    <span class="spvp-menu-value">${escapeHtml(getAmbientMenuLabel())}</span>
                  </span>
                  <span class="spvp-menu-chevron" aria-hidden="true">${createIcon('menu-forward')}</span>
                </button>`,
                `
                <button class="spvp-menu-button" type="button" data-toggle-debug="true" data-active="${debugEnabled ? 'true' : 'false'}" aria-label="Toggle debug overlay">
                  <span class="spvp-menu-copy">
                    <span class="spvp-menu-label">Debug</span>
                    <span class="spvp-menu-value">${debugEnabled ? 'On' : 'Off'}</span>
                  </span>
                  <span class="spvp-menu-dot" aria-hidden="true"></span>
                </button>`,
            ].filter(Boolean).join('');
            return;
        }

        if (menuView === 'ambient') {
            const ambientSliderValue = Math.round(clampAmbientLevel(ambientLevel) * 100);
            const blurSliderValue = Math.round(clampAmbientBlurPx(ambientBlurPx));
            const ambientStage = getAmbientStageLabel(ambientLevel);
            menuList.innerHTML = `
                <div class="spvp-slider-card">
                  <div class="spvp-slider-copy">
                    <span class="spvp-slider-label">Ambient</span>
                    <span class="spvp-slider-value" data-ambient-level-value>${escapeHtml(getAmbientSummaryLabel(ambientLevel))}</span>
                  </div>
                  <input
                    class="spvp-menu-range"
                    type="range"
                    min="0"
                    max="200"
                    step="1"
                    value="${ambientSliderValue}"
                    data-ambient-level-range="true"
                    aria-label="Ambient level"
                  />
                  <div class="spvp-menu-range-labels">
                    <button class="spvp-menu-range-option" type="button" data-ambient-preset="0" data-active="${ambientStage === 'off' ? 'true' : 'false'}">Off</button>
                    <button class="spvp-menu-range-option" type="button" data-ambient-preset="100" data-active="${ambientStage === 'bright' ? 'true' : 'false'}">Bright</button>
                    <button class="spvp-menu-range-option" type="button" data-ambient-preset="200" data-active="${ambientStage === 'spatial' ? 'true' : 'false'}">Spatial</button>
                  </div>
                </div>
                <div class="spvp-slider-card">
                  <div class="spvp-slider-copy">
                    <span class="spvp-slider-label">Blur</span>
                    <span class="spvp-slider-value" data-ambient-blur-value>${blurSliderValue}px</span>
                  </div>
                  <input
                    class="spvp-menu-range"
                    type="range"
                    min="0"
                    max="${MAX_AMBIENT_BLUR_PX}"
                    step="1"
                    value="${blurSliderValue}"
                    data-ambient-blur-range="true"
                    aria-label="Ambient blur"
                  />
                </div>
            `;
            return;
        }

        if (menuView === 'speed') {
            menuList.innerHTML = speeds.map((speed) => `
                <button class="spvp-menu-button" type="button" data-rate="${speed}" data-active="${speed === (video.playbackRate || 1) ? 'true' : 'false'}" aria-label="Set speed to ${speed}x">
                  <span>${speed}x</span>
                  <span class="spvp-menu-dot" aria-hidden="true"></span>
                </button>
            `).join('');
            return;
        }

        if (options.qualityOptions?.length) {
            menuList.innerHTML = options.qualityOptions.map((option) => `
                <button class="spvp-menu-button" type="button" data-quality-option-id="${escapeHtml(option.id)}" data-active="${selectedQualityId === option.id ? 'true' : 'false'}" aria-label="Select ${escapeHtml(option.label)} quality">
                  <span>${escapeHtml(option.label)}</span>
                  <span class="spvp-menu-dot" aria-hidden="true"></span>
                </button>
            `).join('');
            return;
        }

        const tracks = getVariantTracks();
        if (tracks.length < 2) {
            menuView = 'root';
            renderMenu();
            return;
        }

        menuList.innerHTML = [
            (() => {
                const activeTrack = getActiveVariantTrack();
                const autoValue = activeTrack
                    ? (() => {
                        const { primary, secondary } = describeVariantTrack(activeTrack);
                        return secondary ? `${primary} · ${secondary}` : primary;
                    })()
                    : 'Adaptive';
                return `<button class="spvp-menu-button" type="button" data-quality-mode="auto" data-active="${qualityMode === 'auto' ? 'true' : 'false'}" aria-label="Select automatic quality">
                  <span class="spvp-menu-copy">
                    <span class="spvp-menu-label">Auto</span>
                    <span class="spvp-menu-value">${escapeHtml(autoValue)}</span>
                  </span>
                  <span class="spvp-menu-dot" aria-hidden="true"></span>
                </button>`;
            })(),
            ...tracks.map((track) => {
                const { primary, secondary } = describeVariantTrack(track);
                return `
                <button class="spvp-menu-button" type="button" data-quality-id="${track.id}" data-active="${qualityMode === track.id ? 'true' : 'false'}" aria-label="Select ${primary} quality">
                  <span class="spvp-menu-copy">
                    <span class="spvp-menu-label">${escapeHtml(primary)}</span>
                    ${secondary ? `<span class="spvp-menu-value">${escapeHtml(secondary)}</span>` : ''}
                  </span>
                  <span class="spvp-menu-dot" aria-hidden="true"></span>
                </button>
            `;
            }),
        ].join('');
    };

    const openMenu = (view: 'ambient' | 'quality' | 'root' | 'speed' = 'root') => {
        menuView = view;
        renderMenu();
        menu.hidden = false;
        hidePreview();
        updateProgress();
        root.dataset.menuOpen = 'true';
        if (menuHideTimer !== undefined) {
            win.clearTimeout(menuHideTimer);
        }
        settingsButton.dataset.open = 'true';
        requestAnimationFrame(() => {
            menu.dataset.open = 'true';
            syncMenuHeight();
            scheduleMenuHeightSync();
            scheduleMenuHeightSyncAfterFontsReady();
            scheduleMenuHeightResettle();
        });
        animateMenuList(view === 'root' ? 0 : 1);
    };

    const setPlaybackRate = (rate: number) => {
        video.defaultPlaybackRate = rate;
        video.playbackRate = rate;
        persistSettings();
        if (!menu.hidden) {
            renderMenu();
            syncMenuHeight();
            scheduleMenuHeightSync();
        }
    };

    const adjustPlaybackRate = (delta: number) => {
        const current = video.playbackRate || 1;
        const nearestIndex = speeds.reduce((bestIndex, value, index) => {
            const bestDistance = Math.abs(speeds[bestIndex] - current);
            const distance = Math.abs(value - current);
            return distance < bestDistance ? index : bestIndex;
        }, 0);
        const nextIndex = clamp(nearestIndex + delta, 0, speeds.length - 1);
        setPlaybackRate(speeds[nextIndex]);
    };

    const hidePreview = () => {
        preview.dataset.visible = 'false';
        if (previewHideTimer !== undefined) {
            win.clearTimeout(previewHideTimer);
        }
        previewHideTimer = win.setTimeout(() => {
            previewHideTimer = undefined;
            previewFrame.dataset.hasImage = 'false';
            resetPreviewImage(previewFrame, previewGlow, previewImage);
        }, 180);
    };

    const isMenuOpen = () => !menu.hidden && menu.dataset.open === 'true';

    const ensurePreviewTracks = async (): Promise<PreviewTrackEntry[]> => {
        if (previewTracks) {
            return previewTracks;
        }

        if (!options.previewTracksUrl) {
            previewTracks = [];
            return previewTracks;
        }

        if (!previewTracksPromise) {
            previewTracksPromise = fetch(options.previewTracksUrl)
                .then(async (response) => {
                    if (!response.ok) {
                        return [];
                    }

                    const payload = await response.json() as PreviewTracksPayload;
                    return Array.isArray(payload.entries) ? payload.entries : [];
                })
                .catch(() => []);
        }

        previewTracks = await previewTracksPromise;
        return previewTracks;
    };

    const setAmbientLayerVisual = (layer: HTMLElement, visual: AmbientVisual) => {
        layer.dataset.renderMode = visual.renderMode;
        layer.style.backgroundColor = '';
        layer.style.backgroundImage = '';
        layer.style.backgroundPosition = 'center';
        layer.style.backgroundSize = 'cover';

        const renderAmbientCanvas = (
            canvas: HTMLCanvasElement,
            panel: AmbientPanelLayout | undefined,
            sideName?: AmbientSideName | 'center',
        ) => {
            const sourceCanvas = visual.sourceCanvas;
            if (!panel || !sourceCanvas) {
                canvas.hidden = true;
                canvas.style.left = '';
                canvas.style.top = '';
                canvas.style.width = '';
                canvas.style.height = '';
                canvas.style.transform = '';
                canvas.width = 0;
                canvas.height = 0;
                return;
            }

            canvas.hidden = false;
            canvas.style.left = `${Math.round(panel.left)}px`;
            canvas.style.top = `${Math.round(panel.top)}px`;
            canvas.style.width = `${Math.round(panel.width)}px`;
            canvas.style.height = `${Math.round(panel.height)}px`;
            canvas.style.transform = panel.transform;

            const pixelRatio = clamp(win.devicePixelRatio || 1, 1, 1.5);
            canvas.width = Math.max(1, Math.round(panel.width * pixelRatio));
            canvas.height = Math.max(1, Math.round(panel.height * pixelRatio));

            let context: CanvasRenderingContext2D | null = null;
            try {
                context = canvas.getContext('2d');
            } catch {
                context = null;
            }

            if (!context) {
                return;
            }

            context.clearRect(0, 0, canvas.width, canvas.height);
            context.save();
            context.scale(pixelRatio, pixelRatio);
            context.imageSmoothingEnabled = true;
            if ('imageSmoothingQuality' in context) {
                context.imageSmoothingQuality = 'high';
            }

            const drawMainContent = () => {
                context.drawImage(
                    sourceCanvas,
                    panel.offsetX,
                    panel.offsetY,
                    panel.contentWidth,
                    panel.contentHeight,
                );
            };

            drawMainContent();

            const supportsCanvasTransforms = typeof context.translate === 'function' && typeof context.scale === 'function';

            if (supportsCanvasTransforms && (sideName === 'left' || sideName === 'right')) {
                const topEdge = panel.offsetY;
                const bottomEdge = panel.offsetY + panel.contentHeight;

                context.save();
                context.translate(0, topEdge * 2);
                context.scale(1, -1);
                drawMainContent();
                context.restore();

                context.save();
                context.translate(0, bottomEdge * 2);
                context.scale(1, -1);
                drawMainContent();
                context.restore();
            } else if (supportsCanvasTransforms && (sideName === 'top' || sideName === 'bottom' || sideName === 'center')) {
                const leftEdge = panel.offsetX;
                const rightEdge = panel.offsetX + panel.contentWidth;

                context.save();
                context.translate(leftEdge * 2, 0);
                context.scale(-1, 1);
                drawMainContent();
                context.restore();

                context.save();
                context.translate(rightEdge * 2, 0);
                context.scale(-1, 1);
                drawMainContent();
                context.restore();
            }

            context.restore();
        };

        for (const sideName of ['top', 'right', 'bottom', 'left'] as const) {
            const sideElement = layer.querySelector<HTMLCanvasElement>(`.spvp-ambient-side[data-side="${sideName}"]`);
            if (!sideElement) {
                continue;
            }

            const panel = visual.renderMode === 'frame' ? visual.panelLayouts?.[sideName] : undefined;
            renderAmbientCanvas(sideElement, panel, sideName);
        }

        const centerElement = layer.querySelector<HTMLCanvasElement>('.spvp-ambient-center');
        if (centerElement) {
            renderAmbientCanvas(centerElement, visual.renderMode === 'frame' ? visual.centerLayout : undefined, 'center');
        }
    };

    const setAmbientTransitionEnabled = (layer: HTMLElement, enabled: boolean) => {
        layer.style.transition = enabled ? '' : 'none';
    };

    const createMountedAmbientLayer = () => {
        const layer = createAmbientLayerElement();
        ambient.append(layer);
        return layer;
    };

    const removeAmbientLayer = (layer: HTMLElement) => {
        layer.remove();
    };

    const clearAmbientQueue = () => {
        ambient.querySelectorAll<HTMLElement>('.spvp-ambient-layer').forEach((layer) => {
            removeAmbientLayer(layer);
        });
        ambientFrameQueue = [];
    };

    const getAmbientQueueOpacity = (entry: AmbientQueueEntry, nowMs: number): number => {
        const age = Math.max(0, (nowMs - entry.insertedAtMs) / 1000);
        const quantizedAge = Math.floor(age);
        return clamp(quantizedAge / ambientBlendWindowSeconds, 0, 1);
    };

    const syncAmbientQueueLayers = (nowMs = win.performance.now()) => {
        while (
            ambientFrameQueue.length > 1
            && ambientFrameQueue
                .slice(1)
                .filter((entry) => getAmbientQueueOpacity(entry, nowMs) >= 1)
                .length >= 2
        ) {
            const removed = ambientFrameQueue.shift();
            if (removed) {
                removeAmbientLayer(removed.layer);
            }
        }

        let hasFullyOpaqueEntry = false;
        ambientFrameQueue.forEach((entry) => {
            const rawOpacity = getAmbientQueueOpacity(entry, nowMs);
            if (rawOpacity >= 1) {
                hasFullyOpaqueEntry = true;
            }
            setAmbientTransitionEnabled(entry.layer, true);
            entry.layer.dataset.active = 'true';
            entry.layer.style.opacity = String(rawOpacity);
        });

        if (!hasFullyOpaqueEntry && ambientFrameQueue.length > 0) {
            ambientFrameQueue[0].layer.style.opacity = '1';
        }
    };

    const areAmbientSampleTimesEqual = (left: number, right: number) => Math.abs(left - right) < 0.05;

    const ensureAmbientOpacityTimer = () => {
        if (ambientOpacityTimer !== undefined) {
            return;
        }

        ambientOpacityTimer = win.setInterval(() => {
            if (destroyed || ambientLevel <= 0.001 || doc.hidden || !ambientIntersectionVisible) {
                return;
            }

            if (ambientFrameQueue.length > 0) {
                syncAmbientQueueLayers(win.performance.now());
            }
        }, 1000);
    };

    const enqueueAmbientVisual = (visual: AmbientVisual, playbackTime: number, samplePlaybackTime: number, nowMs = win.performance.now(), seed = false) => {
        const layer = createMountedAmbientLayer();
        setAmbientLayerVisual(layer, visual);
        ambientFrameQueue.push({
            insertedAtMs: seed ? Math.max(0, nowMs - (ambientBlendWindowSeconds * 1000)) : nowMs,
            key: `${visual.key}:${ambientFrameQueueSerial}`,
            layer,
            samplePlaybackTime,
            visual,
        });
        ambientFrameQueueSerial += 1;
        ambientActualSource = visual.source;
        syncAmbientQueueLayers(nowMs);
        ensureAmbientOpacityTimer();
        updateDebugOverlay();
    };

    const hideAmbientVisual = (source: AmbientSourceActual) => {
        clearAmbientQueue();
        ambientActualSource = source;
        updateDebugOverlay();
    };

    const hasActiveAmbientVisual = () => ambientFrameQueue.length > 0 || ambient.querySelector('.spvp-ambient-layer[data-active="true"]') !== null;

    const setAmbientUnavailableState = () => {
        ambientActualSource = 'unavailable';
        updateDebugOverlay();
    };

    const waitForMediaElementState = async (
        mediaElement: HTMLMediaElement,
        timeoutMs = 1600,
    ): Promise<boolean> => new Promise((resolve) => {
        if (mediaElement.readyState >= 2) {
            resolve(true);
            return;
        }

        const timeout = win.setTimeout(() => {
            cleanupListeners();
            resolve(mediaElement.readyState >= 2);
        }, timeoutMs);

        const onReady = () => {
            cleanupListeners();
            resolve(true);
        };

        const cleanupListeners = () => {
            win.clearTimeout(timeout);
            mediaElement.removeEventListener('loadeddata', onReady);
            mediaElement.removeEventListener('loadedmetadata', onReady);
            mediaElement.removeEventListener('canplay', onReady);
            mediaElement.removeEventListener('seeked', onReady);
        };

        mediaElement.addEventListener('loadeddata', onReady, { once: true });
        mediaElement.addEventListener('loadedmetadata', onReady, { once: true });
        mediaElement.addEventListener('canplay', onReady, { once: true });
        mediaElement.addEventListener('seeked', onReady, { once: true });
    });

    const destroyAmbientProbe = async () => {
        if (ambientProbePlayer) {
            await ambientProbePlayer.destroy?.();
            ambientProbePlayer = undefined;
        }

        if (ambientProbeVideo) {
            if (!isJsdomEnvironment) {
                try {
                    ambientProbeVideo.pause();
                } catch {
                    // Media control cleanup is best-effort.
                }
            }
            ambientProbeVideo.removeAttribute('src');
            if (!isJsdomEnvironment) {
                try {
                    ambientProbeVideo.load?.();
                } catch {
                    // Media load cleanup is best-effort.
                }
            }
            ambientProbeVideo.remove();
            ambientProbeVideo = undefined;
        }

        ambientProbeSourceType = undefined;
        ambientProbeSourceUrl = undefined;
    };

    const ensureAmbientProbeVideo = () => {
        if (ambientProbeVideo) {
            return ambientProbeVideo;
        }

        const probe = doc.createElement('video');
        probe.muted = true;
        probe.playsInline = true;
        probe.preload = 'auto';
        probe.crossOrigin = 'anonymous';
        probe.hidden = true;
        probe.tabIndex = -1;
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-99999px;top:-99999px;';
        root.append(probe);
        ambientProbeVideo = probe;
        return probe;
    };

    const ensureAmbientProbeLoaded = async (): Promise<HTMLVideoElement | undefined> => {
        if (isJsdomEnvironment) {
            return undefined;
        }

        if (!currentSourceUrl) {
            return undefined;
        }

        if (ambientProbeVideo && ambientProbeSourceUrl === currentSourceUrl && ambientProbeSourceType === currentSourceType) {
            return ambientProbeVideo;
        }

        await destroyAmbientProbe();
        const probe = ensureAmbientProbeVideo();

        if (currentSourceType === 'manifest') {
            const Player = shaka?.Player;
            if (!Player?.isBrowserSupported?.()) {
                return undefined;
            }

            shaka?.polyfill?.installAll?.();
            const nextPlayer = new Player();
            ambientProbePlayer = nextPlayer;
            await nextPlayer.attach?.(probe);
            await nextPlayer.load?.(currentSourceUrl);
            ambientProbeSourceType = currentSourceType;
            ambientProbeSourceUrl = currentSourceUrl;
            await waitForMediaElementState(probe);
            return probe;
        }

        probe.src = currentSourceUrl;
        probe.load?.();
        ambientProbeSourceType = currentSourceType;
        ambientProbeSourceUrl = currentSourceUrl;
        await waitForMediaElementState(probe);
        return probe;
    };

    const captureAmbientFrameCanvasFrom = (sourceVideo: HTMLVideoElement): HTMLCanvasElement | undefined => {
        if (sourceVideo.readyState < 2 || sourceVideo.videoWidth <= 1 || sourceVideo.videoHeight <= 1) {
            return undefined;
        }

        if (!ambientFrameCanvas) {
            ambientFrameCanvas = doc.createElement('canvas');
        }

        const sourceAspect = sourceVideo.videoWidth / sourceVideo.videoHeight;
        let frameWidth = 640;
        let frameHeight = Math.round(frameWidth / sourceAspect);
        if (frameHeight > 360) {
            frameHeight = 360;
            frameWidth = Math.round(frameHeight * sourceAspect);
        }

        ambientFrameCanvas.width = Math.max(1, frameWidth);
        ambientFrameCanvas.height = Math.max(1, frameHeight);

        if (ambientFrameContext === undefined) {
            ambientFrameContext = ambientFrameCanvas.getContext('2d');
        }

        if (!ambientFrameContext) {
            return undefined;
        }

        try {
            ambientFrameContext.drawImage(sourceVideo, 0, 0, ambientFrameCanvas.width, ambientFrameCanvas.height);
            return ambientFrameCanvas;
        } catch {
            return undefined;
        }
    };

    const captureAmbientFrameCanvas = async (targetTime: number): Promise<HTMLCanvasElement | undefined> => {
        const fallbackFrame = captureAmbientFrameCanvasFrom(video);
        const shouldUseFutureFrame = Number.isFinite(targetTime) && targetTime > (Number.isFinite(video.currentTime) ? video.currentTime + 0.05 : 0.05);
        if (!shouldUseFutureFrame || currentSourceType === 'manifest') {
            return fallbackFrame;
        }

        try {
            const probe = await ensureAmbientProbeLoaded();
            if (!probe) {
                return fallbackFrame;
            }

            const duration = Number.isFinite(video.duration) && video.duration > 0
                ? video.duration
                : (Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : targetTime);
            const clampedTargetTime = clamp(targetTime, 0, Math.max(0, duration - 0.05));

            if (!Number.isFinite(clampedTargetTime)) {
                return fallbackFrame;
            }

            if (Math.abs((probe.currentTime || 0) - clampedTargetTime) > 0.05) {
                probe.currentTime = clampedTargetTime;
                await waitForMediaElementState(probe);
            }

            return captureAmbientFrameCanvasFrom(probe) ?? fallbackFrame;
        } catch {
            return fallbackFrame;
        }
    };

    const getAmbientSampleTime = (playbackTime: number, paused = video.paused): number => {
        if (paused) {
            return Math.max(0, playbackTime);
        }

        const lookahead = ambientBlendWindowSeconds / 2;
        const bufferedEnd = getBufferedEnd(video);
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined;
        const maxLoadedAhead = bufferedEnd > playbackTime
            ? Math.min(lookahead, bufferedEnd - playbackTime)
            : 0;
        const rawTargetTime = playbackTime + maxLoadedAhead;

        if (duration === undefined) {
            return Math.max(0, rawTargetTime);
        }

        return clamp(rawTargetTime, 0, Math.max(0, duration - 0.05));
    };

    const applyVideoAmbient = async (time: number, force = false, nowMs = win.performance.now()): Promise<boolean> => {
        if (ambientFrameQueue.length > 0) {
            syncAmbientQueueLayers(nowMs);
        }

        const sampleTime = getAmbientSampleTime(time, video.paused);
        const newestEntry = ambientFrameQueue.length > 0 ? ambientFrameQueue[ambientFrameQueue.length - 1] : undefined;
        const newestSampleTime = newestEntry?.samplePlaybackTime;
        const shouldEnqueueFrame = force
            || ambientFrameQueue.length === 0
            || newestSampleTime === undefined
            || Math.abs(sampleTime - newestSampleTime) >= ambientFrameIntervalSeconds;

        if (!shouldEnqueueFrame || (newestSampleTime !== undefined && areAmbientSampleTimesEqual(sampleTime, newestSampleTime))) {
            return ambientActualSource === 'video' || ambientFrameQueue.length > 0;
        }

        const frameCanvas = await captureAmbientFrameCanvas(sampleTime);
        const key = `video:${Math.max(0, sampleTime).toFixed(2)}`;

        if (frameCanvas) {
            const visual = buildMirroredAmbientVisual({
                key,
                source: 'video',
                sourceCanvas: frameCanvas,
                stage,
                video,
            });
            if (visual) {
                const shouldSeedVideoFrame = ambientActualSource !== 'video' || ambientFrameQueue.length === 0;
                enqueueAmbientVisual(visual, time, sampleTime, nowMs, shouldSeedVideoFrame);
                return true;
            }
        }

        return ambientFrameQueue.length > 0;
    };

    const refreshAmbient = async (force = false, now = win.performance.now()): Promise<void> => {
        if (ambientRefreshInFlight) {
            ambientRefreshQueued = true;
            ambientRefreshQueuedForce = ambientRefreshQueuedForce || force;
            ambientRefreshQueuedNow = Math.max(ambientRefreshQueuedNow, now);
            return;
        }

        syncSpatialVideoMaskGeometry();

        if (ambientLevel <= 0.001) {
            hideAmbientVisual('off');
            return;
        }

        if (!force && (doc.hidden || !ambientIntersectionVisible)) {
            return;
        }

        ambientRefreshInFlight = true;

        try {
            const playbackTime = Number.isFinite(video.currentTime) && video.currentTime > 0
                ? video.currentTime
                : pendingResumeDisplayTime;

            if (!await applyVideoAmbient(playbackTime, force, now)) {
                if (hasActiveAmbientVisual()) {
                    setAmbientUnavailableState();
                } else {
                    hideAmbientVisual('unavailable');
                }
            }
        } finally {
            ambientRefreshInFlight = false;
            if (ambientRefreshQueued) {
                const nextForce = ambientRefreshQueuedForce;
                const nextNow = ambientRefreshQueuedNow || win.performance.now();
                ambientRefreshQueued = false;
                ambientRefreshQueuedForce = false;
                ambientRefreshQueuedNow = 0;
                void refreshAmbient(nextForce, nextNow);
            }
        }
    };

    const showPreviewAtTime = async (time: number, clientX?: number) => {
        if (!menu.hidden) {
            hidePreview();
            return;
        }

        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        if (duration <= 0) {
            hidePreview();
            return;
        }

        const ratio = clamp(time / duration, 0, 1);
        const shellRect = progressShell.getBoundingClientRect();
        const fallbackX = shellRect.left + (shellRect.width * ratio);
        if (previewHideTimer !== undefined) {
            win.clearTimeout(previewHideTimer);
            previewHideTimer = undefined;
        }
        preview.dataset.visible = 'true';
        const previewWidth = previewFrame.getBoundingClientRect().width || 240;
        const previewHalfWidth = previewWidth / 2;
        const previewX = clamp(
            clientX ?? fallbackX,
            shellRect.left + previewHalfWidth,
            shellRect.right - previewHalfWidth,
        );
        const relativeX = previewX - shellRect.left;

        preview.style.left = `${relativeX}px`;
        previewTime.textContent = formatTime(time);

        const tracks = await ensurePreviewTracks();
        const previewEntry = findPreviewEntry(tracks, time);
        if (previewEntry) {
            previewFrame.dataset.hasImage = 'true';
            applyPreviewImage(previewFrame, previewGlow, previewImage, previewEntry);
        } else {
            previewFrame.dataset.hasImage = 'false';
            resetPreviewImage(previewFrame, previewGlow, previewImage);
        }
    };

    const on = (
        targetElement: EventTarget,
        eventName: string,
        listener: EventListenerOrEventListenerObject,
        optionsValue?: AddEventListenerOptions | boolean,
    ) => {
        targetElement.addEventListener(eventName, listener, optionsValue);
        cleanup.push(() => targetElement.removeEventListener(eventName, listener, optionsValue));
    };

    if ('IntersectionObserver' in win) {
        ambientObserver = new IntersectionObserver((entries) => {
            ambientIntersectionVisible = entries[0]?.isIntersecting !== false;
            if (ambientIntersectionVisible) {
                void refreshAmbient(true);
            }
        }, { threshold: 0.01 });
        ambientObserver.observe(root);
        cleanup.push(() => ambientObserver?.disconnect());
    }

    const monitorPlaybackFrames = () => {
        const videoWithFrameCallback = video;
        if (!videoWithFrameCallback.requestVideoFrameCallback) {
            updateDebugOverlay();
            return;
        }

        const tick = (now: number, metadata: VideoFrameMetadataLike) => {
            if (lastFrameSample && typeof metadata.presentedFrames === 'number') {
                const framesDelta = metadata.presentedFrames - lastFrameSample.frames;
                const timeDelta = (now - lastFrameSample.timestamp) / 1000;
                if (framesDelta >= 0 && timeDelta > 0) {
                    playbackFps = framesDelta / timeDelta;
                }
            }

            if (typeof metadata.presentedFrames === 'number') {
                lastFrameSample = {
                    frames: metadata.presentedFrames,
                    timestamp: now,
                };
            }

            void refreshAmbient(false, now);
            updateDebugOverlay();
            frameCallbackId = videoWithFrameCallback.requestVideoFrameCallback?.(tick);
        };

        frameCallbackId = videoWithFrameCallback.requestVideoFrameCallback(tick);
        cleanup.push(() => {
            if (frameCallbackId !== undefined) {
                videoWithFrameCallback.cancelVideoFrameCallback?.(frameCallbackId);
            }
        });
    };

    setButtonContent(playButton, 'play');
    setButtonContent(rewindButton, 'backward');
    setButtonContent(forwardButton, 'forward');
    setButtonContent(settingsButton, 'settings');
    updatePipState();
    updateFullscreenState();
    video.crossOrigin = 'anonymous';
    applyVolumeLevel(volumeLevel);
    updateMuteState();
    updateProgress();
    rewritePlayButtonIcon(playButton, true, createIcon);
    updateDebugOverlay();
    void refreshAmbient(true);
    monitorPlaybackFrames();

    on(playButton, 'click', () => {
        resumeAudioBoost();
        if (video.paused) {
            void video.play();
            showCenterToast('play');
        } else {
            video.pause();
            showCenterToast('pause');
        }
        showActivity();
    });

    on(stage, 'click', (event) => {
        if (
            eventIncludesMatchingElement(
                event,
                '.spvp-overlay, .spvp-menu, .spvp-error, .spvp-header, .spvp-debug, .spvp-progress, .spvp-button, .spvp-volume-range',
            )
        ) {
            return;
        }

        if (!menu.hidden) {
            closeMenu();
        }
        playButton.click();
    });

    on(rewindButton, 'click', () => {
        video.currentTime = Math.max(0, video.currentTime - 10);
        updateProgress();
        showCenterToast('backward');
        showActivity();
    });

    on(forwardButton, 'click', () => {
        const duration = Number.isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER;
        video.currentTime = Math.min(duration, video.currentTime + 10);
        updateProgress();
        showCenterToast('forward');
        showActivity();
    });

    on(muteButton, 'click', () => {
        video.muted = !video.muted;
        syncBoostState();
        updateMuteState();
        persistSettings();
        showCenterToast(getVolumeIconName());
        showActivity();
    });

    on(volumeRange, 'input', () => {
        const volume = Number(volumeRange.value) / 100;
        volumeLevel = volume;
        video.muted = volume === 0;
        applyVolumeLevel(volumeLevel, { persist: true });
        showActivity();
    });

    on(volumeRange, 'focus', () => {
        volumeRange.blur();
    });

    on(progressInput, 'input', () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
            return;
        }

        const seekPercent = scrubPercent ?? clamp((Number(progressInput.value) / 1000) * 100, 0, 100);
        scheduleSeek((seekPercent / 100) * video.duration);
        showActivity();
    });

    on(progressInput, 'change', () => {
        flushPendingSeek();
        isScrubbing = false;
        scrubPercent = null;
        updateProgress();
    });

    on(progressInput, 'pointerup', () => {
        flushPendingSeek();
        isScrubbing = false;
        scrubPercent = null;
        updateProgress();
    });

    on(progressInput, 'touchend', () => {
        flushPendingSeek();
        isScrubbing = false;
        scrubPercent = null;
        updateProgress();
    });

    on(progressInput, 'pointerdown', (event) => {
        const clientX = getClientXFromEvent(event);
        if (clientX === undefined) {
            return;
        }

        isScrubbing = true;
        updateScrubPercent(clientX);
        showActivity();
    });

    on(progressInput, 'focus', () => {
        progressInput.blur();
    });

    const handleTimelineHover = (event: Event) => {
        const clientX = getClientXFromEvent(event);
        if (clientX === undefined) {
            return;
        }

        const ratio = getTimelineRatioFromClientX(clientX);
        hoverPercent = ratio * 100;
        if (isScrubbing) {
            scrubPercent = hoverPercent;
        }
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        if (duration <= 0) {
            updateProgress();
            return;
        }

        updateProgress();
        void showPreviewAtTime(duration * ratio, clientX);
        showActivity();
    };

    on(progressInput, 'pointermove', handleTimelineHover);
    on(progressInput, 'mousemove', handleTimelineHover);

    on(progressInput, 'pointerenter', () => {
        hoverPercent = 0;
        void ensurePreviewTracks();
        updateProgress();
        showActivity();
    });

    on(progressInput, 'pointerleave', () => {
        if (!isScrubbing) {
            clearTimelineHover();
        }
    });

    on(settingsButton, 'click', (event) => {
        event.stopPropagation();
        const menuIsOpen = !menu.hidden && menu.dataset.open === 'true';
        if (!menuIsOpen) {
            openMenu('root');
        } else {
            closeMenu();
        }
        showActivity();
    });

    on(timeToggle, 'click', (event) => {
        event.stopPropagation();
        timeDisplayMode = timeDisplayMode === 'elapsed' ? 'remaining' : 'elapsed';
        updateProgress();
        showActivity();
    });

    on(menu, 'click', (event) => {
        event.stopPropagation();
    });

    on(menuBackButton, 'click', (event) => {
        event.stopPropagation();
        menuView = 'root';
        renderMenu();
        syncMenuHeight();
        scheduleMenuHeightSync();
        scheduleMenuHeightResettle();
        animateMenuList(-1);
        showActivity();
    });

    on(menuList, 'click', (event) => {
        event.stopPropagation();
        const targetNode = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
        if (!targetNode) {
            return;
        }

        const nextView = targetNode.dataset.menuView as 'ambient' | 'quality' | 'speed' | undefined;
        if (nextView) {
            menuView = nextView;
            renderMenu();
            syncMenuHeight();
            scheduleMenuHeightSync();
            scheduleMenuHeightSyncAfterFontsReady();
            scheduleMenuHeightResettle();
            animateMenuList(1);
            showActivity();
            return;
        }

        if (targetNode.dataset.toggleDebug === 'true') {
            debugEnabled = !debugEnabled;
            persistSettings();
            updateDebugOverlay();
            renderMenu();
            syncMenuHeight();
            scheduleMenuHeightSync();
            showActivity();
            return;
        }

        if (targetNode.dataset.ambientPreset) {
            const previousLevel = ambientLevel;
            ambientLevel = clampAmbientLevel(Number(targetNode.dataset.ambientPreset) / 100);
            syncAmbientMenuControls();
            applyAmbientSettingsChange(previousLevel);
            showActivity();
            return;
        }

        if (targetNode.dataset.rate) {
            setPlaybackRate(Number(targetNode.dataset.rate));
            closeMenu();
            showActivity();
            return;
        }

        if (targetNode.dataset.qualityOptionId) {
            const option = options.qualityOptions?.find((item) => item.id === targetNode.dataset.qualityOptionId);
            if (!option) {
                return;
            }

            selectedQualityId = option.id;
            void loadSource(option.url, option.sourceType, true).then(() => {
                persistSettings();
                if (!menu.hidden) {
                    renderMenu();
                    syncMenuHeight();
                    scheduleMenuHeightSync();
                }
                closeMenu();
                showActivity();
            });
            return;
        }

        if (targetNode.dataset.qualityMode === 'auto') {
            qualityMode = 'auto';
            player?.configure?.({ abr: getShakaAbrConfig(win) });
            persistSettings();
            updateDebugOverlay();
            if (!menu.hidden) {
                renderMenu();
                syncMenuHeight();
                scheduleMenuHeightSync();
            }
            closeMenu();
            showActivity();
            return;
        }

        if (targetNode.dataset.qualityId) {
            const trackId = Number(targetNode.dataset.qualityId);
            const track = getVariantTracks().find((item) => item.id === trackId);
            if (!track) {
                return;
            }

            qualityMode = track.id;
            player?.configure?.({ abr: { enabled: false } });
            player?.selectVariantTrack?.(track, false);
            persistSettings();
            updateDebugOverlay();
            if (!menu.hidden) {
                renderMenu();
                syncMenuHeight();
                scheduleMenuHeightSync();
            }
            closeMenu();
            showActivity();
        }
    });

    on(menuList, 'input', (event) => {
        const targetNode = event.target instanceof HTMLInputElement ? event.target : null;
        if (!targetNode) {
            return;
        }

        if (targetNode.dataset.ambientLevelRange === 'true') {
            const previousLevel = ambientLevel;
            ambientLevel = clampAmbientLevel(Number(targetNode.value) / 100);
            syncAmbientMenuControls();
            applyAmbientSettingsChange(previousLevel);
            showActivity();
            return;
        }

        if (targetNode.dataset.ambientBlurRange === 'true') {
            const previousLevel = ambientLevel;
            ambientBlurPx = clampAmbientBlurPx(Number(targetNode.value));
            syncAmbientMenuControls();
            applyAmbientSettingsChange(previousLevel);
            showActivity();
        }
    });

    on(doc, 'click', (event) => {
        const targetNode = event.target instanceof Node ? event.target : null;
        if (targetNode && !menu.hidden && !menu.contains(targetNode) && !settingsButton.contains(targetNode)) {
            closeMenu();
        }
    });

    on(pipButton, 'click', async () => {
        const videoWithPip = video as HTMLVideoElement & {
            requestPictureInPicture?: () => Promise<unknown>;
        };
        const documentWithPip = doc as Document & {
            exitPictureInPicture?: () => Promise<void>;
            pictureInPictureElement?: Element | null;
            pictureInPictureEnabled?: boolean;
        };

        if (!documentWithPip.pictureInPictureEnabled) {
            return;
        }

        if (documentWithPip.pictureInPictureElement) {
            await documentWithPip.exitPictureInPicture?.().catch(() => undefined);
        } else {
            await videoWithPip.requestPictureInPicture?.().catch(() => undefined);
        }
        updatePipState();
        showActivity();
    });

    on(fullscreenButton, 'click', async () => {
        if (doc.fullscreenElement) {
            await doc.exitFullscreen().catch(() => undefined);
        } else {
            await root.requestFullscreen?.().catch(() => undefined);
        }
        updateFullscreenState();
        showActivity();
    });

    on(doc, 'fullscreenchange', () => {
        updateFullscreenState();
        showActivity();
    });

    on(doc, 'enterpictureinpicture', () => {
        updatePipState();
        showActivity();
    });

    on(doc, 'leavepictureinpicture', () => {
        updatePipState();
        showActivity();
    });

    on(video, 'play', () => {
        maybeApplyPendingResumeSeek();
        rewritePlayButtonIcon(playButton, false, createIcon);
        updateDebugOverlay();
        void refreshAmbient(true);
        showActivity();
    });
    on(video, 'playing', maybeApplyPendingResumeSeek);

    on(video, 'pause', () => {
        rewritePlayButtonIcon(playButton, true, createIcon);
        syncCurrentPlaybackQuality();
        updateDebugOverlay();
        persistProgress(true);
        void refreshAmbient(true);
        setIdle(false);
    });

    on(video, 'timeupdate', () => {
        if (video.currentTime > 0) {
            pendingResumeDisplayTime = 0;
        }
        syncCurrentPlaybackQuality();
        updateProgress();
        updateDebugOverlay();
        persistProgress();
        void refreshAmbient(false);
    });
    on(video, 'durationchange', () => {
        syncCurrentPlaybackQuality();
        updateProgress();
        updateDebugOverlay();
        void refreshAmbient(true);
    });
    on(video, 'loadedmetadata', () => {
        maybeApplyPendingResumeSeek();
        syncCurrentPlaybackQuality();
        updateProgress();
        updateDebugOverlay();
        void refreshAmbient(true);
    });
    on(video, 'loadeddata', maybeApplyPendingResumeSeek);
    on(video, 'canplay', maybeApplyPendingResumeSeek);
    on(video, 'seeked', () => {
        if (video.currentTime > 0) {
            pendingResumeSeekTime = 0;
            pendingResumeDisplayTime = 0;
        }
        syncCurrentPlaybackQuality();
        updateProgress();
        updateDebugOverlay();
        void refreshAmbient(true);
    });
    on(video, 'ended', () => {
        persistProgress(true);
    });
    on(video, 'progress', updateProgress);
    on(video, 'volumechange', () => {
        updateMuteState();
        persistSettings();
    });

    on(root, 'mousemove', showActivity);
    on(root, 'pointerdown', showActivity);
    on(root, 'touchstart', showActivity, { passive: true });
    on(doc, 'visibilitychange', () => {
        if (!doc.hidden) {
            void refreshAmbient(true);
        }
    });
    on(win, 'beforeunload', () => {
        flushPendingSeek();
        persistProgress(true);
    });

    on(win, 'keydown', (event) => {
        const keyboardEvent = event as KeyboardEvent;
        const activeElement = doc.activeElement;
        if (
            activeElement instanceof HTMLElement
            && (activeElement.isContentEditable || ['input', 'textarea', 'select'].includes(activeElement.tagName.toLowerCase()))
        ) {
            return;
        }

        if (keyboardEvent.key === ' ' || keyboardEvent.key.toLowerCase() === 'k') {
            keyboardEvent.preventDefault();
            playButton.click();
            return;
        }

        if (keyboardEvent.key === 'ArrowLeft') {
            keyboardEvent.preventDefault();
            rewindButton.click();
            return;
        }

        if (keyboardEvent.key === 'ArrowRight') {
            keyboardEvent.preventDefault();
            forwardButton.click();
            return;
        }

        if (keyboardEvent.key === 'ArrowUp') {
            keyboardEvent.preventDefault();
            video.muted = false;
            applyVolumeLevel(volumeLevel + (keyboardEvent.shiftKey ? 0.25 : 0.05), { persist: true });
            resumeAudioBoost();
            showCenterToast(getVolumeIconName());
            showTopToast(`${Math.round(volumeLevel * 100)}%`);
            showActivity();
            return;
        }

        if (keyboardEvent.key === 'ArrowDown') {
            keyboardEvent.preventDefault();
            applyVolumeLevel(volumeLevel - (keyboardEvent.shiftKey ? 0.25 : 0.05), { persist: true });
            video.muted = volumeLevel === 0;
            syncBoostState();
            updateMuteState();
            showCenterToast(getVolumeIconName());
            showTopToast(`${Math.round(volumeLevel * 100)}%`);
            showActivity();
            return;
        }

        if (keyboardEvent.key.toLowerCase() === 'm') {
            keyboardEvent.preventDefault();
            muteButton.click();
            showTopToast(video.muted ? '0%' : `${Math.round(volumeLevel * 100)}%`);
            return;
        }

        if (keyboardEvent.key.toLowerCase() === 'f') {
            keyboardEvent.preventDefault();
            fullscreenButton.click();
            return;
        }

        if (keyboardEvent.key === '>' || keyboardEvent.key === '.') {
            keyboardEvent.preventDefault();
            adjustPlaybackRate(1);
            showActivity();
            return;
        }

        if (keyboardEvent.key === '<' || keyboardEvent.key === ',') {
            keyboardEvent.preventDefault();
            adjustPlaybackRate(-1);
            showActivity();
        }
    });

    const bindShakaEvents = () => {
        if (!player?.addEventListener) {
            return;
        }

        const listener = () => {
            updateDebugOverlay();
            if (!menu.hidden) {
                renderMenu();
                syncMenuHeight();
                scheduleMenuHeightSync();
            }
        };
        const qualityListener = (event: Event) => {
            const qualityEvent = event as Event & { mediaQuality?: ShakaMediaQualityInfo; position?: number };
            if (qualityEvent.mediaQuality?.contentType === 'audio') {
                return;
            }

            if (qualityEvent.mediaQuality) {
                const explicitPosition = typeof qualityEvent.position === 'number' && Number.isFinite(qualityEvent.position)
                    ? qualityEvent.position
                    : undefined;
                const bufferedEnd = getBufferedEnd(video);
                const shouldDelayToBufferedTail = Boolean(
                    currentPlaybackQuality
                    && !areMediaQualitiesEquivalent(currentPlaybackQuality, qualityEvent.mediaQuality)
                    && bufferedEnd > video.currentTime + 0.75
                    && explicitPosition !== undefined
                    && explicitPosition <= video.currentTime + 0.05,
                );
                const fallbackPosition = qualityTimeline.length === 0
                    ? video.currentTime
                    : bufferedEnd > video.currentTime + 0.5
                        ? bufferedEnd
                        : video.currentTime;

                pushVideoQualitySample(
                    qualityEvent.mediaQuality,
                    shouldDelayToBufferedTail ? bufferedEnd : (explicitPosition ?? fallbackPosition),
                );
            }
            syncCurrentPlaybackQuality();
            updateDebugOverlay();
        };

        player.addEventListener('adaptation', listener);
        player.addEventListener('trackschanged', listener);
        player.addEventListener('variantchanged', listener);
        player.addEventListener('abrstatuschanged', listener);
        player.addEventListener('mediaqualitychanged', qualityListener);
        cleanup.push(() => {
            player?.removeEventListener?.('adaptation', listener);
            player?.removeEventListener?.('trackschanged', listener);
            player?.removeEventListener?.('variantchanged', listener);
            player?.removeEventListener?.('abrstatuschanged', listener);
            player?.removeEventListener?.('mediaqualitychanged', qualityListener);
        });
    };

    const createShakaPlayer = async (): Promise<ShakaPlayerInstance | undefined> => {
        const Player = shaka?.Player;
        if (!Player?.isBrowserSupported?.()) {
            return undefined;
        }

        shaka?.polyfill?.installAll?.();
        player = new Player();
        player.configure?.({
            abr: getShakaAbrConfig(win),
            streaming: SHAKA_STREAMING_CONFIG,
        });
        bindShakaEvents();
        await player.attach?.(video);
        return player;
    };

    const ensureShakaPlayer = async (): Promise<ShakaPlayerInstance | undefined> => {
        if (player) {
            return player;
        }

        return createShakaPlayer();
    };

    const loadSource = async (
        sourceUrl: string,
        sourceType: 'manifest' | 'stream',
        preservePlaybackState: boolean,
    ): Promise<boolean> => {
        const resumeTime = preservePlaybackState ? video.currentTime : (getSavedProgressEntry()?.t ?? 0);
        const shouldResume = preservePlaybackState && !video.paused;
        qualityTimeline = [];
        currentPlaybackQuality = undefined;
        pendingResumeDisplayTime = preservePlaybackState ? 0 : resumeTime;
        pendingResumeSeekTime = preservePlaybackState ? 0 : resumeTime;

        try {
            if (sourceType === 'manifest') {
                const shakaPlayer = await ensureShakaPlayer();
                if (!shakaPlayer) {
                    return false;
                }

                await shakaPlayer.load?.(sourceUrl);
                if (qualityMode === 'auto') {
                    shakaPlayer.configure?.({ abr: getShakaAbrConfig(win) });
                } else {
                    const track = getVariantTracks().find((item) => item.id === qualityMode);
                    if (track) {
                        shakaPlayer.configure?.({ abr: { enabled: false } });
                        shakaPlayer.selectVariantTrack?.(track, false);
                    } else {
                        qualityMode = 'auto';
                        shakaPlayer.configure?.({ abr: getShakaAbrConfig(win) });
                    }
                }
            } else {
                if (player) {
                    await player.destroy?.();
                    player = undefined;
                }

                video.src = sourceUrl;
            }
        } catch {
            return false;
        }

        if (currentSourceUrl !== sourceUrl || currentSourceType !== sourceType) {
            await destroyAmbientProbe();
        }
        currentSourceUrl = sourceUrl;
        currentSourceType = sourceType;

        if (resumeTime > 0) {
            video.currentTime = resumeTime;
        }

        if (shouldResume || (!preservePlaybackState && options.autoPlay)) {
            await video.play().catch(() => undefined);
        }

        if (!menu.hidden) {
            renderMenu();
            syncMenuHeight();
            scheduleMenuHeightSync();
        }

        void refreshAmbient(true);

        return true;
    };

    const loadStream = async (): Promise<void> => {
        const preferredQualityOption = options.qualityOptions?.find((option) => option.id === selectedQualityId)
            ?? options.qualityOptions?.[0];
        const sourceCandidates = [
            preferredQualityOption
                ? { sourceType: preferredQualityOption.sourceType, url: preferredQualityOption.url }
                : undefined,
            options.manifestUrl ? { sourceType: 'manifest' as const, url: options.manifestUrl } : undefined,
            { sourceType: 'stream' as const, url: options.streamUrl },
        ].filter((value): value is { sourceType: 'manifest' | 'stream'; url: string } => Boolean(value));

        let loaded = false;
        for (const candidate of sourceCandidates) {
            loaded = await loadSource(candidate.url, candidate.sourceType, false);
            if (loaded) {
                break;
            }
        }

        if (options.posterUrl) {
            video.poster = options.posterUrl;
        }
    };

    return loadStream().then(() => ({
        video,
        destroy: async () => {
            if (destroyed) {
                return;
            }

            destroyed = true;
            persistProgress(true);
            cleanup.splice(0).forEach((teardown) => teardown());
            if (idleTimer !== undefined) {
                win.clearTimeout(idleTimer);
            }
            await destroyAmbientProbe();
            await player?.destroy?.();
            target.innerHTML = '';
        },
    }));
}

export async function mountVideoPlayer(target: HTMLElement, options: VideoPlayerOptions): Promise<VideoPlayerHandle> {
    return bootVideoPlayer(target, options);
}

export function renderVideoPlayerDocument(options: VideoPlayerOptions, moduleUrl = '/_video-player.js'): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeHtml(options.title)}</title>
  <style>${getVideoPlayerStyles()}</style>
</head>
<body style="margin:0;background:#020617;">
  <div id="${ROOT_ID}" style="position:fixed;inset:0;"></div>
  <script type="module">
    import { mountVideoPlayer } from ${serializeForInlineScript(moduleUrl)};

    mountVideoPlayer(document.getElementById(${serializeForInlineScript(ROOT_ID)}), ${serializeForInlineScript({
    ...options,
    embed: true,
    fullViewport: true,
})}).catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to initialize video player.';
      document.body.innerHTML = '<div style="font-family:system-ui,sans-serif;padding:24px;color:#fee2e2;background:#020617;min-height:100%;">' + message + '</div>';
    });
  </script>
</body>
</html>`;
}
