import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Search, Mail, Lock, Eye, EyeOff, DollarSign, Package } from 'lucide-react';
import { Input } from './Input';
import { Button } from './Button';

const meta = {
  title: 'UI/Input',
  component: Input,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'error', 'success'],
      description: 'Visual variant',
    },
    size: {
      control: 'select',
      options: ['sm', 'default', 'lg'],
      description: 'Input size',
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
    required: {
      control: 'boolean',
      description: 'Required field',
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic variants
export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Email',
    placeholder: 'your@email.com',
    type: 'email',
  },
};

export const Required: Story = {
  args: {
    label: 'Username',
    placeholder: 'Enter username',
    required: true,
  },
};

export const WithHelperText: Story = {
  args: {
    label: 'Password',
    type: 'password',
    placeholder: '••••••••',
    helperText: 'Must be at least 8 characters',
  },
};

export const WithError: Story = {
  args: {
    label: 'Email',
    type: 'email',
    placeholder: 'your@email.com',
    defaultValue: 'invalid-email',
    error: 'Please enter a valid email address',
  },
};

export const Success: Story = {
  args: {
    label: 'Username',
    variant: 'success',
    defaultValue: 'johndoe',
    helperText: 'Username is available',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Input',
    placeholder: 'Cannot edit',
    disabled: true,
    defaultValue: 'Disabled value',
  },
};

// Sizes
export const Small: Story = {
  args: {
    size: 'sm',
    placeholder: 'Small input',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    placeholder: 'Large input',
  },
};

// With icons
export const WithLeftIcon: Story = {
  args: {
    label: 'Search',
    placeholder: 'Search products...',
    leftIcon: <Search size={18} />,
  },
};

export const WithRightIcon: Story = {
  args: {
    label: 'Email',
    type: 'email',
    placeholder: 'your@email.com',
    rightIcon: <Mail size={18} />,
  },
};

export const WithBothIcons: Story = {
  args: {
    label: 'Price',
    type: 'number',
    placeholder: '0.00',
    leftIcon: <DollarSign size={18} />,
    rightIcon: <Package size={18} />,
  },
};

// Input types
export const TextInput: Story = {
  args: {
    label: 'Full Name',
    type: 'text',
    placeholder: 'John Doe',
  },
};

export const EmailInput: Story = {
  args: {
    label: 'Email Address',
    type: 'email',
    placeholder: 'your@email.com',
    leftIcon: <Mail size={18} />,
  },
};

export const PasswordInput: Story = {
  args: {
    label: 'Password',
    type: 'password',
    placeholder: '••••••••',
    leftIcon: <Lock size={18} />,
  },
};

export const NumberInput: Story = {
  args: {
    label: 'Quantity',
    type: 'number',
    placeholder: '0',
    min: 0,
  },
};

export const DateInput: Story = {
  args: {
    label: 'Date',
    type: 'date',
  },
};

// Interactive examples
export const InteractivePasswordToggle: Story = {
  render: () => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="w-full max-w-sm">
        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Enter password"
          leftIcon={<Lock size={18} />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="hover:text-gray-600 transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
        />
      </div>
    );
  },
};

export const InteractiveValidation: Story = {
  render: () => {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');

    const validateEmail = (value: string) => {
      if (!value) {
        setError('Email is required');
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setError('Please enter a valid email address');
      } else {
        setError('');
      }
    };

    return (
      <div className="w-full max-w-sm">
        <Input
          label="Email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            validateEmail(e.target.value);
          }}
          error={error}
          variant={!error && email ? 'success' : undefined}
          leftIcon={<Mail size={18} />}
          required
        />
      </div>
    );
  },
};

// Real-world BarTender examples
export const ProductNameInput: Story = {
  args: {
    label: 'Nom du produit',
    placeholder: 'Ex: Coca-Cola 33cl',
    helperText: 'Le nom apparaîtra sur les reçus',
    required: true,
  },
};

export const PriceInput: Story = {
  args: {
    label: 'Prix de vente',
    type: 'number',
    placeholder: '0.00',
    leftIcon: <DollarSign size={18} />,
    helperText: 'Prix TTC en FCFA',
    min: 0,
    step: 0.01,
    required: true,
  },
};

export const StockQuantityInput: Story = {
  args: {
    label: 'Quantité en stock',
    type: 'number',
    placeholder: '0',
    helperText: 'Nombre d\'unités disponibles',
    min: 0,
    required: true,
  },
};

export const SearchProductInput: Story = {
  args: {
    placeholder: 'Rechercher un produit...',
    leftIcon: <Search size={18} />,
    size: 'lg',
  },
};

// Form example
export const ProductForm: Story = {
  render: () => {
    const [formData, setFormData] = useState({
      name: '',
      price: '',
      stock: '',
      barcode: '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const newErrors: Record<string, string> = {};

      if (!formData.name) newErrors.name = 'Le nom est requis';
      if (!formData.price) newErrors.price = 'Le prix est requis';
      if (!formData.stock) newErrors.stock = 'La quantité est requise';

      setErrors(newErrors);

      if (Object.keys(newErrors).length === 0) {
        console.log('Form submitted:', formData);
      }
    };

    return (
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 p-6 bg-white rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Ajouter un produit</h3>

        <Input
          label="Nom du produit"
          placeholder="Ex: Coca-Cola 33cl"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={errors.name}
          required
        />

        <Input
          label="Prix de vente"
          type="number"
          placeholder="0.00"
          leftIcon={<DollarSign size={18} />}
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          error={errors.price}
          helperText="Prix TTC en FCFA"
          min={0}
          step={0.01}
          required
        />

        <Input
          label="Quantité en stock"
          type="number"
          placeholder="0"
          leftIcon={<Package size={18} />}
          value={formData.stock}
          onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
          error={errors.stock}
          min={0}
          required
        />

        <Input
          label="Code-barres"
          placeholder="123456789"
          value={formData.barcode}
          onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
          helperText="Optionnel"
        />

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1">
            Annuler
          </Button>
          <Button type="submit" className="flex-1">
            Ajouter
          </Button>
        </div>
      </form>
    );
  },
};

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <div className="space-y-6 p-6 bg-gray-50 rounded-lg">
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">Variants</h4>
        <div className="grid gap-4">
          <Input placeholder="Default variant" />
          <Input placeholder="Error variant" variant="error" />
          <Input placeholder="Success variant" variant="success" />
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">Sizes</h4>
        <div className="grid gap-4">
          <Input size="sm" placeholder="Small" />
          <Input size="default" placeholder="Default" />
          <Input size="lg" placeholder="Large" />
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">With Icons</h4>
        <div className="grid gap-4">
          <Input placeholder="Left icon" leftIcon={<Search size={18} />} />
          <Input placeholder="Right icon" rightIcon={<Mail size={18} />} />
          <Input
            placeholder="Both icons"
            leftIcon={<DollarSign size={18} />}
            rightIcon={<Package size={18} />}
          />
        </div>
      </div>
    </div>
  ),
};
