import type { Meta, StoryObj } from '@storybook/react';
import { Alert } from './Alert';

const meta = {
  title: 'UI/Alert',
  component: Alert,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'warning', 'success', 'info'],
      description: 'The visual style of the alert',
    },
    title: {
      control: 'text',
      description: 'Optional title for the alert',
    },
    show: {
      control: 'boolean',
      description: 'Controls visibility with animation',
    },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: 'default',
    show: true,
    children: 'This is a default alert message.',
  },
};

export const WithTitle: Story = {
  args: {
    variant: 'info',
    title: 'Information',
    show: true,
    children: 'This alert has a title to provide more context.',
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    title: 'Error',
    show: true,
    children: 'Something went wrong. Please try again.',
  },
};

export const Warning: Story = {
  args: {
    variant: 'warning',
    title: 'Warning',
    show: true,
    children: 'This action cannot be undone. Please proceed with caution.',
  },
};

export const Success: Story = {
  args: {
    variant: 'success',
    title: 'Success',
    show: true,
    children: 'Your changes have been saved successfully.',
  },
};

export const Info: Story = {
  args: {
    variant: 'info',
    title: 'Did you know?',
    show: true,
    children: 'You can customize alerts with different variants and icons.',
  },
};

export const LongContent: Story = {
  args: {
    variant: 'warning',
    title: 'Important Notice',
    show: true,
    children: 'This is a longer alert message that demonstrates how the component handles multiple lines of text. It should wrap nicely and maintain proper spacing between all elements including the icon, title, and description.',
  },
};

export const WithoutTitle: Story = {
  args: {
    variant: 'success',
    show: true,
    children: 'This alert has no title, just the description text.',
  },
};

export const AnimatedEntry: Story = {
  args: {
    variant: 'info',
    title: 'Animated',
    show: true,
    children: 'This alert animates in when show is true.',
  },
  parameters: {
    docs: {
      description: {
        story: 'The Alert component uses Framer Motion to animate in and out when the `show` prop changes.',
      },
    },
  },
};
