import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, AlertTriangle, Lock } from 'lucide-react';
import { reconciliation as reconciliationApi } from '../../lib/api';

export default function Reconciliation() {
  const [expected, setExpected] = useState(null); // { date, items: [{menuItem, name, expectedSold}], isClosed }
  const [actualValues, setActualValues] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [exp, hist] = await Promise.all([
        reconciliationApi.getExpected(),
        reconciliationApi.getHistory(),
      ]);
      setExpected(exp);
      setHistory(hist);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Live, automatic comparison — staff only ever types the actual count.
  const rows = useMemo(() => {
    if (!expected?.items) return [];
    return expected.items.map((i) => {
      const raw = actualValues[i.menuItem];
      const hasEntry = raw !== undefined && raw !== '';
      const actualSold = hasEntry ? Number(raw) || 0 : null;
      const difference = actualSold === null ? null : actualSold - i.expectedSold;
      const status = difference === null ? null : (difference === 0 ? 'Reconciled' : (difference > 0 ? 'Excess' : 'Shortage'));
      return { ...i, actualSold, difference, status };
    });
  }, [expected, actualValues]);

  const handleCloseDay = async () => {
    if (!window.confirm('Close today\'s food reconciliation and lock stock? This resets all meal counters for tomorrow and cannot be undone.')) return;
    setClosing(true);
    try {
      const actualCounts = expected.items.map(i => ({
        menuItemId: i.menuItem,
        actual: Number(actualValues[i.menuItem]) || 0,
      }));
      const res = await reconciliationApi.closeDay(actualCounts);
      setResult(res);
      fetchData();
    } catch (err) {
      alert(`Failed: ${err.message}`);
    } finally {
      setClosing(false);
    }
  };

  const StatusPill = ({ status }) => {
    if (status === null) return <span className="text-xs text-gray-400">Awaiting entry</span>;
    if (status === 'Reconciled') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
          <CheckCircle2 size={13} /> Reconciled Successfully
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <AlertTriangle size={13} /> {status}
      </span>
    );
  };

  return (
    <>
      <Helmet><title>Day Reconciliation – Solohans Admin</title></Helmet>
      <div>
        <h1 className="text-3xl font-bold text-gray-800 mb-1">Day Reconciliation</h1>
        <p className="text-gray-500 text-sm mb-6">
          Food only — no money here. Expected meals sold per dish are calculated automatically from today's completed orders; just enter the actual portion count.
        </p>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading…</div>
        ) : expected?.isClosed ? (
          <div className="bg-gray-100 rounded-2xl p-8 text-center text-gray-600">
            <Lock size={32} className="mx-auto mb-3" />
            <p className="font-medium">Today has already been closed. A new day will start fresh tomorrow.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto mb-6">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-sm">
                  <tr>
                    <th className="py-3 px-4">Dish</th>
                    <th className="py-3 px-4">Expected Meals Sold</th>
                    <th className="py-3 px-4">Actual Meals Sold</th>
                    <th className="py-3 px-4">Difference</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const mismatch = r.status && r.status !== 'Reconciled';
                    return (
                      <tr key={r.menuItem} className={`border-t border-gray-100 ${mismatch ? 'bg-red-50/50' : r.status === 'Reconciled' ? 'bg-green-50/40' : ''}`}>
                        <td className="py-3 px-4 font-medium text-gray-800">{r.name}</td>
                        <td className="py-3 px-4">{r.expectedSold}</td>
                        <td className="py-3 px-4">
                          <input
                            type="number"
                            min="0"
                            value={actualValues[r.menuItem] ?? ''}
                            onChange={e => setActualValues({ ...actualValues, [r.menuItem]: e.target.value })}
                            placeholder="0"
                            className={`w-24 px-3 py-1.5 border rounded-lg ${mismatch ? 'border-red-300' : ''}`}
                          />
                        </td>
                        <td className={`py-3 px-4 font-semibold ${r.difference === null ? 'text-gray-400' : r.difference === 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {r.difference === null ? '—' : `${r.difference >= 0 ? '+' : ''}${r.difference}`}
                        </td>
                        <td className="py-3 px-4"><StatusPill status={r.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button onClick={handleCloseDay} disabled={closing} className="bg-[#C62828] text-white px-6 py-3 rounded-full font-semibold hover:bg-[#B71C1C] disabled:opacity-50">
              {closing ? 'Closing Day…' : 'Submit & Close Day'}
            </button>
          </>
        )}

        {result && (
          <div className={`mt-6 p-5 rounded-2xl ${result.status === 'Verified' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            <div className="flex items-center gap-2 font-bold mb-2">
              {result.status === 'Verified' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
              {result.status === 'Verified' ? 'All meals reconciled — Reconciled Successfully' : 'Differences recorded — see below'}
            </div>
            {result.status === 'Mismatch' && (
              <ul className="text-sm space-y-1">
                {result.items.filter(i => i.difference !== 0).map(i => (
                  <li key={i.menuItem} className="flex items-center gap-1">
                    <AlertTriangle size={14} />
                    {i.name}: expected {i.expectedSold}, actual {i.actualSold} ({i.difference > 0 ? '+' : ''}{i.difference}) — {i.status}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-bold text-gray-800 mb-3">Past Reconciliations</h2>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-sm">
                  <tr><th className="py-3 px-4">Date</th><th className="py-3 px-4">Status</th><th className="py-3 px-4">Dishes</th></tr>
                </thead>
                <tbody>
                  {history.map(r => (
                    <tr key={r._id} className="border-t border-gray-100">
                      <td className="py-3 px-4">{new Date(r.date).toLocaleDateString()}</td>
                      <td className="py-3 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${r.status === 'Verified' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {r.status === 'Verified' ? 'Reconciled Successfully' : 'Discrepancy'}
                        </span>
                      </td>
                      <td className="py-3 px-4">{r.items.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}