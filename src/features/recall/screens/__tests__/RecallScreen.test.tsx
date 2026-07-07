import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RecallScreen from '../RecallScreen';
import { BrainAPI, MemoryAPI } from '../../../../services/api';
import { ToastProvider } from '../../../ui/shared/ToastProvider';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn() }),
  };
});

jest.mock('../../../../store/useStore', () => ({
  useStore: (selector: any) => selector({
    theme: 'light',
    serverOnline: true,
  }),
}));

jest.mock('../../../../services/api', () => ({
  BrainAPI: {
    query: jest.fn(),
  },
  MemoryAPI: {
    list: jest.fn(async () => ({ memories: [] })),
  },
}));

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 44, right: 0, bottom: 34, left: 0 },
    }}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RecallScreen />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('RecallScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (MemoryAPI.list as jest.Mock).mockResolvedValue({ memories: [] });
  });

  it('renders a visible error message when the memories query rejects', async () => {
    (MemoryAPI.list as jest.Mock).mockRejectedValue(new Error('network down'));

    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Could not load memories. Pull to retry.')).toBeTruthy();
    });

    screen.unmount();
  });

  it('renders a visible error message when the ask query rejects', async () => {
    (BrainAPI.query as jest.Mock).mockRejectedValue(new Error('Nomi could not answer'));

    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.queryByText('No memories yet. Capture your first one.')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByPlaceholderText('Ask Nomi a question...'), 'What did I save?');
    fireEvent.press(screen.getByText('Ask'));

    await waitFor(() => {
      // The message appears in both the inline error card and the toast, so
      // assert at-least-one rather than exactly-one.
      expect(screen.getAllByText('Nomi could not answer').length).toBeGreaterThan(0);
    });

    screen.unmount();
  });
});
