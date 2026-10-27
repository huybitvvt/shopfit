import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { request } from '../api';
import { measureLabels } from '../components/sizing';
import { Button, Empty, ErrorMessage, Field, Header, Screen, s } from '../components/ui';
import { useStore } from '../store';
import type { Product, WardrobeItem } from '../types';

const categories = [['tops', 'Áo'], ['bottoms', 'Quần'], ['one-pieces', 'Váy/liền thân']] as const;
const fields = ['chest_cm', 'waist_cm', 'hip_cm', 'length_cm', 'shoulder_cm', 'inseam_cm'] as const;
export default function Wardrobe() {
  const { user, notify } = useStore();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [category, setCategory] = useState<Product['tryon_category']>('tops');
  const [name, setName] = useState('');
  const [material, setMaterial] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (user) setItems(await request<WardrobeItem[]>('/api/wardrobe')); }, [user]);
  useFocusEffect(useCallback(() => { void load().catch(e => setError(e.message)); }, [load]));
  async function save() {
    const required = category === 'tops' ? ['chest_cm'] : category === 'bottoms' ? ['waist_cm', 'hip_cm'] : ['chest_cm', 'waist_cm', 'hip_cm'];
    if (name.trim().length < 2 || required.some(k => !values[k]?.trim())) { setError('Nhập tên và đủ các vòng đo: áo cần ngực, quần cần eo/mông, váy cần cả ba.'); return; }
    const measurements = Object.fromEntries(fields.map(k => [k, values[k]?.trim() ? Number(values[k].replace(',', '.')) : null]));
    if (Object.values(measurements).some(v => v != null && (!Number.isFinite(v) || v <= 0))) { setError('Số đo phải là số dương, dùng cm.'); return; }
    setBusy(true); setError(null);
    try { await request(editing ? `/api/wardrobe/${editing}` : '/api/wardrobe', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify({ name: name.trim(), category, material, measurements: { size: 'REF', ...measurements } }) }); setName(''); setMaterial(''); setValues({}); setEditing(null); await load(); notify('Đã lưu đồ đang mặc vừa. Chọn món này trong tư vấn size để đối chiếu.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true);
    try { await request(`/api/wardrobe/${id}`, { method: 'DELETE' }); if (editing === id) { setEditing(null); setName(''); setMaterial(''); setValues({}); } await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!user) return <Screen><Header title="Đồ tôi mặc vừa" back /><Empty title="Chiếc áo làm chuẩn" description="Lưu số đo món đồ bạn mặc thoải mái để so với thiết kế của shop." action="Đăng nhập" onPress={() => router.push('/auth')} /></Screen>;
  return <Screen><Header title="Đồ tôi mặc vừa" subtitle="COMPARE WITH YOUR FAVORITE" back /><View style={{ maxWidth: 650, width: '100%', alignSelf: 'center', gap: 18 }}>
    <Text style={s.muted}>Chọn đồ đang mặc thoải mái, trải phẳng và đo không kéo giãn. Vòng ngực/eo/mông = ngang trải phẳng × 2. Dài sản phẩm và ngang vai giữ số đo thẳng. Số đo này là của quần áo, không phải cơ thể.</Text>
    {items.map(item => <View key={item.id} style={[s.card, { gap: 10 }]}><Text style={s.label}>{item.name}</Text><Text style={s.muted}>{categories.find(([key]) => key === item.category)?.[1]} · {item.material || 'Chưa ghi chất liệu'}</Text><Text style={s.muted}>{fields.filter(k => item.measurements[k] != null).map(k => `${measureLabels[k]} ${item.measurements[k]} cm`).join(' · ')}</Text><Button variant="secondary" disabled={busy} onPress={() => { setEditing(item.id); setName(item.name); setCategory(item.category); setMaterial(item.material); setValues(Object.fromEntries(fields.map(k => [k, item.measurements[k] == null ? '' : String(item.measurements[k])]))); }}>{`Sửa ${item.name}`}</Button><Button variant="outline" disabled={busy} onPress={() => void remove(item.id)}>{`Xóa ${item.name}`}</Button></View>)}
    <Text style={s.title}>{editing ? 'Sửa đồ tham chiếu' : 'Thêm món làm chuẩn'}</Text>{editing && <Button variant="outline" disabled={busy} onPress={() => { setEditing(null); setName(''); setMaterial(''); setValues({}); }}>Hủy chỉnh sửa</Button>}<View style={[s.row, { flexWrap: 'wrap' }]}>{categories.map(([key, label]) => <Button key={key} variant={category === key ? 'primary' : 'outline'} disabled={busy} onPress={() => setCategory(key)}>{label}</Button>)}</View>
    <Field label="Tên món đồ đang mặc vừa" placeholder="Áo thun trắng tôi thường mặc" value={name} onChangeText={setName} editable={!busy} maxLength={80} />
    <Field label="Chất liệu/phom tham chiếu" placeholder="Cotton ít co giãn, phom thường" value={material} onChangeText={setMaterial} editable={!busy} maxLength={120} />
    {fields.map(key => <Field key={key} label={`${measureLabels[key]} đồ tham chiếu (cm)`} value={values[key] || ''} keyboardType="decimal-pad" editable={!busy} onChangeText={value => setValues(old => ({ ...old, [key]: value }))} />)}
    <ErrorMessage message={error} /><Button loading={busy} onPress={() => void save()}>Lưu đồ mặc vừa</Button>
    <Text style={s.muted}>Chỉ so sánh các món cùng loại, cách đo và phom/chất liệu tương đương. Món tham chiếu do bạn nhập, không tự xác nhận là số đo chuẩn của thương hiệu.</Text>
  </View></Screen>;
}
