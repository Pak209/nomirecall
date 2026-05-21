import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NomiDashboardScreen from '../NomiDashboardScreen';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn() }),
  };
});

jest.mock('../../store/useStore', () => ({
  useStore: (selector: any) => selector({
    user: { displayName: 'Alex', email: 'alex@example.com' },
    serverOnline: true,
  }),
}));

jest.mock('../../services/api', () => ({
  DashboardAPI: {
    getSummary: jest.fn(async () => ({
      title: 'AI summary ✨',
      subtitle: 'Generated just now',
      body: 'You captured 2 ideas and 1 links.',
      ctaLabel: 'View summary',
      stats: { noteCount: 2, linkCount: 1, totalCaptures: 3 },
    })),
    getMemory: jest.fn(async () => ({
      title: 'Resurfaced memory ✨',
      timestamp: 'Yesterday',
      quote: 'Test quote',
      author: 'Nomi',
      ctaLabel: 'Open note',
    })),
    getRecent: jest.fn(async () => ({
      items: [
        {
          id: 'one',
          title: 'Recent item',
          meta: 'note • just now',
          tag: '#ideas',
          icon: '🗒️',
        },
      ],
    })),
    getCategories: jest.fn(async () => ({
      categories: [
        { id: 'ideas', label: 'Ideas', count: 3, icon: '💡', bgColor: '#FFE6D8' },
      ],
    })),
  },
}));

describe('NomiDashboardScreen', () => {
  it('renders dashboard data from API queries', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const screen = render(
      <SafeAreaProvider initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 44, right: 0, bottom: 34, left: 0 },
      }}>
        <QueryClientProvider client={queryClient}>
          <NomiDashboardScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/AI summary/)).toBeTruthy();
      expect(screen.getAllByText('Recent item').length).toBeGreaterThan(0);
      expect(screen.getByText('For You')).toBeTruthy();
    });

    screen.unmount();
    queryClient.clear();
  });
});
