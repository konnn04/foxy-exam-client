/**
 * LiveKit Publisher Service - Publishes camera + screen tracks to a LiveKit room.
 *
 * Used by the student exam client to stream media to the SFU server,
 * which the proctor can then subscribe to in real-time.
 */
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type LocalTrackPublication,
} from 'livekit-client';
import api from './api';

interface LiveKitPublisherConfig {
  examId: number;
  onConnectionChange?: (state: ConnectionState) => void;
  onError?: (error: string) => void;
}

class LiveKitPublisher {
  private room: Room | null = null;
  private examId: number = 0;
  private onConnectionChange?: (state: ConnectionState) => void;
  private onError?: (error: string) => void;

  /**
   * Connect to a LiveKit room and start publishing tracks.
   */
  async connect(config: LiveKitPublisherConfig): Promise<boolean> {
    this.examId = config.examId;
    this.onConnectionChange = config.onConnectionChange;
    this.onError = config.onError;

    try {
      // Fetch token from the backend
      const res = await api.get(`/student/exams/${this.examId}/proctor/token`);
      const { token, ws_url } = res.data;

      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      // Connection state listener
      this.room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        console.log(`[LiveKitPublisher] Connection state: ${state}`);
        this.onConnectionChange?.(state);
      });

      this.room.on(RoomEvent.Disconnected, () => {
        console.warn('[LiveKitPublisher] Disconnected from room');
        this.onConnectionChange?.(ConnectionState.Disconnected);
      });

      await this.room.connect(ws_url, token);
      console.log('[LiveKitPublisher] Connected to LiveKit room');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'LiveKit connection failed';
      console.error('[LiveKitPublisher] Failed to connect:', msg);
      this.onError?.(msg);
      return false;
    }
  }

  /**
   * Publish camera stream to the room.
   */
  async publishCamera(stream: MediaStream): Promise<LocalTrackPublication[]> {
    if (!this.room || this.room.state !== ConnectionState.Connected) {
      console.warn('[LiveKitPublisher] Not connected, cannot publish camera');
      return [];
    }

    const publications: LocalTrackPublication[] = [];

    try {
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      for (const track of videoTracks) {
        const pub = await this.room.localParticipant.publishTrack(track, {
          source: Track.Source.Camera,
          name: 'camera',
        });
        publications.push(pub);
      }

      for (const track of audioTracks) {
        const pub = await this.room.localParticipant.publishTrack(track, {
          source: Track.Source.Microphone,
          name: 'microphone',
        });
        publications.push(pub);
      }

      console.log(`[LiveKitPublisher] Published camera: ${publications.length} tracks`);
    } catch (err) {
      console.error('[LiveKitPublisher] Failed to publish camera:', err);
    }

    return publications;
  }

  /**
   * Publish screen share stream to the room.
   */
  async publishScreen(stream: MediaStream): Promise<LocalTrackPublication[]> {
    if (!this.room || this.room.state !== ConnectionState.Connected) {
      console.warn('[LiveKitPublisher] Not connected, cannot publish screen');
      return [];
    }

    const publications: LocalTrackPublication[] = [];

    try {
      const videoTracks = stream.getVideoTracks();

      for (const track of videoTracks) {
        const pub = await this.room.localParticipant.publishTrack(track, {
          source: Track.Source.ScreenShare,
          name: 'screen',
        });
        publications.push(pub);
      }

      console.log(`[LiveKitPublisher] Published screen: ${publications.length} tracks`);
    } catch (err) {
      console.error('[LiveKitPublisher] Failed to publish screen:', err);
    }

    return publications;
  }

  /**
   * Disconnect from the room and unpublish all tracks.
   */
  disconnect(): void {
    if (this.room) {
      try {
        this.room.disconnect();
      } catch { /* ignore */ }
      this.room = null;
    }
    console.log('[LiveKitPublisher] Disconnected');
  }

  /**
   * Check if connected to the room.
   */
  get isConnected(): boolean {
    return this.room?.state === ConnectionState.Connected;
  }
}

// Singleton export
export const livekitPublisher = new LiveKitPublisher();
