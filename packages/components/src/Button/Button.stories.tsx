import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta = {
    title: 'Components/Button',
    component: Button,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        variant: {
            control: 'select',
            options: ['primary', 'secondary', 'danger', 'ghost'],
        },
        isDisabled: {
            control: 'boolean'
        }
    },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        variant: 'primary',
        children: 'Primary Button',
    },
};

export const Secondary: Story = {
    args: {
        variant: 'secondary',
        children: 'Secondary Button',
    },
};

export const Danger: Story = {
    args: {
        variant: 'danger',
        children: 'Delete Item',
    },
};

export const Ghost: Story = {
    args: {
        variant: 'ghost',
        children: 'Cancel',
    },
};
