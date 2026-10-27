import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { request } from '../api';
import { theme as t } from '../theme';
import type { FitFeedback, FitFeedbackRow } from '../types';
import { s } from './ui';

export function FeedbackRow({ row }: { row: FitFeedbackRow }) {
  return <View style={{ gap: 8, paddingVertical: 12 }}><Text style={s.label}>Size {row.size} · {row.total} phản hồi</Text>
    <View accessible accessibilityLabel={`Chật ${row.tight}, vừa ${row.fits}, rộng ${row.loose}`} style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: t.colors.line }}>{[['tight', '#A34B42'], ['fits', t.colors.green], ['loose', '#AF8537']].map(([key, color]) => row[key as 'tight' | 'fits' | 'loose'] > 0 && <View key={key} style={{ flex: row[key as 'tight' | 'fits' | 'loose'], backgroundColor: color }} />)}</View>
    <Text style={s.muted}>Chật {row.tight} · Vừa {row.fits} · Rộng {row.loose}</Text>
    {!row.enough_data && <Text style={[s.muted, { fontSize: 11 }]}>Chưa đủ 3 mẫu để nhận định xu hướng.</Text>}
    {row.needs_review && <Text style={[s.muted, { color: t.colors.error }]}>Shop cần kiểm tra lại bảng số đo/phom của size này.</Text>}
  </View>;
}
export function ProductFitFeedback({ productId }: { productId: string }) {
  const [data, setData] = useState<FitFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { let active = true; void request<FitFeedback>(`/api/products/${productId}/fit-feedback`).then(value => { if (active) { setData(value); setError(null); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [productId]));
  return <View style={[s.card, { gap: 8, marginTop: 24 }]}><Text style={[s.text, { fontFamily: t.fonts.bold }]}>Người đã mua nói gì về size?</Text>{data?.rows.length ? data.rows.map(row => <FeedbackRow key={row.size} row={row} />) : <Text style={s.muted}>{error || 'Chưa có phản hồi từ đơn đã giao.'}</Text>}<Text style={[s.muted, { fontSize: 11 }]}>{data?.notice}</Text></View>;
}
