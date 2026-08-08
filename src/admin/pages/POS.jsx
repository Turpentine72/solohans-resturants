import { useState, useMemo, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Trash2, CheckCircle, Store, UtensilsCrossed, Minus, Package, Banknote, ArrowLeftRight, CreditCard, Globe, Tag, RefreshCw, AlertTriangle, SplitSquareHorizontal, Receipt, Search, Bike } from 'lucide-react';
import { pos as posApi, menuItems as menuItemsApi, orders as ordersApi, attendance as attendanceApi, inventory as inventoryApi } from '../../lib/api';
import { useSettings } from '../../context/SettingsContext';
import {
  MEAL_TYPES, MEAL_LABELS, PROTEIN_PRICES, PROTEIN_LABELS, CHICKEN_PROTEINS, TURKEY_PROTEINS,
  RICE_TYPES, isComboAllowed, priceCart, PAYMENT_TAGS,
} from '../../lib/pricing';

const PAYMENT_TAG_ICONS = { Banknote, ArrowLeftRight, CreditCard, Globe, SplitSquareHorizontal, Bike };

const PLATFORMS = ['Walk-in', 'Glovo', 'Chowdeck', 'Uber Eats', 'Other'];
const PLATFORM_ID_LABEL = { Glovo: 'Glovo Order ID', Chowdeck: 'Chowdeck Order ID', 'Uber Eats': 'Uber Eats Order ID', Other: 'External Order ID' };

function emptyMealPackage() {
  return { meals: [], protein: 'none', extraPortions: [] };
}

export default function POS() {
  const { settings } = useSettings();
  const taxEnabled = !!settings?.tax?.enabled;
  const taxRate = settings?.tax?.rate || 0;
  const [mealPackages, setMealPackages] = useState([emptyMealPackage()]);
  const [extras, setExtras] = useState({}); // { hotdog: qty } — flat-priced standalone extras
  const [menuCatalog, setMenuCatalog] = useState([]); // Shawarma, Hotdog (as a menu item), or anything else from MenuItem
  const [menuCatalogLoading, setMenuCatalogLoading] = useState(true);
  const [selectedMenuItems, setSelectedMenuItems] = useState({}); // { menuItemId: qty }
  const [paymentMethod, setPaymentMethod] = useState('');
  const [splitRows, setSplitRows] = useState([{ method: 'CASH', amount: '' }, { method: 'TRANSFER', amount: '' }]);
  const [posSaleType, setPosSaleType] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // ─── Platform Order Recording ──────────────────────────────────────
  const [platform, setPlatform] = useState('Walk-in');
  const isThirdPartyPlatform = platform !== 'Walk-in';
  const [externalOrderId, setExternalOrderId] = useState('');

  // ─── Manual discount (staff-applied, e.g. loyalty/manager override) ──
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountLabel, setDiscountLabel] = useState('');

  // ─── Menu Items search + category filter ───────────────────────────
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCategory, setMenuCategory] = useState('All');

  const [shift, setShift] = useState(null); // null = not on shift; object = active/completed shift record
  const [shiftLoading, setShiftLoading] = useState(true);
  const [websiteOrders, setWebsiteOrders] = useState([]);
  const [websiteOrdersLoading, setWebsiteOrdersLoading] = useState(true);
  const [tagging, setTagging] = useState(null); // order _id currently being tagged

  const loadShift = () => attendanceApi.getToday().then(setShift).catch(() => setShift(null)).finally(() => setShiftLoading(false));
  const loadWebsiteOrders = () => ordersApi.getWebsitePending().then(setWebsiteOrders).catch(() => setWebsiteOrders([])).finally(() => setWebsiteOrdersLoading(false));

  useEffect(() => {
    loadShift();
    loadWebsiteOrders();
    // Keep both fresh automatically — new website orders and shift sales
    // should appear without anyone needing to refresh the page.
    const poll = setInterval(() => { loadShift(); loadWebsiteOrders(); }, 10000);
    return () => clearInterval(poll);
  }, []);

  const isOnActiveShift = shift?.checkIn && shift.status === 'Active';

  const handleTagToMe = async (orderId) => {
    setTagging(orderId);
    try {
      await ordersApi.tagToMe(orderId);
      await loadWebsiteOrders();
      await loadShift();
    } catch (err) {
      alert(err.message);
    } finally {
      setTagging(null);
    }
  };

  const [liveInventory, setLiveInventory] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(true);

  const loadMenuCatalog = () => {
    menuItemsApi.getAll({ available: true })
      .then((data) => setMenuCatalog(Array.isArray(data) ? data : data.items || []))
      .catch(() => setMenuCatalog([]))
      .finally(() => setMenuCatalogLoading(false));
  };
  const loadInventory = () => {
    inventoryApi.get()
      .then(setLiveInventory)
      .catch(() => setLiveInventory(null))
      .finally(() => setInventoryLoading(false));
  };

  useEffect(() => {
    loadMenuCatalog();
    loadInventory();
    // ✅ Single source of truth: Meal Inventory. POS never keeps its own
    // copy of meals/extras — it polls the live data so any add/edit/
    // delete/activate/deactivate/reprice/restock made in Menu Management
    // or Meal Inventory shows up here automatically, without a refresh.
    const poll = setInterval(() => { loadMenuCatalog(); loadInventory(); }, 10000);
    return () => clearInterval(poll);
  }, []);

  // Extras catalog — built live from Meal Inventory's `extras` map, never
  // hardcoded. Every extra that exists there appears here automatically,
  // including its current stock, so nothing gets silently omitted.
  const extrasCatalog = useMemo(() => {
    if (!liveInventory?.extras) return {};
    const catalog = {};
    for (const [key, e] of Object.entries(liveInventory.extras)) {
      catalog[key] = { label: e.label, price: e.price, remaining: e.remaining };
    }
    return catalog;
  }, [liveInventory]);

  const setMenuItemQty = (id, qty) => {
    const q = Math.max(0, Number(qty) || 0);
    setSelectedMenuItems((prev) => {
      const next = { ...prev };
      if (q === 0) delete next[id];
      else next[id] = q;
      return next;
    });
  };

  const menuItemsTotal = useMemo(() => {
    return Object.entries(selectedMenuItems).reduce((sum, [id, qty]) => {
      const item = menuCatalog.find((m) => m._id === id);
      return sum + (item ? item.price * qty : 0);
    }, 0);
  }, [selectedMenuItems, menuCatalog]);

  // Categories are pulled live from whatever's actually on the menu —
  // never hardcoded, so a brand-new category shows up automatically.
  const menuCategories = useMemo(() => {
    const set = new Set(menuCatalog.map((m) => m.category || 'Uncategorized'));
    return ['All', ...Array.from(set).sort()];
  }, [menuCatalog]);

  const filteredMenuCatalog = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    return menuCatalog.filter((item) => {
      if (menuCategory !== 'All' && (item.category || 'Uncategorized') !== menuCategory) return false;
      if (q && !item.name.toLowerCase().includes(q) && !(item.category || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [menuCatalog, menuSearch, menuCategory]);

  const priced = useMemo(() => {
    const extrasArr = Object.entries(extras).filter(([, qty]) => qty > 0).map(([item, qty]) => ({ item, qty }));
    return priceCart({ mealPackages, extras: extrasArr, extrasCatalog });
  }, [mealPackages, extras, extrasCatalog]);

  const itemsSubtotal = priced.totalAmount + menuItemsTotal;
  // ✅ Must match backend/utils/checkout.js exactly: taxAmount = round(itemsSubtotal * rate/100).
  // This was previously missing entirely — the cashier saw an untaxed total
  // while the backend charged the tax-inclusive amount, which is exactly
  // why split payments were failing by the tax amount.
  const taxAmount = taxEnabled ? Math.round(itemsSubtotal * (taxRate / 100)) : 0;
  const grandTotal = itemsSubtotal + taxAmount;

  // ─── Split Payment live math ──────────────────────────────────────
  const totalPaid = splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const remainingBalance = Math.max(0, grandTotal - totalPaid);
  const overpaidAmount = Math.max(0, totalPaid - grandTotal);
  const splitExactMatch = Math.abs(totalPaid - grandTotal) < 0.5 && grandTotal > 0;

  // ✅ A checkout error (e.g. "short by ₦60") is a snapshot from the moment
  // Complete Sale was clicked. If the cashier then edits the split rows,
  // switches payment method, or changes the cart, that old message is no
  // longer true and must not keep showing next to a now-correct total.
  useEffect(() => {
    setError('');
  }, [splitRows, paymentMethod, mealPackages, extras, selectedMenuItems, posSaleType, platform, externalOrderId, discountAmount, discountLabel]);

  const addSplitRow = () => setSplitRows((prev) => [...prev, { method: 'CASH', amount: '' }]);
  const removeSplitRow = (idx) => setSplitRows((prev) => prev.filter((_, i) => i !== idx));
  const updateSplitRow = (idx, field, value) => {
    setSplitRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const toggleMeal = (idx, meal) => {
    setMealPackages((prev) => prev.map((mp, i) => {
      if (i !== idx) return mp;
      let meals = mp.meals.includes(meal) ? mp.meals.filter((m) => m !== meal) : [...mp.meals, meal];
      if (meals.length > 2) return mp; // max 2
      return { ...mp, meals, extraPortions: mp.extraPortions.filter((p) => meals.includes(p)) };
    }));
  };

  const setProtein = (idx, protein) => {
    setMealPackages((prev) => prev.map((mp, i) => (i === idx ? { ...mp, protein } : mp)));
  };

  const toggleExtraPortion = (idx, meal) => {
    setMealPackages((prev) => prev.map((mp, i) => {
      if (i !== idx) return mp;
      const extraPortions = mp.extraPortions.includes(meal)
        ? mp.extraPortions.filter((m) => m !== meal)
        : [...mp.extraPortions, meal];
      return { ...mp, extraPortions };
    }));
  };

  const addMealPackage = () => setMealPackages((prev) => [...prev, emptyMealPackage()]);
  const removeMealPackage = (idx) => setMealPackages((prev) => prev.filter((_, i) => i !== idx));

  const setExtraQty = (key, qty) => setExtras((prev) => ({ ...prev, [key]: Math.max(0, Number(qty) || 0) }));

  // A meal-package "slot" only counts if the staff actually picked meals in
  // it — the default empty slot doesn't force a rice/spaghetti meal onto
  // every sale (e.g. a Shawarma-only sale has zero meal packages).
  const usedMealPackages = mealPackages.filter((mp) => mp.meals.length > 0);
  const hasAnyExtras = Object.values(extras).some((qty) => qty > 0);
  const hasAnyMenuItems = Object.keys(selectedMenuItems).length > 0;
  const allValid =
    usedMealPackages.every((mp) => isComboAllowed(mp.meals)) &&
    (usedMealPackages.length > 0 || hasAnyExtras || hasAnyMenuItems);

  const handleCompleteSale = async () => {
    setError('');
    if (!isOnActiveShift) return setError('You need to Start Work before making sales.');
    if (!allValid) return setError('Add at least one meal, menu item, or extra — and make sure any meal combo is 1–2 allowed items.');
    if (platform !== 'Walk-in' && !externalOrderId.trim()) {
      return setError(`Enter the ${PLATFORM_ID_LABEL[platform]} before completing this sale.`);
    }
    if (Number(discountAmount) > 0 && !discountLabel.trim()) {
      return setError('Add a short reason for the discount (e.g. "Loyalty discount") before completing the sale.');
    }
    if (!isThirdPartyPlatform) {
      // Order Type and Payment Method only apply to Walk-in sales — a
      // third-party platform order (Glovo, Chowdeck, etc.) skips both:
      // payment was already collected by the platform, and there's no
      // shop/restaurant distinction that matters for a delivery order.
      if (!posSaleType) return setError('Select an Order Type (Shop Sale or Restaurant Sale) before completing the sale.');
      if (!paymentMethod) return setError('Select a payment method (Cash, Transfer, POS, or Split Payment) before completing the sale.');
      if (paymentMethod === 'SPLIT' && !splitExactMatch) {
        return setError(
          totalPaid < grandTotal
            ? `Split payment is short by ₦${remainingBalance.toLocaleString()}.`
            : `Split payment exceeds the total by ₦${overpaidAmount.toLocaleString()}.`
        );
      }
    }

    setPlacing(true);
    try {
      const extrasArr = Object.entries(extras).filter(([, qty]) => qty > 0).map(([item, qty]) => ({ item, qty }));
      const menuItemsArr = Object.entries(selectedMenuItems).map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
      const cart = { mealPackages: usedMealPackages, extras: extrasArr, menuItems: menuItemsArr, deliveryFee: 0 };
      const splitPayments = paymentMethod === 'SPLIT'
        ? splitRows.filter((r) => Number(r.amount) > 0).map((r) => ({ method: r.method, amount: Number(r.amount) }))
        : undefined;
      const res = await posApi.checkout({
        cart,
        paymentMethod: isThirdPartyPlatform ? undefined : paymentMethod,
        splitPayments,
        customerName,
        posSaleType: isThirdPartyPlatform ? 'shop' : posSaleType,
        platform, externalOrderId: platform !== 'Walk-in' ? externalOrderId.trim() : '',
        discountAmount: Number(discountAmount) || 0,
        discountLabel: discountLabel.trim(),
      });
      setResult(res);
      loadShift();
      setMealPackages([emptyMealPackage()]);
      setExtras({});
      setSelectedMenuItems({});
      setPaymentMethod('');
      setSplitRows([{ method: 'CASH', amount: '' }, { method: 'TRANSFER', amount: '' }]);
      setPosSaleType('');
      setCustomerName('');
      setPlatform('Walk-in');
      setExternalOrderId('');
      setDiscountAmount('');
      setDiscountLabel('');
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  };

  return (
    <>
      <Helmet><title>POS – New Sale | Solohans Admin</title></Helmet>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {!shiftLoading && !isOnActiveShift && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-800">
              <AlertTriangle size={20} className="flex-shrink-0" />
              <p className="text-sm font-medium">You need to click <strong>Start Work</strong> (top right) before you can make sales or tag website orders.</p>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Tag size={18} /> Website Orders</h3>
              <button onClick={loadWebsiteOrders} className="text-gray-400 hover:text-gray-600"><RefreshCw size={16} /></button>
            </div>
            {websiteOrdersLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : websiteOrders.length === 0 ? (
              <p className="text-sm text-gray-400">No pending website orders right now.</p>
            ) : (
              <div className="space-y-2">
                {websiteOrders.map((o) => (
                  <div key={o._id} className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{o.customerName || 'Guest'} — #{o.order_id}</p>
                      <p className="text-xs text-gray-500">₦{o.totalAmount?.toLocaleString()} · {o.status}</p>
                    </div>
                    <button
                      onClick={() => handleTagToMe(o._id)}
                      disabled={tagging === o._id || !isOnActiveShift}
                      className="flex items-center gap-1.5 bg-[#C62828] text-white px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-[#B71C1C] disabled:opacity-50"
                    >
                      <Tag size={14} /> {tagging === o._id ? 'Tagging…' : 'Tag Me'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-800">New Sale (POS)</h1>
            <button onClick={addMealPackage} className="flex items-center gap-2 border border-gray-200 px-4 py-2 rounded-full text-sm font-semibold hover:bg-gray-50">
              <Plus size={16}/> Add Another Meal
            </button>
          </div>

          {mealPackages.map((mp, idx) => (
            <div key={idx} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800">Meal {idx + 1}</h3>
                {mealPackages.length > 1 && (
                  <button onClick={() => removeMealPackage(idx)} className="text-red-500 hover:text-red-700"><Trash2 size={18}/></button>
                )}
              </div>

              <p className="text-xs text-gray-500 mb-2">Choose 1 meal, or mix a maximum of 2</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {MEAL_TYPES.map((meal) => (
                  <button
                    key={meal}
                    onClick={() => toggleMeal(idx, meal)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border ${mp.meals.includes(meal) ? 'bg-[#C62828] text-white border-[#C62828]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                  >
                    {MEAL_LABELS[meal]}
                  </button>
                ))}
              </div>
              {mp.meals.length > 0 && !isComboAllowed(mp.meals) && (
                <p className="text-red-600 text-xs mb-3">That combination isn't allowed. Choose max 2 meals.</p>
              )}

              <p className="text-xs text-gray-500 mb-2">Protein (determines package price)</p>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Chicken</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {CHICKEN_PROTEINS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setProtein(idx, p)}
                    className={`px-3 py-2 rounded-lg text-sm border text-left ${mp.protein === p ? 'bg-red-50 border-[#C62828] text-[#C62828] font-semibold' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    {PROTEIN_LABELS[p]}<br/><span className="text-xs text-gray-500">₦{PROTEIN_PRICES[p].toLocaleString()}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Turkey</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {TURKEY_PROTEINS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setProtein(idx, p)}
                    className={`px-3 py-2 rounded-lg text-sm border text-left ${mp.protein === p ? 'bg-red-50 border-[#C62828] text-[#C62828] font-semibold' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    {PROTEIN_LABELS[p]}<br/><span className="text-xs text-gray-500">₦{PROTEIN_PRICES[p].toLocaleString()}</span>
                  </button>
                ))}
              </div>

              {mp.meals.length > 0 && (
                <>
                  <p className="text-xs text-gray-500 mb-2">Extra Portion (+₦1,500 each)</p>
                  <div className="flex flex-wrap gap-2">
                    {mp.meals.map((meal) => (
                      <label key={meal} className="flex items-center gap-2 text-sm border border-gray-200 rounded-lg px-3 py-1.5 cursor-pointer">
                        <input type="checkbox" checked={mp.extraPortions.includes(meal)} onChange={() => toggleExtraPortion(idx, meal)} />
                        Extra {MEAL_LABELS[meal]}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Package size={18} /> Menu Items (Shawarma, Hotdog, etc.)</h3>
            {menuCatalogLoading ? (
              <p className="text-sm text-gray-400">Loading menu…</p>
            ) : menuCatalog.length === 0 ? (
              <p className="text-sm text-gray-400">No menu items available yet — add some in Menu Management.</p>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="Search menu items…"
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {menuCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setMenuCategory(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${menuCategory === cat ? 'bg-[#C62828] text-white border-[#C62828]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {filteredMenuCatalog.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No menu items found.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredMenuCatalog.map((item) => {
                      const qty = selectedMenuItems[item._id] || 0;
                      const isTracked = !!item.trackDailyStock;
                      const remaining = item.remaining ?? 0;
                      const outOfStock = isTracked && remaining <= 0;
                      return (
                        <div key={item._id} className={`border rounded-lg p-3 ${outOfStock ? 'border-red-200 bg-red-50/40' : qty > 0 ? 'border-[#C62828] bg-[#FFF8F0]' : 'border-gray-200'}`}>
                          <p className="text-sm font-semibold text-gray-800">{item.name}</p>
                          <p className="text-xs text-gray-500 mb-1">₦{item.price.toLocaleString()} each</p>
                          {isTracked && (
                            <p className={`text-xs mb-2 ${outOfStock ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                              {outOfStock ? 'Out of stock' : `${remaining} in stock today`}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            <button type="button" disabled={outOfStock} onClick={() => setMenuItemQty(item._id, qty - 1)} className="w-7 h-7 flex items-center justify-center border rounded-full text-gray-500 hover:bg-gray-50 disabled:opacity-40"><Minus size={14} /></button>
                            <span className="w-8 text-center font-semibold">{qty}</span>
                            <button
                              type="button"
                              disabled={outOfStock || (isTracked && qty >= remaining)}
                              onClick={() => setMenuItemQty(item._id, Math.min(qty + 1, isTracked ? remaining : qty + 1))}
                              className="w-7 h-7 flex items-center justify-center border rounded-full text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                            ><Plus size={14} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-gray-800 mb-3">Extras</h3>
            {inventoryLoading ? (
              <p className="text-sm text-gray-400">Loading extras…</p>
            ) : Object.keys(extrasCatalog).length === 0 ? (
              <p className="text-sm text-gray-400">No extras set up yet — add some in Meal Inventory.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(extrasCatalog).map(([key, c]) => {
                  const outOfStock = c.remaining <= 0;
                  return (
                    <div key={key} className={`border rounded-lg p-3 ${outOfStock ? 'border-red-200 bg-red-50/40' : 'border-gray-200'}`}>
                      <p className="text-sm font-semibold text-gray-800">{c.label}</p>
                      <p className="text-xs text-gray-500 mb-1">₦{c.price.toLocaleString()} each</p>
                      <p className={`text-xs mb-2 ${outOfStock ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                        {outOfStock ? 'Out of stock' : `${c.remaining} in stock`}
                      </p>
                      <input
                        type="number" min="0" max={c.remaining > 0 ? c.remaining : 0}
                        value={extras[key] || ''}
                        onChange={(e) => setExtraQty(key, Math.min(Number(e.target.value) || 0, Math.max(0, c.remaining)))}
                        placeholder="Qty" disabled={outOfStock}
                        className="w-full border rounded-lg px-2 py-1 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Checkout panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 h-fit sticky top-4">
          <h3 className="font-bold text-gray-800 mb-4">Checkout</h3>

          <input
            type="text" placeholder="Customer name (optional)"
            value={customerName} onChange={(e) => setCustomerName(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mb-4 text-sm"
          />

          <div className="space-y-1 text-sm mb-4">
            {priced.mealPackages.map((mp, i) => (
              <div key={i} className="flex justify-between text-gray-600">
                <span>{mp.meals.map((m) => MEAL_LABELS[m]).join(' + ')} ({PROTEIN_LABELS[mp.protein]})</span>
                <span>₦{mp.lineTotal.toLocaleString()}</span>
              </div>
            ))}
            {priced.extras.map((e, i) => (
              <div key={i} className="flex justify-between text-gray-600">
                <span>{e.label} × {e.qty}</span>
                <span>₦{e.total.toLocaleString()}</span>
              </div>
            ))}
            {Object.entries(selectedMenuItems).map(([id, qty]) => {
              const item = menuCatalog.find((m) => m._id === id);
              if (!item) return null;
              return (
                <div key={id} className="flex justify-between text-gray-600">
                  <span>{item.name} × {qty}</span>
                  <span>₦{(item.price * qty).toLocaleString()}</span>
                </div>
              );
            })}
            {taxEnabled && (
              <div className="flex justify-between text-gray-600">
                <span className="flex items-center gap-1"><Receipt size={14} /> VAT ({taxRate}%)</span>
                <span>₦{taxAmount.toLocaleString()}</span>
              </div>
            )}
          </div>

          <div className="flex justify-between font-bold text-lg border-t pt-3 mb-4">
            <span>Total</span>
            <span className="text-[#C62828]">₦{grandTotal.toLocaleString()}</span>
          </div>

          <p className="text-xs text-gray-500 mb-2 font-semibold">Platform Order</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button" onClick={() => setPlatform(p)}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border ${platform === p ? 'bg-[#C62828] text-white border-[#C62828]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
              >
                {p !== 'Walk-in' && <Bike size={13} />} {p}
              </button>
            ))}
          </div>
          {platform !== 'Walk-in' && (
            <input
              type="text"
              placeholder={`${PLATFORM_ID_LABEL[platform]} (required)`}
              value={externalOrderId}
              onChange={(e) => setExternalOrderId(e.target.value)}
              className="w-full border border-orange-300 rounded-lg px-3 py-2 mb-4 text-sm"
            />
          )}
          {platform === 'Walk-in' && <div className="mb-4" />}

          <p className="text-xs text-gray-500 mb-2 font-semibold">Discount (optional)</p>
          <div className="flex gap-2 mb-4">
            <input
              type="number" min="0" placeholder="₦ Amount"
              value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)}
              className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="text" placeholder="Reason (e.g. Loyalty discount)"
              value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {isThirdPartyPlatform ? (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2.5 mb-4 text-sm">
              <Bike size={16} className="flex-shrink-0" />
              Payment is handled by {platform} — no payment method needed here. Enter the Order ID above, then complete the sale.
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-2 font-semibold">Order Type (Required)</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  type="button" onClick={() => setPosSaleType('shop')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border ${posSaleType === 'shop' ? 'bg-[#C62828] text-white border-[#C62828]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                >
                  <Store size={16} /> Shop Sale
                </button>
                <button
                  type="button" onClick={() => setPosSaleType('restaurant')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border ${posSaleType === 'restaurant' ? 'bg-[#C62828] text-white border-[#C62828]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                >
                  <UtensilsCrossed size={16} /> Restaurant Sale
                </button>
              </div>

              <p className="text-xs text-gray-500 mb-2 font-semibold">Payment Method (Required)</p>
              <div className="space-y-2 mb-4">
                {['CASH', 'TRANSFER', 'POS', 'SPLIT'].map((m) => {
                  const tag = PAYMENT_TAGS[m];
                  const TagIcon = PAYMENT_TAG_ICONS[tag.icon] || CreditCard;
                  return (
                    <label key={m} className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer text-sm">
                      <input type="radio" name="paymentMethod" checked={paymentMethod === m} onChange={() => setPaymentMethod(m)} />
                      <TagIcon size={14} /> {m === 'SPLIT' ? 'Split Payment' : m}
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {paymentMethod === 'SPLIT' && (
            <div className="border border-orange-200 bg-orange-50/50 rounded-xl p-3 mb-4 space-y-2">
              <p className="text-xs font-semibold text-orange-700 flex items-center gap-1.5 mb-1">
                <SplitSquareHorizontal size={14} /> Split Payment Entries
              </p>

              {splitRows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={row.method}
                    onChange={(e) => updateSplitRow(idx, 'method', e.target.value)}
                    className="border rounded-lg px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="CASH">Cash</option>
                    <option value="TRANSFER">Transfer</option>
                    <option value="POS">POS</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    placeholder="Amount"
                    value={row.amount}
                    onChange={(e) => updateSplitRow(idx, 'amount', e.target.value)}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-sm bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => removeSplitRow(idx)}
                    disabled={splitRows.length <= 1}
                    className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addSplitRow}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#C62828] hover:underline mt-1"
              >
                <Plus size={14} /> Add Payment Row
              </button>

              <div className="border-t border-orange-200 pt-2 mt-2 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Total Paid</span>
                  <span className="font-semibold">₦{totalPaid.toLocaleString()}</span>
                </div>
                {remainingBalance > 0 && (
                  <div className="flex justify-between text-amber-600 font-semibold">
                    <span>Remaining Balance</span>
                    <span>₦{remainingBalance.toLocaleString()}</span>
                  </div>
                )}
                {overpaidAmount > 0 && (
                  <div className="flex justify-between text-red-600 font-semibold">
                    <span>Overpaid</span>
                    <span>₦{overpaidAmount.toLocaleString()}</span>
                  </div>
                )}
                {splitExactMatch && (
                  <div className="flex items-center gap-1.5 text-green-700 font-semibold">
                    <CheckCircle size={14} /> Payment matches order total
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

          <button
            onClick={handleCompleteSale}
            disabled={placing || !allValid || !isOnActiveShift || (!isThirdPartyPlatform && paymentMethod === 'SPLIT' && !splitExactMatch)}
            className="w-full bg-[#C62828] text-white py-3 rounded-full font-bold hover:bg-[#B71C1C] disabled:opacity-50"
          >
            {placing ? 'Saving…' : 'Complete Sale'}
          </button>

          {result && (() => {
            const tag = PAYMENT_TAGS[result.order.paymentMethod] || PAYMENT_TAGS['WEBSITE PAYMENT'];
            const TagIcon = PAYMENT_TAG_ICONS[tag.icon] || CreditCard;
            return (
              <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold text-green-700 mb-1"><CheckCircle size={16}/> Sale completed</p>
                <p>Order #{result.order.order_id}</p>
                {result.order.platform && result.order.platform !== 'Walk-in' && (
                  <p className="flex items-center gap-1.5 text-gray-600"><Bike size={13} /> {result.order.platform} — {result.order.externalOrderId}</p>
                )}
                <p className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${tag.color}`}><TagIcon size={12} /> {tag.label}</p>
                {result.order.paymentMethod === 'SPLIT' && result.order.splitPayments?.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-green-200 pt-2">
                    {result.order.splitPayments.map((sp, i) => {
                      const spTag = PAYMENT_TAGS[sp.method];
                      const SpIcon = PAYMENT_TAG_ICONS[spTag.icon] || CreditCard;
                      return (
                        <div key={i} className="flex items-center justify-between text-gray-600">
                          <span className="flex items-center gap-1.5"><SpIcon size={12} /> {spTag.label}</span>
                          <span>₦{sp.amount.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="mt-2 font-semibold">Amount: ₦{result.order.totalAmount.toLocaleString()}</p>
                {result.order.discount_amount > 0 && (
                  <p className="text-green-700 text-xs">{result.order.discount_label || 'Discount'} applied: −₦{result.order.discount_amount.toLocaleString()}</p>
                )}
                <a
                  href={`/receipt/${result.order._id}?staff=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#C62828] hover:underline"
                >
                  <Receipt size={13} /> View / Print Receipt
                </a>
              </div>
            );
          })()}
        </div>
      </div>
    </>
  );
}