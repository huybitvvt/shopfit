import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { theme as t } from '../theme';
import type { SizeCheck } from '../types';
import { s } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type RegionBadge = {
  label: string;
  shortLabel: string;
  color: string;
  bg: string;
  border: string;
  icon: IconName;
};

function getRegionBadge(check: SizeCheck | undefined): RegionBadge | null {
  if (!check) return null;
  if (check.too_tight || check.ease_cm < 0) {
    return {
      label: 'Chật hơn cơ thể',
      shortLabel: 'Bị chật',
      color: '#B91C1C',
      bg: '#FEE2E2',
      border: '#EF4444',
      icon: 'close-circle',
    };
  }
  if (check.region === 'below_target') {
    return {
      label: 'Ôm sát (Slim)',
      shortLabel: 'Hơi ôm',
      color: '#C2410C',
      bg: '#FFEDD5',
      border: '#F97316',
      icon: 'alert-circle-outline',
    };
  }
  if (check.region === 'above_target') {
    return {
      label: 'Thoải mái (Relaxed)',
      shortLabel: 'Dư nhẹ',
      color: '#B45309',
      bg: '#FEF3C7',
      border: '#F59E0B',
      icon: 'expand-outline',
    };
  }
  return {
    label: 'Chuẩn phom đẹp',
    shortLabel: 'Vừa in',
    color: '#047857',
    bg: '#D1FAE5',
    border: '#10B981',
    icon: 'checkmark-circle',
  };
}

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

    const tightChecks = checks.filter(c => c.too_tight || c.ease_cm < 0);
    const belowChecks = checks.filter(c => c.region === 'below_target');
    const aboveCount = checks.filter(c => c.region === 'above_target').length;
    const targetCount = checks.filter(c => c.region === 'target').length;

    let step = 2;
    let title = 'Chuẩn phom đẹp (96%)';
    let badgeColor = '#047857';
    let badgeBg = '#D1FAE5';
    let quote = '';

    if (tightChecks.length > 0) {
      step = 0;
      title = 'Chật hơn số đo cơ thể';
      badgeColor = '#B91C1C';
      badgeBg = '#FEE2E2';
      const names = tightChecks.map(c => c.label.toLowerCase()).join(', ');
      quote = `Size ${size} có số đo ${names} nhỏ hơn vòng cơ thể của bạn, dễ gây kích chật hoặc khó cài/kéo khóa. Bạn nên tăng lên ít nhất 1 size.`;
    } else if (belowChecks.length > 0) {
      if (belowChecks.length >= 2) {
        step = 0;
        title = 'Khá bó sát';
        badgeColor = '#B91C1C';
        badgeBg = '#FEE2E2';
      } else {
        step = 1;
        title = 'Ôm sát dáng (Slim Fit)';
        badgeColor = '#C2410C';
        badgeBg = '#FFEDD5';
      }
      const names = belowChecks.map(c => c.label.toLowerCase()).join(' và ');
      quote = `Size ${size} có phần ${names} ôm sát hơn độ dư khuyến nghị. Nếu bạn chuộng sự cử động thoải mái thì nên tăng lên 1 size.`;
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
      quote = `Size ${size} mang phong cách Relaxed rộng rãi, che khuyết điểm tốt. Nếu bạn muốn mặc ôm vừa tôn dáng, hãy cân nhắc giảm 1 size.`;
    } else {
      step = 2;
      title = targetCount === checks.length ? 'Vừa vặn hoàn hảo (100%)' : 'Chuẩn phom tôn dáng (95%)';
      badgeColor = '#047857';
      badgeBg = '#D1FAE5';
      const matchedNames = checks.map(c => c.label.toLowerCase()).join(', ');
      quote = `Size ${size} là kích cỡ lý tưởng nhất cho bạn! Độ dư vải cân đối ở ${matchedNames}, buông rủ tự nhiên và tôn phom thanh lịch.`;
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
            <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.ink }}>Độ vừa vặn · Size {size}</Text>
          </View>
          <View style={{ backgroundColor: fitBadgeBg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 }}>
            <Text style={{ fontFamily: t.fonts.bold, fontSize: 11, color: fitBadgeColor }}>{fitTitle}</Text>
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
                  fontSize: 10,
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
          <View style={{ width: 30, height: 38, borderRadius: 15, backgroundColor: '#D4D9D2' }} />
          <View style={{ width: 12, height: 12, backgroundColor: '#D4D9D2', marginTop: -2 }} />
          <View
            style={{
              width: 88,
              height: 44,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              backgroundColor: '#DFE4DE',
            }}
          />
          <View style={{ width: 66, height: 36, borderRadius: 6, backgroundColor: '#DFE4DE' }} />
          <View
            style={{
              width: 84,
              height: 42,
              borderBottomLeftRadius: 20,
              borderBottomRightRadius: 20,
              backgroundColor: '#DFE4DE',
            }}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <View style={{ width: 16, height: 62, borderRadius: 8, backgroundColor: '#D4D9D2' }} />
            <View style={{ width: 16, height: 62, borderRadius: 8, backgroundColor: '#D4D9D2' }} />
          </View>
          <View style={{ width: 50, height: 3, borderRadius: 2, backgroundColor: '#CBD1C9', marginTop: 2 }} />

          {REGIONS.map(reg => {
            const check = checks.find(c => c.key === reg.key);
            const cfg = getRegionBadge(check);
            const isFocused = focused === reg.key;

            return (
              <Pressable
                key={reg.key}
                accessibilityRole="button"
                accessibilityLabel={`Vùng ${reg.label}: ${cfg?.label || 'Chưa đo'}`}
                onPress={() => setFocused(reg.key)}
                style={{
                  position: 'absolute',
                  top: reg.top,
                  width: reg.width,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: cfg?.bg || '#E5E7EB',
                  borderWidth: isFocused ? 2.5 : 1,
                  borderColor: isFocused ? cfg?.border || t.colors.ink : cfg?.border || '#D1D5DB',
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
                  {isFocused && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: cfg?.color || t.colors.ink }} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* 3. INTERACTIVE REGION CARDS */}
        <View style={{ flex: 1, gap: 8 }}>
          {REGIONS.map(reg => {
            const check = checks.find(c => c.key === reg.key);
            const cfg = getRegionBadge(check);
            const isFocused = focused === reg.key;

            return (
              <Pressable
                key={reg.key}
                accessibilityRole="button"
                onPress={() => setFocused(reg.key)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  borderWidth: isFocused ? 2 : 1,
                  borderColor: isFocused ? cfg?.border || t.colors.green : '#E5E1D8',
                  backgroundColor: isFocused ? cfg?.bg || '#F9F8F5' : 'white',
                  gap: 3,
                }}
              >
                <View style={[s.between, { alignItems: 'center' }]}>
                  <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.ink }}>{reg.label}</Text>
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
                    <Ionicons name={cfg?.icon || 'help-circle-outline'} size={11} color={cfg?.color || t.colors.muted} />
                    <Text style={{ fontSize: 10, fontFamily: t.fonts.bold, color: cfg?.color || t.colors.muted }}>
                      {cfg?.shortLabel || 'Chưa đo'}
                    </Text>
                  </View>
                </View>

                {check ? (
                  <Text style={[s.muted, { fontSize: 11 }]}>
                    Cơ thể: <Text style={{ color: t.colors.ink, fontFamily: t.fonts.medium }}>{check.body_cm}cm</Text> ➔ SP:{' '}
                    <Text style={{ color: t.colors.ink, fontFamily: t.fonts.bold }}>{check.garment_cm}cm</Text>{' '}
                    {check.ease_cm < 0 ? `(Chật ${Math.abs(check.ease_cm)}cm)` : `(Dư ${check.ease_cm}cm)`}
                  </Text>
                ) : (
                  <Text style={[s.muted, { fontSize: 11 }]}>Chưa có thông số vùng này trên bảng size</Text>
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
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 12, color: t.colors.green }}>Lời khuyên từ AI Stylist ShopFit</Text>
        </View>
        <Text style={{ fontFamily: t.fonts.regular, fontSize: 12, lineHeight: 18, color: t.colors.ink }}>{stylistQuote}</Text>
      </View>

      {/* 5. FOCUSED DETAIL INSPECTOR */}
      {selected && (
        <View style={{ backgroundColor: '#FAF8F5', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#EDE8DF', gap: 4 }}>
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 12, color: t.colors.ink }}>Chi tiết vùng {selected.label}:</Text>
          <Text style={[s.muted, { fontSize: 11, lineHeight: 17 }]}>
            {selected.label} cơ thể bạn: {selected.body_cm} cm · Thành phẩm: {selected.garment_cm} cm (
            {selected.ease_cm < 0
              ? `nhỏ hơn cơ thể ${Math.abs(selected.ease_cm)} cm`
              : `dư ${selected.ease_cm} cm so với mục tiêu ${selected.target_cm} cm`}
            ).
            {selected.ease_cm < 0
              ? ' Vùng này đang bị chật hơn cơ thể, khuyến nghị chọn lên size lớn hơn.'
              : selected.region === 'above_target'
              ? ' Vải có độ buông rộng tự nhiên, cử động thoải mái không gò bó.'
              : selected.region === 'below_target'
              ? ' Độ dư vải sát cơ thể, tạo cảm giác ôm gọn đường nét.'
              : ' Đạt chuẩn tỷ lệ phom dáng nhà may khuyến nghị.'}
          </Text>
        </View>
      )}
    </View>
  );
}
