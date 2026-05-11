import { API_ENDPOINTS } from "@/config";
/**
 * LiveKit Publisher Service - Publishes camera + screen tracks to a LiveKit room.
 *
 * Used by the student exam client to stream media to the SFU server,
 * which the proctor can subscribe to in real-time.
 */
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type LocalTrack,
  type LocalTrackPublication,
  type RemoteParticipant,
} from "livekit-client";
import api from "./api";

export interface LiveKitPublisherConnectOptions {
  /** When false, connect without waiting for supervisor-agent room presence (e.g. precheck + mobile QR). */
  requireSupervisorAgent?: boolean;
}

interface LiveKitPublisherConfig {
  examId: number;
  attemptId?: number;
  onConnectionChange?: (state: ConnectionState) => void;
  onError?: (error: string) => void;
}

class LiveKitPublisher {
  private room: Room | null = null;
  private examId: number = 0;
  private onConnectionChange?: (state: ConnectionState) => void;
  private onError?: (error: string) => void;
  private connectMutex: Promise<boolean> | null = null;
  private roomPresenceOk: { examId: number; attemptId: number } | null = null;
  private lastCameraPublishSig: string | null = null;
  private lastScreenPublishSig: string | null = null;
  // private connectAbortController: AbortController | null = null;

  private hasRoomPresenceOk(examId: number, attemptId: number): boolean {
    return (
      this.roomPresenceOk !== null &&
      this.roomPresenceOk.examId === examId &&
      this.roomPresenceOk.attemptId === attemptId
    );
  }

  private markRoomPresenceOk(examId: number, attemptId: number): void {
    this.roomPresenceOk = { examId, attemptId };
  }

  private async waitForSupervisorAgentInRoom(
    examId: number,
    attemptId: number,
    maxWaitMs = 180_000,
    pollMs = 2_500,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      if (signal?.aborted) return false;
      try {
        const res = await api.get(API_ENDPOINTS.EXAM_PROCTOR_AGENT_IN_ROOM(examId), {
          params: { attempt_id: attemptId },
          signal,
        });
        if (res.data?.gating_disabled === true || res.data?.agent_in_room === true) {
          return true;
        }
      } catch (err: any) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return false;
        /* retry */
      }
      
      if (signal?.aborted) return false;
      
      // Cancellable sleep
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollMs);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        }
      });
    }
    return false;
  }

  /**
   * Join the student LiveKit room if needed. Reuses an existing connection for the same exam.
   */
  async ensureConnected(
    config: LiveKitPublisherConfig,
    options?: LiveKitPublisherConnectOptions,
  ): Promise<boolean> {
    if (this.connectMutex) {
      return this.connectMutex;
    }
    this.connectMutex = this.runEnsureConnected(config, options).finally(() => {
      this.connectMutex = null;
    });
    return this.connectMutex;
  }

  private async runEnsureConnected(
    config: LiveKitPublisherConfig,
    options?: LiveKitPublisherConnectOptions,
  ): Promise<boolean> {
    const requireSupervisorAgent = options?.requireSupervisorAgent !== false;
    this.onConnectionChange = config.onConnectionChange ?? this.onConnectionChange;
    this.onError = config.onError ?? this.onError;

    const alreadyConnected =
      this.room?.state === ConnectionState.Connected && this.examId === config.examId;

    if (alreadyConnected) {
      if (
        requireSupervisorAgent &&
        config.attemptId != null &&
        !this.hasRoomPresenceOk(config.examId, config.attemptId)
      ) {
        const inRoom = await this.waitForSupervisorAgentInRoom(config.examId, config.attemptId);
        if (!inRoom) {
          this.onError?.(
            "Giám sát AI chưa vào phòng thi. Vui lòng đợi thêm hoặc liên hệ giám thị.",
          );
          return false;
        }
        this.markRoomPresenceOk(config.examId, config.attemptId);
      }
      return true;
    }

    this.disconnect();
    this.examId = config.examId;

    try {
      if (config.attemptId == null) {
        this.onError?.("Thiếu mã lượt thi để kết nối giám sát LiveKit.");
        return false;
      }

      const res = await api.get(API_ENDPOINTS.EXAM_PROCTOR_TOKEN(this.examId), {
        params: { attempt_id: config.attemptId },
      });
      const { token, ws_url } = res.data;

      this.room = new Room({
        adaptiveStream: false,
        dynacast: true,
      });

      this.room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        console.log(`[LiveKitPublisher] Connection state: ${state}`);
        this.onConnectionChange?.(state);
      });

      this.room.on(RoomEvent.Disconnected, () => {
        console.warn("[LiveKitPublisher] Disconnected from room");
        this.onConnectionChange?.(ConnectionState.Disconnected);
      });

      await this.room.connect(ws_url, token);
      console.log("[LiveKitPublisher] Connected to LiveKit room:", this.room.name, "as", this.room.localParticipant?.identity);
      this.startProctorCommandListener();

      if (
        requireSupervisorAgent &&
        config.attemptId != null &&
        !this.hasRoomPresenceOk(config.examId, config.attemptId)
      ) {
        const inRoom = await this.waitForSupervisorAgentInRoom(config.examId, config.attemptId);
        if (!inRoom) {
          this.disconnect();
          this.onError?.(
            "Giám sát AI chưa vào phòng thi. Vui lòng đợi thêm hoặc liên hệ giám thị.",
          );
          return false;
        }
        this.markRoomPresenceOk(config.examId, config.attemptId);
      }

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "LiveKit connection failed";
      console.error("[LiveKitPublisher] Failed to connect:", msg);
      this.onError?.(msg);
      return false;
    }
  }

  async connect(config: LiveKitPublisherConfig): Promise<boolean> {
    return this.ensureConnected(config, { requireSupervisorAgent: true });
  }

  async waitForMobileRelayCameraMediaStream(timeoutMs = 120_000): Promise<MediaStream | null> {
    const room = this.room;
    if (!room || room.state !== ConnectionState.Connected) {
      console.warn("[LiveKitPublisher] waitForMobileRelay: room not connected, state =", room?.state);
      return null;
    }

    console.log("[LiveKitPublisher] waitForMobileRelay: starting, room =", room.name, ", timeout =", timeoutMs);

    const pickMobileCameraStream = (): MediaStream | null => {
      console.log("[LiveKitPublisher] pickMobile: remoteParticipants =", room.remoteParticipants.size);
      for (const p of room.remoteParticipants.values()) {
        if (!p.identity?.endsWith("-mobile")) continue;

        console.log(`[LiveKitPublisher] pickMobile: found mobile participant "${p.identity}", tracks = ${p.trackPublications.size}`);

        for (const pub of p.trackPublications.values()) {
          const info = `sid=${pub.trackSid} source=${pub.source} kind=${pub.kind} subscribed=${pub.isSubscribed} hasTrack=${!!pub.track}`;
          console.log(`[LiveKitPublisher] pickMobile:   pub ${info}`);

          // Force-subscribe if the server didn't auto-subscribe
          if (!pub.isSubscribed) {
            console.log("[LiveKitPublisher] pickMobile:   -> forcing subscribe");
            pub.setSubscribed(true);
            // track won't be available until TrackSubscribed fires – fall through
          }

          // Accept any video track from the mobile participant
          if (pub.kind === Track.Kind.Video && pub.track) {
            const mst = pub.track.mediaStreamTrack;
            console.log("[LiveKitPublisher] pickMobile:   -> track readyState =", mst?.readyState);
            if (mst && mst.readyState !== "ended") {
              console.log("[LiveKitPublisher] pickMobile:   -> ✅ FOUND VALID MOBILE STREAM");
              return new MediaStream([mst]);
            }
          }
        }
      }
      return null;
    };

    // ── Immediate check ──
    const immediate = pickMobileCameraStream();
    if (immediate) return immediate;

    // ── Async wait: events + periodic poll ──
    return new Promise<MediaStream | null>((resolve) => {
      let settled = false;
      let pollInterval: ReturnType<typeof setInterval> | null = null;

      const finish = (ms: MediaStream | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (pollInterval) clearInterval(pollInterval);
        room.off(RoomEvent.TrackSubscribed, onEvent);
        room.off(RoomEvent.ParticipantConnected, onEvent);
        room.off(RoomEvent.TrackPublished, onEvent);
        resolve(ms);
      };

      const timer = window.setTimeout(() => {
        console.warn("[LiveKitPublisher] waitForMobileRelay: TIMEOUT after", timeoutMs, "ms");
        finish(null);
      }, timeoutMs);

      const tryPick = () => {
        if (settled) return;
        const ms = pickMobileCameraStream();
        if (ms) finish(ms);
      };

      const onEvent = () => tryPick();

      room.on(RoomEvent.TrackSubscribed, onEvent);
      room.on(RoomEvent.ParticipantConnected, onEvent);
      room.on(RoomEvent.TrackPublished, onEvent);

      // Safety-net: poll every 1.5 s in case events are missed
      pollInterval = setInterval(tryPick, 1500);
    });
  }

  /**
   * Publish camera (and optional mic) from a local MediaStream.
   * Use includeVideo: false when video is already published by the phone relay (`-mobile` identity).
   */
  async publishCamera(
    stream: MediaStream,
    opts?: { includeVideo?: boolean; includeAudio?: boolean },
  ): Promise<LocalTrackPublication[]> {
    if (!this.room || this.room.state !== ConnectionState.Connected) {
      console.warn("[LiveKitPublisher] Not connected, cannot publish camera");
      return [];
    }

    const includeVideo = opts?.includeVideo !== false;
    const includeAudio = opts?.includeAudio !== false;

    const vidId = includeVideo ? stream.getVideoTracks()[0]?.id ?? "" : "";
    const audId = includeAudio ? stream.getAudioTracks()[0]?.id ?? "" : "";
    const sig = `cam:${vidId}|${audId}|v${includeVideo ? 1 : 0}|a${includeAudio ? 1 : 0}`;
    if (this.lastCameraPublishSig === sig) {
      return [];
    }

    const lp = this.room.localParticipant;
    for (const publication of lp.trackPublications.values()) {
      if (
        publication.source !== Track.Source.Camera &&
        publication.source !== Track.Source.Microphone
      ) {
        continue;
      }
      const tr = publication.track;
      if (tr) {
        try {
          await lp.unpublishTrack(tr as LocalTrack);
        } catch {
          /* ignore */
        }
      }
    }

    const publications: LocalTrackPublication[] = [];

    try {
      const videoTracks = includeVideo ? stream.getVideoTracks() : [];
      const audioTracks = includeAudio ? stream.getAudioTracks() : [];

      console.log(
        `[LiveKitPublisher] publishCamera: includeVideo=${includeVideo} includeAudio=${includeAudio} ` +
        `vidTracks=${videoTracks.length} audTracks=${audioTracks.length} ` +
        `vidStates=${videoTracks.map(t => t.readyState).join(',')} ` +
        `audStates=${audioTracks.map(t => t.readyState).join(',')}`
      );

      for (const track of videoTracks) {
        if (track.readyState === 'ended') {
          console.warn('[LiveKitPublisher] publishCamera: video track already ended, skipping');
          continue;
        }
        const pub = await this.room!.localParticipant.publishTrack(track, {
          source: Track.Source.Camera,
          name: "camera",
        });
        publications.push(pub);
      }

      for (const track of audioTracks) {
        const pub = await this.room!.localParticipant.publishTrack(track, {
          source: Track.Source.Microphone,
          name: "microphone",
        });
        publications.push(pub);
      }

      console.log(`[LiveKitPublisher] Published camera: ${publications.length} tracks`);
      this.lastCameraPublishSig = sig;
    } catch (err) {
      console.error("[LiveKitPublisher] Failed to publish camera:", err);
      this.lastCameraPublishSig = null;
    }

    return publications;
  }

  /**
   * Publish screen share stream to the room.
   */
  async publishScreen(stream: MediaStream): Promise<LocalTrackPublication[]> {
    if (!this.room || this.room.state !== ConnectionState.Connected) {
      console.warn("[LiveKitPublisher] Not connected, cannot publish screen");
      return [];
    }

    const screenId = stream.getVideoTracks()[0]?.id ?? "";
    const screenSig = `scr:${screenId}`;
    if (this.lastScreenPublishSig === screenSig) {
      return [];
    }

    const lp = this.room.localParticipant;
    for (const publication of lp.trackPublications.values()) {
      if (publication.source !== Track.Source.ScreenShare) continue;
      const tr = publication.track;
      if (tr) {
        try {
          await lp.unpublishTrack(tr as LocalTrack);
        } catch {
          /* ignore */
        }
      }
    }

    const publications: LocalTrackPublication[] = [];

    try {
      const videoTracks = stream.getVideoTracks();

      console.log(
        `[LiveKitPublisher] publishScreen: vidTracks=${videoTracks.length} ` +
        `vidStates=${videoTracks.map(t => t.readyState).join(',')}`
      );

      for (const track of videoTracks) {
        if (track.readyState === 'ended') {
          console.warn('[LiveKitPublisher] publishScreen: video track already ended, skipping');
          continue;
        }
        const pub = await this.room!.localParticipant.publishTrack(track, {
          source: Track.Source.ScreenShare,
          name: "screen",
        });
        publications.push(pub);
      }

      console.log(`[LiveKitPublisher] Published screen: ${publications.length} tracks`);
      this.lastScreenPublishSig = screenSig;
    } catch (err) {
      console.error("[LiveKitPublisher] Failed to publish screen:", err);
      this.lastScreenPublishSig = null;
    }

    return publications;
  }

  async requestAgentSnapshots(
    violationId: number,
    examId: number,
    attemptId: number,
  ): Promise<void> {
    const body = new TextEncoder().encode(
      JSON.stringify({
        violation_id: violationId,
        exam_id: examId,
        attempt_id: attemptId,
      }),
    );
    const publishOnce = async (): Promise<boolean> => {
      if (!this.room || this.room.state !== ConnectionState.Connected) {
        return false;
      }
      try {
        await this.room.localParticipant.publishData(body, {
          reliable: true,
          topic: "proctor_snap_request",
        });
        return true;
      } catch (err) {
        console.error("[LiveKitPublisher] requestAgentSnapshots publishData failed:", err);
        return false;
      }
    };

    if (await publishOnce()) {
      return;
    }
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 400));
      if (await publishOnce()) {
        return;
      }
    }
    console.warn(
      "[LiveKitPublisher] requestAgentSnapshots: room not connected after retries; agent snapshots skipped",
    );
  }


  async publishTelemetry(data: Uint8Array, topic: string): Promise<void> {
    if (!this.room || this.room.state !== ConnectionState.Connected) {
      throw new Error("Not connected to LiveKit room");
    }
    await this.room.localParticipant.publishData(data, {
      reliable: true,
      topic,
    });
  }

  private proctorCommandListenerActive = false;


  startProctorCommandListener(): void {
    if (this.proctorCommandListenerActive || !this.room) return;
    this.proctorCommandListenerActive = true;

    const handler = async (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== "proctor_command") return;
      const id = participant?.identity ?? "";
      const fromSupervisorAgent = id.startsWith("agent");
      if (!fromSupervisorAgent) {
        if (!participant?.metadata) return;
        let meta: Record<string, unknown> = {};
        try {
          meta = JSON.parse(participant.metadata);
        } catch {
          return;
        }
        if (meta.role !== "proctor") return;
      }

      let msg: { type: string; [k: string]: unknown };
      try { msg = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }

      console.log("[LiveKitPublisher] Proctor command:", msg.type);

      if (msg.type === "request_process_list") {
        await this.handleProcessListRequest(participant.identity);
      } else if (msg.type === "kill_process") {
        await this.handleKillProcess(
          participant.identity,
          msg.pid as number,
          msg.name as string,
        );
      } else if (msg.type === "request_mobile_face_check") {
        window.dispatchEvent(new CustomEvent("exam:mobile_face_check"));
      } else if (msg.type === "mobile_face_check_done") {
        window.dispatchEvent(new CustomEvent("exam:mobile_face_check_done"));
      }
    };

    this.room.on(RoomEvent.DataReceived, handler);
    console.log("[LiveKitPublisher] Proctor command listener started");
  }

  private async handleProcessListRequest(proctorIdentity: string): Promise<void> {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.getProcessList) return;

      const processes = await electronAPI.getProcessList();
      const data = new TextEncoder().encode(
        JSON.stringify({ type: "process_list_response", processes }),
      );
      await this.room?.localParticipant.publishData(data, {
        reliable: true,
        topic: "proctor_response",
        destinationIdentities: [proctorIdentity],
      });
    } catch (err) {
      console.error("[LiveKitPublisher] handleProcessListRequest error:", err);
    }
  }

  private async handleKillProcess(
    proctorIdentity: string,
    pid: number,
    name: string,
  ): Promise<void> {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.killProcessByPid) {
        await this.sendProctorResponse(proctorIdentity, {
          type: "kill_process_result",
          pid, name, success: false, error: "API not available",
        });
        return;
      }

      const result = await electronAPI.killProcessByPid(pid, name);
      await this.sendProctorResponse(proctorIdentity, {
        type: "kill_process_result",
        pid, name, ...result,
      });
    } catch (err) {
      console.error("[LiveKitPublisher] handleKillProcess error:", err);
      await this.sendProctorResponse(proctorIdentity, {
        type: "kill_process_result",
        pid, name, success: false, error: "Client error",
      });
    }
  }

  private async sendProctorResponse(
    proctorIdentity: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const data = new TextEncoder().encode(JSON.stringify(payload));
    await this.room?.localParticipant.publishData(data, {
      reliable: true,
      topic: "proctor_response",
      destinationIdentities: [proctorIdentity],
    });
  }

  /**
   * Disconnect from the room and unpublish all tracks.
   */
  disconnect(): void {
    if (this.room) {
      try {
        this.room.disconnect();
      } catch {
        /* ignore */
      }
      this.room = null;
    }
    this.examId = 0;
    this.proctorCommandListenerActive = false;
    this.roomPresenceOk = null;
    this.lastCameraPublishSig = null;
    this.lastScreenPublishSig = null;
    console.log("[LiveKitPublisher] Disconnected");
  }


  get isConnected(): boolean {
    return this.room?.state === ConnectionState.Connected;
  }

  /** Remote `-mobile` participant has a live video track (dual-cam relay). */
  hasActiveMobileRelayVideo(): boolean {
    const room = this.room;
    if (!room || room.state !== ConnectionState.Connected) {
      return false;
    }
    for (const p of room.remoteParticipants.values()) {
      if (!p.identity?.endsWith("-mobile")) continue;
      for (const pub of p.trackPublications.values()) {
        if (pub.kind !== Track.Kind.Video || !pub.track) continue;
        const mst = pub.track.mediaStreamTrack;
        if (mst && mst.readyState === "live") {
          return true;
        }
      }
    }
    return false;
  }

  /** Local exam webcam track is live (not ended / muted-away). */
  hasAliveLocalCameraVideo(stream: MediaStream | null): boolean {
    const t = stream?.getVideoTracks()[0];
    return Boolean(t && t.readyState === "live");
  }
}

export const livekitPublisher = new LiveKitPublisher();
