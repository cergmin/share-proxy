import type { Meta, StoryObj } from '@storybook/react';
import { Select, SelectItem } from './Select';

const meta = {
    title: 'Components/Select',
    component: Select,
    parameters: {
        layout: 'padded',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const options = [
    { id: 'jellyfin', name: 'Jellyfin' },
    { id: 'gdrive', name: 'Google Drive' },
    { id: 's3', name: 'AWS S3' }
];

export const Default: Story = {
    args: {
        label: 'Adapter Type',
        placeholder: 'Select an adapter...',
        items: options,
        children: (item: any) => <SelectItem>{item.name}</SelectItem>
    },
};

export const WithDescription: Story = {
    args: {
        label: 'Resource Type',
        description: 'Select whether you are sharing a single file or a folder.',
        defaultSelectedKey: 'file',
        items: [
            { id: 'file', name: 'File' },
            { id: 'folder', name: 'Folder' },
            { id: 'playlist', name: 'Playlist' }
        ],
        children: (item: any) => <SelectItem>{item.name}</SelectItem>
    },
};

export const Disabled: Story = {
    args: {
        label: 'Category',
        isDisabled: true,
        defaultSelectedKey: 'movies',
        items: [{ id: 'movies', name: 'Movies' }],
        children: (item: any) => <SelectItem>{item.name}</SelectItem>
    },
};
