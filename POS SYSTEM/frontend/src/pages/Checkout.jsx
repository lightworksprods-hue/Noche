import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { createOrder, getPublicTenant, trackVisit, validatePromo } from '../services/api';
import { formatCurrency, roundMoney } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { applyTheme } from '../utils/theme';
import { Utensils, ShoppingBag, Banknote, Smartphone, CreditCard, ShoppingCart, Gem, MapPin, Hash, Truck, Download, CheckCircle, Tag } from 'lucide-react';
import LocationPicker from '../components/LocationPicker';
import { useSocket } from '../context/SocketContext';
import useStoreOperationRealtime from '../hooks/useStoreOperationRealtime';

const TRANSLATIONS = {
  en: {
    checkout: "Checkout",
    back: "Back",
    pickup: "Pickup",
    delivery: "Delivery",
    nameLabel: "Your Name (Optional)",
    namePlaceholder: "Enter your name",
    orderType: "Order Type",
    paymentMethod: "Payment Method",
    pointsRedemption: "Points Redemption",
    noPaymentNeeded: "No payment needed — using your loyalty points",
    orderNotes: "Order Notes",
    notesPlaceholder: "Any special requests...",
    orderSummary: "Order Summary",
    subtotal: "Subtotal",
    tax: "Tax (12%)",
    total: "Total",
    placingOrder: "Placing Order...",
    insufficientPoints: "Insufficient Points ({pts} Needed)",
    claimPoints: "Claim for {pts} Points",
    orderWithPoints: "Order — {price} + {pts} pts",
    placeOrderTotal: "Place Order — {price}",
    deliveryFee: "Delivery Fee",
    paymentRef: "Payment Reference Number",
    refPlaceholder: "Enter last 4 digits of GCash/Maya Ref No.",
    pickLocation: "Pick Delivery Location",
    deliveryContact: "Delivery Contact Info",
    downpayment: "50% Downpayment",
    qrphInstructions: "Scan the QR Ph code to pay your 50% downpayment, then enter the last 4 digits of your reference number.",
    referenceLastFour: "Last 4 digits of payment reference",
    paymentPending: "Your order will be reviewed by the admin after payment is submitted."
  },
  tl: {
    checkout: "Magbayad na",
    back: "Bumalik",
    pickup: "Pick-up",
    delivery: "Delivery",
    nameLabel: "Iyong Pangalan (Opsyonal)",
    namePlaceholder: "Ilagay ang iyong pangalan",
    orderType: "Uri ng Order",
    paymentMethod: "Paraan ng Pagbabayad",
    pointsRedemption: "Redeem ng Puntos",
    noPaymentNeeded: "Walang kailangang bayad — gagamitin ang iyong mga puntos",
    orderNotes: "Habilin sa Order",
    notesPlaceholder: "Iba pang habilin o request...",
    orderSummary: "Buod ng Order",
    subtotal: "Subtotal",
    tax: "Buwis (12%)",
    total: "Kabuuan",
    placingOrder: "Ipinapadala...",
    insufficientPoints: "Kulang ang Puntos ({pts} Kailangan)",
    claimPoints: "Kunin gamit ang {pts} Puntos",
    orderWithPoints: "Order — {price} + {pts} pts",
    placeOrderTotal: "Ipadala ang Order — {price}",
    deliveryFee: "Bayad sa Delivery",
    paymentRef: "Reference Number ng Bayad",
    refPlaceholder: "Ilagay ang huling 4 digits ng GCash/Maya Ref No.",
    pickLocation: "Pumili ng Lokasyon",
    deliveryContact: "Impormasyon sa Delivery",
    downpayment: "50% Downpayment",
    qrphInstructions: "I-scan ang QR Ph code para bayaran ang 50% downpayment, pagkatapos ilagay ang huling 4 na digit ng reference number.",
    referenceLastFour: "Huling 4 na digit ng payment reference",
    paymentPending: "Susuriin ng admin ang order pagkatapos isumite ang bayad."
  }
};

export default function Checkout() {
  const { items, getSubtotal, getTotalPointsCost, clearCart } = useCart();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get('tenant') || 'project-million';
  const [branding, setBranding] = useState(null);
  useStoreOperationRealtime(branding, setBranding);
  
  const { joinRoom, leaveRoom, connected, emit } = useSocket();
  const [hasVisited, setHasVisited] = useState(false);

  useEffect(() => {
    if (branding?.id && connected) {
      joinRoom('kiosk', branding.id);
      emit('join_visitor', branding.id);
      
      if (!hasVisited && !sessionStorage.getItem(`visited_${branding.id}`)) {
        trackVisit(branding.slug).catch(() => {});
        sessionStorage.setItem(`visited_${branding.id}`, 'true');
        setHasVisited(true);
      }
      
      return () => {
        leaveRoom('kiosk', branding.id);
        emit('leave_visitor', branding.id);
      };
    }
  }, [branding?.id, connected, hasVisited]);

  const lang = localStorage.getItem('pos_lang') || 'en';
  const t = (key) => TRANSLATIONS[lang][key] || key;

  const ORDER_TYPES = [
    { id: 'pickup', label: t('pickup'), icon: <ShoppingBag className="w-6 h-6" /> },
    { id: 'delivery', label: t('delivery'), icon: <Truck className="w-6 h-6" /> },
  ];

  const PAYMENT_METHODS = [
    { id: 'cash', label: 'Cash', icon: <Banknote className="w-6 h-6 text-emerald-600" /> },
    { id: 'qrph', label: 'QR Ph', icon: <img src="/qrph%20logo.png" alt="QR Ph" className="h-8 w-16 object-contain" /> }
  ];

  const savedContactKey = user?.id ? `saved_checkout_contact_${user.id}` : null;
  const [savedContact, setSavedContact] = useState(() => {
    if (!user?.id) return null;
    try {
      return JSON.parse(localStorage.getItem(`saved_checkout_contact_${user.id}`) || 'null');
    } catch { return null; }
  });
  const [showSaveContactPrompt, setShowSaveContactPrompt] = useState(false);
  const [pendingContact, setPendingContact] = useState(null);
  const saveContactResolver = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const storedContact = JSON.parse(localStorage.getItem(`saved_checkout_contact_${user.id}`) || 'null');
      if (storedContact) setSavedContact(storedContact);
    } catch {
      setSavedContact(null);
    }
  }, [user?.id]);
  const [customerName, setCustomerName] = useState(() => savedContact?.name || user?.name || '');
  const [customerPhone, setCustomerPhone] = useState(() => savedContact?.phone || user?.phone || '');
  const [customerEmail, setCustomerEmail] = useState(() => savedContact?.email || user?.email || '');
  const [paymentMode, setPaymentMode] = useState('downpayment');
  const [orderType, setOrderType] = useState('pickup');
  const [notes, setNotes] = useState('');
  const [deliveryInfo, setDeliveryInfo] = useState({ address: '', lat: null, lng: null, fee: 0 });
  const [paymentReference, setPaymentReference] = useState('');

  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [validatingPromo, setValidatingPromo] = useState(false);

  useEffect(() => {
    const slug = tenantSlug || user?.tenantSlug;
    if (slug) {
      getPublicTenant(slug).then(res => {
        if (res.data.success) {
          const tenantData = res.data.data;
          setBranding(tenantData);
          applyTheme(tenantData.primaryColor);
        }
      });
    }
  }, [tenantSlug, user?.tenantSlug, orderType]);


  const brandingColor = branding?.primaryColor || '#ec4899';
  const cartLink = '/cart';
  const menuLink = '/menu';
  const isFullRedemption = items.length > 0 && items.every(item => item.isRedemption);
  const totalPointsCost = getTotalPointsCost();
  const hasInsufficientPoints = totalPointsCost > (user?.points || 0);

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('qrph');
  const paymentMethod = isFullRedemption ? 'points' : selectedPaymentMethod;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showQrSuccess, setShowQrSuccess] = useState(false);

  const subtotal = getSubtotal();
  const deliveryFee = orderType === 'delivery' ? deliveryInfo.fee : 0;
  const promoDiscount = appliedPromo ? appliedPromo.discountAmount : 0;
  const tax = 0;
  let total = roundMoney(subtotal + deliveryFee - promoDiscount);
  if (total < 0) total = 0;
  const paymentDue = paymentMode === 'full_payment' ? total : roundMoney(total * 0.5);
  const qrCode = branding?.gcashQr || branding?.mayaQr;

  const handleApplyPromo = async () => {
    if (!user) {
      setPromoError('Promo codes are exclusively available for registered members. Please log in to apply discount codes.');
      return;
    }
    if (!promoCodeInput.trim()) return;
    setValidatingPromo(true);
    setPromoError('');
    try {
      const orderItems = items.map(item => ({
        productId: item.id,
        quantity: item.quantity,
        price: item.price,
        categoryId: item.categoryId || null
      }));
      const res = await validatePromo({
        tenantSlug: tenantSlug || user?.tenantSlug,
        code: promoCodeInput.trim(),
        items: orderItems,
        customerId: user?.id
      });
      if (res.data.success) {
        setAppliedPromo(res.data.data);
        setPromoCodeInput('');
      }
    } catch (err) {
      setPromoError(err.response?.data?.message || 'Invalid or expired promo code');
    } finally {
      setValidatingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoError('');
  };


  if (items.length === 0 && !submitting) {
    return (
      <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center p-4 text-center">
        <div className="mb-4"><ShoppingCart className="w-16 h-16 text-surface-300" /></div>
        <h2 className="text-xl font-bold text-surface-900 mb-2">{t('emptyCartTitle')}</h2>
        <p className="text-surface-500 mb-6">{t('emptyCartDesc')}</p>
        <Link to={menuLink} className="btn-primary px-8" style={{ backgroundColor: brandingColor }}>{t('browseMenu')}</Link>
      </div>
    );
  }

  if (items.length === 0) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (totalPointsCost > 0) {
      if (!user) {
        setError('You must be logged in to claim rewards.');
        return;
      }
      if (hasInsufficientPoints) {
        setError(`Insufficient points. You need ${totalPointsCost} points but only have ${user.points || 0}.`);
        return;
      }
    }

    if (!isFullRedemption) {
      if (paymentMethod === 'qrph' && !qrCode) {
        setError('QR Ph payment is not configured yet. Please contact the store administrator.');
        return;
      }
      if (paymentMethod === 'qrph' && !/^\d{4}$/.test(paymentReference)) {
        setError('Enter exactly the last 4 digits of your payment reference.');
        return;
      }
    }
    if (customerName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!/^09\d{9}$/.test(customerPhone)) {
      setError('Please enter a valid 11-digit phone number starting with 09.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (orderType === 'delivery' && !deliveryInfo.address) {
      setError('Please select your delivery location.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const orderItems = items.map(item => ({
        productId: item.id, 
        quantity: item.quantity, 
        size: item.size, 
        flavor: item.flavor,
        addons: item.selectedAddons?.map(a => a.id) || [],
        isRedemption: item.isRedemption || false,
        comboChoices: item.comboChoices // Add this!
      }));
      
      const res = await createOrder({ 
        customerId: user?.id,
        customerName: customerName.trim(),
        customerPhone,
        customerEmail: customerEmail.trim(),
        orderType, 
        paymentMethod, 
        paymentMode,
        items: orderItems, 
        notes,
        deliveryAddress: orderType === 'delivery' ? deliveryInfo.address : undefined,
        deliveryLat: orderType === 'delivery' ? deliveryInfo.lat : undefined,
        deliveryLng: orderType === 'delivery' ? deliveryInfo.lng : undefined,
        deliveryFee: orderType === 'delivery' ? deliveryInfo.fee : undefined,
        paymentReference: paymentMethod === 'qrph' ? paymentReference : undefined,
        paymentAmount: paymentMethod === 'qrph' ? paymentDue : undefined,
        promoCode: appliedPromo ? appliedPromo.code : undefined
      });
      const order = res.data.data;
      
      const orderStoragePrefix = tenantSlug || 'default';
      const orderOwnerKey = user?.id ? `customer_${user.id}` : 'guest';
      const activeOrdersKey = `${orderStoragePrefix}_${orderOwnerKey}_active_orders`;
      const lastOrderKey = `${orderStoragePrefix}_${orderOwnerKey}_last_order_number`;

      const activeOrders = JSON.parse(localStorage.getItem(activeOrdersKey) || '[]');
      if (!activeOrders.includes(order.orderNumber)) {
        activeOrders.push(order.orderNumber);
        localStorage.setItem(activeOrdersKey, JSON.stringify(activeOrders));
      }
      localStorage.setItem(lastOrderKey, order.orderNumber);

      if (user && savedContactKey && !savedContact) {
        const contact = { name: customerName.trim(), phone: customerPhone, email: customerEmail.trim() };
        const shouldSave = await new Promise(resolve => {
          saveContactResolver.current = resolve;
          setPendingContact(contact);
          setShowSaveContactPrompt(true);
        });
        if (shouldSave) {
          localStorage.setItem(savedContactKey, JSON.stringify(contact));
          setSavedContact(contact);
        }
      }

      await refreshUser();
      clearCart();
      navigate(`/order/${order.orderNumber}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to place order.');
    } finally { setSubmitting(false); }
  };

  const closeSaveContactPrompt = (shouldSave) => {
    setShowSaveContactPrompt(false);
    setPendingContact(null);
    if (saveContactResolver.current) {
      saveContactResolver.current(shouldSave);
      saveContactResolver.current = null;
    }
  };

  const calculateDeliveryFee = (lat, lng) => {
    if (!lat || !lng) return 0;
    // Use dynamic shop location from branding, fallback to Manila default
    const shopLocation = { 
      lat: branding?.storeLat || 14.5995, 
      lng: branding?.storeLng || 120.9842 
    };
    
    const R = 6371; // Earth's radius in km
    const dLat = (lat - shopLocation.lat) * Math.PI / 180;
    const dLon = (lng - shopLocation.lng) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(shopLocation.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in km
    const feePerKm = branding?.deliveryFeePerKm ?? 20;
    
    // Calculate fee based on distance and dynamic rate
    return Math.ceil(distance * feePerKm);
  };

  return (
    <div className="min-h-screen bg-surface-50 pb-8" style={{ '--primary-custom': brandingColor }}>
      {showSaveContactPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-950/45 p-4 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="save-contact-title">
          <div className="w-full max-w-sm overflow-hidden rounded-[2rem] border border-pink-100 bg-white shadow-2xl animate-scale-in">
            <div className="bg-gradient-to-br from-pink-500 to-fuchsia-600 px-6 pb-7 pt-6 text-white">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-2xl ring-1 ring-white/30">♡</div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-pink-100">Faster checkout next time</p>
              <h2 id="save-contact-title" className="mt-1 font-heading text-2xl font-black">Save your information?</h2>
            </div>
            <div className="p-6">
              <p className="leading-relaxed text-surface-600">Would you like to save your name, phone number, and email for your next order?</p>
              {pendingContact && <div className="mt-4 rounded-2xl bg-pink-50 px-4 py-3 text-sm font-semibold text-pink-700">Your details stay saved on this device.</div>}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => closeSaveContactPrompt(false)} className="rounded-2xl border border-surface-200 px-4 py-3.5 text-sm font-black uppercase tracking-widest text-surface-600 transition hover:bg-surface-50">Not now</button>
                <button type="button" onClick={() => closeSaveContactPrompt(true)} className="rounded-2xl bg-primary-600 px-4 py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700">Save details</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-surface-200/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Link to={cartLink} className="back-button"><span aria-hidden="true">←</span> {t('back')}</Link>
          <h1 className="font-heading font-bold text-lg text-surface-900">{t('checkout')}</h1>
          <div className="w-16" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 pt-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>}

        {/* Name */}
        <div className="glass-card p-5 animate-fade-in-up">
          {user && savedContact && (
            <button type="button" onClick={() => {
              setCustomerName(savedContact.name || user.name || '');
              setCustomerPhone(savedContact.phone || '');
              setCustomerEmail(savedContact.email || user.email || '');
            }} className="mb-4 w-full rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-primary-700 transition hover:bg-primary-100">
              Use saved information
            </button>
          )}
          <label className="block text-sm font-semibold text-surface-700 mb-2">Full Name <span className="text-red-500">*</span></label>
          <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
            className="input-field" placeholder="Enter your full name" id="customer-name" required />
          <label className="block text-sm font-semibold text-surface-700 mt-4 mb-2">Phone Number <span className="text-red-500">*</span></label>
          <input type="tel" inputMode="numeric" pattern="09[0-9]{9}" maxLength="11" value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            className="input-field" placeholder="09XXXXXXXXX" id="customer-phone" required />
          <label className="block text-sm font-semibold text-surface-700 mt-4 mb-2">Email Address <span className="text-red-500">*</span></label>
          <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
            className="input-field" placeholder="you@example.com" id="customer-email" required />
        </div>

        {/* Order Type */}
        <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <label className="block text-sm font-semibold text-surface-700 mb-3">{t('orderType')}</label>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {ORDER_TYPES.map(t => (
                <button key={t.id} type="button" onClick={() => setOrderType(t.id)}
                  className={`p-3 sm:p-4 rounded-xl border-2 text-center font-semibold transition-all ${orderType === t.id ? 'border-transparent text-white' : 'border-surface-200 hover:border-primary-300 text-surface-600'}`}
                  style={orderType === t.id ? { backgroundColor: brandingColor, borderColor: brandingColor, color: '#ffffff' } : {}}>
                  <div className="mb-1 flex justify-center">{t.icon}</div>
                  <span className="text-xs sm:text-sm">{t.label}</span>
                </button>
              ))}
          </div>

          {orderType === 'delivery' && (
            <div className="mt-6 pt-6 border-t border-surface-100 space-y-4 animate-fade-in">
              <label className="block text-sm font-bold text-surface-900 mb-1">{t('pickLocation')}</label>
              <LocationPicker 
                onLocationSelect={(loc) => {
                  const fee = calculateDeliveryFee(loc.lat, loc.lng);
                  setDeliveryInfo({ ...deliveryInfo, ...loc, fee });
                }}
                initialAddress={deliveryInfo.address}
              />
              {deliveryInfo.fee > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between animate-bounce-in">
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4" /> Distance-Based Fee
                  </span>
                  <span className="font-bold text-amber-700">{formatCurrency(deliveryInfo.fee)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {!isFullRedemption && (
          <div className="glass-card p-5 animate-fade-in-up">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-surface-900">Payment Option</label>
              <span className="text-[10px] font-black uppercase tracking-widest text-surface-400">Choose one</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { id: 'downpayment', label: '50% Downpayment' },
                { id: 'full_payment', label: 'Pay in Full' }
              ].map(option => (
                <button key={option.id} type="button" onClick={() => setPaymentMode(option.id)}
                  className={`flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all ${paymentMode === option.id ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm' : 'border-surface-200 bg-white text-surface-600 hover:border-primary-300'}`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${paymentMode === option.id ? 'border-primary-500' : 'border-surface-300'}`}>
                    {paymentMode === option.id && <span className="h-2.5 w-2.5 rounded-full bg-primary-500" />}
                  </span>
                  <span className="block text-xs font-black uppercase tracking-wide">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Payment Method — hidden for points-only redemptions */}
        {isFullRedemption ? (
          <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-xl"><Gem className="w-5 h-5 text-emerald-500" /></div>
              <div>
                <p className="font-semibold text-emerald-700">{t('pointsRedemption')}</p>
                <p className="text-xs text-surface-500">{t('noPaymentNeeded')}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <label className="block text-sm font-bold text-surface-900 mb-3">{t('paymentMethod')}</label>
            <div className="grid grid-cols-2 gap-3">
              {PAYMENT_METHODS.map(m => {
                const isSelected = paymentMethod === m.id;
                const isGCash = false;
                const isMaya = false;
                
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedPaymentMethod(m.id)}
                    className={`h-20 rounded-2xl border-2 transition-all flex items-center justify-center px-4 shadow-sm active:scale-95 ${isSelected ? 'scale-[1.02]' : 'hover:border-slate-300'}`}
                    style={{
                      borderColor: isSelected ? brandingColor : '#e2e8f0',
                      borderWidth: isSelected ? '3px' : '2px',
                      backgroundColor: isSelected ? `${brandingColor}0d` : '#ffffff'
                    }}
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      {m.icon}
                      <span className="text-xs font-black uppercase tracking-wide">{m.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {paymentMethod === 'qrph' && (
              <div className="mt-5 pt-5 border-t border-surface-100 animate-fade-in space-y-4">
                {/* Auto-display QR Code */}
                {paymentMethod === 'qrph' && (
                  <div className="bg-surface-50 rounded-2xl p-4 border-2 border-dashed border-surface-200 flex flex-col items-center gap-4 animate-fade-in shadow-inner">
                    <div className="text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-surface-500 mb-1">Amount to Pay</p>
                      <p className="font-heading text-2xl font-black bg-white px-4 py-1.5 rounded-xl border border-surface-200 shadow-sm" style={{ color: brandingColor }}>{formatCurrency(paymentDue)}</p>
                    </div>
                    <p className="text-center text-xs font-medium text-surface-500 max-w-xs">{t('qrphInstructions')}</p>
                    {qrCode ? (
                      <div className="flex flex-col items-center gap-4 w-full">
                        <div className="relative group">
                          <img 
                            src={qrCode}
                            alt="QR Ph payment code"
                            className="w-48 h-48 object-cover rounded-xl shadow-lg border-4 border-white transition-all group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-primary-500/0 group-hover:bg-primary-500/10 transition-colors rounded-xl pointer-events-none" />
                        </div>
                        
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const imageUrl = qrCode;
                              const response = await fetch(imageUrl);
                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `Monas-Pang-Noche-Buena-QR-Ph.png`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(url);
                              try {
                                await navigator.clipboard.writeText(paymentDue.toString());
                                setShowQrSuccess(true);
                                setTimeout(() => setShowQrSuccess(false), 3500);
                              } catch(e) {
                                setShowQrSuccess(true);
                                setTimeout(() => setShowQrSuccess(false), 3500);
                              }
                            } catch (err) {
                              console.error('Download failed:', err);
                              window.open(qrCode, '_blank');
                            }
                          }}
                          className="w-full py-3 bg-white border border-surface-200 rounded-xl shadow-sm hover:bg-surface-50 text-surface-700 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                          <Download className="w-4 h-4 text-primary-500" />
                          Save QR Code
                        </button>
                      </div>
                    ) : (
                      <div className="w-48 h-48 bg-surface-100 rounded-xl flex flex-col items-center justify-center text-center p-4 border border-surface-200">
                        <Smartphone className="w-8 h-8 text-surface-300 mb-2" />
                        <p className="text-[10px] font-bold text-surface-400 uppercase tracking-tight">QR Code Not Uploaded Yet</p>
                      </div>
                    )}
                    <div className="text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full uppercase tracking-tighter flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                      Pay via QR Ph
                    </div>
                  </div>
                )}

                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-surface-900 mb-2">
                    <Hash className="w-4 h-4 text-primary-500" />
                    {t('referenceLastFour')}
                  </label>
                  <input 
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={paymentReference}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setPaymentReference(val);
                    }}
                    placeholder={t('refPlaceholder')}
                    className="input-field text-sm"
                    maxLength={4}
                    required={paymentMethod === 'qrph'}
                  />
                  <p className="mt-1.5 text-[11px] font-medium text-surface-500">{t('paymentPending')}</p>
                </div>
              </div>
            )}
          </div>
        )}


        <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="block text-sm font-semibold text-surface-700">{t('orderNotes')}</label>
            <span className={`text-[10px] font-bold ${notes.length >= 150 ? 'text-red-600' : 'text-surface-400'}`}>{notes.length}/150</span>
          </div>
          <textarea
            value={notes}
            maxLength={150}
            onChange={e => setNotes(e.target.value.slice(0, 150))}
            className="input-field h-20 resize-none text-sm"
            placeholder={t('notesPlaceholder')}
          />
        </div>

        {/* Promo Code System */}
        {(!branding?.saPromoDisabled) && !isFullRedemption && (
          <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.35s' }}>
            <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-2">
              <Tag className="w-4 h-4 text-indigo-500" /> Promo Code & Discounts
            </label>
            
            {!user ? (
              <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 text-amber-700 font-bold text-sm">
                    🔒
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-900">Member Exclusive Discounts</p>
                    <p className="text-[11px] text-amber-700 font-medium">Promo codes are only available for registered customers.</p>
                  </div>
                </div>
                <Link
                  to={`/member-portal?tenant=${tenantSlug || 'project-million'}&redirect=checkout`}
                  className="text-xs font-black text-amber-900 bg-amber-200 hover:bg-amber-300 px-4 py-2 rounded-xl uppercase tracking-wider transition-all whitespace-nowrap shadow-sm active:scale-95"
                >
                  Log In
                </Link>
              </div>
            ) : appliedPromo ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-emerald-800 text-sm tracking-tight">{appliedPromo.code}</p>
                  <p className="text-emerald-600 text-xs font-semibold">Discount applied!</p>
                </div>
                <button type="button" onClick={handleRemovePromo} className="text-emerald-700 hover:text-red-500 text-xs font-black uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg border border-emerald-200 shadow-sm transition-all active:scale-95">Remove</button>
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={promoCodeInput} 
                    onChange={e => setPromoCodeInput(e.target.value.toUpperCase())}
                    placeholder="Enter code (e.g. SUMMER20)" 
                    className="input-field flex-1 uppercase font-bold"
                  />
                  <button 
                    type="button"
                    onClick={handleApplyPromo}
                    disabled={validatingPromo || !promoCodeInput.trim()}
                    className="bg-indigo-600 font-bold px-5 rounded-xl text-white text-sm uppercase tracking-wider disabled:opacity-50 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 active:scale-95"
                  >
                    {validatingPromo ? '...' : 'Apply'}
                  </button>
                </div>
                {promoError && <p className="text-red-500 text-xs font-semibold mt-2">{promoError}</p>}
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <h3 className="font-heading font-bold text-surface-900 mb-3">{t('orderSummary')}</h3>
          {items.map(item => {
            let price = item.price;
            if (item.selectedAddons) item.selectedAddons.forEach(a => { price += a.price; });
            return (
              <div key={item.cartKey} className="flex justify-between text-sm py-1.5 border-b border-surface-100 last:border-0">
                <span className="text-surface-600">{item.quantity}× {item.name}</span>
                <span className="text-surface-900 font-medium">{formatCurrency(price * item.quantity)}</span>
              </div>
            );
          })}
          <div className="border-t border-surface-200 mt-3 pt-3 space-y-2">
            {orderType === 'delivery' && (
              <div className="flex justify-between text-sm">
                <span className="text-surface-500">{t('deliveryFee')}</span>
                <span className="text-surface-900 font-medium">{formatCurrency(deliveryFee)}</span>
              </div>
            )}
            {appliedPromo && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-600 font-bold">Promo ({appliedPromo.code})</span>
                <span className="text-emerald-600 font-bold">-{formatCurrency(promoDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold font-heading">
              <span>{t('total')}</span><span className="text-primary-600">{formatCurrency(total)}</span>
            </div>
            {!isFullRedemption && (
              <div className="flex justify-between text-sm font-bold text-primary-600">
                <span>Due now ({paymentMode === 'full_payment' ? 'full payment' : '50% downpayment'})</span><span>{formatCurrency(paymentDue)}</span>
              </div>
            )}
          </div>
        </div>

        {(() => {
          const isDisabled = submitting || customerName.trim().length < 2 || !/^09\d{9}$/.test(customerPhone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim()) || (totalPointsCost > 0 && hasInsufficientPoints) || (!isFullRedemption && paymentMethod === 'qrph' && (!qrCode || !/^\d{4}$/.test(paymentReference))) || (orderType === 'delivery' && !deliveryInfo.address);
          return (
            <button 
              type="submit" 
              disabled={isDisabled} 
              className="w-full py-5 text-sm transition-all rounded-2xl font-black uppercase tracking-[2px] shadow-xl active:scale-[0.98]"
              id="place-order-btn"
              style={{ 
                backgroundColor: isDisabled ? '#e2e8f0' : brandingColor,
                color: isDisabled ? '#94a3b8' : '#ffffff',
                cursor: isDisabled ? 'not-allowed' : 'pointer'
              }}
            >
              {submitting ? 'Placing Order...' : 
               hasInsufficientPoints && totalPointsCost > 0 ? `Insufficient Points (${totalPointsCost})` :
               isFullRedemption ? `Claim for ${totalPointsCost} pts` : 
               totalPointsCost > 0 ? `Order with ${formatCurrency(total)} + ${totalPointsCost} pts` :
               `Place Order • ${formatCurrency(total)}`}
            </button>
          );
        })()}
      </form>

      {/* QR Success Modal */}
      {showQrSuccess && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full border border-slate-100 flex flex-col items-center text-center animate-scale-up">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mb-5 shadow-sm ring-8 ring-emerald-50/50">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h4 className="font-heading font-black text-2xl text-slate-900 mb-2">Saved & Copied!</h4>
            <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">
              The QR code has been saved to your photo library.<br/>
              The amount to pay (<strong className="text-slate-900">₱{total}</strong>) is copied to your clipboard!
            </p>
            <button
              onClick={() => setShowQrSuccess(false)}
              className="w-full py-4 text-sm font-black uppercase tracking-widest text-white rounded-2xl shadow-xl transition-all active:scale-[0.98]"
              style={{ backgroundColor: brandingColor }}
            >
              Okay, got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
