import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { request } from '../api';
import { Button, s } from './ui';
import { useStore } from '../store';
import { money, theme as t } from '../theme';
import type { PaymentOrder, PaymentStatus, TokenPackage } from '../types';

const DEFAULT_PACKAGES: TokenPackage[] = [
  { id: 'pack_10', name: 'Gói Thử Nhanh', price: 19000, tryons: 10, tag: 'Tiết kiệm', voucher_value: 0 },
  { id: 'pack_30', name: 'Gói Phổ Thông', price: 49000, tryons: 30, tag: 'Phổ biến nhất ⭐', voucher_value: 30000 },
  { id: 'pack_vip', name: 'Gói VIP Tháng', price: 99000, tryons: 100, tag: 'VIP Đỉnh Cao 👑', voucher_value: 50000 },
];

export function TopUpModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { quota, refreshQuota, notify } = useStore();
  const [packages, setPackages] = useState<TokenPackage[]>(DEFAULT_PACKAGES);
  const [selectedId, setSelectedId] = useState<string>('pack_30');
  const [step, setStep] = useState<'select' | 'qr' | 'success'>('select');
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [completedTryons, setCompletedTryons] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleClose = () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setStep('select');
    setOrder(null);
    onClose();
  };

  // Load packages on open
  useEffect(() => {
    if (!visible) return;
    void request<TokenPackage[]>('/api/payment/packages')
      .then((data) => {
        if (data && data.length > 0) setPackages(data);
      })
      .catch(() => {});
  }, [visible]);

  // Polling for QR status
  useEffect(() => {
    if (step !== 'qr' || !order) return;

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await request<PaymentStatus>(`/api/payment/status/${order.transaction_id}`);
        if (res.status === 'completed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setCompletedTryons(res.tryons);
          setStep('success');
          void refreshQuota();
        }
      } catch {
        // network retry
      }
    }, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [step, order, refreshQuota]);

  const copyToClipboard = (text: string, label: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    notify(`Đã sao chép ${label}`);
  };

  const handleCreateOrder = async () => {
    setLoading(true);
    try {
      const data = await request<PaymentOrder>('/api/payment/create-order', {
        method: 'POST',
        body: JSON.stringify({ package_id: selectedId }),
      });
      setOrder(data);
      setStep('qr');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualConfirm = async () => {
    if (!order) return;
    setConfirming(true);
    try {
      const res = await request<{ status: string; tryons: number }>(`/api/payment/confirm/${order.transaction_id}`, {
        method: 'POST',
      });
      if (res.status === 'completed') {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setCompletedTryons(res.tryons);
        setStep('success');
        void refreshQuota();
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={modalStyles.backdrop}>
        <View style={modalStyles.container}>
          {/* Header */}
          <View style={s.between}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={modalStyles.headerIcon}>
                <Ionicons name="sparkles" size={18} color={t.colors.gold} />
              </View>
              <Text style={modalStyles.headerTitle}>
                {step === 'select' ? 'Nạp Lượt Thử Đồ AI' : step === 'qr' ? 'Quét Mã VietQR' : 'Thành Công'}
              </Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={t.colors.muted} />
            </Pressable>
          </View>

          {/* STEP 1: SELECT PACKAGE */}
          {step === 'select' && (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              {/* Quota overview */}
              <View style={modalStyles.quotaCard}>
                <Text style={{ fontSize: 13, color: t.colors.muted }}>Số dư lượt thử hiện tại:</Text>
                <Text style={{ fontSize: 18, fontFamily: t.fonts.bold, color: t.colors.ink, marginTop: 2 }}>
                  {quota?.total_available ?? 0} lượt{' '}
                  <Text style={{ fontSize: 12, fontFamily: t.fonts.regular, color: t.colors.muted }}>
                    ({quota?.starter_tryons_left ?? 0} vĩnh viễn + {quota?.daily_remaining ?? 0} hôm nay)
                  </Text>
                </Text>
              </View>

              <Text style={{ fontSize: 12, color: t.colors.muted, marginBottom: 12 }}>
                Lượt thử đã nạp sẽ không giới hạn thời gian sử dụng và tự động tích lũy thăng hạng VIP ShopFit:
              </Text>

              {/* Package cards */}
              <View style={{ gap: 10 }}>
                {packages.map((pkg) => {
                  const isSelected = selectedId === pkg.id;
                  return (
                    <Pressable
                      key={pkg.id}
                      onPress={() => setSelectedId(pkg.id)}
                      style={[modalStyles.packageCard, isSelected && modalStyles.packageCardActive]}
                    >
                      {pkg.tag && (
                        <View style={[modalStyles.tagBadge, isSelected && modalStyles.tagBadgeActive]}>
                          <Text style={[modalStyles.tagText, isSelected && modalStyles.tagTextActive]}>{pkg.tag}</Text>
                        </View>
                      )}

                      <View style={[s.between, { alignItems: 'flex-start' }]}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ fontSize: 15, fontFamily: t.fonts.bold, color: t.colors.ink }}>
                            {pkg.name}
                          </Text>
                          <Text style={{ fontSize: 13, color: t.colors.green, fontFamily: t.fonts.medium, marginTop: 2 }}>
                            +{pkg.tryons} lượt thử 4 góc AI
                          </Text>
                          {pkg.voucher_value > 0 && (
                            <Text style={{ fontSize: 11, color: t.colors.gold, fontFamily: t.fonts.medium, marginTop: 4 }}>
                              🎁 Tặng voucher {money(pkg.voucher_value)} mua sắm
                            </Text>
                          )}
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 16, fontFamily: t.fonts.bold, color: isSelected ? t.colors.green : t.colors.ink }}>
                            {money(pkg.price)}
                          </Text>
                          <Ionicons
                            name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                            size={22}
                            color={isSelected ? t.colors.green : t.colors.line}
                            style={{ marginTop: 6 }}
                          />
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <Button
                variant="primary"
                onPress={() => void handleCreateOrder()}
                loading={loading}
                icon="qr-code-outline"
                style={{ marginTop: 18 }}
              >
                Tiếp tục thanh toán VietQR
              </Button>
            </ScrollView>
          )}

          {/* STEP 2: VIETQR PAYMENT */}
          {step === 'qr' && order && (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
              <View style={{ alignItems: 'center', marginVertical: 8 }}>
                <View style={modalStyles.qrWrapper}>
                  <Image source={{ uri: order.qr_url }} style={modalStyles.qrImage} contentFit="contain" />
                </View>
                <Text style={{ fontSize: 12, color: t.colors.muted, marginTop: 8, textAlign: 'center' }}>
                  Quét mã QR bằng App Ngân Hàng hoặc MoMo để thanh toán chính xác
                </Text>
              </View>

              {/* Payment Details */}
              <View style={modalStyles.detailsCard}>
                <View style={s.between}>
                  <Text style={modalStyles.detailLabel}>Ngân hàng:</Text>
                  <Text style={modalStyles.detailValue}>{order.bank_id}</Text>
                </View>
                <View style={s.between}>
                  <Text style={modalStyles.detailLabel}>Số tài khoản:</Text>
                  <Pressable onPress={() => copyToClipboard(order.bank_account, 'Số tài khoản')} style={modalStyles.copyRow}>
                    <Text style={[modalStyles.detailValue, { fontFamily: t.fonts.bold }]}>{order.bank_account}</Text>
                    <Ionicons name="copy-outline" size={14} color={t.colors.green} />
                  </Pressable>
                </View>
                <View style={s.between}>
                  <Text style={modalStyles.detailLabel}>Chủ tài khoản:</Text>
                  <Text style={modalStyles.detailValue}>{order.bank_account_name}</Text>
                </View>
                <View style={s.between}>
                  <Text style={modalStyles.detailLabel}>Số tiền:</Text>
                  <Pressable onPress={() => copyToClipboard(String(order.amount), 'Số tiền')} style={modalStyles.copyRow}>
                    <Text style={[modalStyles.detailValue, { color: t.colors.green, fontFamily: t.fonts.bold }]}>
                      {money(order.amount)}
                    </Text>
                    <Ionicons name="copy-outline" size={14} color={t.colors.green} />
                  </Pressable>
                </View>
                <View style={[s.between, { borderTopWidth: 1, borderTopColor: t.colors.line, paddingTop: 8 }]}>
                  <Text style={modalStyles.detailLabel}>Nội dung CK:</Text>
                  <Pressable onPress={() => copyToClipboard(order.payment_code, 'Mã chuyển khoản')} style={modalStyles.codeBadge}>
                    <Text style={{ fontSize: 14, fontFamily: t.fonts.bold, color: '#B34A00' }}>
                      {order.payment_code}
                    </Text>
                    <Ionicons name="copy-outline" size={14} color="#B34A00" />
                  </Pressable>
                </View>
              </View>

              {/* Status Indicator */}
              <View style={modalStyles.pollingRow}>
                <ActivityIndicator size="small" color={t.colors.green} />
                <Text style={{ fontSize: 12, color: t.colors.ink, flex: 1, fontFamily: t.fonts.medium }}>
                  Đang chờ hệ thống ngân hàng xác nhận...
                </Text>
              </View>

              {/* Confirm Buttons */}
              <Button
                variant="primary"
                onPress={() => void handleManualConfirm()}
                loading={confirming}
                icon="checkmark-circle-outline"
                style={{ marginTop: 12 }}
              >
                Tôi đã chuyển khoản thành công
              </Button>

              <Pressable onPress={() => setStep('select')} style={{ alignItems: 'center', marginTop: 10, padding: 8 }}>
                <Text style={{ fontSize: 13, color: t.colors.muted }}>Quay lại chọn gói khác</Text>
              </Pressable>
            </ScrollView>
          )}

          {/* STEP 3: SUCCESS */}
          {step === 'success' && (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 14 }}>
              <View style={modalStyles.successCircle}>
                <Ionicons name="checkmark" size={38} color="#FFFFFF" />
              </View>
              <Text style={{ fontSize: 20, fontFamily: t.fonts.bold, color: t.colors.ink }}>
                Nạp Lượt Thành Công! 🎉
              </Text>
              <Text style={{ fontSize: 14, color: t.colors.muted, textAlign: 'center', lineHeight: 22, paddingHorizontal: 10 }}>
                Bạn đã nhận được <Text style={{ fontFamily: t.fonts.bold, color: t.colors.green }}>+{completedTryons} lượt thử đồ AI</Text> và tích lũy doanh số lên hạng thành viên VIP!
              </Text>

              <Button variant="primary" onPress={handleClose} icon="sparkles" style={{ width: '100%', marginTop: 12 }}>
                Bắt đầu thử đồ ngay
              </Button>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: t.colors.paper,
    borderRadius: 20,
    padding: 22,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FAF5EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: t.fonts.bold,
    color: t.colors.ink,
  },
  quotaCard: {
    backgroundColor: '#F5F7F4',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6EAE4',
  },
  packageCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: t.colors.line,
    backgroundColor: t.colors.paper,
    position: 'relative',
  },
  packageCardActive: {
    borderColor: t.colors.green,
    backgroundColor: '#F4F7F4',
  },
  tagBadge: {
    position: 'absolute',
    top: -9,
    left: 14,
    backgroundColor: '#EBE7DD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagBadgeActive: {
    backgroundColor: t.colors.green,
  },
  tagText: {
    fontSize: 10,
    fontFamily: t.fonts.bold,
    color: t.colors.ink,
  },
  tagTextActive: {
    color: '#FFFFFF',
  },
  qrWrapper: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.colors.line,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  qrImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
  detailsCard: {
    backgroundColor: '#FAF9F6',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: t.colors.line,
  },
  detailLabel: {
    fontSize: 12,
    color: t.colors.muted,
    fontFamily: t.fonts.regular,
  },
  detailValue: {
    fontSize: 13,
    color: t.colors.ink,
    fontFamily: t.fonts.medium,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF2E6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFD9B3',
  },
  pollingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EDF5EE',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  successCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: t.colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: t.colors.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
});
