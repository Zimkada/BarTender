import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from './Textarea';

const meta = {
  title: 'UI/Textarea',
  component: Textarea,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the textarea is disabled',
    },
    rows: {
      control: 'number',
      description: 'Number of visible text lines',
    },
  },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Enter your text here...',
  },
};

export const WithDefaultValue: Story = {
  args: {
    defaultValue: 'This is some pre-filled content in the textarea.',
    placeholder: 'Enter your text...',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: 'This textarea is disabled.',
    placeholder: 'You cannot edit this',
  },
};

export const WithRows: Story = {
  args: {
    rows: 10,
    placeholder: 'This textarea has 10 rows...',
  },
};

export const WithLongContent: Story = {
  args: {
    defaultValue: `This is a textarea with longer content to demonstrate how it handles multiple lines of text.

You can write paragraphs, use line breaks, and the textarea will automatically adjust its scrolling behavior.

It's perfect for comments, descriptions, notes, and other multi-line text input scenarios.`,
    rows: 6,
  },
};

export const Small: Story = {
  args: {
    rows: 3,
    placeholder: 'Small textarea with 3 rows',
  },
};

export const Large: Story = {
  args: {
    rows: 15,
    placeholder: 'Large textarea with 15 rows',
  },
};
