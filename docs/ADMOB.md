# Bài tập tích hợp AdMob — ShopFit

ShopFit chọn **quảng cáo AdMob**, một trong hai lựa chọn của đề bài. Banner nằm cuối màn **Khám phá**, phía trên dòng “Made for your everyday.” Không cần thêm In-app Purchase để đáp ứng lựa chọn này. Việc giảng viên chấp nhận bản demo bằng quảng cáo test cần theo yêu cầu của lớp; đề bài đã cung cấp không yêu cầu quảng cáo kiếm tiền thật.

## Phần đã triển khai

- `mobile/package.json`: `react-native-google-mobile-ads` 17.4.0, hỗ trợ React Native 0.86 của Expo SDK 57.
- `mobile/app.config.ts`: config plugin ghi App ID mẫu vào cấu hình native lúc prebuild; không sửa tay `AndroidManifest.xml`.
- `mobile/src/components/ad-banner.android.tsx`: khởi tạo SDK một lần, sau đó tải `BannerAd` dạng inline adaptive, tối đa 120 dp chiều cao. Chiều rộng lấy từ vùng nội dung để vừa màn hình và lề của app.
- Dùng **App ID và ad unit thử nghiệm của Google trong cả bản debug lẫn release demo**. Không có doanh thu và không cần khóa bí mật AdMob. Không dùng `__DEV__` để chuyển sang quảng cáo thật khi quay bản APK.
- Có trạng thái đang tải, xử lý lỗi và nút tải lại theo thao tác người dùng; không đặt bộ hẹn giờ tự tải lại. Lỗi quảng cáo không chặn mua sắm.
- Bản web/iOS bỏ qua banner. Trên Android Expo Go, kiểm tra `isRunningInExpoGo()` trước khi nạp module native; các màn hình khác vẫn sử dụng được.
- Không gửi tài khoản, hồ sơ số đo, ảnh thử đồ hay Gemini key trong tham số yêu cầu quảng cáo. Yêu cầu quảng cáo không cá nhân hóa; SDK Google vẫn có hoạt động mạng riêng.

| Loại ID | Giá trị dùng cho Android |
| --- | --- |
| App ID mẫu, dùng dấu `~` | `ca-app-pub-3940256099942544~3347511713` |
| Ad unit inline adaptive mẫu, dùng dấu `/` | `ca-app-pub-3940256099942544/9214589741` (`TestIds.ADAPTIVE_BANNER`) |

App ID iOS mẫu cũng được khai báo để cấu hình plugin đầy đủ; chưa triển khai banner hoặc kiểm thử AdMob trên iOS.

## Kết quả kiểm tra mã nguồn (27/10/2026)

Lint, TypeScript, kiểm tra phiên bản dependency, introspection Android manifest, xuất bundle Hermes Android và cả 12 kiểm thử giao diện web đều qua. Không gọi Gemini thật trong kiểm thử. Mã nguồn tích hợp nằm trong repo [huybitvvt/shopfit](https://github.com/huybitvvt/shopfit), nhánh `main`; hướng dẫn clone/cài trên máy khác ở [README.md](../README.md). Chưa xác nhận banner trên Android hoặc quay video. Chi tiết trong [VALIDATION.md](VALIDATION.md).

## Chạy để quay video

**AdMob là SDK native: localhost web và Expo Go không thể dùng để chứng minh quảng cáo AdMob hoạt động.** Cần một bản Android đã build với thư viện mới, chạy trên emulator hoặc điện thoại và có Internet. APK cũ chưa có thư viện cần build lại; tải lại JavaScript không bổ sung được SDK native.

Phạm vi làm việc hiện tại vẫn là localhost; chưa tự build/cài APK. Khi chuyển sang bước quay video Android, dùng quy trình sẵn có trong [ANDROID.md](ANDROID.md). Không cần đưa app lên Google Play để sử dụng demo ad unit của Google.

Các lệnh dưới đây chạy tại thư mục gốc repo, sau khi đã có JDK 17 và Android SDK. Trên máy khác, đặt `JAVA_HOME` và `ANDROID_HOME` theo đường dẫn cài thực tế; đường dẫn cache JDK của máy cũ trong [ANDROID.md](ANDROID.md) không áp dụng cho mọi máy.

```powershell
# Terminal 1: API local; không cần tạo ảnh Gemini để demo quảng cáo.
npm.cmd run api

# Terminal 2: build bản Android demo có bundle JS, dùng backend trên emulator.
powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1

# Emulator đang mở, hoặc thiết bị USB debugging đã kết nối:
& "$env:ANDROID_HOME/platform-tools/adb.exe" install -r artifacts/ShopFit-preview.apk
```

Trên điện thoại thật cùng Wi-Fi, vào **Cá nhân → Kết nối shop** đặt backend thành `http://<IPv4 LAN của máy>:8000`. Trên emulator dùng `http://10.0.2.2:8000`. Backend vẫn chạy ở máy tính; không cần triển khai public.

Mở **Khám phá**, cuộn đến cuối danh mục và chờ banner có nhãn **Test Ad** do Google hiển thị. Dòng chữ “QUẢNG CÁO THỬ NGHIỆM” của ShopFit chỉ là nhãn khu vực, không phải bằng chứng quảng cáo đã tải.

Nếu không tải được: kiểm tra Internet của thiết bị/emulator, đúng APK mới, App ID và logcat Google Mobile Ads. Nút **Thử tải lại quảng cáo** chỉ xuất hiện sau lỗi. Không coi màn hình đang tải/lỗi hoặc một ảnh banner tự vẽ là demo thành công.

## Kịch bản video thuyết minh (khoảng 2–3 phút)

| Thời gian | Nội dung quay và thuyết minh |
| --- | --- |
| 0:00–0:20 | Giới thiệu ShopFit, ứng dụng bán quần áo và thử đồ; nhóm chọn tích hợp AdMob dạng banner. |
| 0:20–0:50 | Mở app trên Android, xem danh mục rồi cuộn xuống vị trí banner; quay rõ quảng cáo và nhãn **Test Ad**. Giải thích đây là quảng cáo do SDK Google tải bằng mã test, không tạo doanh thu. |
| 0:50–1:25 | Mở mã nguồn: dependency, config plugin và App ID mẫu trong `app.config.ts`; phân biệt App ID (`~`) với ad unit (`/`). |
| 1:25–2:00 | Giải thích `initializeAds()` → chờ khởi tạo → `BannerAd`, `TestIds.ADAPTIVE_BANNER`, kích thước thích ứng, các callback tải xong/lỗi. |
| 2:00–2:30 | Cho thấy các chức năng danh mục/tìm kiếm vẫn dùng được. Nêu giới hạn: banner Android, web/Expo Go bỏ qua SDK; quảng cáo thật cần cấu hình AdMob và luồng đồng ý phù hợp trước phát hành. |
| 2:30–2:45 | Mở GitHub ở commit đã chứa phần AdMob; kết thúc với tên đại diện nhóm. |

Không cần gọi tạo ảnh thử đồ trả phí trong video này. Quay giọng thuyết minh cùng màn hình; kiểm tra liên kết video xem được bằng cửa sổ ẩn danh trước khi nộp.

## Nội dung dán vào ô nộp bài

Chỉ dùng mẫu sau **sau khi đã đẩy mã nguồn AdMob và quay được banner thật từ SDK trên Android**. Thay mọi chỗ trong ngoặc vuông.

```text
Bài tập tích hợp quảng cáo AdMob — Nhóm ShopFit
Đại diện nhóm: [Họ tên — MSSV]

GitHub: https://github.com/huybitvvt/shopfit
Video thuyết minh: [Link YouTube không công khai hoặc Google Drive đã bật quyền xem]

Nhóm tích hợp banner Google AdMob ở cuối màn Khám phá của ứng dụng Android ShopFit.
Video trình bày quảng cáo test do Google Mobile Ads SDK tải, cấu hình App ID,
ad unit thử nghiệm, khởi tạo SDK và xử lý trạng thái tải/lỗi.
```

Một đại diện nộp hai liên kết. Thông báo “Wednesday by 11:59pm” chưa có ngày cụ thể và múi giờ của lớp; đối chiếu trực tiếp trên hệ thống môn học.

## Giới hạn và nguồn

Đây là tích hợp **test cho bài tập**, chưa phải cấu hình kiếm tiền/phát hành. Khi chuyển sang quảng cáo thật cần thay cả App ID/ad unit, xử lý UMP/đồng ý theo khu vực trước khi khởi tạo SDK, kiểm tra quyền riêng tư và kiểm thử lại. `requestNonPersonalizedAdsOnly` không thay thế yêu cầu đồng ý.

- [Google AdMob Android quick start](https://developers.google.com/admob/android/quick-start)
- [Google: Enable test ads](https://developers.google.com/admob/android/test-ads)
- [Invertase: Expo installation](https://docs.page/invertase/react-native-google-mobile-ads/installation/expo)
- [Invertase: Banner ads](https://docs.page/invertase/react-native-google-mobile-ads/ad-formats/banner)
- [Invertase: Consent and privacy](https://docs.page/invertase/react-native-google-mobile-ads/consent-basics)
- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/)
