import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, Headset, Send, UserRound, X } from 'lucide-react';
import { getChatConversation, getOrder, sendChatMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';

const FAQS = [
  { question: 'How do I place an order?', answer: 'Choose your products, select the available date and time, complete your contact details, then submit your payment.' },
  { question: 'Can I pay a downpayment?', answer: 'Yes. You can choose the 50% downpayment option. The remaining balance will be tracked and shown on your order.' },
  { question: 'Why was my date rejected?', answer: 'The store may be fully booked or unable to prepare the products at that time. You can request another available date from your order page.' },
  { question: 'How can I check my order?', answer: 'Open your order confirmation page using the order number you received after checkout.' },
  { question: 'How can I get an update on my order?', answer: 'order-status' }
];

const orderStatusLabel = status => ({
  pending: 'Order received and waiting for store review',
  confirmed: 'Payment confirmed',
  booked: 'Order booked',
  preparing: 'Order is being prepared',
  ready: 'Order is ready for pickup',
  on_the_way: 'Order is on the way',
  completed: 'Order completed',
  cancelled: 'Order cancelled'
}[status] || 'Order status is being updated');

function makeSessionId() {
  const existing = localStorage.getItem('pos_chat_session');
  if (existing) return existing;
  const value = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem('pos_chat_session', value);
  return value;
}

export default function CustomerChat() {
  const location = useLocation();
  const { user } = useAuth();
  const sessionId = useMemo(makeSessionId, []);
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const loadConversation = async () => {
    try {
      const response = await getChatConversation(sessionId);
      const data = response.data.data;
      if (data) {
        setConversation(data);
        setMessages(data.messages || []);
      }
    } catch {
      // The bot remains available even if the support service is temporarily offline.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadConversation();
    const timer = setInterval(() => {
      if (open) loadConversation();
    }, 10000);
    return () => clearInterval(timer);
  }, [open, sessionId]);

  const send = async (content, escalate = false) => {
    const text = String(content || '').trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const response = await sendChatMessage({
        sessionId,
        content: text,
        escalate,
        customerId: user?.id,
        customerName: user?.name,
        customerEmail: user?.email
      });
      const data = response.data.data;
      setConversation(data);
      setMessages(data.messages || []);
      setInput('');

      const orderMatch = !escalate && text.match(/\b(?:POS-)?(\d{5})\b/i);
      if (orderMatch) {
        try {
          const orderResponse = await getOrder(orderMatch[1]);
          const order = orderResponse.data.data;
          const schedule = order.scheduleStatus === 'rejected'
            ? ' The requested schedule was rejected.'
            : order.scheduleStatus === 'confirmed'
              ? ' The requested schedule was confirmed.'
              : '';
          setMessages(current => [...current, {
            id: `status-${Date.now()}`,
            senderType: 'bot',
            content: `Order #${order.orderNumber}: ${orderStatusLabel(order.status)}. Payment: ${order.paymentStatus || 'unpaid'}.${schedule}`
          }]);
        } catch {
          setMessages(current => [...current, { id: `status-error-${Date.now()}`, senderType: 'bot', content: 'I could not find that order. Please check the order number and try again.' }]);
        }
      }
    } catch {
      setMessages(current => [...current, { id: `error-${Date.now()}`, senderType: 'bot', content: 'Sorry, support is temporarily unavailable. Please try again.' }]);
    } finally {
      setSending(false);
    }
  };

  const askFaq = async (faq) => {
    await send(faq.question);
    setMessages(current => [...current, { id: `bot-${Date.now()}`, senderType: 'bot', content: faq.answer === 'order-status' ? 'Please enter your 5-digit order number, for example 61449.' : faq.answer }]);
  };

  const hasAdminReply = messages.some(message => message.senderType === 'admin');
  const showWelcome = !messages.length && !loading;

  if (location.pathname === '/' || location.pathname.startsWith('/admin') || location.pathname.startsWith('/superadmin')) return null;

  return (
    <div className="fixed bottom-8 right-5 z-[180] flex flex-col items-end gap-3 sm:bottom-8 sm:right-6">
      {open && (
        <div className="flex h-[min(650px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[2rem] border border-surface-200 bg-white shadow-2xl animate-scale-in">
          <div className="flex items-center justify-between bg-gradient-to-br from-primary-600 to-primary-800 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <img src="/ms.suki.png" alt="Ms. Suki" className="h-10 w-10 rounded-2xl bg-white object-cover ring-2 ring-white/30" />
              <div><p className="font-heading font-black">Ms. Suki</p><p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Store assistant</p></div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 transition hover:bg-white/15" aria-label="Close chat"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-surface-50 p-4">
            {showWelcome && <div className="rounded-2xl rounded-tl-sm bg-white p-3 text-sm text-surface-700 shadow-sm">Hi! I’m Ms. Suki, the store assistant. I can help with orders, payments, schedules, and order updates.</div>}
            {messages.map(message => (
              <div key={message.id} className={`flex ${message.senderType === 'customer' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${message.senderType === 'customer' ? 'rounded-br-sm bg-primary-500 text-white' : 'rounded-bl-sm bg-white text-surface-700'}`}>
                  {message.senderType === 'admin' && <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-primary-600">Admin reply</p>}
                  {message.content}
                </div>
              </div>
            ))}
            {(!conversation || conversation.status === 'bot') && (
              <div className="space-y-2 pt-2">
                {FAQS.map(faq => <button key={faq.question} type="button" onClick={() => askFaq(faq)} disabled={sending} className="block w-full rounded-xl border border-primary-100 bg-white px-3 py-2 text-left text-xs font-bold text-primary-700 transition hover:border-primary-300 hover:bg-primary-50">{faq.question}</button>)}
              </div>
            )}
            {conversation?.status === 'requested' && <div className="rounded-2xl rounded-tl-sm border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">Waiting for an admin to accept your chat request. Please keep this chat open for the reply.</div>}
            {conversation?.status === 'open' && !hasAdminReply && <div className="rounded-2xl rounded-tl-sm bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">An admin accepted your request. You can now chat with the store.</div>}
          </div>
          <div className="border-t border-surface-200 bg-white p-3">
            {(!conversation || conversation.status === 'bot') && <button type="button" onClick={() => send('I would like to talk to an admin.', true)} disabled={sending} className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-xs font-black uppercase tracking-wide text-primary-700 transition hover:bg-primary-100"><UserRound className="h-4 w-4" /> Talk to an admin</button>}
            <form onSubmit={event => { event.preventDefault(); send(input, conversation?.status === 'open'); }} className="flex items-center gap-2">
              <input value={input} onChange={event => setInput(event.target.value)} disabled={conversation?.status === 'requested'} placeholder={conversation?.status === 'requested' ? 'Waiting for admin acceptance...' : conversation?.status === 'open' ? 'Message the admin...' : 'Ask a question...'} className="min-w-0 flex-1 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm outline-none focus:border-primary-400 disabled:cursor-not-allowed disabled:opacity-60" />
              <button type="submit" disabled={!input.trim() || sending || conversation?.status === 'requested'} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Send message"><Send className="h-4 w-4" /></button>
            </form>
          </div>
        </div>
      )}
      <button type="button" onClick={() => setOpen(value => !value)} className={`relative flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-white shadow-xl shadow-primary-500/30 transition hover:scale-105 hover:bg-primary-600 ${!open ? 'support-attention' : ''}`} aria-label="Open support chat">
        {open ? <ChevronDown className="h-6 w-6" /> : <Headset className="h-7 w-7" strokeWidth={2.25} aria-hidden="true" />}
        {conversation?.unreadForCustomer && !open && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black ring-2 ring-white">!</span>}
      </button>
    </div>
  );
}
