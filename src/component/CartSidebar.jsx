import { useState, useEffect } from 'react';
import {
  X, Minus, Plus, Trash2, ShoppingCart, CreditCard, ShieldCheck, MessageCircle, Copy, Check,
  Gift, Truck, Receipt, Store, MapPin, Info,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { usePromos } from '../context/PromoContext';
import { useNavigate, Link } from 'react-router-dom';
import { orders as ordersApi, deliveryZones as deliveryZonesApi } from '../lib/api';
import { initializePaystack } from '../lib/paystack';
import { useSettings } from '../context/SettingsContext';
import cardimg from '../assets/images.png';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Cart items normally already store price as a clean number (CartContext
// parses it on addToCart), but this guards against a stray string slipping
// through so the WhatsApp message math never breaks.
const parsePriceValue = (val) => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val.replace(/[₦,]/g, '')) || 0;
  return 0;
};

export default function CartSidebar() {
  const {
    cartItems, isOpen, checkoutMode, openCart, closeCart, removeFromCart,
    increaseQuantity, decreaseQuantity, subtotal, itemCount, clearCart,
  } = useCart();

  const { activePromos } = usePromos();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [step, setStep] = useState('cart');

  const loadSavedInfo = () => {
    try {
      const saved = localStorage.getItem('solohans_checkout_info');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { name: '', phone: '', email: '', address: '' };
  };

  const [form, setForm] = useState(() => ({ ...loadSavedInfo(), remember: false }));
  const [notes, setNotes] = useState(''); // per-order, never saved/remembered
  const [deliveryMethod, setDeliveryMethod] = useState('delivery'); // 'delivery' | 'pickup'
  const [zones, setZones] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [formErrors, setFormErrors] = useState('');
  const [orderResult, setOrderResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const copyOrderId = (id) => {
    navigator.clipboard?.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  const [processing, setProcessing] = useState(false);

  // ✅ Daily Dish Stock — true if any cart line exceeds today's known
  // remaining stock for that dish. Only ever true for dishes explicitly
  // opted into daily tracking (item.remaining is undefined for everything
  // else, so this is always false for them).
  const cartStockExceeded = cartItems.some(
    item => item.trackDailyStock && typeof item.remaining === 'number' && item.quantity > item.remaining
  );

  // ─── Promo calculations ─────────────────────────────────────────────────
  let discountAmount = 0;
  let freeDelivery = false;
  const freeItems = [];

  for (const promo of activePromos) {
    const isApplicable =
      promo.scope === 'all' ||
      (promo.scope === 'selected' && promo.applicableItems?.some(promoItem => {
        const promoItemId = typeof promoItem === 'string' ? promoItem : promoItem._id?.toString();
        return cartItems.some(item => item.id === promoItemId);
      }));

    if (!isApplicable) continue;

    if (promo.type === 'percentage' && promo.discountPercentage) {
      discountAmount += subtotal * (promo.discountPercentage / 100);
    }

    if (promo.type === 'freeDelivery') {
      freeDelivery = true;
    }

    if (promo.type === 'freeItem' && promo.triggerItems?.length && promo.freeItem) {
      const hasTrigger = cartItems.some(item =>
        promo.triggerItems.some(t => (typeof t === 'string' ? t : t._id?.toString()) === item.id)
      );
      if (hasTrigger) {
        const freeId = typeof promo.freeItem === 'string' ? promo.freeItem : promo.freeItem._id;
        if (!freeItems.some(f => f.id === freeId)) {
          freeItems.push({
            id: freeId,
            name: promo.freeItem.name || 'Free Item',
            image: promo.freeItem.image || '',
            price: 0,
            quantity: 1,
          });
        }
      }
    }
  }

  const discountedSubtotal = subtotal - discountAmount;
  const taxEnabled = !!settings?.tax?.enabled;
  const taxRate = settings?.tax?.rate || 0;
  const taxAmount = taxEnabled ? Math.round(discountedSubtotal * (taxRate / 100)) : 0;
  const subtotalWithTax = discountedSubtotal + taxAmount;
  // ─────────────────────────────────────────────────────────────────────────

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  useEffect(() => {
    deliveryZonesApi.getActive().then(setZones).catch(() => setZones([]));
  }, []);

  const selectedZone = zones.find(z => z._id === selectedZoneId) || null;
  const payNowAmount = subtotalWithTax + (deliveryMethod === 'delivery' && selectedZone ? selectedZone.fee : 0);

  const validateForm = () => {
    const errors = [];
    if (!form.name.trim()) errors.push('Full name');
    if (!form.phone.trim()) errors.push('Phone number');
    if (!form.email.trim()) errors.push('Email');
    if (deliveryMethod === 'delivery' && !form.address.trim()) errors.push('Delivery address');
    if (!agreedToTerms) errors.push('agree to the policies');
    if (errors.length > 0) return `Please fill in: ${errors.join(', ')}.`;
    return null;
  };

  // Helper: create order (with paymentStatus: 'pending')
  const createOrder = async (channel = 'online') => {
    const orderItems = cartItems.map(item => ({
      menu_item_id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: parseFloat(typeof item.price === 'string' ? item.price.replace(/[₦,]/g, '') : item.price),
    }));

    freeItems.forEach(free => {
      orderItems.push({
        menu_item_id: free.id,
        name: free.name,
        quantity: 1,
        price: 0,
      });
    });

    const newOrder = await ordersApi.create({
      customerName: form.name,
      customerEmail: form.email,
      phone: form.phone,
      address: deliveryMethod === 'delivery' ? form.address : '',
      delivery_method: deliveryMethod,
      delivery_zone_id: deliveryMethod === 'delivery' ? (selectedZoneId || undefined) : undefined,
      order_type: 'online',
      order_channel: channel,
      notes: notes.trim(),
      items: orderItems,
      totalAmount: subtotalWithTax,
      paymentStatus: 'pending',
    });

    return newOrder;
  };

  // 🟢 Pickup: pay the items subtotal immediately, same as before.
  // 🟢 Delivery: just submit the order — admin must set the delivery fee
  //    before the customer can pay (handled on the /complete-payment page).
  const handlePaystackPayment = async () => {
    const error = validateForm();
    if (error) { setFormErrors(error); return; }
    setFormErrors('');

    if (form.remember) {
      const { remember, ...info } = form;
      localStorage.setItem('solohans_checkout_info', JSON.stringify(info));
    } else {
      localStorage.removeItem('solohans_checkout_info');
    }

    setProcessing(true);
    try {
      const newOrder = await createOrder();

      // ✅ Trust the backend's determination of whether a fee is known yet —
      // true for pickup, true for a matched delivery zone, false otherwise.
      if (!newOrder.delivery_fee_set) {
        // No payment yet — wait for admin to set the delivery fee.
        setOrderResult({
          orderId: newOrder.order_id,
          mongoId: newOrder._id,
          email: form.email,
          deliveryMethod: 'delivery',
        });
        clearCart();
        setStep('submitted');
        setProcessing(false);
        return;
      }

      const amountToPay = newOrder.totalAmount; // includes zone delivery fee, if any
      const safeRef = `order_${newOrder._id}_${Date.now()}`;

      initializePaystack({
        email: form.email || 'customer@solohans.com',
        amount: amountToPay,
        orderId: safeRef,
        metadata: { orderId: newOrder._id },
        onSuccess: async (transaction) => {
          // Paystack has already charged the customer by the time this fires —
          // a failed verify call here must NEVER be treated as "give up",
          // since the money is real. Retry a few times before showing the
          // customer a support message, rather than failing on the first try.
          const tryVerify = async (attempt = 1) => {
            try {
              const res = await fetch(`${API_BASE}/payments/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  reference: transaction.reference,
                  orderId: newOrder._id,
                }),
              });

              const data = await res.json();

              if (data.success) {
                setOrderResult({
                  orderId: data.order_id ?? newOrder.order_id,
                  mongoId: newOrder._id,
                  items: cartItems,
                  total: amountToPay,
                  deliveryFee: newOrder.delivery_fee || 0,
                  taxEnabled: !!newOrder.tax_enabled,
                  taxRate: newOrder.tax_rate || 0,
                  taxAmount: newOrder.tax_amount || 0,
                  freeItems,
                  deliveryMethod: newOrder.delivery_method,
                });
                clearCart();
                setStep('receipt');
                return;
              }

              // A real "no" from the backend (e.g. Paystack itself says not
              // successful) — retrying won't help, show the message.
              alert(data.message || 'Payment verification failed. Please contact support.');
            } catch (err) {
              console.error(`Verify fetch error (attempt ${attempt}):`, err);
              if (attempt < 4) {
                setTimeout(() => tryVerify(attempt + 1), attempt * 1500);
              } else {
                alert(
                  `Your payment may have gone through, but we couldn't confirm it automatically. ` +
                  `Please save this reference and contact us: ${transaction.reference}. ` +
                  `You can also check your order status on the Track Order page in a few minutes.`
                );
              }
            }
          };

          tryVerify();
        },
        onClose: () => {},
      });
    } catch (err) {
      console.error('Order creation error:', err);
      alert(err.message || 'Could not create order. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  // ✅ Business WhatsApp number comes from Settings (admin-configured, stored
  // in the database) — never hardcoded. Normalized to bare digits with
  // country code, e.g. "2348081941298", exactly what wa.me expects.
  const resolveWhatsAppNumber = () => {
    const raw = settings?.whatsapp || '';
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) return null;
    // If a local Nigerian number was entered without the country code
    // (e.g. "08081941298"), convert the leading 0 to 234 so the link is
    // always valid regardless of how the admin typed it into Settings.
    if (digits.startsWith('0')) return `234${digits.slice(1)}`;
    return digits;
  };

  // 🟢 WhatsApp ordering: cart is still the mandatory checkpoint — the order
  // is created in the database FIRST (so admin sees it, it has a real
  // Order ID, and it's trackable), THEN WhatsApp opens with that order's
  // details pre-filled. Payment is handled manually by admin afterward.
  // This is a completely separate path from handlePaystackPayment (the
  // online/email flow) — it never calls it and never sends any email.
  const handleWhatsAppOrder = async () => {
    const error = validateForm();
    if (error) { setFormErrors(error); return; }

    const whatsappNumber = resolveWhatsAppNumber();
    if (!whatsappNumber) {
      setFormErrors("Sorry, WhatsApp ordering isn't available right now — the business WhatsApp number hasn't been configured. Please try Pay Online instead.");
      return;
    }
    setFormErrors('');

    setProcessing(true);
    try {
      const newOrder = await createOrder('whatsapp');

      const deliveryFeeLine = deliveryMethod === 'pickup'
        ? 'FREE (Pickup)'
        : selectedZone
          ? `₦${selectedZone.fee.toLocaleString()}`
          : 'To be confirmed by admin';

      const grandTotal = payNowAmount; // items (with tax) + delivery fee, if known yet

      const lines = [
        `Hello, I would like to place an order.`,
        ``,
        `Order ID: ${newOrder.order_id}`,
        ``,
        `Order Details`,
        ...cartItems.map(item => {
          const price = parsePriceValue(item.price);
          return `• ${item.name} × ${item.quantity} — ₦${(price * item.quantity).toLocaleString()}`;
        }),
        ...freeItems.map(free => `• ${free.name} × 1 — FREE`),
        ``,
        `Subtotal: ₦${subtotal.toLocaleString()}`,
        discountAmount > 0 ? `Discount: -₦${Math.round(discountAmount).toLocaleString()}` : null,
        taxEnabled && taxAmount > 0 ? `Tax: ₦${taxAmount.toLocaleString()}` : null,
        `Delivery: ${deliveryFeeLine}`,
        `Total: ₦${grandTotal.toLocaleString()}${deliveryMethod === 'delivery' && !selectedZone ? ' (+ delivery fee, TBC by admin)' : ''}`,
        ``,
        `Customer Name: ${form.name}`,
        `Phone: ${form.phone}`,
        `Delivery Address: ${deliveryMethod === 'pickup' ? 'Pickup at restaurant' : form.address}`,
      ].filter(line => line !== null);

      if (notes.trim()) lines.push(`Note: ${notes.trim()}`);

      lines.push(``, `Order Method: WhatsApp`, `Payment Status: UNPAID`);
      lines.push(``, `Track Order: ${window.location.origin}/track/${newOrder.order_id}`);
      lines.push(``, `Please confirm my order. Thank you.`);

      // URL-encode the full message so line breaks, ₦, and every other
      // special character survive the wa.me link intact.
      const message = encodeURIComponent(lines.join('\n'));

      window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank');

      setOrderResult({ orderId: newOrder.order_id, mongoId: newOrder._id, email: form.email, deliveryMethod: newOrder.delivery_method, channel: 'whatsapp' });
      clearCart();
      setStep('submitted');
    } catch (err) {
      console.error('WhatsApp order creation error:', err);
      alert(err.message || 'Could not create order. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handlePlaceOrder = () => {
    clearCart();
    setStep('cart');
    setOrderResult(null);
    setDeliveryMethod('delivery');
    setSelectedZoneId('');
    setNotes('');
    setForm(prev => ({ ...loadSavedInfo(), remember: prev.remember }));
    setAgreedToTerms(false);
    setFormErrors('');
    closeCart();
  };

  const handleExploreMenu = () => { closeCart(); navigate('/menu'); };

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={closeCart} />}
      <div className={`fixed top-0 right-0 h-full w-full max-w-md z-50 bg-white shadow-2xl transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold uppercase tracking-wide text-[#222222]">
            {step === 'cart' && 'Your Order'}
            {step === 'checkout' && 'Checkout'}
            {step === 'submitted' && 'Order Submitted'}
            {step === 'receipt' && 'Order Confirmed'}
          </h2>
          <button onClick={closeCart} className="text-[#222222] hover:text-[#C62828]"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4" style={{ height: 'calc(100% - 140px)' }}>
          {step === 'cart' && (
            cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-24 h-24 rounded-full bg-[#FFF8F0] flex items-center justify-center mb-6"><ShoppingCart size={48} className="text-[#C62828]" /></div>
                <h3 className="text-xl font-bold text-[#222222] mb-2">Your Cart Is Empty</h3>
                <p className="text-gray-500 mb-6">Add delicious meals to your cart and start your order.</p>
                <button onClick={handleExploreMenu} className="px-6 py-3 bg-[#C62828] text-white rounded-full font-semibold hover:bg-[#B71C1C]">Explore Menu</button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {cartItems.map(item => {
                    // ✅ Daily Dish Stock — soft, early warning only (the
                    // real, authoritative block happens server-side on
                    // order creation). Only applies to dishes explicitly
                    // opted into daily tracking; every other item is
                    // unaffected since `remaining` is undefined for them.
                    const stockExceeded = item.trackDailyStock && typeof item.remaining === 'number' && item.quantity > item.remaining;
                    return (
                    <div key={item.id} className="flex items-center gap-4 bg-[#FFF8F0] p-3 rounded-xl">
                      <img src={item.image} alt={item.name} className="w-16 h-16 rounded-lg object-cover" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-[#222222] truncate">{item.name}</h4>
                        <span className="text-sm font-bold text-[#C62828]">{item.price}</span>
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => decreaseQuantity(item.id)} className="w-7 h-7 rounded-full border flex items-center justify-center hover:bg-gray-100"><Minus size={14} /></button>
                          <span className="font-medium text-sm">{item.quantity}</span>
                          <button onClick={() => increaseQuantity(item.id)} className="w-7 h-7 rounded-full border flex items-center justify-center hover:bg-gray-100"><Plus size={14} /></button>
                          <button onClick={() => removeFromCart(item.id)} className="ml-auto text-gray-400 hover:text-[#C62828]"><Trash2 size={18} /></button>
                        </div>
                        {stockExceeded && (
                          <p className="text-xs text-red-600 font-medium mt-1">
                            {item.remaining === 0 ? 'Sold out for today' : `Only ${item.remaining} left today`} — please reduce the quantity.
                          </p>
                        )}
                      </div>
                    </div>
                  );})}
                </div>

                {cartStockExceeded && (
                  <div className="mt-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl p-3">
                    Some items in your cart exceed today's available stock. Please adjust quantities before checking out.
                  </div>
                )}

                {freeItems.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <h4 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-1"><Gift size={14} /> Free Items</h4>
                    <div className="space-y-2">
                      {freeItems.map(free => (
                        <div key={free.id} className="flex items-center gap-3 bg-green-50 p-2 rounded-lg">
                          <img src={free.image} alt={free.name} className="w-10 h-10 rounded-lg object-cover" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{free.name}</p>
                            <p className="text-xs text-green-700">FREE</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t pt-4 mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal (food only)</span>
                    <span>₦{subtotal.toLocaleString()}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-green-700">
                      <span>Promo discount</span>
                      <span>-₦{Math.round(discountAmount).toLocaleString()}</span>
                    </div>
                  )}
                  {freeDelivery && (
                    <div className="bg-green-50 text-green-700 p-2 rounded-lg text-xs font-medium flex items-center gap-1">
                      <Truck size={14} /> Free Delivery Applied!
                    </div>
                  )}
                  {taxEnabled && taxAmount > 0 && (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Tax ({taxRate}%)</span>
                      <span>₦{taxAmount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold">
                    <span>Items Total</span>
                    <span className="text-[#C62828]">₦{subtotalWithTax.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-500">Choose Delivery or Pickup at the next step.</p>
                </div>
              </>
            )
          )}

          {step === 'checkout' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#444] mb-2">How would you like to get your order?</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('delivery')}
                    className={`py-3 rounded-xl border-2 font-semibold text-sm transition flex items-center justify-center gap-1.5 ${deliveryMethod === 'delivery' ? 'border-[#C62828] bg-[#FFF8F0] text-[#C62828]' : 'border-gray-200 text-gray-500'}`}
                  >
                    <Truck size={16} /> Delivery
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('pickup')}
                    className={`py-3 rounded-xl border-2 font-semibold text-sm transition flex items-center justify-center gap-1.5 ${deliveryMethod === 'pickup' ? 'border-[#C62828] bg-[#FFF8F0] text-[#C62828]' : 'border-gray-200 text-gray-500'}`}
                  >
                    <Store size={16} /> Pickup
                  </button>
                </div>
              </div>

              <div><label className="block text-sm font-medium text-[#444] mb-1">Full Name</label><input type="text" name="name" required value={form.name} onChange={handleFormChange} className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:border-[#C62828]" /></div>
              <div><label className="block text-sm font-medium text-[#444] mb-1">Phone Number</label><input type="tel" name="phone" required value={form.phone} onChange={handleFormChange} className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:border-[#C62828]" /></div>
              <div><label className="block text-sm font-medium text-[#444] mb-1">Email</label><input type="email" name="email" required value={form.email} onChange={handleFormChange} className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:border-[#C62828]" /></div>

              {deliveryMethod === 'delivery' && (
                <>
                  <div><label className="block text-sm font-medium text-[#444] mb-1">Delivery Address</label><textarea name="address" rows="2" required value={form.address} onChange={handleFormChange} className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:border-[#C62828] resize-none" /></div>

                  {zones.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-[#444] mb-1">Delivery Area</label>
                      <select
                        value={selectedZoneId}
                        onChange={(e) => setSelectedZoneId(e.target.value)}
                        className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:border-[#C62828]"
                      >
                        <option value="">My area isn't listed</option>
                        {zones.map(z => (
                          <option key={z._id} value={z._id}>{z.name} — ₦{z.fee.toLocaleString()}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              {checkoutMode === 'whatsapp' ? (
                <div className="bg-green-50 text-green-700 p-4 rounded-xl text-sm flex items-start gap-2">
                  <MessageCircle size={18} className="mt-0.5 flex-shrink-0" />
                  <span>We'll send your order details straight to WhatsApp so our team can confirm everything with you directly, including your final delivery fee if it's not already set above.</span>
                </div>
              ) : deliveryMethod === 'delivery' && !selectedZone ? (
                <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-xs flex items-start gap-2">
                  <MapPin size={18} className="mt-0.5 flex-shrink-0" />
                  <span>{zones.length > 0 ? "Don't see your area above? " : ''}After you submit, our team will review your location and set a delivery fee. You'll get an email with a secure payment link to pay the final amount (items + delivery fee) online.</span>
                </div>
              ) : (
                <div className="bg-gray-50 p-4 rounded-xl">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2"><CreditCard size={18} /> Pay securely with Paystack</p>
                  <div className="mb-2"><img src={cardimg} alt="Accepted Cards" className="h-8 object-contain" /></div>
                  <p className="text-xs text-gray-600">You can pay with Card, Bank Transfer, or USSD.</p>
                  <div className="flex items-center gap-2 text-xs text-green-700 mt-2"><ShieldCheck size={16} className="text-green-600" /> All payments are secured with SSL encryption.</div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#444] mb-1">Additional Notes (optional)</label>
                <textarea
                  rows="2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. no onions, ring the bell twice, leave at gate..."
                  className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:border-[#C62828] resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">We'll pass this along to our team with your order.</p>
              </div>

              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="w-4 h-4 mt-0.5 rounded border-gray-300 text-[#C62828] focus:ring-[#C62828]" />
                <span className="text-gray-700">I have read and agree to the <Link to="/privacy" className="text-[#C62828] underline">Privacy Policy</Link>, <Link to="/terms" className="text-[#C62828] underline">Terms of Service</Link>, and <Link to="/payment-policy" className="text-[#C62828] underline">Payment Policy</Link>.</span>
              </label>

              <label className="flex items-center gap-3 text-sm cursor-pointer">
                <input type="checkbox" name="remember" checked={form.remember} onChange={handleFormChange} className="w-4 h-4 rounded border-gray-300 text-[#C62828] focus:ring-[#C62828]" />
                Remember my details for future orders
              </label>

              {formErrors && <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm">{formErrors}</div>}

              <button
                onClick={checkoutMode === 'whatsapp' ? handleWhatsAppOrder : handlePaystackPayment}
                disabled={processing}
                className={`w-full py-3 rounded-full font-semibold disabled:opacity-70 flex items-center justify-center gap-2 ${
                  checkoutMode === 'whatsapp'
                    ? 'bg-[#25D366] text-white hover:bg-[#1ebe57]'
                    : 'bg-[#C62828] text-white hover:bg-[#B71C1C]'
                }`}
              >
                {processing ? (
                  'Processing...'
                ) : checkoutMode === 'whatsapp' ? (
                  <><MessageCircle size={18} /> Send Order via WhatsApp</>
                ) : deliveryMethod === 'delivery' && !selectedZone ? (
                  'Submit Order'
                ) : (
                  `Pay ₦${payNowAmount.toLocaleString()} with Paystack`
                )}
              </button>
            </div>

          )}

          {step === 'submitted' && orderResult && (
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShoppingCart size={32} className="text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-[#222222]">Order #{orderResult.orderId} Submitted</h3>
              <button onClick={() => copyOrderId(orderResult.orderId)} className="inline-flex items-center gap-1 text-xs text-[#C62828] mt-1 mb-2 hover:underline">
                {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Order ID</>}
              </button>

              {orderResult.channel === 'whatsapp' ? (
                <>
                  <p className="text-gray-500 mt-2 mb-6">
                    Your order has been saved and WhatsApp should have opened in a new tab with your order
                    details ready to send. If it didn't open, just message us your Order ID directly.
                  </p>
                  <div className="bg-green-50 text-green-700 p-4 rounded-xl text-sm text-left mb-6 flex items-start gap-2">
                    <MessageCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>Our team will confirm your order and payment details with you directly on WhatsApp.</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-500 mt-2 mb-6">
                    Thank you! Our team is reviewing your delivery location and will set your delivery fee shortly.
                    You'll receive an email at <strong>{orderResult.email}</strong> with a secure link to pay the
                    final amount (items + delivery fee) online.
                  </p>
                  <div className="bg-blue-50 text-blue-700 p-4 rounded-xl text-sm text-left mb-6 flex items-start gap-2">
                    <Info size={16} className="mt-0.5 flex-shrink-0" />
                    <span>No payment has been taken yet. Your order will only be confirmed once you complete payment
                    through the link in that email.</span>
                  </div>
                </>
              )}

              <Link to={`/track/${orderResult.orderId}`} onClick={handlePlaceOrder} className="w-full inline-block py-3 mb-3 border-2 border-[#C62828] text-[#C62828] rounded-full font-semibold hover:bg-[#FFF8F0]">Track This Order</Link>
              {orderResult.mongoId && (
                <a
                  href={`/receipt/${orderResult.mongoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-1.5 py-3 mb-3 text-sm font-semibold text-gray-500 hover:text-[#C62828]"
                >
                  <Receipt size={15} /> View / Download Receipt
                </a>
              )}
              <button onClick={handlePlaceOrder} className="w-full py-3 bg-[#C62828] text-white rounded-full font-semibold hover:bg-[#B71C1C]">Close & Continue Shopping</button>
            </div>
          )}

          {step === 'receipt' && orderResult && (
            <div className="text-center">
              <div className="mb-6">
                <div className="w-16 h-16 bg-[#C62828]/10 rounded-full flex items-center justify-center mx-auto mb-4"><ShoppingCart size={32} className="text-[#C62828]" /></div>
                <h3 className="text-xl font-bold text-[#222222]">Order #{orderResult.orderId}</h3>
                <button onClick={() => copyOrderId(orderResult.orderId)} className="inline-flex items-center gap-1 text-xs text-[#C62828] mt-1 hover:underline">
                  {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Order ID</>}
                </button>
                <p className="text-gray-500">Thank you, {form.name}!</p>
                <p className="text-sm mt-2">Payment: Online</p>
              </div>

              <div className="bg-[#FFF8F0] rounded-xl p-4 mb-6 text-left space-y-2">
                {orderResult.items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{item.name} × {item.quantity}</span>
                    <span>₦{(parseFloat(typeof item.price === 'string' ? item.price.replace(/[₦,]/g, '') : item.price) * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
                {orderResult.freeItems?.map(free => (
                  <div key={free.id} className="flex justify-between text-sm text-green-700"><span className="flex items-center gap-1"><Gift size={12} /> {free.name}</span><span>FREE</span></div>
                ))}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Promo discount</span>
                    <span>-₦{Math.round(discountAmount).toLocaleString()}</span>
                  </div>
                )}
                <hr />
                {orderResult.taxEnabled && orderResult.taxAmount > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span className="flex items-center gap-1"><Receipt size={14} /> VAT ({orderResult.taxRate}%)</span>
                    <span>₦{orderResult.taxAmount.toLocaleString()}</span>
                  </div>
                )}
                {orderResult.deliveryMethod === 'pickup' ? (
                  <div className="flex justify-between font-medium"><span>Pickup</span><span className="text-green-600">No delivery fee</span></div>
                ) : (
                  <div className="flex justify-between font-medium"><span>Delivery Fee</span><span>₦{(orderResult.deliveryFee || 0).toLocaleString()}</span></div>
                )}
                <div className="flex justify-between font-bold"><span>Total Paid</span><span className="text-[#C62828]">₦{orderResult.total.toLocaleString()}</span></div>
              </div>

              {orderResult.deliveryMethod === 'delivery' && (
                <p className="text-xs text-gray-500 mb-4 flex items-center justify-center gap-1"><Truck size={12} /> Delivering to: {form.address}</p>
              )}

              <Link to={`/track/${orderResult.orderId}`} onClick={handlePlaceOrder} className="w-full inline-block py-3 mb-3 border-2 border-[#C62828] text-[#C62828] rounded-full font-semibold hover:bg-[#FFF8F0]">Track This Order</Link>
              {orderResult.mongoId && (
                <a
                  href={`/receipt/${orderResult.mongoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-1.5 py-3 mb-3 text-sm font-semibold text-gray-500 hover:text-[#C62828]"
                >
                  <Receipt size={15} /> View / Download Receipt
                </a>
              )}

              <button onClick={handlePlaceOrder} className="w-full py-3 bg-[#C62828] text-white rounded-full font-semibold hover:bg-[#B71C1C]">Close & Continue Shopping</button>
            </div>
          )}
        </div>

        {step === 'cart' && cartItems.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t">
            <div className="flex items-center justify-between mb-2"><span>{itemCount} items</span><span className="font-bold text-[#C62828]">₦{discountedSubtotal.toLocaleString()}</span></div>
            {/* ✅ The cart's own Checkout button ALWAYS goes to the WhatsApp
                order flow — this is the fix for the bug where it was
                silently falling through to the online/email flow because
                checkoutMode defaulted to 'online' and nothing here ever
                set it. openCart('whatsapp') forces the mode explicitly
                before moving to the checkout step, so
                `checkoutMode === 'whatsapp'` is guaranteed true and
                handleWhatsAppOrder (never handlePaystackPayment/email) is
                what fires. */}
            <button
              onClick={() => { openCart('whatsapp'); setStep('checkout'); }}
              disabled={cartStockExceeded}
              className="w-full py-3 bg-[#25D366] text-white rounded-full font-semibold hover:bg-[#1ebe57] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MessageCircle size={18} /> Order via WhatsApp
            </button>
            <button
              onClick={() => { openCart('online'); setStep('checkout'); }}
              disabled={cartStockExceeded}
              className="w-full mt-2 py-2 text-sm font-medium text-gray-500 hover:text-[#C62828] underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Prefer to pay online instead?
            </button>
          </div>
        )}
      </div>
    </>
  );
}