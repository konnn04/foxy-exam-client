import { getEcho, socket } from "./socket";
import { CHANNEL_NAMES, BROADCAST_EVENTS } from '@/config';

export const connectExamSocket = () => {
  return getEcho();
};

export const joinExamRoom = (examId: number|string, options: any) => {
  const echo = connectExamSocket();
  const channel = echo.join(CHANNEL_NAMES.EXAM_ROOM(examId));
  
  if (options.onHere) channel.here(options.onHere);
  if (options.onJoining) channel.joining(options.onJoining);
  if (options.onLeaving) channel.leaving(options.onLeaving);
  if (options.onEvent) channel.listen(BROADCAST_EVENTS.MONITOR_EVENT, options.onEvent);
  if (options.onViolation) channel.listen(BROADCAST_EVENTS.VIOLATION_REPORTED, options.onViolation);
  if (options.onError) channel.error(options.onError);

  return channel;
};

export const leaveExamRoom = (examId: number|string) => {
  const echo = socket.getInstance();
  if (echo) echo.leave(CHANNEL_NAMES.EXAM_ROOM(examId));
};

export const subscribeToWebRTCSignals = (userId: number|string, onSignal: (signal: any) => void) => {
  const echo = connectExamSocket();
  const channel = echo.private(CHANNEL_NAMES.SIGNALING(userId));
  channel.listen(BROADCAST_EVENTS.WEBRTC_SIGNAL, onSignal);
  return channel;
};

export const unsubscribeFromWebRTCSignals = (userId: number|string) => {
  const echo = socket.getInstance();
  if (echo) echo.leave(CHANNEL_NAMES.SIGNALING(userId));
};

export const listenToConnectionEvents = (onConnected: () => void, onDisconnected: () => void, onError: (err: any) => void) => {
  const echo = socket.getInstance();
  const pusher = echo?.connector?.pusher;
  if (pusher) {
    pusher.connection.bind('connected', onConnected);
    pusher.connection.bind('disconnected', onDisconnected);
    pusher.connection.bind('error', onError);
    
    return () => {
      pusher.connection.unbind('connected', onConnected);
      pusher.connection.unbind('disconnected', onDisconnected);
      pusher.connection.unbind('error', onError);
    };
  }
  return () => {};
};
