import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useStore } from '../store/useStore';
import { restoreSession } from '../services/auth';
import { checkHealth } from '../services/api';
import { Colors } from '../constants/theme';
import { RootStackParamList } from '../types';
import MainTabs from './MainTabs';
import SplashScreen from '../features/auth/screens/SplashScreen';
import WelcomeScreen from '../features/auth/screens/WelcomeScreen';
import SignInScreen from '../features/auth/screens/SignInScreen';
import SignUpScreen from '../features/auth/screens/SignUpScreen';
import ForgotPasswordScreen from '../features/auth/screens/ForgotPasswordScreen';
import OnboardingIntroScreen from '../features/onboarding/screens/OnboardingIntroScreen';
import MemoryGoalsScreen from '../features/onboarding/screens/MemoryGoalsScreen';
import NomiToneScreen from '../features/onboarding/screens/NomiToneScreen';
import PermissionsScreen from '../features/onboarding/screens/PermissionsScreen';
import FirstCaptureScreen from '../features/onboarding/screens/FirstCaptureScreen';
import OnboardingCompleteScreen from '../features/onboarding/screens/OnboardingCompleteScreen';
import MemoryDetailScreen from '../features/memories/screens/MemoryDetailScreen';
import PaywallScreen from '../screens/PaywallScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, isOnboarded, setServerOnline } = useStore();
  const [restoringSession, setRestoringSession] = useState(true);

  useEffect(() => {
    restoreSession().finally(() => setRestoringSession(false));
  }, []);

  useQuery({
    queryKey: ['server-health'],
    queryFn: checkHealth,
    refetchInterval: 30_000,
    initialData: false,
    onSuccess: (online) => setServerOnline(online),
    onError: () => setServerOnline(false),
  });

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {restoringSession ? (
          <Stack.Screen name="Splash" component={SplashScreen} />
        ) : !isAuthenticated ? (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="SignIn" component={SignInScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        ) : !isOnboarded ? (
          <>
            <Stack.Screen name="OnboardingIntro" component={OnboardingIntroScreen} />
            <Stack.Screen name="MemoryGoals" component={MemoryGoalsScreen} />
            <Stack.Screen name="NomiTone" component={NomiToneScreen} />
            <Stack.Screen name="Permissions" component={PermissionsScreen} />
            <Stack.Screen name="FirstCapture" component={FirstCaptureScreen} />
            <Stack.Screen name="OnboardingComplete" component={OnboardingCompleteScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen
              name="MemoryDetail"
              component={MemoryDetailScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: Colors.bgCard },
                headerTintColor: Colors.textPrimary,
                title: 'Memory Detail',
              }}
            />
            <Stack.Screen
              name="Paywall"
              component={PaywallScreen}
              options={{
                presentation: 'modal',
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
