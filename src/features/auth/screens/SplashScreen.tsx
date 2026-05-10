import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function SplashScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.logo}>⬡</Text>
      <Text style={styles.title}>Nomi</Text>
      <ActivityIndicator color="#FF2D8E" style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FDF7F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { fontSize: 56, color: '#FF2D8E' },
  title: { marginTop: 8, fontSize: 32, fontWeight: '800', color: '#1C1C22' },
  loader: { marginTop: 16 },
});
