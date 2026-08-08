import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Save, CheckCircle2, XCircle } from 'lucide-react';
import { menuItems as menuItemsApi, stock as stockApi } from '../../lib/api';

export default function StockManagement() {
  const [items, setItems] = useState([]);
  const [todayStock, setTodayStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingValues, setOpeningValues] = useState({});

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Only dishes explicitly opted into Daily Dish Stock tracking (e.g.
      // Regular Chicken, Big Turkey) show up here — every other menu item
      // (drinks, sides, anything without a daily portion cap) is untouched
      // and simply doesn't appear on this page.
      const [menu, today] = await Promise.all([
        menuItemsApi.getAll({ trackDailyStock: true }),
        stockApi.getToday(),
      ]);
      const list = Array.isArray(menu) ? menu : menu.items || [];
      setItems(list);
      setTodayStock(today);
      const initial = {};
      list.forEach(m => { initial[m._id] = m.openingStock || 0; });
      setOpeningValues(initial);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const remainingFor = (id) => {
    const entry = todayStock?.items?.find(i => String(i.menuItem) === String(id));
    return entry ? entry.remaining : items.find(m => m._id === id)?.remaining ?? 0;
  };

  const soldFor = (id) => {
    const entry = todayStock?.items?.find(i => String(i.menuItem) === String(id));
    return entry ? entry.sold : items.find(m => m._id === id)?.sold ?? 0;
  };

  const handleSaveOpening = async () => {
    setSaving(true);
    try {
      const payload = items.map(m => ({ menuItemId: m._id, openingStock: Number(openingValues[m._id]) || 0 }));
      await stockApi.setOpening(payload);
      await fetchData();
      alert("Opening stock saved. Today's Daily Dish Stock is now live.");
    } catch (err) {
      alert(`Failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const StatusBadge = ({ remaining }) => remaining > 0 ? (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      <CheckCircle2 size={13} /> Available
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      <XCircle size={13} /> Out of Stock
    </span>
  );

  return (
    <>
      <Helmet><title>Daily Dish Stock – Solohans Admin</title></Helmet>
      <div>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Daily Dish Stock</h1>
            <p className="text-gray-500 text-sm mt-1 max-w-2xl">
              How many finished portions of each dish/variant are available for sale today (e.g. Regular Chicken, Big Chicken, Big Turkey each have their own count). Separate from Meal Inventory (rice/spaghetti/boxes) and Ingredient Inventory (raw ingredients). Enter today's opening quantity per dish, then Save — everything else updates automatically as orders come in.
            </p>
            {todayStock?.isClosed && (
              <p className="text-red-600 text-sm font-medium mt-1">⚠️ Today has already been closed via Day Reconciliation — opening stock can't be changed again until tomorrow.</p>
            )}
            {!loading && items.length === 0 && (
              <p className="text-amber-600 text-sm font-medium mt-1">No dishes are tracked yet — go to Menu Management and turn on "Track Daily Stock" for each dish/variant you want to cap (e.g. Regular Chicken, Big Turkey).</p>
            )}
          </div>
          {items.length > 0 && (
            <button onClick={handleSaveOpening} disabled={saving || todayStock?.isClosed} className="flex items-center gap-2 bg-[#C62828] text-white px-5 py-2.5 rounded-full font-semibold hover:bg-[#B71C1C] disabled:opacity-50">
              <Save size={18} /> {saving ? 'Saving…' : 'Save Opening Stock'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading…</div>
        ) : items.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-500 text-sm">
                <tr>
                  <th className="py-3 px-4">Dish</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Opening Stock</th>
                  <th className="py-3 px-4">Sold</th>
                  <th className="py-3 px-4">Remaining</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map(m => {
                  const remaining = remainingFor(m._id);
                  return (
                    <tr key={m._id} className={`border-t border-gray-100 ${remaining === 0 ? 'bg-red-50/40' : ''}`}>
                      <td className="py-3 px-4 font-medium text-gray-800">{m.name}</td>
                      <td className="py-3 px-4 text-gray-600">₦{Number(m.price).toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          min="0"
                          disabled={todayStock?.isClosed}
                          value={openingValues[m._id] ?? 0}
                          onChange={e => setOpeningValues({ ...openingValues, [m._id]: e.target.value })}
                          className="w-24 px-3 py-1.5 border rounded-lg"
                        />
                      </td>
                      <td className="py-3 px-4">{soldFor(m._id)}</td>
                      <td className={`py-3 px-4 font-semibold ${remaining === 0 ? 'text-red-600' : 'text-green-600'}`}>{remaining}</td>
                      <td className="py-3 px-4"><StatusBadge remaining={remaining} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}