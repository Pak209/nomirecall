import 'react-native-gesture-handler';
import React, { useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import RootNavigator from './src/navigation';
import { queryClient } from './src/lib/queryClient';
import { ToastProvider } from './src/features/ui/shared/ToastProvider';

SplashScreen.preventAutoHideAsync();

export default function App() {
  // Hide splash once fonts/assets are ready
  useEffect(() => {
    // Add any async asset loading here
    const timer = setTimeout(() => SplashScreen.hideAsync(), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SafeAreaProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </SafeAreaProvider>
        </ToastProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
