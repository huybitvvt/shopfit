import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { mediaUrl, request } from '../api';
import { Button, Empty, ErrorMessage, Field, Header, IconButton, Screen, s } from '../components/ui';
import { useStore } from '../store';
import { money, theme as t } from '../theme';
import type { Order } from '../types';
import { pendingRequestKey, finishRequestKey } from '../request-key';

export default function Cart() {
  const { cart, user, updateCart, clearCart, notify, refresh } = useStore();
  const [nameInput, setName] = useState<string | null>(null);
  const name = nameInput ?? user?.name ?? '';
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const wide = useWindowDimensions().width >= 850;
  const total = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  async function checkout() {
    if (submitting.current) return;
    if (!user) { router.push('/auth'); return; }
    if (name.trim().length < 2 || !/^\+?[0-9\s.-]{9,16}$/.test(phone) || address.trim().length < 10) { setError('Nhập họ tên, số điện thoại hợp lệ và địa chỉ giao hàng đầy đủ (ít nhất 10 ký tự).'); return; }
    submitting.current = true; setBusy(true); setError(null);
    try {
      const body = JSON.stringify({ customer_name: name.trim(), phone, address: address.trim(), note, items: cart.map(i => ({ product_id: i.product.id, size: i.size, color: i.color, quantity: i.quantity })) });
      const scope = `checkout:${user.id}`;
      const key = await pendingRequestKey(scope, body);
      await request<Order>('/api/orders', { method: 'POST', body, headers: { 'X-Idempotency-Key': key } });
      await finishRequestKey(scope);
      clearCart(); void refresh(); notify('Đặt hàng thành công. Shop sẽ sớm xác nhận đơn của bạn.'); router.replace('/orders');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); submitting.current = false; }
  }
  return <Screen><Header title="Giỏ hàng của bạn" subtitle="GOOD CHOICES, ALL YOURS" back />{cart.length === 0 ? <Empty icon="bag-outline" title="Dành chỗ cho điều bạn thích" description="Khám phá bộ sưu tập, chọn một thiết kế và thử trên ảnh của bạn trước khi quyết định." action="Tiếp tục khám phá" onPress={() => router.replace('/')} /> : <View style={{ flexDirection: wide ? 'row' : 'column', gap: 32 }}><View style={{ flex: 1 }}>{cart.map(item => <View key={item.key} style={{ flexDirection: 'row', gap: 16, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: t.colors.line }}><Pressable accessibilityRole="button" accessibilityLabel={`Xem ${item.product.name}`} onPress={() => router.push(`/product/${item.product.id}`)}><Image source={mediaUrl(item.product.image_url)} contentFit="cover" style={{ width: 95, height: 128, borderRadius: 9, backgroundColor: t.colors.sand }} /></Pressable><View style={{ flex: 1, gap: 5 }}><Text style={{ fontFamily: t.fonts.medium, color: t.colors.ink, lineHeight: 21 }}>{item.product.name}</Text><Text style={[s.muted, { fontSize: 11 }]}>{item.color} / Size {item.size}</Text><Text style={{ fontFamily: t.fonts.bold, color: t.colors.green, fontSize: 13, marginTop: 3 }}>{money(item.product.price)}</Text><View style={[s.between, { marginTop: 4 }]}><View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: t.colors.line, borderRadius: 7 }}><IconButton name="remove" label={`Giảm số lượng ${item.product.name}`} onPress={() => updateCart(item.key, item.quantity - 1)} style={{ width: 40, height: 44 }} /><Text style={[s.text, { minWidth: 20, textAlign: 'center' }]}>{item.quantity}</Text><IconButton name="add" label={`Tăng số lượng ${item.product.name}`} onPress={() => updateCart(item.key, item.quantity + 1)} style={{ width: 40, height: 44 }} /></View><IconButton name="trash-outline" label={`Xóa ${item.product.name} khỏi giỏ`} onPress={() => updateCart(item.key, 0)} /></View></View></View>)}<Text style={[s.muted, { marginTop: 18, fontSize: 11 }]}>Giá và tồn kho được kiểm tra lại khi đặt hàng.</Text></View>
    <View style={[s.card, { width: wide ? 385 : '100%', alignSelf: 'flex-start', padding: 24 }]}><Text style={[s.title, { fontSize: 30, marginBottom: 20 }]}>Gửi đến bạn</Text><Field label="Người nhận" value={name} onChangeText={setName} autoComplete="name" placeholder="Họ và tên" /><Field label="Số điện thoại" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="09xx xxx xxx" /><Field label="Địa chỉ giao hàng" value={address} onChangeText={setAddress} autoComplete="street-address" placeholder="Số nhà, đường, phường/xã, tỉnh/thành" multiline /><Field label="Lời nhắn cho shop (tùy chọn)" value={note} onChangeText={setNote} multiline placeholder="Bạn muốn shop lưu ý điều gì?" /><View style={s.divider} /><View style={s.between}><Text style={s.muted}>Tạm tính</Text><Text style={s.text}>{money(total)}</Text></View><View style={[s.between, { marginTop: 12 }]}><Text style={s.muted}>Giao hàng tiêu chuẩn</Text><Text style={[s.text, { fontSize: 12 }]}>Miễn phí</Text></View><View style={[s.between, { marginVertical: 22 }]}><Text style={{ fontFamily: t.fonts.bold, color: t.colors.ink }}>Tổng thanh toán</Text><Text style={{ fontFamily: t.fonts.bold, fontSize: 21, color: t.colors.green }}>{money(total)}</Text></View><View style={[s.row, { backgroundColor: t.colors.greenLight, padding: 12, borderRadius: 8, marginBottom: 18, gap: 9 }]}><Ionicons name="cash-outline" size={19} color={t.colors.green} /><Text style={[s.muted, { fontSize: 11, flex: 1 }]}>Thanh toán khi nhận hàng (COD)</Text></View><ErrorMessage message={error} /><Button loading={busy} icon="arrow-forward" onPress={() => void checkout()}>{user ? 'Đặt hàng' : 'Đăng nhập để đặt hàng'}</Button></View></View>}</Screen>;
}
