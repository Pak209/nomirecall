import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AskNomiScreen from '../AskNomiScreen';
import { BrainAPI } from '../../../../services/api';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn() }),
  };
});

let mockServerOnline = true;

jest.mock('../../../../store/useStore', () => ({
  useStore: (selector: any) => selector({
    theme: 'light',
    serverOnline: mockServerOnline,
  }),
}));

jest.mock('../../../../services/api', () => ({
  BrainAPI: {
    query: jest.fn(),
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
        <AskNomiScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('AskNomiScreen', () => {
  beforeEach(() => {
    mockServerOnline = true;
    jest.clearAllMocks();
  });

  it('disables the Ask submit control and shows an offline hint when serverOnline is false', () => {
    mockServerOnline = false;

    const screen = renderScreen();

    // Behavior-based disabled check: even with a non-empty question, pressing
    // Ask while offline must not fire the query (button disabled + ask() guard).
    fireEvent.changeText(screen.getByPlaceholderText('What do you want to understand?'), 'What did I save?');
    fireEvent.press(screen.getByText('Ask'));
    expect(BrainAPI.query).not.toHaveBeenCalled();
    expect(screen.getByText(/You're offline/i)).toBeTruthy();

    screen.unmount();
  });

  it('renders a visible error message when the ask query rejects', async () => {
    (BrainAPI.query as jest.Mock).mockRejectedValue(new Error('Nomi is unreachable'));

    const screen = renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('What do you want to understand?'), 'What did I save?');
    fireEvent.press(screen.getByText('Ask'));

    await waitFor(() => {
      expect(screen.getByText('Nomi is unreachable')).toBeTruthy();
    });

    screen.unmount();
  });
});
