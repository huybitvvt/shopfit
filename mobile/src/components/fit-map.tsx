import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { theme as t } from '../theme';
import type { RegionStatus, SizeCheck } from '../types';
import { s } from './ui';

const STATUS_CONFIG: Record<
  RegionStatus,
  { label: string; shortLabel: string; color: string; bg: string; border: string; icon: string }
> = {
  target: {
    label: 'Chuẩn phom đẹp',
    shortLabel: 'Vừa in',
    color: '#047857',
    bg: '#D1FAE5',
    border: '#10B981',
    icon: 'checkmark-circle',
  },
  above_target: {
    label: 'Thoải mái (Relaxed)',
    shortLabel: 'Dư nhẹ',
    color: '#B45309',
    bg: '#FEF3C7',
    border: '#F59E0B',
    icon: 'expand-outline',
  },
  below_target: {
    label: 'Ôm sát (Slim)',
    shortLabel: 'Hơi ôm',
    color: '#B91C1C',
    bg: '#FEE2E2',
    border: '#EF4444',
    icon: 'alert-circle-outline',
  },
};

const REGIONS = [
  { key: 'chest_cm', label: 'Ngực', top: 70, width: 84 },
  { key: 'waist_cm', label: 'Eo', top: 110, width: 68 },
  { key: 'hip_cm', label: 'Mông', top: 144, width: 84 },
];

const FIT_GAUGE_STEPS = [
  { label: 'Chật', color: '#EF4444' },
  { label: 'Ôm sát', color: '#F97316' },
  { label: 'CHUẨN ĐẸP', color: '#10B981' },
  { label: 'Thoải mái', color: '#3B82F6' },
  { label: 'Rộng', color: '#8B5CF6' },
];

export function FitMap({ checks, size }: { checks: SizeCheck[]; size: string }) {
  const [focused, setFocused] = useState(checks[0]?.key || 'chest_cm');
  const selected = checks.find(c => c.key === focused);

  // Compute Overall Fit Score and Gauge Position (0 to 4)
  const { fitStepIndex, fitTitle, fitBadgeColor, fitBadgeBg, stylistQuote } = useMemo(() => {
    if (!checks.length) {
      return {
        fitStepIndex: 2,
        fitTitle: 'Chưa đủ dữ liệu',
        fitBadgeColor: t.colors.muted,
        fitBadgeBg: '#F3F4F6',
        stylistQuote: 'Hãy bổ sung hồ sơ vóc dáng để AI tính toán mức độ vừa vặn chính xác.',
      };
    }

    const belowCount = checks.filter(c => c.region === 'below_target').length;
    const aboveCount = checks.filter(c => c.region === 'above_target').length;
    const targetCount = checks.filter(c => c.region === 'target').length;

    let step = 2; // Default: Chuẩn phom
    let title = 'Chuẩn phom đẹp (96%)';
    let badgeColor = '#047857';
    let badgeBg = '#D1FAE5';
    let quote = '';

    if (belowCount > 0) {
      if (belowCount >= 2) {
        step = 0;
        title = 'Khá chật / Bó sát';
        badgeColor = '#B91C1C';
        badgeBg = '#FEE2E2';
      } else {
        step = 1;
        title = 'Ôm sát dáng (Slim Fit)';
        badgeColor = '#C2410C';
        badgeBg = '#FFEDD5';
      }
      const names = checks.filter(c => c.region === 'below_target').map(c => c.label.toLowerCase()).join(' và ');
      quote = `Size ${size} có phần ${names} ôm sát hơn mức khuyến nghị. Nếu bạn chuộng sự cử động thoải mái thì nên tăng lên 1 size.`;
    } else if (aboveCount === checks.length) {
      const maxEase = Math.max(...checks.map(c => c.ease_cm - c.target_cm));
      if (maxEase > 8) {
        step = 4;
        title = 'Rộng thụng (Oversized)';
        badgeColor = '#6D28D9';
        badgeBg = '#EDE9FE';
      } else {
        step = 3;
        title = 'Thoải mái (Relaxed Fit)';
        badgeColor = '#1D4ED8';
        badgeBg = '#DBEAFE';
      }
      quote = `Size ${size} mang phong cách Relaxed rộng rãi, giấu dáng rất tốt. Nếu bạn muốn mặc vừa in tôn đường cong, hãy thử giảm 1 size.`;
    } else {
      step = 2;
      title = targetCount === checks.length ? 'Vừa vặn hoàn hảo (100%)' : 'Chuẩn phom tôn dáng (95%)';
      badgeColor = '#047857';
      badgeBg = '#D1FAE5';
      quote = `Size ${size} là kích cỡ lý tưởng nhất cho bạn! Thiết kế vừa in với vòng ngực và eo, buông rủ tự nhiên tạo cảm giác thanh lịch và tôn dáng.`;
    }

    return {
      fitStepIndex: step,
      fitTitle: title,
      fitBadgeColor: badgeColor,
      fitBadgeBg: badgeBg,
      stylistQuote: quote,
    };
  }, [checks, size]);

  return (
    <View testID="fit-map" style={{ gap: 14 }}>
      {/* 1. HEADER & OVERALL FIT GAUGE */}
      <View
        style={{
          backgroundColor: '#FAF8F5',
          borderWidth: 1,
          borderColor: '#EAE5DB',
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <View style={[s.between, { alignItems: 'center' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="speedometer-outline" size={17} color={t.colors.green} />
            <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.ink }}>
              Độ vừa vặn · Size {size}
            </Text>
          </View>
          <View style={{ backgroundColor: fitBadgeBg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 }}>
            <Text style={{ fontFamily: t.fonts.bold, fontSize: 11, color: fitBadgeColor }}>
              {fitTitle}
            </Text>
          </View>
        </View>

        {/* 5-Step Segmented Gauge */}
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 4, height: 8 }}>
            {FIT_GAUGE_STEPS.map((st, idx) => {
              const isActive = fitStepIndex === idx;
              return (
                <View
                  key={st.label}
                  style={{
                    flex: 1,
                    backgroundColor: isActive ? st.color : '#E5E7EB',
                    borderRadius: 4,
                    height: isActive ? 8 : 6,
                    alignSelf: 'center',
                  }}
                />
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
            {FIT_GAUGE_STEPS.map((st, idx) => (
              <Text
                key={st.label}
                style={{
                  fontSize: 9,
                  fontFamily: fitStepIndex === idx ? t.fonts.bold : t.fonts.regular,
                  color: fitStepIndex === idx ? st.color : t.colors.muted,
                  textAlign: 'center',
                  flex: 1,
                }}
              >
                {st.label}
              </Text>
            ))}
          </View>
        </View>
      </View>

      {/* 2. FASHION ATELIER MANNEQUIN SILHOUETTE & HEATMAP */}
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        {/* Sculpted Mannequin Body */}
        <View
          accessible={false}
          style={{
            width: 120,
            height: 250,
            alignItems: 'center',
            backgroundColor: '#FAF9F6',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#EAE6DD',
            paddingTop: 10,
          }}
        >
          {/* Head */}
          <View style={{ width: 30, height: 38, borderRadius: 15, backgroundColor: '#D4D9D2' }} />
          {/* Neck */}
          <View style={{ width: 12, height: 12, backgroundColor: '#D4D9D2', marginTop: -2 }} />
          {/* Shoulders & Upper Bust */}
          <View
            style={{
              width: 88,
              height: 44,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              backgroundColor: '#DFE4DE',
            }}
          />
          {/* Waist Curve */}
          <View style={{ width: 66, height: 36, borderRadius: 6, backgroundColor: '#DFE4DE' }} />
          {/* Hips Curve */}
          <View
            style={{
              width: 84,
              height: 42,
              borderBottomLeftRadius: 20,
              borderBottomRightRadius: 20,
              backgroundColor: '#DFE4DE',
            }}
          />
          {/* Legs */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <View style={{ width: 16, height: 62, borderRadius: 8, backgroundColor: '#D4D9D2' }} />
            <View style={{ width: 16, height: 62, borderRadius: 8, backgroundColor: '#D4D9D2' }} />
          </View>
          {/* Atelier Stand Base */}
          <View style={{ width: 50, height: 3, borderRadius: 2, backgroundColor: '#CBD1C9', marginTop: 2 }} />

          {/* Heatmap Interactive Bands */}
          {REGIONS.map(reg => {
            const check = checks.find(c => c.key === reg.key);
            const cfg = check ? STATUS_CONFIG[check.region] : null;
            const isFocused = focused === reg.key;

            return (
              <Pressable
                key={reg.key}
                onPress={() => setFocused(reg.key)}
                style={{
                  position: 'absolute',
                  top: reg.top,
                  width: reg.width,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: cfg?.bg || '#E5E7EB',
                  borderWidth: isFocused ? 2.5 : 1,
                  borderColor: isFocused ? (cfg?.border || t.colors.ink) : (cfg?.border || '#D1D5DB'),
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: isFocused ? cfg?.border : 'transparent',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isFocused ? 0.35 : 0,
                  shadowRadius: 4,
                  elevation: isFocused ? 4 : 0,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontFamily: isFocused ? t.fonts.bold : t.fonts.medium,
                      color: cfg?.color || t.colors.muted,
                    }}
                  >
                    {reg.label}
                  </Text>
                  {isFocused && (
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: cfg?.color || t.colors.ink }} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* 3. INTERACTIVE REGION CARDS */}
        <View style={{ flex: 1, gap: 8 }}>
          {REGIONS.map(reg => {
            const check = checks.find(c => c.key === reg.key);
            const cfg = check ? STATUS_CONFIG[check.region] : null;
            const isFocused = focused === reg.key;

            return (
              <Pressable
                key={reg.key}
                onPress={() => setFocused(reg.key)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  borderWidth: isFocused ? 2 : 1,
                  borderColor: isFocused ? (cfg?.border || t.colors.green) : '#E5E1D8',
                  backgroundColor: isFocused ? (cfg?.bg || '#F9F8F5') : 'white',
                  gap: 3,
                }}
              >
                <View style={[s.between, { alignItems: 'center' }]}>
                  <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.ink }}>
                    {reg.label}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: cfg?.bg || '#F3F4F6',
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 4,
                    }}
                  >
                    <Ionicons name={(cfg?.icon || 'help-circle-outline') as any} size={11} color={cfg?.color || t.colors.muted} />
                    <Text style={{ fontSize: 10, fontFamily: t.fonts.bold, color: cfg?.color || t.colors.muted }}>
                      {cfg?.shortLabel || 'Chưa đo'}
                    </Text>
                  </View>
                </View>

                {check ? (
                  <Text style={[s.muted, { fontSize: 11 }]}>
                    Cơ thể: <Text style={{ color: t.colors.ink, fontFamily: t.fonts.medium }}>{check.body_cm}cm</Text> ➔ Áo: <Text style={{ color: t.colors.ink, fontFamily: t.fonts.bold }}>{check.garment_cm}cm</Text> (Dư {check.ease_cm}cm)
                  </Text>
                ) : (
                  <Text style={[s.muted, { fontSize: 11 }]}>Chưa có số đo để đối chiếu vùng này</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 4. AI STYLIST INSIGHT BOX */}
      <View
        style={{
          backgroundColor: '#F3F8F5',
          borderWidth: 1,
          borderColor: '#D4E8DC',
          borderRadius: 12,
          padding: 13,
          gap: 6,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ backgroundColor: '#D1FAE5', padding: 5, borderRadius: 6 }}>
            <Ionicons name="sparkles" size={13} color={t.colors.green} />
          </View>
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 12, color: t.colors.green }}>
            Lời khuyên từ AI Stylist ShopFit
          </Text>
        </View>
        <Text style={{ fontFamily: t.fonts.regular, fontSize: 12, lineHeight: 18, color: t.colors.ink }}>
          {stylistQuote}
        </Text>
      </View>

      {/* 5. FOCUSED DETAIL INSPECTOR */}
      {selected && (
        <View style={{ backgroundColor: '#FAF8F5', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#EDE8DF', gap: 4 }}>
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 12, color: t.colors.ink }}>
            Chi tiết vùng {selected.label}:
          </Text>
          <Text style={[s.muted, { fontSize: 11, lineHeight: 17 }]}>
            Vòng {selected.label.toLowerCase()} cơ thể bạn là {selected.body_cm} cm, số đo trang phục là {selected.garment_cm} cm (độ cử động dư {selected.ease_cm} cm so với mục tiêu tối thiểu {selected.target_cm} cm).
            {selected.region === 'above_target'
              ? ' Vải có độ buông rộng tự nhiên, cử động thoải mái không gò bó.'
              : selected.region === 'below_target'
              ? ' Độ dư vải sát cơ thể, tạo cảm giác ôm sát đường cong.'
              : ' Đạt chuẩn tỷ lệ phom dáng nhà may khuyến nghị.'}
          </Text>
        </View>
      )}
    </View>
  );
}
