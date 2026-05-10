import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../../../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'OnboardingIntro'>;

export default function OnboardingIntroScreen() {
  const nav = useNavigation<Nav>();
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Meet Nomi</Text>
      <Text style={styles.body}>Nomi helps you save meaningful moments and recall them when you need them most.</Text>
      <TouchableOpacity style={styles.button} onPress={() => nav.navigate('MemoryGoals')}>
        <Text style={styles.buttonText}>Get started</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF7F2', justifyContent: 'center', padding: 22 },
  title: { fontSize: 32, fontWeight: '800', color: '#1C1C22' },
  body: { marginTop: 10, fontSize: 16, lineHeight: 24, color: '#655C57' },
  button: { marginTop: 28, backgroundColor: '#FF2D8E', height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
});
