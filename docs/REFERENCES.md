# Nguồn và phạm vi kế thừa

## OpenVTO — sử dụng trực tiếp

- Repository: https://github.com/Prompt-Haus/OpenVTO
- Giấy phép: MIT; giữ nguyên `backend/vendor/openvto/LICENSE` và `THIRD_PARTY_LICENSES.md`.
- Bản SDK: 0.1.7; commit và ngày nhập trong `backend/vendor/openvto/UPSTREAM.json`.
- SDK nằm trong repository để checkout/cài đặt tái lập mà không phụ thuộc phiên bản PyPI ngẫu nhiên.
- `backend/app/tryon.py:OpenVTOEngine` gọi `OpenVTO(provider="google").generate_tryon(...)` với ảnh người dùng, ảnh sản phẩm và ngữ cảnh trang phục/màu.
- Đi qua pipeline try-on và Google provider của upstream; không dùng mock provider trong app. Chỉ kiểm thử có giả lập ranh giới Google để không tiêu tiền API.
- Không nhập app playground hoặc backend demo của upstream. Giao diện, tài khoản, lưu trữ, đơn hàng và hệ thống tác vụ của ShopFit được xây riêng.

## c-shopping — tham khảo nghiệp vụ

- Mobile: https://github.com/huanghanzhilian/c-shopping-rn
- Backend/admin: https://github.com/huanghanzhilian/c-shopping
- Tham khảo cách phân chia danh mục, sản phẩm, màu/size, giỏ và đơn hàng.
- Không sao chép source, cơ chế xác thực hoặc cấu hình khóa của các repo này.

## Tài liệu triển khai

- Expo: https://docs.expo.dev/
- Expo ImagePicker: https://docs.expo.dev/versions/latest/sdk/imagepicker/
- Gemini image generation: https://ai.google.dev/gemini-api/docs/image-generation
- FastAPI: https://fastapi.tiangolo.com/

## Hình ảnh và font

- Ảnh hero và catalog mẫu: Unsplash (`images.unsplash.com`). URL nguồn catalog lưu trong `backend/app/seed.py`; hero từ `photo-1496747611176-843222e1e57c`.
- Ảnh catalog chỉ phục vụ dữ liệu minh họa. Khi thay bằng shop thật, sử dụng ảnh được shop cho phép.
- Font: DM Sans và Cormorant Garamond, qua các package `@expo-google-fonts` kèm giấy phép tương ứng.
- Icon: Ionicons qua `@expo/vector-icons`. Biểu tượng túi ShopFit là hình vẽ riêng trong dự án.
