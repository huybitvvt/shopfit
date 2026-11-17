import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, Share, Text, useWindowDimensions, View } from 'react-native';
import { mediaUrl } from '../../api';
import { ProductFitFeedback } from '../../components/fit-feedback';
import { SizeTable, SizingAdvice } from '../../components/sizing';
import { Button, CartButton, Empty, Header, IconButton, Screen, ToastOverlay, s } from '../../components/ui';
import { useStore } from '../../store';
import { money, theme as t } from '../../theme';

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductContent key={id} id={id} />;
}

function ProductContent({ id }: { id: string }) {
  const { products, favorites, toggleFavorite, addCart, loading, notify } = useStore();
  const product = products.find(p => p.id === id);
  const [colorChoice, setColor] = useState('');
  const [sizeChoice, setSize] = useState('');
  const [selectedImgIdx, setSelectedImgIdx] = useState(0);
  const [sizeGuide, setSizeGuide] = useState(false);
  const wide = useWindowDimensions().width >= 800;

  const color = product?.colors.some(c => c.name === colorChoice) ? colorChoice : product?.colors[0]?.name || '';
  const defaultSize = useMemo(() => {
    if (!product) return 'M';
    const firstAvailable = product.sizes.find(sz => (product.variants.find(v => v.size === sz && v.color === color)?.stock || 0) > 0);
    return firstAvailable || product.sizes[0] || 'M';
  }, [product, color]);
  const size = sizeChoice && product?.sizes.includes(sizeChoice) ? sizeChoice : defaultSize;

  const allImages = useMemo(() => {
    if (!product) return [];
    const list = [{ label: 'Mặt trước', url: product.image_url }];
    const back = product.back_image_url || product.size_chart?.back_image_url;
    if (back) list.push({ label: 'Mặt sau', url: back });
    const detail = product.detail_image_url || product.size_chart?.detail_image_url;
    if (detail) list.push({ label: 'Chất vải', url: detail });
    return list;
  }, [product]);

  async function shareProduct() {
    if (!product) return;
    const shareUrl =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.href
        : `https://mobile-rose-psi.vercel.app/product/${product.id}`;
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(shareUrl);
      notify('Đã sao chép liên kết thiết kế để chia sẻ.');
    } else {
      try {
        await Share.share({
          message: `${product.name} (${money(product.price)}) — Xem & thử đồ AI trên ShopFit Studio: ${shareUrl}`,
          url: shareUrl,
        });
      } catch {
        // user dismissed share sheet
      }
    }
  }

  if (!product) {
    return (
      <Screen>
        <Header title="Thiết kế" back />
        <Empty
          title={loading ? 'Đang tải thiết kế...' : 'Thiết kế chưa sẵn sàng'}
          description="Quay lại bộ sưu tập để khám phá các mẫu đang có tại shop."
          action="Về bộ sưu tập"
          onPress={() => router.replace('/')}
        />
      </Screen>
    );
  }

  const stock = product.variants.find(v => v.size === size && v.color === color)?.stock || 0;

  return (
    <Screen>
      <Header title="The collection" subtitle="SHOPFIT STUDIO" back right={<CartButton />} />
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 48 : 28 }}>
        <View style={{ width: wide ? '48%' : '100%' }}>
          <Image
            source={mediaUrl(allImages[selectedImgIdx]?.url || product.image_url)}
            contentFit="cover"
            style={{ width: '100%', aspectRatio: 0.8, borderRadius: 16, backgroundColor: t.colors.sand }}
            accessibilityLabel={product.name}
          />
          {allImages.length > 1 && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              {allImages.map((img, idx) => {
                const isSelected = selectedImgIdx === idx;
                return (
                  <Pressable
                    key={img.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setSelectedImgIdx(idx)}
                    style={{
                      borderWidth: 2,
                      borderColor: isSelected ? t.colors.green : '#E5E1D8',
                      borderRadius: 10,
                      overflow: 'hidden',
                      padding: 2,
                      alignItems: 'center',
                      backgroundColor: 'white',
                    }}
                  >
                    <Image
                      source={mediaUrl(img.url)}
                      contentFit="cover"
                      style={{ width: 56, height: 70, borderRadius: 7, backgroundColor: t.colors.sand }}
                    />
                    <Text
                      style={{
                        fontSize: 10,
                        fontFamily: isSelected ? t.fonts.bold : t.fonts.regular,
                        color: isSelected ? t.colors.green : t.colors.muted,
                        marginTop: 3,
                      }}
                    >
                      {img.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View style={[s.row, { marginTop: 14, gap: 7 }]}>
            <Ionicons name="images-outline" size={15} color={t.colors.muted} />
            <Text style={[s.muted, { fontSize: 11 }]}>Ảnh mẫu sản phẩm · Màu có thể khác nhẹ theo màn hình</Text>
          </View>
        </View>

        <View style={{ flex: 1 }}>
          <View style={s.between}>
            <Text style={s.kicker}>{(product.tag || product.category).toUpperCase()}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <IconButton label="Chia sẻ sản phẩm" name="share-social-outline" onPress={() => void shareProduct()} />
              <IconButton
                label="Lưu yêu thích"
                name={favorites.includes(product.id) ? 'heart' : 'heart-outline'}
                active={favorites.includes(product.id)}
                onPress={() => toggleFavorite(product.id)}
              />
            </View>
          </View>

          <Text style={[s.title, { fontSize: 40, lineHeight: 44, marginTop: 8 }]}>{product.name}</Text>

          <View style={[s.row, { marginTop: 18 }]}>
            <Text style={{ fontFamily: t.fonts.bold, fontSize: 23, color: t.colors.green }}>{money(product.price)}</Text>
            {product.original_price && (
              <Text style={[s.muted, { textDecorationLine: 'line-through' }]}>{money(product.original_price)}</Text>
            )}
          </View>

          <View style={s.divider} />

          <Text style={s.label}>
            Màu sắc · <Text style={{ color: t.colors.muted }}>{color}</Text>
          </Text>
          <View style={[s.row, { marginBottom: 22, flexWrap: 'wrap' }]}>
            {product.colors.map(c => (
              <Pressable
                key={c.name}
                accessibilityRole="button"
                accessibilityLabel={`Màu ${c.name}`}
                accessibilityState={{ selected: color === c.name }}
                onPress={() => setColor(c.name)}
                style={{
                  minHeight: 48,
                  paddingHorizontal: 10,
                  gap: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: color === c.name ? t.colors.green : t.colors.line,
                }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.hex, borderWidth: 1, borderColor: '#00000015' }} />
                <Text style={[s.text, { fontSize: 12 }]}>{c.name}</Text>
              </Pressable>
            ))}
          </View>

          <View style={s.between}>
            <Text style={s.label}>Kích cỡ · {size}</Text>
            <Pressable accessibilityRole="button" onPress={() => setSizeGuide(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ fontFamily: t.fonts.medium, color: t.colors.green, fontSize: 11, textDecorationLine: 'underline' }}>
                Hướng dẫn chọn size
              </Text>
            </Pressable>
          </View>

          <View style={[s.row, { marginBottom: 15, flexWrap: 'wrap' }]}>
            {product.sizes.map(value => {
              const sizeStock = product.variants.find(v => v.size === value && v.color === color)?.stock || 0;
              const isSelected = size === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={`Size ${value}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSize(value)}
                  style={{
                    minWidth: 52,
                    height: 48,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderStyle: sizeStock === 0 ? 'dashed' : 'solid',
                    borderColor: isSelected ? t.colors.green : t.colors.line,
                    backgroundColor: isSelected ? t.colors.green : t.colors.paper,
                    opacity: sizeStock === 0 && !isSelected ? 0.45 : 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: t.fonts.medium,
                      color: isSelected ? 'white' : t.colors.ink,
                      textDecorationLine: sizeStock === 0 && !isSelected ? 'line-through' : 'none',
                    }}
                  >
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[s.muted, { marginBottom: 24, fontSize: 11, color: stock === 0 ? t.colors.error : stock <= 3 ? '#B45309' : t.colors.muted }]}>
            {stock === 0
              ? 'Phân loại màu/size này hiện đã hết hàng'
              : stock <= 3
              ? `Sắp hết · Chỉ còn ${stock} sản phẩm cho lựa chọn này`
              : `Còn ${stock} sản phẩm sẵn sàng giao ngay`}
          </Text>

          <SizingAdvice product={product} color={color} size={size} onSelect={setSize} />

          <Button
            icon="sparkles-outline"
            disabled={stock === 0}
            onPress={() => router.push({ pathname: '/try-on', params: { productId: product.id, color, size } })}
          >
            Thử trên ảnh của tôi
          </Button>
          <Button variant="outline" icon="bag-add-outline" disabled={stock === 0} onPress={() => addCart(product, size, color)} style={{ marginTop: 12 }}>
            Thêm vào giỏ hàng
          </Button>

          <View style={s.divider} />
          <Text style={[s.label, { fontSize: 16 }]}>Một thiết kế, nhiều câu chuyện.</Text>
          <Text style={s.muted}>{product.description}</Text>
          <View style={[s.row, { marginTop: 18, gap: 8 }]}>
            <Ionicons name="leaf-outline" color={t.colors.green} size={17} />
            <Text style={s.muted}>{product.material}</Text>
          </View>

          <ProductFitFeedback productId={product.id} />
        </View>
      </View>

      <Modal visible={sizeGuide} animationType="slide" onRequestClose={() => setSizeGuide(false)}>
        <Screen>
          <Header title="Bảng số đo sản phẩm" right={<IconButton name="close" label="Đóng hướng dẫn" onPress={() => setSizeGuide(false)} />} />
          <SizeTable product={product} />
          <Button onPress={() => setSizeGuide(false)} style={{ marginTop: 24 }}>
            Đã hiểu
          </Button>
        </Screen>
        <ToastOverlay />
      </Modal>
    </Screen>
  );
}
