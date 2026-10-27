import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { mediaUrl, photoForm, request } from '../../api';
import { Button, Empty, ErrorMessage, Field, Header, Screen, s } from '../../components/ui';
import { useStore } from '../../store';
import { theme as t } from '../../theme';
import type { Evaluation, PickedPhoto, TryOn } from '../../types';

const criteria = { identity_score: 'Giữ đúng người và vóc dáng', garment_score: 'Đúng màu, phom và chi tiết đồ', fit_score: 'Độ vừa giống khi mặc thật' };
export default function EvaluationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, notify } = useStore();
  const [job, setJob] = useState<TryOn | null>(null);
  const [saved, setSaved] = useState<Evaluation | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [scores, setScores] = useState({ identity_score: 0, garment_score: 0, fit_score: 0 });
  const [actualFit, setActualFit] = useState<Evaluation['actual_fit']>('fits');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (user) void Promise.all([request<TryOn>(`/api/tryons/${id}`), request<Evaluation | null>(`/api/tryons/${id}/evaluation`)]).then(([j, e]) => {
      if (!active) return;
      setJob(j); setSaved(e);
      if (e) { setScores({ identity_score: e.identity_score, garment_score: e.garment_score, fit_score: e.fit_score }); setActualFit(e.actual_fit); setNotes(e.notes); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id, user]);
  async function pick() {
    try { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.95 }); if (!result.canceled) setPhoto(result.assets[0]); }
    catch { setError('Không mở được thư viện ảnh.'); }
  }
  async function save() {
    if (!photo) return;
    setBusy(true); setError(null);
    try {
      const form = await photoForm(photo, 'photo');
      Object.entries(scores).forEach(([k, v]) => form.append(k, String(v))); form.append('actual_fit', actualFit); form.append('notes', notes);
      setSaved(await request<Evaluation>(`/api/tryons/${id}/evaluation`, { method: 'POST', body: form })); setPhoto(null); notify('Đã lưu đánh giá đối chiếu ảnh mặc thật.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!user) return <Screen><Header title="Đối chiếu mặc thật" back /><Empty title="Ảnh đối chiếu riêng tư" description="Đăng nhập tài khoản đã tạo lượt thử này." action="Đăng nhập" onPress={() => router.push('/auth')} /></Screen>;
  const actualUrl = photo?.uri || mediaUrl(saved?.actual_url);
  return <Screen><Header title="Đối chiếu mặc thật" subtitle="AI PREVIEW / REAL WEARING" back /><View style={{ maxWidth: 760, width: '100%', alignSelf: 'center', gap: 18 }}>
    <Text style={s.text}>{job?.product_name} · Size {job?.size || 'chưa lưu'} · {job?.color}</Text>
    <Text style={s.muted}>Mặc đúng sản phẩm, màu và size của lượt thử. Chụp chính diện toàn thân, cùng tư thế, khoảng cách và ánh sáng gần ảnh gốc. Đây là đánh giá của người dùng, chưa phải số liệu kiểm chứng khoa học.</Text>
    <View style={[s.row, { alignItems: 'flex-start' }]}><View style={{ flex: 1, gap: 8 }}><Text style={s.label}>Ảnh AI · mặt trước</Text><Image source={mediaUrl(job?.result_url)} contentFit="contain" style={{ width: '100%', aspectRatio: 3 / 4, backgroundColor: t.colors.sand, borderRadius: 10 }} /></View><View style={{ flex: 1, gap: 8 }}><Text style={s.label}>Ảnh mặc thật</Text>{actualUrl ? <Image source={actualUrl} contentFit="contain" style={{ width: '100%', aspectRatio: 3 / 4, backgroundColor: t.colors.sand, borderRadius: 10 }} /> : <View style={{ aspectRatio: 3 / 4, backgroundColor: t.colors.sand, borderRadius: 10, justifyContent: 'center', padding: 12 }}><Text style={s.muted}>Chưa có ảnh đối chứng</Text></View>}</View></View>
    <Button variant="outline" disabled={busy} onPress={() => void pick()}>{saved || photo ? 'Chọn lại ảnh mặc thật' : 'Chọn ảnh mặc thật'}</Button>
    <Text style={s.muted}>Chấm từ 1 (khác nhiều) đến 5 (rất giống). Chấm cả ba tiêu chí sau khi quan sát hai ảnh.</Text>
    {(Object.keys(criteria) as (keyof typeof criteria)[]).map(key => <View key={key} style={{ gap: 10 }}><Text style={s.label}>{criteria[key]}</Text><View style={s.row}>{[1, 2, 3, 4, 5].map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${criteria[key]} ${value} điểm`} accessibilityState={{ selected: scores[key] === value }} disabled={busy} onPress={() => setScores(old => ({ ...old, [key]: value }))} style={{ width: 46, height: 48, backgroundColor: scores[key] === value ? t.colors.green : t.colors.greenLight, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: scores[key] === value ? 'white' : t.colors.green, fontFamily: t.fonts.medium }}>{value}</Text></Pressable>)}</View></View>)}
    <Text style={s.label}>Cảm nhận size khi mặc thật</Text><View style={[s.row, { flexWrap: 'wrap' }]}>{([['tight', 'Chật'], ['fits', 'Vừa'], ['loose', 'Rộng']] as const).map(([key, label]) => <Button key={key} variant={actualFit === key ? 'primary' : 'outline'} disabled={busy} onPress={() => setActualFit(key)}>{label}</Button>)}</View>
    <Field label="Ghi chú đối chiếu" value={notes} onChangeText={setNotes} maxLength={1000} multiline editable={!busy} />
    <ErrorMessage message={error} /><Button loading={busy} disabled={!photo || !job?.result_url || Object.values(scores).some(v => v < 1)} onPress={() => void save()}>Lưu đánh giá đối chiếu</Button>
    {saved && <Text style={s.muted}>Đã lưu đánh giá. Chọn lại ảnh để cập nhật. Xóa lượt thử sẽ xóa cả ảnh đối chứng này.</Text>}
  </View></Screen>;
}
