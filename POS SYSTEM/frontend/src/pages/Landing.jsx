import { Link, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getOrder, getOrderHistory, getPublicTenant, trackVisit } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useDynamicBranding } from '../hooks/useDynamicBranding';
import { Ban, Rocket, Coffee, Utensils } from 'lucide-react';

export default function Landing() {
  const [activeOrders, setActiveOrders] = useState([]);
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const { user, logoutUser } = useAuth();
  const [searchParams] = useSearchParams();
  const isCustomer = user && user.role === 'customer';
  const { joinRoom, leaveRoom, connected, emit } = useSocket();

  // Dynamic favicon, title & OG meta
  const backendUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || (import.meta.env.PROD ? '' : 'http://localhost:5000');
  const getAbsoluteUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http') || path.startsWith('data:') || (path.startsWith('/') && !path.startsWith('/uploads/'))) {
      return path;
    }
    return `${backendUrl}${path}`;
  };

  const absoluteFavicon = tenant?.favicon ? getAbsoluteUrl(tenant.favicon) : '/logo.png';
  const absoluteOgImage = tenant?.ogImage ? getAbsoluteUrl(tenant.ogImage) : '/logo.png';

  useDynamicBranding("Mona's Pang Noche Buena", absoluteFavicon, {
    image: absoluteOgImage,
    description: `Order from Mona's Pang Noche Buena — Self-Service Kiosk`
  });

  useEffect(() => {
    if (tenant?.id) {
      joinRoom('kiosk', tenant.id);
      // Track live visitor via socket
      emit('join_visitor', tenant.id);
      return () => {
        leaveRoom('kiosk', tenant.id);
        emit('leave_visitor', tenant.id);
      };
    }
  }, [tenant?.id, connected]);

  // Track unique visit per session
  useEffect(() => {
    if (tenant?.slug) {
      const key = `visited_${tenant.slug}`;
      if (!sessionStorage.getItem(key)) {
        trackVisit(tenant.slug).catch(() => {});
        sessionStorage.setItem(key, '1');
      }
    }
  }, [tenant?.slug]);

  // Splash screen auto-dismiss
  useEffect(() => {
    if (!loading) {
      // Still show the storefront if the backend is waking up or unavailable.
      const fadeTimer = setTimeout(() => setSplashFading(true), tenant ? 2000 : 400);
      const hideTimer = setTimeout(() => setShowSplash(false), tenant ? 2800 : 1200);
      return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
    }
  }, [loading, tenant]);

  useEffect(() => {
    const init = async () => {
      // Check for tenant from URL (defaulting to project-million)
      const tenantSlug = searchParams.get('tenant') || 'project-million';
      try {
      try {
        const res = await getPublicTenant(tenantSlug);
        if (res.data.success) {
          setTenant(res.data.data);
        }
      } catch (e) {
        console.error('Failed to load tenant info:', e);
      }

      // Check for ALL active orders
      const orderStoragePrefix = tenantSlug || 'default';
      const orderOwnerKey = user?.id ? `customer_${user.id}` : 'guest';
      const activeOrdersKey = `${orderStoragePrefix}_${orderOwnerKey}_active_orders`;
      const lastOrderKey = `${orderStoragePrefix}_${orderOwnerKey}_last_order_number`;
      const savedOrders = JSON.parse(localStorage.getItem(activeOrdersKey) || '[]');
      const lastOrderNum = localStorage.getItem(lastOrderKey);
      let accountOrders = [];
      if (user?.role === 'customer') {
        try {
          const historyRes = await getOrderHistory();
          accountOrders = (historyRes.data.data || [])
            .filter(order => order.status !== 'completed' && order.status !== 'cancelled')
            .map(order => order.orderNumber);
        } catch (error) {
          // Local order tracking remains available if history cannot be loaded.
        }
      }
      const allOrderNums = Array.from(new Set([...savedOrders, lastOrderNum, ...accountOrders].filter(Boolean)));

      const validOrders = [];
      for (const orderNum of allOrderNums) {
        try {
          const res = await getOrder(orderNum);
          const order = res.data.data;
          const belongsToViewer = user?.role === 'customer'
            ? order?.customerId === user.id
            : !order?.customerId;
          if (order && belongsToViewer && order.status !== 'completed' && order.status !== 'cancelled') {
            validOrders.push(orderNum);
          }
        } catch (error) {
          // Order not found, skip
        }
      }

      // Sync localStorage with validated orders
      if (validOrders.length > 0) {
        localStorage.setItem(activeOrdersKey, JSON.stringify(validOrders));
      } else {
        localStorage.removeItem(activeOrdersKey);
        localStorage.removeItem(lastOrderKey);
      }
      setActiveOrders(validOrders);
      } finally {
      // Never keep the entire landing page invisible because the API is unavailable.
      setLoading(false);
      }
    };
    init();
  }, [searchParams, user?.id]);

  const tenantName = "Mona's Pang Noche Buena";
  const menuLink = '/menu';
  const portalLink = '/member-portal';
  const primaryColor = tenant?.primaryColor || '#ec4899';

  const defaultBackground = '/logo.png';
  const bannerImage = tenant?.bannerImage || defaultBackground;

  const [currentAssetIndex, setCurrentAssetIndex] = useState(0);

  // Safe asset resolution (handles JSON objects and string-encoded JSON from API)
  let rawAssets = tenant?.bannerAssets || [];
  if (typeof rawAssets === 'string') {
    try { rawAssets = JSON.parse(rawAssets); } catch (e) { rawAssets = []; }
  }

  const assets = (Array.isArray(rawAssets) && rawAssets.length > 0)
    ? rawAssets.filter(a => a && typeof a === 'string' && a.trim() !== '')
    : [bannerImage];

  useEffect(() => {
    if (assets.length > 1) {
      const interval = setInterval(() => {
        setCurrentAssetIndex((prev) => (prev + 1) % assets.length);
      }, 10000); // 10 seconds for a better feel
      return () => clearInterval(interval);
    }
  }, [assets]);

  if (loading) return null;

  const isSuspended = tenant && !tenant.active && user?.role !== 'superadmin';

  if (isSuspended) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-8 animate-pulse text-red-500">
          <Ban className="w-12 h-12" />
        </div>
        <h1 className="font-heading text-4xl md:text-6xl font-black text-white mb-4 uppercase tracking-tighter">
          Service <span className="text-red-500">Suspended</span>
        </h1>
        <p className="text-surface-400 text-lg md:text-xl max-w-md mx-auto mb-10 leading-relaxed">
          The storefront for <span className="text-white font-bold">Mona's Pang Noche Buena</span> is temporarily unavailable.
          Please contact the system administrator for more information.
        </p>
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <Link to="/" className="py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold hover:bg-white/10 transition-all">
            Return Home
          </Link>
          <Link to="/login" className="text-surface-500 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors">
            Staff Login →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-black flex flex-col items-center justify-start relative overflow-hidden" style={{ '--primary-custom': primaryColor }}>

      {/* Splash Screen Intro */}
      {showSplash && (
        <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black transition-opacity duration-700 ${splashFading ? 'opacity-0' : 'opacity-100'}`}>
          <style>{`
            @keyframes splashLogoIn {
              0% { opacity: 0; transform: scale(0.5); filter: blur(10px); }
              60% { opacity: 1; transform: scale(1.08); filter: blur(0); }
              100% { opacity: 1; transform: scale(1); filter: blur(0); }
            }
            @keyframes splashGlow {
              0%, 100% { box-shadow: 0 0 30px rgba(255,255,255,0.1), 0 0 60px rgba(255,255,255,0.05); }
              50% { box-shadow: 0 0 60px rgba(255,255,255,0.2), 0 0 120px rgba(255,255,255,0.1); }
            }
            @keyframes splashTextIn {
              0% { opacity: 0; transform: translateY(20px); letter-spacing: 0.4em; }
              100% { opacity: 1; transform: translateY(0); letter-spacing: 0.2em; }
            }
            .splash-logo { animation: splashLogoIn 1s cubic-bezier(0.16, 1, 0.3, 1) forwards, splashGlow 2s ease-in-out infinite 0.8s; }
            .splash-text { animation: splashTextIn 0.8s ease-out 0.6s forwards; opacity: 0; }
            .splash-tagline { animation: splashTextIn 0.8s ease-out 1s forwards; opacity: 0; }
          `}</style>

          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full blur-[120px] animate-pulse opacity-20" style={{ backgroundColor: primaryColor }} />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full blur-[120px] animate-pulse opacity-15" style={{ backgroundColor: primaryColor }} />

          <div className="splash-logo w-28 h-28 md:w-40 md:h-40 rounded-[48px] overflow-hidden ring-8 ring-white/10">
            <img src="/logo.png" className="w-full h-full object-cover" alt="Mona's Pang Noche Buena" onError={(e) => { e.currentTarget.src = '/logo.png'; }} />
          </div>

          <h2 className="splash-text font-heading text-2xl md:text-4xl font-black text-white uppercase tracking-[0.2em] mt-8">
            MONA'S PANG
            <br />
            NOCHE BUENA
          </h2>

          <p className="splash-tagline text-[10px] md:text-xs font-bold uppercase tracking-[0.3em] mt-3" style={{ color: primaryColor }}>
            Self-Service Kiosk
          </p>
        </div>
      )}
      {/* Background Layer */}
      <div className="fixed inset-0 z-0 bg-black">
        <style>
          {`
              @keyframes landingGradientDrift {
                0%, 100% { transform: translate3d(-12%, -8%, 0) scale(1); opacity: 0.42; }
                50% { transform: translate3d(14%, 10%, 0) scale(1.2); opacity: 0.7; }
              }
              @keyframes landingGradientDriftAlt {
                0%, 100% { transform: translate3d(14%, 10%, 0) scale(1.15); opacity: 0.28; }
                50% { transform: translate3d(-14%, -10%, 0) scale(1); opacity: 0.55; }
              }
              .landing-gradient-orb {
                animation: landingGradientDrift 10s ease-in-out infinite;
              }
              .landing-gradient-orb-alt {
                animation: landingGradientDriftAlt 13s ease-in-out infinite;
              }
              .btn-custom {
                background-color: var(--primary-custom);
                color: white;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
              }
              .btn-custom:hover {
                filter: brightness(1.1);
              }
            `}
        </style>

        <div className="absolute inset-0 bg-black" />
        <div className="landing-gradient-orb absolute -top-48 -left-40 h-[30rem] w-[30rem] rounded-full bg-pink-600/70 blur-[130px]" />
        <div className="landing-gradient-orb-alt absolute -bottom-56 -right-40 h-[34rem] w-[34rem] rounded-full bg-fuchsia-900/80 blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(236,72,153,0.12),transparent_58%)]" />
      </div>

      {/* Main Content Wrapper - Centered */}
      <div className="relative z-20 flex flex-1 min-h-[calc(100dvh-82px)] w-full max-w-6xl mx-auto flex-col items-center justify-center px-5 py-10 text-center animate-fade-in-up sm:px-8 sm:py-12 md:py-8 lg:px-12 lg:py-8">
        {isCustomer && (
          <div className="inline-flex flex-col items-center gap-2 mb-8 animate-fade-in">
            <div className="bg-emerald-500/10 border border-emerald-500/20 px-8 py-3 rounded-[2rem] text-emerald-400 font-bold text-lg backdrop-blur-md shadow-xl shadow-emerald-500/10 flex flex-col items-center">
              <span className="text-white">Welcome back, <span className="text-emerald-400">{user.name}</span>!</span>
            </div>
          </div>
        )}

        <div className="flex justify-center mb-8 sm:mb-10 lg:mb-7">
          <div className="w-24 h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 rounded-[40px] overflow-hidden shadow-2xl ring-8 ring-white/5 animate-scale-in transition-transform hover:scale-110 duration-500 bg-white/10">
            <img src="/logo.png" className="w-full h-full object-cover" alt="Mona's Pang Noche Buena" onError={(e) => { e.currentTarget.src = '/logo.png'; }} />
          </div>
        </div>

        <h1 className="font-heading text-5xl sm:text-6xl md:text-7xl lg:text-[clamp(4rem,6vw,6.5rem)] font-black text-white leading-[0.9] mb-9 md:mb-8 lg:mb-8 uppercase tracking-tighter">
          MONA'S PANG
          <br />
          <span style={{ color: primaryColor }} className="drop-shadow-[0_0_30px_rgba(10,61,1,0.5)]">
            NOCHE BUENA
          </span>
        </h1>


        {/* Action Buttons */}
        <div className="flex flex-col items-center gap-4 w-full max-w-sm lg:max-w-md mx-auto">
          {user && user.role !== 'customer' ? (
            <>
              <Link
                to={user.role === 'admin' ? '/admin' : '/'}
                className="btn-custom w-full text-lg py-5 rounded-2xl font-black tracking-widest uppercase flex items-center justify-center gap-2 mb-2 shadow-xl"
              >
                Go to {user.role.charAt(0).toUpperCase() + user.role.slice(1)} <Rocket className="w-5 h-5 ml-1" />
              </Link>
              
              <Link to={menuLink} className="w-full py-4 px-6 bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-2xl font-bold transition-all flex items-center justify-center">
                Start New Order
              </Link>
            </>
          ) : (
            <>
              <Link to={menuLink} className="btn-custom w-full text-xl md:text-lg lg:text-xl py-6 md:py-5 lg:py-6 rounded-3xl font-black tracking-widest uppercase flex items-center justify-center gap-3 shadow-2xl transition-all hover:scale-105" id="start-order-btn">
                {isCustomer ? 'Start Ordering' : 'Start Order'}
              </Link>

              <div className="w-full mt-2">
                {!user && (
                  <Link to={portalLink} className="w-full text-xl md:text-lg lg:text-xl py-6 md:py-5 lg:py-6 px-6 bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-3xl font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2">
                    <span></span> Sign In
                  </Link>
                )}
              </div>

              {activeOrders.length > 0 && (
                <button
                  onClick={() => setShowOrdersModal(true)}
                  className="w-full mt-2 py-4 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-2xl font-bold flex items-center justify-center gap-2 animate-pulse"
                >
                  <span></span> View Orders ({activeOrders.length})
                </button>
              )}

              {showOrdersModal && (
                <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in" onClick={() => setShowOrdersModal(false)}>
                  <div className="bg-white rounded-[2rem] w-full max-w-sm p-6 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-4 text-center">Your Active Orders</h3>
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                      {activeOrders.map((orderNum) => (
                        <Link
                          key={orderNum}
                          to={`/order/${orderNum}`}
                          className="block w-full p-4 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-2xl transition-all active:scale-[0.98]"
                          onClick={() => setShowOrdersModal(false)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-black text-slate-900">Order #{orderNum.includes('-') ? orderNum.split('-')[1] : orderNum}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Tap to track</p>
                            </div>
                            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                              <span className="text-emerald-600 text-sm">→</span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowOrdersModal(false)}
                      className="w-full mt-4 py-3 bg-slate-100 text-slate-500 font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {!user ? (
            <Link to="/login" className="text-surface-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors mt-6">
              Staff Secure Login →
            </Link>
          ) : (
            <button
              onClick={logoutUser}
              className="text-red-400 text-[10px] font-black uppercase tracking-widest hover:text-red-300 transition-colors mt-6"
            >
              {user.role === 'customer' ? `Not ${user.name.split(' ')[0]}? Sign Out` : `Log Out System [${user.role}]`}
            </button>
          )}
        </div>
      </div>

      {/* Store footer */}
      <footer className="relative z-10 mt-auto w-full border-t border-white/15 px-4 py-3 shadow-lg" style={{ backgroundColor: primaryColor }}>
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-3 sm:px-6 md:grid-cols-2 md:px-8">
          <div className="min-w-0">
            <a
              href="https://www.facebook.com/monabuque1"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 shadow-sm transition-transform hover:scale-[1.02]"
              aria-label="Visit Mona's Pang Noche Buena on Facebook"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 text-[#1877F2]" fill="currentColor">
                <path d="M14 8h3V4h-3c-2.76 0-5 2.24-5 5v3H6v4h3v5h4v-5h3l1-4h-4V9c0-.55.45-1 1-1Z" />
              </svg>
              <span className="truncate text-xs font-black tracking-tight" style={{ color: primaryColor }}>
                {tenant?.name || "Mona's Pang Noche Buena"}
              </span>
            </a>
            <p className="mt-1 text-[10px] font-medium leading-snug text-white/90 sm:text-xs">
              Villanueva Extension, Butuan City, Agusan del Norte<br />
              Monday–Saturday: 9:00 AM–6:00 PM · Sunday: 9:00 AM–3:00 PM
            </p>
          </div>
          <div className="flex flex-col items-center gap-1.5 md:items-end">
            <p className="text-xs font-medium text-white/80 md:whitespace-nowrap">© {new Date().getFullYear()} {tenant?.name || "Mona's Pang Noche Buena"}</p>
            <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[9px] font-bold uppercase tracking-widest text-white/70 md:justify-end" aria-label="Legal links">
              <Link to="/privacy" className="transition-colors hover:text-white">Privacy</Link>
              <Link to="/terms" className="transition-colors hover:text-white">Terms</Link>
              <Link to="/data-deletion" className="transition-colors hover:text-white">Conditions</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
