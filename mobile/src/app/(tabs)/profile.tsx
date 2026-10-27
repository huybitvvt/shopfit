import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Button, CartButton, Header, Screen, s } from '../../components/ui';
import { useStore } from '../../store';
import { theme as t } from '../../theme';

export default function Profile() {
  const { user, logout, favorites, cart } = useStore();
  const links: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle: string; onPress: () => void }[] = [
    { icon: 'server-outline', title: 'Kết nối shop', subtitle: 'Cấu hình backend cho Android và mạng Wi-Fi của bạn', onPress: () => router.push('/connection') },
    { icon: 'shirt-outline', title: 'Đồ tôi mặc vừa', subtitle: 'So sản phẩm shop với món đồ bạn đang mặc thoải mái', onPress: () => router.push(user ? '/wardrobe' : '/auth') },
    { icon: 'body-outline', title: 'Hồ sơ cơ thể', subtitle: 'Chiều cao, cân nặng và các vòng đo để chọn size', onPress: () => router.push(user ? '/body-profile' : '/auth') },
    { icon: 'receipt-outline', title: 'Đơn hàng của tôi', subtitle: 'Theo dõi những thiết kế đang đến với bạn', onPress: () => router.push(user ? '/orders' : '/auth') },
    { icon: 'sparkles-outline', title: 'Nhật ký thử đồ', subtitle: 'Xem lại những lần thay đổi phong cách', onPress: () => router.push('/try-on') },
    { icon: 'heart-outline', title: 'Bộ sưu tập yêu thích', subtitle: `${favorites.length} thiết kế được bạn lưu lại`, onPress: () => router.push('/favorites') },
    { icon: 'bag-outline', title: 'Giỏ hàng', subtitle: `${cart.reduce((sum, item) => sum + item.quantity, 0)} sản phẩm đang chờ bạn`, onPress: () => router.push('/cart') },
  ];
  return <Screen><Header title="Góc nhỏ của bạn" subtitle="YOUR SHOPFIT SPACE" right={<CartButton />} /><View style={{ maxWidth: 720, width: '100%', alignSelf: 'center' }}>
    <View style={{ backgroundColor: t.colors.greenLight, padding: 25, borderRadius: 17, marginBottom: 28 }}><View style={[s.row, { marginBottom: 16 }]}><View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: t.colors.green, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: 'white', fontFamily: t.fonts.serif, fontSize: 29 }}>{user ? user.name.split(' ').slice(-1)[0][0]?.toUpperCase() : 'S'}</Text></View><View style={{ flex: 1 }}><Text style={[s.title, { fontSize: 30, lineHeight: 36 }]}>{user ? `Chào ${user.name.split(' ').slice(-2).join(' ')}` : 'Một phong cách rất bạn.'}</Text><Text style={[s.muted, { fontSize: 11 }]}>{user ? user.role === 'admin' ? 'CHỦ SHOP · SHOPFIT STUDIO' : user.email : 'Tạo tài khoản để bắt đầu câu chuyện riêng.'}</Text></View></View>{!user && <Button onPress={() => router.push('/auth')}>Đăng nhập / Đăng ký</Button>}{user?.role === 'admin' && <Button icon="storefront-outline" onPress={() => router.push('/admin')}>Vào không gian quản lý shop</Button>}</View>
    {links.map(link => <Pressable key={link.title} accessibilityRole="button" onPress={link.onPress} style={({ pressed }) => [s.row, { paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: t.colors.line, opacity: pressed ? 0.6 : 1 }]}><View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEEFE8', alignItems: 'center', justifyContent: 'center' }}><Ionicons name={link.icon} size={21} color={t.colors.green} /></View><View style={{ flex: 1 }}><Text style={{ fontFamily: t.fonts.medium, color: t.colors.ink, fontSize: 14, marginBottom: 4 }}>{link.title}</Text><Text style={[s.muted, { fontSize: 11 }]}>{link.subtitle}</Text></View><Ionicons name="chevron-forward" size={17} color={t.colors.muted} /></Pressable>)}
    {user && <Button variant="outline" icon="log-out-outline" onPress={() => void logout()} style={{ marginTop: 28 }}>Đăng xuất</Button>}
    <View style={{ marginTop: 35, padding: 22, borderWidth: 1, borderColor: t.colors.line, borderRadius: 12 }}><Text style={[s.kicker, { marginBottom: 8 }]}>MỘT CHÚT VỀ SHOPFIT</Text><Text style={s.muted}>Ứng dụng thử trang phục bằng AI dành cho shop thời trang. Ảnh thử giúp bạn hình dung phong cách; hãy xác nhận số đo sản phẩm trước khi chọn size.</Text><Text style={[s.muted, { fontSize: 10, marginTop: 12 }]}>ShopFit v0.1 · Made for your everyday.</Text></View>
  </View></Screen>;
}
