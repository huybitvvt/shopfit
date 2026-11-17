import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, Share, Text, TextInput, View } from 'react-native';
import { mediaUrl, request } from '../api';
import { useStore } from '../store';
import { theme as t } from '../theme';
import type { Angle, TryOn } from '../types';
import { Button, IconButton, ToastOverlay, s } from './ui';

export const angles: Angle[] = ['front', 'left', 'back', 'right'];
export const angleLabels: Record<Angle, string> = { front: 'Trước', left: 'Trái', back: 'Sau', right: 'Phải' };

const REPORT_REASONS = [
  'Hình ảnh phản cảm, nhạy cảm hoặc không phù hợp',
  'Lỗi biến dạng cơ thể hoặc trang phục sai lệch nghiêm trọng',
  'Vi phạm bản quyền hoặc quyền riêng tư',
  'Lý do khác',
];

export function FourView({ job }: { job: TryOn }) {
  const { notify } = useStore();
  const [index, setIndex] = useState(0);
  const [original, setOriginal] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeViews = job.views.filter(v => v.status !== 'unavailable');
  const availableAngles = activeViews.length > 0 ? activeViews.map(v => v.angle) : ['front' as Angle];
  const isMulti = availableAngles.length > 1;
  const safeIndex = index < availableAngles.length ? index : 0;
  const angle = availableAngles[safeIndex];
  const view = job.views.find(v => v.angle === angle);
  const url = original ? job.photo_url : view?.url;
  const count = job.views.filter(v => v.status === 'completed').length;

  function select(next: number) {
    setIndex((next + availableAngles.length) % availableAngles.length);
    setOriginal(false);
  }

  async function handleSendReport() {
    setSubmitting(true);
    try {
      const res = await request<{ message: string }>(`/api/tryons/${job.id}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: selectedReason, details }),
      });
      setReporting(false);
      setDetails('');
      notify(res.message || 'Cảm ơn bạn đã phản hồi. Chúng tôi sẽ kiểm duyệt nội dung trong 24 giờ.');
    } catch (e) {
      notify((e as Error).message || 'Không thể gửi báo cáo lúc này.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      {isMulti ? (
        <View style={[s.between, { gap: 4 }]}>
          <IconButton name="chevron-back" label="Góc trước đó" onPress={() => select(safeIndex - 1)} />
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text accessibilityLiveRegion="polite" testID="view-angle" style={[s.text, { fontFamily: t.fonts.bold }]}>
              {original ? 'Ảnh gốc' : `Góc ${angleLabels[angle].toLowerCase()}`}
            </Text>
            <Text style={[s.muted, { fontSize: 11 }]}>
              {safeIndex + 1} / {availableAngles.length} · {count} ảnh đã có
            </Text>
          </View>
          <IconButton name="chevron-forward" label="Góc tiếp theo" onPress={() => select(safeIndex + 1)} />
        </View>
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: 4 }}>
          <Text accessibilityLiveRegion="polite" testID="view-angle" style={[s.text, { fontFamily: t.fonts.bold }]}>
            {original ? 'Ảnh gốc' : 'Ảnh thử đồ của bạn'}
          </Text>
          <Text style={[s.muted, { fontSize: 11, marginTop: 2 }]}>
            {original ? 'Ảnh toàn thân trước khi thử đồ' : 'Mặt trước · Hoàn tất'}
          </Text>
        </View>
      )}

      <View style={{ width: '100%', aspectRatio: 3 / 4, backgroundColor: t.colors.sand, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {url ? (
          <Image
            source={mediaUrl(url)}
            contentFit="contain"
            accessibilityLabel={original ? 'Ảnh gốc trước khi thử đồ' : isMulti ? `Ảnh thử đồ góc ${angleLabels[angle].toLowerCase()}` : 'Ảnh thử đồ của bạn'}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
            {['processing', 'pending', 'validating'].includes(view?.status || '') && <ActivityIndicator color={t.colors.green} />}
            <Text style={[s.muted, { textAlign: 'center' }]}>
              {view?.status === 'failed' ? view.error : view?.status === 'unavailable' ? 'Lượt thử cũ chưa có góc này.' : view?.status === 'validating' ? 'Đã tạo ảnh, đang kiểm tra trang phục…' : isMulti ? `Đang chờ ảnh góc ${angleLabels[angle].toLowerCase()}…` : 'Đang xử lý ảnh thử đồ…'}
            </Text>
          </View>
        )}
      </View>

      {/* AI Generative Content Policy Disclaimer */}
      <View style={{
        backgroundColor: '#F3F6F4',
        borderColor: '#D4DDD7',
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}>
        <Ionicons name="sparkles" size={18} color={t.colors.green} />
        <Text style={{ fontSize: 12, color: '#3A4841', flex: 1, lineHeight: 17, fontFamily: t.fonts.regular }}>
          Hình ảnh được mô phỏng bởi AI để hỗ trợ hình dung phong cách. Vui lòng kiểm tra bảng số đo thực tế trước khi chọn size.
        </Text>
      </View>

      {isMulti && (
        <View style={[s.row, { gap: 6 }]}>
          {availableAngles.map((a, i) => (
            <Pressable
              key={a}
              accessibilityRole="button"
              accessibilityLabel={`Xem góc ${angleLabels[a].toLowerCase()}`}
              accessibilityState={{ selected: i === safeIndex }}
              onPress={() => select(i)}
              style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: i === safeIndex ? t.colors.green : t.colors.greenLight }}
            >
              <Text style={{ fontFamily: t.fonts.medium, color: i === safeIndex ? 'white' : t.colors.green, fontSize: 12 }}>{angleLabels[a]}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Action Row: Compare, Download/Share & Report Button */}
      {view?.url && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Button variant="outline" style={{ flex: 1 }} onPress={() => setOriginal(v => !v)}>
            {original ? 'Xem ảnh sau khi thử' : 'So sánh với ảnh gốc'}
          </Button>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tải hoặc chia sẻ ảnh thử đồ"
            onPress={() => {
              const fullUrl = mediaUrl(view.url);
              if (Platform.OS === 'web') {
                void Linking.openURL(fullUrl);
              } else {
                void Share.share({ message: `Ảnh thử đồ AI trên ShopFit Studio: ${fullUrl}`, url: fullUrl });
              }
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 14,
              minHeight: 52,
              borderRadius: 9,
              borderWidth: 1,
              borderColor: '#E2DDD6',
              backgroundColor: pressed ? '#F5F2EC' : 'transparent',
            })}
          >
            <Ionicons name="download-outline" size={18} color={t.colors.green} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Báo cáo ảnh AI này"
            onPress={() => setReporting(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingHorizontal: 14,
              minHeight: 52,
              borderRadius: 9,
              borderWidth: 1,
              borderColor: '#E2DDD6',
              backgroundColor: pressed ? '#F5F2EC' : 'transparent',
            })}
          >
            <Ionicons name="flag-outline" size={16} color="#7D8A83" />
            <Text style={{ fontSize: 12, color: '#5A6660', fontFamily: t.fonts.medium }}>Báo cáo</Text>
          </Pressable>
        </View>
      )}

      <Text style={[s.muted, { fontSize: 11, lineHeight: 18 }]}>
        {isMulti ? 'Trái/phải theo phía cơ thể người mặc. Góc khuất là AI suy diễn; ảnh mặt sau sản phẩm do shop cung cấp sẽ giúp giữ đúng chi tiết.' : 'Ảnh được tạo bằng AI dựa trên vóc dáng và số đo của bạn. Dùng nút so sánh để đối chiếu với ảnh gốc.'}
      </Text>

      {/* Report Modal */}
      <Modal visible={reporting} transparent animationType="fade" onRequestClose={() => setReporting(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ width: '100%', maxWidth: 440, backgroundColor: 'white', borderRadius: 16, padding: 24, gap: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 }}>
              <View style={[s.between]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="flag" size={20} color="#D9383A" />
                  <Text style={{ fontSize: 16, fontFamily: t.fonts.bold, color: t.colors.ink }}>Báo cáo nội dung AI</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Đóng báo cáo" onPress={() => setReporting(false)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={t.colors.muted} />
                </Pressable>
              </View>

              <Text style={[s.muted, { fontSize: 13, lineHeight: 19 }]}>
                Apple & ShopFit cam kết loại bỏ nội dung không phù hợp. Vui lòng chọn lý do khiếu nại:
              </Text>

              <View style={{ gap: 8 }}>
                {REPORT_REASONS.map(reason => {
                  const active = selectedReason === reason;
                  return (
                    <Pressable
                      key={reason}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setSelectedReason(reason)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        padding: 12,
                        borderRadius: 8,
                        backgroundColor: active ? t.colors.greenLight : '#F8F6F2',
                        borderWidth: 1,
                        borderColor: active ? t.colors.green : '#ECE6DC',
                      }}
                    >
                      <Ionicons
                        name={active ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={active ? t.colors.green : t.colors.muted}
                      />
                      <Text style={{ flex: 1, fontSize: 13, color: active ? t.colors.green : t.colors.ink, fontFamily: active ? t.fonts.medium : t.fonts.regular }}>
                        {reason}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                placeholder="Mô tả thêm chi tiết (tùy chọn)..."
                placeholderTextColor={t.colors.muted}
                value={details}
                onChangeText={setDetails}
                maxLength={500}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: t.colors.line,
                  borderRadius: 8,
                  padding: 12,
                  minHeight: 70,
                  textAlignVertical: 'top',
                  fontSize: 13,
                  color: t.colors.ink,
                }}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button variant="outline" style={{ flex: 1 }} onPress={() => setReporting(false)}>
                  Hủy
                </Button>
                <Button style={{ flex: 1 }} loading={submitting} onPress={() => void handleSendReport()}>
                  Gửi báo cáo
                </Button>
              </View>
            </View>
            <ToastOverlay />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
