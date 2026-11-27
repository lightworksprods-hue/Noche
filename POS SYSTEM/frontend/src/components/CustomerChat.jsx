import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, Headset, Send, UserRound, X } from 'lucide-react';
import { getChatConversation, getOrder, getOrderHistory, getPublicTenant, markChatRead, sendChatMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { STORE_LOCATION, STORE_MAP_URL, STORE_HOURS, STORE_FACEBOOK_URL } from '../constants/storeInfo';

const FAQS = [
  { question: 'How do I place an order?', answer: 'Choose your products, select the available date and time, complete your contact details, then submit your payment.' },
  { question: 'Can I pay a downpayment?', answer: 'Yes. You can choose the 50% downpayment option. The remaining balance will be tracked and shown on your order.' },
  { question: 'Why was my date rejected?', answer: 'The store may be fully booked or unable to prepare the products at that time. You can request another available date from your order page.' },
  { question: 'How can I check my order?', answer: 'Open your order confirmation page using the order number you received after checkout.' },
  { question: 'Any updates on my order?', answer: 'order-status' }
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

const isAdminSupportAvailable = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const minutes = Number(parts.find(part => part.type === 'hour')?.value || 0) * 60 + Number(parts.find(part => part.type === 'minute')?.value || 0);
  return minutes >= 480 && minutes < 1200;
};

const getBotReply = (message, store = {}) => {
  const text = String(message || '').toLowerCase();
  const isGreeting = /\b(hi|hello|hey|kamusta|kumusta)\b/.test(text);
  const storeTopics = /\b(store|order|orders|payment|pay|price|cost|menu|product|food|lechon|schedule|date|pickup|pick up|delivery|deliver|cancel|refund|promo|available|availability|stock|contact|phone|email|hours|open|location|address|admin|support|book|booking)\b/.test(text);
  if (!isGreeting && !storeTopics) return 'I can only help with this store, our menu, orders, payments, schedules, delivery, pickup, and customer support. Please ask me something related to the store.';
  if (/\b(where|location|located|address)\b/.test(text)) {
    return `${store.name || 'Our store'} is located at ${STORE_LOCATION}.`;
  }
  if (/\b(hours|open|closing|closed)\b/.test(text)) return store.storeClosed ? `${store.name || 'The store'} is currently closed. Please check back later or contact an admin.` : `${store.name || 'The store'} is currently open. Store hours: ${STORE_HOURS}`;
  if (/\b(facebook|fb|social media)\b/.test(text)) return `You can follow ${store.name || 'our store'} on Facebook for updates and announcements.`;
  if (/\b(what('?s| is) the store|store name|who are you|about the store)\b/.test(text)) return `${store.name || 'This store'} is served by Ms. Suki, your store assistant.${store.description ? ` ${store.description}` : ''}`;
  if (isGreeting) return 'Hi! I’m Ms. Suki. How can I help you today? You can choose one of the options below or ask me a question.';
  if (text.includes('thank')) return 'You’re welcome! I’m here if you need anything else.';
  if (text.includes('payment') || text.includes('pay')) return 'You can pay by Cash or QR Ph. A 50% downpayment option is also available for eligible orders.';
  if (text.includes('schedule') || text.includes('date')) return 'I can help check your order schedule. Choose “Any updates on my order?” to select an active order.';
  if (text.includes('admin') || text.includes('human')) return isAdminSupportAvailable() ? 'You can tap “Talk to an admin” below to request help from the store team.' : 'Admin support is available from 8:00 AM to 8:00 PM. I can still help with store and order questions right now.';
  return 'I’m Ms. Suki, the store assistant. I can help with orders, payments, schedules, and order updates. Please choose an option below or tap “Talk to an admin.”';
};

const isOrderStatusRequest = message => {
  const text = String(message || '').toLowerCase();
  return (/(check|status|update|track|where|follow)/.test(text) && /\b(order|orders|booking)\b/.test(text)) ||
    (/\b(order|orders|booking)\b/.test(text) && /(status|update|track|where)/.test(text));
};

function makeSessionId() {
  const existing = localStorage.getItem('pos_chat_session');
  if (existing) return existing;
  const value = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem('pos_chat_session', value);
  return value;
}

// Automatic bot replies are intentionally handled in the browser, so they are
// not part of the conversation returned by the API. Keep them when a socket or
// polling refresh replaces the server-backed messages.
const isLocalChatMessage = message => String(message?.id || '').startsWith('bot-') ||
  String(message?.id || '').startsWith('order-picker-') ||
  String(message?.id || '').startsWith('selected-order-') ||
  String(message?.id || '').startsWith('status-') ||
  String(message?.id || '').startsWith('error-');

const sortChatMessages = messages => {
  const fallbackBase = Date.now();
  return messages.map((message, index) => ({
    ...message,
    createdAt: message.createdAt || new Date(fallbackBase + index).toISOString()
  })).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
};

const formatMessageTime = createdAt => {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
};

export default function CustomerChat() {
  const location = useLocation();
  const { user } = useAuth();
  const { joinRoom, leaveRoom, onEvent } = useSocket();
  const sessionId = useMemo(makeSessionId, []);
  const tenantSlug = new URLSearchParams(location.search).get('tenant') || 'project-million';
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeOrders, setActiveOrders] = useState([]);
  const [showOrderPicker, setShowOrderPicker] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [chatTenantId, setChatTenantId] = useState(null);
  const [storeInfo, setStoreInfo] = useState({});
  const chatBodyRef = useRef(null);
  const shouldScrollToBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [adminSupportAvailable, setAdminSupportAvailable] = useState(isAdminSupportAvailable);

  const mergeMessages = incomingMessages => {
    const serverMessages = incomingMessages || [];
    setMessages(current => {
      const serverMessageIds = new Set(serverMessages.map(message => message.id));
      const localMessages = current
        .filter(message => isLocalChatMessage(message) && message.createdAt && !serverMessageIds.has(message.id))
      return sortChatMessages([...serverMessages, ...localMessages]);
    });
  };

  useEffect(() => {
    const timer = setInterval(() => setAdminSupportAvailable(isAdminSupportAvailable()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    getPublicTenant(tenantSlug)
      .then(response => {
        if (active) {
          const tenant = response.data?.data || {};
          setChatTenantId(tenant.id || null);
          setStoreInfo({ name: tenant.name, description: tenant.landing_description, storeLat: tenant.storeLat, storeLng: tenant.storeLng, storeClosed: tenant.storeClosed });
        }
      })
      .catch(() => {
        if (active) setChatTenantId(null);
      });
    return () => { active = false; };
  }, [tenantSlug]);

  useEffect(() => {
    if (!chatTenantId) return undefined;
    joinRoom(`chat-${sessionId}`, chatTenantId);
    return () => leaveRoom(`chat-${sessionId}`, chatTenantId);
  }, [chatTenantId, sessionId, joinRoom, leaveRoom]);

  useEffect(() => onEvent('chat_update', payload => {
    const updated = payload?.conversation;
    if (!updated || updated.sessionId !== sessionId) return;
    setConversation(updated);
    mergeMessages(updated.messages);
  }), [onEvent, sessionId]);

  const loadActiveOrders = async () => {
    setLoadingOrders(true);
    try {
      const tenantSlug = new URLSearchParams(location.search).get('tenant') || 'project-million';
      const ownerKey = user?.id ? `customer_${user.id}` : 'guest';
      const storageKey = `${tenantSlug}_${ownerKey}_active_orders`;
      const lastOrderKey = `${tenantSlug}_${ownerKey}_last_order_number`;
      let orderNumbers = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const lastOrderNumber = localStorage.getItem(lastOrderKey);

      if (lastOrderNumber) orderNumbers = [...orderNumbers, lastOrderNumber];
      if (user?.role === 'customer') {
        const historyResponse = await getOrderHistory({ page: 1, limit: 50 });
        orderNumbers = [...orderNumbers, ...(historyResponse.data.data || []).map(order => order.orderNumber)];
      }

      const active = [];
      for (const orderNumber of Array.from(new Set(orderNumbers))) {
        try {
          const response = await getOrder(orderNumber);
          const order = response.data.data;
          if (order && !['completed', 'cancelled'].includes(order.status)) active.push(order);
        } catch {
          // Ignore orders that are no longer available.
        }
      }
      setActiveOrders(active);
    } catch {
      setActiveOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadConversation = async () => {
    try {
      const response = await getChatConversation(sessionId);
      const data = response.data.data;
      if (data) {
        setConversation(data);
        mergeMessages(data.messages);
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

  useEffect(() => {
    if (!open || !conversation?.unreadForCustomer) return;
    setConversation(current => current ? { ...current, unreadForCustomer: false } : current);
    markChatRead(sessionId).catch(() => {});
  }, [open, conversation?.unreadForCustomer, sessionId]);

  const send = async (content, escalate = false) => {
    const text = String(content || '').trim();
    if (!text || sending) return;
    shouldScrollToBottomRef.current = true;
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
      mergeMessages(data.messages);
      setInput('');

      const isFaqQuestion = FAQS.some(faq => faq.question.toLowerCase() === text.toLowerCase());
      const isBotConversation = data.status === 'bot' || data.status === 'closed';
      if (!escalate && isBotConversation && isOrderStatusRequest(text)) {
        setShowOrderPicker(true);
        await loadActiveOrders();
        setMessages(current => [...current, {
          id: `order-picker-${Date.now()}`,
          senderType: 'bot',
          content: 'Sure! Please choose one of your active orders below so I can check the latest update.',
          createdAt: new Date().toISOString()
        }]);
        return;
      }
      if (!escalate && isBotConversation && !isFaqQuestion) {
        setMessages(current => {
          const latestTime = Math.max(Date.now(), ...current.map(message => new Date(message.createdAt || 0).getTime() || 0));
          return [...current, {
            id: `bot-${Date.now()}`,
            senderType: 'bot',
            content: getBotReply(text, storeInfo),
            link: /\b(where|location|located|address)\b/.test(text)
              ? { href: STORE_MAP_URL, label: 'Open store location in Google Maps' }
              : /\b(facebook|fb|social media)\b/.test(text)
                ? { href: STORE_FACEBOOK_URL, label: 'Visit the store Facebook page' }
                : undefined,
            createdAt: new Date(latestTime + 1).toISOString()
          }];
        });
      }

    } catch {
      setMessages(current => [...current, { id: `error-${Date.now()}`, senderType: 'bot', content: 'Sorry, support is temporarily unavailable. Please try again.', createdAt: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  };

  const askFaq = async (faq) => {
    if (faq.answer === 'order-status') {
      setShowOrderPicker(true);
      await loadActiveOrders();
      return;
    }
    await send(faq.question);
    setMessages(current => {
      const latestTime = Math.max(Date.now(), ...current.map(message => new Date(message.createdAt || 0).getTime() || 0));
      return [...current, { id: `bot-${Date.now()}`, senderType: 'bot', content: faq.answer === 'order-status' ? 'Please enter your 5-digit order number, for example 61449.' : faq.answer, createdAt: new Date(latestTime + 1).toISOString() }];
    });
  };

  const checkOrderStatus = async (order) => {
    shouldScrollToBottomRef.current = true;
    setShowOrderPicker(false);
    const schedule = order.scheduleStatus === 'rejected'
      ? ' The requested schedule was rejected.'
      : order.scheduleStatus === 'confirmed'
        ? ' The requested schedule was confirmed.'
        : '';
    setMessages(current => [...current,
      { id: `selected-order-${Date.now()}`, senderType: 'customer', content: `Check order update: #${order.orderNumber}`, createdAt: new Date().toISOString() },
      { id: `status-${Date.now()}`, senderType: 'bot', content: `Order #${order.orderNumber}: ${orderStatusLabel(order.status)}. Payment: ${order.paymentStatus || 'unpaid'}.${schedule}`, createdAt: new Date(Date.now() + 1).toISOString() }
    ]);
  };

  const scrollConversationToBottom = (behavior = 'smooth') => {
    const body = chatBodyRef.current;
    if (!body) return;
    body.scrollTo({ top: body.scrollHeight, behavior });
    setShowScrollToBottom(false);
  };

  useEffect(() => {
    const body = chatBodyRef.current;
    if (!body) return;
    const distanceFromBottom = body.scrollHeight - body.scrollTop - body.clientHeight;
    if (shouldScrollToBottomRef.current || distanceFromBottom < 80) {
      body.scrollTo({ top: body.scrollHeight, behavior: shouldScrollToBottomRef.current ? 'smooth' : 'auto' });
      setShowScrollToBottom(false);
      shouldScrollToBottomRef.current = false;
    } else {
      setShowScrollToBottom(true);
    }
  }, [messages, showOrderPicker, conversation?.status]);

  const orderedMessages = sortChatMessages(messages.filter(message => !isLocalChatMessage(message) || message.createdAt));

  if (location.pathname === '/' || location.pathname.startsWith('/admin') || location.pathname.startsWith('/superadmin')) return null;

  return (
    <div className="fixed bottom-16 right-5 z-[180] flex flex-col items-end gap-3 sm:bottom-12 sm:right-6">
      {open && (
        <div className="flex h-[min(650px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[2rem] border border-surface-200 bg-white shadow-2xl animate-scale-in">
          <div className="flex items-center justify-between bg-gradient-to-br from-primary-600 to-primary-800 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <img src="/ms.suki.png" alt="Ms. Suki" className="h-10 w-10 rounded-2xl bg-white object-cover ring-2 ring-white/30" />
              <div><p className="font-heading font-black">Ms. Suki</p><p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Store assistant</p></div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 transition hover:bg-white/15" aria-label="Close chat"><X className="h-5 w-5" /></button>
          </div>
          <div
            ref={chatBodyRef}
            onScroll={event => {
              const body = event.currentTarget;
              const distanceFromBottom = body.scrollHeight - body.scrollTop - body.clientHeight;
              setShowScrollToBottom(distanceFromBottom > 80);
            }}
            className="relative flex-1 space-y-3 overflow-y-auto bg-surface-50 p-4"
          >
            {(!conversation || conversation.status === 'bot' || conversation.status === 'closed') && (
              <div className="space-y-2 pt-2">
                {FAQS.map(faq => <button key={faq.question} type="button" onClick={() => askFaq(faq)} disabled={sending} className="block w-full rounded-xl border border-primary-100 bg-white px-3 py-2 text-left text-xs font-bold text-primary-700 transition hover:border-primary-300 hover:bg-primary-50">{faq.question}</button>)}
              </div>
            )}
            {orderedMessages.map(message => (
              <div key={message.id} className={`flex ${message.senderType === 'customer' ? 'justify-end' : 'justify-start'}`}>
                {message.senderType === 'admin' && <div className="mr-2 mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700"><UserRound className="h-4 w-4" aria-hidden="true" /></div>}
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${message.senderType === 'customer' ? 'rounded-br-sm bg-primary-500 text-white' : 'rounded-bl-sm bg-white text-surface-700'}`}>
                  {message.senderType === 'admin' && <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-primary-600">Admin</p>}
                  {message.content}
                  {message.link && <a href={message.link.href} target="_blank" rel="noreferrer" className="mt-2 block font-bold text-primary-600 underline underline-offset-2">{message.link.label}</a>}
                  {formatMessageTime(message.createdAt) && <time dateTime={message.createdAt} className={`mt-1 block text-[10px] ${message.senderType === 'customer' ? 'text-white/70' : 'text-surface-400'}`}>{formatMessageTime(message.createdAt)}</time>}
                </div>
              </div>
            ))}
            {showOrderPicker && (
              <div className="space-y-2 rounded-2xl border border-primary-100 bg-white p-3">
                <p className="text-xs font-black uppercase tracking-wide text-surface-500">Choose an active order</p>
                {loadingOrders && <p className="text-xs text-surface-500">Loading your active orders...</p>}
                {!loadingOrders && !activeOrders.length && <p className="text-xs text-surface-500">No active orders found.</p>}
                {!loadingOrders && activeOrders.map(order => <button key={order.orderNumber} type="button" onClick={() => checkOrderStatus(order)} className="block w-full rounded-xl border border-primary-100 bg-primary-50 px-3 py-2 text-left text-xs font-bold text-primary-700 transition hover:border-primary-300 hover:bg-primary-100">Order #{order.orderNumber}</button>)}
              </div>
            )}
            {conversation?.status === 'requested' && <div className="rounded-2xl rounded-tl-sm border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">Waiting for an admin to accept your chat request. Please keep this chat open for the reply.</div>}
            {conversation?.status === 'open' && <div className="rounded-2xl rounded-tl-sm border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">You are talking with an admin now.</div>}
            {showScrollToBottom && <button type="button" onClick={() => scrollConversationToBottom()} className="sticky bottom-1 left-full z-10 ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg ring-2 ring-white transition hover:bg-primary-600" aria-label="Scroll to newest messages"><ChevronDown className="h-5 w-5" /></button>}
          </div>
          <div className="border-t border-surface-200 bg-white p-3">
            {(!conversation || conversation.status === 'bot' || conversation.status === 'closed') && (adminSupportAvailable ? <button type="button" onClick={() => send('I would like to talk to an admin.', true)} disabled={sending} className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-xs font-black uppercase tracking-wide text-primary-700 transition hover:bg-primary-100"><UserRound className="h-4 w-4" /> Talk to an admin</button> : <div className="mb-2 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 text-center text-[11px] font-bold text-surface-500">Admin support is available from 8:00 AM to 8:00 PM.</div>)}
            <form onSubmit={event => { event.preventDefault(); send(input, false); }} className="flex items-center gap-2">
              <input value={input} onChange={event => setInput(event.target.value)} disabled={conversation?.status === 'requested' || (showOrderPicker && (loadingOrders || activeOrders.length > 0))} placeholder={conversation?.status === 'requested' ? 'Waiting for admin acceptance...' : showOrderPicker && (loadingOrders || activeOrders.length > 0) ? 'Choose an active order above...' : conversation?.status === 'open' ? 'Message the admin...' : 'Ask a question...'} className="min-w-0 flex-1 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm outline-none focus:border-primary-400 disabled:cursor-not-allowed disabled:opacity-60" />
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
