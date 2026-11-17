import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { mediaUrl } from '../api';
import { dateLabel, money, theme as t } from '../theme';
import type { AdminPayment, TryonAnalytics } from '../types';
import { Button, s } from './ui';

export type AdminSummary = {
  products: number;
  pending_orders: number;
  pending_payments?: number;
  revenue: number;
  tryons: number;
  conversion_rate?: number;
  low_stock_products?: number;
};

export function AdminDashboard({
  summary,
  analytics,
  payments,
  paymentBusyId,
  onApprovePayment,
  onRejectPayment,
  wide,
}: {
  summary: AdminSummary | null;
  analytics: TryonAnalytics | null;
  payments: AdminPayment[];
  paymentBusyId: string | null;
  onApprovePayment: (id: string) => void;
  onRejectPayment: (id: string) => void;
  wide: boolean;
}) {
  const actionablePayments = payments.filter(p => p.status === 'verifying' || p.status === 'pending');

  return (
    <>
      {/* METRIC CARDS / DASHBOARD */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <View style={[s.card, { width: wide ? '18.5%' : '47.5%', padding: 16 }]}>
          <Ionicons name="shirt-outline" size={20} color={t.colors.green} />
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 24, color: t.colors.ink, marginTop: 12, marginBottom: 4 }}>
            {summary?.products ?? 0}
          </Text>
          <Text style={[s.muted, { fontSize: 11 }]}>Thiết kế đang bán</Text>
        </View>

        <View
          style={[
            s.card,
            {
              width: wide ? '18.5%' : '47.5%',
              padding: 16,
              borderColor: (summary?.pending_orders ?? 0) > 0 ? t.colors.gold : t.colors.line,
              backgroundColor: (summary?.pending_orders ?? 0) > 0 ? '#FFFDF5' : 'white',
            },
          ]}
        >
          <Ionicons name="receipt-outline" size={20} color={(summary?.pending_orders ?? 0) > 0 ? '#B45309' : t.colors.green} />
          <Text
            style={{
              fontFamily: t.fonts.bold,
              fontSize: 24,
              color: (summary?.pending_orders ?? 0) > 0 ? '#B45309' : t.colors.ink,
              marginTop: 12,
              marginBottom: 4,
            }}
          >
            {summary?.pending_orders ?? 0}
          </Text>
          <Text style={[s.muted, { fontSize: 11 }]}>Đơn chờ xác nhận</Text>
        </View>

        <View style={[s.card, { width: wide ? '18.5%' : '47.5%', padding: 16 }]}>
          <Ionicons name="wallet-outline" size={20} color={t.colors.green} />
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 20, color: t.colors.ink, marginTop: 14, marginBottom: 4 }}>
            {money(summary?.revenue ?? 0)}
          </Text>
          <Text style={[s.muted, { fontSize: 11 }]}>Doanh thu hoàn tất</Text>
        </View>

        <View style={[s.card, { width: wide ? '18.5%' : '47.5%', padding: 16 }]}>
          <Ionicons name="sparkles-outline" size={20} color={t.colors.green} />
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 24, color: t.colors.ink, marginTop: 12, marginBottom: 4 }}>
            {summary?.tryons ?? 0}
          </Text>
          <Text style={[s.muted, { fontSize: 11 }]}>Lượt thử thành công</Text>
        </View>

        <View style={[s.card, { width: wide ? '18.5%' : '100%', padding: 16, backgroundColor: '#F3F7F4' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Ionicons name="trending-up-outline" size={20} color={t.colors.green} />
            <Text
              style={{
                fontSize: 9,
                fontFamily: t.fonts.bold,
                color: t.colors.green,
                backgroundColor: '#D7E5DC',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
              }}
            >
              AI RETAIL
            </Text>
          </View>
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 24, color: t.colors.green, marginTop: 12, marginBottom: 4 }}>
            {summary?.conversion_rate ?? 0}%
          </Text>
          <Text style={[s.muted, { fontSize: 11 }]}>Tỷ lệ mua sau thử</Text>
        </View>
      </View>

      {/* QUICK SHORTCUT BUTTONS */}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10, marginBottom: 24 }}>
        <Button icon="receipt-outline" variant="secondary" onPress={() => router.push('/orders')} style={{ flex: 1 }}>
          {`Xem và xử lý đơn hàng ${summary?.pending_orders ? `(${summary.pending_orders} đơn mới)` : ''}`}
        </Button>
        <Button icon="analytics-outline" variant="outline" onPress={() => router.push('/fit-insights')} style={{ flex: 1 }}>
          Chất lượng độ vừa & hạn mức AI
        </Button>
      </View>

      {/* VIETQR TOP-UP APPROVAL QUEUE (WHEN CUSTOMERS REPORT TRANSFER) */}
      {actionablePayments.length > 0 && (
        <View
          style={[
            s.card,
            {
              backgroundColor: '#FFFDF5',
              borderColor: '#FDE68A',
              padding: 18,
              marginBottom: 24,
              gap: 12,
            },
          ]}
        >
          <View style={[s.between, { flexWrap: 'wrap', gap: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ backgroundColor: '#FEF3C7', padding: 8, borderRadius: 8 }}>
                <Ionicons name="qr-code-outline" size={18} color="#B45309" />
              </View>
              <View>
                <Text style={{ fontFamily: t.fonts.bold, fontSize: 15, color: t.colors.ink }}>
                  Đối soát nạp lượt VietQR ({actionablePayments.length} giao dịch chờ)
                </Text>
                <Text style={[s.muted, { fontSize: 11, marginTop: 2 }]}>
                  Kiểm tra nội dung chuyển khoản trên sao kê ngân hàng trước khi bấm duyệt cộng lượt
                </Text>
              </View>
            </View>
          </View>

          {actionablePayments.slice(0, 8).map(pt => {
            const isReported = pt.status === 'verifying';
            const isBusy = paymentBusyId === pt.id;
            return (
              <View
                key={pt.id}
                style={{
                  backgroundColor: 'white',
                  borderRadius: 10,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: isReported ? '#F59E0B' : '#E5E7EB',
                  gap: 8,
                }}
              >
                <View style={[s.between, { flexWrap: 'wrap', gap: 6 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        backgroundColor: isReported ? '#FEF3C7' : '#F3F4F6',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 5,
                      }}
                    >
                      <Text style={{ fontFamily: t.fonts.bold, fontSize: 12, color: '#B45309' }}>{pt.payment_code}</Text>
                    </View>
                    <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.green }}>{money(pt.amount)}</Text>
                    <Text style={[s.muted, { fontSize: 11 }]}>(+{pt.tryons} lượt)</Text>
                  </View>
                  <Text style={{ fontSize: 10, fontFamily: t.fonts.bold, color: isReported ? '#B45309' : t.colors.muted }}>
                    {isReported ? '● Khách báo đã CK' : 'Đang tạo mã QR'} · {dateLabel(pt.created_at)}
                  </Text>
                </View>

                <Text style={[s.muted, { fontSize: 12 }]}>
                  Khách hàng: <Text style={{ color: t.colors.ink, fontFamily: t.fonts.medium }}>{pt.user_name || 'Khách'}</Text> (
                  {pt.user_email || '—'}) · {pt.package_name || pt.package_id}
                </Text>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    loading={isBusy}
                    disabled={paymentBusyId !== null}
                    onPress={() => onApprovePayment(pt.id)}
                    style={{ flex: 2, minHeight: 42, paddingVertical: 8 }}
                  >
                    ✓ Duyệt cộng lượt & Voucher
                  </Button>
                  <Button
                    variant="outline"
                    disabled={paymentBusyId !== null}
                    onPress={() => onRejectPayment(pt.id)}
                    style={{ flex: 1, minHeight: 42, paddingVertical: 8, borderColor: '#FCA5A5' }}
                  >
                    <Text style={{ color: t.colors.error, fontSize: 12 }}>Từ chối</Text>
                  </Button>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* AI TRY-ON & CONVERSION ANALYTICS CARD */}
      <View
        style={[
          s.card,
          {
            backgroundColor: '#FAF8F5',
            borderColor: '#E6E1D6',
            padding: 18,
            marginBottom: 24,
          },
        ]}
      >
        <View style={[s.between, { marginBottom: 12, flexWrap: 'wrap', gap: 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ backgroundColor: '#D7E5DC', padding: 8, borderRadius: 8 }}>
              <Ionicons name="sparkles" size={18} color={t.colors.green} />
            </View>
            <View>
              <Text style={{ fontFamily: t.fonts.bold, fontSize: 15, color: t.colors.ink }}>
                Top thiết kế được thử & Tỷ lệ chốt đơn (AI Retail Analytics)
              </Text>
              <Text style={[s.muted, { fontSize: 11, marginTop: 2 }]}>
                Đo lường sản phẩm khách thử nhiều nhất và tỷ lệ khách mua sau khi dùng phòng thử đồ AI
              </Text>
            </View>
          </View>
          <View style={{ backgroundColor: t.colors.greenLight, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}>
            <Text style={{ fontFamily: t.fonts.bold, fontSize: 11, color: t.colors.green }}>
              TB toàn shop: {analytics?.avg_conversion_rate ?? summary?.conversion_rate ?? 0}% chốt đơn
            </Text>
          </View>
        </View>

        {!analytics?.top_products || analytics.top_products.length === 0 ? (
          <View style={{ paddingVertical: 16, alignItems: 'center' }}>
            <Text style={[s.muted, { fontSize: 12 }]}>
              Chưa có dữ liệu thử đồ AI. Dữ liệu xếp hạng sẽ hiển thị tại đây khi khách hàng tạo ảnh thử đồ.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {analytics.top_products.map((item, idx) => (
              <View
                key={item.product_id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'white',
                  borderRadius: 10,
                  padding: 10,
                  borderWidth: 1,
                  borderColor: '#EFECE6',
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: idx === 0 ? '#FEF3C7' : idx === 1 ? '#E0E7FF' : '#F3F4F6',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: t.fonts.bold,
                      fontSize: 12,
                      color: idx === 0 ? '#B45309' : idx === 1 ? '#3730A3' : t.colors.muted,
                    }}
                  >
                    #{idx + 1}
                  </Text>
                </View>

                <Image
                  source={mediaUrl(item.image_url)}
                  contentFit="cover"
                  style={{ width: 44, height: 55, borderRadius: 6, backgroundColor: t.colors.sand }}
                />

                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: t.fonts.medium, fontSize: 13, color: t.colors.ink }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[s.muted, { fontSize: 11, marginTop: 2 }]}>
                    {item.category} · {money(item.price)}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={{ backgroundColor: '#F3F4F6', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, fontFamily: t.fonts.medium, color: t.colors.ink }}>{item.tryon_count} lượt thử</Text>
                    </View>
                    <View style={{ backgroundColor: '#F3F4F6', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, fontFamily: t.fonts.medium, color: t.colors.ink }}>{item.order_count} đã bán</Text>
                    </View>
                  </View>
                  <View
                    style={{
                      backgroundColor: item.conversion_rate >= 20 ? '#D1FAE5' : item.conversion_rate > 0 ? '#FEF3C7' : '#F3F4F6',
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontFamily: t.fonts.bold,
                        color: item.conversion_rate >= 20 ? '#047857' : item.conversion_rate > 0 ? '#B45309' : t.colors.muted,
                      }}
                    >
                      {item.conversion_rate}% chốt đơn
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </>
  );
}
