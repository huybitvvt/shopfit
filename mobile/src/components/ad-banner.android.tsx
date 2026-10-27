import { isRunningInExpoGo } from 'expo';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { theme as t } from '../theme';
import { Button, s } from './ui';

type AdsSdk = typeof import('react-native-google-mobile-ads');
type Status = 'initializing' | 'loading' | 'loaded' | 'error';

let initialization: Promise<AdsSdk> | undefined;
const requestOptions = { requestNonPersonalizedAdsOnly: true };

function initializeAds(): Promise<AdsSdk> {
  // Delay evaluation of the native module until after the Expo Go guard.
  // Share initialization across remounts, including React Strict Mode.
  initialization ??= import('react-native-google-mobile-ads').then(async sdk => {
    await sdk.default().setRequestConfiguration({ testDeviceIdentifiers: ['EMULATOR'] });
    await sdk.default().initialize();
    return sdk;
  }).catch(error => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

function AndroidBanner() {
  const [sdk, setSdk] = useState<AdsSdk | null>(null);
  const [status, setStatus] = useState<Status>('initializing');
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let active = true;
    initializeAds().then(value => {
      if (active) {
        setSdk(value);
        setStatus('loading');
      }
    }).catch(() => {
      if (active) setStatus('error');
    });
    return () => { active = false; };
  }, [attempt]);

  return <View style={styles.container} onLayout={event => setWidth(Math.floor(event.nativeEvent.layout.width))}>
    <Text style={[s.kicker, styles.label]}>QUẢNG CÁO THỬ NGHIỆM</Text>
    <View style={styles.slot}>
      {(status === 'initializing' || status === 'loading') && <View style={s.row}>
        <ActivityIndicator color={t.colors.green} />
        <Text accessibilityLiveRegion="polite" style={s.muted}>Đang tải quảng cáo…</Text>
      </View>}
      {sdk && width > 0 && status !== 'error' && <sdk.BannerAd
        key={attempt}
        unitId={sdk.TestIds.ADAPTIVE_BANNER}
        size={sdk.BannerAdSize.INLINE_ADAPTIVE_BANNER}
        width={width}
        maxHeight={120}
        requestOptions={requestOptions}
        onAdLoaded={() => setStatus('loaded')}
        onAdFailedToLoad={() => setStatus('error')}
      />}
      {status === 'error' && <View style={styles.error}>
        <Text accessibilityLiveRegion="polite" style={s.muted}>Quảng cáo tạm chưa khả dụng. Bạn vẫn có thể mua sắm bình thường.</Text>
        <Button variant="outline" onPress={() => {
          setSdk(null);
          setStatus('initializing');
          setAttempt(value => value + 1);
        }}>Thử tải lại quảng cáo</Button>
      </View>}
    </View>
  </View>;
}

export default function AdBanner() {
  return isRunningInExpoGo() ? null : <AndroidBanner />;
}

const styles = StyleSheet.create({
  container: { marginTop: 28, paddingVertical: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.colors.line },
  label: { textAlign: 'center', marginBottom: 14 },
  slot: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { alignItems: 'center', gap: 14 },
});
