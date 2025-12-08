import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Select, SelectOption } from './Select';
import { Input } from './Input';
import { Button } from './Button';

const meta = {
  title: 'UI/Select',
  component: Select,
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
      description: 'Select size',
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
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const fruitOptions: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'orange', label: 'Orange' },
  { value: 'grape', label: 'Grape' },
];

const categoryOptions: SelectOption[] = [
  { value: 'beverages', label: 'Boissons' },
  { value: 'food', label: 'Nourriture' },
  { value: 'alcohol', label: 'Alcools' },
  { value: 'snacks', label: 'Snacks' },
];

// Basic variants
export const Default: Story = {
  args: {
    options: fruitOptions,
    placeholder: 'Select a fruit',
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Choose a fruit',
    options: fruitOptions,
    placeholder: 'Select...',
  },
};

export const Required: Story = {
  args: {
    label: 'Category',
    options: categoryOptions,
    placeholder: 'Select category',
    required: true,
  },
};

export const WithHelperText: Story = {
  args: {
    label: 'Product Category',
    options: categoryOptions,
    placeholder: 'Select a category',
    helperText: 'This will determine where the product appears in reports',
  },
};

export const WithError: Story = {
  args: {
    label: 'Category',
    options: categoryOptions,
    placeholder: 'Select category',
    defaultValue: '',
    error: 'Please select a category',
  },
};

export const Success: Story = {
  args: {
    label: 'Category',
    variant: 'success',
    options: categoryOptions,
    defaultValue: 'beverages',
    helperText: 'Category selected',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Select',
    options: fruitOptions,
    disabled: true,
    defaultValue: 'apple',
  },
};

export const WithDisabledOptions: Story = {
  args: {
    label: 'Select with disabled options',
    options: [
      { value: 'option1', label: 'Available Option 1' },
      { value: 'option2', label: 'Disabled Option 2', disabled: true },
      { value: 'option3', label: 'Available Option 3' },
      { value: 'option4', label: 'Disabled Option 4', disabled: true },
    ],
    placeholder: 'Select an option',
  },
};

// Sizes
export const Small: Story = {
  args: {
    size: 'sm',
    options: fruitOptions,
    placeholder: 'Small select',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    options: fruitOptions,
    placeholder: 'Large select',
  },
};

// Interactive examples
export const InteractiveValidation: Story = {
  render: () => {
    const [category, setCategory] = useState('');
    const [error, setError] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setCategory(value);

      if (!value) {
        setError('Please select a category');
      } else {
        setError('');
      }
    };

    return (
      <div className="w-full max-w-sm">
        <Select
          label="Product Category"
          options={categoryOptions}
          placeholder="Select a category"
          value={category}
          onChange={handleChange}
          error={error}
          variant={!error && category ? 'success' : undefined}
          required
        />
      </div>
    );
  },
};

export const DependentSelects: Story = {
  render: () => {
    const [category, setCategory] = useState('');
    const [subcategory, setSubcategory] = useState('');

    const subcategoryOptions: Record<string, SelectOption[]> = {
      beverages: [
        { value: 'soft', label: 'Soft Drinks' },
        { value: 'juice', label: 'Juices' },
        { value: 'water', label: 'Water' },
      ],
      food: [
        { value: 'hot', label: 'Hot Food' },
        { value: 'cold', label: 'Cold Food' },
        { value: 'dessert', label: 'Desserts' },
      ],
      alcohol: [
        { value: 'beer', label: 'Beer' },
        { value: 'wine', label: 'Wine' },
        { value: 'spirits', label: 'Spirits' },
      ],
      snacks: [
        { value: 'chips', label: 'Chips' },
        { value: 'candy', label: 'Candy' },
        { value: 'nuts', label: 'Nuts' },
      ],
    };

    return (
      <div className="w-full max-w-sm space-y-4">
        <Select
          label="Category"
          options={categoryOptions}
          placeholder="Select category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setSubcategory('');
          }}
          required
        />

        <Select
          label="Subcategory"
          options={category ? subcategoryOptions[category] : []}
          placeholder={category ? 'Select subcategory' : 'Select category first'}
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
          disabled={!category}
          required
        />
      </div>
    );
  },
};

// Real-world BarTender examples
export const ProductCategorySelect: Story = {
  args: {
    label: 'Catégorie du produit',
    options: [
      { value: 'beverages', label: 'Boissons' },
      { value: 'food', label: 'Nourriture' },
      { value: 'alcohol', label: 'Alcools' },
      { value: 'snacks', label: 'Snacks' },
      { value: 'tobacco', label: 'Tabac' },
      { value: 'other', label: 'Autre' },
    ],
    placeholder: 'Sélectionner une catégorie',
    helperText: 'Utilisé pour l\'organisation et les rapports',
    required: true,
  },
};

export const PaymentMethodSelect: Story = {
  args: {
    label: 'Méthode de paiement',
    options: [
      { value: 'cash', label: 'Espèces' },
      { value: 'card', label: 'Carte bancaire' },
      { value: 'mobile', label: 'Paiement mobile' },
      { value: 'credit', label: 'Crédit' },
    ],
    placeholder: 'Choisir...',
    defaultValue: 'cash',
  },
};

export const TaxRateSelect: Story = {
  args: {
    label: 'Taux de TVA',
    options: [
      { value: '0', label: '0% - Exonéré' },
      { value: '5.5', label: '5.5% - Taux réduit' },
      { value: '10', label: '10% - Taux intermédiaire' },
      { value: '20', label: '20% - Taux normal' },
    ],
    defaultValue: '20',
    helperText: 'Appliqué automatiquement au prix',
  },
};

export const StockAlertSelect: Story = {
  args: {
    label: 'Seuil d\'alerte stock',
    options: [
      { value: '5', label: '5 unités' },
      { value: '10', label: '10 unités' },
      { value: '20', label: '20 unités' },
      { value: '50', label: '50 unités' },
      { value: 'custom', label: 'Personnalisé' },
    ],
    defaultValue: '10',
    helperText: 'Alerte lorsque le stock atteint ce niveau',
  },
};

// Form example
export const ProductForm: Story = {
  render: () => {
    const [formData, setFormData] = useState({
      name: '',
      category: '',
      taxRate: '20',
      paymentMethod: 'cash',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const newErrors: Record<string, string> = {};

      if (!formData.name) newErrors.name = 'Le nom est requis';
      if (!formData.category) newErrors.category = 'La catégorie est requise';

      setErrors(newErrors);

      if (Object.keys(newErrors).length === 0) {
        console.log('Form submitted:', formData);
      }
    };

    return (
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 p-6 bg-white rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Configuration produit</h3>

        <Input
          label="Nom du produit"
          placeholder="Ex: Coca-Cola 33cl"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={errors.name}
          required
        />

        <Select
          label="Catégorie"
          options={categoryOptions}
          placeholder="Sélectionner une catégorie"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          error={errors.category}
          required
        />

        <Select
          label="Taux de TVA"
          options={[
            { value: '0', label: '0% - Exonéré' },
            { value: '5.5', label: '5.5% - Taux réduit' },
            { value: '10', label: '10% - Taux intermédiaire' },
            { value: '20', label: '20% - Taux normal' },
          ]}
          value={formData.taxRate}
          onChange={(e) => setFormData({ ...formData, taxRate: e.target.value })}
          helperText="TVA appliquée par défaut"
        />

        <Select
          label="Méthode de paiement par défaut"
          options={[
            { value: 'cash', label: 'Espèces' },
            { value: 'card', label: 'Carte bancaire' },
            { value: 'mobile', label: 'Paiement mobile' },
          ]}
          value={formData.paymentMethod}
          onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
        />

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1">
            Annuler
          </Button>
          <Button type="submit" className="flex-1">
            Enregistrer
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
          <Select options={fruitOptions} placeholder="Default variant" />
          <Select options={fruitOptions} placeholder="Error variant" variant="error" />
          <Select options={fruitOptions} placeholder="Success variant" variant="success" />
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">Sizes</h4>
        <div className="grid gap-4">
          <Select size="sm" options={fruitOptions} placeholder="Small" />
          <Select size="default" options={fruitOptions} placeholder="Default" />
          <Select size="lg" options={fruitOptions} placeholder="Large" />
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">States</h4>
        <div className="grid gap-4">
          <Select options={fruitOptions} placeholder="Normal" />
          <Select options={fruitOptions} defaultValue="apple" />
          <Select options={fruitOptions} placeholder="Disabled" disabled />
        </div>
      </div>
    </div>
  ),
};
