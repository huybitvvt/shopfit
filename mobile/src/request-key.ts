import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

// Keep only a digest and random key. Retain across network errors; clear after a confirmed response.
export async function pendingRequestKey(scope: string, intent: string) {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, intent);
  const saved = await AsyncStorage.getItem(`shopfit-pending:${scope}`);
  if (saved) {
    try { const record = JSON.parse(saved); if (record.digest === digest && typeof record.key === 'string') return record.key as string; }
    catch { /* Replace a damaged local record. */ }
  }
  const key = Crypto.randomUUID();
  await AsyncStorage.setItem(`shopfit-pending:${scope}`, JSON.stringify({ digest, key }));
  return key;
}
export async function finishRequestKey(scope: string) { await AsyncStorage.removeItem(`shopfit-pending:${scope}`); }
