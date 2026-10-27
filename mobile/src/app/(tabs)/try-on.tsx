import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { mediaUrl, photoForm, request } from '../../api';
import { FourView } from '../../components/four-view';
import { SizingAdvice } from '../../components/sizing';
import { Button, CartButton, ErrorMessage, Header, Screen, SectionHeading, s } from '../../components/ui';
import { useStore } from '../../store';
import { finishRequestKey, pendingRequestKey } from '../../request-key';
import { dateLabel, theme as t } from '../../theme';
import type { BodyProfile, PhotoCheck, PickedPhoto, TryOn } from '../../types';

export default function FittingRoom() {
  const { user, restoring } = useStore();
  const params = useLocalSearchParams<{ productId?: string; color?: string; size?: string }>();
  if (restoring) return <Screen><Header title="Phòng thử của bạn" /><ActivityIndicator accessibilityLabel="Đang khôi phục phiên đăng nhập" color={t.colors.green} /></Screen>;
  return <FittingRoomContent key={`${user?.id || 'guest'}:${params.productId}:${params.color}:${params.size}`} />;
}

function FittingRoomContent() {
  const params = useLocalSearchParams<{ productId?: string; color?: string; size?: string }>();
  const { products, user, health, notify } = useStore();
  const scrollRef = useRef<ScrollView>(null);
  const submitting = useRef(false);
  const [selectedId, setSelectedId] = useState(params.productId || '');
  const [colorChoice, setColor] = useState(params.color || '');
  const [sizeChoice, setSize] = useState(params.size || 'M');
  const [profile, setProfile] = useState<BodyProfile | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [check, setCheck] = useState<PhotoCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [job, setJob] = useState<TryOn | null>(null);
  const [history, setHistory] = useState<TryOn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wide = useWindowDimensions().width >= 850;
  const product = products.find(p => p.id === selectedId) || products[0];
  const color = product?.colors.some(c => c.name === colorChoice) ? colorChoice : product?.colors[0]?.name || '';
  const size = product?.sizes.includes(sizeChoice) ? sizeChoice : product?.sizes[0] || 'M';
  const jobId = job?.id;
  const running = job?.status === 'queued' || job?.status === 'processing';
  const locked = running || busy || checking;
  const stock = product?.variants.find(v => v.size === size && v.color === color)?.stock || 0;
  const required = product?.tryon_category === 'tops' ? ['chest_cm'] : product?.tryon_category === 'bottoms' ? ['waist_cm', 'hip_cm'] : ['chest_cm', 'waist_cm', 'hip_cm'];
  const readyProfile = !!profile && required.every(k => profile[k as keyof BodyProfile] != null);

  useEffect(() => {
    if (!jobId) return;
    // Wait for the new viewer layout; scrolling before commit lets web scroll anchoring keep the history in view.
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [jobId]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const list = await request<TryOn[]>('/api/tryons'); setHistory(list);
    setJob(current => current ? list.find(v => v.id === current.id) || current : list.find(v => v.status === 'queued' || v.status === 'processing') || null);
  }, [user]);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (user) {
      void loadHistory().catch(e => { if (active) setError(e.message); });
      void request<{ profile: BodyProfile | null }>('/api/body-profile').then(data => { if (active) setProfile(data.profile); }).catch(e => { if (active) setError(e.message); });
    }
    return () => { active = false; };
  }, [user, loadHistory]));
  useEffect(() => {
    if (!jobId || !running) return;
    let active = true, pending = false;
    const timer = setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await request<TryOn>(`/api/tryons/${jobId}`);
        if (!active) return;
        setJob(next);
        if (!['queued', 'processing'].includes(next.status)) { await loadHistory(); notify(next.status === 'completed' ? 'Đã có đủ 4 góc thử đồ.' : 'Đã lưu các góc tạo được. Có thể tạo lại góc thiếu.'); }
      } catch (e) { if (active) setError((e as Error).message); }
      finally { pending = false; }
    }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [jobId, running, loadHistory, notify]);

  async function inspect(selected: PickedPhoto) {
    if (!user) return;
    setChecking(true); setCheck(null); setError(null);
    try { setCheck(await request<PhotoCheck>('/api/photo-check', { method: 'POST', body: await photoForm(selected, 'photo') }, 60000)); }
    catch (e) { setError((e as Error).message); } finally { setChecking(false); }
  }
  async function choosePhoto(camera = false) {
    if (!user) { router.push('/auth'); return; }
    setError(null);
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) { setError('Cho phép dùng camera để chụp ảnh toàn thân.'); return; }
      const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.95 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.95 });
      if (!result.canceled) { const selected = result.assets[0]; setPhoto(selected); setJob(null); await inspect(selected); }
    } catch { setError('Không mở được ảnh. Vui lòng thử lại.'); }
  }
  async function generate() {
    if (!user) { router.push('/auth'); return; }
    if (!photo || !product || !check?.accepted || !readyProfile || locked || submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(null);
    try {
      const form = await photoForm(photo, 'photo'); form.append('product_id', product.id); form.append('color', color); form.append('size', size);
      const scope = `tryon:${user.id}`;
      const key = await pendingRequestKey(scope, JSON.stringify([photo.uri, product.id, color, size]));
      setJob(await request<TryOn>('/api/tryons', { method: 'POST', body: form, headers: { 'X-Idempotency-Key': key } }, 60000));
      await finishRequestKey(scope);
      await loadHistory();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); submitting.current = false; }
  }
  async function retry() {
    if (!job || !user || submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(null);
    try {
      const scope = `retry:${user.id}:${job.id}`;
      const key = await pendingRequestKey(scope, String(job.retry_count));
      setJob(await request<TryOn>(`/api/tryons/${job.id}/retry`, { method: 'POST', headers: { 'X-Idempotency-Key': key } }));
      await finishRequestKey(scope);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); submitting.current = false; }
  }
  async function deleteJob() {
    if (!job) return;
    setBusy(true);
    try { await request(`/api/tryons/${job.id}`, { method: 'DELETE' }); setJob(null); await loadHistory(); notify('Đã xóa ảnh và bản lưu số đo của lượt thử.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return <Screen scrollRef={scrollRef}><Header title="Phòng thử của bạn" subtitle="FOUR VIEWS · YOUR FIT" right={<CartButton />} />
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 40 : 24 }}>
      <View style={{ width: wide ? '43%' : '100%', maxWidth: 480, alignSelf: wide ? 'flex-start' : 'center' }}>
        {job ? <><FourView key={job.id} job={job} /><Text style={[s.label, { marginTop: 16 }]}>{job.product_name || products.find(p => p.id === job.product_id)?.name} · {job.color} · Size {job.size || 'chưa lưu'}</Text>
          {job.body_snapshot && <Text style={s.muted}>Hồ sơ lúc tạo: {job.body_snapshot.height_cm} cm / {job.body_snapshot.weight_kg} kg. Size và số đo được lưu riêng cho lượt này.</Text>}
          {running && <Text accessibilityLiveRegion="polite" style={[s.muted, { marginTop: 12 }]}>Đang tạo lần lượt 4 ảnh. Có thể xem ngay các góc đã hoàn tất.</Text>}
          {!running && job.fit_snapshot && ['partial', 'failed'].includes(job.status) && job.retry_count < 2 && <Button loading={busy} variant="secondary" onPress={() => void retry()} style={{ marginTop: 12 }}>Tạo lại góc còn thiếu</Button>}
          {!running && job.result_url && <Button variant="outline" onPress={() => router.push(`/evaluation/${job.id}`)} style={{ marginTop: 12 }}>Đối chiếu với ảnh mặc thật</Button>}
          {!running && <Button variant="outline" disabled={busy} onPress={() => void deleteJob()} style={{ marginTop: 12 }}>Xóa ảnh và lượt thử này</Button>}
        </> : photo ? <Image source={photo.uri} contentFit="contain" accessibilityLabel="Ảnh toàn thân đã chọn" style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 14, backgroundColor: t.colors.sand }} /> : <View style={[s.card, { aspectRatio: 3 / 4, justifyContent: 'center', alignItems: 'center', gap: 14 }]}><Text style={[s.title, { fontSize: 30, textAlign: 'center' }]}>Bắt đầu từ một tấm ảnh</Text><Text style={[s.muted, { textAlign: 'center' }]}>Một người, đứng thẳng, chụp trọn đầu đến chân. Hai tay cách nhẹ khỏi thân, nền gọn và đủ sáng.</Text></View>}
        <View style={[s.row, { marginTop: 14 }]}><Button variant="outline" icon="image-outline" disabled={locked} onPress={() => void choosePhoto()} style={{ flex: 1 }}>{photo ? 'Đổi ảnh' : 'Chọn ảnh'}</Button><Button variant="outline" icon="camera-outline" disabled={locked} onPress={() => void choosePhoto(true)} style={{ flex: 1 }}>Chụp ảnh</Button></View>
        {checking && <View style={[s.row, { marginTop: 15 }]}><ActivityIndicator color={t.colors.green} /><Text style={s.muted}>Đang kiểm tra toàn thân, tư thế và độ rõ…</Text></View>}
        {check && <View accessibilityLiveRegion="polite" style={[s.card, { marginTop: 12, gap: 8 }]}><Text style={[s.text, { color: check.accepted ? t.colors.green : t.colors.error }]}>{check.accepted ? 'Ảnh đạt kiểm tra đầu vào' : 'Cần chụp/chọn lại ảnh'}</Text>{check.messages.map(m => <Text key={m} style={s.muted}>{m}</Text>)}{check.warnings?.map(m => <Text key={m} style={[s.muted, { color: t.colors.gold }]}>{m}</Text>)}<Text style={[s.muted, { fontSize: 11 }]}>Kiểm tra AI có thể bỏ sót lỗi; không đo số đo cơ thể từ ảnh.</Text></View>}
        {photo && user && !checking && (!check || !check.accepted) && <Button variant="outline" disabled={busy || running} onPress={() => void inspect(photo)} style={{ marginTop: 12 }}>Kiểm tra lại ảnh</Button>}
      </View>
      <View style={{ flex: 1 }}><Text style={s.kicker}>01 / TRANG PHỤC & SIZE</Text><Text style={[s.title, { fontSize: 30, lineHeight: 37, marginVertical: 12 }]}>Chọn thiết kế của bạn</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 14 }}>{products.map(p => <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Thử ${p.name}`} accessibilityState={{ selected: product?.id === p.id }} disabled={locked} onPress={() => { setSelectedId(p.id); setJob(null); }} style={{ width: 105, borderWidth: 2, borderColor: product?.id === p.id ? t.colors.green : 'transparent', padding: 4, borderRadius: 10 }}><Image source={mediaUrl(p.image_url)} contentFit="cover" style={{ width: '100%', height: 115, borderRadius: 6, backgroundColor: t.colors.sand }} /><Text numberOfLines={2} style={[s.muted, { fontSize: 10, marginTop: 7 }]}>{p.name}</Text></Pressable>)}</ScrollView>
        {product && <><Text style={s.label}>Màu · {color}</Text><View style={[s.row, { flexWrap: 'wrap', marginBottom: 16 }]}>{product.colors.map(c => <Button key={c.name} variant={c.name === color ? 'primary' : 'outline'} disabled={locked} onPress={() => { setColor(c.name); setJob(null); }}>{c.name}</Button>)}</View>
          <Text style={s.label}>Size đưa vào ảnh AI · {size}</Text><View style={[s.row, { flexWrap: 'wrap' }]}>{product.sizes.map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Thử size ${value}`} accessibilityState={{ selected: value === size }} disabled={locked} onPress={() => { setSize(value); setJob(null); }} style={{ minWidth: 50, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: size === value ? t.colors.green : t.colors.line, borderRadius: 7, backgroundColor: size === value ? t.colors.greenLight : 'transparent' }}><Text style={s.text}>{value}</Text></Pressable>)}</View>
          {!stock && <Text style={[s.muted, { color: t.colors.error, marginTop: 10 }]}>Màu/size này đã hết hàng.</Text>}
          <SizingAdvice product={product} color={color} size={size} disabled={locked} onSelect={value => { setSize(value); setJob(null); }} />
        </>}
        <Text style={s.kicker}>02 / TẠO BỘ ẢNH BỐN GÓC</Text><Text style={[s.muted, { marginVertical: 14 }]}>Tạo 4 ảnh riêng: trước, trái, sau, phải. Dùng mũi tên để chuyển ảnh. Mỗi lượt đầy đủ gọi tạo ảnh 4 lần, kèm kiểm tra ảnh đầu vào và sự nhất quán giữa các góc; thời gian và phí tùy dịch vụ.</Text>
        <Text style={[s.muted, { marginBottom: 16 }]}>Ảnh người, ảnh sản phẩm, size và số đo của bạn sẽ được gửi đến Gemini để tạo ảnh. Chỉ dùng ảnh bạn có quyền sử dụng.</Text>
        {!readyProfile && user && <Text style={[s.muted, { marginBottom: 16, color: t.colors.error }]}>Cần hoàn thiện hồ sơ với các vòng đo phù hợp loại trang phục trước khi tạo ảnh.</Text>}
        <ErrorMessage message={error || (job?.error ?? null)} />
        {!health?.ai_ready && <Text style={[s.muted, { marginBottom: 14 }]}>Phòng thử AI chưa được shop kích hoạt.</Text>}
        <Button icon="sparkles-outline" onPress={() => void generate()} disabled={!!user && (!photo || !product || locked || !health?.ai_ready || !check?.accepted || !readyProfile || !stock)} loading={busy}>{!user ? 'Đăng nhập để thử đồ' : running ? 'Đang tạo bộ ảnh bốn góc' : 'Tạo 4 ảnh thử đồ của tôi'}</Button>
        <Text style={[s.muted, { marginTop: 16, fontSize: 11, lineHeight: 18 }]}>Đây là hình dung bằng AI, không phải phép đo hay mô phỏng vật lý. Chi tiết mặt sau, độ rủ và độ vừa có thể khác khi mặc thật. Chất vải phóng to trong ảnh không chứng minh đúng sớ vải.</Text>
      </View>
    </View>
    <SectionHeading title="Những lần ướm thử" caption="YOUR FITTING DIARY" />
    {history.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{history.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Xem lần thử ${item.product_name || ''}`} disabled={locked} onPress={() => { setJob(item); setSelectedId(item.product_id); setColor(item.color); setSize(item.size || 'M'); setPhoto(null); setCheck(null); }} style={{ width: wide ? 170 : '47%', marginBottom: 12 }}><Image source={mediaUrl(item.result_url || item.photo_url)} contentFit="cover" style={{ width: '100%', aspectRatio: 0.8, backgroundColor: t.colors.sand, borderRadius: 10 }} /><Text style={[s.text, { fontSize: 12, marginTop: 8 }]}>{item.product_name}</Text><Text style={[s.muted, { fontSize: 10 }]}>Size {item.size || '—'} · {item.views.filter(v => v.status === 'completed').length}/4 góc · {dateLabel(item.created_at)}</Text></Pressable>)}</View> : <Text style={s.muted}>{user ? 'Những ảnh thử đầu tiên của bạn sẽ xuất hiện ở đây.' : 'Đăng nhập để có nhật ký thử đồ riêng.'}</Text>}
  </Screen>;
}
