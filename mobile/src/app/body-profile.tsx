import Ionicons from '@expo/vector-icons/Ionicons';
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

interface SizePreset {
  label: string;
  desc: string;
  data: Record<string, number>;
}

const PRESETS: Record<'nam' | 'nu', SizePreset[]> = {
  nam: [
    {
      label: 'S',
      desc: '1m60–1m65 · 50–56kg',
      data: { height_cm: 165, weight_kg: 54, chest_cm: 88, waist_cm: 72, hip_cm: 88, shoulder_cm: 42, inseam_cm: 74 },
    },
    {
      label: 'M',
      desc: '1m66–1m72 · 57–65kg',
      data: { height_cm: 170, weight_kg: 62, chest_cm: 94, waist_cm: 78, hip_cm: 94, shoulder_cm: 44, inseam_cm: 76 },
    },
    {
      label: 'L',
      desc: '1m73–1m78 · 66–74kg',
      data: { height_cm: 175, weight_kg: 70, chest_cm: 100, waist_cm: 84, hip_cm: 100, shoulder_cm: 46, inseam_cm: 78 },
    },
    {
      label: 'XL',
      desc: '1m78–1m84 · 75–84kg',
      data: { height_cm: 180, weight_kg: 78, chest_cm: 106, waist_cm: 90, hip_cm: 106, shoulder_cm: 48, inseam_cm: 80 },
    },
  ],
  nu: [
    {
      label: 'S',
      desc: '1m50–1m56 · 42–47kg',
      data: { height_cm: 155, weight_kg: 45, chest_cm: 80, waist_cm: 62, hip_cm: 86, shoulder_cm: 36, inseam_cm: 68 },
    },
    {
      label: 'M',
      desc: '1m56–1m62 · 48–53kg',
      data: { height_cm: 160, weight_kg: 50, chest_cm: 84, waist_cm: 66, hip_cm: 90, shoulder_cm: 38, inseam_cm: 70 },
    },
    {
      label: 'L',
      desc: '1m62–1m67 · 54–60kg',
      data: { height_cm: 165, weight_kg: 56, chest_cm: 88, waist_cm: 70, hip_cm: 94, shoulder_cm: 40, inseam_cm: 72 },
    },
    {
      label: 'XL',
      desc: '1m67–1m73 · 61–68kg',
      data: { height_cm: 170, weight_kg: 64, chest_cm: 94, waist_cm: 76, hip_cm: 100, shoulder_cm: 42, inseam_cm: 74 },
    },
  ],
};

export default function BodyProfileScreen() {
  const { user, notify } = useStore();
  const [values, setValues] = useState<Record<string, string>>({});
  const [preference, setPreference] = useState<BodyProfile['fit_preference']>('regular');
  const [presetGender, setPresetGender] = useState<'nam' | 'nu'>('nam');
  const [activePreset, setActivePreset] = useState<string | null>(null);
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

  function applyPreset(preset: SizePreset) {
    setActivePreset(`${presetGender}-${preset.label}`);
    setValues(Object.fromEntries(Object.entries(preset.data).map(([k, v]) => [k, String(v)])));
    setError(null);
    notify(`Đã tự động điền số đo chuẩn ${presetGender === 'nam' ? 'Nam' : 'Nữ'} size ${preset.label}.`);
  }

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
    try { await request('/api/body-profile', { method: 'DELETE' }); setValues({}); setActivePreset(null); notify('Đã xóa hồ sơ. Ảnh thử cũ vẫn giữ số đo tại thời điểm tạo; xóa lượt thử để xóa bản lưu đó.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!user) return <Screen><Header title="Hồ sơ cơ thể" back /><Empty title="Số đo riêng của bạn" description="Đăng nhập để lưu hồ sơ và nhận tư vấn size." action="Đăng nhập" onPress={() => router.push('/auth')} /></Screen>;
  return <Screen><Header title="Hồ sơ cơ thể" subtitle="YOUR MEASUREMENTS" back /><View style={{ maxWidth: 620, alignSelf: 'center', width: '100%' }}>
    {/* Quick Preset Selector Card */}
    <View style={{
      backgroundColor: '#F3F7F4',
      borderWidth: 1,
      borderColor: '#D4DDD7',
      borderRadius: 14,
      padding: 16,
      marginBottom: 20,
      gap: 12,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="flash-outline" size={18} color={t.colors.green} />
        <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.ink }}>
          Khung mẫu vóc dáng chuẩn Việt (1 chạm điền nhanh)
        </Text>
      </View>
      <Text style={[s.muted, { fontSize: 12, lineHeight: 17 }]}>
        Không có sẵn thước dây? Chọn giới tính và cỡ người thường mặc bên dưới để tự động điền toàn bộ 7 chỉ số cơ thể chuẩn:
      </Text>

      {/* Gender Tabs */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => { setPresetGender('nam'); setActivePreset(null); }}
          style={{
            flex: 1,
            paddingVertical: 9,
            alignItems: 'center',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: presetGender === 'nam' ? t.colors.green : t.colors.line,
            backgroundColor: presetGender === 'nam' ? t.colors.greenLight : 'white',
          }}
        >
          <Text style={{ fontFamily: t.fonts.medium, fontSize: 13, color: presetGender === 'nam' ? t.colors.green : t.colors.muted }}>
            👦 Vóc dáng Nam
          </Text>
        </Pressable>
        <Pressable
          onPress={() => { setPresetGender('nu'); setActivePreset(null); }}
          style={{
            flex: 1,
            paddingVertical: 9,
            alignItems: 'center',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: presetGender === 'nu' ? t.colors.green : t.colors.line,
            backgroundColor: presetGender === 'nu' ? t.colors.greenLight : 'white',
          }}
        >
          <Text style={{ fontFamily: t.fonts.medium, fontSize: 13, color: presetGender === 'nu' ? t.colors.green : t.colors.muted }}>
            👧 Vóc dáng Nữ
          </Text>
        </Pressable>
      </View>

      {/* Size Pills */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PRESETS[presetGender].map(preset => {
          const isSelected = activePreset === `${presetGender}-${preset.label}`;
          return (
            <Pressable
              key={preset.label}
              onPress={() => applyPreset(preset)}
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 4,
                alignItems: 'center',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: isSelected ? t.colors.green : '#E0DDD5',
                backgroundColor: isSelected ? t.colors.green : 'white',
              }}
            >
              <Text style={{
                fontFamily: t.fonts.bold,
                fontSize: 14,
                color: isSelected ? 'white' : t.colors.ink,
              }}>
                {preset.label}
              </Text>
              <Text style={{
                fontSize: 9,
                marginTop: 2,
                color: isSelected ? '#E2ECE5' : t.colors.muted,
                textAlign: 'center',
              }}>
                {preset.desc.split(' · ')[0]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>

    <Text style={[s.muted, { marginBottom: 20 }]}>Hoặc tự điều chỉnh từng chỉ số bên dưới theo thước dây. Đo ngực và mông ở phần lớn nhất, eo ở phần nhỏ nhất.</Text>
    {fields.map(key => <Field key={key} label={`${measureLabels[key]} (${key === 'weight_kg' ? 'kg' : 'cm'})${key === 'height_cm' || key === 'weight_kg' ? ' *' : ''}`} value={values[key] || ''} onChangeText={v => { setActivePreset(null); setValues(old => ({ ...old, [key]: v })); }} keyboardType="decimal-pad" editable={!busy && !loading} />)}
    <Text style={s.label}>Bạn thích mặc</Text><View style={[s.row, { flexWrap: 'wrap', marginBottom: 20 }]}>{([['slim', 'Gọn'], ['regular', 'Vừa'], ['relaxed', 'Rộng']] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Độ ôm ${label}`} accessibilityState={{ selected: preference === key }} onPress={() => setPreference(key)} style={{ padding: 14, minHeight: 48, borderRadius: 8, backgroundColor: preference === key ? t.colors.green : t.colors.greenLight }}><Text style={{ color: preference === key ? 'white' : t.colors.green, fontFamily: t.fonts.medium }}>{label}</Text></Pressable>)}</View>
    <ErrorMessage message={error} /><Button loading={busy} disabled={loading} onPress={() => void save()}>Lưu hồ sơ cơ thể</Button><Button disabled={busy || loading} variant="outline" onPress={() => void remove()} style={{ marginTop: 12 }}>Xóa hồ sơ cơ thể</Button>
  </View></Screen>;
}
