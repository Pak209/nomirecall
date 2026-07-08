import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NomiDashboardScreen from '../NomiDashboardScreen';
import { DashboardAPI, IntelligenceAPI } from '../../services/api';

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
  IntelligenceAPI: {
    getTodayBrief: jest.fn(async () => ({ brief: null })),
  },
}));

const mockedDashboardAPI = DashboardAPI as jest.Mocked<typeof DashboardAPI>;
const mockedIntelligenceAPI = IntelligenceAPI as jest.Mocked<typeof IntelligenceAPI>;

function renderDashboard() {
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

  return { screen, queryClient };
}

describe('NomiDashboardScreen', () => {
  beforeEach(() => {
    // Restore happy-path implementations between tests.
    mockedDashboardAPI.getSummary.mockResolvedValue({
      title: 'AI summary ✨',
      subtitle: 'Generated just now',
      body: 'You captured 2 ideas and 1 links.',
      ctaLabel: 'View summary',
      stats: { noteCount: 2, linkCount: 1, totalCaptures: 3 },
    });
    mockedDashboardAPI.getRecent.mockResolvedValue({
      items: [
        {
          id: 'one',
          title: 'Recent item',
          meta: 'note • just now',
          tag: '#ideas',
          icon: '🗒️',
        },
      ],
    });
    mockedDashboardAPI.getCategories.mockResolvedValue({
      categories: [
        { id: 'ideas', label: 'Ideas', count: 3, icon: '💡', bgColor: '#FFE6D8' },
      ],
    });
    mockedIntelligenceAPI.getTodayBrief.mockResolvedValue({ brief: null });
  });

  it('renders dashboard data from API queries', async () => {
    const { screen, queryClient } = renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('You captured 2 ideas and 1 links.')).toBeTruthy();
      expect(screen.getAllByText('Recent item').length).toBeGreaterThan(0);
      expect(screen.getByText('For You')).toBeTruthy();
    });

    screen.unmount();
    queryClient.clear();
  });

  it('renders a populated daily brief card when today\'s brief exists', async () => {
    mockedIntelligenceAPI.getTodayBrief.mockResolvedValueOnce({
      brief: {
        title: 'Your Tuesday brief',
        overview: 'Nomi grouped your recent saves into two themes worth revisiting today.',
        actionableIdeas: [{ text: 'Draft the launch checklist' }],
      },
    });

    const { screen, queryClient } = renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Daily Brief')).toBeTruthy();
      expect(screen.getByText('Your Tuesday brief')).toBeTruthy();
      expect(screen.getByText('Nomi grouped your recent saves into two themes worth revisiting today.')).toBeTruthy();
      expect(screen.getByText('Draft the launch checklist')).toBeTruthy();
    });

    screen.unmount();
    queryClient.clear();
  });

  it('renders a graceful empty state when no brief is returned', async () => {
    mockedIntelligenceAPI.getTodayBrief.mockResolvedValueOnce({ brief: null });

    const { screen, queryClient } = renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Daily Brief')).toBeTruthy();
      expect(
        screen.getByText('No brief yet today. Save a few memories and Nomi will pull them into a brief.'),
      ).toBeTruthy();
    });

    screen.unmount();
    queryClient.clear();
  });

  it('renders an error message when the dashboard query rejects', async () => {
    mockedDashboardAPI.getSummary.mockRejectedValue(new Error('boom'));
    mockedDashboardAPI.getRecent.mockRejectedValue(new Error('boom'));
    mockedDashboardAPI.getCategories.mockRejectedValue(new Error('boom'));

    const { screen, queryClient } = renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("We couldn't load your feed")).toBeTruthy();
      expect(screen.getByText('Try again')).toBeTruthy();
    });

    screen.unmount();
    queryClient.clear();
  });
});
