import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, LogOut, MessageCircle, Send, UserRound } from 'lucide-react';
import { acceptAdminChatConversation, closeAdminChatConversation, getAdminChatConversations, markAdminChatRead, sendAdminChatMessage } from '../../services/api';
import { useSocket } from '../../context/SocketContext';

export default function ChatTab({ onUnreadCountChange }) {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);
  const selectionInitialized = useRef(false);
  const { onEvent } = useSocket();

  const load = async () => {
    try {
      const response = await getAdminChatConversations();
      const data = response.data.data || [];
      setConversations(data);
      onUnreadCountChange?.(data.filter(item => item.unreadForAdmin).length);
      setSelectedId(current => {
        if (current && data.some(item => item.id === current)) return current;
        if (!selectionInitialized.current) {
          selectionInitialized.current = true;
          return data[0]?.id || null;
        }
        return null;
      });
    } catch (error) {
      console.error('Failed to load chats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); const timer = setInterval(load, 10000); return () => clearInterval(timer); }, []);
  useEffect(() => onEvent('chat_update', load), [onEvent]);

  const selected = conversations.find(item => item.id === selectedId);
  const selectedMessages = selected?.status === 'requested'
    ? (selected.messages || []).filter(message => message.senderType === 'customer' && /talk to an admin/i.test(message.content))
    : (selected?.messages || []);
  const selectConversation = async (conversation) => {
    setSelectedId(conversation.id);
    if (conversation.unreadForAdmin) {
      await markAdminChatRead(conversation.id).catch(() => {});
      setConversations(current => current.map(item => item.id === conversation.id ? { ...item, unreadForAdmin: false } : item));
    }
  };

  const handleReply = async event => {
    event.preventDefault();
    if (!selected || !reply.trim() || sending) return;
    setSending(true);
    try {
      const response = await sendAdminChatMessage(selected.id, reply.trim());
      setConversations(current => current.map(item => item.id === selected.id ? response.data.data : item));
      setReply('');
    } catch (error) {
      console.error('Failed to send chat reply:', error);
    } finally {
      setSending(false);
    }
  };

  const acceptConversation = async () => {
    if (!selected) return;
    try {
      const response = await acceptAdminChatConversation(selected.id);
      setConversations(current => current.map(item => item.id === selected.id ? response.data.data : item));
    } catch (error) {
      console.error('Failed to accept chat request:', error);
    }
  };

  const endConversation = async () => {
    if (!selected) return;
    try {
      await closeAdminChatConversation(selected.id);
      setShowEndConfirmation(false);
      setConversations(current => current.filter(item => item.id !== selected.id));
      setSelectedId(null);
    } catch (error) {
      console.error('Failed to end chat:', error);
    }
  };

  if (loading) return <div className="p-8 text-center text-surface-500">Loading customer chats...</div>;

  return (
    <div className="relative grid min-h-[520px] grid-cols-1 overflow-hidden rounded-3xl border border-surface-200 bg-white shadow-sm lg:min-h-[620px] lg:grid-cols-[260px_1fr]">
      <div className={`${selectedId ? 'hidden lg:block' : 'block'} border-b border-surface-200 bg-surface-50 lg:border-b-0 lg:border-r`}>
        <div className="flex items-center gap-2 border-b border-surface-200 px-4 py-3"><MessageCircle className="h-5 w-5 shrink-0 text-primary-500" /><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="font-heading font-black text-surface-900">Customer Chat</h2><span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-black text-primary-700">{conversations.length}</span></div><p className="text-[10px] font-bold uppercase tracking-widest text-surface-400">Support inbox</p></div></div>
        <div className="max-h-[220px] overflow-y-auto lg:max-h-[560px]">
          {!conversations.length && <p className="p-4 text-sm text-surface-500">No customer requests yet.</p>}
          {conversations.map(conversation => <button key={conversation.id} type="button" onClick={() => selectConversation(conversation)} className={`w-full border-b border-surface-200 px-4 py-2.5 text-left transition hover:bg-white ${selectedId === conversation.id ? 'bg-white shadow-inner' : ''}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-black text-surface-900">{conversation.customerName || 'Guest customer'}</span>{conversation.unreadForAdmin && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />}</div><p className="mt-0.5 truncate text-[11px] text-surface-500">{conversation.messages?.[conversation.messages.length - 1]?.content || 'New support conversation'}</p></button>)}
        </div>
      </div>
      <div className={`${selectedId ? 'flex' : 'hidden lg:flex'} min-h-[520px] min-w-0 flex-col lg:min-h-[620px]`}>
        {!selected ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-surface-400"><MessageCircle className="mb-3 h-10 w-10" /><p className="font-bold">Select a customer conversation</p></div> : <>
          <div className="flex items-center gap-3 border-b border-surface-200 px-4 py-3"><button type="button" onClick={() => setSelectedId(null)} className="rounded-lg p-1.5 text-surface-500 hover:bg-surface-100 lg:hidden" aria-label="Back to conversations"><ArrowLeft className="h-5 w-5" /></button><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600"><UserRound className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate font-black text-surface-900">{selected.customerName || 'Guest customer'}</p><p className="truncate text-xs text-surface-500">{selected.customerEmail || 'No email provided'}</p></div>{selected.status === 'open' && <button type="button" onClick={() => setShowEndConfirmation(true)} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-surface-500 transition hover:bg-red-50 hover:text-red-600" aria-label="End conversation"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">End chat</span></button>}</div>
          <div className="flex-1 space-y-2 overflow-y-auto bg-surface-50 p-4">{selectedMessages.map(message => <div key={message.id} className={`flex ${message.senderType === 'admin' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm ${message.senderType === 'admin' ? 'rounded-br-sm bg-primary-500 text-white' : message.senderType === 'bot' ? 'bg-white text-surface-600 shadow-sm' : 'rounded-bl-sm bg-white text-surface-800 shadow-sm'}`}>{message.senderType === 'admin' && <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-white/70">You</p>}{message.content}</div></div>)}</div>
          {selected.status === 'requested' ? <div className="border-t border-surface-200 bg-amber-50 p-3"><button type="button" onClick={acceptConversation} className="w-full rounded-xl bg-primary-500 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary-500/20 transition hover:bg-primary-600">Accept chat request</button><p className="mt-1.5 text-center text-[11px] font-semibold text-amber-800">The customer is waiting for you to accept this request.</p></div> : <form onSubmit={handleReply} className="flex gap-2 border-t border-surface-200 bg-white p-3"><input value={reply} onChange={event => setReply(event.target.value)} placeholder="Reply to customer..." className="min-w-0 flex-1 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm outline-none focus:border-primary-400" /><button type="submit" disabled={!reply.trim() || sending} className="flex items-center gap-2 rounded-xl bg-primary-500 px-3 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"><Send className="h-4 w-4" /> <span className="hidden sm:inline">Reply</span></button></form>}
        </>}
      </div>
      {showEndConfirmation && selected && <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><h3 className="font-heading text-lg font-black text-surface-900">End this conversation?</h3><p className="mt-2 text-sm leading-relaxed text-surface-500">The customer will need to request admin support again if they want to continue later.</p><div className="mt-5 flex gap-2"><button type="button" onClick={() => setShowEndConfirmation(false)} className="flex-1 rounded-xl border border-surface-200 px-4 py-2.5 text-sm font-bold text-surface-600 transition hover:bg-surface-50">Cancel</button><button type="button" onClick={endConversation} className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-red-600">End conversation</button></div></div></div>}
    </div>
  );
}
