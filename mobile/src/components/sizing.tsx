import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { request } from '../api';
import { tapSuccess } from '../haptics';
import { useStore } from '../store';
import { theme as t } from '../theme';
import type { GarmentSize, Product, SizeAdvice, WardrobeItem } from '../types';
import { FitMap } from './fit-map';
import { Button, ErrorMessage, s } from './ui';

export const measureLabels: Record<string, string> = {
  height_cm: 'Chiều cao',
  weight_kg: 'Cân nặng',
  chest_cm: 'Vòng ngực',
  waist_cm: 'Vòng eo',
  hip_cm: 'Vòng mông',
  shoulder_cm: 'Ngang vai',
  inseam_cm: 'Dài chân trong',
  length_cm: 'Dài sản phẩm',
};

const QUICK_PRESETS = [
  {
    id: 'nu_s',
    label: '👩 Nữ Chuẩn S',
    desc: '1m55 · 45kg',
    data: { height_cm: 155, weight_kg: 45, chest_cm: 80, waist_cm: 62, hip_cm: 86, shoulder_cm: 36, inseam_cm: 68, fit_preference: 'regular' as const },
  },
  {
    id: 'nu_m',
    label: '👩 Nữ Chuẩn M',
    desc: '1m60 · 50kg',
    data: { height_cm: 160, weight_kg: 50, chest_cm: 84, waist_cm: 66, hip_cm: 90, shoulder_cm: 38, inseam_cm: 70, fit_preference: 'regular' as const },
  },
  {
    id: 'nu_l',
    label: '👩 Nữ Chuẩn L',
    desc: '1m65 · 56kg',
    data: { height_cm: 165, weight_kg: 56, chest_cm: 88, waist_cm: 70, hip_cm: 94, shoulder_cm: 40, inseam_cm: 72, fit_preference: 'regular' as const },
  },
  {
    id: 'nam_m',
    label: '👨 Nam Chuẩn M',
    desc: '1m70 · 62kg',
    data: { height_cm: 170, weight_kg: 62, chest_cm: 94, waist_cm: 78, hip_cm: 94, shoulder_cm: 44, inseam_cm: 76, fit_preference: 'regular' as const },
  },
  {
    id: 'nam_l',
    label: '👨 Nam Chuẩn L',
    desc: '1m75 · 70kg',
    data: { height_cm: 175, weight_kg: 70, chest_cm: 100, waist_cm: 84, hip_cm: 100, shoulder_cm: 46, inseam_cm: 78, fit_preference: 'regular' as const },
  },
];

export function SizeTable({ product }: { product: Product }) {
  const fields = (['chest_cm', 'waist_cm', 'hip_cm', 'length_cm', 'shoulder_cm', 'inseam_cm'] as const)
    .filter(key => product.size_chart.rows.some(row => row[key] != null));

  return (
    <View style={{ gap: 12 }}>
      <Text style={s.muted}>
        Số đo thành phẩm (cm). Ngực, eo, mông là cả vòng; số đo ngang khi trải phẳng cần nhân hai.
      </Text>
      <Text style={[s.text, { color: product.size_chart.verified ? t.colors.green : t.colors.error }]}>
        {product.size_chart.verified ? '✓ Shop đã xác nhận đo thực tế' : 'Bảng minh họa · chưa được shop xác nhận'}
      </Text>
      {product.size_chart.rows.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={s.row}>
              <Text style={[s.label, { width: 44 }]}>Size</Text>
              {fields.map(k => (
                <Text key={k} style={[s.label, { width: 95 }]}>
                  {measureLabels[k]}
                </Text>
              ))}
            </View>
            {product.size_chart.rows.map(row => (
              <View key={row.size} style={[s.row, { paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.colors.line }]}>
                <Text style={[s.text, { width: 44, fontFamily: t.fonts.bold }]}>{row.size}</Text>
                {fields.map(k => (
                  <Text key={k} style={[s.text, { width: 95 }]}>
                    {row[k] ?? '—'}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <Text style={s.muted}>Shop chưa nhập số đo sản phẩm này.</Text>
      )}
    </View>
  );
}

export function SizingAdvice({
  product,
  color,
  size,
  onSelect,
  disabled,
}: {
  product: Product;
  color: string;
  size: string;
  onSelect: (size: string) => void;
  disabled?: boolean;
}) {
  return <SizingAdviceContent key={product.id} product={product} color={color} size={size} onSelect={onSelect} disabled={disabled} />;
}

function SizingAdviceContent({
  product,
  color,
  size,
  onSelect,
  disabled,
}: {
  product: Product;
  color: string;
  size: string;
  onSelect: (size: string) => void;
  disabled?: boolean;
}) {
  const { user, notify } = useStore();
  const [advice, setAdvice] = useState<SizeAdvice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [references, setReferences] = useState<WardrobeItem[]>([]);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [busyPreset, setBusyPreset] = useState(false);

  const fetchAdvice = useCallback(async () => {
    if (!user) return;
    try {
      const value = await request<SizeAdvice>(`/api/products/${product.id}/size-advice`, {
        method: 'POST',
        body: JSON.stringify({ color, reference_id: referenceId }),
      });
      setAdvice(value);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [product.id, color, user, referenceId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (user) {
        void request<WardrobeItem[]>('/api/wardrobe')
          .then(items => {
            if (active) setReferences(items.filter(i => i.category === product.tryon_category));
          })
          .catch(e => {
            if (active) setError(e.message);
          });
      }
      return () => {
        active = false;
      };
    }, [user, product.tryon_category])
  );

  useFocusEffect(
    useCallback(() => {
      void fetchAdvice();
    }, [fetchAdvice])
  );

  async function applyQuickPreset(preset: typeof QUICK_PRESETS[0]) {
    setBusyPreset(true);
    try {
      await request('/api/body-profile', {
        method: 'PATCH',
        body: JSON.stringify(preset.data),
      });
      await fetchAdvice();
      tapSuccess();
      notify(`Đã áp dụng thông số vóc dáng ${preset.label}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyPreset(false);
    }
  }

  return (
    <View style={[s.card, { padding: 16, gap: 14, marginVertical: 16 }]}>
      {/* Title */}
      <View style={[s.between, { alignItems: 'center' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="sparkles" size={17} color={t.colors.green} />
          <Text style={[s.text, { fontFamily: t.fonts.bold, fontSize: 16 }]}>
            Tư vấn chọn size thông minh (AI)
          </Text>
        </View>
      </View>

      {!user ? (
        <Button variant="outline" onPress={() => router.push('/auth')}>
          Đăng nhập để xem tư vấn size chuẩn xác
        </Button>
      ) : (
        <>
          <ErrorMessage message={error} />

          {/* Quick Presets Row */}
          <View style={{ gap: 8, backgroundColor: '#FAF8F5', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ECE7DE' }}>
            <View style={[s.between, { alignItems: 'center' }]}>
              <Text style={{ fontFamily: t.fonts.bold, fontSize: 12, color: t.colors.ink }}>
                ⚡ Chọn nhanh vóc dáng chuẩn (1 chạm):
              </Text>
              <Text style={[s.muted, { fontSize: 10 }]}>Không cần đo thước dây</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {QUICK_PRESETS.map(p => (
                <Pressable
                  key={p.id}
                  disabled={busyPreset}
                  onPress={() => void applyQuickPreset(p)}
                  style={{
                    paddingHorizontal: 11,
                    paddingVertical: 7,
                    borderRadius: 8,
                    backgroundColor: 'white',
                    borderWidth: 1,
                    borderColor: '#DDD8CE',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 11, fontFamily: t.fonts.bold, color: t.colors.ink }}>
                    {p.label}
                  </Text>
                  <Text style={{ fontSize: 10, color: t.colors.muted, marginTop: 1 }}>
                    {p.desc}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {advice && (
            <>
              {/* Recommended Size Highlight Card */}
              {advice.recommended_size ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#E8F5EE',
                    borderWidth: 1,
                    borderColor: '#BFE3D0',
                    borderRadius: 10,
                    padding: 12,
                    gap: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Ionicons name="sparkles" size={18} color={t.colors.green} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.green }}>
                        Gợi ý cho bạn: Size {advice.recommended_size}
                      </Text>
                      <Text style={[s.muted, { fontSize: 11, marginTop: 1 }]}>
                        Tôn vóc dáng và độ rủ vải lý tưởng nhất cho số đo của bạn
                      </Text>
                    </View>
                  </View>
                  {advice.recommended_size !== size && (
                    <Button
                      disabled={disabled}
                      onPress={() => onSelect(advice.recommended_size!)}
                      style={{ paddingVertical: 6, paddingHorizontal: 12 }}
                    >
                      {`Chọn ${advice.recommended_size}`}
                    </Button>
                  )}
                </View>
              ) : (
                <Text style={s.muted}>
                  {advice.status === 'no_fit'
                    ? 'Chưa có size còn hàng đạt độ dư vải mục tiêu.'
                    : advice.status === 'needs_chart' || advice.status === 'needs_chart_or_stock'
                    ? 'Cần bảng số đo đầy đủ và size còn hàng.'
                    : 'Bấm chọn một dáng người mẫu ở trên hoặc bổ sung hồ sơ cơ thể để đối chiếu.'}
                </Text>
              )}

              {/* FitMap Component */}
              {!!advice.regions?.[size]?.length && <FitMap key={size} checks={advice.regions[size]} size={size} />}
            </>
          )}

          {/* Action to custom profile */}
          <Button
            variant="outline"
            icon="options-outline"
            disabled={disabled}
            onPress={() => router.push('/body-profile')}
            style={{ marginTop: 4 }}
          >
            Tùy chỉnh số đo chính xác của riêng bạn
          </Button>

          {/* Compare with wardrobe */}
          <View style={s.divider} />
          <Text style={[s.text, { fontFamily: t.fonts.bold, fontSize: 14 }]}>
            So sánh với đồ đang mặc vừa
          </Text>
          {references.length > 0 && (
            <View style={{ gap: 8 }}>
              {references.map(item => (
                <Button
                  key={item.id}
                  variant={referenceId === item.id ? 'secondary' : 'outline'}
                  disabled={disabled}
                  onPress={() => setReferenceId(item.id)}
                >
                  {`So với "${item.name}"`}
                </Button>
              ))}
            </View>
          )}
          {advice?.comparison?.status === 'available' && (
            <View style={{ gap: 8, backgroundColor: '#FAF8F5', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#EDE8DF' }}>
              <Text style={s.label}>
                Size {size} so với {advice.comparison.name}
              </Text>
              {advice.comparison.rows
                .find(row => row.size === size)
                ?.checks.map(check => (
                  <Text key={check.key} style={s.muted}>
                    {check.label}: {check.garment_cm} / đồ của bạn {check.reference_cm} cm →{' '}
                    {check.difference_cm === 0
                      ? 'bằng nhau'
                      : `${check.difference_cm > 0 ? 'lớn hơn' : 'nhỏ hơn'} ${Math.abs(check.difference_cm)} cm`}
                    .
                  </Text>
                ))}
              {advice.comparison.warning && (
                <Text style={[s.muted, { fontSize: 11 }]}>{advice.comparison.warning}</Text>
              )}
            </View>
          )}
          <Button
            variant="outline"
            disabled={disabled}
            onPress={() => router.push('/wardrobe')}
          >
            Quản lý tủ đồ đã có
          </Button>

          <Text style={[s.muted, { fontSize: 11, textAlign: 'center', marginTop: 4 }]}>
            ℹ️ Mô phỏng độ vừa dựa trên thông số thành phẩm trải phẳng và độ dư vải chuẩn của ShopFit.
          </Text>
        </>
      )}
    </View>
  );
}

export function measurementValue(row: GarmentSize, key: keyof GarmentSize) {
  return row[key] == null ? '' : String(row[key]);
}
