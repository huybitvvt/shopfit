import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { mediaUrl, photoForm, request } from '../../api';
import { FourView } from '../../components/four-view';
import { SizingAdvice } from '../../components/sizing';
import { TopUpModal } from '../../components/top-up-modal';
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
  const { products, user, health, notify, quota, refreshQuota } = useStore();
  const scrollRef = useRef<ScrollView>(null);
  const submitting = useRef(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showSizingAdvice, setShowSizingAdvice] = useState(false);
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
    setError(null);
    setJob(current => current ? list.find(v => v.id === current.id) || current : list.find(v => v.status === 'queued' || v.status === 'processing') || null);
  }, [user]);
  useFocusEffect(useCallback(() => {
    let active = true;
    setError(null);
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
        if (!['queued', 'processing'].includes(next.status)) { await loadHistory(); notify(next.status === 'completed' ? 'Đã có ảnh thử đồ của bạn.' : 'Đã lưu ảnh tạo được.'); }
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
    if (quota && quota.total_available <= 0) { setShowTopUp(true); return; }
    if (!photo || !product || !check?.accepted || locked || submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(null);
    try {
      const form = await photoForm(photo, 'photo'); form.append('product_id', product.id); form.append('color', color); form.append('size', size);
      const scope = `tryon:${user.id}`;
      const key = await pendingRequestKey(scope, JSON.stringify([photo.uri, product.id, color, size]));
      setJob(await request<TryOn>('/api/tryons', { method: 'POST', body: form, headers: { 'X-Idempotency-Key': key } }, 60000));
      await finishRequestKey(scope);
      void refreshQuota();
      await loadHistory();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      if (msg.includes('lượt thử') || msg.includes('hạn mức')) {
        setShowTopUp(true);
      }
    } finally { setBusy(false); submitting.current = false; }
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
    <View style={{
      backgroundColor: '#F3F6F4',
      borderWidth: 1,
      borderColor: '#D4DDD7',
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="sparkles" size={16} color={t.colors.green} />
        <Text style={{ fontSize: 13, fontFamily: t.fonts.medium, color: t.colors.ink }}>
          {user ? `${quota?.vip_name || 'Hạng Đồng'} · Còn ${quota?.total_available ?? 3} lượt thử` : 'Đăng ký nhận ngay 3 lượt thử miễn phí'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {user && quota?.next_tier_name ? (
          <Text style={{ fontSize: 11, color: t.colors.muted }}>
            Mua sắm để lên {quota.next_tier_name}
          </Text>
        ) : null}
        {user ? (
          <Pressable
            onPress={() => setShowTopUp(true)}
            style={{
              backgroundColor: t.colors.green,
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 11, fontFamily: t.fonts.bold }}>Nạp thêm</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tùy chọn tư vấn chọn size & đối chiếu số đo"
            onPress={() => setShowSizingAdvice(v => !v)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#FAF9F6',
              borderWidth: 1,
              borderColor: '#E8E4DC',
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginTop: 14,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Ionicons name="body-outline" size={17} color={t.colors.green} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: t.fonts.medium, fontSize: 13, color: t.colors.ink }}>
                  Tư vấn chọn size & đối chiếu số đo (Tùy chọn)
                </Text>
                <Text style={[s.muted, { fontSize: 10, marginTop: 1 }]}>
                  {showSizingAdvice ? 'Nhấn để thu gọn đối chiếu' : 'Đối chiếu với số đo cơ thể hoặc đồ đang mặc'}
                </Text>
              </View>
            </View>
            <Ionicons name={showSizingAdvice ? 'chevron-up' : 'chevron-down'} size={18} color={t.colors.muted} />
          </Pressable>
          {showSizingAdvice && (
            <SizingAdvice product={product} color={color} size={size} disabled={locked} onSelect={value => { setSize(value); setJob(null); }} />
          )}
        </>}
        <Text style={[s.kicker, { marginTop: 16 }]}>02 / TẠO BỘ ẢNH BỐN GÓC</Text>
        <Text style={[s.muted, { marginVertical: 12 }]}>Tạo 4 ảnh riêng: trước, trái, sau, phải. Dùng mũi tên để chuyển ảnh. Mỗi lượt đầy đủ gọi tạo ảnh 4 lần, kèm kiểm tra ảnh đầu vào và sự nhất quán giữa các góc.</Text>
        {!readyProfile && user && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: '#F7F6F2',
            padding: 10,
            borderRadius: 8,
            marginBottom: 14,
            borderWidth: 1,
            borderColor: '#EAE6DD',
          }}>
            <Ionicons name="information-circle-outline" size={18} color={t.colors.muted} />
            <Text style={[s.muted, { fontSize: 11, flex: 1, lineHeight: 16 }]}>
              Chưa lưu số đo? ShopFit sẽ áp dụng vóc dáng chuẩn size {size}. Bạn có thể tùy chỉnh trong{' '}
              <Text onPress={() => router.push('/body-profile')} style={{ color: t.colors.green, fontFamily: t.fonts.medium }}>
                Hồ sơ cơ thể
              </Text>.
            </Text>
          </View>
        )}
        <ErrorMessage message={error || (job?.error ?? null)} />
        {!health?.ai_ready && <Text style={[s.muted, { marginBottom: 14 }]}>Phòng thử AI chưa được shop kích hoạt.</Text>}
        <Button
          icon="sparkles-outline"
          onPress={() => void generate()}
          disabled={!!user && (!photo || !product || locked || !health?.ai_ready || !check?.accepted || !stock)}
          loading={busy}
        >
          {!user ? 'Đăng nhập để thử đồ' : running ? 'Đang tạo bộ ảnh bốn góc' : 'Tạo 4 ảnh thử đồ của tôi'}
        </Button>

        {/* Prominent AI Disclaimer Card for Store Compliance & User Trust */}
        <View style={{
          marginTop: 18,
          backgroundColor: '#F3F6F4',
          borderWidth: 1,
          borderColor: '#D4DDD7',
          borderRadius: 12,
          padding: 14,
          gap: 8,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="sparkles" size={17} color={t.colors.green} />
            <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.ink }}>
              Khuyến cáo về hình ảnh mô phỏng AI
            </Text>
          </View>
          <View style={{ gap: 5 }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
              <Text style={{ color: t.colors.green, fontSize: 14, lineHeight: 18 }}>•</Text>
              <Text style={{ flex: 1, fontSize: 12, color: '#3A4841', lineHeight: 18 }}>
                Hình ảnh 4 góc là kết quả mô phỏng do <Text style={{ fontFamily: t.fonts.bold }}>AI tạo sinh</Text> nhằm hỗ trợ hình dung phong cách và phom dáng.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
              <Text style={{ color: t.colors.green, fontSize: 14, lineHeight: 18 }}>•</Text>
              <Text style={{ flex: 1, fontSize: 12, color: '#3A4841', lineHeight: 18 }}>
                Vui lòng đối chiếu với <Text style={{ fontFamily: t.fonts.bold }}>Bảng số đo thành phẩm thực tế</Text> của sản phẩm trước khi quyết định chọn size.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
              <Text style={{ color: t.colors.green, fontSize: 14, lineHeight: 18 }}>•</Text>
              <Text style={{ flex: 1, fontSize: 12, color: '#3A4841', lineHeight: 18 }}>
                Bạn có thể báo cáo khiếu nại nếu ảnh AI tạo ra có sai lệch hoặc nội dung không phù hợp ngay tại màn hình kết quả thử đồ.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
    <SectionHeading title="Những lần ướm thử" caption="YOUR FITTING DIARY" />
    {history.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{history.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Xem lần thử ${item.product_name || ''}`} disabled={locked} onPress={() => { setError(null); setJob(item); setSelectedId(item.product_id); setColor(item.color); setSize(item.size || 'M'); setPhoto(null); setCheck(null); }} style={{ width: wide ? 170 : '47%', marginBottom: 12 }}><Image source={mediaUrl(item.result_url || item.photo_url)} contentFit="cover" style={{ width: '100%', aspectRatio: 0.8, backgroundColor: t.colors.sand, borderRadius: 10 }} /><Text style={[s.text, { fontSize: 12, marginTop: 8 }]}>{item.product_name}</Text><Text style={[s.muted, { fontSize: 10 }]}>Size {item.size || '—'} · {item.views.filter(v => v.status === 'completed').length}/4 góc · {dateLabel(item.created_at)}</Text></Pressable>)}</View> : <Text style={s.muted}>{user ? 'Những ảnh thử đầu tiên của bạn sẽ xuất hiện ở đây.' : 'Đăng nhập để có nhật ký thử đồ riêng.'}</Text>}
    <TopUpModal visible={showTopUp} onClose={() => setShowTopUp(false)} />
  </Screen>;
}
