import type { Meta, StoryObj } from '@storybook/react';
import { Package, RotateCcw, Gift } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { Button } from '../ui/Button';

// Mock react-router-dom module for Storybook
import * as ReactRouterDom from 'react-router-dom';

// @ts-ignore - Mock useNavigate for Storybook
ReactRouterDom.useNavigate = () => () => console.log('Navigate back');

const meta = {
  title: 'Common/PageHeader',
  component: PageHeader,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
      description: 'Page title',
    },
    subtitle: {
      control: 'text',
      description: 'Optional subtitle/description',
    },
    hideSubtitleOnMobile: {
      control: 'boolean',
      description: 'Hide subtitle on mobile to save space',
    },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-100 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic examples
export const Default: Story = {
  args: {
    title: 'Page Title',
    subtitle: 'This is a subtitle description',
  },
};

export const WithIcon: Story = {
  args: {
    title: 'Returns Management',
    subtitle: 'Manage customer returns and refunds',
    icon: <RotateCcw size={24} className="text-amber-600" />,
  },
};

export const WithoutSubtitle: Story = {
  args: {
    title: 'Simple Page',
  },
};

// With actions
export const WithActions: Story = {
  args: {
    title: 'Système de Retours',
    subtitle: 'Gérer les retours clients et remboursements',
    icon: <RotateCcw size={24} className="text-amber-600" />,
    actions: (
      <div className="flex items-center gap-2">
        <Button>Nouveau retour</Button>
      </div>
    ),
  },
};

export const WithMultipleActions: Story = {
  args: {
    title: 'Product Management',
    subtitle: 'Manage your product catalog',
    icon: <Package size={24} className="text-amber-600" />,
    actions: (
      <div className="flex items-center gap-2">
        <Button variant="secondary">Import</Button>
        <Button>Add Product</Button>
      </div>
    ),
  },
};

// Mobile optimizations
export const HideSubtitleOnMobile: Story = {
  args: {
    title: 'Gestion des Consignations',
    subtitle: 'Gérer les produits consignés et récupérations',
    icon: <Package size={24} className="text-amber-600" />,
    hideSubtitleOnMobile: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Subtitle is hidden on mobile (<640px) to save vertical space for forms.',
      },
    },
  },
};

export const WithMobileActions: Story = {
  args: {
    title: 'Système de Retours',
    subtitle: 'Gérer les retours clients et remboursements',
    icon: <RotateCcw size={24} className="text-amber-600" />,
    hideSubtitleOnMobile: true,
    // Desktop: compact button
    actions: (
      <div className="flex items-center gap-2">
        <Button>Nouveau retour</Button>
      </div>
    ),
    // Mobile: explicit full-width button
    mobileActions: (
      <div className="flex items-center gap-2 w-full">
        <Button className="flex-1 gap-2">
          <RotateCcw size={18} />
          Nouveau retour
        </Button>
      </div>
    ),
  },
  parameters: {
    docs: {
      description: {
        story: 'Different actions for mobile: full-width explicit button with icon + text.',
      },
    },
  },
};

// Real-world examples from BarTender
export const ReturnsPage: Story = {
  args: {
    title: 'Système de Retours',
    subtitle: 'Gérer les retours clients et remboursements',
    icon: <RotateCcw size={24} className="text-amber-600" />,
    hideSubtitleOnMobile: true,
    actions: (
      <div className="flex items-center gap-2">
        <Button>Nouveau retour</Button>
      </div>
    ),
    mobileActions: (
      <div className="flex items-center gap-2 w-full">
        <Button className="flex-1 gap-2">
          <RotateCcw size={18} />
          Nouveau retour
        </Button>
      </div>
    ),
  },
};

export const ConsignmentPage: Story = {
  args: {
    title: 'Gestion des Consignations',
    subtitle: 'Gérer les produits consignés et récupérations',
    icon: <Package size={24} className="text-amber-600" />,
    hideSubtitleOnMobile: true,
  },
};

export const PromotionsPageHeader: Story = {
  args: {
    title: 'Gestion des Promotions',
    subtitle: 'Créez et gérez vos offres spéciales',
    icon: <Gift size={24} className="text-amber-600" />,
  },
  parameters: {
    docs: {
      description: {
        story: 'PromotionsPage uses a custom header with integrated view switcher, not PageHeader component.',
      },
    },
  },
};

// Responsive showcase
export const ResponsiveShowcase: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold mb-2 text-gray-700">Desktop (≥ 640px)</h3>
        <PageHeader
          title="Page Title"
          subtitle="This subtitle is visible on desktop"
          icon={<Package size={24} className="text-amber-600" />}
          hideSubtitleOnMobile
          actions={
            <Button>Action Button</Button>
          }
        />
      </div>

      <div className="max-w-sm">
        <h3 className="text-sm font-semibold mb-2 text-gray-700">Mobile (&lt; 640px) - Resize viewport</h3>
        <PageHeader
          title="Compact Title"
          subtitle="Hidden on small screens"
          icon={<Package size={24} className="text-amber-600" />}
          hideSubtitleOnMobile
          mobileActions={
            <Button className="w-full gap-2">
              <Package size={18} />
              Full Width Action
            </Button>
          }
        />
      </div>
    </div>
  ),
};

// Space savings showcase
export const SpaceSavings: Story = {
  render: () => (
    <div className="grid md:grid-cols-2 gap-8">
      <div>
        <h3 className="text-sm font-semibold mb-2 text-gray-700">Before (Desktop spacing)</h3>
        <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white rounded-2xl shadow-sm p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded flex items-center justify-center">←</div>
              <div>
                <h1 className="text-2xl font-bold">Page Title</h1>
                <p className="text-sm text-amber-100 mt-1">Full subtitle visible</p>
              </div>
            </div>
          </div>
          <div className="mt-4 text-xs text-amber-100">Height: ~100px</div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2 text-gray-700">After (Mobile optimized)</h3>
        <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white rounded-2xl shadow-sm p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-white/20 rounded flex items-center justify-center text-sm">←</div>
              <div>
                <h1 className="text-lg font-bold">Page Title</h1>
              </div>
            </div>
          </div>
          <div className="mt-4 text-xs text-amber-100">Height: ~62px (-38px saved!)</div>
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Mobile optimization saves ~38px of vertical space: padding (16px), gaps (4px), title size (2px), icon (4px), margins (12px).',
      },
    },
  },
};
