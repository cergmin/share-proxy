import type { Meta, StoryObj } from '@storybook/react';
import { DatePicker } from './Calendar';
import { today, getLocalTimeZone } from '@internationalized/date';

const meta = {
    title: 'Components/DatePicker',
    component: DatePicker,
    parameters: {
        layout: 'padded',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        label: 'Meeting Date',
    },
};

export const WithDescription: Story = {
    args: {
        label: 'Link Expiry',
        description: 'When should this proxy link automatically disable?',
    },
};

export const Disabled: Story = {
    args: {
        label: 'Hire Date',
        isDisabled: true,
    },
};

export const CustomValue: Story = {
    args: {
        label: 'Event date',
        defaultValue: today(getLocalTimeZone()),
    },
};
