import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { request } from '../api';
import { theme as t } from '../theme';
import type { FitFeedback, FitFeedbackRow, PublicFitReview } from '../types';
import { s } from './ui';

const FIT_BADGES: Record<PublicFitReview['actual_fit'], { label: string; bg: string; color: string }> = {
  tight: { label: 'Hơi chật', bg: '#FDF2F2', color: '#A34B42' },
  fits: { label: 'Mặc vừa chuẩn', bg: '#E8F5EE', color: '#2D6A4F' },
  loose: { label: 'Rộng rãi', bg: '#FDF6E7', color: '#9A6700' },
};

export function FeedbackRow({ row }: { row: FitFeedbackRow }) {
  return (
    <View style={{ gap: 8, paddingVertical: 10 }}>
      <View style={s.between}>
        <Text style={s.label}>
          Size {row.size} · {row.total} phản hồi thực tế
        </Text>
        {row.enough_data && !row.needs_review ? (
          <Text style={{ fontFamily: t.fonts.medium, fontSize: 11, color: t.colors.green }}>✓ Ổn định theo bảng size</Text>
        ) : null}
      </View>
      <View
        accessible
        accessibilityLabel={`Chật ${row.tight}, vừa ${row.fits}, rộng ${row.loose}`}
        style={{ flexDirection: 'row', height: 11, borderRadius: 6, overflow: 'hidden', backgroundColor: t.colors.line }}
      >
        {(
          [
            ['tight', '#A34B42'],
            ['fits', t.colors.green],
            ['loose', '#AF8537'],
          ] as const
        ).map(
          ([key, color]) =>
            row[key] > 0 && <View key={key} style={{ flex: row[key], backgroundColor: color }} />
        )}
      </View>
      <Text style={[s.muted, { fontSize: 12 }]}>
        Chật {row.tight} · Vừa {row.fits} · Rộng {row.loose}
      </Text>
      {!row.enough_data && <Text style={[s.muted, { fontSize: 11 }]}>Chưa đủ 3 mẫu để nhận định xu hướng tự động.</Text>}
      {row.needs_review && (
        <Text style={[s.muted, { color: t.colors.error, fontSize: 12 }]}>
          Lưu ý: Nhiều khách phản hồi lệch phom — nên đối chiếu kỹ số đo trước khi đặt size này.
        </Text>
      )}
    </View>
  );
}

function BuyerReviewCard({ review }: { review: PublicFitReview }) {
  const badge = FIT_BADGES[review.actual_fit] || FIT_BADGES.fits;
  const dateText = review.updated_at ? new Date(review.updated_at).toLocaleDateString('vi-VN') : '';
  const initial = (review.masked_user || 'K')[0]?.toUpperCase() || 'K';

  return (
    <View
      style={{
        backgroundColor: '#FAF8F5',
        borderWidth: 1,
        borderColor: '#EAE6DD',
        borderRadius: 12,
        padding: 14,
        gap: 8,
      }}
    >
      <View style={[s.between, { alignItems: 'flex-start' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: t.colors.greenLight,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.green }}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.ink }}>{review.masked_user}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="checkmark-circle" size={13} color={t.colors.green} />
                <Text style={{ fontFamily: t.fonts.medium, fontSize: 11, color: t.colors.green }}>Đã mua</Text>
              </View>
            </View>
            <Text style={[s.muted, { fontSize: 11 }]}>
              Phân loại: {review.color} · Size {review.size}
              {dateText ? ` · ${dateText}` : ''}
            </Text>
          </View>
        </View>

        <View style={{ backgroundColor: badge.bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 }}>
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 11, color: badge.color }}>{badge.label}</Text>
        </View>
      </View>

      {review.notes ? (
        <Text style={[s.text, { fontSize: 13, lineHeight: 20, color: '#2F3833' }]}>“{review.notes}”</Text>
      ) : null}
    </View>
  );
}

export function ProductFitFeedback({ productId }: { productId: string }) {
  const [data, setData] = useState<FitFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void request<FitFeedback>(`/api/products/${productId}/fit-feedback`)
        .then(value => {
          if (active) {
            setData(value);
            setError(null);
          }
        })
        .catch(e => {
          if (active) setError(e.message);
        });
      return () => {
        active = false;
      };
    }, [productId])
  );

  const publicReviews = data?.reviews || [];

  return (
    <View style={[s.card, { gap: 10, marginTop: 24 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="people-outline" size={18} color={t.colors.green} />
        <Text style={[s.text, { fontFamily: t.fonts.bold, fontSize: 15 }]}>Người đã mua nói gì về size?</Text>
      </View>

      {data?.rows.length ? (
        data.rows.map(row => <FeedbackRow key={row.size} row={row} />)
      ) : (
        <Text style={s.muted}>{error || 'Chưa có phản hồi từ đơn đã giao.'}</Text>
      )}

      {publicReviews.length > 0 && (
        <View style={{ gap: 10, marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.colors.line }}>
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 12, color: t.colors.ink, letterSpacing: 0.3 }}>
            NHẬN XÉT ẨN DANH TỪ ĐƠN ĐÃ GIAO ({publicReviews.length})
          </Text>
          {publicReviews.map((rev, idx) => (
            <BuyerReviewCard key={`${rev.masked_user}-${rev.size}-${idx}`} review={rev} />
          ))}
        </View>
      )}

      {data?.notice ? <Text style={[s.muted, { fontSize: 11, marginTop: 2 }]}>{data.notice}</Text> : null}
    </View>
  );
}
