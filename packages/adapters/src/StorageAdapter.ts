export interface Node {
    id: string; // Internal identifier for the service
    name: string;
    type: 'file' | 'folder' | 'playlist';
    size?: number;
    mimeType?: string;
    duration?: number; // In seconds, useful for video/audio
}

export interface StorageAdapter<TConfig extends Record<string, any>> {
    // Config injected from the DB encrypted field
    config: TConfig;

    // Initialize checks if credentials are valid
    initialize(): Promise<boolean>;

    // Fetches a list of files/folders in a given directory ID (or root if null)
    listDirectory(directoryId?: string): Promise<Node[]>;

    // Returns a readable stream of the file, taking range into account
    getFileStream(fileId: string, range?: { start: number; end?: number }): Promise<{
        stream: NodeJS.ReadableStream;
        size: number;
        mimeType: string;
        acceptRanges: 'bytes' | 'none';
    }>;
}
