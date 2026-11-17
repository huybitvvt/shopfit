import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastOverlay } from '../components/ui';
import { StoreProvider } from '../store';
import { theme as t } from '../theme';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const styleId = 'shopfit-web-resets';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      input::-ms-reveal,
      input::-ms-clear {
        display: none !important;
      }
      input, textarea {
        outline: none;
      }
    `;
    document.head.appendChild(style);
  }
}

export { ErrorBoundary } from 'expo-router';

function NotificationNavigationBridge() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as { screen?: string } | undefined;
      if (data?.screen && (data.screen === '/orders' || data.screen === '/try-on' || data.screen === '/profile')) {
        router.push(data.screen);
      }
    });
    return () => sub.remove();
  }, []);
  return null;
}

export default function Layout() {
  const [loaded, error] = useFonts({
    DMSans_400Regular: require('@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf'),
    DMSans_500Medium: require('@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf'),
    DMSans_700Bold: require('@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf'),
    CormorantGaramond_500Medium: require('@expo-google-fonts/cormorant-garamond/500Medium/CormorantGaramond_500Medium.ttf'),
    CormorantGaramond_500Medium_Italic: require('@expo-google-fonts/cormorant-garamond/500Medium_Italic/CormorantGaramond_500Medium_Italic.ttf'),
  });
  if (!loaded && !error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.colors.green} />
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <NotificationNavigationBridge />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: t.colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
        </Stack>
        <ToastOverlay />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
