import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { mediaUrl, photoForm, request } from '../api';
import { Button, Empty, ErrorMessage, Field, Header, IconButton, Screen, s } from '../components/ui';
import { useStore } from '../store';
import { money, theme as t } from '../theme';
import type { PickedPhoto, Product, Variant } from '../types';

type Summary = {
  products: number;
  pending_orders: number;
  revenue: number;
  tryons: number;
  conversion_rate?: number;
  low_stock_products?: number;
};

interface CategoryOption {
  name: string;
  tryon_category: 'tops' | 'bottoms' | 'one-pieces';
}

const DEFAULT_CATEGORIES: CategoryOption[] = [
  { name: 'Áo', tryon_category: 'tops' },
  { name: 'Quần', tryon_category: 'bottoms' },
  { name: 'Váy', tryon_category: 'one-pieces' },
  { name: 'Áo khoác', tryon_category: 'tops' },
  { name: 'Sơ mi', tryon_category: 'tops' },
  { name: 'Chân váy', tryon_category: 'bottoms' },
  { name: 'Đầm liền', tryon_category: 'one-pieces' },
  { name: 'Set bộ', tryon_category: 'one-pieces' },
];

const POPULAR_COLORS = [
  { name: 'Trắng', hex: '#FFFFFF' },
  { name: 'Đen', hex: '#1C2421' },
  { name: 'Xám ghi', hex: '#9CA3AF' },
  { name: 'Be sữa', hex: '#EEECE5' },
  { name: 'Nâu bò', hex: '#854D0E' },
  { name: 'Xanh Navy', hex: '#1E3A8A' },
  { name: 'Xanh rêu', hex: '#344E40' },
  { name: 'Đỏ đô', hex: '#991B1B' },
  { name: 'Vàng pastel', hex: '#F59E0B' },
  { name: 'Hồng phấn', hex: '#F472B6' },
  { name: 'Xanh dương nhạt', hex: '#93C5FD' },
];

const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];

export default function Admin() {
  const { user, refresh, notify } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'HIDDEN' | 'LOW_STOCK'>('ALL');

  // Form State
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Áo');
  const [customCategories, setCustomCategories] = useState<CategoryOption[]>([]);
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatTryon, setNewCatTryon] = useState<'tops' | 'bottoms' | 'one-pieces'>('tops');

  const [description, setDescription] = useState('');
  const [material, setMaterial] = useState('Cotton');

  // Colors
  const [colorName, setColorName] = useState('Trắng');
  const [colorHex, setColorHex] = useState('#FFFFFF');
  const [showHexInput, setShowHexInput] = useState(false);

  // Per-size inventory
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['S', 'M', 'L', 'XL']);
  const [sizeStocks, setSizeStocks] = useState<Record<string, string>>({
    S: '15',
    M: '30',
    L: '25',
    XL: '10',
  });
  const [batchStock, setBatchStock] = useState('');

  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [busy, setBusy] = useState(false);
  const wide = useWindowDimensions().width >= 750;

  const load = useCallback(async () => {
    if (user?.role !== 'admin') { setLoading(false); return; }
    try {
      const [p, stats] = await Promise.all([
        request<Product[]>('/api/admin/products'),
        request<Summary>('/api/admin/summary'),
      ]);
      setProducts(p);
      setSummary(stats);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Combine default categories with custom categories and any unique categories from existing products
  const allCategories = useMemo(() => {
    const map = new Map<string, CategoryOption>();
    for (const c of DEFAULT_CATEGORIES) map.set(c.name, c);
    for (const c of customCategories) map.set(c.name, c);
    for (const p of products) {
      if (p.category && !map.has(p.category)) {
        map.set(p.category, { name: p.category, tryon_category: p.tryon_category });
      }
    }
    return Array.from(map.values());
  }, [customCategories, products]);

  // Filtered Products list
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.category.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filterCategory !== 'ALL' && p.category !== filterCategory) {
        return false;
      }
      if (filterStatus === 'ACTIVE' && !p.active) return false;
      if (filterStatus === 'HIDDEN' && p.active) return false;
      if (filterStatus === 'LOW_STOCK') {
        const hasLow = p.variants.some(v => v.stock <= 3);
        if (!hasLow) return false;
      }
      return true;
    });
  }, [products, searchQuery, filterCategory, filterStatus]);

  function openForm(product?: Product) {
    setEditing(product || null);
    setName(product?.name || '');
    setPrice(product ? String(product.price) : '');
    setCategory(product?.category || 'Áo');
    setDescription('');
    setPhoto(null);
    setMaterial('Cotton');
    setColorName('Trắng');
    setColorHex('#FFFFFF');
    setShowHexInput(false);
    setSelectedSizes(['S', 'M', 'L', 'XL']);
    setSizeStocks({ S: '15', M: '30', L: '25', XL: '10' });
    setBatchStock('');
    setVariants(product?.variants.map(v => ({ ...v })) || []);
    setFormError(null);
    setShowForm(true);
  }

  async function pick() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (!result.canceled) setPhoto(result.assets[0]);
    } catch {
      setFormError('Không mở được thư viện ảnh.');
    }
  }

  function handleColorSelect(item: { name: string; hex: string }) {
    setColorName(item.name);
    setColorHex(item.hex);
  }

  function handleColorNameChange(text: string) {
    setColorName(text);
    const matched = POPULAR_COLORS.find(c => c.name.toLowerCase() === text.trim().toLowerCase());
    if (matched) {
      setColorHex(matched.hex);
    }
  }

  function toggleSize(sz: string) {
    if (selectedSizes.includes(sz)) {
      if (selectedSizes.length <= 1) {
        setFormError('Sản phẩm cần có ít nhất 1 size.');
        return;
      }
      setSelectedSizes(prev => prev.filter(s => s !== sz));
    } else {
      setSelectedSizes(prev => [...prev, sz]);
      if (!sizeStocks[sz]) {
        setSizeStocks(prev => ({ ...prev, [sz]: '15' }));
      }
    }
  }

  function applyBatchStock() {
    if (!batchStock.trim()) return;
    const num = batchStock.replace(/\D/g, '') || '0';
    const updated: Record<string, string> = {};
    for (const s of selectedSizes) {
      updated[s] = num;
    }
    setSizeStocks(prev => ({ ...prev, ...updated }));
    notify(`Đã điền ${num} cái cho tất cả ${selectedSizes.length} size.`);
  }

  function handleCreateCategory() {
    const trimmed = newCatName.trim();
    if (trimmed.length < 2) {
      setFormError('Tên danh mục cần ít nhất 2 ký tự.');
      return;
    }
    const exists = allCategories.some(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      setCustomCategories(prev => [...prev, { name: trimmed, tryon_category: newCatTryon }]);
    }
    setCategory(trimmed);
    setShowAddCatModal(false);
    setNewCatName('');
    notify(`Đã chọn danh mục "${trimmed}".`);
  }

  async function save() {
    if (name.trim().length < 2 || !Number.isInteger(Number(price)) || Number(price) <= 0) {
      setFormError('Nhập tên sản phẩm và giá bán nguyên dương hợp lệ.');
      return;
    }
    if (!editing) {
      if (!photo) { setFormError('Vui lòng chọn ảnh đại diện sản phẩm.'); return; }
      if (description.trim().length < 10) { setFormError('Nhập mô tả sản phẩm ít nhất 10 ký tự.'); return; }
      if (!colorName.trim() || !/^#[0-9A-Fa-f]{6}$/.test(colorHex)) { setFormError('Tên màu hoặc mã màu HEX không hợp lệ.'); return; }
      if (selectedSizes.length === 0) { setFormError('Vui lòng chọn ít nhất 1 size.'); return; }
    }

    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await request(`/api/admin/products/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: name.trim(), price: Number(price), variants }),
        });
      } else {
        const form = await photoForm(photo!, 'file');
        const upload = await request<{ url: string }>('/api/admin/upload', { method: 'POST', body: form });

        const matchedCat = allCategories.find(c => c.name === category);
        const tryon_cat = matchedCat?.tryon_category || (
          category.toLowerCase().includes('quần') ? 'bottoms' :
          category.toLowerCase().includes('váy') || category.toLowerCase().includes('đầm') ? 'one-pieces' : 'tops'
        );

        const activeSizes = selectedSizes.filter(sz => !!sizeStocks[sz]);
        const variant_stocks = activeSizes.map(sz => ({
          size: sz,
          color: colorName.trim(),
          stock: Math.max(0, Number(sizeStocks[sz]) || 0),
        }));
        const totalStock = variant_stocks.reduce((acc, v) => acc + v.stock, 0);

        await request('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            price: Number(price),
            category,
            tryon_category: tryon_cat,
            image_url: upload.url,
            material,
            description: description.trim(),
            colors: [{ name: colorName.trim(), hex: colorHex }],
            sizes: activeSizes,
            stock_per_variant: Math.max(1, Math.round(totalStock / Math.max(1, activeSizes.length))),
            variant_stocks,
            tag: 'MỚI',
            featured: false,
          }),
        });
      }
      setShowForm(false);
      await Promise.all([load(), refresh()]);
      notify(editing ? 'Đã cập nhật sản phẩm.' : 'Đã thêm thiết kế mới vào shop.');
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(product: Product) {
    setBusy(true);
    try {
      await request(`/api/admin/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ active: !product.active }) });
      await Promise.all([load(), refresh()]);
      notify(product.active ? `Đã ẩn "${product.name}".` : `Đã mở bán lại "${product.name}".`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (user?.role !== 'admin') {
    return (
      <Screen>
        <Header title="Quản lý shop" back />
        <Empty
          icon="storefront-outline"
          title="Không gian của chủ shop"
          description="Đăng nhập bằng tài khoản chủ shop để quản lý sản phẩm và đơn hàng."
          action="Đăng nhập"
          onPress={() => router.push('/auth')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="ShopFit Studio"
        subtitle="SHOP MANAGEMENT"
        back
        right={<IconButton name="refresh-outline" label="Làm mới thống kê" onPress={() => void load()} />}
      />
      <ErrorMessage message={error} />

      {/* METRIC CARDS / DASHBOARD */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {/* 1. Thiết kế đang bán */}
        <View style={[s.card, { width: wide ? '18.5%' : '47.5%', padding: 16 }]}>
          <Ionicons name="shirt-outline" size={20} color={t.colors.green} />
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 24, color: t.colors.ink, marginTop: 12, marginBottom: 4 }}>
            {summary?.products ?? 0}
          </Text>
          <Text style={[s.muted, { fontSize: 11 }]}>Thiết kế đang bán</Text>
        </View>

        {/* 2. Đơn chờ xác nhận */}
        <View style={[s.card, {
          width: wide ? '18.5%' : '47.5%',
          padding: 16,
          borderColor: (summary?.pending_orders ?? 0) > 0 ? t.colors.gold : t.colors.line,
          backgroundColor: (summary?.pending_orders ?? 0) > 0 ? '#FFFDF5' : 'white',
        }]}>
          <Ionicons name="receipt-outline" size={20} color={(summary?.pending_orders ?? 0) > 0 ? '#B45309' : t.colors.green} />
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 24, color: (summary?.pending_orders ?? 0) > 0 ? '#B45309' : t.colors.ink, marginTop: 12, marginBottom: 4 }}>
            {summary?.pending_orders ?? 0}
          </Text>
          <Text style={[s.muted, { fontSize: 11 }]}>Đơn chờ xác nhận</Text>
        </View>

        {/* 3. Doanh thu hoàn tất */}
        <View style={[s.card, { width: wide ? '18.5%' : '47.5%', padding: 16 }]}>
          <Ionicons name="wallet-outline" size={20} color={t.colors.green} />
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 20, color: t.colors.ink, marginTop: 14, marginBottom: 4 }}>
            {money(summary?.revenue ?? 0)}
          </Text>
          <Text style={[s.muted, { fontSize: 11 }]}>Doanh thu hoàn tất</Text>
        </View>

        {/* 4. Lượt thử AI */}
        <View style={[s.card, { width: wide ? '18.5%' : '47.5%', padding: 16 }]}>
          <Ionicons name="sparkles-outline" size={20} color={t.colors.green} />
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 24, color: t.colors.ink, marginTop: 12, marginBottom: 4 }}>
            {summary?.tryons ?? 0}
          </Text>
          <Text style={[s.muted, { fontSize: 11 }]}>Lượt thử thành công</Text>
        </View>

        {/* 5. Tỷ lệ Thử ➔ Mua (Try-to-Buy Rate) */}
        <View style={[s.card, { width: wide ? '18.5%' : '100%', padding: 16, backgroundColor: '#F3F7F4' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Ionicons name="trending-up-outline" size={20} color={t.colors.green} />
            <Text style={{ fontSize: 9, fontFamily: t.fonts.bold, color: t.colors.green, backgroundColor: '#D7E5DC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              AI RETAIL
            </Text>
          </View>
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 24, color: t.colors.green, marginTop: 12, marginBottom: 4 }}>
            {summary?.conversion_rate ?? 0}%
          </Text>
          <Text style={[s.muted, { fontSize: 11 }]}>Tỷ lệ mua sau thử</Text>
        </View>
      </View>

      {/* QUICK SHORTCUT BUTTONS */}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10, marginBottom: 24 }}>
        <Button
          icon="receipt-outline"
          variant="secondary"
          onPress={() => router.push('/orders')}
          style={{ flex: 1 }}
        >
          {`Xem và xử lý đơn hàng ${summary?.pending_orders ? `(${summary.pending_orders} đơn mới)` : ''}`}
        </Button>
        <Button
          icon="analytics-outline"
          variant="outline"
          onPress={() => router.push('/fit-insights')}
          style={{ flex: 1 }}
        >
          Chất lượng độ vừa & hạn mức AI
        </Button>
      </View>

      {/* PRODUCT LIST HEADER & ADD BUTTON */}
      <View style={[s.between, { marginTop: 16, marginBottom: 14 }]}>
        <View>
          <Text style={[s.title, { fontSize: 28 }]}>Các thiết kế</Text>
          <Text style={[s.muted, { fontSize: 12, marginTop: 2 }]}>
            {filteredProducts.length} / {products.length} mẫu hiển thị
          </Text>
        </View>
        <Button icon="add" onPress={() => openForm()}>Thêm mẫu mới</Button>
      </View>

      {/* SEARCH & FILTER CONTROLS */}
      <View style={{
        backgroundColor: '#FAF8F5',
        borderWidth: 1,
        borderColor: '#EAE6DD',
        borderRadius: 12,
        padding: 12,
        marginBottom: 18,
        gap: 10,
      }}>
        {/* Search Bar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'white',
          borderWidth: 1,
          borderColor: t.colors.line,
          borderRadius: 8,
          paddingHorizontal: 12,
          height: 42,
        }}>
          <Ionicons name="search-outline" size={18} color={t.colors.muted} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Tìm theo tên thiết kế, chất liệu, danh mục..."
            placeholderTextColor={t.colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={{ flex: 1, fontSize: 13, color: t.colors.ink, fontFamily: t.fonts.regular }}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={t.colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Filter Pills */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={[s.muted, { fontSize: 11, marginRight: 4 }]}>Danh mục:</Text>
          <Pressable
            onPress={() => setFilterCategory('ALL')}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: filterCategory === 'ALL' ? t.colors.green : '#EEECE8',
            }}
          >
            <Text style={{ fontSize: 11, color: filterCategory === 'ALL' ? 'white' : t.colors.ink, fontFamily: t.fonts.medium }}>Tất cả</Text>
          </Pressable>
          {allCategories.map(c => (
            <Pressable
              key={c.name}
              onPress={() => setFilterCategory(c.name)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: filterCategory === c.name ? t.colors.green : '#EEECE8',
              }}
            >
              <Text style={{ fontSize: 11, color: filterCategory === c.name ? 'white' : t.colors.ink, fontFamily: t.fonts.medium }}>{c.name}</Text>
            </Pressable>
          ))}
        </View>

        {/* Status Pills */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={[s.muted, { fontSize: 11, marginRight: 4 }]}>Trạng thái:</Text>
          {([
            ['ALL', 'Tất cả'],
            ['ACTIVE', 'Đang bán'],
            ['LOW_STOCK', '⚠️ Sắp hết'],
            ['HIDDEN', 'Đã ẩn'],
          ] as const).map(([st, label]) => (
            <Pressable
              key={st}
              onPress={() => setFilterStatus(st)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: filterStatus === st ? t.colors.green : '#EEECE8',
              }}
            >
              <Text style={{ fontSize: 11, color: filterStatus === st ? 'white' : t.colors.ink, fontFamily: t.fonts.medium }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* PRODUCT LIST */}
      {loading ? (
        <ActivityIndicator color={t.colors.green} style={{ padding: 40 }} />
      ) : filteredProducts.length === 0 ? (
        <View style={{ padding: 30, alignItems: 'center' }}>
          <Text style={s.muted}>Không tìm thấy sản phẩm phù hợp bộ lọc.</Text>
        </View>
      ) : (
        filteredProducts.map(product => {
          const hasLowStock = product.variants.some(v => v.stock <= 3 && v.stock > 0);
          const isOutOfStock = product.stock <= 0;
          return (
            <View
              key={product.id}
              style={[
                s.card,
                {
                  flexDirection: 'row',
                  gap: 16,
                  marginBottom: 14,
                  padding: 15,
                  opacity: product.active ? 1 : 0.6,
                  borderColor: isOutOfStock ? '#FCA5A5' : hasLowStock ? '#FCD34D' : t.colors.line,
                },
              ]}
            >
              <Image
                source={mediaUrl(product.image_url)}
                contentFit="cover"
                style={{ width: 80, height: 110, borderRadius: 8, backgroundColor: t.colors.sand }}
              />
              <View style={{ flex: 1 }}>
                <View style={[s.between]}>
                  <Text style={[s.text, { fontFamily: t.fonts.medium, fontSize: 15, flex: 1 }]}>
                    {product.name}
                  </Text>
                  {/* Badges */}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {isOutOfStock ? (
                      <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ color: '#B91C1C', fontSize: 10, fontFamily: t.fonts.bold }}>HẾT HÀNG</Text>
                      </View>
                    ) : hasLowStock ? (
                      <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ color: '#B45309', fontSize: 10, fontFamily: t.fonts.bold }}>⚠️ SẮP HẾT</Text>
                      </View>
                    ) : null}
                    <View style={{
                      backgroundColor: product.active ? t.colors.greenLight : '#F3F4F6',
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 4,
                    }}>
                      <Text style={{
                        color: product.active ? t.colors.green : t.colors.muted,
                        fontSize: 9,
                        fontFamily: t.fonts.bold,
                      }}>
                        {product.active ? 'ĐANG BÁN' : 'ĐÃ ẨN'}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={[s.muted, { fontSize: 12, marginTop: 4 }]}>
                  {money(product.price)} · Tổng tồn: <Text style={{ fontFamily: t.fonts.bold, color: t.colors.ink }}>{product.stock}</Text> ({product.category})
                </Text>

                {/* Per-size inventory preview */}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {product.variants.map(v => (
                    <Text
                      key={`${v.size}-${v.color}`}
                      style={{
                        fontSize: 10,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: v.stock <= 3 ? '#F87171' : '#E5E7EB',
                        backgroundColor: v.stock <= 3 ? '#FEF2F2' : '#F9FAFB',
                        color: v.stock <= 3 ? '#DC2626' : t.colors.muted,
                        fontFamily: t.fonts.medium,
                      }}
                    >
                      {v.size}: {v.stock}
                    </Text>
                  ))}
                </View>

                {/* Action Row */}
                <View style={[s.row, { flexWrap: 'wrap', marginTop: 10, gap: 14 }]}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => openForm(product)}
                    style={{ minHeight: 38, justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: t.fonts.medium, fontSize: 12, color: t.colors.green }}>
                      Sửa & tồn kho
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Số đo ${product.name}`}
                    disabled={busy}
                    onPress={() => router.push(`/admin-sizing/${product.id}`)}
                    style={{ minHeight: 38, justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: t.fonts.medium, fontSize: 12, color: t.colors.green }}>
                      Bảng số đo & ảnh sau
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void toggle(product)}
                    style={{ minHeight: 38, justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: t.fonts.medium, fontSize: 12, color: t.colors.muted }}>
                      {product.active ? 'Ẩn sản phẩm' : 'Hiện sản phẩm'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })
      )}

      {/* MODAL THÊM / CHỈNH SỬA SẢN PHẨM */}
      <Modal visible={showForm} animationType="slide" onRequestClose={() => { if (!busy) setShowForm(false); }}>
        <Screen>
          <Header
            title={editing ? 'Chỉnh sửa thiết kế' : 'Một thiết kế mới'}
            subtitle="SHOPFIT CATALOG"
            right={<IconButton name="close" label="Đóng biểu mẫu" onPress={() => { if (!busy) setShowForm(false); }} />}
          />
          <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>
            <Field label="Tên sản phẩm *" value={name} onChangeText={setName} placeholder="Ví dụ: Áo sơ mi lụa tơ tằm" />
            <Field label="Giá bán (VND) *" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="Ví dụ: 350000" />

            {!editing && (
              <>
                {/* 1. DANH MỤC + THÊM DANH MỤC */}
                <View style={{ marginBottom: 18 }}>
                  <View style={[s.between, { marginBottom: 8 }]}>
                    <Text style={s.label}>Danh mục sản phẩm *</Text>
                    <Pressable onPress={() => setShowAddCatModal(true)}>
                      <Text style={{ fontFamily: t.fonts.bold, fontSize: 12, color: t.colors.green }}>
                        + Thêm danh mục mới
                      </Text>
                    </Pressable>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {allCategories.map(c => (
                      <Pressable
                        key={c.name}
                        accessibilityRole="button"
                        accessibilityState={{ selected: c.name === category }}
                        onPress={() => setCategory(c.name)}
                        style={{
                          paddingHorizontal: 16,
                          minHeight: 44,
                          borderRadius: 8,
                          backgroundColor: c.name === category ? t.colors.green : t.colors.greenLight,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{
                          fontFamily: t.fonts.medium,
                          fontSize: 12,
                          color: c.name === category ? 'white' : t.colors.green,
                        }}>
                          {c.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                <Field label="Chất liệu *" value={material} onChangeText={setMaterial} placeholder="Cotton, Linen, Lụa..." />
                <Field
                  label="Mô tả sản phẩm *"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  style={{ minHeight: 90, textAlignVertical: 'top' }}
                  placeholder="Mô tả ngắn gọn về thiết kế, phom dáng và dịp mặc phù hợp..."
                />

                {/* 2. CHỌN MÀU THÔNG MINH (PALETTE SWATCHES) */}
                <View style={{
                  backgroundColor: '#FAF9F6',
                  borderWidth: 1,
                  borderColor: '#E8E4DC',
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 18,
                  gap: 10,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="color-palette-outline" size={18} color={t.colors.green} />
                    <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.ink }}>
                      Màu sắc sản phẩm *
                    </Text>
                  </View>
                  <Text style={[s.muted, { fontSize: 11 }]}>
                    Chạm chọn nhanh màu phổ biến bên dưới hoặc tự nhập tên màu:
                  </Text>

                  {/* Swatches Grid */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {POPULAR_COLORS.map(c => {
                      const isSelected = colorHex.toUpperCase() === c.hex.toUpperCase();
                      return (
                        <Pressable
                          key={c.hex}
                          onPress={() => handleColorSelect(c)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 20,
                            borderWidth: 1,
                            borderColor: isSelected ? t.colors.green : '#D1D5DB',
                            backgroundColor: isSelected ? t.colors.greenLight : 'white',
                          }}
                        >
                          <View style={{
                            width: 14,
                            height: 14,
                            borderRadius: 7,
                            backgroundColor: c.hex,
                            borderWidth: 1,
                            borderColor: '#00000020',
                          }} />
                          <Text style={{
                            fontSize: 11,
                            fontFamily: isSelected ? t.fonts.bold : t.fonts.regular,
                            color: isSelected ? t.colors.green : t.colors.ink,
                          }}>
                            {c.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Color Name Input */}
                  <View style={{ marginTop: 6 }}>
                    <Field
                      label="Tên màu hiển thị cho khách"
                      value={colorName}
                      onChangeText={handleColorNameChange}
                      placeholder="Trắng, Đen tuyền, Xanh rêu..."
                    />
                  </View>

                  {/* Optional Hex Toggle */}
                  <Pressable onPress={() => setShowHexInput(v => !v)}>
                    <Text style={{ fontSize: 11, color: t.colors.muted, textDecorationLine: 'underline' }}>
                      {showHexInput ? 'Ẩn mã màu HEX' : 'Tùy chỉnh mã HEX nâng cao'}
                    </Text>
                  </Pressable>
                  {showHexInput && (
                    <Field
                      label="Mã màu HEX (tùy chỉnh)"
                      value={colorHex}
                      onChangeText={setColorHex}
                      autoCapitalize="none"
                      placeholder="#FFFFFF"
                    />
                  )}
                </View>

                {/* 3. NHẬP TỒN KHO RIÊNG TỪNG SIZE (MATRIX INVENTORY) */}
                <View style={{
                  backgroundColor: '#FAF9F6',
                  borderWidth: 1,
                  borderColor: '#E8E4DC',
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 18,
                  gap: 12,
                }}>
                  <View style={[s.between]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="cube-outline" size={18} color={t.colors.green} />
                      <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.ink }}>
                        Tồn kho riêng theo Size *
                      </Text>
                    </View>
                    <Text style={{ fontFamily: t.fonts.bold, fontSize: 12, color: t.colors.green }}>
                      Tổng: {selectedSizes.reduce((sum, sz) => sum + (Number(sizeStocks[sz]) || 0), 0)} cái
                    </Text>
                  </View>
                  <Text style={[s.muted, { fontSize: 11 }]}>
                    Bật/tắt các size có hàng và nhập số lượng tồn kho riêng cho từng size:
                  </Text>

                  {/* Size Toggle Pills */}
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {ALL_SIZES.map(sz => {
                      const active = selectedSizes.includes(sz);
                      return (
                        <Pressable
                          key={sz}
                          onPress={() => toggleSize(sz)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: active ? t.colors.green : '#D1D5DB',
                            backgroundColor: active ? t.colors.green : 'white',
                          }}
                        >
                          <Text style={{
                            fontFamily: t.fonts.bold,
                            fontSize: 12,
                            color: active ? 'white' : t.colors.muted,
                          }}>
                            {sz}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Size Stock Inputs Matrix */}
                  <View style={{ gap: 8, marginTop: 4 }}>
                    {selectedSizes.map(sz => (
                      <View key={sz} style={[s.between, { backgroundColor: 'white', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' }]}>
                        <Text style={{ fontFamily: t.fonts.bold, fontSize: 14, color: t.colors.ink, width: 60 }}>
                          Size {sz}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <TextInput
                            accessibilityLabel={`Tồn kho size ${sz}`}
                            value={sizeStocks[sz] ?? ''}
                            onChangeText={v => setSizeStocks(prev => ({ ...prev, [sz]: v.replace(/\D/g, '') }))}
                            keyboardType="numeric"
                            placeholder="0"
                            style={{
                              borderWidth: 1,
                              borderColor: t.colors.line,
                              borderRadius: 6,
                              height: 38,
                              width: 80,
                              textAlign: 'center',
                              fontFamily: t.fonts.regular,
                              fontSize: 14,
                              color: t.colors.ink,
                              backgroundColor: '#FCFCFB',
                            }}
                          />
                          <Text style={[s.muted, { fontSize: 12 }]}>sản phẩm</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Batch Fill Tool */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 4,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: '#EAE6DD',
                  }}>
                    <TextInput
                      value={batchStock}
                      onChangeText={setBatchStock}
                      keyboardType="numeric"
                      placeholder="Số lượng"
                      style={{
                        borderWidth: 1,
                        borderColor: t.colors.line,
                        borderRadius: 6,
                        height: 36,
                        width: 75,
                        textAlign: 'center',
                        fontSize: 12,
                        backgroundColor: 'white',
                      }}
                    />
                    <Button variant="outline" onPress={applyBatchStock} style={{ height: 36, minHeight: 36, paddingHorizontal: 12 }}>
                      Áp dụng cho tất cả size
                    </Button>
                  </View>
                </View>

                {/* 4. CHỌN ẢNH SẢN PHẨM */}
                {photo && (
                  <Image
                    source={photo.uri}
                    contentFit="contain"
                    style={{ height: 220, width: '100%', borderRadius: 10, marginBottom: 15, backgroundColor: t.colors.sand }}
                  />
                )}
                <Button
                  variant="outline"
                  icon="image-outline"
                  onPress={() => void pick()}
                  style={{ marginBottom: 14 }}
                >
                  {photo ? 'Đổi ảnh sản phẩm' : 'Chọn ảnh sản phẩm từ máy'}
                </Button>
                <Text style={[s.muted, { marginBottom: 20, fontSize: 11 }]}>
                  Dùng ảnh trang phục chụp thẳng, nền sáng gọn gàng để AI dựng phom thử đồ đẹp nhất.
                </Text>
              </>
            )}

            {editing && (
              <>
                <Text style={[s.label, { marginTop: 8 }]}>Tồn kho theo màu / size</Text>
                {variants.map((v, index) => (
                  <View key={`${v.size}-${v.color}`} style={[s.between, { marginBottom: 10 }]}>
                    <Text style={s.text}>{v.color} / {v.size}</Text>
                    <TextInput
                      accessibilityLabel={`Tồn kho ${v.color} size ${v.size}`}
                      value={String(v.stock)}
                      onChangeText={value =>
                        setVariants(all =>
                          all.map((item, i) =>
                            i === index
                              ? { ...item, stock: Math.max(0, Math.min(10000, Number(value.replace(/\D/g, '')) || 0)) }
                              : item
                          )
                        )
                      }
                      keyboardType="numeric"
                      style={{
                        borderWidth: 1,
                        borderColor: t.colors.line,
                        borderRadius: 7,
                        height: 48,
                        width: 85,
                        textAlign: 'center',
                        fontFamily: t.fonts.regular,
                        color: t.colors.ink,
                      }}
                    />
                  </View>
                ))}
              </>
            )}

            <ErrorMessage message={formError} />
            <Button
              loading={busy}
              icon="checkmark"
              onPress={() => void save()}
              style={{ marginTop: 12, marginBottom: 30 }}
            >
              {editing ? 'Lưu thay đổi' : 'Thêm thiết kế vào bộ sưu tập'}
            </Button>
          </View>
        </Screen>
      </Modal>

      {/* MODAL THÊM DANH MỤC MỚI KÈM ÁNH XẠ AI */}
      <Modal visible={showAddCatModal} transparent animationType="fade" onRequestClose={() => setShowAddCatModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 22, maxWidth: 440, width: '100%', gap: 14 }}>
            <View style={[s.between]}>
              <Text style={{ fontFamily: t.fonts.bold, fontSize: 18, color: t.colors.ink }}>
                Thêm danh mục mới
              </Text>
              <IconButton name="close" label="Đóng" onPress={() => setShowAddCatModal(false)} />
            </View>

            <Field
              label="Tên danh mục *"
              value={newCatName}
              onChangeText={setNewCatName}
              placeholder="Ví dụ: Đầm dạ hội, Áo blazer, Quần short..."
            />

            <View>
              <Text style={s.label}>Nhóm phom dáng thử đồ AI *</Text>
              <Text style={[s.muted, { fontSize: 11, marginBottom: 8 }]}>
                Giúp Gemini AI hiểu đúng vị trí trang phục khi khách hàng thử đồ:
              </Text>

              {([
                ['tops', '👔 Thân trên (Áo, Sơ mi, Blazer, Áo len...)'],
                ['bottoms', '👖 Thân dưới (Quần jean, Quần âu, Chân váy...)'],
                ['one-pieces', '👗 Toàn thân (Váy, Đầm liền, Jumpsuit, Set bộ...)'],
              ] as const).map(([val, desc]) => (
                <Pressable
                  key={val}
                  onPress={() => setNewCatTryon(val)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: newCatTryon === val ? t.colors.green : '#E5E7EB',
                    backgroundColor: newCatTryon === val ? t.colors.greenLight : 'white',
                    marginBottom: 6,
                  }}
                >
                  <Text style={{
                    fontSize: 12,
                    fontFamily: newCatTryon === val ? t.fonts.bold : t.fonts.regular,
                    color: newCatTryon === val ? t.colors.green : t.colors.ink,
                  }}>
                    {desc}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <Button variant="outline" onPress={() => setShowAddCatModal(false)} style={{ flex: 1 }}>
                Hủy
              </Button>
              <Button onPress={handleCreateCategory} style={{ flex: 1 }}>
                Tạo danh mục
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
