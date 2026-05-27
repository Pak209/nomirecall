import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainTabParamList } from '../types';
import { BottomNavAddButton, BottomNavItem } from '../components/nomi/BottomNav';

import HomeScreen from '../features/home/screens/HomeScreen';
import CaptureScreen from '../features/capture/screens/CaptureScreen';
import RecallScreen from '../features/recall/screens/RecallScreen';
import ProfileScreen from '../features/profile/screens/ProfileScreen';
import AskNomiScreen from '../features/ask/screens/AskNomiScreen';
import KnowledgeGalaxyScreen from '../features/ideas/screens/KnowledgeGalaxyScreen';
import { useStore } from '../store/useStore';

const Tab = createBottomTabNavigator<MainTabParamList>();
const VISIBLE_TABS = ['Home', 'Ideas', 'Ask', 'Recall', 'Profile'];

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
      tabBar={(props) => <NomiTabBar {...props} />}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => <BottomNavItem icon={focused ? 'home' : 'home-outline'} label="Home" focused={focused} />,
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen
        name="Capture"
        component={CaptureScreen}
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
      />
      <Tab.Screen
        name="Ideas"
        component={KnowledgeGalaxyScreen}
        options={{
          tabBarIcon: ({ focused }) => <BottomNavItem icon={focused ? 'share-social' : 'share-social-outline'} label="Ideas" focused={focused} />,
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen
        name="Ask"
        component={AskNomiScreen}
        options={{
          tabBarIcon: ({ focused }) => <BottomNavItem icon={focused ? 'sparkles' : 'sparkles-outline'} label="Ask" focused={focused} />,
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen
        name="Recall"
        component={RecallScreen}
        options={{
          tabBarIcon: ({ focused }) => <BottomNavItem icon={focused ? 'time' : 'time-outline'} secondaryIcon="sync-outline" label="Recall" focused={focused} />,
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => <BottomNavItem icon={focused ? 'person' : 'person-outline'} label="Profile" focused={focused} />,
          tabBarLabel: () => null,
        }}
      />
    </Tab.Navigator>
  );
}

function NomiTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const dark = useStore((s) => s.theme === 'dark');
  const visibleRoutes = state.routes.filter((route) => VISIBLE_TABS.includes(route.name));

  function openCapture() {
    navigation.navigate('Capture');
  }

  return (
    <View pointerEvents="box-none" style={[styles.tabBarWrap, { bottom: Math.max(insets.bottom, 8) + 8 }]}>
      <TouchableOpacity
        style={styles.captureButton}
        onPress={openCapture}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Quick capture"
      >
        <BottomNavAddButton />
      </TouchableOpacity>

      <View style={[styles.tabBar, dark && styles.tabBarDark]}>
        {visibleRoutes.map((route) => {
          const routeIndex = state.routes.findIndex((item) => item.key === route.key);
          const focused = state.index === routeIndex;
          const { options } = descriptors[route.key];

          function onPress() {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          }

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabButton}
              onPress={onPress}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? route.name}
            >
              {options.tabBarIcon?.({ focused, color: focused ? '#EF6359' : '#8F8A84', size: 20 })}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 108,
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  tabBar: {
    height: 78,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#F0E2D6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    shadowColor: '#1C1C22',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  tabBarDark: {
    backgroundColor: 'rgba(18,14,23,0.94)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tabButton: {
    flex: 1,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButton: {
    position: 'absolute',
    top: 0,
    right: 52,
    zIndex: 60,
  },
});
