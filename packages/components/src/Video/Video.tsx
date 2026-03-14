import { mountVideoPlayer, type VideoPlayerOptions } from '@share-proxy/video-player';
import { useEffect, useRef } from 'react';
import styles from './Video.module.css';

export interface VideoProps extends VideoPlayerOptions {
    className?: string;
}

export function Video({
    ambientBlendWindowSeconds,
    ambientBlurPx,
    ambientFrameIntervalSeconds,
    className,
    ambient,
    autoPlay,
    embed,
    fullViewport,
    manifestUrl,
    persistenceKey,
    posterUrl,
    previewTracksUrl,
    qualityOptions,
    streamUrl,
    title,
}: VideoProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) {
            return;
        }

        let disposed = false;
        let destroyPlayer: (() => Promise<void>) | undefined;

        void mountVideoPlayer(root, {
            ambient,
            ambientBlendWindowSeconds,
            ambientBlurPx,
            ambientFrameIntervalSeconds,
            autoPlay,
            embed,
            fullViewport,
            manifestUrl,
            persistenceKey,
            posterUrl,
            previewTracksUrl,
            qualityOptions,
            streamUrl,
            title,
        }).then((handle) => {
            if (disposed) {
                void handle.destroy();
                return;
            }

            destroyPlayer = handle.destroy;
        });

        return () => {
            disposed = true;
            if (destroyPlayer) {
                void destroyPlayer();
            }
        };
    }, [ambient, ambientBlendWindowSeconds, ambientBlurPx, ambientFrameIntervalSeconds, autoPlay, embed, fullViewport, manifestUrl, persistenceKey, posterUrl, previewTracksUrl, qualityOptions, streamUrl, title]);

    return <div ref={rootRef} className={`${styles.root}${className ? ` ${className}` : ''}`} />;
}
