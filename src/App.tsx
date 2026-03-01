import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/protected-route";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import CoursesPage from "@/pages/courses";
import CourseDetailPage from "@/pages/course-detail";
import ExamDetailPage from "@/pages/exam-detail";
import ExamTakePage from "@/pages/exam-take";
import ExamReviewPage from "@/pages/exam-review";
import HistoryPage from "@/pages/history";

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected - Dashboard Layout */}
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/:id" element={<CourseDetailPage />} />
        <Route path="/exams/:id" element={<ExamDetailPage />} />
        <Route path="/exams/:examId/review/:attemptId" element={<ExamReviewPage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Route>

      {/* Protected - Full screen (no sidebar) */}
      <Route
        path="/exams/:examId/take/:attemptId"
        element={
          <ProtectedRoute>
            <ExamTakePage />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
