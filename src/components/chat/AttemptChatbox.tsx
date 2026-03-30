import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { useToastCustom } from '@/hooks/use-toast-custom';
import { chatService, type ChatMessage } from '@/services/chat.service';
import { connectExamSocket } from '@/sockets/exam.socket';
import { CHANNEL_NAMES, BROADCAST_EVENTS } from '@/config';

interface AttemptChatboxProps {
  examId: number;
  attemptId: number;
  currentUserId: number;
  isOpen: boolean;
  onClose: () => void;
  onNewMessage: () => void;
}

export function AttemptChatbox({ examId, attemptId, currentUserId, isOpen, onClose, onNewMessage }: AttemptChatboxProps) {
  const toast = useToastCustom();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stable refs so the Echo listener never goes stale
  const onNewMessageRef = useRef(onNewMessage);
  onNewMessageRef.current = onNewMessage;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // Fetch history on mount
  useEffect(() => {
    chatService.getHistory(examId, attemptId)
      .then(res => setMessages(res.data.chats || []))
      .catch(err => console.error('[Chat] Failed to fetch history', err));
  }, [examId, attemptId]);

  // Listen to Echo channel (subscribe once per attempt)
  useEffect(() => {
    const channelName = CHANNEL_NAMES.CHAT_ATTEMPT(attemptId);
    const echo = connectExamSocket();

    if (echo) {
      echo.private(channelName)
        .listen(BROADCAST_EVENTS.CHAT_MESSAGE, (e: { chat: ChatMessage }) => {
          setMessages((prev) => {
            if (prev.some(m => m.id === e.chat.id)) return prev;
            return [...prev, e.chat];
          });
          if (e.chat.sender_id !== currentUserId) {
            const audio = new Audio('/sfx/viber-message-sound.mp3');
            audio.play().catch(() => {});
            onNewMessageRef.current();
            toastRef.current.info('💬 Tin nhắn mới', `Từ ${e.chat.sender.first_name} ${e.chat.sender.last_name}`);
          }
        });
    }

    return () => {
      if (echo) echo.leave(channelName);
    };
  }, [examId, attemptId, currentUserId]);

  // Scroll to bottom
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setIsLoading(true);
    setInput('');
    try {
      const res = await chatService.sendMessage(examId, attemptId, msg);
      if (res.data?.chat) {
        setMessages(prev => {
          // Avoid duplicate if Echo already handled it
          if (prev.some(m => m.id === res.data.chat.id)) return prev;
          return [...prev, res.data.chat];
        });
      }
    } catch {
      toast.error('Gửi tin nhắn thất bại');
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, examId, attemptId, toast]);

  // (Removed duplicate scroll useEffect)

  if (!isOpen) return null;

  return (
    <div
      className="fixed bottom-20 right-4 w-80 h-[420px] flex flex-col overflow-hidden rounded-xl shadow-2xl border"
      style={{ background: 'var(--card)', zIndex: 10000, borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b"
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
      >
        <div className="flex items-center gap-2">
          <MessageCircle size={16} />
          <h3 className="font-semibold text-sm">Chat với Giám thị</h3>
        </div>
        <button className="h-6 w-6 flex items-center justify-center rounded hover:opacity-70" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 p-3 overflow-y-auto" ref={scrollRef} style={{ background: 'var(--muted)' }}>
        <div className="flex flex-col gap-3">
          {messages.length === 0 ? (
            <div className="text-center text-xs mt-8" style={{ color: 'var(--muted-foreground)' }}>
              Chưa có tin nhắn nào.<br />Gửi tin nhắn để bắt đầu cuộc trò chuyện.
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === currentUserId;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} gap-0.5`}>
                  <span className="text-[10px] mx-1" style={{ color: 'var(--muted-foreground)' }}>
                    {isMe ? 'Bạn' : `[${msg.sender_role.toUpperCase()}] ${msg.sender.first_name} ${msg.sender.last_name}`} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div
                    className={`px-3 py-1.5 rounded-xl text-sm max-w-[85%] ${isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
                    style={isMe
                      ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                      : { background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)' }
                    }
                  >
                    {msg.message}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="px-3 py-2 border-t flex gap-2" style={{ background: 'var(--card)' }}>
        <input
          type="text"
          className="flex-1 px-3 py-1.5 text-sm border rounded-lg outline-none"
          style={{ background: 'var(--background)' }}
          placeholder="Nhập tin nhắn..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              handleSend(e as unknown as React.FormEvent);
            }
          }}
          disabled={isLoading}
        />
        <button
          type="submit"
          className="h-8 w-8 flex items-center justify-center rounded-lg disabled:opacity-50"
          style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          disabled={!input.trim() || isLoading}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
