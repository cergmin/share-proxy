import type { Meta, StoryObj } from '@storybook/react';
import { TextField } from './TextField';

const meta = {
    title: 'Components/TextField',
    component: TextField,
    parameters: {
        layout: 'padded',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        label: 'Email',
        placeholder: 'Enter your email',
    },
};

export const WithDescription: Story = {
    args: {
        label: 'Username',
        description: 'This will be your public display name.',
        placeholder: 'johndoe',
    },
};

export const Invalid: Story = {
    args: {
        label: 'Password',
        isInvalid: true,
        errorMessage: 'Password must be at least 8 characters long.',
        defaultValue: 'pass',
    },
};

export const Disabled: Story = {
    args: {
        label: 'Organization Name',
        isDisabled: true,
        defaultValue: 'Share Proxy Corp',
    },
};
