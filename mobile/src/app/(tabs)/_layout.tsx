import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { theme as t } from '../../theme';

export default function TabsLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.colors.green, tabBarInactiveTintColor: t.colors.muted, tabBarLabelStyle: { fontFamily: t.fonts.medium, fontSize: 10, marginTop: 4 }, tabBarStyle: { backgroundColor: '#FCFCF9', borderTopColor: t.colors.line, height: Platform.OS === 'ios' ? 88 : 76, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 13 }, sceneStyle: { backgroundColor: t.colors.background } }}>
    <Tabs.Screen name="index" options={{ title: 'Khám phá', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size - 2} /> }} />
    <Tabs.Screen name="try-on" options={{ title: 'Phòng thử', tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" color={color} size={size - 2} /> }} />
    <Tabs.Screen name="favorites" options={{ title: 'Yêu thích', tabBarIcon: ({ color, size }) => <Ionicons name="heart-outline" color={color} size={size - 2} /> }} />
    <Tabs.Screen name="profile" options={{ title: 'Cá nhân', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size - 2} /> }} />
  </Tabs>;
}
