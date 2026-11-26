import { useState, useEffect, useRef } from 'react';
import { getAdminOrders, hardDeleteOrder, updateAdminOrderStatus, updateAdminOrderPayment, updateAdminOrderRefund, updateAdminOrderSchedule } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { AlertTriangle, CheckCircle, CircleAlert, ChevronDown, MoreVertical, Trash2, XCircle } from 'lucide-react';
import PaginationControls from './PaginationControls';
import { useSocket } from '../../context/SocketContext';

export default function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [openMenuId, setOpenMenuId] = useState(null);
  const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());
  const menuRef = useRef(null);
  const { onEvent } = useSocket();

  const getOrderTypeLabel = (orderType) => {
    const labels = {
      dine_in: 'Dine In',
      take_out: 'Pick Up',
      pickup: 'Pick Up',
      delivery: 'Delivery'
    };

    return labels[orderType] || 'Dine In';
  };

  useEffect(() => {
    // Add simple debounce for search to prevent flashing on every keystroke
    const timer = setTimeout(() => {
      loadOrders();
    }, 300);
    return () => clearTimeout(timer);
  }, [status, page, searchQuery]);

  useEffect(() => {
    const unsubscribe = onEvent('new_order', () => loadOrders());
    return unsubscribe;
  }, [onEvent, status, page, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await getAdminOrders(status, page, searchQuery);
      setOrders(res.data.data);
      setExpandedOrderIds(new Set());
      setPagination({ total: res.data.total || 0, totalPages: Math.ceil((res.data.total || 0) / (res.data.limit || 50)) || 1 });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (s) => {
    switch (s) {
      case 'completed': return 'bg-emerald-100 text-emerald-700';
      case 'preparing': return 'bg-amber-100 text-amber-700';
      case 'pending': return 'bg-blue-100 text-blue-700';
      case 'confirmed': return 'bg-pink-100 text-pink-700';
      case 'booked': return 'bg-pink-100 text-pink-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-surface-100 text-surface-700';
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(null); // Stores { id, orderNumber } when modal is open
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [paymentMessage, setPaymentMessage] = useState(null);
  const [deletingOrderId, setDeletingOrderId] = useState(null);
  const cancelModalRef = useRef(null);

  useEffect(() => {
    if (!confirmCancel) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      cancelModalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cancelModalRef.current?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [confirmCancel]);

  const isFullPaymentOrder = (order) => order.paymentMode === 'full_payment' || (order.paymentMode === 'custom_payment' && Number(order.paymentAmount || 0) >= Number(order.total || 0));
  const getSubmittedPaymentAmount = (order) => isFullPaymentOrder(order)
    ? Number(order.total || 0)
    : Number(order.paymentAmount || 0) || Number(order.total || 0) * 0.5;
  const getPaymentPlanLabel = (order) => isFullPaymentOrder(order)
    ? 'Full payment'
    : order.paymentMode === 'custom_payment'
      ? 'Custom payment'
      : '50% downpayment';
  const getPaymentSummary = (order) => {
    const reference = order.paymentMethod === 'qrph' && order.paymentReference
      ? ` • Ref ${order.paymentReference}`
      : '';
    return `${getPaymentPlanLabel(order)}${reference}`;
  };
  const getBalance = (order) => Math.max(0, Number(order.total || 0) - getSubmittedPaymentAmount(order));
  const toggleOrderDetails = (orderId) => {
    setExpandedOrderIds(current => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const handleHardDelete = async () => {
    if (!confirmDelete) return;
    const { id, orderNumber } = confirmDelete;

    try {
      setDeletingOrderId(id);
      await hardDeleteOrder(id);
      setConfirmDelete(null);
      await loadOrders();
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.message || 'Failed to delete order. Please try again.');
    } finally {
      setDeletingOrderId(null);
    }
  };

  const handleStatusChange = async (order, nextStatus) => {
    if (!nextStatus || nextStatus === order.status) return;
    try {
      await updateAdminOrderStatus(order.id, nextStatus);
      await loadOrders();
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.message || 'Failed to update order status.');
    }
  };

  const handleCancelOrder = async (order) => {
    setConfirmCancel({ id: order.id, orderNumber: order.orderNumber });
  };

  const handleConfirmCancel = async () => {
    if (!confirmCancel) return;
    const order = confirmCancel;
    setConfirmCancel(null);
    await handleStatusChange(order, 'cancelled');
  };

  const handleRefundDecision = async (order, refundStatus) => {
    try {
      await updateAdminOrderRefund(order.id, refundStatus);
      await loadOrders();
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.message || 'Failed to update refund status.');
    }
  };

  const handlePaymentDecision = async (order, paymentStatus) => {
    try {
      const fullPaymentSelected = isFullPaymentOrder(order);
      const verifiedStatus = paymentStatus === 'paid' && order.paymentStatus === 'submitted' && !fullPaymentSelected
        ? 'partially_paid'
        : paymentStatus;
      await updateAdminOrderPayment(order.id, verifiedStatus);
      await loadOrders();
    } catch (error) {
      console.error(error);
      setPaymentMessage({
        title: 'Payment not ready',
        message: error.response?.data?.message || 'This payment could not be updated right now.',
      });
    }
  };

  const handleScheduleDecision = async (order, scheduleStatus) => {
    const scheduleNote = scheduleStatus === 'rejected'
      ? window.prompt('Why can this requested date/time not be catered?') || ''
      : '';
    try {
      await updateAdminOrderSchedule(order.id, scheduleStatus, scheduleNote);
      await loadOrders();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to update the requested schedule.');
    }
  };

  if (loading && orders.length === 0) return <div className="p-8 text-center text-surface-500">Loading orders...</div>;

  return (
    <div className="animate-fade-in-up">
      {/* Custom Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-surface-100 animate-scale-in animate-float">
            <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mb-6 mx-auto shadow-inner">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h3 className="font-heading text-2xl font-black text-center text-surface-900 mb-2">
              PERMANENT DELETE
            </h3>
            <p className="text-center text-surface-500 font-medium mb-8 leading-relaxed">
              Are you sure you want to completely remove <span className="text-surface-900 font-black">Order #{confirmDelete.orderNumber}</span> from the database? This cannot be undone and will affect historical records.
            </p>
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deletingOrderId !== null}
                className="flex-1 px-6 py-4 rounded-2xl bg-surface-100 text-surface-600 font-black uppercase tracking-widest text-xs hover:bg-surface-200 transition-all"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleHardDelete}
                disabled={deletingOrderId !== null}
                className="flex-1 px-6 py-4 rounded-2xl bg-red-600 text-white font-black uppercase tracking-widest text-xs hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all"
              >
                {deletingOrderId !== null ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmCancel && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-surface-950/55 p-2 backdrop-blur-sm animate-fade-in sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-order-title"
        >
          <div ref={cancelModalRef} tabIndex="-1" className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-[1.5rem] border border-primary-100 bg-white shadow-2xl outline-none animate-scale-in sm:max-h-[calc(100dvh-2rem)] sm:rounded-[2rem]">
            <div className="bg-gradient-to-br from-primary-600 to-primary-800 px-5 pb-5 pt-4 text-white sm:px-6 sm:pb-7 sm:pt-6">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 sm:mb-5 sm:h-14 sm:w-14">
                <XCircle className="h-6 w-6 sm:h-7 sm:w-7" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">Order action</p>
              <h3 id="cancel-order-title" className="mt-1 font-heading text-xl font-black sm:text-2xl">Cancel this order?</h3>
            </div>
            <div className="p-5 sm:p-6">
              <p className="leading-relaxed text-surface-600">
                Are you sure you want to cancel <span className="font-black text-surface-900">Order #{confirmCancel.orderNumber}</span>?
              </p>
              <p className="mt-2 rounded-xl border border-primary-100 bg-primary-50 px-3 py-2.5 text-sm font-medium text-primary-800 sm:mt-3 sm:px-4 sm:py-3">
                The order will move to the cancelled list and its refund status will require an admin decision.
              </p>
            </div>
            <div className="flex gap-3 border-t border-surface-100 bg-surface-50 p-4 sm:p-6">
              <button
                type="button"
                onClick={() => setConfirmCancel(null)}
                className="flex-1 rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm font-black text-surface-600 transition hover:bg-surface-100"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="flex-1 rounded-xl bg-primary-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 active:scale-95"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentMessage && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-surface-950/45 p-4 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-message-title"
        >
          <div className="w-full max-w-sm overflow-hidden rounded-[2rem] border border-pink-100 bg-white shadow-2xl animate-scale-in">
            <div className="bg-gradient-to-br from-pink-500 to-fuchsia-600 px-6 pb-7 pt-6 text-white">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
                <CircleAlert className="h-7 w-7" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-pink-100">Payment verification</p>
              <h3 id="payment-message-title" className="mt-1 font-heading text-2xl font-black">
                {paymentMessage.title}
              </h3>
            </div>
            <div className="p-6">
              <p className="leading-relaxed text-surface-600">{paymentMessage.message}</p>
              <p className="mt-3 text-sm font-medium text-surface-400">
                Ask the customer to submit the payment reference before confirming the order.
              </p>
              <button
                type="button"
                onClick={() => setPaymentMessage(null)}
                className="mt-6 w-full rounded-2xl bg-primary-600 px-5 py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
        <h2 className="font-heading text-2xl sm:text-3xl font-black text-surface-900 tracking-tight">Order Management</h2>
        
        <div className="flex flex-col gap-3 xl:flex-row">
          <div className="relative w-full xl:w-64">
            <input 
              type="text"
              placeholder="Search order # or name..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="input-field pl-10 pr-4 py-2 w-full"
            />
            <svg className="w-4 h-4 text-surface-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>

          <div className="flex flex-wrap gap-2">
            {['pending', 'booked', 'ready', 'completed', 'cancelled'].map(s => (
              <button key={s} onClick={() => { setStatus(s); setPage(1); }} className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${status === s ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20' : 'bg-white text-surface-500 border border-surface-200 hover:bg-surface-50'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden lg:block bg-white rounded-2xl shadow-sm border border-surface-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200 text-xs font-bold text-surface-400 uppercase tracking-widest">
                <th className="p-4">Order #</th>
                <th className="p-4">Date</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Ordered Items</th>
                <th className="p-4">Total</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4">Payment</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 text-sm">
              {orders.map(order => (
                <tr key={order.id} className="hover:bg-surface-50 transition-colors group">
                  <td className="p-4">
                    <span className="font-mono font-bold text-surface-900">#{order.orderNumber}</span>
                  </td>
                  <td className="p-4 text-surface-500 whitespace-nowrap">{formatDate(order.createdAt)}</td>
                  <td className="p-4">
                    <div className="font-bold text-surface-900">{order.customerName || 'Guest'}</div>
                    {order.customerPhone && <div className="text-[11px] text-surface-500">{order.customerPhone}</div>}
                    {order.customerEmail && <div className="text-[11px] text-surface-500 truncate max-w-[180px]">{order.customerEmail}</div>}
                    <div className="text-[10px] text-surface-400 uppercase font-black">{getOrderTypeLabel(order.orderType)}</div>
                    {order.scheduledFor && <div className="mt-1 text-[11px] font-black text-primary-600">For: {formatDate(order.scheduledFor)}</div>}
                    {order.scheduledFor && <div className={`text-[10px] font-black uppercase ${order.scheduleStatus === 'confirmed' ? 'text-emerald-600' : order.scheduleStatus === 'rejected' ? 'text-red-600' : 'text-amber-600'}`}>{order.scheduleStatus === 'confirmed' ? 'Schedule confirmed' : order.scheduleStatus === 'rejected' ? 'Schedule rejected' : 'Schedule needs confirmation'}</div>}
                  </td>
                  <td className="p-4 min-w-[190px]">
                    <div className="space-y-1">
                      {(order.items || []).map(item => (
                        <div key={item.id} className="text-xs text-surface-700">
                          <span className="font-black">{item.quantity}×</span> {item.productName}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="p-4 font-black text-surface-900">{formatCurrency(order.total)}</td>
                  <td className="p-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="text-xs font-medium text-surface-600 capitalize">{order.paymentMethod === 'qrph' ? 'QR Ph' : (order.paymentMethod || 'Cash')}</span>
                    {(order.paymentMethod === 'qrph' || order.paymentMethod === 'cash') && (
                      <div className={`mt-1 text-[10px] font-black uppercase ${order.paymentStatus === 'submitted' ? 'text-amber-600' : order.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {order.paymentStatus === 'submitted'
                          ? `Verify • ${getPaymentSummary(order)}`
                          : order.paymentStatus === 'partially_paid'
                            ? `${getPaymentPlanLabel(order)} paid • Balance ${formatCurrency(getBalance(order))}`
                            : order.paymentStatus}
                        {order.paymentStatus === 'submitted' && <div className="mt-1 normal-case font-black text-amber-700">Amount submitted: {formatCurrency(getSubmittedPaymentAmount(order))}</div>}
                        {order.paymentVerifiedAt && <div className="mt-1 normal-case font-semibold text-surface-500">{getPaymentPlanLabel(order)} verified: {formatDate(order.paymentVerifiedAt)}</div>}
                        {order.fullyPaidAt && <div className="normal-case font-semibold text-emerald-600">Fully paid: {formatDate(order.fullyPaidAt)}</div>}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    {order.scheduledFor && order.scheduleStatus === 'pending' && (
                      <div className="mb-2 flex justify-end gap-2">
                        <button onClick={() => handleScheduleDecision(order, 'rejected')} className="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-600 hover:bg-red-100">Reject Date</button>
                        <button onClick={() => handleScheduleDecision(order, 'confirmed')} className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-600 hover:bg-emerald-100">Confirm Date</button>
                      </div>
                    )}
                    {(order.paymentMethod === 'qrph' || order.paymentMethod === 'cash') && order.paymentStatus === 'submitted' && (
                      <div className="mb-2 flex justify-end gap-2">
                        <button onClick={() => handlePaymentDecision(order, 'rejected')} className="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-600 hover:bg-red-100">Reject</button>
                        <button onClick={() => handlePaymentDecision(order, 'paid')} className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-600 hover:bg-emerald-100">Confirm Payment</button>
                      </div>
                    )}
                    {order.paymentStatus === 'partially_paid' && (
                      <div className="mb-2 flex justify-end gap-2">
                        <button onClick={() => updateAdminOrderPayment(order.id, 'paid', 'cash').then(loadOrders)} className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-600 hover:bg-emerald-100">Balance Paid Cash</button>
                        <button onClick={() => updateAdminOrderPayment(order.id, 'paid', 'qrph').then(loadOrders)} className="rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-100">Balance Paid QR Ph</button>
                      </div>
                    )}
                    {order.status !== 'cancelled' && order.status !== 'completed' && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {(order.status === 'booked' || order.status === 'confirmed' || order.status === 'preparing') && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(order, 'ready')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-emerald-700"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            {order.orderType === 'delivery' ? 'Ready for Delivery' : 'Ready for Pickup'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCancelOrder(order)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-red-600 shadow-sm transition hover:bg-red-100"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Cancel Order
                        </button>
                      </div>
                    )}
                    {order.status === 'cancelled' && (
                      <div className="mb-2 flex justify-end gap-2">
                        {!['refunded', 'not_refunded', 'not_required'].includes(order.refundStatus) && (
                          <button
                            type="button"
                            onClick={() => handleRefundDecision(order, 'refunded')}
                            className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-100"
                          >
                            Refunded
                          </button>
                        )}
                      </div>
                    )}
                    {order.status === 'cancelled' && (
                      <div className="relative inline-block" ref={openMenuId === order.id ? menuRef : null}>
                        <button
                          onClick={() => setOpenMenuId(openMenuId === order.id ? null : order.id)}
                          className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-colors"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        {openMenuId === order.id && (
                          <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-surface-200 overflow-hidden z-50 min-w-[170px] animate-fade-in shadow-surface-500/10">
                            <button
                              onClick={() => { setOpenMenuId(null); setConfirmDelete({ id: order.id, orderNumber: order.orderNumber }); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              Hard Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan="8" className="p-12 text-center text-surface-400">No orders found for this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls page={page} totalPages={pagination.totalPages} total={pagination.total} itemCount={orders.length} onPageChange={setPage} />
      </div>

      {/* Stacked order cards keep tablet layouts readable without horizontal scrolling. */}
      <div className="lg:hidden space-y-3">
        {orders.map(order => (
          <article key={order.id} className="relative bg-white rounded-3xl border border-surface-200 p-4 sm:p-5 shadow-sm">
            <button
              type="button"
              onClick={() => toggleOrderDetails(order.id)}
              aria-expanded={expandedOrderIds.has(order.id)}
              className="mb-0 flex w-full items-start justify-between gap-3 text-left"
            >
              <div>
                <p className="font-mono text-sm font-black text-surface-900">#{order.orderNumber}</p>
                <p className="text-xs text-surface-500 mt-1">{formatDate(order.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${getStatusColor(order.status)}`}>
                  {order.status}
                </span>
                <ChevronDown className={`h-4 w-4 text-surface-400 transition-transform ${expandedOrderIds.has(order.id) ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {expandedOrderIds.has(order.id) && <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-surface-100 pt-4">
              <div className="col-span-2 min-w-0 rounded-2xl bg-surface-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-surface-400 mb-1">Customer & order type</p>
                <p className="font-bold text-surface-900 truncate">{order.customerName || 'Guest'}</p>
                {order.customerPhone && <p className="text-[11px] text-surface-500">{order.customerPhone}</p>}
                {order.customerEmail && <p className="text-[11px] text-surface-500 truncate">{order.customerEmail}</p>}
                <p className="text-[10px] text-surface-400 uppercase font-black mt-1">{getOrderTypeLabel(order.orderType)}</p>
              </div>
              {order.scheduledFor && (
                <div className="col-span-2 rounded-2xl border border-amber-100 bg-amber-50/60 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Preparation schedule</p>
                  <p className="mt-1 text-sm font-black text-surface-900">{formatDate(order.scheduledFor)}</p>
                  <p className={`text-[10px] font-black uppercase ${order.scheduleStatus === 'confirmed' ? 'text-emerald-600' : order.scheduleStatus === 'rejected' ? 'text-red-600' : 'text-amber-600'}`}>{order.scheduleStatus === 'confirmed' ? 'Date confirmed' : order.scheduleStatus === 'rejected' ? 'Date rejected' : 'Waiting for admin confirmation'}</p>
                {order.scheduleStatus === 'pending' && <div className="mt-3 flex gap-2">
                  <button onClick={() => handleScheduleDecision(order, 'rejected')} className="flex-1 rounded-xl bg-red-50 py-2 text-[10px] font-black uppercase text-red-600">Reject Date</button>
                  <button onClick={() => handleScheduleDecision(order, 'confirmed')} className="flex-1 rounded-xl bg-emerald-50 py-2 text-[10px] font-black uppercase text-emerald-600">Confirm Date</button>
                </div>}
                </div>
              )}
              <div className="col-span-2 flex items-center justify-between border-t border-surface-100 pt-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-surface-400">Order total</p>
                <p className="text-lg font-black text-surface-900">{formatCurrency(order.total)}</p>
              </div>
              <div className="col-span-2 border-t border-surface-100 pt-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-surface-400 mb-2">Ordered Items</p>
                <div className="space-y-1.5">
                  {(order.items || []).map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 text-sm text-surface-700">
                      <span><span className="font-black text-surface-900">{item.quantity}×</span> {item.productName}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="col-span-2 rounded-2xl border border-surface-200 bg-surface-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-surface-400 mb-1">Payment review</p>
                <p className="text-sm font-medium text-surface-600 capitalize">{order.paymentMethod === 'qrph' ? 'QR Ph' : (order.paymentMethod || 'Cash')}</p>
                {(order.paymentMethod === 'qrph' || order.paymentMethod === 'cash') && (
                  <p className={`text-[10px] font-black uppercase mt-1 ${order.paymentStatus === 'submitted' ? 'text-amber-600' : order.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {order.paymentStatus === 'submitted'
                      ? getPaymentSummary(order)
                      : order.paymentStatus === 'partially_paid'
                        ? `${getPaymentPlanLabel(order)} paid • Balance ${formatCurrency(getBalance(order))}`
                        : order.paymentStatus}
                    {order.paymentStatus === 'submitted' && <span className="mt-1 block normal-case font-black text-amber-700">Amount submitted: {formatCurrency(getSubmittedPaymentAmount(order))}</span>}
                    {order.paymentVerifiedAt && <span className="mt-1 block normal-case font-semibold text-surface-500">{getPaymentPlanLabel(order)} verified: {formatDate(order.paymentVerifiedAt)}</span>}
                    {order.fullyPaidAt && <span className="block normal-case font-semibold text-emerald-600">Fully paid: {formatDate(order.fullyPaidAt)}</span>}
                  </p>
                )}
              </div>
              {(order.paymentMethod === 'qrph' || order.paymentMethod === 'cash') && order.paymentStatus === 'submitted' && (
                <div className="col-span-2 border-t border-surface-100 pt-3">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-surface-400">Payment decision</p>
                  <div className="flex gap-2">
                  <button onClick={() => handlePaymentDecision(order, 'rejected')} className="flex-1 rounded-xl bg-red-50 py-2 text-[10px] font-black uppercase text-red-600">Reject Payment</button>
                  <button onClick={() => handlePaymentDecision(order, 'paid')} className="flex-1 rounded-xl bg-emerald-50 py-2 text-[10px] font-black uppercase text-emerald-600">Confirm Payment</button>
                  </div>
                </div>
              )}
              {order.paymentStatus === 'partially_paid' && (
                <div className="col-span-2 flex gap-2">
                  <button onClick={() => updateAdminOrderPayment(order.id, 'paid', 'cash').then(loadOrders)} className="flex-1 rounded-xl bg-emerald-50 py-2 text-[10px] font-black uppercase text-emerald-600">Balance Paid Cash</button>
                  <button onClick={() => updateAdminOrderPayment(order.id, 'paid', 'qrph').then(loadOrders)} className="flex-1 rounded-xl bg-blue-50 py-2 text-[10px] font-black uppercase text-blue-600">Balance Paid QR Ph</button>
                </div>
              )}
              {order.status !== 'cancelled' && order.status !== 'completed' && (order.status === 'booked' || order.status === 'confirmed' || order.status === 'preparing') && (
                <button
                  type="button"
                  onClick={() => handleStatusChange(order, 'ready')}
                  className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <CheckCircle className="h-4 w-4" />
                  {order.orderType === 'delivery' ? 'Mark Ready for Delivery' : 'Mark Ready for Pickup'}
                </button>
              )}
              {order.status !== 'cancelled' && order.status !== 'completed' && (
                <button
                  type="button"
                  onClick={() => handleCancelOrder(order)}
                  className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3 text-xs font-black uppercase tracking-wide text-red-600 transition hover:bg-red-100"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel Order
                </button>
              )}
              {order.status === 'cancelled' && (
                <div className="col-span-2 rounded-xl border border-red-100 bg-red-50/60 p-3">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-red-500">
                    Refund: {order.refundStatus === 'refunded' ? 'Refunded' : order.refundStatus === 'not_refunded' || order.refundStatus === 'not_required' ? 'Not Refunded' : 'Pending Admin Decision'}
                  </p>
                  {!['refunded', 'not_refunded', 'not_required'].includes(order.refundStatus) && (
                    <button
                      type="button"
                      onClick={() => handleRefundDecision(order, 'refunded')}
                      className="w-full rounded-lg bg-emerald-100 py-2 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-200"
                    >
                      Refunded
                    </button>
                  )}
                </div>
              )}
              {order.status === 'cancelled' && (
                <div className="flex items-end justify-end">
                  <div className="relative" ref={openMenuId === order.id ? menuRef : null}>
                    <button
                      onClick={() => setOpenMenuId(openMenuId === order.id ? null : order.id)}
                      className="p-2 rounded-xl bg-surface-50 text-surface-500 hover:bg-surface-100 transition-colors"
                      aria-label={`Actions for order ${order.orderNumber}`}
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    {openMenuId === order.id && (
                      <div className="absolute right-0 bottom-full mb-2 bg-white rounded-xl shadow-xl border border-surface-200 overflow-hidden z-50 min-w-[170px] animate-fade-in">
                        <button
                          onClick={() => { setOpenMenuId(null); setConfirmDelete({ id: order.id, orderNumber: order.orderNumber }); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          Hard Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>}
          </article>
        ))}
        {orders.length === 0 && (
          <div className="bg-white rounded-3xl border border-surface-200 p-12 text-center text-surface-400">
            No orders found for this filter.
          </div>
        )}
        <PaginationControls page={page} totalPages={pagination.totalPages} total={pagination.total} itemCount={orders.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
