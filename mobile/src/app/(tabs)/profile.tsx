import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import { API_URL } from '../../api';
import { Button, CartButton, Header, Screen, s } from '../../components/ui';
import { TopUpModal } from '../../components/top-up-modal';
import { useStore } from '../../store';
import { money, theme as t } from '../../theme';

export default function Profile() {
  const { user, quota, logout, deleteAccount, favorites, cart } = useStore();
  const [deleting, setDeleting] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);

  const links: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle: string; onPress: () => void }[] = [
    { icon: 'shirt-outline', title: 'Đồ tôi mặc vừa', subtitle: 'So sản phẩm shop với món đồ bạn đang mặc thoải mái', onPress: () => router.push(user ? '/wardrobe' : '/auth') },
    { icon: 'body-outline', title: 'Hồ sơ cơ thể', subtitle: 'Chiều cao, cân nặng và các vòng đo để chọn size', onPress: () => router.push(user ? '/body-profile' : '/auth') },
    { icon: 'receipt-outline', title: 'Đơn hàng của tôi', subtitle: 'Theo dõi những thiết kế đang đến với bạn', onPress: () => router.push(user ? '/orders' : '/auth') },
    { icon: 'sparkles-outline', title: 'Nhật ký thử đồ', subtitle: 'Xem lại những lần thay đổi phong cách', onPress: () => router.push('/try-on') },
    { icon: 'heart-outline', title: 'Bộ sưu tập yêu thích', subtitle: `${favorites.length} thiết kế được bạn lưu lại`, onPress: () => router.push('/favorites') },
    { icon: 'bag-outline', title: 'Giỏ hàng', subtitle: `${cart.reduce((sum, item) => sum + item.quantity, 0)} sản phẩm đang chờ bạn`, onPress: () => router.push('/cart') },
    { icon: 'shield-checkmark-outline', title: 'Chính sách quyền riêng tư', subtitle: 'Bảo vệ dữ liệu cá nhân, số đo và ảnh thử AI của bạn', onPress: () => void Linking.openURL(`${API_URL}/privacy`) },
    { icon: 'document-text-outline', title: 'Điều khoản dịch vụ', subtitle: 'Quy định mua sắm và khuyến cáo hình ảnh mô phỏng AI', onPress: () => void Linking.openURL(`${API_URL}/terms`) },
    { icon: 'server-outline', title: 'Kết nối shop', subtitle: 'Cấu hình backend cho Android và mạng Wi-Fi của bạn', onPress: () => router.push('/connection') },
  ];

  async function performDeletion() {
    setDeleting(true);
    try {
      await deleteAccount();
      router.replace('/');
    } catch (e) {
      Alert.alert('Không thể xóa tài khoản', (e as Error).message);
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
          {
            text: 'Xóa vĩnh viễn',
            style: 'destructive',
            onPress: () => void performDeletion(),
          },
        ]
      );
    }
  }

  return (
    <Screen>
      <Header title="Góc nhỏ của bạn" subtitle="YOUR SHOPFIT SPACE" right={<CartButton />} />
      <View style={{ maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <View style={{ backgroundColor: t.colors.greenLight, padding: 25, borderRadius: 17, marginBottom: 28 }}>
          <View style={[s.row, { marginBottom: 16 }]}>
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: t.colors.green, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: 'white', fontFamily: t.fonts.serif, fontSize: 29 }}>
                {user ? user.name.split(' ').slice(-1)[0][0]?.toUpperCase() : 'S'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { fontSize: 30, lineHeight: 36 }]}>
                {user ? `Chào ${user.name.split(' ').slice(-2).join(' ')}` : 'Một phong cách rất bạn.'}
              </Text>
              <Text style={[s.muted, { fontSize: 11 }]}>
                {user ? (user.role === 'admin' ? 'CHỦ SHOP · SHOPFIT STUDIO' : user.email) : 'Tạo tài khoản để bắt đầu câu chuyện riêng.'}
              </Text>
            </View>
          </View>
          {!user && <Button onPress={() => router.push('/auth')}>Đăng nhập / Đăng ký</Button>}
          {user?.role === 'admin' && <Button icon="storefront-outline" onPress={() => router.push('/admin')}>Vào không gian quản lý shop</Button>}
        </View>

        {/* VIP Loyalty & Quota Card */}
        {user ? (
          <View style={{
            backgroundColor: '#FAF7F2',
            borderWidth: 1,
            borderColor: '#E8E2D5',
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
            gap: 14,
          }}>
            <View style={[s.between]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{
                  backgroundColor: quota?.vip_tier === 'diamond' ? '#E0F2FE' : quota?.vip_tier === 'gold' ? '#FFF9E6' : quota?.vip_tier === 'silver' ? '#F0F4F8' : '#FDF6EE',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                }}>
                  <Ionicons
                    name={quota?.vip_tier === 'diamond' ? 'diamond' : quota?.vip_tier === 'gold' ? 'ribbon' : quota?.vip_tier === 'silver' ? 'shield-half' : 'shield-outline'}
                    size={16}
                    color={quota?.vip_tier === 'diamond' ? '#0E7490' : quota?.vip_tier === 'gold' ? '#B8860B' : quota?.vip_tier === 'silver' ? '#4A5568' : '#A0522D'}
                  />
                  <Text style={{
                    fontFamily: t.fonts.bold,
                    fontSize: 12,
                    color: quota?.vip_tier === 'diamond' ? '#0E7490' : quota?.vip_tier === 'gold' ? '#B8860B' : quota?.vip_tier === 'silver' ? '#4A5568' : '#A0522D',
                    letterSpacing: 0.8,
                  }}>
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
                <Text style={[s.muted, { fontSize: 11 }]}>Lượt thử hôm nay</Text>
                <Text style={{ fontSize: 18, fontFamily: t.fonts.bold, color: t.colors.ink, marginTop: 4 }}>
                  {quota?.daily_remaining ?? 1} / {quota?.daily_limit ?? 1}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'white', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#EDE8E0' }}>
                <Text style={[s.muted, { fontSize: 11 }]}>Lượt chào mừng</Text>
                <Text style={{ fontSize: 18, fontFamily: t.fonts.bold, color: t.colors.green, marginTop: 4 }}>
                  {quota?.starter_tryons_left ?? 3} lượt
                </Text>
              </View>
            </View>

            {/* Next Tier Upgrade Info */}
            {quota?.next_tier_name && (
              <View style={{ backgroundColor: '#F3EFE6', padding: 12, borderRadius: 10 }}>
                <Text style={{ fontSize: 12, color: '#5C5446', lineHeight: 17 }}>
                  Mua sắm thêm <Text style={{ fontFamily: t.fonts.bold }}>{money(quota.next_spent_needed)}</Text> để thăng hạng <Text style={{ fontFamily: t.fonts.bold }}>{quota.next_tier_name}</Text> và mở khóa thêm lượt thử AI hàng ngày.
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
          <View style={{
            backgroundColor: '#F3F7F4',
            borderWidth: 1,
            borderColor: '#D4DDD7',
            borderRadius: 14,
            padding: 16,
            marginBottom: 24,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}>
            <Ionicons name="gift-outline" size={24} color={t.colors.green} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.ink }}>Tặng 3 lượt thử đồ AI miễn phí</Text>
              <Text style={[s.muted, { fontSize: 11, marginTop: 2 }]}>Đăng ký tài khoản ngay hôm nay để trải nghiệm thử đồ 4 góc bằng AI.</Text>
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
              <Text style={{ fontFamily: t.fonts.medium, color: t.colors.ink, fontSize: 14, marginBottom: 4 }}>
                {link.title}
              </Text>
              <Text style={[s.muted, { fontSize: 11 }]}>{link.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={t.colors.muted} />
          </Pressable>
        ))}

        {user && (
          <View style={{ marginTop: 28, gap: 12 }}>
            <Button variant="outline" icon="log-out-outline" onPress={() => void logout()}>
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
          <Text style={[s.muted, { fontSize: 10, marginTop: 12 }]}>
            ShopFit v0.1 · Made for your everyday.
          </Text>
        </View>
      </View>
      <TopUpModal visible={showTopUp} onClose={() => setShowTopUp(false)} />
    </Screen>
  );
}
