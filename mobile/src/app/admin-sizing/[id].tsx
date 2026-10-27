import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { mediaUrl, photoForm, request } from '../../api';
import { measureLabels } from '../../components/sizing';
import { Button, Empty, ErrorMessage, Field, Header, Screen, s } from '../../components/ui';
import { useStore } from '../../store';
import type { Product, SizeChart } from '../../types';

const fields = ['chest_cm', 'waist_cm', 'hip_cm', 'length_cm', 'shoulder_cm', 'inseam_cm'] as const;
type Draft = { size: string } & Record<(typeof fields)[number], string>;
export default function AdminSizing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, refresh, notify } = useStore();
  const [product, setProduct] = useState<Product | null>(null);
  const [rows, setRows] = useState<Draft[]>([]);
  const [ease, setEase] = useState({ chest_cm: '8', waist_cm: '4', hip_cm: '6' });
  const [verified, setVerified] = useState(false);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (user?.role === 'admin') void request<Product[]>('/api/admin/products').then(products => {
      if (!active) return;
      const p = products.find(item => item.id === id);
      if (!p) { setError('Không tìm thấy sản phẩm.'); return; }
      setProduct(p); setVerified(p.size_chart.verified); setBackImage(p.size_chart.back_image_url);
      setRows(p.sizes.map(size => { const row = p.size_chart.rows.find(r => r.size === size); return { size, ...Object.fromEntries(fields.map(k => [k, row?.[k] == null ? '' : String(row[k])])) } as Draft; }));
      setEase({ chest_cm: String(p.size_chart.ease.chest_cm), waist_cm: String(p.size_chart.ease.waist_cm), hip_cm: String(p.size_chart.ease.hip_cm) });
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id, user]);
  async function pickBack() {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.95 });
      if (result.canceled) return;
      setBusy(true);
      const uploaded = await request<{ url: string }>('/api/admin/upload', { method: 'POST', body: await photoForm(result.assets[0], 'file') });
      setBackImage(uploaded.url);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function save() {
    setError(null);
    const parsedRows = rows.map(row => ({ size: row.size, ...Object.fromEntries(fields.map(k => [k, row[k].trim() ? Number(row[k].replace(',', '.')) : null])) }));
    const parsedEase = Object.fromEntries(Object.entries(ease).map(([k, v]) => [k, v.trim() ? Number(v.replace(',', '.')) : NaN])) as SizeChart['ease'];
    if (parsedRows.some(row => Object.entries(row).some(([k, v]) => k !== 'size' && v != null && (!Number.isFinite(v) || Number(v) <= 0))) || Object.values(parsedEase).some(v => !Number.isFinite(v) || v < 0 || v > 40)) { setError('Số đo cần là số dương; độ dư vải từ 0 đến 40 cm.'); return; }
    setBusy(true);
    try {
      await request(`/api/admin/products/${id}/size-chart`, { method: 'PATCH', body: JSON.stringify({ rows: parsedRows, ease: parsedEase, verified, back_image_url: backImage } satisfies Partial<SizeChart>) });
      await refresh(); notify('Đã lưu bảng số đo sản phẩm.'); router.back();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (user?.role !== 'admin') return <Screen><Header title="Bảng số đo" back /><Empty title="Dành cho chủ shop" description="Đăng nhập tài khoản shop để nhập số đo thành phẩm." action="Đăng nhập" onPress={() => router.push('/auth')} /></Screen>;
  return <Screen><Header title="Số đo & ảnh mặt sau" subtitle={product?.name || 'SHOPFIT CATALOG'} back /><View style={{ maxWidth: 700, width: '100%', alignSelf: 'center', gap: 16 }}>
    <Text style={s.muted}>Đơn vị cm, đo trên sản phẩm thật. Ngực/eo/mông nhập cả vòng (ngang trải phẳng × 2). Áo cần ngực; quần cần eo/mông; váy cần ngực/eo/mông. Không đánh dấu đã đo nếu đang dùng dữ liệu minh họa.</Text>
    {rows.map((row, index) => <View key={row.size} style={s.card}><Text style={s.label}>Size {row.size}</Text>{fields.map(key => <Field key={key} label={`${measureLabels[key]} size ${row.size} (cm)`} value={row[key]} keyboardType="decimal-pad" editable={!busy} onChangeText={value => setRows(old => old.map((r, i) => i === index ? { ...r, [key]: value } : r))} />)}</View>)}
    <View style={s.card}><Text style={s.label}>Độ dư vải mục tiêu khi mặc vừa (cm)</Text><Text style={[s.muted, { marginBottom: 16 }]}>Tư vấn chọn size nhỏ nhất đạt mức dư ở mọi vòng cần đo. Mặc gọn: giảm 2 cm; mặc rộng: tăng 4 cm. Đây là quy tắc của shop, chưa tính độ co giãn.</Text>{(['chest_cm', 'waist_cm', 'hip_cm'] as const).map(k => <Field key={k} label={`Độ dư ${measureLabels[k].toLowerCase()} (cm)`} value={ease[k]} keyboardType="decimal-pad" editable={!busy} onChangeText={v => setEase(old => ({ ...old, [k]: v }))} />)}</View>
    <View style={s.between}><Text style={[s.text, { flex: 1 }]}>Shop xác nhận đã đo thực tế toàn bộ size</Text><Switch accessibilityLabel="Xác nhận đã đo thực tế" value={verified} onValueChange={setVerified} disabled={busy} /></View>
    <Text style={s.label}>Ảnh mặt sau sản phẩm (không bắt buộc)</Text><Text style={s.muted}>Chọn đúng mẫu/màu của ảnh catalog chính. AI dùng ảnh này khi dựng góc sau, giúp hạn chế tự suy diễn chi tiết.</Text>
    {backImage && <><Image source={mediaUrl(backImage)} contentFit="contain" style={{ width: '100%', height: 260 }} /><Button variant="outline" disabled={busy} onPress={() => setBackImage(null)}>Bỏ ảnh mặt sau</Button></>}
    <Button variant="outline" disabled={busy} onPress={() => void pickBack()}>Tải ảnh mặt sau sản phẩm</Button>
    <ErrorMessage message={error} /><Button loading={busy} disabled={!product} onPress={() => void save()}>Lưu bảng số đo</Button>
  </View></Screen>;
}
