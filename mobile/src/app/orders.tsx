import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { mediaUrl, request } from '../api';
import { Button, Empty, ErrorMessage, Header, Screen, s } from '../components/ui';
import { useStore } from '../store';
import { dateLabel, money, normalizeVi, theme as t } from '../theme';
import type { Order } from '../types';

type OrderTab = 'all' | 'pending' | 'shipping' | 'completed' | 'cancelled';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: IconName }> = {
  pending: { label: 'Chờ xác nhận', bg: '#FEF3C7', text: '#B45309', icon: 'time-outline' },
  confirmed: { label: 'Đã duyệt · Đang chuẩn bị', bg: '#DBEAFE', text: '#1D4ED8', icon: 'cube-outline' },
  shipping: { label: 'Đang giao hàng', bg: '#EDE9FE', text: '#6D28D9', icon: 'bicycle-outline' },
  completed: { label: 'Giao thành công', bg: '#D1FAE5', text: '#047857', icon: 'checkmark-circle-outline' },
  cancelled: { label: 'Đã hủy', bg: '#FEE2E2', text: '#B91C1C', icon: 'close-circle-outline' },
};

export default function Orders() {
  const { user, products, addCart, notify, refresh } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OrderTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setOrders([]);
      return;
    }
    try {
      const list = await request<Order[]>('/api/orders');
      setOrders(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void fetchOrders();
    }, [fetchOrders])
  );

  async function changeStatus(order: Order, status: string) {
    setBusy(order.id);
    setConfirmCancelId(null);
    setError(null);
    try {
      const next = await request<Order>(`/api/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setOrders(list => list.map(i => (i.id === next.id ? next : i)));
      void refresh();
      notify(`Đã cập nhật đơn hàng SF · ${order.id.slice(0, 8).toUpperCase()}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function requestCancelOrder(order: Order) {
    if (Platform.OS !== 'web') {
      Alert.alert(
        'Xác nhận hủy đơn hàng',
        `Bạn có chắc chắn muốn hủy đơn SF · ${order.id.slice(0, 8).toUpperCase()} không? Tồn kho và mã giảm giá (nếu có) sẽ được hoàn lại.`,
        [
          { text: 'Giữ đơn', style: 'cancel' },
          { text: 'Xác nhận hủy', style: 'destructive', onPress: () => void changeStatus(order, 'cancelled') },
        ]
      );
      return;
    }
    setConfirmCancelId(prev => (prev === order.id ? null : order.id));
  }

  function reorderItems(order: Order) {
    let addedCount = 0;
    for (const item of order.items) {
      const liveProd = products.find(p => p.id === item.product_id);
      if (liveProd && liveProd.active) {
        const vStock = liveProd.variants.find(v => v.size === item.size && v.color === item.color)?.stock || 0;
        if (vStock > 0) {
          addCart(liveProd, item.size, item.color);
          addedCount++;
        }
      }
    }
    if (addedCount > 0) {
      router.push('/cart');
    } else {
      notify('Các phân loại trong đơn cũ hiện đã hết hàng hoặc ngừng kinh doanh.');
    }
  }

  const counts = useMemo(() => {
    const pending = orders.filter(o => o.status === 'pending').length;
    const shipping = orders.filter(o => o.status === 'confirmed' || o.status === 'shipping').length;
    const completed = orders.filter(o => o.status === 'completed').length;
    const cancelled = orders.filter(o => o.status === 'cancelled').length;
    return { all: orders.length, pending, shipping, completed, cancelled };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    let list = orders;
    if (activeTab === 'pending') list = list.filter(o => o.status === 'pending');
    else if (activeTab === 'shipping') list = list.filter(o => o.status === 'confirmed' || o.status === 'shipping');
    else if (activeTab === 'completed') list = list.filter(o => o.status === 'completed');
    else if (activeTab === 'cancelled') list = list.filter(o => o.status === 'cancelled');

    const q = normalizeVi(searchQuery);
    if (q) {
      list = list.filter(o => {
        const itemsText = o.items.map(i => i.name).join(' ');
        const hay = normalizeVi(`${o.id.slice(0, 8)} ${o.customer_name} ${o.phone} ${o.address} ${itemsText}`);
        return hay.includes(q);
      });
    }
    return list;
  }, [orders, activeTab, searchQuery]);

  return (
    <Screen onRefresh={fetchOrders}>
      <Header
        title={user?.role === 'admin' ? 'Quản lý đơn hàng' : 'Đơn hàng của bạn'}
        subtitle={user?.role === 'admin' ? 'SHOP ORDERS DISPATCH' : 'YOUR ORDER STORIES'}
        back
      />

      <View style={{ maxWidth: 840, width: '100%', alignSelf: 'center' }}>
        <ErrorMessage message={error} />

        {/* SEARCH BAR FOR QUICK ORDER LOOKUP */}
        {user && orders.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'white',
              borderWidth: 1,
              borderColor: t.colors.line,
              borderRadius: 10,
              paddingHorizontal: 12,
              height: 44,
              marginBottom: 12,
            }}
          >
            <Ionicons name="search-outline" size={17} color={t.colors.muted} style={{ marginRight: 8 }} />
            <TextInput
              accessibilityLabel="Tìm đơn hàng"
              placeholder={user.role === 'admin' ? 'Tìm theo mã đơn, tên khách, SĐT hoặc tên sản phẩm...' : 'Tìm theo mã đơn hoặc tên sản phẩm...'}
              placeholderTextColor={t.colors.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{ flex: 1, fontSize: 13, color: t.colors.ink, fontFamily: t.fonts.regular }}
            />
            {searchQuery.length > 0 && (
              <Pressable accessibilityRole="button" accessibilityLabel="Xóa tìm kiếm đơn" onPress={() => setSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={17} color={t.colors.muted} />
              </Pressable>
            )}
          </View>
        )}

        {/* 4+1 ORDER STATUS TABS */}
        <View style={{ marginBottom: 16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {(
              [
                { id: 'all' as const, label: 'Tất cả', count: counts.all, alert: false },
                { id: 'pending' as const, label: 'Chờ xác nhận', count: counts.pending, alert: counts.pending > 0 },
                { id: 'shipping' as const, label: 'Đang giao', count: counts.shipping, alert: false },
                { id: 'completed' as const, label: 'Đã giao', count: counts.completed, alert: false },
                { id: 'cancelled' as const, label: 'Đã hủy', count: counts.cancelled, alert: false },
              ]
            ).map(tab => {
              const active = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setActiveTab(tab.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 20,
                    backgroundColor: active ? t.colors.green : '#F3F1EC',
                    borderWidth: 1,
                    borderColor: active ? t.colors.green : '#E5E1D8',
                    gap: 6,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: active ? t.fonts.bold : t.fonts.medium,
                      fontSize: 12,
                      color: active ? 'white' : t.colors.ink,
                    }}
                  >
                    {tab.label}
                  </Text>
                  <View
                    style={{
                      backgroundColor: active ? 'rgba(255,255,255,0.25)' : tab.alert ? '#FEF3C7' : '#E4E0D6',
                      borderRadius: 10,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      minWidth: 18,
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontFamily: t.fonts.bold,
                        color: active ? 'white' : tab.alert ? '#B45309' : t.colors.muted,
                      }}
                    >
                      {tab.count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* BODY CONTENT */}
        {loading ? (
          <ActivityIndicator color={t.colors.green} style={{ margin: 40 }} />
        ) : !user ? (
          <Empty
            icon="receipt-outline"
            title="Theo dõi đơn của bạn"
            description="Đăng nhập để xem lịch sử đặt hàng và trạng thái giao hàng."
            action="Đăng nhập"
            onPress={() => router.push('/auth')}
          />
        ) : filteredOrders.length === 0 ? (
          <Empty
            icon="receipt-outline"
            title={
              searchQuery
                ? 'Không tìm thấy đơn phù hợp'
                : activeTab === 'pending'
                ? 'Không có đơn nào chờ xác nhận'
                : activeTab === 'shipping'
                ? 'Không có đơn nào đang giao'
                : activeTab === 'completed'
                ? 'Chưa có đơn hàng nào hoàn tất'
                : activeTab === 'cancelled'
                ? 'Không có đơn hàng nào bị hủy'
                : 'Chưa có đơn hàng nào'
            }
            description={
              searchQuery
                ? 'Thử nhập mã đơn hoặc số điện thoại khác.'
                : activeTab === 'all'
                ? 'Đơn hàng sẽ xuất hiện ở đây sau khi khách hàng bấm đặt hàng.'
                : 'Các đơn hàng thuộc trạng thái này sẽ tự động cập nhật khi có thay đổi.'
            }
            action={user.role !== 'admin' ? 'Khám phá bộ sưu tập' : undefined}
            onPress={user.role !== 'admin' ? () => router.push('/') : undefined}
          />
        ) : (
          filteredOrders.map(order => {
            const cfg = STATUS_CONFIG[order.status] || {
              label: order.status,
              bg: '#F3F4F6',
              text: '#374151',
              icon: 'document-text-outline' as IconName,
            };
            const isBusy = busy === order.id;

            return (
              <View
                key={order.id}
                style={[
                  s.card,
                  {
                    marginBottom: 18,
                    padding: 16,
                    borderLeftWidth: 4,
                    borderLeftColor:
                      order.status === 'pending'
                        ? '#F59E0B'
                        : order.status === 'cancelled'
                        ? '#EF4444'
                        : order.status === 'completed'
                        ? '#10B981'
                        : '#3B82F6',
                  },
                ]}
              >
                {/* Header: ID, Date, Status Badge */}
                <View style={[s.between, { alignItems: 'flex-start' }]}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[s.kicker, { color: t.colors.ink, fontSize: 13 }]}>SF · {order.id.slice(0, 8).toUpperCase()}</Text>
                      {order.status === 'pending' && user.role === 'admin' && (
                        <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, fontFamily: t.fonts.bold, color: '#B45309' }}>MỚI</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[s.muted, { fontSize: 11, marginTop: 4 }]}>{dateLabel(order.created_at)}</Text>
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: cfg.bg,
                      borderRadius: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      gap: 4,
                    }}
                  >
                    <Ionicons name={cfg.icon} size={13} color={cfg.text} />
                    <Text style={{ fontFamily: t.fonts.bold, fontSize: 11, color: cfg.text }}>{cfg.label}</Text>
                  </View>
                </View>

                <View style={[s.divider, { marginVertical: 14 }]} />

                {/* Items List */}
                {order.items.map((item, index) => (
                  <View key={`${item.product_id}-${index}`} style={[s.row, { marginBottom: 12 }]}>
                    <Pressable accessibilityRole="button" onPress={() => router.push(`/product/${item.product_id}`)}>
                      <Image
                        source={mediaUrl(item.image_url)}
                        contentFit="cover"
                        style={{ width: 60, height: 75, borderRadius: 6, backgroundColor: t.colors.sand }}
                      />
                    </Pressable>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Pressable onPress={() => router.push(`/product/${item.product_id}`)}>
                        <Text style={[s.text, { fontFamily: t.fonts.medium, fontSize: 13 }]}>{item.name}</Text>
                      </Pressable>
                      <Text style={[s.muted, { fontSize: 11, marginTop: 2 }]}>
                        Phân loại: <Text style={{ color: t.colors.ink }}>{item.color} / {item.size}</Text> · SL:{' '}
                        <Text style={{ fontFamily: t.fonts.bold, color: t.colors.ink }}>{item.quantity}</Text>
                      </Text>
                      <Text style={[s.text, { fontSize: 13, marginTop: 4, fontFamily: t.fonts.bold, color: t.colors.green }]}>
                        {money(item.price * item.quantity)}
                      </Text>
                      {order.status === 'completed' && user.role !== 'admin' && (
                        <Button
                          variant="outline"
                          onPress={() =>
                            router.push({
                              pathname: '/fit-review/[id]',
                              params: { id: String(item.id), orderId: order.id },
                            })
                          }
                          style={{ marginTop: 6, alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10 }}
                        >
                          {item.fit_review ? 'Sửa đánh giá size' : 'Đánh giá size đã mua'}
                        </Button>
                      )}
                    </View>
                  </View>
                ))}

                {/* Shipping & Customer Details */}
                <View
                  style={{
                    backgroundColor: '#FAF8F5',
                    borderWidth: 1,
                    borderColor: '#EDE9E2',
                    padding: 12,
                    borderRadius: 8,
                    marginTop: 4,
                    gap: 4,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="person-outline" size={13} color={t.colors.green} />
                    <Text style={[s.text, { fontSize: 12, fontFamily: t.fonts.medium }]}>
                      {order.customer_name}
                      {order.phone ? (
                        <>
                          {' '}
                          · <Text style={{ fontFamily: t.fonts.bold }}>{order.phone}</Text>
                        </>
                      ) : null}
                    </Text>
                  </View>
                  {order.address ? (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 }}>
                      <Ionicons name="location-outline" size={13} color={t.colors.muted} style={{ marginTop: 2 }} />
                      <Text style={[s.muted, { fontSize: 11, flex: 1 }]}>{order.address}</Text>
                    </View>
                  ) : null}
                  {order.note ? (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 }}>
                      <Ionicons name="chatbox-ellipses-outline" size={13} color={t.colors.muted} style={{ marginTop: 2 }} />
                      <Text style={[s.muted, { fontSize: 11, flex: 1, fontStyle: 'italic' }]}>Lời nhắn: &ldquo;{order.note}&rdquo;</Text>
                    </View>
                  ) : null}
                </View>

                {/* Total amount */}
                <View style={[s.between, { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0ECE4' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.muted, { fontSize: 12 }]}>Phương thức: COD (Thanh toán khi nhận hàng)</Text>
                    {(order.discount_amount ?? 0) > 0 && (
                      <Text style={{ fontSize: 11, color: '#8A642C', fontFamily: t.fonts.medium, marginTop: 2 }}>
                        Đã giảm ưu đãi: -{money(order.discount_amount || 0)}
                        {order.voucher_code ? ` (${order.voucher_code})` : ''}
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.muted, { fontSize: 10 }]}>Tổng thanh toán</Text>
                    <Text style={{ fontFamily: t.fonts.bold, color: t.colors.green, fontSize: 18 }}>{money(order.total)}</Text>
                  </View>
                </View>

                {/* 1-TOUCH ADMIN ACTIONS */}
                {user.role === 'admin' && (
                  <View style={{ marginTop: 14, gap: 8 }}>
                    {order.status === 'pending' && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Button
                          icon="checkmark-outline"
                          loading={isBusy}
                          disabled={busy !== null}
                          onPress={() => void changeStatus(order, 'confirmed')}
                          style={{ flex: 2 }}
                        >
                          ✓ Xác nhận đơn ngay
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy !== null}
                          onPress={() => requestCancelOrder(order)}
                          style={{ flex: 1, borderColor: '#FCA5A5' }}
                        >
                          <Text style={{ color: t.colors.error, fontSize: 12 }}>Hủy đơn</Text>
                        </Button>
                      </View>
                    )}

                    {order.status === 'confirmed' && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Button
                          icon="bicycle-outline"
                          loading={isBusy}
                          disabled={busy !== null}
                          onPress={() => void changeStatus(order, 'shipping')}
                          style={{ flex: 2 }}
                        >
                          🚚 Bắt đầu giao hàng
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy !== null}
                          onPress={() => requestCancelOrder(order)}
                          style={{ flex: 1, borderColor: '#FCA5A5' }}
                        >
                          <Text style={{ color: t.colors.error, fontSize: 12 }}>Hủy đơn</Text>
                        </Button>
                      </View>
                    )}

                    {order.status === 'shipping' && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Button
                          icon="checkmark-done-outline"
                          loading={isBusy}
                          disabled={busy !== null}
                          onPress={() => void changeStatus(order, 'completed')}
                          style={{ flex: 2 }}
                        >
                          ✓ Đã giao thành công
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy !== null}
                          onPress={() => requestCancelOrder(order)}
                          style={{ flex: 1, borderColor: '#FCA5A5' }}
                        >
                          <Text style={{ color: t.colors.error, fontSize: 12 }}>Hủy đơn</Text>
                        </Button>
                      </View>
                    )}
                  </View>
                )}

                {/* Customer Cancel & Reorder actions */}
                {user.role !== 'admin' && order.status === 'pending' && confirmCancelId !== order.id && (
                  <Button
                    variant="outline"
                    disabled={busy !== null}
                    onPress={() => requestCancelOrder(order)}
                    style={{ marginTop: 12 }}
                  >
                    Hủy đơn hàng
                  </Button>
                )}

                {confirmCancelId === order.id && (
                  <View
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor: '#FEF2F2',
                      borderWidth: 1,
                      borderColor: '#FECACA',
                      gap: 10,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: '#991B1B', fontFamily: t.fonts.medium }}>
                      Xác nhận hủy đơn hàng SF · {order.id.slice(0, 8).toUpperCase()}?
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button variant="outline" style={{ flex: 1, minHeight: 42, paddingVertical: 8 }} onPress={() => setConfirmCancelId(null)}>
                        Giữ lại đơn
                      </Button>
                      <Button
                        loading={isBusy}
                        style={{ flex: 1, minHeight: 42, paddingVertical: 8, backgroundColor: t.colors.error }}
                        onPress={() => void changeStatus(order, 'cancelled')}
                      >
                        Đồng ý hủy
                      </Button>
                    </View>
                  </View>
                )}

                {user.role !== 'admin' && (order.status === 'completed' || order.status === 'cancelled') && (
                  <Button variant="secondary" icon="repeat-outline" onPress={() => reorderItems(order)} style={{ marginTop: 12 }}>
                    Mua lại đơn này
                  </Button>
                )}
              </View>
            );
          })
        )}
      </View>
    </Screen>
  );
}
