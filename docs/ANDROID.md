# Android demo

## Backend và địa chỉ kết nối

Chạy `npm.cmd run api` tại gốc project. Trên Android emulator, backend của máy tính có địa chỉ `http://10.0.2.2:8000`. Trên điện thoại thật, dùng `http://<IPv4 LAN máy tính>:8000` và cùng Wi-Fi.

Trong app vào **Cá nhân → Kết nối shop**, nhập địa chỉ và bấm **Kiểm tra & lưu kết nối**. App kiểm tra health không gửi token sang host mới; đổi máy chủ sẽ đăng xuất và xóa giỏ hàng cục bộ. Có thể đổi địa chỉ mà không build lại APK. Không thêm `/api` vào địa chỉ.

## Build APK cục bộ

Yêu cầu JDK và Android SDK đã cài, đặt `JAVA_HOME` và `ANDROID_HOME`. Dùng JDK 17 cho toolchain hiện tại: Android Studio JBR 25 trên máy này làm bước CMake lỗi `WARNING: A restricted method in java.lang.System has been called`; cùng bước đó đã chạy thành công khi đổi sang JDK 17. `expo prebuild` tự sinh native project; không sửa thủ công `android/`. Thư mục native được Git bỏ qua.

Trên máy phát triển hiện tại đã có JDK 17 trong cache Gradle. Đặt biến cho terminal build, không cần đổi Java toàn hệ thống:

```powershell
$env:JAVA_HOME = 'E:\Android\Gradle\jdks\eclipse_adoptium-17-amd64-windows.2'
```

Script dùng một Gradle worker, Kotlin trong cùng tiến trình, Metro tối đa hai worker. Config plugin `with-build-limits` đặt Ninja pool tối đa hai tác vụ compile/một link để tránh mở hàng loạt trình biên dịch C++ trên máy 8 GB RAM. Giới hạn này ảnh hưởng lúc build, không thay đổi hiệu năng app đã cài.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1
```

Mặc định build ARM64 cho điện thoại và x86_64 cho emulator; backend ban đầu `http://10.0.2.2:8000`. Có thể ghi URL LAN mặc định:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1 -ApiUrl http://192.168.1.10:8000
```

APK đầu ra: `artifacts/ShopFit-preview.apk`; metadata/hash: `artifacts/android-build.json`. Đây là bản demo có bundle JS bên trong, không cần Metro. Backend vẫn phải chạy. Bản demo ký bằng khóa phát triển được template tạo; không dùng khóa này để phát hành cửa hàng.

`SHOPFIT_PREVIEW=1` cho phép HTTP trong mạng riêng qua config plugin. Bản production không bật biến này, dùng backend HTTPS và khóa ký riêng. `mobile/eas.json` cũng có profile APK preview nếu muốn build EAS bằng tài khoản của bạn; project chưa được đăng ký/publish lên EAS trong quá trình này.

## Cài APK

Chuyển APK sang điện thoại và mở file để cài, hoặc kết nối USB debugging rồi chạy:

```powershell
& "$env:ANDROID_HOME/platform-tools/adb.exe" install -r artifacts/ShopFit-preview.apk
```

Sau khi cài, mở app → Kết nối shop → nhập URL LAN → đăng nhập. Không đặt Gemini key vào app hoặc máy điện thoại.

## Kiểm tra thiết bị

- AdMob: build lại sau khi thêm SDK, cuộn cuối màn Khám phá, kiểm tra banner Google có nhãn **Test Ad**; không xác nhận thành công chỉ dựa vào nhãn khu vực của ShopFit. Xem [ADMOB.md](ADMOB.md) để quay video bài tập. Web và Expo Go không có quảng cáo.
- Catalog và ảnh sản phẩm; tìm kiếm, chọn màu/size, đặt và hủy đơn mẫu.
- Hồ sơ cơ thể, bàn phím thập phân, đồ mặc vừa, bản đồ độ vừa, so số đo theo từng size.
- Camera: từ chối quyền rồi cấp lại; thư viện ảnh, ảnh EXIF dọc, ảnh lớn, ảnh cắt đầu/chân và nhiều người.
- Thử đồ: gọi đúng một lượt khi bấm nhanh/mất mạng, rời màn hình rồi quay lại, chuyển bốn góc, ảnh bị lỗi một góc, retry riêng.
- Tắt/mở app, token SecureStore, đổi backend và đăng nhập lại; SafeArea với thanh điều hướng Android.

Không đánh đồng emulator với thiết bị thật, hoặc ảnh thử đẹp với độ vừa đã đo được. Kết quả kiểm tra cụ thể ghi trong `VALIDATION.md`.
