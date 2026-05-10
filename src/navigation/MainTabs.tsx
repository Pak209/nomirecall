import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../types';
import { BottomNavAddButton, BottomNavItem } from '../components/nomi/BottomNav';

import HomeScreen from '../features/home/screens/HomeScreen';
import CaptureScreen from '../features/capture/screens/CaptureScreen';
import RecallScreen from '../features/recall/screens/RecallScreen';
import ProfileScreen from '../features/profile/screens/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 18,
          height: 78,
          borderRadius: 24,
          borderTopWidth: 0,
          backgroundColor: '#FFFFFF',
          shadowColor: '#1C1C22',
          shadowOpacity: 0.12,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        },
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => <BottomNavItem icon="⌂" label="Home" focused={focused} />,
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen
        name="Capture"
        component={CaptureScreen}
        options={{
          tabBarIcon: () => <BottomNavAddButton />,
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen
        name="Recall"
        component={RecallScreen}
        options={{
          tabBarIcon: ({ focused }) => <BottomNavItem icon="◷" label="Recall" focused={focused} />,
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => <BottomNavItem icon="◉" label="Profile" focused={focused} />,
          tabBarLabel: () => null,
        }}
      />
    </Tab.Navigator>
  );
}
