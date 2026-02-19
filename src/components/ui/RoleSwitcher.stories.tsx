import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { RoleSwitcher } from './RoleSwitcher';
import { UserRole } from '../../types';

const meta = {
  title: 'UI/RoleSwitcher',
  component: RoleSwitcher,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: 'select',
      options: ['serveur', 'gerant', 'promoteur'],
      description: 'Le rôle actuellement sélectionné',
    },
    disabled: {
      control: 'boolean',
      description: 'Désactive le composant',
    },
    isLoading: {
      control: 'boolean',
      description: 'Affiche un spinner sur le rôle actif',
    },
    showLabel: {
      control: 'boolean',
      description: 'Affiche le label "Rôle" au-dessus',
    },
  },
} satisfies Meta<typeof RoleSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ServeurActif: Story = {
  args: {
    value: 'serveur',
    onChange: (role) => console.log('Role changed to:', role),
    availableRoles: ['serveur', 'gerant'],
  },
};

export const GerantActif: Story = {
  args: {
    value: 'gerant',
    onChange: (role) => console.log('Role changed to:', role),
    availableRoles: ['serveur', 'gerant'],
  },
};

export const AvecLabel: Story = {
  args: {
    value: 'serveur',
    onChange: (role) => console.log('Role changed to:', role),
    availableRoles: ['serveur', 'gerant'],
    showLabel: true,
  },
};

export const Desactive: Story = {
  args: {
    value: 'serveur',
    onChange: (role) => console.log('Role changed to:', role),
    availableRoles: ['serveur', 'gerant'],
    disabled: true,
  },
};

export const EnChargement: Story = {
  args: {
    value: 'gerant',
    onChange: (role) => console.log('Role changed to:', role),
    availableRoles: ['serveur', 'gerant'],
    isLoading: true,
  },
};

export const TroisRoles: Story = {
  args: {
    value: 'promoteur',
    onChange: (role) => console.log('Role changed to:', role),
    availableRoles: ['serveur', 'gerant', 'promoteur'],
    showLabel: true,
  },
};

// Interactive demo
export const Interactif: Story = {
  render: () => {
    const [role, setRole] = useState<UserRole>('serveur');
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (newRole: UserRole) => {
      setIsLoading(true);
      setTimeout(() => {
        setRole(newRole);
        setIsLoading(false);
      }, 1500);
    };

    return (
      <div className="space-y-4">
        <RoleSwitcher
          value={role}
          onChange={handleChange}
          isLoading={isLoading}
          availableRoles={['serveur', 'gerant']}
          showLabel
        />
        <p className="text-sm text-gray-500">
          Rôle actuel : <strong>{role}</strong>
          {isLoading && ' (changement en cours...)'}
        </p>
      </div>
    );
  },
};

// BarTender context — carte membre
export const DansCarteMembre: Story = {
  render: () => {
    const [role, setRole] = useState<UserRole>('serveur');

    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 max-w-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
            M
          </div>
          <div>
            <p className="font-semibold text-gray-900">Marc Dupont</p>
            <p className="text-xs text-gray-500">marc@bartender.app</p>
          </div>
        </div>
        <RoleSwitcher
          value={role}
          onChange={setRole}
          availableRoles={['serveur', 'gerant']}
          showLabel
        />
      </div>
    );
  },
};
