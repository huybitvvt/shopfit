import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { mediaUrl, request } from '../api';
import { Button, Empty, ErrorMessage, Field, Header, IconButton, Screen, s } from '../components/ui';
import { finishRequestKey, pendingRequestKey } from '../request-key';
import { useStore } from '../store';
import { money, theme as t } from '../theme';
import type { Order, UserVoucher } from '../types';

export default function Cart() {
  const { cart, products, user, quota, updateCart, clearCart, notify, refresh, refreshQuota } = useStore();
  const [nameInput, setName] = useState<string | null>(null);
  const name = nameInput ?? user?.name ?? '';
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [vouchers, setVouchers] = useState<UserVoucher[]>([]);
  const [voucherCode, setVoucherCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const wide = useWindowDimensions().width >= 850;

  // Load saved shipping address & available vouchers
  useEffect(() => {
    if (!user?.id) return;
    void AsyncStorage.getItem(`shopfit-shipping:${user.id}`).then(saved => {
      if (!saved) return;
      try {
        const data = JSON.parse(saved) as { name?: string; phone?: string; address?: string };
        if (data.name) setName(prev => prev ?? data.name ?? null);
        if (data.phone) setPhone(prev => prev || data.phone || '');
        if (data.address) setAddress(prev => prev || data.address || '');
      } catch {
        // ignore
      }
    });
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setVouchers([]);
        return;
      }
      void request<UserVoucher[]>('/api/user/vouchers')
        .then(setVouchers)
        .catch(() => {});
      void refreshQuota();
    }, [user, refreshQuota])
  );

  // Live line validation against latest products catalog
  const enrichedCart = cart.map(item => {
    const liveProduct = products.find(p => p.id === item.product.id) || item.product;
    const variantStock = liveProduct.variants.find(v => v.size === item.size && v.color === item.color)?.stock ?? 0;
    const unavailable = !liveProduct.active || variantStock < item.quantity;
    return { ...item, product: liveProduct, variantStock, unavailable };
  });

  const hasUnavailable = enrichedCart.some(i => i.unavailable);
  const subtotal = enrichedCart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const vipPercent = user ? quota?.discount_percent || 0 : 0;
  const vipDiscount = Math.round((subtotal * vipPercent) / 100);

  const normalizedCode = voucherCode.trim().toUpperCase();
  const matchedVoucher = vouchers.find(v => v.code.toUpperCase() === normalizedCode);
  const voucherEligible = matchedVoucher ? subtotal >= matchedVoucher.min_order : false;
  const voucherDiscount = matchedVoucher && voucherEligible ? matchedVoucher.discount_amount : 0;
  const totalDiscount = Math.min(subtotal, vipDiscount + voucherDiscount);
  const finalTotal = Math.max(0, subtotal - totalDiscount);

  async function checkout() {
    if (submitting.current) return;
    if (!user) {
      router.push('/auth');
      return;
    }
    if (hasUnavailable) {
      setError('Giỏ hàng có sản phẩm đã hết hàng hoặc vượt tồn kho hiện tại. Vui lòng điều chỉnh lại trước khi đặt.');
      return;
    }
    const cleanDigits = phone.replace(/\D/g, '');
    const validVnPhone = /^(0|84)(3|5|7|8|9)\d{8}$/.test(cleanDigits) || (cleanDigits.length >= 9 && cleanDigits.length <= 13);
    if (name.trim().length < 2 || !validVnPhone || address.trim().length < 10) {
      setError('Nhập họ tên, số điện thoại di động hợp lệ và địa chỉ giao hàng đầy đủ (ít nhất 10 ký tự).');
      return;
    }
    if (normalizedCode && !matchedVoucher) {
      setError('Mã giảm giá không tồn tại trong kho voucher của bạn hoặc đã sử dụng.');
      return;
    }
    if (matchedVoucher && !voucherEligible) {
      setError(`Đơn hàng cần tối thiểu ${money(matchedVoucher.min_order)} để dùng mã ${matchedVoucher.code}.`);
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await AsyncStorage.setItem(
        `shopfit-shipping:${user.id}`,
        JSON.stringify({ name: name.trim(), phone: phone.trim(), address: address.trim() })
      );
      const body = JSON.stringify({
        customer_name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        note: note.trim(),
        voucher_code: normalizedCode || null,
        items: enrichedCart.map(i => ({ product_id: i.product.id, size: i.size, color: i.color, quantity: i.quantity })),
      });
      const scope = `checkout:${user.id}`;
      const key = await pendingRequestKey(scope, body);
      await request<Order>('/api/orders', { method: 'POST', body, headers: { 'X-Idempotency-Key': key } });
      await finishRequestKey(scope);
      clearCart();
      void refresh();
      notify('Đặt hàng thành công. Shop sẽ sớm xác nhận đơn của bạn.');
      router.replace('/orders');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }

  return (
    <Screen onRefresh={refresh}>
      <Header title="Giỏ hàng của bạn" subtitle="GOOD CHOICES, ALL YOURS" back />
      {enrichedCart.length === 0 ? (
        <Empty
          icon="bag-outline"
          title="Dành chỗ cho điều bạn thích"
          description="Khám phá bộ sưu tập, chọn một thiết kế và thử trên ảnh của bạn trước khi quyết định."
          action="Tiếp tục khám phá"
          onPress={() => router.replace('/')}
        />
      ) : (
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 32 }}>
          <View style={{ flex: 1 }}>
            {enrichedCart.map(item => (
              <View
                key={item.key}
                style={{
                  flexDirection: 'row',
                  gap: 16,
                  paddingVertical: 18,
                  borderBottomWidth: 1,
                  borderBottomColor: t.colors.line,
                  opacity: item.unavailable ? 0.78 : 1,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Xem ${item.product.name}`}
                  onPress={() => router.push(`/product/${item.product.id}`)}
                >
                  <Image
                    source={mediaUrl(item.product.image_url)}
                    contentFit="cover"
                    style={{ width: 95, height: 128, borderRadius: 9, backgroundColor: t.colors.sand }}
                  />
                </Pressable>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={{ fontFamily: t.fonts.medium, color: t.colors.ink, lineHeight: 21 }}>{item.product.name}</Text>
                  <Text style={[s.muted, { fontSize: 11 }]}>
                    {item.color} / Size {item.size}
                  </Text>
                  <Text style={{ fontFamily: t.fonts.bold, color: t.colors.green, fontSize: 13, marginTop: 3 }}>
                    {money(item.product.price)}
                  </Text>
                  {!item.product.active ? (
                    <Text style={{ fontSize: 11, fontFamily: t.fonts.bold, color: t.colors.error }}>
                      Sản phẩm tạm ngừng bán · Vui lòng xóa khỏi giỏ
                    </Text>
                  ) : item.variantStock <= 0 ? (
                    <Text style={{ fontSize: 11, fontFamily: t.fonts.bold, color: t.colors.error }}>
                      Size/màu này vừa hết hàng · Vui lòng chọn mẫu khác
                    </Text>
                  ) : item.variantStock < item.quantity ? (
                    <Text style={{ fontSize: 11, fontFamily: t.fonts.bold, color: '#B45309' }}>
                      Kho chỉ còn {item.variantStock} sản phẩm · Hãy giảm số lượng
                    </Text>
                  ) : null}
                  <View style={[s.between, { marginTop: 4 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: t.colors.line, borderRadius: 7 }}>
                      <IconButton
                        name="remove"
                        label={`Giảm số lượng ${item.product.name}`}
                        onPress={() => updateCart(item.key, item.quantity - 1)}
                        style={{ width: 40, height: 44 }}
                      />
                      <Text style={[s.text, { minWidth: 20, textAlign: 'center' }]}>{item.quantity}</Text>
                      <IconButton
                        name="add"
                        label={`Tăng số lượng ${item.product.name}`}
                        onPress={() => updateCart(item.key, item.quantity + 1)}
                        style={{ width: 40, height: 44 }}
                      />
                    </View>
                    <IconButton name="trash-outline" label={`Xóa ${item.product.name} khỏi giỏ`} onPress={() => updateCart(item.key, 0)} />
                  </View>
                </View>
              </View>
            ))}
            <Text style={[s.muted, { marginTop: 18, fontSize: 11 }]}>
              Giá, ưu đãi thành viên và tồn kho thực tế được đối chiếu tự động khi đặt hàng.
            </Text>
          </View>

          <View style={[s.card, { width: wide ? 395 : '100%', alignSelf: 'flex-start', padding: 24 }]}>
            <Text style={[s.title, { fontSize: 30, marginBottom: 20 }]}>Gửi đến bạn</Text>
            <Field label="Người nhận" value={name} onChangeText={setName} autoComplete="name" placeholder="Họ và tên" />
            <Field
              label="Số điện thoại"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              placeholder="09xx xxx xxx"
            />
            <Field
              label="Địa chỉ giao hàng"
              value={address}
              onChangeText={setAddress}
              autoComplete="street-address"
              placeholder="Số nhà, đường, phường/xã, tỉnh/thành"
              multiline
            />
            <Field
              label="Lời nhắn cho shop (tùy chọn)"
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Bạn muốn shop lưu ý điều gì?"
            />

            {/* VOUCHER PICKER & INPUT */}
            {user && (
              <View style={{ marginTop: 4, marginBottom: 6, gap: 8 }}>
                <Text style={s.label}>Mã ưu đãi / Voucher ShopFit</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    accessibilityLabel="Mã giảm giá"
                    value={voucherCode}
                    onChangeText={v => setVoucherCode(v.toUpperCase())}
                    autoCapitalize="characters"
                    placeholder="Nhập hoặc chọn mã bên dưới"
                    placeholderTextColor={t.colors.muted}
                    style={{
                      flex: 1,
                      backgroundColor: t.colors.paper,
                      borderWidth: 1,
                      borderColor: matchedVoucher && voucherEligible ? t.colors.green : t.colors.line,
                      borderRadius: 9,
                      height: 46,
                      paddingHorizontal: 12,
                      fontFamily: t.fonts.medium,
                      fontSize: 13,
                      color: t.colors.ink,
                    }}
                  />
                  {voucherCode.length > 0 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Bỏ mã giảm giá"
                      onPress={() => setVoucherCode('')}
                      style={{
                        paddingHorizontal: 12,
                        justifyContent: 'center',
                        borderRadius: 9,
                        borderWidth: 1,
                        borderColor: t.colors.line,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: t.colors.muted, fontFamily: t.fonts.medium }}>Bỏ chọn</Text>
                    </Pressable>
                  )}
                </View>

                {vouchers.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {vouchers.map(v => {
                      const active = normalizedCode === v.code.toUpperCase();
                      const ok = subtotal >= v.min_order;
                      return (
                        <Pressable
                          key={v.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => setVoucherCode(active ? '' : v.code)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: active ? t.colors.green : '#E5DEC9',
                            backgroundColor: active ? t.colors.greenLight : '#FAF7F0',
                            opacity: ok ? 1 : 0.6,
                          }}
                        >
                          <Text style={{ fontSize: 11, fontFamily: t.fonts.bold, color: active ? t.colors.green : '#8A642C' }}>
                            🎁 {v.code} (-{money(v.discount_amount)})
                          </Text>
                          {!ok && (
                            <Text style={{ fontSize: 9, color: t.colors.muted }}>Đơn từ {money(v.min_order)}</Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            <View style={s.divider} />
            <View style={s.between}>
              <Text style={s.muted}>Tạm tính</Text>
              <Text style={s.text}>{money(subtotal)}</Text>
            </View>
            {vipDiscount > 0 && (
              <View style={[s.between, { marginTop: 10 }]}>
                <Text style={[s.muted, { color: t.colors.green }]}>
                  Đặc quyền {quota?.vip_name} (-{vipPercent}%)
                </Text>
                <Text style={{ fontFamily: t.fonts.medium, color: t.colors.green, fontSize: 13 }}>-{money(vipDiscount)}</Text>
              </View>
            )}
            {voucherDiscount > 0 && (
              <View style={[s.between, { marginTop: 10 }]}>
                <Text style={[s.muted, { color: '#8A642C' }]}>Voucher ({matchedVoucher?.code})</Text>
                <Text style={{ fontFamily: t.fonts.medium, color: '#8A642C', fontSize: 13 }}>-{money(voucherDiscount)}</Text>
              </View>
            )}
            <View style={[s.between, { marginTop: 10 }]}>
              <Text style={s.muted}>Giao hàng tiêu chuẩn</Text>
              <Text style={[s.text, { fontSize: 12 }]}>Miễn phí</Text>
            </View>
            <View style={[s.between, { marginVertical: 22 }]}>
              <Text style={{ fontFamily: t.fonts.bold, color: t.colors.ink }}>Tổng thanh toán</Text>
              <Text style={{ fontFamily: t.fonts.bold, fontSize: 21, color: t.colors.green }}>{money(finalTotal)}</Text>
            </View>
            <View style={[s.row, { backgroundColor: t.colors.greenLight, padding: 12, borderRadius: 8, marginBottom: 18, gap: 9 }]}>
              <Ionicons name="cash-outline" size={19} color={t.colors.green} />
              <Text style={[s.muted, { fontSize: 11, flex: 1 }]}>Thanh toán khi nhận hàng (COD)</Text>
            </View>
            <ErrorMessage message={error} />
            <Button loading={busy} disabled={hasUnavailable} icon="arrow-forward" onPress={() => void checkout()}>
              {user ? 'Đặt hàng' : 'Đăng nhập để đặt hàng'}
            </Button>
          </View>
        </View>
      )}
    </Screen>
  );
}
