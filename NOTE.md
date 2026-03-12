# Hệ thống Giám sát & Chống Gian Lận Thi Trực Tuyến (Anti-Cheat System)

Tài liệu này tổng hợp toàn bộ các tính năng chống gian lận và theo dõi hành vi tự động đã được tích hợp vào hệ thống (Client - `exam-client`).

## 1. Các Tính Năng Đã Triển Khai & Hoàn Thiện

Hệ thống thi đã được nâng cấp với một vòng lặp bảo vệ (Verification Loop) nhằm đảm bảo tính công bằng tuyệt đối:

### 1.1 Quản Lý Tham Số Chống Gian Lận (Exam Tracking Configurations)
Từ phiên bản cập nhật mới, bài thi sẽ nhận tham số cấu hình `config: ExamTrackingConfig` từ Server phân rã thành ba cấp độ (Level) hỗ trợ môi trường Web lẫn Electron App:

1. **Không Giám Sát (`level: "none"`):**
   - Hoạt động mọi nền tảng (Mobile, Trình duyệt Web PC, App Electron).
   - *Bỏ qua hoàn toàn* Camera Check, quét tiến trình, khóa đa màn hình, Always-on-Top.
   - Nhưng **Vẫn bắt buộc**: Chặn Copy, Paste, Cut. Vẫn theo dõi chuyển Tab (`visibilitychange`) và rời cửa sổ (`window_blur`). Bắt F12 (DevTools) và chặn chuột phải.

2. **Giám Sát Tiêu Chuẩn (`level: "standard"`):**
   - Hỗ trợ tuỳ chỉnh `requireApp` chạy trên Web hay buộc phải bật App.
   - Thiết lập các Config rời rạc như: Tùy ý bật/tắt `requireCamera` (FaceMesh), `requireMic` (Dùng Web Audio ghi âm, chưa tích hợp AI backend trả về), `requireFaceAuth` (Gửi Frame định danh khuôn mặt). Chức năng này hỗ trợ mở rộng sau này, chỉ cần bật cờ Server.
   - Vẫn bắt buộc chạy Toàn Màn Hình (Fullscreen Lock).

3. **Giám Sát Nghiêm Ngặt (`level: "strict"` & `requireApp: true`):**
   - Chặn đứng mọi trình duyệt Web, chỉ cho phép học sinh thi qua ứng dụng **Electron App** được tải xuống. 
   - Ràng buộc Hệ Điều Hành khắt khe: **Chỉ hỗ trợ** Windows > 10, MacOS, và Linux sử dụng nền tảng X11 (Chặn đứng Wayland do lý do giới hạn bảo mật Native uiohook).
   - Kích hoạt Toàn Bộ Công Cụ Nặng: Khóa ứng dụng chạy ngầm, Always-On-Top, Native Keylogger cấp độ nhân (Kernel), mạng nội bộ (IP Tracking) phòng VPN lậu. Tích hợp `bannedAppsExceptions` để mở whitelist một số ứng dụng đặc thù (nếu có).

### 1.2 Khởi tạo & Kiểm tra Camera (Camera Wizard)
- **Phase 1 (Kết nối):** Yêu cầu quyền truy cập Webcam và kiểm tra tải luồng MediaStream.
- **Phase 2 (Liveness Check):** Áp dụng kỹ thuật chớp màu liên tục và theo dõi phản xạ độ sáng chống ảnh tĩnh.
- **Phase 3 (Gaze & Pose Landmarker):** Tích hợp trí tuệ nhân tạo **Google MediaPipe Face Mesh** để quét 478 tọa độ khuôn mặt (Face Landmarker). Đảm bảo học sinh:
  - Góc độ khuôn mặt (Yaw, Pitch, Roll) không lệch quá 20 độ (Không quay ngang/ngửa mặt).
  - Khoảng cách từ mặt đến camera tỷ lệ hợp lý.
  - Gaze (Hệ số hướng mắt liếc) được khóa dưới mức 20 độ. Thuật toán đã tích hợp bộ đệm `debounce 500ms` chống báo oan khi chớp mắt tự nhiên.
  - *Lưu ý:* Vòng lặp giám sát Camera và Trí tuệ Nhân Tạo này sẽ Tự Động Ẩn nếu config `requireCamera = false` hoặc `level = "none"`.

### 1.2 Theo dõi hành vi màn hình & Cửa sổ (Browser & Window Monitoring)
- **Bắt Buộc Toàn Màn Hình (Fullscreen Lock):** Giao diện thi ép buộc chạy ở chế độ Fullscreen. Nếu thí sinh nhấn `F11`, `Esc`, hoặc dùng thủ thuật thoát ra ngoài để làm việc khác, màn hình sẽ bị bôi Mờ (Blur Lock) ngay lập tức và ghi nhận vi phạm "Thoát chế độ toàn màn hình" vào máy chủ.
- **Cơ Chế Always-On-Top (Ghim Trực Diện):** Khi bước vào Phase 4 (Làm Bài Thi), cửa sổ Electron sẽ được đẩy quyền lên mức cao nhất (`screen-saver` level) của hệ điều hành. Cửa sổ này sẽ chèn ép và đè lên mọi tiến trình khác (kể cả Taskbar), ép thí sinh chỉ được nhìn thấy bài làm. Cơ chế này tự động nhả ra (Unlock) khi thí sinh bấm Nộp Bài.
- **Chống Đa Màn Hình (Multi-Monitor Detection):** Quét qua API Native của Hệ điều hành xem máy tính có đang cắm 2 màn hình trở lên không. Nếu có, khóa ngay giao diện thi và yêu cầu thí sinh ngắt cáp màn hình dự phòng.
- **Theo Dõi Tab / Mất Tiêu Điểm:** Giám sát sự kiện `visibilitychange` và `blur` của cấp trình duyệt/hệ điều hành. Cố ý Alt+Tab ra Desktop hoặc chuyển ứng dụng sẽ ghi nhận 1 lượt vi phạm.
- **Chặn Ứng Dụng Chạy Ngầm (Banned Apps Scanner):** Vòng lặp liên tục quét tiến trình HĐH (`tasklist` trên win, `ps -axo` trên linux/mac) để tóm các phần mềm chat, chia sẻ màn hình, từ điển: `Chrome`, `Edge`, `FireFox`, `Discord`, `OBS`, `AnyDesk`, `TeamViewer`, `Ultraviewer`... Đang mở ứng dụng cấm => Màn hình thi bị khóa mờ ngay lập tức. Tính năng này có cơ chế **Tự Động Phục Hồi (Auto-Resume)** ngay khi sinh viên Tắt ứng dụng vi phạm đi (kiểm tra mỗi 3 giây).

### 1.3 Phòng Chống Phần Cứng, Mạng & Ghi Chép Chuột/Phím (Hardware & Network Safety)
- **Thu Thập IP/MAC Cục Bộ (Network Tracking):** Hệ thống Node.js chạy ngầm liên tục quét các Card Mạng (Network Interfaces) để thu thập mảng IP Address và địa chỉ vật lý MAC. Dữ liệu này được chuẩn bị sẵn sàng để truyền Real-time qua Socket cho Backend AI phân tích hành vi thi hộ qua mạng.
- **Bắt Tín Hiệu Native qua C++ Module (`uiohook-napi`):** Thay vì dùng Javascript DOM Events (vốn bị vô hiệu hóa khi người dùng thao tác ở cửa sổ khác), hệ thống tích hợp thư viện Keylogger cấp nhân Hệ Điều Hành. Toàn bộ các lần Click chuột ngoài màn hình, Gõ phím ở ứng dụng khác đều được Background Process âm thầm ghi nhận thời gian thực.
  - *(Ghi chú: Khắc phục trên Linux - Các phân hệ Wayland bảo mật cao chặn Native Keylogger, Code có tích hợp thêm DOM Event Listener Fallback để vẫn bắt được sự kiện Click nếu Client dùng Linux).*
- **Chặn Tổ Hợp Phím Copy/Paste:** Ngăn chặn và báo vi phạm các thao tác (`Ctrl+C`, `Ctrl+V`, `Ctrl+A`, `Ctrl+X`) và vô hiệu hóa Chuột Phải (`Context Menu`).
- **Chống Quay/Chụp Màn Hình (OS Display Protection):** Sử dụng API `setContentProtection(true)` của Electron. Khi bật, hệ điều hành (Windows/MacOS) sẽ chặn các ứng dụng bên thứ ba (Bandicam, OBS, Snipping Tool, PrintScreen) ghi hình lại cửa sổ làm bài. Video/Ảnh chụp luồng thi sẽ toàn một màu đen.
- **Ngăn Chặn DevTools (F12):** Lắng nghe IPC Events từ Main Process, khóa DevTools Inspector. Cố tình mở sẽ dính thẻ Vi Phạm làm mờ màn hình.

### 1.4 Giao diện Thanh Trạng Thái & Xuất File Báo Cáo (Report EXPORT)
- Kèm theo giao diện UI Footer thanh trạng thái giám sát Live (cho biết số lỗi, thông báo camera, ứng dụng đang vi phạm...).
- **Hệ thống chia làm 2 File Log Bảo Mật riêng biệt (Lưu tại Desktop lúc nộp bài):**
  1. `exam_[id]_VIOLATION_[time].txt`: Độc lập lưu các Vi phạm An Ninh Lớn (Ví dụ: Chuyển Tab, Tắt Fullscreen, Bị ẩn camera, Dính phần mềm cấm).
  2. `exam_[id]_TRACKING_[time].txt`: Tập tin Raw File lưu log 100% tọa độ Nhấn Chuột (`X, Y`) và Lịch sử Gõ Phím (`KeyCode`) theo từng Mili-giây suốt dọc quá trình làm bài. Dành cho công tác Hậu Kiểm (Post-Review).
- **Tính năng DEV BYPASS (`DEV_MODE=true`):** Dành riêng cho đội ngũ giảng viên hoặc Tester. Khi bật `NO_LOCKSCREEN_WHEN_DEV_MODE`, Màn Hình Thi sẽ không bao giờ bị khóa mờ do phần mềm vi phạm nữa mà sẽ được chuyến hóa thành hộp thoại Toast báo đỏ `[Dev Bypass] XXX` nổi lên ở góc để tester kiểm chứng các Rule vẫn đang bắt đúng sự kiện.

---

## 2. Thảo Luận: Ý Tưởng Mở Rộng Hệ Thống Nâng Cao Tương Lai

Các cấp bậc dưới đây có thể áp dụng để nâng hệ thống từ "Giám Sát Bán Tự Động" lên "Đóng Băng Hoàn Toàn" (Lockdown / Advanced Proctoring):

### Ý Tưỏng 1: Phân Tích  m Thanh Môi Trường bằng Trí Tuệ Nhân Tạo (Audio NLP)
Quay lại Microphone học sinh dạng Chunks (âm thanh 5s/lần) và đẩy ngược lên một Model AI nhỏ xử lý (Ví dụ Web Speech API hoặc Whisper CPP). Mục đích để lắng nghe có **Tiếng Người Thứ 2** (tần số của giọng nói khác người thi) đang đứng cạnh nhắc bài, hoặc đọc đáp án không. Nhận định ra tiếng ồn đám đông.

### Ý Tưởng 2: Chụp Ảnh "Lén" Ngẫu Nhiên (Randomized Snapshots)
Mỗi 3 đến 5 phút ngẫu nhiên, tự động trigger đoạn mã chụp lại Canvas `<video>` khung mặt thí sinh, encode Base64 và đẩy thầm lặng lên backend. Giám thị coi thi trên Dashboard có thể click vào học sinh và tua được 1 loạt các hình ảnh (Gallery) trong 60 phút kỳ thi để kiểm chứng ngẫu nhiên. Điều này tốn ít băng thông cực kỳ so với Truyền Video Live.

### Ý Tưởng 3: Truy Vết VPN / Ngược Dấu Mạng (Network Anomaly)
Chống hình thức "Nhờ người thi hộ bằng Remote Desktop + Kết nối VPN". Sử dụng WebRTC STUN DataChannels để Ping và rà soát Public IP đằng sau lớp Proxy của mạng nội bộ.

### Ý Tưởng 4: Chế độ Kiosk/Lockdown Cấp Kernel (Đóng băng Taskbar)
Sử dụng các Hook sâu hơn (AppArmor trên Linux, Registry trên Windows) kết nối với Electron để chìm hoàn toàn Taskbar. Hoặc bắt buộc ứng dụng chạy Always-On-Top Cấp độ Bảng Mạch. Tổ hợp phím `Alt+Tab` và `Windows Key` bị bẻ khóa từ Driver hệ điều hành. Cơ chế này giống Safe Exam Browser nguyên tác.

### Ý Tưởng 5: Định Danh Hành vi Thói Quen Gõ Máy (Keystroke Dynamics Biometrics)
Thay vì nhận diện khuôn mặt, hệ thống có thể học Thói Quen Nhấn Phím (`keydown` -> Khoảng trễ -> `keyup`) và Tổ hợp thao tác gõ (Tốc độ từ WPM - Words Per Minute) ở 5 phút đầu. Nếu nửa sau bài kiểm tra, Tốc độ gõ phím hoặc Dáng Click chuột thay đổi hoàn toàn mượt mà như thợ (người khác làm hộ trên chung thiết bị), Hệ thống cảnh báo AI Mạo Danh.

---

## 3. Tư Vấn Giao Thức Mạng Giám Sát Real-Time & Bảo Mật

Việc giám sát AI thời gian thực (Truyền frame ảnh Gaze, Keystroke Payload, Network IP) đòi hỏi một kiến trúc mạng khắt khe hơn mô hình Request-Response truyền thống.

### 3.1 Giao thức thay thế/phù hợp hơn WebSocket + API Gateway
1. **WebRTC (Data Channels):**
   - **Đặc điểm:** So với WebSocket (hoạt động trên TCP, có độ trễ do cơ chế Packet Acknowledgment kiểm tra mất gói tin), WebRTC Data Channels hoạt động hoàn toàn trên **UDP Peer-to-Peer**.
   - **Ưu điểm:** Độ trễ cực kỳ thấp (Ultra-Low Latency). Nếu gửi dữ liệu Tracking chuột hoặc frame ảnh bị rơi/mạng chập chờn, frame cũ sẽ bị bỏ qua thay vì làm nghẽn cổ chai (Buffer Bloat) chờ gửi lại như WebSocket. Sẽ cực kỳ hoàn hảo cho Hệ thống Anti-Cheat tập trung nhiều vào tín hiệu Data liên tục.
2. **gRPC / gRPC-Web (HTTP/2 Streams):**
   - **Đặc điểm:** Dùng Protobuf (Dữ liệu Nhị Phân) thay vì JSON String dài dòng. 
   - **Ưu điểm:** Payload cực nhẹ, nén dữ liệu rất sâu. Rất phù hợp với việc truyền mảng tọa độ 478 điểm Landmarker của MediaPipe lên Server liên tục.
3. **WebTransport (HTTP/3 - QUIC):**
   - **Đặc điểm:** Đây là công nghệ sinh ra để khắc phục nhược điểm "hàng đợi chặn" của WebSocket. Nếu dùng Node.js Backend hiện đại, WebTransport cho phép mở nhiều Stream đan xen (Ảnh đi 1 luồng, Tọa độ đi 1 luồng). Rất khuyên dùng.

### 3.2 Bổ sung Bảo mật Đặc Thù (Security Measures)
Khi cắm ống Client -> Backend AI xử lý, mạng cần trang bị thêm các khiên chắn sau:
1. **Mutual TLS (mTLS):** Không chỉ mã hóa `https` (Server chứng thực), hệ thống có thể cấp sẵn một chứng chỉ Client Certificate được đúc (build) ngầm vào bên trong bản gốc Electron. API Gateway chỉ chấp nhận Socket đến từ bản Build chuẩn (hạn chế Hacker nhái request từ Postman hoặc Script Python bắn dữ liệu sạch ảo).
2. **Payload Signing (HMAC-SHA256):** Mỗi Chunk dữ liệu gửi lên (Ví dụ danh sách App Cấm, IP...) đều phải được đính kèm Hash Code dựa trên 1 Secret Key ngầm hóa (Obsufcated) dưới C++. Hacker chặn bắt Request, đổi từ Payload `[cheat_engine.exe]` thành `[chrome.exe]` cũng bất khả thi vì Hash chữ ký không khớp.
3. **Token Rotation / Short-lived JWT qua WSS:** WebSocket Token chỉ nên có tuổi thọ tính bằng phút. Sau mỗi 5 phút làm bài thi, cần có cơ chế Re-auth chéo để đảm bảo phiên kết nối không bị "Hijacked" (Cướp quyền điều khiển) giữa chừng.


| Chọn cam và mic |                         |                         |                         |                         |
|-----------------|-------------------------|-------------------------|-------------------------|-------------------------|
| **Check mic**   | Đọc theo màn hình       | Kiểm tra môi trường     | Nhận dạng giọng nói     |                         |
| **Check cam**   | Khuôn mặt điểm danh (liên tục) | Lineness              | Mắt và hướng            | Vật cấm và người (liên tục) | Giám sát online |
| **Hệ thống**    | Tiến trình (Liên tục)  | Logging (liên tục)      | Số lượng màn và cam     |                         |
