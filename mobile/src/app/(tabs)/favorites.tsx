import { router } from 'expo-router';
import { View, Text, useWindowDimensions } from 'react-native';
import { CartButton, Empty, Header, ProductCard, Screen, s } from '../../components/ui';
import { useStore } from '../../store';

export default function Favorites() {
  const { favorites, products } = useStore();
  const { width } = useWindowDimensions();
  const columns = width >= 1000 ? 4 : width >= 700 ? 3 : 2;
  const cardWidth = (Math.min(width, 1180) - 48 - (columns - 1) * 18) / columns;
  const list = products.filter(p => favorites.includes(p.id));
  return <Screen><Header title="Một chút thương" subtitle="YOUR LITTLE WISHLIST" right={<CartButton />} /><Text style={[s.muted, { marginBottom: 24 }]}>Những thiết kế bạn muốn dành thêm một lần ngắm nhìn.</Text>{list.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>{list.map(p => <ProductCard key={p.id} product={p} width={cardWidth} />)}</View> : <Empty icon="heart-outline" title="Lưu lại điều bạn thích" description="Chạm vào trái tim trên mỗi thiết kế để cất vào bộ sưu tập của riêng bạn." action="Khám phá thiết kế" onPress={() => router.push('/')} />}</Screen>;
}
