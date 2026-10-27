import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { request } from '../api';
import { FeedbackRow } from '../components/fit-feedback';
import { Button, Empty, ErrorMessage, Header, Screen, s } from '../components/ui';
import { useStore } from '../store';
import type { AIUsage, FitInsights } from '../types';

export default function InsightsScreen() {
  const { user } = useStore();
  const [insights, setInsights] = useState<FitInsights | null>(null);
  const [usage, setUsage] = useState<AIUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (user?.role !== 'admin') return;
    setBusy(true);
    try { const [i, u] = await Promise.all([request<FitInsights>('/api/admin/fit-insights'), request<AIUsage>('/api/admin/ai-usage')]); setInsights(i); setUsage(u); setError(null); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [user?.role]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (user?.role !== 'admin') return <Screen><Header title="Chất lượng độ vừa" back /><Empty title="Không gian của shop" description="Đăng nhập tài khoản chủ shop để xem dữ liệu tổng hợp." action="Đăng nhập" onPress={() => router.push('/auth')} /></Screen>;
  return <Screen><Header title="Chất lượng độ vừa" subtitle="FIT INSIGHTS · SHOPFIT" back /><View style={{ maxWidth: 800, width: '100%', alignSelf: 'center', gap: 18 }}>
    <ErrorMessage message={error} /><Button variant="outline" loading={busy} onPress={() => void load()}>Làm mới thống kê độ vừa</Button>
    <View style={[s.card, { gap: 10 }]}><Text style={s.title}>{insights?.review_count || 0} phản hồi đã mua</Text><Text style={s.muted}>Đã xác nhận số đo: {insights?.catalog.measured || 0}/{insights?.catalog.total || 0} thiết kế đang bán.</Text><Text style={s.muted}>{insights?.notice}</Text></View>
    {insights?.rows.length ? insights.rows.map(row => <View key={`${row.product_id}:${row.size}`} style={s.card}><Text style={s.label}>{row.name}</Text><FeedbackRow row={row} /><Button variant="outline" onPress={() => router.push(`/admin-sizing/${row.product_id}`)}>Kiểm tra số đo sản phẩm</Button></View>) : <Text style={s.muted}>Chưa có phản hồi từ đơn đã giao. Không suy ra xu hướng từ dữ liệu thử AI.</Text>}
    {!!insights?.recent_reviews?.length && <View style={[s.card, { gap: 14 }]}><Text style={s.label}>Ghi chú khách chủ động chia sẻ</Text>{insights.recent_reviews.map((review, i) => <View key={`${review.product_id}:${review.updated_at}:${i}`} style={{ gap: 5 }}><Text style={s.text}>{review.name} · {review.color}/{review.size} · {({ tight: 'Chật', fits: 'Vừa', loose: 'Rộng' })[review.actual_fit]}</Text><Text style={s.muted}>{review.notes || 'Không có ghi chú.'}</Text></View>)}</View>}
    <View style={[s.card, { gap: 10 }]}><Text style={s.label}>Hoạt động phòng thử</Text><Text style={s.muted}>Tổng {insights?.tryons.total || 0} lượt · Đủ bốn góc {insights?.tryons.completed || 0} · Một phần {insights?.tryons.partial || 0} · Lỗi {insights?.tryons.failed || 0}</Text><Text style={s.muted}>Thời gian xử lý trung bình ghi nhận: {insights?.tryons.average_ms != null ? `${(insights.tryons.average_ms / 1000).toFixed(1)} giây` : 'chưa có dữ liệu'}.</Text></View>
    {usage && <View style={[s.card, { gap: 10 }]}><Text style={s.label}>Hạn mức AI · ngày UTC {usage.date_utc}</Text><Text style={s.text}>Đã dự trù ${usage.estimated_usd.toFixed(3)} / ${usage.budget_usd.toFixed(2)}</Text><Text style={s.muted}>Trần lời gọi: {usage.image_limit} tạo ảnh / {usage.vision_limit} kiểm tra.</Text>{usage.calls.map(row => <Text key={`${row.kind}:${row.status}`} style={s.muted}>{row.kind === 'image' ? 'Tạo ảnh' : 'Kiểm tra'} · {row.status === 'completed' ? 'hoàn tất' : row.status === 'failed' ? 'lỗi' : row.status === 'unknown' ? 'gián đoạn, chưa rõ kết quả' : 'đang chạy'}: {row.count}</Text>)}<Text style={[s.muted, { fontSize: 11 }]}>{usage.notice}</Text></View>}
  </View></Screen>;
}
