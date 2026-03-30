import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useToastCustom } from "@/hooks/use-toast-custom";
import type { ExamTrackingConfig } from "@/types/exam";
import { ExamPrecheck } from "./exam-take/exam-precheck";
import { ExamSession } from "./exam-take/exam-session";

export default function ExamTakePage() {
  const { examId, attemptId } = useParams<{
    examId: string;
    attemptId: string;
  }>();
  
  const navigate = useNavigate();
  const toast = useToastCustom();

  const [phase, setPhase] = useState<"precheck" | "exam">("precheck");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [examConfig, setExamConfig] = useState<ExamTrackingConfig | null>(null);

  const handlePrecheckComplete = useCallback(
    async (
      camStream: MediaStream | null,
      scrStream: MediaStream | null,
      config: ExamTrackingConfig,
      _proctorConfig: any
    ) => {
      setCameraStream(camStream);
      setScreenStream(scrStream);
      setExamConfig(config);

      try {
        if (examId && attemptId) {
          await api.post(`/student/exams/${examId}/take/${attemptId}/begin`);
        }
        setPhase("exam");
      } catch (e) {
        console.error(e);
        toast.error("Không thể kết nối máy chủ để bắt đầu tính giờ làm bài.");
        navigate("/dashboard");
      }
    },
    [examId, attemptId, toast, navigate]
  );

  if (!examId || !attemptId) return null;

  if (phase === "precheck") {
    return (
      <ExamPrecheck 
        examId={examId} 
        attemptId={attemptId} 
        onComplete={handlePrecheckComplete} 
      />
    );
  }

  if (phase === "exam" && examConfig) {
    return (
      <ExamSession
        examId={examId}
        attemptId={attemptId}
        cameraStream={cameraStream}
        initialScreenStream={screenStream}
        config={examConfig}
      />
    );
  }

  return null;
}
