import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, Text, View } from 'react-native';
import { API_URL, request } from '../../api';
import { TopUpModal } from '../../components/top-up-modal';
import { Button, CartButton, ErrorMessage, Field, Header, Screen, ToastOverlay, s } from '../../components/ui';
import { useStore } from '../../store';
import { money, theme as t } from '../../theme';
import type { UserVoucher } from '../../types';

export default function Profile() {
  const { user, quota, refreshQuota, logout, updateProfile, changePassword, deleteAccount, favorites, cart, notify } = useStore();
  const [deleting, setDeleting] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [vouchers, setVouchers] = useState<UserVoucher[]>([]);

  // Account settings modal state
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setVouchers([]);
        return;
      }
      void refreshQuota();
      void request<UserVoucher[]>('/api/user/vouchers')
        .then(setVouchers)
        .catch(() => {});
    }, [user, refreshQuota])
  );

  const links: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle: string; onPress: () => void }[] = [
    {
      icon: 'shirt-outline',
      title: 'Đồ tôi mặc vừa',
      subtitle: 'So sản phẩm shop với món đồ bạn đang mặc thoải mái',
      onPress: () => router.push(user ? '/wardrobe' : '/auth'),
    },
    {
      icon: 'body-outline',
      title: 'Hồ sơ cơ thể',
      subtitle: 'Chiều cao, cân nặng và các vòng đo để chọn size',
      onPress: () => router.push(user ? '/body-profile' : '/auth'),
    },
    {
      icon: 'receipt-outline',
      title: 'Đơn hàng của tôi',
      subtitle: 'Theo dõi những thiết kế đang đến với bạn',
      onPress: () => router.push(user ? '/orders' : '/auth'),
    },
    {
      icon: 'sparkles-outline',
      title: 'Nhật ký thử đồ',
      subtitle: 'Xem lại những lần thay đổi phong cách',
      onPress: () => router.push('/try-on'),
    },
    {
      icon: 'heart-outline',
      title: 'Bộ sưu tập yêu thích',
      subtitle: `${favorites.length} thiết kế được bạn lưu lại`,
      onPress: () => router.push('/favorites'),
    },
    {
      icon: 'bag-outline',
      title: 'Giỏ hàng',
      subtitle: `${cart.reduce((sum, item) => sum + item.quantity, 0)} sản phẩm đang chờ bạn`,
      onPress: () => router.push('/cart'),
    },
    ...(user
      ? [
          {
            icon: 'key-outline' as const,
            title: 'Thông tin & Đổi mật khẩu',
            subtitle: 'Cập nhật tên hiển thị hoặc thay đổi mật khẩu bảo mật',
            onPress: () => {
              setEditName(user.name);
              setCurrentPwd('');
              setNewPwd('');
              setAccountError(null);
              setShowAccountModal(true);
            },
          },
        ]
      : []),
    {
      icon: 'shield-checkmark-outline',
      title: 'Chính sách quyền riêng tư',
      subtitle: 'Bảo vệ dữ liệu cá nhân, số đo và ảnh thử AI của bạn',
      onPress: () => void Linking.openURL(`${API_URL}/privacy`),
    },
    {
      icon: 'document-text-outline',
      title: 'Điều khoản dịch vụ',
      subtitle: 'Quy định mua sắm và khuyến cáo hình ảnh mô phỏng AI',
      onPress: () => void Linking.openURL(`${API_URL}/terms`),
    },
  ];

  async function handleSaveAccount() {
    setAccountError(null);
    setSavingAccount(true);
    try {
      if (user && editName.trim().length >= 2 && editName.trim() !== user.name) {
        await updateProfile(editName.trim());
      }
      if (currentPwd || newPwd) {
        if (newPwd.length < 6) {
          setAccountError('Mật khẩu mới cần ít nhất 6 ký tự.');
          setSavingAccount(false);
          return;
        }
        await changePassword(currentPwd, newPwd);
      }
      setShowAccountModal(false);
    } catch (e) {
      setAccountError((e as Error).message);
    } finally {
      setSavingAccount(false);
    }
  }

  function confirmLogout() {
    if (Platform.OS === 'web') {
      if (cart.length === 0 || window.confirm('Bạn muốn đăng xuất khỏi tài khoản hiện tại?')) {
        void logout();
      }
    } else {
      Alert.alert('Đăng xuất', 'Bạn muốn đăng xuất khỏi tài khoản hiện tại?', [
        { text: 'Ở lại', style: 'cancel' },
        { text: 'Đăng xuất', style: 'destructive', onPress: () => void logout() },
      ]);
    }
  }

  async function performDeletion() {
    setDeleting(true);
    try {
      await deleteAccount();
      router.replace('/');
    } catch (e) {
      const msg = (e as Error).message;
      if (Platform.OS === 'web') notify(msg);
      else Alert.alert('Không thể xóa tài khoản', msg);
    } finally {
      setDeleting(false);
    }
  }

  function confirmDeleteAccount() {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        'CẢNH BÁO QUAN TRỌNG:\n\nToàn bộ hồ sơ số đo cơ thể, ảnh thử đồ và dữ liệu tài khoản của bạn sẽ bị xóa vĩnh viễn khỏi hệ thống và không thể khôi phục.\n\nBạn có chắc chắn muốn xóa tài khoản không?'
      );
      if (confirmed) void performDeletion();
    } else {
      Alert.alert(
        'Xác nhận xóa tài khoản',
        'Toàn bộ hồ sơ số đo cơ thể, ảnh thử đồ và dữ liệu tài khoản của bạn sẽ bị xóa vĩnh viễn khỏi máy chủ và không thể khôi phục.\n\nBạn có chắc chắn muốn xóa không?',
        [
          { text: 'Hủy', style: 'cancel' },
          { text: 'Xóa vĩnh viễn', style: 'destructive', onPress: () => void performDeletion() },
        ]
      );
    }
  }

  const avatarChar = user ? user.name.trim().split(/\s+/).pop()?.[0]?.toUpperCase() || 'S' : 'S';

  return (
    <Screen onRefresh={refreshQuota}>
      <Header title="Góc nhỏ của bạn" subtitle="YOUR SHOPFIT SPACE" right={<CartButton />} />
      <View style={{ maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <View style={{ backgroundColor: t.colors.greenLight, padding: 25, borderRadius: 17, marginBottom: 28 }}>
          <View style={[s.row, { marginBottom: 16 }]}>
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: t.colors.green, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: 'white', fontFamily: t.fonts.serif, fontSize: 29 }}>{avatarChar}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { fontSize: 30, lineHeight: 36 }]}>
                {user ? `Chào ${user.name.trim().split(/\s+/).slice(-2).join(' ')}` : 'Một phong cách rất bạn.'}
              </Text>
              <Text style={[s.muted, { fontSize: 11 }]}>
                {user ? (user.role === 'admin' ? 'CHỦ SHOP · SHOPFIT STUDIO' : user.email) : 'Tạo tài khoản để bắt đầu câu chuyện riêng.'}
              </Text>
            </View>
          </View>
          {!user && <Button onPress={() => router.push('/auth')}>Đăng nhập / Đăng ký</Button>}
          {user?.role === 'admin' && (
            <Button icon="storefront-outline" onPress={() => router.push('/admin')}>
              Vào không gian quản lý shop
            </Button>
          )}
        </View>

        {/* VIP Loyalty & Quota Card */}
        {user ? (
          <View
            style={{
              backgroundColor: '#FAF7F2',
              borderWidth: 1,
              borderColor: '#E8E2D5',
              borderRadius: 16,
              padding: 20,
              marginBottom: 24,
              gap: 14,
            }}
          >
            <View style={[s.between]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    backgroundColor:
                      quota?.vip_tier === 'diamond'
                        ? '#E0F2FE'
                        : quota?.vip_tier === 'gold'
                        ? '#FFF9E6'
                        : quota?.vip_tier === 'silver'
                        ? '#F0F4F8'
                        : '#FDF6EE',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Ionicons
                    name={
                      quota?.vip_tier === 'diamond'
                        ? 'diamond'
                        : quota?.vip_tier === 'gold'
                        ? 'ribbon'
                        : quota?.vip_tier === 'silver'
                        ? 'shield-half'
                        : 'shield-outline'
                    }
                    size={16}
                    color={
                      quota?.vip_tier === 'diamond'
                        ? '#0E7490'
                        : quota?.vip_tier === 'gold'
                        ? '#B8860B'
                        : quota?.vip_tier === 'silver'
                        ? '#4A5568'
                        : '#A0522D'
                    }
                  />
                  <Text
                    style={{
                      fontFamily: t.fonts.bold,
                      fontSize: 12,
                      color:
                        quota?.vip_tier === 'diamond'
                          ? '#0E7490'
                          : quota?.vip_tier === 'gold'
                          ? '#B8860B'
                          : quota?.vip_tier === 'silver'
                          ? '#4A5568'
                          : '#A0522D',
                      letterSpacing: 0.8,
                    }}
                  >
                    {quota?.vip_name?.toUpperCase() || 'HẠNG ĐỒNG'}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: t.colors.green, fontFamily: t.fonts.medium }}>
                {quota?.discount_percent ? `Giảm ${quota.discount_percent}% mọi đơn hàng` : 'Tích lũy để nhận ưu đãi'}
              </Text>
            </View>

            {/* Quota Counters */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, backgroundColor: 'white', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#EDE8E0' }}>
                <Text style={[s.muted, { fontSize: 11 }]}>Lượt miễn phí hôm nay</Text>
                <Text style={{ fontSize: 18, fontFamily: t.fonts.bold, color: t.colors.ink, marginTop: 4 }}>
                  {quota?.daily_remaining ?? 1} / {quota?.daily_limit ?? 1}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'white', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#EDE8E0' }}>
                <Text style={[s.muted, { fontSize: 11 }]}>Lượt tích lũy / đã nạp</Text>
                <Text style={{ fontSize: 18, fontFamily: t.fonts.bold, color: t.colors.green, marginTop: 4 }}>
                  {quota?.starter_tryons_left ?? 3} lượt
                </Text>
              </View>
            </View>

            {/* User Vouchers Wallet */}
            {vouchers.length > 0 && (
              <View style={{ backgroundColor: 'white', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5DEC9', gap: 8 }}>
                <Text style={{ fontSize: 12, fontFamily: t.fonts.bold, color: '#8A642C' }}>
                  🎁 Kho Voucher của bạn ({vouchers.length} mã chưa dùng):
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {vouchers.map(v => (
                    <Pressable
                      key={v.id}
                      accessibilityRole="button"
                      onPress={() => {
                        void Clipboard.setStringAsync(v.code);
                        notify(`Đã sao chép mã ${v.code}`);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: '#FAF7F0',
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: '#E5DEC9',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: t.fonts.bold, color: '#8A642C' }}>
                        {v.code} (-{money(v.discount_amount)})
                      </Text>
                      <Ionicons name="copy-outline" size={13} color="#8A642C" />
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Next Tier Upgrade Info */}
            {quota?.next_tier_name && (
              <View style={{ backgroundColor: '#F3EFE6', padding: 12, borderRadius: 10 }}>
                <Text style={{ fontSize: 12, color: '#5C5446', lineHeight: 17 }}>
                  Mua sắm hoàn tất thêm <Text style={{ fontFamily: t.fonts.bold }}>{money(quota.next_spent_needed)}</Text> để thăng hạng{' '}
                  <Text style={{ fontFamily: t.fonts.bold }}>{quota.next_tier_name}</Text> và mở khóa thêm lượt thử AI hàng ngày.
                </Text>
              </View>
            )}

            <Button
              variant="outline"
              icon="sparkles"
              onPress={() => setShowTopUp(true)}
              style={{ borderColor: t.colors.gold, borderWidth: 1 }}
            >
              Nạp thêm lượt thử đồ AI (VietQR)
            </Button>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: '#F3F7F4',
              borderWidth: 1,
              borderColor: '#D4DDD7',
              borderRadius: 14,
              padding: 16,
              marginBottom: 24,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Ionicons name="gift-outline" size={24} color={t.colors.green} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.ink }}>Tặng 3 lượt thử đồ AI miễn phí</Text>
              <Text style={[s.muted, { fontSize: 11, marginTop: 2 }]}>
                Đăng ký tài khoản ngay hôm nay để trải nghiệm thử đồ 4 góc bằng AI.
              </Text>
            </View>
          </View>
        )}

        {links.map(link => (
          <Pressable
            key={link.title}
            accessibilityRole="button"
            onPress={link.onPress}
            style={({ pressed }) => [
              s.row,
              { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: t.colors.line, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEEFE8', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={link.icon} size={21} color={t.colors.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: t.fonts.medium, color: t.colors.ink, fontSize: 14, marginBottom: 4 }}>{link.title}</Text>
              <Text style={[s.muted, { fontSize: 11 }]}>{link.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={t.colors.muted} />
          </Pressable>
        ))}

        {user && (
          <View style={{ marginTop: 28, gap: 12 }}>
            <Button variant="outline" icon="log-out-outline" onPress={confirmLogout}>
              Đăng xuất
            </Button>
            <Button
              variant="outline"
              icon="trash-outline"
              loading={deleting}
              onPress={confirmDeleteAccount}
              style={{ borderColor: '#D9534F' }}
            >
              <Text style={{ color: '#D9534F', fontFamily: t.fonts.medium }}>Xóa tài khoản</Text>
            </Button>
          </View>
        )}

        <View style={{ marginTop: 35, padding: 22, borderWidth: 1, borderColor: t.colors.line, borderRadius: 12 }}>
          <Text style={[s.kicker, { marginBottom: 8 }]}>MỘT CHÚT VỀ SHOPFIT</Text>
          <Text style={s.muted}>
            Ứng dụng thử trang phục bằng AI dành cho shop thời trang. Ảnh thử giúp bạn hình dung phong cách; hãy xác nhận số đo sản phẩm trước khi chọn size.
          </Text>
          <Text style={[s.muted, { fontSize: 10, marginTop: 12 }]}>ShopFit v0.2 · Made for your everyday.</Text>
        </View>
      </View>

      <TopUpModal visible={showTopUp} onClose={() => setShowTopUp(false)} />

      {/* Edit Name & Change Password Modal */}
      <Modal visible={showAccountModal} transparent animationType="fade" onRequestClose={() => setShowAccountModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ width: '100%', maxWidth: 440, backgroundColor: t.colors.paper, borderRadius: 18, padding: 22, gap: 12 }}>
              <View style={s.between}>
                <Text style={{ fontFamily: t.fonts.bold, fontSize: 17, color: t.colors.ink }}>Thông tin & Bảo mật</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={() => setShowAccountModal(false)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={t.colors.muted} />
                </Pressable>
              </View>

              <Field label="Tên hiển thị" value={editName} onChangeText={setEditName} placeholder="Họ và tên của bạn" />

              <View style={{ height: 1, backgroundColor: t.colors.line, marginVertical: 4 }} />
              <Text style={[s.muted, { fontSize: 12 }]}>Đổi mật khẩu (bỏ trống nếu không muốn đổi):</Text>

              <Field
                label="Mật khẩu hiện tại"
                value={currentPwd}
                onChangeText={setCurrentPwd}
                secureTextEntry
                placeholder="Nhập mật khẩu hiện tại"
              />
              <Field
                label="Mật khẩu mới"
                value={newPwd}
                onChangeText={setNewPwd}
                secureTextEntry
                placeholder="Ít nhất 6 ký tự"
              />

              <ErrorMessage message={accountError} />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Button variant="outline" style={{ flex: 1 }} onPress={() => setShowAccountModal(false)}>
                  Hủy
                </Button>
                <Button style={{ flex: 1 }} loading={savingAccount} onPress={() => void handleSaveAccount()}>
                  Lưu thay đổi
                </Button>
              </View>
            </View>
            <ToastOverlay />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
