import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { mediaUrl } from '../api';
import { theme as t } from '../theme';
import type { Angle, TryOn } from '../types';
import { Button, IconButton, s } from './ui';

export const angles: Angle[] = ['front', 'left', 'back', 'right'];
export const angleLabels: Record<Angle, string> = { front: 'Trước', left: 'Trái', back: 'Sau', right: 'Phải' };

export function FourView({ job }: { job: TryOn }) {
  const [index, setIndex] = useState(0);
  const [original, setOriginal] = useState(false);
  const activeViews = job.views.filter(v => v.status !== 'unavailable');
  const availableAngles = activeViews.length > 0 ? activeViews.map(v => v.angle) : ['front' as Angle];
  const isMulti = availableAngles.length > 1;
  const safeIndex = index < availableAngles.length ? index : 0;
  const angle = availableAngles[safeIndex];
  const view = job.views.find(v => v.angle === angle);
  const url = original ? job.photo_url : view?.url;
  const count = job.views.filter(v => v.status === 'completed').length;
  function select(next: number) { setIndex((next + availableAngles.length) % availableAngles.length); setOriginal(false); }
  return <View style={{ gap: 12 }}>
    {isMulti ? (
      <View style={[s.between, { gap: 4 }]}><IconButton name="chevron-back" label="Góc trước đó" onPress={() => select(safeIndex - 1)} /><View style={{ alignItems: 'center', flex: 1 }}><Text accessibilityLiveRegion="polite" testID="view-angle" style={[s.text, { fontFamily: t.fonts.bold }]}>{original ? 'Ảnh gốc' : `Góc ${angleLabels[angle].toLowerCase()}`}</Text><Text style={[s.muted, { fontSize: 11 }]}>{safeIndex + 1} / {availableAngles.length} · {count} ảnh đã có</Text></View><IconButton name="chevron-forward" label="Góc tiếp theo" onPress={() => select(safeIndex + 1)} /></View>
    ) : (
      <View style={{ alignItems: 'center', paddingVertical: 4 }}><Text accessibilityLiveRegion="polite" testID="view-angle" style={[s.text, { fontFamily: t.fonts.bold }]}>{original ? 'Ảnh gốc' : 'Ảnh thử đồ của bạn'}</Text><Text style={[s.muted, { fontSize: 11, marginTop: 2 }]}>{original ? 'Ảnh toàn thân trước khi thử đồ' : 'Mặt trước · Hoàn tất'}</Text></View>
    )}
    <View style={{ width: '100%', aspectRatio: 3 / 4, backgroundColor: t.colors.sand, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {url ? <Image source={mediaUrl(url)} contentFit="contain" accessibilityLabel={original ? 'Ảnh gốc trước khi thử đồ' : isMulti ? `Ảnh thử đồ góc ${angleLabels[angle].toLowerCase()}` : 'Ảnh thử đồ của bạn'} style={{ width: '100%', height: '100%' }} /> : <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>{['processing', 'pending', 'validating'].includes(view?.status || '') && <ActivityIndicator color={t.colors.green} />}<Text style={[s.muted, { textAlign: 'center' }]}>{view?.status === 'failed' ? view.error : view?.status === 'unavailable' ? 'Lượt thử cũ chưa có góc này.' : view?.status === 'validating' ? 'Đã tạo ảnh, đang kiểm tra trang phục…' : isMulti ? `Đang chờ ảnh góc ${angleLabels[angle].toLowerCase()}…` : 'Đang xử lý ảnh thử đồ…'}</Text></View>}
    </View>
    {isMulti && <View style={[s.row, { gap: 6 }]}>{availableAngles.map((a, i) => <Pressable key={a} accessibilityRole="button" accessibilityLabel={`Xem góc ${angleLabels[a].toLowerCase()}`} accessibilityState={{ selected: i === safeIndex }} onPress={() => select(i)} style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: i === safeIndex ? t.colors.green : t.colors.greenLight }}><Text style={{ fontFamily: t.fonts.medium, color: i === safeIndex ? 'white' : t.colors.green, fontSize: 12 }}>{angleLabels[a]}</Text></Pressable>)}</View>}
    {view?.url && <Button variant="outline" onPress={() => setOriginal(v => !v)}>{original ? 'Xem ảnh sau khi thử' : 'So sánh với ảnh gốc'}</Button>}
    <Text style={[s.muted, { fontSize: 11, lineHeight: 18 }]}>{isMulti ? 'Trái/phải theo phía cơ thể người mặc. Góc khuất là AI suy diễn; ảnh mặt sau sản phẩm do shop cung cấp sẽ giúp giữ đúng chi tiết.' : 'Ảnh được tạo bằng AI dựa trên vóc dáng và số đo của bạn. Dùng nút so sánh để đối chiếu với ảnh gốc.'}</Text>
  </View>;
}
