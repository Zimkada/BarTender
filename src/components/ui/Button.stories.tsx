import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Trash2, Edit, Download } from 'lucide-react';
import { Button } from './Button';

const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
      description: 'Visual style variant',
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
      description: 'Size variant',
    },
    asChild: {
      control: 'boolean',
      description: 'Render as child component (Radix Slot)',
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default variant stories
export const Default: Story = {
  args: {
    children: 'Button',
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Delete',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Cancel',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Action',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Ghost Button',
  },
};

export const Link: Story = {
  args: {
    variant: 'link',
    children: 'Link Button',
  },
};

// Size variants
export const Small: Story = {
  args: {
    size: 'sm',
    children: 'Small Button',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    children: 'Large Button',
  },
};

export const Icon: Story = {
  args: {
    size: 'icon',
    children: <Plus />,
  },
};

// With icons
export const WithIconLeft: Story = {
  args: {
    children: (
      <>
        <Plus size={16} />
        Add Item
      </>
    ),
    className: 'gap-2',
  },
};

export const WithIconRight: Story = {
  args: {
    children: (
      <>
        Download
        <Download size={16} />
      </>
    ),
    className: 'gap-2',
  },
};

// Destructive with icon
export const DestructiveWithIcon: Story = {
  args: {
    variant: 'destructive',
    children: (
      <>
        <Trash2 size={16} />
        Delete
      </>
    ),
    className: 'gap-2',
  },
};

// Outline with icon
export const OutlineWithIcon: Story = {
  args: {
    variant: 'outline',
    children: (
      <>
        <Edit size={16} />
        Edit
      </>
    ),
    className: 'gap-2',
  },
};

// Disabled states
export const Disabled: Story = {
  args: {
    children: 'Disabled Button',
    disabled: true,
  },
};

export const DisabledDestructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Disabled Delete',
    disabled: true,
  },
};

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap">
        <Button>Default</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <Button size="sm">Small</Button>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
        <Button size="icon"><Plus /></Button>
      </div>
    </div>
  ),
};

// Real-world examples from BarTender
export const BarTenderExamples: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-4 bg-gray-50 rounded-lg">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Actions courantes</h3>
        <div className="flex gap-2 flex-wrap">
          <Button className="gap-2">
            <Plus size={16} />
            Nouveau retour
          </Button>
          <Button variant="secondary">Annuler</Button>
          <Button variant="destructive" className="gap-2">
            <Trash2 size={16} />
            Supprimer
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Boutons icône</h3>
        <div className="flex gap-2">
          <Button size="icon" variant="ghost">
            <Edit size={18} />
          </Button>
          <Button size="icon" variant="outline">
            <Download size={18} />
          </Button>
          <Button size="icon" variant="destructive">
            <Trash2 size={18} />
          </Button>
        </div>
      </div>
    </div>
  ),
};
