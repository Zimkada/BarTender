import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Toast, ToastContainer } from './Toast';
import { Button } from './Button';
import { useToast } from '../../hooks/useToast';

const meta = {
  title: 'UI/Toast',
  component: Toast,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['success', 'error', 'loading', 'warning', 'offline'],
      description: 'The visual style of the toast',
    },
    message: {
      control: 'text',
      description: 'The message to display',
    },
    duration: {
      control: 'number',
      description: 'Auto-dismiss duration in ms (null = persistent)',
    },
    showIcon: {
      control: 'boolean',
      description: 'Whether to show the icon',
    },
  },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  args: {
    message: 'Le rôle a été mis à jour avec succès.',
    variant: 'success',
    duration: null,
    showIcon: true,
  },
};

export const Error: Story = {
  args: {
    message: 'Erreur lors de la suppression du membre.',
    variant: 'error',
    duration: null,
    showIcon: true,
  },
};

export const Loading: Story = {
  args: {
    message: 'Changement du rôle en Gérant...',
    variant: 'loading',
    duration: null,
    showIcon: true,
  },
};

export const Warning: Story = {
  args: {
    message: 'Connexion lente. Veuillez vérifier votre connexion.',
    variant: 'warning',
    duration: null,
    showIcon: true,
  },
};

export const Offline: Story = {
  args: {
    message: 'Vous êtes hors ligne. Vérifiez votre connexion.',
    variant: 'offline',
    duration: null,
    showIcon: true,
  },
};

export const WithAction: Story = {
  args: {
    message: 'Connexion lente. Réessayez?',
    variant: 'warning',
    duration: null,
    showIcon: true,
    action: {
      label: 'Réessayer',
      onClick: () => console.log('Retry clicked'),
    },
  },
};

export const WithCloseButton: Story = {
  render: () => (
    <Toast
      message="Ce toast peut être fermé manuellement."
      variant="success"
      duration={null}
      onClose={() => console.log('Closed')}
    />
  ),
};

// Interactive demo with useToast hook
export const LiveDemo: Story = {
  render: () => {
    const { toasts, removeToast, success, error, loading, warning, offline } = useToast();

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => success('Membre retiré de l\'équipe avec succès')}
          >
            Toast Succès
          </Button>
          <Button
            variant="destructive"
            onClick={() => error('Erreur lors du changement de rôle')}
          >
            Toast Erreur
          </Button>
          <Button
            variant="secondary"
            onClick={() => loading('Changement du rôle en cours...')}
          >
            Toast Loading
          </Button>
          <Button
            variant="secondary"
            onClick={() => warning('Connexion lente. Réessayez?', 5000)}
          >
            Toast Warning
          </Button>
          <Button
            variant="secondary"
            onClick={() => offline('Vous êtes hors ligne')}
          >
            Toast Offline
          </Button>
        </div>

        <ToastContainer toasts={toasts} onRemove={removeToast} position="top-right" />
      </div>
    );
  },
};

// All variants side by side
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Toast message="Opération réussie." variant="success" duration={null} />
      <Toast message="Une erreur est survenue." variant="error" duration={null} />
      <Toast message="Opération en cours..." variant="loading" duration={null} />
      <Toast message="Connexion instable." variant="warning" duration={null} />
      <Toast message="Vous êtes hors ligne." variant="offline" duration={null} />
    </div>
  ),
};
