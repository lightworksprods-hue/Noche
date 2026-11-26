import { useEffect, useMemo, useState } from 'react';
import { createAdminManualUtang, createAdminUtang, getAdminOrders, getAdminUtang, recordAdminUtangPayment } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { CalendarClock, CreditCard, PlusCircle } from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);

export default function UtangTracker() {
  const [plans, setPlans] = useState([]);
  const [orders, setOrders] = useState([]);
  const [entryMode, setEntryMode] = useState('order');
  const [orderId, setOrderId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [balance, setBalance] = useState('');
  const [frequency, setFrequency] = useState('every_15th');
  const [nextDueDate, setNextDueDate] = useState(today());
  const [paymentAmounts, setPaymentAmounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [plansRes, ordersRes] = await Promise.all([getAdminUtang(), getAdminOrders('all', 1)]);
      setPlans(plansRes.data.data || []);
      setOrders(ordersRes.data.data || []);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Failed to load utang tracker.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const eligibleOrders = useMemo(() => orders.filter(order => !order.debtPlan && order.paymentStatus !== 'paid' && order.paymentStatus !== 'rejected' && order.status !== 'cancelled'), [orders]);

  const setupPlan = async (event) => {
    event.preventDefault();
    try {
      if (entryMode === 'manual') {
        await createAdminManualUtang({ customerName, customerPhone, balance, frequency, nextDueDate });
      } else {
        if (!orderId) return;
        await createAdminUtang(orderId, { frequency, nextDueDate });
      }
      setOrderId('');
      setCustomerName('');
      setCustomerPhone('');
      setBalance('');
      setMessage('Utang plan created.');
      await load();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not create the utang plan.');
    }
  };

  const recordPayment = async (plan) => {
    const amount = Number(paymentAmounts[plan.id]);
    if (!amount) return;
    try {
      await recordAdminUtangPayment(plan.id, { amount, paymentMethod: 'cash' });
      setPaymentAmounts(current => ({ ...current, [plan.id]: '' }));
      setMessage('Installment recorded.');
      await load();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not record installment.');
    }
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      <div>
        <h2 className="text-2xl font-black text-surface-900">Utang Tracker</h2>
        <p className="mt-1 text-sm font-medium text-surface-500">Track staggered customer payments and upcoming due dates.</p>
      </div>

      <form onSubmit={setupPlan} className="rounded-3xl border border-surface-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm font-black text-surface-900"><span className="flex items-center gap-2"><PlusCircle className="h-5 w-5 text-primary-600" /> Add customer to utang tracker</span><div className="flex rounded-xl bg-surface-100 p-1 text-[10px] font-black uppercase"><button type="button" onClick={() => setEntryMode('order')} className={`rounded-lg px-3 py-2 ${entryMode === 'order' ? 'bg-white text-primary-700 shadow-sm' : 'text-surface-500'}`}>Existing order</button><button type="button" onClick={() => setEntryMode('manual')} className={`rounded-lg px-3 py-2 ${entryMode === 'manual' ? 'bg-white text-primary-700 shadow-sm' : 'text-surface-500'}`}>Manual customer</button></div></div>
        <div className={`grid gap-3 md:items-end ${entryMode === 'manual' ? 'md:grid-cols-[2fr_1fr_1fr_1fr_auto]' : 'md:grid-cols-[2fr_1fr_1fr_auto]'}`}>
          {entryMode === 'manual' && <>
            <label className="text-xs font-bold text-surface-500">Customer name<input value={customerName} onChange={e => setCustomerName(e.target.value)} className="input-field mt-1" placeholder="e.g. Juan Dela Cruz" required /></label>
            <label className="text-xs font-bold text-surface-500">Phone (optional)<input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="input-field mt-1" placeholder="09..." /></label>
            <label className="text-xs font-bold text-surface-500">Remaining balance<input type="number" min="0.01" step="0.01" value={balance} onChange={e => setBalance(e.target.value)} className="input-field mt-1" placeholder="0.00" required /></label>
          </>}
          <label className={`text-xs font-bold text-surface-500 ${entryMode === 'manual' ? 'hidden' : ''}`}>Order / Customer
            <select value={orderId} onChange={e => setOrderId(e.target.value)} className="input-field mt-1" required={entryMode === 'order'}>
              <option value="">Select an unpaid order</option>
              {eligibleOrders.map(order => <option key={order.id} value={order.id}>#{String(order.orderNumber).replace(/^POS-/, '')} — {order.customerName || 'Guest'} — {formatCurrency(order.total)}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-surface-500">Payment schedule
            <select value={frequency} onChange={e => setFrequency(e.target.value)} className="input-field mt-1">
              <option value="every_15th">Every 15th</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="text-xs font-bold text-surface-500">First due date
            <input type="date" value={nextDueDate} min={today()} onChange={e => setNextDueDate(e.target.value)} className="input-field mt-1" required />
          </label>
          <button type="submit" className="rounded-xl bg-primary-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-primary-700">Add Plan</button>
        </div>
      </form>

      {message && <p className="rounded-xl bg-primary-50 px-4 py-3 text-sm font-bold text-primary-700">{message}</p>}

      {loading ? <div className="p-8 text-center text-surface-500">Loading utang accounts...</div> : plans.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-surface-300 bg-white p-10 text-center text-surface-500">No staggered-payment accounts yet.</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {plans.map(plan => (
            <article key={plan.id} className="rounded-3xl border border-surface-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-black text-surface-900">{plan.order ? `#${String(plan.order.orderNumber).replace(/^POS-/, '')}` : 'Manual account'}</p>
                  <h3 className="mt-1 font-black text-surface-900">{plan.order?.customerName || plan.customerName || 'Guest'}</h3>
                  {(plan.order?.customerPhone || plan.customerPhone) && <p className="text-xs text-surface-500">{plan.order?.customerPhone || plan.customerPhone}</p>}
                </div>
                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${plan.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{plan.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-surface-50 p-3 text-center">
                <div><p className="text-[9px] font-black uppercase text-surface-400">Balance</p><p className="font-black text-red-600">{formatCurrency(plan.balance)}</p></div>
                <div><p className="text-[9px] font-black uppercase text-surface-400">Schedule</p><p className="font-black text-surface-700">{plan.frequency === 'every_15th' ? 'Every 15th' : 'Monthly'}</p></div>
                <div><p className="text-[9px] font-black uppercase text-surface-400">Next Due</p><p className="font-black text-surface-700">{formatDate(plan.nextDueDate)}</p></div>
              </div>
              {plan.status !== 'paid' && <div className="mt-4 flex gap-2"><input type="number" min="0.01" step="0.01" max={plan.balance} placeholder="Installment amount" value={paymentAmounts[plan.id] || ''} onChange={e => setPaymentAmounts(current => ({ ...current, [plan.id]: e.target.value }))} className="input-field" /><button type="button" onClick={() => recordPayment(plan)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-emerald-700"><CreditCard className="h-4 w-4" /> Record</button></div>}
              <div className="mt-4 border-t border-surface-100 pt-3"><p className="mb-2 text-[10px] font-black uppercase tracking-widest text-surface-400">Payment history</p>{plan.payments.length === 0 ? <p className="text-xs text-surface-400">No installments recorded.</p> : plan.payments.map(payment => <div key={payment.id} className="flex justify-between text-xs text-surface-600"><span>{formatDate(payment.paidAt)} · {payment.paymentMethod}</span><strong>{formatCurrency(payment.amount)}</strong></div>)}</div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
