import type { Meta, StoryObj } from '@storybook/react';
import { CheckCircle, XCircle, AlertCircle, Info, Package, TrendingUp } from 'lucide-react';
import { Badge } from './Badge';
import { Card, CardContent } from './Card';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'success', 'warning', 'danger', 'info', 'outline'],
      description: 'Badge visual variant',
    },
    size: {
      control: 'select',
      options: ['sm', 'default', 'lg'],
      description: 'Badge size',
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic variants
export const Default: Story = {
  args: {
    children: 'Badge',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary',
  },
};

export const Success: Story = {
  args: {
    variant: 'success',
    children: 'Success',
  },
};

export const Warning: Story = {
  args: {
    variant: 'warning',
    children: 'Warning',
  },
};

export const Danger: Story = {
  args: {
    variant: 'danger',
    children: 'Danger',
  },
};

export const Info: Story = {
  args: {
    variant: 'info',
    children: 'Info',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline',
  },
};

// Sizes
export const Small: Story = {
  args: {
    size: 'sm',
    children: 'Small',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    children: 'Large',
  },
};

// With icons
export const WithIcon: Story = {
  args: {
    variant: 'success',
    icon: <CheckCircle size={12} />,
    children: 'Completed',
  },
};

export const WithDot: Story = {
  args: {
    variant: 'success',
    dot: true,
    children: 'Active',
  },
};

export const WithIconAndDot: Story = {
  args: {
    variant: 'info',
    icon: <Info size={12} />,
    dot: true,
    children: 'Info',
  },
};

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="danger">Danger</Badge>
      <Badge variant="info">Info</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

// All sizes showcase
export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Badge size="sm">Small</Badge>
      <Badge size="default">Default</Badge>
      <Badge size="lg">Large</Badge>
    </div>
  ),
};

// Real-world BarTender examples
export const StockStatus: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
        <span className="text-sm">Coca-Cola 33cl</span>
        <Badge variant="success" dot>
          En stock
        </Badge>
      </div>
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
        <span className="text-sm">Sprite 50cl</span>
        <Badge variant="warning" dot>
          Stock bas
        </Badge>
      </div>
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
        <span className="text-sm">Fanta 33cl</span>
        <Badge variant="danger" dot>
          Rupture
        </Badge>
      </div>
    </div>
  ),
};

export const OrderStatus: Story = {
  render: () => (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Commande #1234</p>
              <p className="text-sm text-gray-600">15,000 FCFA</p>
            </div>
            <Badge variant="info" icon={<Info size={12} />}>
              En préparation
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Commande #1235</p>
              <p className="text-sm text-gray-600">22,500 FCFA</p>
            </div>
            <Badge variant="success" icon={<CheckCircle size={12} />}>
              Livrée
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Commande #1236</p>
              <p className="text-sm text-gray-600">8,000 FCFA</p>
            </div>
            <Badge variant="danger" icon={<XCircle size={12} />}>
              Annulée
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  ),
};

export const ProductCategories: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Coca-Cola 33cl</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">Boissons</Badge>
          <Badge variant="info" size="sm">
            Sans alcool
          </Badge>
          <Badge variant="success" size="sm">
            Populaire
          </Badge>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Heineken 33cl</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">Boissons</Badge>
          <Badge variant="warning" size="sm">
            Alcool
          </Badge>
          <Badge variant="outline" size="sm">
            Importé
          </Badge>
        </div>
      </div>
    </div>
  ),
};

export const PriceChange: Story = {
  render: () => (
    <Card className="w-[300px]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-semibold">Coca-Cola 33cl</p>
            <p className="text-sm text-gray-600">Boissons</p>
          </div>
          <Badge variant="success" icon={<TrendingUp size={12} />}>
            +5%
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Ancien prix:</span>
          <span className="text-sm line-through text-gray-400">450 FCFA</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Nouveau prix:</span>
          <span className="text-lg font-bold text-green-600">500 FCFA</span>
        </div>
      </CardContent>
    </Card>
  ),
};

export const PromotionBadge: Story = {
  render: () => (
    <Card className="w-[250px] relative overflow-hidden">
      <div className="absolute top-2 right-2">
        <Badge variant="danger" size="sm">
          -20%
        </Badge>
      </div>
      <CardContent className="pt-6">
        <div className="aspect-square bg-gray-100 rounded-lg mb-4 flex items-center justify-center">
          <Package size={48} className="text-gray-400" />
        </div>
        <h4 className="font-semibold">Coca-Cola 33cl</h4>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-sm line-through text-gray-400">500 FCFA</span>
          <span className="text-lg font-bold text-red-600">400 FCFA</span>
        </div>
      </CardContent>
    </Card>
  ),
};

export const MultipleStatuses: Story = {
  render: () => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="success" dot size="sm">
          En ligne
        </Badge>
        <Badge variant="info" size="sm">
          3 notifications
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="warning" dot size="sm">
          Maintenance
        </Badge>
        <Badge variant="outline" size="sm">
          Prévu: 2h
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="danger" dot size="sm">
          Hors ligne
        </Badge>
        <Badge variant="secondary" size="sm">
          Depuis 5 min
        </Badge>
      </div>
    </div>
  ),
};

export const InteractiveBadges: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Filtrer par statut:</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="cursor-pointer hover:bg-gray-100">
            Tous (24)
          </Badge>
          <Badge variant="success" className="cursor-pointer">
            En stock (18)
          </Badge>
          <Badge variant="warning" className="cursor-pointer hover:bg-yellow-200">
            Stock bas (4)
          </Badge>
          <Badge variant="danger" className="cursor-pointer hover:bg-red-200">
            Rupture (2)
          </Badge>
        </div>
      </div>
    </div>
  ),
};
