import type { Meta, StoryObj } from '@storybook/react';
import { Package, TrendingUp, AlertCircle, DollarSign, ShoppingCart } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card';
import { Button } from './Button';
import { Badge } from './Badge';

const meta = {
  title: 'UI/Card',
  component: Card,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'elevated', 'outline', 'ghost'],
      description: 'Card visual variant',
    },
    padding: {
      control: 'select',
      options: ['none', 'sm', 'default', 'lg'],
      description: 'Card padding',
    },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic variants
export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600">This is the main content of the card.</p>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Action</Button>
      </CardFooter>
    </Card>
  ),
};

export const Elevated: Story = {
  render: () => (
    <Card variant="elevated" className="w-[350px]">
      <CardHeader>
        <CardTitle>Elevated Card</CardTitle>
        <CardDescription>This card has a shadow effect</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600">Hover over this card to see the shadow animation.</p>
      </CardContent>
    </Card>
  ),
};

export const Outline: Story = {
  render: () => (
    <Card variant="outline" className="w-[350px]">
      <CardHeader>
        <CardTitle>Outline Card</CardTitle>
        <CardDescription>Transparent background with border</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600">Good for layering on colored backgrounds.</p>
      </CardContent>
    </Card>
  ),
};

export const Ghost: Story = {
  render: () => (
    <Card variant="ghost" className="w-[350px]">
      <CardHeader>
        <CardTitle>Ghost Card</CardTitle>
        <CardDescription>Subtle gray background</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600">Minimal visual weight.</p>
      </CardContent>
    </Card>
  ),
};

// Padding variants
export const NoPadding: Story = {
  render: () => (
    <Card padding="none" className="w-[350px] overflow-hidden">
      <div className="h-48 bg-gradient-to-r from-amber-500 to-orange-500" />
      <div className="p-6">
        <h3 className="font-semibold">Custom Padding</h3>
        <p className="text-sm text-gray-600 mt-2">You can control padding manually with padding="none".</p>
      </div>
    </Card>
  ),
};

export const SmallPadding: Story = {
  render: () => (
    <Card padding="sm" className="w-[350px]">
      <p className="text-sm text-gray-600">This card has small padding (16px).</p>
    </Card>
  ),
};

export const LargePadding: Story = {
  render: () => (
    <Card padding="lg" className="w-[350px]">
      <p className="text-sm text-gray-600">This card has large padding (32px).</p>
    </Card>
  ),
};

// Real-world BarTender examples
export const ProductCard: Story = {
  render: () => (
    <Card variant="elevated" className="w-[300px]">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Package size={20} className="text-amber-600" />
            <CardTitle>Coca-Cola 33cl</CardTitle>
          </div>
          <Badge variant="success">En stock</Badge>
        </div>
        <CardDescription>Boissons · Code: 123456</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Prix:</span>
            <span className="font-semibold">500 FCFA</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Stock:</span>
            <span className="font-semibold">45 unités</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Catégorie:</span>
            <span>Boissons</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="secondary" className="flex-1" size="sm">
          Modifier
        </Button>
        <Button className="flex-1" size="sm">
          <ShoppingCart size={16} />
          Vendre
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const StatsCard: Story = {
  render: () => (
    <Card variant="elevated" className="w-[280px]">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Ventes du jour</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">45,000 FCFA</p>
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <TrendingUp size={12} />
              +12% vs hier
            </p>
          </div>
          <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
            <DollarSign size={24} className="text-amber-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  ),
};

export const AlertCard: Story = {
  render: () => (
    <Card variant="outline" className="w-[350px] border-yellow-300 bg-yellow-50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle size={20} className="text-yellow-600" />
          <CardTitle className="text-yellow-900">Stock Bas</CardTitle>
        </div>
        <CardDescription className="text-yellow-700">
          3 produits nécessitent votre attention
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between items-center p-2 bg-white rounded">
            <span className="text-sm">Coca-Cola 33cl</span>
            <Badge variant="warning" size="sm">
              2 restants
            </Badge>
          </div>
          <div className="flex justify-between items-center p-2 bg-white rounded">
            <span className="text-sm">Sprite 50cl</span>
            <Badge variant="warning" size="sm">
              4 restants
            </Badge>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="secondary" size="sm" className="w-full">
          Commander maintenant
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const SalesSummaryCard: Story = {
  render: () => (
    <Card className="w-[400px]">
      <CardHeader>
        <CardTitle>Résumé des ventes</CardTitle>
        <CardDescription>Performance du mois en cours</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm text-gray-600">Total ventes</p>
              <p className="text-xl font-bold">1,250,000 FCFA</p>
            </div>
            <Badge variant="success">+15%</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">Transactions</p>
              <p className="text-lg font-semibold mt-1">324</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">Panier moyen</p>
              <p className="text-lg font-semibold mt-1">3,858 F</p>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="secondary" className="w-full">
          Voir le détail
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const ProductGridCard: Story = {
  render: () => (
    <Card variant="elevated" className="w-[250px] cursor-pointer hover:shadow-lg transition-shadow">
      <CardContent className="pt-6">
        <div className="aspect-square bg-gray-100 rounded-lg mb-4 flex items-center justify-center">
          <Package size={48} className="text-gray-400" />
        </div>
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <h4 className="font-semibold">Coca-Cola 33cl</h4>
            <Badge variant="success" size="sm">
              En stock
            </Badge>
          </div>
          <p className="text-sm text-gray-600">45 unités disponibles</p>
          <div className="flex items-center justify-between pt-2">
            <span className="text-lg font-bold text-amber-600">500 FCFA</span>
            <Button size="sm">
              <ShoppingCart size={14} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
};

export const EmptyStateCard: Story = {
  render: () => (
    <Card variant="ghost" className="w-[400px]">
      <CardContent className="py-12">
        <div className="text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-gray-100 mx-auto flex items-center justify-center">
            <Package size={32} className="text-gray-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Aucun produit</h3>
            <p className="text-sm text-gray-600 mt-1">
              Commencez par ajouter votre premier produit
            </p>
          </div>
          <Button>Ajouter un produit</Button>
        </div>
      </CardContent>
    </Card>
  ),
};

// Showcase
export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 p-6 bg-gray-50 rounded-lg">
      <Card className="p-4">
        <p className="text-sm font-medium">Default</p>
      </Card>
      <Card variant="elevated" className="p-4">
        <p className="text-sm font-medium">Elevated</p>
      </Card>
      <Card variant="outline" className="p-4">
        <p className="text-sm font-medium">Outline</p>
      </Card>
      <Card variant="ghost" className="p-4">
        <p className="text-sm font-medium">Ghost</p>
      </Card>
    </div>
  ),
};
