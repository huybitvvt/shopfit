import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { request } from '../api';
import { measureLabels } from '../components/sizing';
import { Button, Empty, ErrorMessage, Field, Header, Screen, s } from '../components/ui';
import { useStore } from '../store';
import { theme as t } from '../theme';
import type { BodyProfile } from '../types';

const fields = ['height_cm', 'weight_kg', 'chest_cm', 'waist_cm', 'hip_cm', 'shoulder_cm', 'inseam_cm'] as const;
const ranges = { height_cm: [120, 220], weight_kg: [30, 250], chest_cm: [40, 200], waist_cm: [40, 200], hip_cm: [40, 220], shoulder_cm: [20, 80], inseam_cm: [30, 120] };
export default function BodyProfileScreen() {
  const { user, notify } = useStore();
  const [values, setValues] = useState<Record<string, string>>({});
  const [preference, setPreference] = useState<BodyProfile['fit_preference']>('regular');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (user) void request<{ profile: BodyProfile | null }>('/api/body-profile').then(({ profile }) => {
      if (active && profile) { setValues(Object.fromEntries(fields.map(k => [k, profile[k] == null ? '' : String(profile[k])]))); setPreference(profile.fit_preference); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    else setLoading(false);
    return () => { active = false; };
  }, [user]));
  async function save() {
    const payload: Record<string, number | string | null> = { fit_preference: preference };
    for (const key of fields) {
      const raw = (values[key] || '').trim().replace(',', '.');
      if (!raw && key !== 'height_cm' && key !== 'weight_kg') { payload[key] = null; continue; }
      const n = Number(raw), [min, max] = ranges[key];
      if (!raw || !Number.isFinite(n) || n < min || n > max) { setError(`${measureLabels[key]} cần trong khoảng ${min}–${max}.`); return; }
      payload[key] = n;
    }
    setBusy(true); setError(null);
    try { await request('/api/body-profile', { method: 'PATCH', body: JSON.stringify(payload) }); notify('Đã lưu hồ sơ cơ thể.'); router.back(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await request('/api/body-profile', { method: 'DELETE' }); setValues({}); notify('Đã xóa hồ sơ. Ảnh thử cũ vẫn giữ số đo tại thời điểm tạo; xóa lượt thử để xóa bản lưu đó.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!user) return <Screen><Header title="Hồ sơ cơ thể" back /><Empty title="Số đo riêng của bạn" description="Đăng nhập để lưu hồ sơ và nhận tư vấn size." action="Đăng nhập" onPress={() => router.push('/auth')} /></Screen>;
  return <Screen><Header title="Hồ sơ cơ thể" subtitle="YOUR MEASUREMENTS" back /><View style={{ maxWidth: 620, alignSelf: 'center', width: '100%' }}>
    <Text style={[s.muted, { marginBottom: 20 }]}>Dùng thước dây, giữ sát cơ thể nhưng không siết. Đo ngực và mông ở phần lớn nhất, eo ở phần nhỏ nhất. Nhờ người khác đo vai và dài chân trong. Không suy ra vòng đo từ ảnh hoặc cân nặng.</Text>
    {fields.map(key => <Field key={key} label={`${measureLabels[key]} (${key === 'weight_kg' ? 'kg' : 'cm'})${key === 'height_cm' || key === 'weight_kg' ? ' *' : ''}`} value={values[key] || ''} onChangeText={v => setValues(old => ({ ...old, [key]: v }))} keyboardType="decimal-pad" editable={!busy && !loading} />)}
    <Text style={s.label}>Bạn thích mặc</Text><View style={[s.row, { flexWrap: 'wrap', marginBottom: 20 }]}>{([['slim', 'Gọn'], ['regular', 'Vừa'], ['relaxed', 'Rộng']] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Độ ôm ${label}`} accessibilityState={{ selected: preference === key }} onPress={() => setPreference(key)} style={{ padding: 14, minHeight: 48, borderRadius: 8, backgroundColor: preference === key ? t.colors.green : t.colors.greenLight }}><Text style={{ color: preference === key ? 'white' : t.colors.green, fontFamily: t.fonts.medium }}>{label}</Text></Pressable>)}</View>
    <Text style={[s.muted, { marginBottom: 20 }]}>Tư vấn áo cần vòng ngực; quần cần eo và mông; váy cần cả ba. Hồ sơ chỉ bạn xem được, và được gửi cùng ảnh đến AI khi tạo lượt thử.</Text>
    <ErrorMessage message={error} /><Button loading={busy} disabled={loading} onPress={() => void save()}>Lưu hồ sơ cơ thể</Button><Button disabled={busy || loading} variant="outline" onPress={() => void remove()} style={{ marginTop: 12 }}>Xóa hồ sơ cơ thể</Button>
  </View></Screen>;
}
