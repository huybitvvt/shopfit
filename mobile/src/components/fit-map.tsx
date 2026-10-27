import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { theme as t } from '../theme';
import type { RegionStatus, SizeCheck } from '../types';
import { s } from './ui';

const statuses: Record<RegionStatus, { label: string; color: string; background: string }> = {
  below_target: { label: 'Thiếu độ dư', color: '#8D322C', background: '#F8DEDA' },
  target: { label: 'Đạt mục tiêu', color: '#2D503A', background: '#DCEADD' },
  above_target: { label: 'Dư nhiều hơn', color: '#755412', background: '#F3E7C6' },
};
const regions = [{ key: 'chest_cm', label: 'Ngực', y: 86 }, { key: 'waist_cm', label: 'Eo', y: 128 }, { key: 'hip_cm', label: 'Mông', y: 170 }];

export function FitMap({ checks, size }: { checks: SizeCheck[]; size: string }) {
  const [focused, setFocused] = useState(checks[0]?.key || 'chest_cm');
  const selected = checks.find(c => c.key === focused);
  return <View testID="fit-map" style={{ gap: 12 }}>
    <Text style={[s.text, { fontFamily: t.fonts.bold }]}>Bản đồ độ vừa · Size {size}</Text>
    <Text style={[s.muted, { fontSize: 12 }]}>Chạm một vùng để xem lý do. Màu biểu thị chênh lệch số đo với độ dư mục tiêu.</Text>
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: 114, height: 282, alignItems: 'center' }}>
        <View style={{ position: 'absolute', top: 4, width: 37, height: 43, borderRadius: 22, backgroundColor: t.colors.line }} />
        <View style={{ position: 'absolute', top: 54, width: 76, height: 145, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, backgroundColor: '#E4E6DF' }} />
        {[8, 92].map(left => <View key={left} style={{ position: 'absolute', top: 65, left, width: 14, height: 112, borderRadius: 8, backgroundColor: t.colors.line }} />)}
        {[26, 63].map(left => <View key={left} style={{ position: 'absolute', top: 187, left, width: 25, height: 90, borderRadius: 13, backgroundColor: t.colors.line }} />)}
        {regions.map(region => { const check = checks.find(c => c.key === region.key); const status = check ? statuses[check.region] : null; return <View key={region.key} style={{ position: 'absolute', top: region.y, width: region.key === 'waist_cm' ? 61 : 76, height: 22, backgroundColor: status?.background || '#D4D7D0', borderWidth: region.key === focused ? 2 : 1, borderColor: status?.color || t.colors.muted, borderRadius: 9 }} />; })}
      </View>
      <View style={{ flex: 1, gap: 10 }}>{regions.map(region => {
        const check = checks.find(c => c.key === region.key), status = check ? statuses[check.region] : null;
        return <Pressable key={region.key} accessibilityRole="button" accessibilityLabel={`Vùng ${region.label.toLowerCase()}: ${status?.label || 'chưa đối chiếu'}`} accessibilityState={{ selected: focused === region.key }} onPress={() => setFocused(region.key)} style={{ minHeight: 66, padding: 10, borderRadius: 10, borderWidth: focused === region.key ? 2 : 1, borderColor: status?.color || t.colors.line, backgroundColor: status?.background || t.colors.background }}><Text style={[s.text, { fontFamily: t.fonts.medium, color: status?.color || t.colors.muted }]}>{region.label}</Text><Text style={[s.muted, { fontSize: 11, color: status?.color || t.colors.muted }]}>{status?.label || 'Chưa đối chiếu'}</Text></Pressable>;
      })}</View>
    </View>
    <View style={{ padding: 12, backgroundColor: t.colors.background, borderRadius: 9, gap: 6 }}>
      {selected ? <><Text accessibilityLiveRegion="polite" style={s.text}>{selected.label}: cơ thể {selected.body_cm} / thành phẩm {selected.garment_cm} cm.</Text><Text style={s.muted}>Dư {selected.ease_cm} cm; mục tiêu ít nhất {selected.target_cm} cm.{selected.region === 'above_target' ? ' Vượt mục tiêu hơn 4 cm, có thể rộng hơn sở thích.' : selected.region === 'below_target' ? ' Chưa đạt độ dư mong muốn.' : ' Nằm từ mức mục tiêu đến dư thêm 4 cm.'}</Text></> : <Text style={s.muted}>Vùng này chưa có số đo cần đối chiếu cho loại trang phục/size đang chọn.</Text>}
    </View>
    <Text style={[s.muted, { fontSize: 11, lineHeight: 18 }]}>Sơ đồ minh họa, không phải cơ thể được quét hay mô phỏng áp lực vải.</Text>
  </View>;
}
