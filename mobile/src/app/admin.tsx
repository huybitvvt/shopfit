import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { mediaUrl, photoForm, request } from '../api';
import { Button, Empty, ErrorMessage, Field, Header, IconButton, Screen, s } from '../components/ui';
import { useStore } from '../store';
import { money, theme as t } from '../theme';
import type { PickedPhoto, Product, Variant } from '../types';

type Summary = { products: number; pending_orders: number; revenue: number; tryons: number };
export default function Admin() {
  const { user, refresh, notify } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Áo');
  const [description, setDescription] = useState('');
  const [material, setMaterial] = useState('Cotton');
  const [colorName, setColorName] = useState('Trắng');
  const [colorHex, setColorHex] = useState('#EEECE5');
  const [stock, setStock] = useState('10');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [busy, setBusy] = useState(false);
  const wide = useWindowDimensions().width >= 750;
  const load = useCallback(async () => {
    if (user?.role !== 'admin') { setLoading(false); return; }
    try { const [p, stats] = await Promise.all([request<Product[]>('/api/admin/products'), request<Summary>('/api/admin/summary')]); setProducts(p); setSummary(stats); setError(null); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [user?.role]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  function openForm(product?: Product) {
    setEditing(product || null); setName(product?.name || ''); setPrice(product ? String(product.price) : '');
    setCategory(product?.category || 'Áo'); setDescription(''); setPhoto(null); setMaterial('Cotton');
    setColorName('Trắng'); setColorHex('#EEECE5'); setStock('10'); setVariants(product?.variants.map(v => ({ ...v })) || []);
    setFormError(null); setShowForm(true);
  }
  async function pick() {
    try { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 }); if (!result.canceled) setPhoto(result.assets[0]); }
    catch { setFormError('Không mở được thư viện ảnh.'); }
  }
  async function save() {
    if (name.trim().length < 2 || !Number.isInteger(Number(price)) || Number(price) <= 0) { setFormError('Nhập tên sản phẩm và giá bán nguyên dương hợp lệ.'); return; }
    if (!editing && (!photo || description.trim().length < 10 || !colorName.trim() || !/^#[0-9A-Fa-f]{6}$/.test(colorHex) || !/^\d+$/.test(stock))) { setFormError('Chọn ảnh, nhập mô tả ít nhất 10 ký tự, tên màu, mã màu HEX và tồn kho hợp lệ.'); return; }
    setBusy(true); setFormError(null);
    try {
      if (editing) await request(`/api/admin/products/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim(), price: Number(price), variants }) });
      else {
        const form = await photoForm(photo!, 'file');
        const upload = await request<{ url: string }>('/api/admin/upload', { method: 'POST', body: form });
        await request('/api/admin/products', { method: 'POST', body: JSON.stringify({ name: name.trim(), price: Number(price), category, tryon_category: category === 'Quần' ? 'bottoms' : category === 'Váy' ? 'one-pieces' : 'tops', image_url: upload.url, material, description: description.trim(), colors: [{ name: colorName.trim(), hex: colorHex }], sizes: ['S', 'M', 'L', 'XL'], stock_per_variant: Number(stock), tag: 'MỚI', featured: false }) });
      }
      setShowForm(false); await Promise.all([load(), refresh()]); notify(editing ? 'Đã cập nhật sản phẩm.' : 'Đã thêm thiết kế mới vào shop.');
    } catch (e) { setFormError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function toggle(product: Product) {
    setBusy(true);
    try { await request(`/api/admin/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ active: !product.active }) }); await Promise.all([load(), refresh()]); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  if (user?.role !== 'admin') return <Screen><Header title="Quản lý shop" back /><Empty icon="storefront-outline" title="Không gian của chủ shop" description="Đăng nhập bằng tài khoản chủ shop để quản lý sản phẩm và đơn hàng." action="Đăng nhập" onPress={() => router.push('/auth')} /></Screen>;
  return <Screen><Header title="ShopFit Studio" subtitle="SHOP MANAGEMENT" back right={<IconButton name="refresh-outline" label="Làm mới thống kê" onPress={() => void load()} />} /><ErrorMessage message={error} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 24 }}>{[{ label: 'Thiết kế đang bán', value: summary?.products || 0, icon: 'shirt-outline' }, { label: 'Đơn chờ xác nhận', value: summary?.pending_orders || 0, icon: 'receipt-outline' }, { label: 'Doanh thu hoàn tất', value: money(summary?.revenue || 0), icon: 'wallet-outline' }, { label: 'Lượt thử thành công', value: summary?.tryons || 0, icon: 'sparkles-outline' }].map(item => <View key={item.label} style={[s.card, { width: wide ? '23.5%' : '47.5%', padding: 18 }]}><Ionicons name={item.icon as never} size={21} color={t.colors.green} /><Text style={{ fontFamily: t.fonts.bold, fontSize: 25, color: t.colors.ink, marginTop: 18, marginBottom: 7 }}>{item.value}</Text><Text style={[s.muted, { fontSize: 10 }]}>{item.label}</Text></View>)}</View>
    <Button icon="receipt-outline" variant="secondary" onPress={() => router.push('/orders')}>Xem và xử lý đơn hàng</Button><Button icon="analytics-outline" variant="outline" onPress={() => router.push('/fit-insights')} style={{ marginTop: 12 }}>Chất lượng độ vừa & hạn mức AI</Button><View style={[s.between, { marginTop: 32, marginBottom: 16 }]}><Text style={[s.title, { fontSize: 31 }]}>Các thiết kế</Text><Button icon="add" onPress={() => openForm()}>Thêm mẫu</Button></View>
    {loading ? <ActivityIndicator color={t.colors.green} /> : products.map(product => <View key={product.id} style={[s.card, { flexDirection: 'row', gap: 16, marginBottom: 14, padding: 15, opacity: product.active ? 1 : 0.6 }]}><Image source={mediaUrl(product.image_url)} contentFit="cover" style={{ width: 77, height: 105, borderRadius: 8, backgroundColor: t.colors.sand }} /><View style={{ flex: 1 }}><Text style={[s.text, { fontFamily: t.fonts.medium }]}>{product.name}</Text><Text style={[s.muted, { fontSize: 11 }]}>{money(product.price)} · Tồn {product.stock}</Text><Text style={[s.kicker, { fontSize: 8, marginTop: 5 }]}>{product.active ? 'ĐANG HIỂN THỊ' : 'ĐÃ ẨN'}</Text><View style={[s.row, { flexWrap: 'wrap', marginTop: 8 }]}><Pressable accessibilityRole="button" disabled={busy} onPress={() => openForm(product)} style={{ minHeight: 44, justifyContent: 'center', paddingRight: 15 }}><Text style={{ fontFamily: t.fonts.medium, fontSize: 12, color: t.colors.green }}>Sửa & tồn kho</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Số đo ${product.name}`} disabled={busy} onPress={() => router.push(`/admin-sizing/${product.id}`)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ fontFamily: t.fonts.medium, fontSize: 12, color: t.colors.green }}>Bảng số đo & ảnh sau</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => void toggle(product)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontFamily: t.fonts.medium, fontSize: 12, color: t.colors.muted }}>{product.active ? 'Ẩn sản phẩm' : 'Hiện sản phẩm'}</Text></Pressable></View></View></View>)}
    <Modal visible={showForm} animationType="slide" onRequestClose={() => { if (!busy) setShowForm(false); }}><Screen><Header title={editing ? 'Chỉnh sửa thiết kế' : 'Một thiết kế mới'} subtitle="SHOPFIT CATALOG" right={<IconButton name="close" label="Đóng biểu mẫu" onPress={() => { if (!busy) setShowForm(false); }} />} /><View style={{ maxWidth: 600, width: '100%', alignSelf: 'center' }}><Field label="Tên sản phẩm" value={name} onChangeText={setName} /><Field label="Giá bán (VND)" value={price} onChangeText={setPrice} keyboardType="numeric" />
      {!editing && <><Text style={s.label}>Danh mục</Text><View style={[s.row, { flexWrap: 'wrap', marginBottom: 20 }]}>{['Áo', 'Quần', 'Váy', 'Áo khoác'].map(c => <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: c === category }} onPress={() => setCategory(c)} style={{ paddingHorizontal: 16, minHeight: 46, borderRadius: 7, backgroundColor: c === category ? t.colors.green : t.colors.greenLight, justifyContent: 'center' }}><Text style={{ fontFamily: t.fonts.medium, fontSize: 12, color: c === category ? 'white' : t.colors.green }}>{c}</Text></Pressable>)}</View><Field label="Chất liệu" value={material} onChangeText={setMaterial} /><Field label="Mô tả" value={description} onChangeText={setDescription} multiline style={{ minHeight: 100, textAlignVertical: 'top' }} /><View style={s.row}><View style={{ flex: 1 }}><Field label="Tên màu" value={colorName} onChangeText={setColorName} /></View><View style={{ flex: 1 }}><Field label="Mã màu HEX" value={colorHex} onChangeText={setColorHex} autoCapitalize="none" /></View></View><Field label="Tồn kho mỗi size (S, M, L, XL)" value={stock} onChangeText={setStock} keyboardType="numeric" />{photo && <Image source={photo.uri} contentFit="contain" style={{ height: 220, width: '100%', borderRadius: 10, marginBottom: 15, backgroundColor: t.colors.sand }} />}<Button variant="outline" icon="image-outline" onPress={() => void pick()} style={{ marginBottom: 18 }}>{photo ? 'Đổi ảnh sản phẩm' : 'Chọn ảnh sản phẩm'}</Button><Text style={[s.muted, { marginBottom: 20, fontSize: 11 }]}>Dùng ảnh trang phục chính diện, nền đơn giản để thử đồ AI tốt hơn. Mỗi màu nên có ảnh đúng màu sản phẩm.</Text></>}
      {editing && <><Text style={[s.label, { marginTop: 8 }]}>Tồn kho theo màu / size</Text>{variants.map((v, index) => <View key={`${v.size}-${v.color}`} style={[s.between, { marginBottom: 10 }]}><Text style={s.text}>{v.color} / {v.size}</Text><TextInput accessibilityLabel={`Tồn kho ${v.color} size ${v.size}`} value={String(v.stock)} onChangeText={value => setVariants(all => all.map((item, i) => i === index ? { ...item, stock: Math.max(0, Math.min(10000, Number(value.replace(/\D/g, '')) || 0)) } : item))} keyboardType="numeric" style={{ borderWidth: 1, borderColor: t.colors.line, borderRadius: 7, height: 48, width: 85, textAlign: 'center', fontFamily: t.fonts.regular, color: t.colors.ink }} /></View>)}</>}
      <ErrorMessage message={formError} /><Button loading={busy} icon="checkmark" onPress={() => void save()} style={{ marginTop: 16, marginBottom: 25 }}>{editing ? 'Lưu thay đổi' : 'Thêm vào bộ sưu tập'}</Button></View></Screen></Modal>
  </Screen>;
}
