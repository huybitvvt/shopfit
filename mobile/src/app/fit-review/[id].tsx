import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { request } from '../../api';
import { Button, Empty, ErrorMessage, Field, Header, Screen, s } from '../../components/ui';
import { useStore } from '../../store';
import type { FitReview, Order, OrderItem } from '../../types';

export default function PurchaseFitReview() {
  const { id, orderId } = useLocalSearchParams<{ id: string; orderId: string }>();
  const { user, notify } = useStore();
  const [item, setItem] = useState<OrderItem | null>(null);
  const [fit, setFit] = useState<FitReview['actual_fit'] | null>(null);
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (user) void request<Order[]>('/api/orders').then(orders => {
      if (!active) return;
      const order = orders.find(o => o.id === orderId && o.status === 'completed');
      const found = order?.items.find(i => i.id === Number(id));
      if (!found) { setError('Cần sản phẩm thuộc đơn của bạn đã giao hoàn tất.'); return; }
      setItem(found); setFit(found.fit_review?.actual_fit || null); setNotes(found.fit_review?.notes || '');
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id, orderId, user]);
  async function save() {
    if (!item || !fit || !consent) return;
    setBusy(true); setError(null);
    try { await request(`/api/orders/${orderId}/items/${item.id}/fit-review`, { method: 'POST', body: JSON.stringify({ actual_fit: fit, notes }) }); notify('Đã gửi cảm nhận size từ đơn đã mua.'); router.back(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError(null);
    try { await request(`/api/orders/${orderId}/items/${id}/fit-review`, { method: 'DELETE' }); notify('Đã gỡ phản hồi size khỏi thống kê.'); router.back(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!user) return <Screen><Header title="Đánh giá size đã mua" back /><Empty title="Phản hồi từ lần mặc thật" description="Đăng nhập để đánh giá sản phẩm trong đơn đã nhận." action="Đăng nhập" onPress={() => router.push('/auth')} /></Screen>;
  return <Screen><Header title="Size này mặc thế nào?" subtitle="VERIFIED ORDER · YOUR EXPERIENCE" back /><View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 20 }}>
    <Text style={s.text}>{item?.name} · {item?.color} · Size {item?.size}</Text><Text style={s.muted}>Đánh giá sau khi mặc thật. Mỗi sản phẩm trong đơn chỉ tính một phản hồi; sửa phản hồi sẽ thay thế kết quả cũ.</Text>
    <View style={[s.row, { flexWrap: 'wrap' }]}>{([['tight', 'Chật'], ['fits', 'Vừa'], ['loose', 'Rộng']] as const).map(([key, label]) => <Button key={key} disabled={busy} variant={fit === key ? 'primary' : 'outline'} onPress={() => setFit(key)}>{label}</Button>)}</View>
    <Field label="Ghi chú cảm nhận khi mặc" value={notes} onChangeText={setNotes} multiline maxLength={1000} editable={!busy} placeholder="Ví dụ: vừa ngực nhưng dài tay, vải ít co giãn" />
    <View style={[s.row, { alignItems: 'flex-start' }]}><Switch accessibilityLabel="Đồng ý gửi phản hồi size cho shop" value={consent} onValueChange={setConsent} disabled={busy} /><Text style={[s.muted, { flex: 1 }]}>Gửi cảm nhận size và ghi chú cho shop; số lượng phản hồi tổng hợp sẽ hiển thị trên sản phẩm. Không chia sẻ ảnh thử đồ hoặc số đo cơ thể.</Text></View>
    <ErrorMessage message={error} /><Button loading={busy} disabled={!item || !fit || !consent} onPress={() => void save()}>Gửi đánh giá size</Button>
    {item?.fit_review && <Button variant="outline" disabled={busy} onPress={() => void remove()}>Gỡ đánh giá size đã gửi</Button>}
  </View></Screen>;
}
