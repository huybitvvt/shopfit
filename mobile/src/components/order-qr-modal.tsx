import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { request } from '../api';
import { tapSuccess } from '../haptics';
import { useStore } from '../store';
import { money, theme as t } from '../theme';
import type { Order } from '../types';
import { Button, ToastOverlay, s } from './ui';

export function OrderQrModal({
  order,
  visible,
  onClose,
  onPaid,
  onUpdated,
  dismissLabel = 'Thanh toán sau tại Đơn hàng',
  doneLabel = 'Xem đơn hàng của tôi',
}: {
  order: Order | null;
  visible: boolean;
  onClose: () => void;
  onPaid?: (updated: Order) => void;
  onUpdated?: (updated: Order) => void;
  dismissLabel?: string;
  doneLabel?: string;
}) {
  const { notify } = useStore();
  const [polledOrder, setPolledOrder] = useState<Order | null>(null);
  const [reporting, setReporting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onPaidRef = useRef(onPaid);
  const onUpdatedRef = useRef(onUpdated);

  useEffect(() => {
    onPaidRef.current = onPaid;
    onUpdatedRef.current = onUpdated;
  }, [onPaid, onUpdated]);

  const liveOrder = polledOrder && order && polledOrder.id === order.id ? polledOrder : order;
  const orderId = liveOrder?.id;
  const isPaid = liveOrder?.payment_status === 'paid';
  const isVerifying = liveOrder?.payment_status === 'verifying';
  const isCancelled = liveOrder?.status === 'cancelled';

  useEffect(() => {
    if (!visible || !orderId || isPaid || isCancelled) return;

    pollRef.current = setInterval(async () => {
      try {
        const latest = await request<Order>(`/api/orders/${orderId}`);
        setPolledOrder(latest);
        onUpdatedRef.current?.(latest);
        if (latest.payment_status === 'paid') {
          if (pollRef.current) clearInterval(pollRef.current);
          tapSuccess();
          onPaidRef.current?.(latest);
        } else if (latest.status === 'cancelled') {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // transient network retry
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [visible, orderId, isPaid, isCancelled]);

  if (!liveOrder) return null;

  async function copy(value: string, label: string) {
    try {
      await Clipboard.setStringAsync(value);
      notify(`Đã sao chép ${label}`);
    } catch {
      notify(`Không thể sao chép ${label}`);
    }
  }

  async function handleReportPaid() {
    if (!liveOrder) return;
    setReporting(true);
    try {
      const updated = await request<Order>(`/api/orders/${liveOrder.id}/report-paid`, { method: 'POST' });
      setPolledOrder(updated);
      onUpdatedRef.current?.(updated);
      if (updated.payment_status === 'paid') {
        tapSuccess();
        onPaidRef.current?.(updated);
      } else {
        notify('Đã gửi báo chuyển khoản. Hệ thống SePay sẽ tự động xác nhận ngay khi tiền về.');
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setReporting(false);
    }
  }

  const paymentCode = liveOrder.payment_code || '';
  const bankId = liveOrder.bank_id || 'VPBank';
  const bankAccount = liveOrder.bank_account || '';
  const bankAccountName = liveOrder.bank_account_name || 'SHOPFIT STUDIO';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* Header */}
          <View style={s.between}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={styles.headerIcon}>
                <Ionicons name={isPaid ? 'checkmark-circle' : 'qr-code-outline'} size={19} color={t.colors.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {isPaid ? 'Thanh Toán Thành Công' : 'Thanh Toán Đơn VietQR'}
                </Text>
                <Text style={{ fontSize: 11, color: t.colors.muted, fontFamily: t.fonts.regular }}>
                  Đơn SF · {liveOrder.id.slice(0, 8).toUpperCase()} · SePay Auto
                </Text>
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng cửa sổ thanh toán VietQR" onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={t.colors.muted} />
            </Pressable>
          </View>

          {isPaid ? (
            <View style={{ alignItems: 'center', paddingVertical: 22, gap: 14 }}>
              <View style={styles.successCircle}>
                <Ionicons name="checkmark" size={38} color="#FFFFFF" />
              </View>
              <Text style={{ fontSize: 20, fontFamily: t.fonts.bold, color: t.colors.ink, textAlign: 'center' }}>
                Đã nhận chuyển khoản! 🎉
              </Text>
              <Text style={{ fontSize: 13, color: t.colors.muted, textAlign: 'center', lineHeight: 21, paddingHorizontal: 8 }}>
                ShopFit đã xác nhận thanh toán{' '}
                <Text style={{ fontFamily: t.fonts.bold, color: t.colors.green }}>{money(liveOrder.total)}</Text> qua SePay VietQR. Đơn hàng của bạn đã tự động chuyển sang trạng thái{' '}
                <Text style={{ fontFamily: t.fonts.bold, color: t.colors.ink }}>Đã xác nhận</Text>.
              </Text>
              <Button variant="primary" icon="receipt-outline" onPress={onClose} style={{ width: '100%', marginTop: 8 }}>
                {doneLabel}
              </Button>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 540 }}>
              {liveOrder.payment_qr_url ? (
                <View style={{ alignItems: 'center', marginVertical: 6 }}>
                  <View style={styles.qrWrapper}>
                    <Image source={{ uri: liveOrder.payment_qr_url }} style={styles.qrImage} contentFit="contain" />
                  </View>
                  <Text style={{ fontSize: 12, color: t.colors.muted, marginTop: 8, textAlign: 'center', lineHeight: 17 }}>
                    Quét mã bằng App Ngân Hàng bất kỳ để điền sẵn số tiền & nội dung chuyển khoản
                  </Text>
                </View>
              ) : null}

              <View style={styles.detailsCard}>
                <View style={s.between}>
                  <Text style={styles.detailLabel}>Ngân hàng:</Text>
                  <Text style={styles.detailValue}>{bankId}</Text>
                </View>
                {bankAccount ? (
                  <View style={s.between}>
                    <Text style={styles.detailLabel}>Số tài khoản:</Text>
                    <Pressable accessibilityRole="button" onPress={() => void copy(bankAccount, 'Số tài khoản')} style={styles.copyRow}>
                      <Text style={[styles.detailValue, { fontFamily: t.fonts.bold }]}>{bankAccount}</Text>
                      <Ionicons name="copy-outline" size={14} color={t.colors.green} />
                    </Pressable>
                  </View>
                ) : null}
                <View style={s.between}>
                  <Text style={styles.detailLabel}>Chủ tài khoản:</Text>
                  <Text style={styles.detailValue}>{bankAccountName}</Text>
                </View>
                <View style={s.between}>
                  <Text style={styles.detailLabel}>Số tiền:</Text>
                  <Pressable accessibilityRole="button" onPress={() => void copy(String(liveOrder.total), 'Số tiền')} style={styles.copyRow}>
                    <Text style={[styles.detailValue, { color: t.colors.green, fontFamily: t.fonts.bold }]}>
                      {money(liveOrder.total)}
                    </Text>
                    <Ionicons name="copy-outline" size={14} color={t.colors.green} />
                  </Pressable>
                </View>
                {paymentCode ? (
                  <View style={[s.between, { borderTopWidth: 1, borderTopColor: t.colors.line, paddingTop: 8 }]}>
                    <Text style={styles.detailLabel}>Nội dung CK:</Text>
                    <Pressable accessibilityRole="button" onPress={() => void copy(paymentCode, 'Mã chuyển khoản')} style={styles.codeBadge}>
                      <Text style={{ fontSize: 14, fontFamily: t.fonts.bold, color: '#B34A00' }}>{paymentCode}</Text>
                      <Ionicons name="copy-outline" size={14} color="#B34A00" />
                    </Pressable>
                  </View>
                ) : null}
              </View>

              <View style={[styles.pollingRow, isVerifying && { backgroundColor: '#FEF3C7' }]}>
                <ActivityIndicator size="small" color={isVerifying ? '#B45309' : t.colors.green} />
                <Text style={{ fontSize: 12, color: isVerifying ? '#92400E' : t.colors.ink, flex: 1, fontFamily: t.fonts.medium, lineHeight: 17 }}>
                  {isVerifying
                    ? 'Đã ghi nhận báo chuyển khoản! Đang chờ SePay / Chủ shop xác nhận tự động...'
                    : 'Đang tự động chờ tiền về qua SePay VietQR (kiểm tra mỗi 3 giây)...'}
                </Text>
              </View>

              <Button
                variant={isVerifying ? 'secondary' : 'primary'}
                onPress={() => void handleReportPaid()}
                loading={reporting}
                disabled={isVerifying}
                icon="checkmark-circle-outline"
                style={{ marginTop: 12 }}
              >
                {isVerifying ? 'Đang chờ xác nhận chuyển khoản' : 'Tôi đã chuyển khoản thành công'}
              </Button>

              <Pressable accessibilityRole="button" onPress={onClose} style={{ alignItems: 'center', marginTop: 10, padding: 8 }}>
                <Text style={{ fontSize: 13, color: t.colors.muted }}>{dismissLabel}</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
        <ToastOverlay />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDF5EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: t.fonts.bold,
    color: t.colors.ink,
  },
  qrWrapper: {
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.colors.line,
  },
  qrImage: {
    width: 210,
    height: 210,
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
  },
});
