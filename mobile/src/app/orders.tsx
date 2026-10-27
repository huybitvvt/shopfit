import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { mediaUrl, request } from '../api';
import { Button, Empty, ErrorMessage, Header, Screen, s } from '../components/ui';
import { useStore } from '../store';
import { dateLabel, money, orderStatuses, theme as t } from '../theme';
import type { Order } from '../types';

export default function Orders() {
  const { user, notify, refresh } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!user) { setLoading(false); setOrders([]); return; }
    setLoading(true);
    void request<Order[]>('/api/orders').then(list => { if (active) { setOrders(list); setError(null); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]));
  async function changeStatus(order: Order, status: string) {
    setBusy(order.id); setError(null);
    try { const next = await request<Order>(`/api/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); setOrders(list => list.map(i => i.id === next.id ? next : i)); void refresh(); notify('Đã cập nhật đơn hàng.'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  return <Screen><Header title={user?.role === 'admin' ? 'Đơn hàng của shop' : 'Đang đến với bạn'} subtitle="YOUR ORDER STORIES" back /><View style={{ maxWidth: 800, width: '100%', alignSelf: 'center' }}><ErrorMessage message={error} />{loading ? <ActivityIndicator color={t.colors.green} style={{ margin: 30 }} /> : !user ? <Empty icon="receipt-outline" title="Theo dõi đơn của bạn" description="Đăng nhập để xem lịch sử đặt hàng và trạng thái giao hàng." action="Đăng nhập" onPress={() => router.push('/auth')} /> : orders.length === 0 ? <Empty icon="receipt-outline" title="Câu chuyện tiếp theo đang chờ" description="Đơn hàng của bạn sẽ xuất hiện ở đây sau khi đặt thành công." action="Khám phá bộ sưu tập" onPress={() => router.push('/')} /> : orders.map(order => <View key={order.id} style={[s.card, { marginBottom: 20 }]}><View style={s.between}><View><Text style={s.kicker}>SF · {order.id.slice(0, 8).toUpperCase()}</Text><Text style={[s.muted, { fontSize: 10, marginTop: 5 }]}>{dateLabel(order.created_at)}</Text></View><View style={{ backgroundColor: order.status === 'cancelled' ? t.colors.errorLight : t.colors.greenLight, borderRadius: 5, padding: 9 }}><Text style={{ fontFamily: t.fonts.medium, fontSize: 10, color: order.status === 'cancelled' ? t.colors.error : t.colors.green }}>{orderStatuses[order.status]}</Text></View></View>
    <View style={[s.divider, { marginVertical: 18 }]} />{order.items.map((item, index) => <View key={`${item.product_id}-${index}`} style={[s.row, { marginBottom: 16 }]}><Image source={mediaUrl(item.image_url)} contentFit="cover" style={{ width: 63, height: 78, borderRadius: 7, backgroundColor: t.colors.sand }} /><View style={{ flex: 1 }}><Text style={[s.text, { fontFamily: t.fonts.medium, fontSize: 12 }]}>{item.name}</Text><Text style={[s.muted, { fontSize: 11 }]}>{item.color} / {item.size} · SL {item.quantity}</Text><Text style={[s.text, { fontSize: 12, marginTop: 3 }]}>{money(item.price * item.quantity)}</Text>{order.status === 'completed' && user.role !== 'admin' && <Button variant="outline" onPress={() => router.push({ pathname: '/fit-review/[id]', params: { id: String(item.id), orderId: order.id } })} style={{ marginTop: 8 }}>{item.fit_review ? 'Sửa đánh giá size' : 'Đánh giá size đã mua'}</Button>}</View></View>)}
    <View style={{ backgroundColor: t.colors.background, padding: 14, borderRadius: 8, gap: 5 }}><Text style={[s.text, { fontSize: 12 }]}>{order.customer_name} · {order.phone}</Text><Text style={[s.muted, { fontSize: 11 }]}>{order.address}</Text>{order.note ? <Text style={[s.muted, { fontSize: 11 }]}>Lời nhắn: {order.note}</Text> : null}</View><View style={[s.between, { marginTop: 18 }]}><Text style={s.muted}>Tổng · COD</Text><Text style={{ fontFamily: t.fonts.bold, color: t.colors.green, fontSize: 19 }}>{money(order.total)}</Text></View>
    {(order.status === 'pending' || (user.role === 'admin' && order.status === 'confirmed')) && <Button variant="outline" disabled={busy !== null} onPress={() => void changeStatus(order, 'cancelled')} style={{ marginTop: 16 }}>Hủy đơn hàng</Button>}
    {user.role === 'admin' && ['pending', 'confirmed', 'shipping'].includes(order.status) && <Button loading={busy === order.id} disabled={busy !== null && busy !== order.id} onPress={() => void changeStatus(order, ({ pending: 'confirmed', confirmed: 'shipping', shipping: 'completed' } as Record<string, string>)[order.status])} style={{ marginTop: 10 }}>{({ pending: 'Xác nhận đơn hàng', confirmed: 'Bắt đầu giao hàng', shipping: 'Xác nhận đã giao' } as Record<string, string>)[order.status]}</Button>}
    </View>)}</View></Screen>;
}
