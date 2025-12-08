import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Send, Save, Download, Trash2 } from 'lucide-react';
import { LoadingButton } from './LoadingButton';

const meta = {
  title: 'Components/LoadingButton',
  component: LoadingButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    isLoading: {
      control: 'boolean',
      description: 'Loading state',
    },
    loadingText: {
      control: 'text',
      description: 'Text to show while loading',
    },
    successAnimation: {
      control: 'boolean',
      description: 'Play success animation',
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
  },
} satisfies Meta<typeof LoadingButton>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic states
export const Default: Story = {
  args: {
    children: 'Click me',
    className: 'px-6 py-3 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600',
  },
};

export const Loading: Story = {
  args: {
    children: 'Submit',
    isLoading: true,
    loadingText: 'Processing...',
    className: 'px-6 py-3 bg-amber-500 text-white rounded-lg font-medium',
  },
};

export const WithCustomLoadingText: Story = {
  args: {
    children: 'Save Changes',
    isLoading: true,
    loadingText: 'Saving...',
    className: 'px-6 py-3 bg-green-500 text-white rounded-lg font-medium',
  },
};

export const Disabled: Story = {
  args: {
    children: 'Disabled Button',
    disabled: true,
    className: 'px-6 py-3 bg-gray-500 text-white rounded-lg font-medium',
  },
};

export const SuccessAnimation: Story = {
  args: {
    children: 'Success!',
    successAnimation: true,
    className: 'px-6 py-3 bg-green-500 text-white rounded-lg font-medium',
  },
};

// With icons
export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Send size={18} />
        <span>Send Message</span>
      </>
    ),
    className: 'px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 flex items-center gap-2',
  },
};

export const WithIconLoading: Story = {
  args: {
    children: (
      <>
        <Send size={18} />
        <span>Send Message</span>
      </>
    ),
    isLoading: true,
    loadingText: 'Sending...',
    className: 'px-6 py-3 bg-blue-500 text-white rounded-lg font-medium flex items-center gap-2',
  },
};

// Interactive example
export const Interactive: Story = {
  render: (args) => {
    const [isLoading, setIsLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const handleClick = () => {
      setIsLoading(true);
      setShowSuccess(false);

      // Simulate API call
      setTimeout(() => {
        setIsLoading(false);
        setShowSuccess(true);

        // Reset after showing success
        setTimeout(() => {
          setShowSuccess(false);
        }, 1000);
      }, 2000);
    };

    return (
      <LoadingButton
        {...args}
        isLoading={isLoading}
        successAnimation={showSuccess}
        onClick={handleClick}
        className="px-6 py-3 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 flex items-center gap-2"
      >
        <Save size={18} />
        Save Changes
      </LoadingButton>
    );
  },
  args: {
    loadingText: 'Saving...',
  },
};

// Real-world examples
export const SubmitForm: Story = {
  render: () => {
    const [isLoading, setIsLoading] = useState(false);

    return (
      <div className="p-6 bg-white rounded-lg shadow-md space-y-4 w-96">
        <h3 className="text-lg font-semibold text-gray-800">Product Form</h3>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Product name"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          />
          <input
            type="number"
            placeholder="Price"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>
        <LoadingButton
          isLoading={isLoading}
          loadingText="Creating..."
          onClick={() => {
            setIsLoading(true);
            setTimeout(() => setIsLoading(false), 2000);
          }}
          className="w-full px-6 py-3 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600"
        >
          Create Product
        </LoadingButton>
      </div>
    );
  },
};

export const DeleteAction: Story = {
  render: () => {
    const [isLoading, setIsLoading] = useState(false);

    return (
      <div className="p-6 bg-white rounded-lg shadow-md w-96">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Delete Confirmation</h3>
        <p className="text-gray-600 mb-6">
          Are you sure you want to delete this item? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <LoadingButton
            isLoading={isLoading}
            loadingText="Deleting..."
            onClick={() => {
              setIsLoading(true);
              setTimeout(() => setIsLoading(false), 1500);
            }}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 flex items-center justify-center gap-2"
          >
            <Trash2 size={16} />
            Delete
          </LoadingButton>
        </div>
      </div>
    );
  },
};

export const DownloadFile: Story = {
  render: () => {
    const [isLoading, setIsLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const handleDownload = () => {
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 1500);
      }, 2500);
    };

    return (
      <LoadingButton
        isLoading={isLoading}
        successAnimation={showSuccess}
        loadingText="Downloading..."
        onClick={handleDownload}
        className="px-6 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 flex items-center gap-2"
      >
        <Download size={18} />
        {showSuccess ? 'Downloaded!' : 'Download Report'}
      </LoadingButton>
    );
  },
};

// Button styles showcase
export const AllStyles: Story = {
  render: () => {
    const [loadingStates, setLoadingStates] = useState({
      primary: false,
      secondary: false,
      success: false,
      danger: false,
    });

    const handleClick = (key: keyof typeof loadingStates) => {
      setLoadingStates((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setLoadingStates((prev) => ({ ...prev, [key]: false }));
      }, 2000);
    };

    return (
      <div className="space-y-4 p-6 bg-gray-50 rounded-lg">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Button Variants</h4>
          <div className="flex gap-3 flex-wrap">
            <LoadingButton
              isLoading={loadingStates.primary}
              loadingText="Loading..."
              onClick={() => handleClick('primary')}
              className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
            >
              Primary
            </LoadingButton>

            <LoadingButton
              isLoading={loadingStates.secondary}
              loadingText="Loading..."
              onClick={() => handleClick('secondary')}
              className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
            >
              Secondary
            </LoadingButton>

            <LoadingButton
              isLoading={loadingStates.success}
              loadingText="Loading..."
              onClick={() => handleClick('success')}
              className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
            >
              Success
            </LoadingButton>

            <LoadingButton
              isLoading={loadingStates.danger}
              loadingText="Loading..."
              onClick={() => handleClick('danger')}
              className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              Danger
            </LoadingButton>
          </div>
        </div>
      </div>
    );
  },
};
