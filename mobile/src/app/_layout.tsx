import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from '../store';
import { theme as t } from '../theme';

export { ErrorBoundary } from 'expo-router';
function Feedback() {
  const { toast } = useStore();
  return toast ? <View pointerEvents="none" style={{ position: 'absolute', bottom: 95, left: 24, right: 24, alignItems: 'center' }}><View style={{ backgroundColor: t.colors.ink, paddingHorizontal: 22, paddingVertical: 15, borderRadius: 12, maxWidth: 500 }}><Text accessibilityLiveRegion="polite" style={{ color: 'white', fontFamily: t.fonts.medium, fontSize: 13, lineHeight: 20 }}>{toast}</Text></View></View> : null;
}
export default function Layout() {
  const [loaded, error] = useFonts({
    DMSans_400Regular: require('@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf'),
    DMSans_500Medium: require('@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf'),
    DMSans_700Bold: require('@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf'),
    CormorantGaramond_500Medium: require('@expo-google-fonts/cormorant-garamond/500Medium/CormorantGaramond_500Medium.ttf'),
    CormorantGaramond_500Medium_Italic: require('@expo-google-fonts/cormorant-garamond/500Medium_Italic/CormorantGaramond_500Medium_Italic.ttf'),
  });
  if (!loaded && !error) return <View style={{ flex: 1, backgroundColor: t.colors.background, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.colors.green} /></View>;
  return <SafeAreaProvider><StoreProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.background }, animation: 'slide_from_right' }}><Stack.Screen name="(tabs)" /><Stack.Screen name="auth" options={{ presentation: 'modal' }} /></Stack><Feedback /></StoreProvider></SafeAreaProvider>;
}
