import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { request } from '../api';
import { useStore } from '../store';
import { theme as t } from '../theme';
import type { GarmentSize, Product, SizeAdvice, WardrobeItem } from '../types';
import { Button, ErrorMessage, s } from './ui';
import { FitMap } from './fit-map';

export const measureLabels: Record<string, string> = { height_cm: 'Chiều cao', weight_kg: 'Cân nặng', chest_cm: 'Vòng ngực', waist_cm: 'Vòng eo', hip_cm: 'Vòng mông', shoulder_cm: 'Ngang vai', inseam_cm: 'Dài chân trong', length_cm: 'Dài sản phẩm' };

export function SizeTable({ product }: { product: Product }) {
  const fields = (['chest_cm', 'waist_cm', 'hip_cm', 'length_cm', 'shoulder_cm', 'inseam_cm'] as const)
    .filter(key => product.size_chart.rows.some(row => row[key] != null));
  return <View style={{ gap: 12 }}>
    <Text style={s.muted}>Số đo thành phẩm (cm). Ngực, eo, mông là cả vòng; số đo ngang khi trải phẳng cần nhân hai.</Text>
    <Text style={[s.text, { color: product.size_chart.verified ? t.colors.green : t.colors.error }]}>{product.size_chart.verified ? 'Shop đã xác nhận đo thực tế' : 'Bảng minh họa · chưa được shop xác nhận'}</Text>
    {product.size_chart.rows.length ? <ScrollView horizontal><View>
      <View style={s.row}><Text style={[s.label, { width: 40 }]}>Size</Text>{fields.map(k => <Text key={k} style={[s.label, { width: 95 }]}>{measureLabels[k]}</Text>)}</View>
      {product.size_chart.rows.map(row => <View key={row.size} style={[s.row, { paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.colors.line }]}><Text style={[s.text, { width: 40 }]}>{row.size}</Text>{fields.map(k => <Text key={k} style={[s.text, { width: 95 }]}>{row[k] ?? '—'}</Text>)}</View>)}
    </View></ScrollView> : <Text style={s.muted}>Shop chưa nhập số đo sản phẩm này.</Text>}
  </View>;
}

export function SizingAdvice({ product, color, size, onSelect, disabled }: { product: Product; color: string; size: string; onSelect: (size: string) => void; disabled?: boolean }) {
  return <SizingAdviceContent key={product.id} product={product} color={color} size={size} onSelect={onSelect} disabled={disabled} />;
}
function SizingAdviceContent({ product, color, size, onSelect, disabled }: { product: Product; color: string; size: string; onSelect: (size: string) => void; disabled?: boolean }) {
  const { user } = useStore();
  const [advice, setAdvice] = useState<SizeAdvice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [references, setReferences] = useState<WardrobeItem[]>([]);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (user) void request<WardrobeItem[]>('/api/wardrobe').then(items => { if (active) setReferences(items.filter(i => i.category === product.tryon_category)); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [user, product.tryon_category]));
  useFocusEffect(useCallback(() => {
    let active = true;
    setAdvice(null); setError(null);
    if (user) void request<SizeAdvice>(`/api/products/${product.id}/size-advice`, { method: 'POST', body: JSON.stringify({ color, reference_id: referenceId }) })
      .then(value => { if (active) setAdvice(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [product.id, color, user, referenceId]));
  const candidate = advice?.candidates.find(c => c.size === size);
  return <View style={[s.card, { padding: 16, gap: 12, marginVertical: 16 }]}>
    <Text style={[s.text, { fontFamily: t.fonts.bold }]}>Tư vấn size theo số đo</Text>
    {!user ? <Button variant="outline" onPress={() => router.push('/auth')}>Đăng nhập để tư vấn size</Button> : <>
      <ErrorMessage message={error} />
      {advice && <>
        <Text style={s.text}>{advice.recommended_size ? `Gợi ý size ${advice.recommended_size} · ưu tiên độ dư vải đã chọn` : advice.status === 'no_fit' ? 'Chưa có size còn hàng đạt độ dư vải mục tiêu.' : advice.status === 'needs_chart' || advice.status === 'needs_chart_or_stock' ? 'Cần bảng số đo đầy đủ và size còn hàng.' : 'Bổ sung hồ sơ cơ thể để đối chiếu size.'}</Text>
        {!!advice.missing.length && <Text style={s.muted}>Cần nhập: {advice.missing.map(k => measureLabels[k] || k).join(', ')}. Chiều cao/cân nặng không thay thế các vòng đo.</Text>}
        {advice.recommended_size && advice.recommended_size !== size && <Button disabled={disabled} variant="secondary" onPress={() => onSelect(advice.recommended_size!)}>{`Chọn size ${advice.recommended_size} được gợi ý`}</Button>}
        {candidate && <View style={{ gap: 8 }}><Text style={s.label}>Size đang chọn: {size}</Text>{candidate.checks.map(c => <Text key={c.key} style={[s.muted, { color: c.too_tight ? t.colors.error : t.colors.muted }]}>{c.label}: cơ thể {c.body_cm} / áo quần {c.garment_cm} cm → dư {c.ease_cm} cm; mục tiêu ≥ {c.target_cm} cm.</Text>)}{!candidate.eligible && <Text style={[s.muted, { color: t.colors.error }]}>Size này chưa đạt độ dư vải mục tiêu. Cân nhắc size khác.</Text>}</View>}
        {!!advice.regions?.[size]?.length && <FitMap key={size} checks={advice.regions[size]} size={size} />}
        {advice.warnings.map(w => <Text key={w} style={[s.muted, { fontSize: 11, lineHeight: 18 }]}>{w}</Text>)}
      </>}
      <Button variant="outline" disabled={disabled} onPress={() => router.push('/body-profile')}>Cập nhật hồ sơ cơ thể</Button>
      <View style={s.divider} /><Text style={[s.text, { fontFamily: t.fonts.bold }]}>So với đồ tôi mặc vừa</Text>
      {references.length > 0 && <View style={{ gap: 8 }}>{references.map(item => <Button key={item.id} variant={referenceId === item.id ? 'secondary' : 'outline'} disabled={disabled} onPress={() => setReferenceId(item.id)}>{`So với ${item.name}`}</Button>)}</View>}
      {advice?.comparison?.status === 'available' && <View style={{ gap: 8 }}><Text style={s.label}>Size {size} so với {advice.comparison.name}</Text>{advice.comparison.rows.find(row => row.size === size)?.checks.map(check => <Text key={check.key} style={s.muted}>{check.label}: {check.garment_cm} / đồ của bạn {check.reference_cm} cm → {check.difference_cm === 0 ? 'bằng nhau' : `${check.difference_cm > 0 ? 'lớn hơn' : 'nhỏ hơn'} ${Math.abs(check.difference_cm)} cm`}.</Text>)}<Text style={[s.muted, { fontSize: 11 }]}>{advice.comparison.warning}</Text></View>}
      <Button variant="outline" disabled={disabled} onPress={() => router.push('/wardrobe')}>Quản lý đồ đang mặc vừa</Button>
    </>}
  </View>;
}

export function measurementValue(row: GarmentSize, key: keyof GarmentSize) { return row[key] == null ? '' : String(row[key]); }
