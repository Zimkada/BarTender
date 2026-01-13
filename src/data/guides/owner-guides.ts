/**
 * Owner (Promoteur) Guides
 * 5 complete guides for bar owners to master the system
 * Test case: dashboard-overview (Phase 1)
 */

import { GuideTour } from '@/types/guide';

/**
 * Guide 1: Dashboard Overview
 * First guide shown after onboarding (test case for Phase 1)
 */
export const DASHBOARD_OVERVIEW_GUIDE: GuideTour = {
  id: 'dashboard-overview',
  title: 'Dashboard Overview',
  subtitle: 'Master Your Bar Management Hub',
  description: 'Quick tour of your dashboard essentials',

  targetRoles: ['promoteur'],

  estimatedDuration: 2,
  difficulty: 'beginner',
  emoji: '🏠',
  version: 1,

  triggers: [
    {
      type: 'onMount',
      condition: 'isDashboardPage && isFirstVisitAfterOnboarding',
      delay: 2000,
      showOnce: true,
    },
  ],

  steps: [
    {
      id: 'step-1',
      emoji: '👋',
      title: 'Welcome to Your Dashboard!',
      description:
        'You are now ready to manage your bar. This quick tour shows you the most important information at a glance.',
      position: 'center',
      action: 'Click Next to continue',
      tips: [
        'All information updates in real-time',
        'Use the refresh button (top right) to force an update',
        'Bookmark this page for quick access',
      ],
      media: {
        type: 'image',
        url: '/guides/dashboard-welcome.png',
        alt: 'Dashboard Overview',
      },
    },

    {
      id: 'step-2',
      emoji: '💰',
      title: 'Your Revenue in Real-Time',
      description:
        'The widget in the top-left shows your revenue for today, trends, and comparison with yesterday.',
      elementSelector: '[data-guide="revenue-widget"]',
      position: 'bottom',
      action: 'Click the widget to see full history',
      tips: [
        'Revenue includes tax and fees',
        'Data updates every minute',
        'Compare week-over-week trends',
      ],
    },

    {
      id: 'step-3',
      emoji: '⏳',
      title: 'Pending Sales for Validation',
      description:
        'This section shows sales created by your servers waiting for your approval. You can validate them quickly.',
      elementSelector: '[data-guide="pending-sales"]',
      position: 'bottom',
      action: 'Click ✓ to validate or ✗ to reject',
      tips: [
        'Bulk validate: check multiple and click Validate',
        'Rejected sales can be edited by the server',
        'Auto-timeout after 24 hours',
      ],
    },

    {
      id: 'step-4',
      emoji: '👥',
      title: 'Team Performance',
      description:
        'See who performs best today. Sort by sales count, average revenue, or number of customers.',
      elementSelector: '[data-guide="team-performance"]',
      position: 'top',
      action: 'Click column headers to sort',
      tips: [
        'You can export this table to Excel',
        'Click a server name for detailed stats',
        'Compare performance week-over-week',
      ],
    },

    {
      id: 'step-5',
      emoji: '🗺️',
      title: 'Main Navigation',
      description:
        'Use the menu at the top to access different sections. Each section has its own guide.',
      elementSelector: '[data-guide="main-nav"]',
      position: 'bottom',
      action: 'Explore each section',
      tips: [
        '📦 Inventory: Manage products and stock',
        '📊 Analytics: Detailed reports',
        '💳 Accounting: Finances and expenses',
        '👥 Team: Manage roles and access',
        '⚙️ Settings: Bar configuration',
      ],
    },

    {
      id: 'step-6',
      emoji: '✅',
      title: 'You Are Ready!',
      description:
        'You are all set! Feel free to come back to this guide anytime. Click the ? button (bottom-right) to access all guides.',
      position: 'center',
      action: 'Click Finish to start exploring',
      tips: [
        'More guides available for each section',
        'Your feedback helps us improve!',
        'Check settings for preferences',
      ],
    },
  ],
};

/**
 * All owner guides (Phase 2+)
 */
export const OWNER_GUIDES: GuideTour[] = [
  DASHBOARD_OVERVIEW_GUIDE,
  // More guides will be added in Phase 2:
  // - manage-inventory
  // - analytics-overview
  // - manage-team
  // - manage-settings
];
