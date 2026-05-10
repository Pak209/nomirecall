import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../../../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Permissions'>;

export default function PermissionsScreen() {
  const nav = useNavigation<Nav>();
  const [notifications, setNotifications] = useState(true);
  const [camera, setCamera] = useState(true);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Permissions</Text>
      <Text style={styles.body}>Enable what you need now. You can change these anytime in Settings.</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Notifications</Text>
        <Switch value={notifications} onValueChange={setNotifications} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Camera</Text>
        <Switch value={camera} onValueChange={setCamera} />
      </View>

      <TouchableOpacity style={styles.button} onPress={() => nav.navigate('FirstCapture')}>
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF7F2', justifyContent: 'center', padding: 22 },
  title: { fontSize: 28, fontWeight: '800', color: '#1C1C22' },
  body: { marginTop: 8, color: '#655C57' },
  row: { marginTop: 18, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8D8CA', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: '#1C1C22', fontWeight: '700' },
  button: { marginTop: 24, backgroundColor: '#FF2D8E', height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
});
