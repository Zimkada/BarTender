import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Trash2, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Modal, ConfirmModal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { Select } from './Select';

const meta = {
  title: 'UI/Modal',
  component: Modal,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic Modal
export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Modal</Button>
        <Modal open={open} onClose={() => setOpen(false)} title="Modal Title">
          <p className="text-gray-600">
            This is a basic modal with default settings. Click outside or press ESC to close.
          </p>
        </Modal>
      </>
    );
  },
};

// With Description
export const WithDescription: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Modal</Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Account Settings"
          description="Make changes to your account here. Click save when you're done."
        >
          <div className="space-y-4">
            <Input label="Name" defaultValue="John Doe" />
            <Input label="Email" type="email" defaultValue="john@example.com" />
          </div>
        </Modal>
      </>
    );
  },
};

// With Footer
export const WithFooter: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Modal</Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Save Changes"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setOpen(false)}>Save</Button>
            </>
          }
        >
          <p className="text-gray-600">
            Are you sure you want to save these changes? This action will update your profile.
          </p>
        </Modal>
      </>
    );
  },
};

// Sizes
export const SmallSize: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)}>Small Modal</Button>
        <Modal open={open} onClose={() => setOpen(false)} title="Small Modal" size="sm">
          <p className="text-sm text-gray-600">This is a small modal, perfect for quick confirmations.</p>
        </Modal>
      </>
    );
  },
};

export const LargeSize: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)}>Large Modal</Button>
        <Modal open={open} onClose={() => setOpen(false)} title="Large Modal" size="lg">
          <div className="space-y-4">
            <p className="text-gray-600">This is a larger modal with more content.</p>
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" />
              <Input label="Last Name" />
            </div>
            <Input label="Email" type="email" />
            <Input label="Phone" type="tel" />
          </div>
        </Modal>
      </>
    );
  },
};

export const ExtraLargeSize: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)}>XL Modal</Button>
        <Modal open={open} onClose={() => setOpen(false)} title="Product Details" size="xl">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Product Name" />
              <Select
                label="Category"
                options={[
                  { value: 'beverages', label: 'Boissons' },
                  { value: 'food', label: 'Nourriture' },
                ]}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Price" type="number" />
              <Input label="Stock" type="number" />
              <Input label="Barcode" />
            </div>
            <Input label="Description" />
          </div>
        </Modal>
      </>
    );
  },
};

// Without Close Button
export const NoCloseButton: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Modal</Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Forced Action"
          showCloseButton={false}
          closeOnOverlayClick={false}
          closeOnEsc={false}
          footer={<Button onClick={() => setOpen(false)}>I Understand</Button>}
        >
          <p className="text-gray-600">
            You must click the button below to close this modal. Outside clicks and ESC are disabled.
          </p>
        </Modal>
      </>
    );
  },
};

// Confirm Modal Preset
export const ConfirmModalDefault: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)}>Confirm Action</Button>
        <ConfirmModal
          open={open}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            console.log('Confirmed!');
            setOpen(false);
          }}
          title="Confirm Action"
          description="Are you sure you want to proceed with this action?"
        />
      </>
    );
  },
};

export const ConfirmModalDanger: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 size={18} />
          Delete
        </Button>
        <ConfirmModal
          open={open}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            console.log('Deleted!');
            setOpen(false);
          }}
          title="Delete Product"
          description="This action cannot be undone. This will permanently delete the product from your inventory."
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
        />
      </>
    );
  },
};

// Confirm Modal with Double-Check
export const ConfirmModalWithDoubleCheck: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 size={18} />
          Delete with Confirmation
        </Button>
        <ConfirmModal
          open={open}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            console.log('Confirmed and Deleted!');
            setOpen(false);
          }}
          title="Delete Product"
          description="This action cannot be undone. This will permanently delete the product from your inventory."
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
          requireConfirmation={true}
          confirmationValue="DELETE"
          confirmationPlaceholder='Type "DELETE" to confirm'
        />
      </>
    );
  },
};

// Real-world BarTender examples
export const DeleteProductModal: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
      setIsDeleting(true);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setIsDeleting(false);
      setOpen(false);
    };

    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 size={18} />
          Supprimer Produit
        </Button>
        <ConfirmModal
          open={open}
          onClose={() => setOpen(false)}
          onConfirm={handleDelete}
          title="Supprimer le produit"
          description="Êtes-vous sûr de vouloir supprimer 'Coca-Cola 33cl' ? Cette action est irréversible."
          confirmText={isDeleting ? 'Suppression...' : 'Supprimer'}
          cancelText="Annuler"
          variant="danger"
          isLoading={isDeleting}
        />
      </>
    );
  },
};

export const AddProductModal: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const [formData, setFormData] = useState({
      name: '',
      category: '',
      price: '',
      stock: '',
    });

    const handleSubmit = () => {
      console.log('Product added:', formData);
      setOpen(false);
      setFormData({ name: '', category: '', price: '', stock: '' });
    };

    return (
      <>
        <Button onClick={() => setOpen(true)}>Nouveau Produit</Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Ajouter un produit"
          description="Remplissez les informations du produit"
          size="lg"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSubmit}>Ajouter</Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input
              label="Nom du produit"
              placeholder="Ex: Coca-Cola 33cl"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />

            <Select
              label="Catégorie"
              options={[
                { value: '', label: 'Sélectionner...' },
                { value: 'beverages', label: 'Boissons' },
                { value: 'food', label: 'Nourriture' },
                { value: 'alcohol', label: 'Alcools' },
              ]}
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Prix (FCFA)"
                type="number"
                placeholder="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                required
              />

              <Input
                label="Stock initial"
                type="number"
                placeholder="0"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                required
              />
            </div>
          </div>
        </Modal>
      </>
    );
  },
};

export const StockAlertModal: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <AlertTriangle size={18} className="text-yellow-600" />
          Voir Alerte
        </Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Alerte Stock Bas"
          size="default"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Plus tard
              </Button>
              <Button onClick={() => setOpen(false)}>Commander</Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-900">Stock critique</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Les produits suivants sont en rupture de stock ou presque :
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="font-medium">Coca-Cola 33cl</span>
                <span className="text-sm text-red-600">2 unités restantes</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="font-medium">Sprite 33cl</span>
                <span className="text-sm text-yellow-600">5 unités restantes</span>
              </div>
            </div>
          </div>
        </Modal>
      </>
    );
  },
};

export const SuccessModal: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)}>Show Success</Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Opération réussie"
          size="sm"
          footer={<Button onClick={() => setOpen(false)}>OK</Button>}
        >
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle size={24} className="text-green-600" />
            </div>
            <p className="text-gray-600">Le produit a été ajouté avec succès à votre inventaire.</p>
          </div>
        </Modal>
      </>
    );
  },
};

export const InfoModal: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Info size={18} />
          Info
        </Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="À propos de cette fonctionnalité"
          size="default"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-2">Gestion automatique du stock</p>
                <p>
                  Le système met à jour automatiquement les quantités en stock après chaque vente.
                  Vous recevrez des alertes lorsque le stock atteint le seuil minimum défini.
                </p>
              </div>
            </div>
          </div>
        </Modal>
      </>
    );
  },
};

// Category deletion with double-check (BarTender example)
export const DeleteCategoryModal: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const categoryName = "Bières";

    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 size={18} />
          Supprimer Catégorie
        </Button>
        <ConfirmModal
          open={open}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            console.log('Category deleted!');
            setOpen(false);
          }}
          title="Supprimer la catégorie"
          description="Êtes-vous sûr de vouloir supprimer cette catégorie ?"
          confirmText="Supprimer"
          cancelText="Annuler"
          variant="danger"
          requireConfirmation={true}
          confirmationValue={categoryName}
          confirmationPlaceholder={categoryName}
        />
      </>
    );
  },
};

// Product deletion with double-check (BarTender example)
export const DeleteProductWithDoubleCheck: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const productName = "Heineken";

    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 size={18} />
          Supprimer Produit
        </Button>
        <ConfirmModal
          open={open}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            console.log('Product deleted!');
            setOpen(false);
          }}
          title="Supprimer le produit"
          description={`Êtes-vous sûr de vouloir supprimer ce produit global ?\n\n${productName} - 33cl`}
          confirmText="Supprimer"
          cancelText="Annuler"
          variant="danger"
          requireConfirmation={true}
          confirmationValue={productName}
          confirmationPlaceholder={productName}
        />
      </>
    );
  },
};
