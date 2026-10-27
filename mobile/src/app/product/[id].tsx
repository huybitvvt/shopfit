import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { mediaUrl } from '../../api';
import { Button, CartButton, Empty, Header, IconButton, Screen, s } from '../../components/ui';
import { SizeTable, SizingAdvice } from '../../components/sizing';
import { ProductFitFeedback } from '../../components/fit-feedback';
import { useStore } from '../../store';
import { money, theme as t } from '../../theme';

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductContent key={id} id={id} />;
}
function ProductContent({ id }: { id: string }) {
  const { products, favorites, toggleFavorite, addCart, loading } = useStore();
  const product = products.find(p => p.id === id);
  const [sizeChoice, setSize] = useState('M');
  const [colorChoice, setColor] = useState('');
  const size = product?.sizes.includes(sizeChoice) ? sizeChoice : product?.sizes[0] || 'M';
  const color = product?.colors.some(c => c.name === colorChoice) ? colorChoice : product?.colors[0]?.name || '';
  const [sizeGuide, setSizeGuide] = useState(false);
  const wide = useWindowDimensions().width >= 800;
  if (!product) return <Screen><Header title="Thiết kế" back /><Empty title={loading ? 'Đang tải thiết kế...' : 'Thiết kế chưa sẵn sàng'} description="Quay lại bộ sưu tập để khám phá các mẫu đang có tại shop." action="Về bộ sưu tập" onPress={() => router.replace('/')} /></Screen>;
  const stock = product.variants.find(v => v.size === size && v.color === color)?.stock || 0;
  return <Screen><Header title="The collection" subtitle="SHOPFIT STUDIO" back right={<CartButton />} /><View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 48 : 28 }}>
    <View style={{ width: wide ? '48%' : '100%' }}><Image source={mediaUrl(product.image_url)} contentFit="cover" style={{ width: '100%', aspectRatio: 0.8, borderRadius: 16, backgroundColor: t.colors.sand }} accessibilityLabel={product.name} /><View style={[s.row, { marginTop: 14, gap: 7 }]}><Ionicons name="images-outline" size={15} color={t.colors.muted} /><Text style={[s.muted, { fontSize: 11 }]}>Ảnh mẫu sản phẩm · Màu có thể khác theo màn hình</Text></View></View>
    <View style={{ flex: 1 }}><View style={s.between}><Text style={s.kicker}>{product.tag || product.category.toUpperCase()}</Text><IconButton label="Lưu yêu thích" name={favorites.includes(product.id) ? 'heart' : 'heart-outline'} active={favorites.includes(product.id)} onPress={() => toggleFavorite(product.id)} /></View><Text style={[s.title, { fontSize: 40, lineHeight: 44, marginTop: 8 }]}>{product.name}</Text><View style={[s.row, { marginTop: 18 }]}><Text style={{ fontFamily: t.fonts.bold, fontSize: 23, color: t.colors.green }}>{money(product.price)}</Text>{product.original_price && <Text style={[s.muted, { textDecorationLine: 'line-through' }]}>{money(product.original_price)}</Text>}</View><View style={s.divider} />
      <Text style={s.label}>Màu sắc · <Text style={{ color: t.colors.muted }}>{color}</Text></Text><View style={[s.row, { marginBottom: 22, flexWrap: 'wrap' }]}>{product.colors.map(c => <Pressable key={c.name} accessibilityRole="button" accessibilityLabel={`Màu ${c.name}`} accessibilityState={{ selected: color === c.name }} onPress={() => setColor(c.name)} style={{ minHeight: 48, paddingHorizontal: 10, gap: 8, flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: color === c.name ? t.colors.green : t.colors.line }}><View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.hex, borderWidth: 1, borderColor: '#00000015' }} /><Text style={[s.text, { fontSize: 12 }]}>{c.name}</Text></Pressable>)}</View>
      <View style={s.between}><Text style={s.label}>Kích cỡ · {size}</Text><Pressable accessibilityRole="button" onPress={() => setSizeGuide(true)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontFamily: t.fonts.medium, color: t.colors.green, fontSize: 11, textDecorationLine: 'underline' }}>Hướng dẫn chọn size</Text></Pressable></View><View style={[s.row, { marginBottom: 15 }]}>{product.sizes.map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Size ${value}`} accessibilityState={{ selected: size === value }} onPress={() => setSize(value)} style={{ minWidth: 50, height: 48, borderRadius: 8, borderWidth: 1, borderColor: size === value ? t.colors.green : t.colors.line, backgroundColor: size === value ? t.colors.green : t.colors.paper, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: t.fonts.medium, color: size === value ? 'white' : t.colors.ink }}>{value}</Text></Pressable>)}</View><Text style={[s.muted, { marginBottom: 24, fontSize: 11 }]}>{stock ? `Còn ${stock} sản phẩm cho lựa chọn này` : 'Lựa chọn này đã hết hàng'}</Text>
      <SizingAdvice product={product} color={color} size={size} onSelect={setSize} />
      <Button icon="sparkles-outline" disabled={stock === 0} onPress={() => router.push({ pathname: '/try-on', params: { productId: product.id, color, size } })}>Thử trên ảnh của tôi</Button><Button variant="outline" icon="bag-add-outline" disabled={stock === 0} onPress={() => addCart(product, size, color)} style={{ marginTop: 12 }}>Thêm vào giỏ hàng</Button>
      <View style={s.divider} /><Text style={[s.label, { fontSize: 16 }]}>Một thiết kế, nhiều câu chuyện.</Text><Text style={s.muted}>{product.description}</Text><View style={[s.row, { marginTop: 18, gap: 8 }]}><Ionicons name="leaf-outline" color={t.colors.green} size={17} /><Text style={s.muted}>{product.material}</Text></View>
      <ProductFitFeedback productId={product.id} />
    </View></View>
    <Modal visible={sizeGuide} animationType="slide" onRequestClose={() => setSizeGuide(false)}><Screen><Header title="Bảng số đo sản phẩm" right={<IconButton name="close" label="Đóng hướng dẫn" onPress={() => setSizeGuide(false)} />} /><SizeTable product={product} /><Button onPress={() => setSizeGuide(false)} style={{ marginTop: 24 }}>Đã hiểu</Button></Screen></Modal>
  </Screen>;
}
