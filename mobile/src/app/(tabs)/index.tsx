import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Button, CartButton, Empty, ErrorMessage, ProductCard, Screen, SectionHeading, s } from '../../components/ui';
import { useStore } from '../../store';
import { theme as t } from '../../theme';

const categories = ['Tất cả', 'Áo', 'Quần', 'Váy', 'Áo khoác'];
export default function Discover() {
  const { products, loading, error, refresh } = useStore();
  const [category, setCategory] = useState('Tất cả');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(false);
  const { width } = useWindowDimensions();
  const wide = width >= 800;
  const columns = width >= 1000 ? 4 : width >= 700 ? 3 : 2;
  const available = Math.min(width, 1180) - 48;
  const cardWidth = (available - (columns - 1) * 18) / columns;
  const filtered = useMemo(() => {
    let list = products.filter(p => (category === 'Tất cả' || p.category === category) && `${p.name} ${p.material}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
    return sort ? [...list].sort((a, b) => a.price - b.price) : list;
  }, [products, category, query, sort]);
  return <Screen>
    <View style={[s.between, { paddingVertical: 18 }]}><View style={s.row}><View style={{ width: 32, height: 36, borderWidth: 1.5, borderColor: t.colors.green, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: t.fonts.serifItalic, fontSize: 28, color: t.colors.green }}>s</Text></View><View><Text style={{ fontFamily: t.fonts.bold, fontSize: 21, letterSpacing: 4, color: t.colors.ink }}>SHOPFIT</Text><Text style={{ fontFamily: t.fonts.regular, fontSize: 8, letterSpacing: 3.5, color: t.colors.muted, marginTop: 2 }}>WEAR YOUR OWN STORY</Text></View></View><CartButton /></View>
    <View style={{ borderTopWidth: 1, borderTopColor: t.colors.line, paddingTop: 16, paddingBottom: 19 }}><View style={[s.between]}><Text style={[s.muted, { fontSize: 12 }]}>Một chút cảm hứng. Một phiên bản rất bạn.</Text><Text style={[s.kicker, { fontSize: 9, display: wide ? 'flex' : 'none' }]}>THE EVERYDAY COLLECTION · VOL. 01</Text></View></View>
    {!query && category === 'Tất cả' && <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: '#EAE8DE', flexDirection: wide ? 'row' : 'column' }}>
      <View style={{ padding: wide ? 40 : 26, paddingVertical: wide ? 48 : 30, width: wide ? '51%' : '100%', zIndex: 1 }}><View style={[s.row, { gap: 7, marginBottom: 16 }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.colors.green }} /><Text style={s.kicker}>NEW SEASON, NEW YOU</Text></View>
        <Text style={{ fontFamily: t.fonts.serif, fontSize: wide ? 64 : 46, lineHeight: wide ? 64 : 47, color: t.colors.ink }}>Thử một chút.{"\n"}<Text style={{ fontFamily: t.fonts.serifItalic }}>Yêu mình hơn.</Text></Text>
        <Text style={[s.muted, { marginTop: 20, maxWidth: 330, color: '#515C53', lineHeight: 23 }]}>Khám phá những thiết kế dành cho bạn.{"\n"}Thử ngay trên ảnh, tìm thấy phong cách riêng.</Text>
        <Button onPress={() => router.push('/try-on')} icon="sparkles-outline" style={{ alignSelf: 'flex-start', marginTop: 26 }}>Bước vào phòng thử</Button>
        <View style={[s.row, { marginTop: 25, gap: 7 }]}><Ionicons name="checkmark-circle-outline" size={15} color={t.colors.green} /><Text style={{ fontFamily: t.fonts.regular, fontSize: 10, color: t.colors.muted }}>Ảnh của bạn. Phong cách của bạn.</Text></View>
      </View>
      <View style={{ width: wide ? '49%' : '100%', height: wide ? undefined : 265, minHeight: wide ? 430 : undefined, position: 'relative' }}><Image source={require('../../../assets/hero.jpg')} contentFit="cover" contentPosition="center" style={{ width: '100%', height: '100%' }} accessibilityLabel="Bộ sưu tập váy nhẹ nhàng trong ánh nắng" /><View style={{ position: 'absolute', bottom: 20, right: 20, paddingHorizontal: 17, paddingVertical: 12, backgroundColor: '#FAFAF0EB', borderRadius: 6 }}><Text style={{ fontFamily: t.fonts.serifItalic, fontSize: 22, color: t.colors.ink }}>Less, but better.</Text><Text style={{ fontFamily: t.fonts.regular, fontSize: 8, color: t.colors.muted, letterSpacing: 1.8, marginTop: 3 }}>THE SHOPFIT EDIT</Text></View></View>
    </View>}
    <SectionHeading title={query ? 'Tìm điều bạn thích' : 'Chọn một chút khác biệt'} caption="CURATED FOR YOU" />
    <View style={[s.row, { gap: 10, marginBottom: 18 }]}><View style={{ flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center', borderColor: t.colors.line, borderWidth: 1, borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 14, height: 50 }}><Ionicons name="search-outline" size={18} color={t.colors.muted} /><TextInput accessibilityLabel="Tìm sản phẩm" placeholder="Tìm thiết kế, chất liệu..." placeholderTextColor={t.colors.muted} value={query} onChangeText={setQuery} style={{ flex: 1, height: 48, fontFamily: t.fonts.regular, fontSize: 13, color: t.colors.ink, outlineStyle: 'none' } as never} />{query.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Xóa tìm kiếm" onPress={() => setQuery('')} style={{ padding: 10 }}><Ionicons name="close" size={17} color={t.colors.muted} /></Pressable>}</View><Pressable onPress={() => setSort(v => !v)} accessibilityRole="button" accessibilityLabel={sort ? 'Sắp xếp theo nổi bật' : 'Sắp xếp theo giá tăng dần'} accessibilityState={{ selected: sort }} style={{ width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.colors.line, borderRadius: 10, backgroundColor: sort ? t.colors.greenLight : 'white' }}><Ionicons name="options-outline" size={21} color={t.colors.green} /></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingBottom: 22 }}>{categories.map(c => <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: category === c }} onPress={() => setCategory(c)} style={{ minHeight: 44, justifyContent: 'center', borderRadius: 24, paddingHorizontal: 22, backgroundColor: category === c ? t.colors.green : 'transparent', borderWidth: 1, borderColor: category === c ? t.colors.green : t.colors.line }}><Text style={{ fontFamily: t.fonts.medium, fontSize: 12, color: category === c ? '#FFFFFF' : t.colors.muted }}>{c}</Text></Pressable>)}</ScrollView>
    <View style={[s.between, { marginBottom: 18 }]}><Text style={s.muted}>{filtered.length} thiết kế để khám phá</Text><Text style={[s.muted, { fontSize: 11 }]}>{sort ? 'Giá: thấp đến cao' : 'ShopFit tuyển chọn'}</Text></View>
    <ErrorMessage message={error} />{error && <Button variant="outline" onPress={() => void refresh()}>Kết nối lại</Button>}
    {loading && products.length === 0 ? <ActivityIndicator color={t.colors.green} style={{ padding: 40 }} /> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 }}>{filtered.map(p => <ProductCard key={p.id} product={p} width={cardWidth} />)}</View>}
    {!loading && !error && filtered.length === 0 && <Empty icon="search-outline" title="Chưa tìm thấy mẫu phù hợp" description="Thử một từ khóa khác hoặc khám phá tất cả thiết kế của shop." action="Xem tất cả" onPress={() => { setCategory('Tất cả'); setQuery(''); }} />}
    <View style={{ backgroundColor: t.colors.greenLight, borderRadius: 15, padding: 24, marginTop: 8, flexDirection: wide ? 'row' : 'column', gap: 20, alignItems: wide ? 'center' : 'flex-start' }}><View style={{ flex: 1 }}><Text style={s.kicker}>YOUR PRIVATE FITTING ROOM</Text><Text style={[s.title, { fontSize: 30, lineHeight: 34, marginVertical: 7 }]}>Ướm thử trước khi yêu.</Text><Text style={s.muted}>Chọn ảnh của bạn, chọn thiết kế và để AI giúp bạn hình dung.</Text></View><Button variant="outline" icon="arrow-forward" onPress={() => router.push('/try-on')}>Khám phá phòng thử</Button></View>
    <View style={{ alignItems: 'center', paddingTop: 38, paddingBottom: 8, gap: 7 }}><Text style={{ fontFamily: t.fonts.serifItalic, fontSize: 26, color: t.colors.green }}>Made for your everyday.</Text><Text style={{ fontFamily: t.fonts.regular, fontSize: 9, letterSpacing: 2, color: t.colors.muted }}>SHOPFIT STUDIO · VIETNAM</Text></View>
  </Screen>;
}
