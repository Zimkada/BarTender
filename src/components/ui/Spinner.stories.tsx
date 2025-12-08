import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Spinner, LoadingOverlay } from './Spinner';
import { Button } from './Button';
import { Card, CardContent } from './Card';

const meta = {
  title: 'UI/Spinner',
  component: Spinner,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'default', 'lg', 'xl'],
      description: 'Spinner size',
    },
    variant: {
      control: 'select',
      options: ['default', 'primary', 'secondary', 'white'],
      description: 'Spinner color variant',
    },
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic variants
export const Default: Story = {
  args: {},
};

export const Primary: Story = {
  args: {
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
};

export const White: Story = {
  render: () => (
    <div className="bg-gray-900 p-8 rounded-lg">
      <Spinner variant="white" />
    </div>
  ),
};

// Sizes
export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
  },
};

export const ExtraLarge: Story = {
  args: {
    size: 'xl',
  },
};

// All sizes showcase
export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div className="text-center">
        <Spinner size="sm" />
        <p className="text-xs text-gray-600 mt-2">Small</p>
      </div>
      <div className="text-center">
        <Spinner size="default" />
        <p className="text-xs text-gray-600 mt-2">Default</p>
      </div>
      <div className="text-center">
        <Spinner size="lg" />
        <p className="text-xs text-gray-600 mt-2">Large</p>
      </div>
      <div className="text-center">
        <Spinner size="xl" />
        <p className="text-xs text-gray-600 mt-2">XL</p>
      </div>
    </div>
  ),
};

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div className="text-center">
        <Spinner variant="default" />
        <p className="text-xs text-gray-600 mt-2">Default</p>
      </div>
      <div className="text-center">
        <Spinner variant="primary" />
        <p className="text-xs text-gray-600 mt-2">Primary</p>
      </div>
      <div className="text-center">
        <Spinner variant="secondary" />
        <p className="text-xs text-gray-600 mt-2">Secondary</p>
      </div>
      <div className="text-center bg-gray-900 p-4 rounded">
        <Spinner variant="white" />
        <p className="text-xs text-white mt-2">White</p>
      </div>
    </div>
  ),
};

// With text
export const WithText: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Spinner />
      <span className="text-sm text-gray-600">Chargement...</span>
    </div>
  ),
};

export const InButton: Story = {
  render: () => (
    <Button disabled>
      <Spinner size="sm" variant="white" />
      Chargement...
    </Button>
  ),
};

export const InCard: Story = {
  render: () => (
    <Card className="w-[300px]">
      <CardContent className="py-12">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-sm text-gray-600">Chargement des produits...</p>
        </div>
      </CardContent>
    </Card>
  ),
};

// Loading Overlay
export const OverlayExample: Story = {
  render: () => {
    const [loading, setLoading] = useState(false);

    const handleClick = () => {
      setLoading(true);
      setTimeout(() => setLoading(false), 3000);
    };

    return (
      <>
        <Button onClick={handleClick}>Show Loading Overlay</Button>
        <LoadingOverlay visible={loading} message="Chargement en cours..." />
      </>
    );
  },
};

export const OverlayWithoutMessage: Story = {
  render: () => {
    const [loading, setLoading] = useState(false);

    return (
      <>
        <Button onClick={() => setLoading(true)}>Show Overlay</Button>
        <LoadingOverlay visible={loading} message="" />
        {loading && (
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => setLoading(false)}
          >
            Close
          </Button>
        )}
      </>
    );
  },
};

// Real-world examples
export const LoadingProducts: Story = {
  render: () => (
    <Card className="w-[400px]">
      <CardContent className="py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <Spinner size="xl" />
          <div>
            <p className="font-medium text-gray-900">Chargement des produits</p>
            <p className="text-sm text-gray-600 mt-1">Veuillez patienter...</p>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
};

export const ProcessingPayment: Story = {
  render: () => {
    const [processing, setProcessing] = useState(false);

    return (
      <>
        <Button onClick={() => setProcessing(true)} disabled={processing}>
          {processing ? (
            <>
              <Spinner size="sm" variant="white" />
              Traitement en cours...
            </>
          ) : (
            'Payer'
          )}
        </Button>
        <LoadingOverlay
          visible={processing}
          message="Traitement du paiement..."
          size="lg"
        />
      </>
    );
  },
};

export const SavingData: Story = {
  render: () => {
    const [saving, setSaving] = useState(false);

    const handleSave = () => {
      setSaving(true);
      setTimeout(() => setSaving(false), 2000);
    };

    return (
      <Card className="w-[350px]">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4">Modifier le produit</h3>
          <div className="space-y-4">
            <input
              type="text"
              defaultValue="Coca-Cola 33cl"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              disabled={saving}
            />
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Spinner size="sm" variant="white" />
                  Enregistrement...
                </>
              ) : (
                'Enregistrer'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  },
};
