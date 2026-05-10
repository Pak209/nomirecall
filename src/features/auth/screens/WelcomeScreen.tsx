import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../../../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Welcome'>;

export default function WelcomeScreen() {
  const nav = useNavigation<Nav>();
  return (
    <View style={styles.root}>
      <Image
        source={require('../../../../assets/nomi-mascot.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text style={styles.title}>Welcome to Nomi</Text>
      <Text style={styles.subtitle}>Capture something. Nomi understands it. Recall it later.</Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={() => nav.navigate('SignIn')}>
        <Text style={styles.primaryBtnText}>Sign in</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => nav.navigate('SignUp')}>
        <Text style={styles.secondaryBtnText}>Create account</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FDF7F2',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: { width: 96, height: 96, alignSelf: 'center' },
  title: { marginTop: 10, fontSize: 34, fontWeight: '800', textAlign: 'center', color: '#1C1C22' },
  subtitle: { marginTop: 12, fontSize: 16, lineHeight: 24, textAlign: 'center', color: '#655C57' },
  primaryBtn: {
    marginTop: 36,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FF2D8E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    marginTop: 10,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8D8CA',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  secondaryBtnText: { color: '#1C1C22', fontWeight: '700', fontSize: 16 },
});
