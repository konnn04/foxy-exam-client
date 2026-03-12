import { examSocket } from './exam-socket';

// ─── Types ──────────────────────────────────────────────────────────
interface WebRTCConfig {
  examId: number;
  localStream: MediaStream;
  onRemoteStream?: (stream: MediaStream, fromUserId: number) => void;
}

interface SignalData {
  signalType: string;
  data: any;
  fromUserId: number;
  toUserId: number;
  examId: number;
}

// ─── STUN/TURN Configuration ────────────────────────────────────────
const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// ─── WebRTCService ──────────────────────────────────────────────────
class WebRTCService {
  private connections: Map<number, RTCPeerConnection> = new Map();
  private dataChannels: Map<number, RTCDataChannel> = new Map();
  private localStream: MediaStream | null = null;
  private onRemoteStream?: (stream: MediaStream, fromUserId: number) => void;
  private signalHandler: ((event: CustomEvent) => void) | null = null;

  init(config: WebRTCConfig): void {
    this.localStream = config.localStream;
    this.onRemoteStream = config.onRemoteStream;

    this.signalHandler = ((event: CustomEvent<SignalData>) => {
      this.handleSignal(event.detail);
    }) as any;
    window.addEventListener('webrtc-signal', this.signalHandler as any);

    console.log('[WebRTC] Initialized');
  }

  private async handleSignal(signal: SignalData): Promise<void> {
    const { signalType, data, fromUserId } = signal;

    switch (signalType) {
      case 'request-stream':
        // Teacher is requesting our camera stream
        await this.createOffer(fromUserId);
        break;

      case 'offer':
        await this.handleOffer(fromUserId, data);
        break;

      case 'answer':
        await this.handleAnswer(fromUserId, data);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(fromUserId, data);
        break;

      case 'stop-stream':
        this.closeConnection(fromUserId);
        break;
    }
  }

  /**
   * Create an offer and initiate a peer connection with a remote user.
   */
  async createOffer(remoteUserId: number): Promise<void> {
    const pc = this.createPeerConnection(remoteUserId);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Create data channel for face crops and other data
    const dc = pc.createDataChannel('exam-data', { ordered: true });
    this.setupDataChannel(dc, remoteUserId);

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await examSocket.sendSignal('offer', {
      sdp: pc.localDescription,
    }, remoteUserId);
  }

  /**
   * Handle an incoming SDP offer.
   */
  private async handleOffer(fromUserId: number, data: any): Promise<void> {
    const pc = this.createPeerConnection(fromUserId);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await examSocket.sendSignal('answer', {
      sdp: pc.localDescription,
    }, fromUserId);
  }

  /**
   * Handle an incoming SDP answer.
   */
  private async handleAnswer(fromUserId: number, data: any): Promise<void> {
    const pc = this.connections.get(fromUserId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    }
  }

  /**
   * Handle an incoming ICE candidate.
   */
  private async handleIceCandidate(fromUserId: number, data: any): Promise<void> {
    const pc = this.connections.get(fromUserId);
    if (pc && data.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.warn('[WebRTC] Failed to add ICE candidate:', e);
      }
    }
  }

  /**
   * Create a new RTCPeerConnection for a remote user.
   */
  private createPeerConnection(remoteUserId: number): RTCPeerConnection {
    // Close existing connection if any
    this.closeConnection(remoteUserId);

    const pc = new RTCPeerConnection(ICE_CONFIG);
    this.connections.set(remoteUserId, pc);

    // ICE candidate handling
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await examSocket.sendSignal('ice-candidate', {
          candidate: event.candidate,
        }, remoteUserId);
      }
    };

    // Remote stream handling
    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track received from user:', remoteUserId);
      if (event.streams[0] && this.onRemoteStream) {
        this.onRemoteStream(event.streams[0], remoteUserId);
      }
    };

    // Data channel handling (for incoming data channels)
    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, remoteUserId);
    };

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state (${remoteUserId}):`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.connections.delete(remoteUserId);
        this.dataChannels.delete(remoteUserId);
      }
    };

    return pc;
  }

  /**
   * Setup a data channel for sending/receiving arbitrary data.
   */
  private setupDataChannel(dc: RTCDataChannel, remoteUserId: number): void {
    this.dataChannels.set(remoteUserId, dc);

    dc.onopen = () => {
      console.log(`[WebRTC] Data channel open with user ${remoteUserId}`);
    };

    dc.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[WebRTC] Data channel message:', message);
        // Handle incoming data channel messages (face crop results, etc.)
        window.dispatchEvent(new CustomEvent('webrtc-data', { detail: { fromUserId: remoteUserId, ...message } }));
      } catch (e) {
        console.warn('[WebRTC] Failed to parse data channel message');
      }
    };

    dc.onclose = () => {
      this.dataChannels.delete(remoteUserId);
    };
  }

  /**
   * Send a face crop image via the data channel to a specific user.
   * Falls back to REST API if data channel is not available.
   */
  async sendFaceCrop(imageBase64: string, toUserId?: number): Promise<void> {
    if (toUserId) {
      const dc = this.dataChannels.get(toUserId);
      if (dc && dc.readyState === 'open') {
        dc.send(JSON.stringify({
          type: 'face_crop',
          image: imageBase64,
          timestamp: new Date().toISOString(),
        }));
        return;
      }
    }

    // Fallback: upload via REST API
    await examSocket.uploadFaceCrop(imageBase64);
  }

  /**
   * Close a specific peer connection.
   */
  closeConnection(remoteUserId: number): void {
    const pc = this.connections.get(remoteUserId);
    if (pc) {
      pc.close();
      this.connections.delete(remoteUserId);
    }

    const dc = this.dataChannels.get(remoteUserId);
    if (dc) {
      dc.close();
      this.dataChannels.delete(remoteUserId);
    }
  }

  /**
   * Close all connections and clean up.
   */
  destroy(): void {
    // Remove signal listener
    if (this.signalHandler) {
      window.removeEventListener('webrtc-signal', this.signalHandler as any);
      this.signalHandler = null;
    }

    // Close all peer connections
    this.connections.forEach((pc) => {
      pc.close();
    });
    this.connections.clear();

    // Close all data channels
    this.dataChannels.forEach((dc) => {
      dc.close();
    });
    this.dataChannels.clear();

    this.localStream = null;
    this.onRemoteStream = undefined;

    console.log('[WebRTC] Destroyed');
  }

  // ─── Getters ──────────────────────────────────────────────────
  getConnectionCount(): number {
    return this.connections.size;
  }

  isConnectionActive(userId: number): boolean {
    const pc = this.connections.get(userId);
    return pc?.connectionState === 'connected';
  }
}

// Export singleton
export const webrtcService = new WebRTCService();
