import { accessRules, links, resources, sources } from '@share-proxy/db';
import type { PreviewTrackEntry } from '@share-proxy/video-player';

export type LinkRow = typeof links.$inferSelect;
export type ResourceRow = typeof resources.$inferSelect;
export type SourceRow = typeof sources.$inferSelect;
export type AccessRuleRow = typeof accessRules.$inferSelect;

export interface ResolvedLink {
    accessRules: AccessRuleRow[];
    link: LinkRow;
    resource: ResourceRow;
    source: SourceRow;
}

export interface JellyfinSourceConfig {
    apiKey: string;
    url: string;
    userId?: string;
}

export interface JellyfinPlaybackContext {
    mediaSourceId?: string;
    userId?: string;
}

export interface MediaProxyTokenData {
    target: string;
}

export interface ParsedTrickplayEntry extends PreviewTrackEntry {
    sheetIndex: number;
    upstreamUrl: string;
}

export interface JellyfinManifestVariant {
    infoLine: string;
    upstreamUrl: string;
    width?: number;
}
