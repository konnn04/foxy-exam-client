# Foxy Exam — exam-client: cấu trúc & luồng (tóm tắt)

## Vai trò

Ứng dụng thí sinh (Foxy Exam) (Vite + React + Electron tùy chọn): đăng nhập OAuth, làm bài, **LiveKit** (camera/screen), khóa thi (`use-exam-lockdown`), báo cáo vi phạm (`use-evidence-recorder`), Echo/Reverb (`use-exam-socket`).

## Thư mục chính

| Thư mục / file | Trách nhiệm |
|----------------|-------------|
| `src/pages/` | Route-level: `exam-take` (precheck → session), dashboard, login, … |
| `src/components/exam/` | UI thi: `exam-take-sections` (top nav + nội dung câu hỏi), `webcam-popup`, `camera-check`, `proctoring-config-summary`, `markdown-exam-content` |
| `src/components/ui/` | Shadcn/Radix primitives |
| `src/hooks/` | `use-exam-socket`, `use-evidence-recorder`, `use-exam-lockdown`, `use-face-monitor`, `use-exam-history-lock`, … |
| `src/services/` | `auth.service`, `proctor.service`, `exam-monitor.service`, `chat.service` — gọi API axios |
| `src/stores/` | **Zustand**: `use-exam-store` (timer), `use-proctor-store` (cảnh báo mặt), `use-exam-socket` export từ hook |
| `src/lib/` | `api.ts`, `livekit-publisher.ts`, `echo.ts`, `exit-fullscreen.ts`, … |
| `src/config/` | `security.config`, `api.config`, env, timing |
| `src/i18n/` | `i18next` + `locales/vi.json`, `en.json` |
| `electron/` | Main window, fullscreen, hooks native |

## Luồng thi

1. **`ExamTakePage`**: phase `precheck` → `exam`.
2. **`ExamPrecheck`**: tải config → **bước đọc quy định giám sát** (`ProctoringConfigSummary`) → camera → (face / hướng / môi trường tùy config) → `onComplete` gọi API `begin`.
3. **`ExamSession`**: socket + LiveKit + timer + **`ExamTopNav`** (điều hướng câu trên cùng) + **`ExamMainContent`** + **`WebcamPopup`** (góc trái dưới, `fixed`) + status bar + chat.

## Markdown câu hỏi

`MarkdownExamContent`: `remark-gfm` + tùy chọn `rehype-raw`; khối lệnh ` ``` ` render qua `<pre><code>` tối màu, scroll ngang; inline `` ` `` vẫn trong `prose`.

## i18n

`main.tsx` import `@/i18n`. Đổi ngôn ngữ: `setExamLocale('vi' | 'en')` (lưu `localStorage`). Chuỗi UI thi/precheck dùng `useTranslation()`; toast/API lỗi máy chủ có thể vẫn tiếng Việt cố định.

## Fullscreen & lịch sử

- `exitExamFullscreen()`: Electron `setFullScreen(false)` + `document.exitFullscreen()`.
- Gọi trước khi `navigate` sau nộp bài / đình chỉ / poll phát hiện đã nộp.
- `useExamHistoryLock`: `popstate` → push lại URL + toast (giảm thoát bằng nút Back trình duyệt).
