import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, AlertTriangle, Lock, Banknote, CreditCard, ArrowLeftRight, Globe, Bike, Download } from 'lucide-react';
import { paymentReconciliation as reconciliationApi } from '../../lib/api';

// The 6 payment methods this page reconciles — MONEY ONLY. Nothing about
// food/meals lives here; that's the separate Day Reconciliation page.
const METHOD_META = {
  cash: { icon: Banknote, iconColor: 'text-green-600' },
  pos: { icon: CreditCard, iconColor: 'text-purple-600' },
  transfer: { icon: ArrowLeftRight, iconColor: 'text-blue-600' },
  website: { icon: Globe, iconColor: 'text-teal-600' },
  glovo: { icon: Bike, iconColor: 'text-indigo-600' },
  chowdeck: { icon: Bike, iconColor: 'text-orange-600' },
};

const naira = (n) => `₦${(Number(n) || 0).toLocaleString()}`;

export default function PaymentReconciliation() {
  const [expected, setExpected] = useState(null); // { date, methods: [{key,label,count,expected}], totalExpected, isClosed, closedRecord }
  const [actual, setActual] = useState({}); // { cash: '', pos: '', transfer: '', website: '', glovo: '', chowdeck: '' }
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

  // Everything below is calculated automatically — staff never does any
  // math themselves. Live rows recompute on every keystroke.
  const rows = useMemo(() => {
    if (!expected) return [];
    return expected.methods.map((m) => {
      const raw = actual[m.key];
      const hasEntry = raw !== undefined && raw !== '';
      const act = hasEntry ? Number(raw) || 0 : null;
      const difference = act === null ? null : act - m.expected;
      const status = difference === null ? null : (difference === 0 ? 'Reconciled' : (difference > 0 ? 'Excess' : 'Shortage'));
      return { ...m, actual: act, difference, status };
    });
  }, [expected, actual]);

  const totalExpected = expected?.totalExpected || 0;
  const totalActual = rows.reduce((s, r) => s + (r.actual || 0), 0);
  const totalDifference = totalActual - totalExpected;

  const handleCloseDay = async () => {
    if (!window.confirm("Close today's payment reconciliation? This cannot be undone.")) return;
    setClosing(true);
    try {
      const actualPayload = Object.fromEntries(
        Object.keys(METHOD_META).map((key) => [key, Number(actual[key]) || 0])
      );
      const res = await reconciliationApi.closeDay(actualPayload);
      setResult(res);
      fetchData();
    } catch (err) {
      alert(`Failed: ${err.message}`);
    } finally {
      setClosing(false);
    }
  };

  const handleExportCSV = () => {
    const rowsCsv = [['Date', 'Payment Method', 'Expected', 'Actual', 'Difference', 'Status', 'Closed By']];
    history.forEach((r) => {
      (r.methods || []).forEach((m) => {
        rowsCsv.push([r.date, m.label, m.expected, m.actual, m.difference, m.status, r.closedBy || '']);
      });
    });
    const csv = rowsCsv.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payment-reconciliation-history.csv';
    a.click();
    URL.revokeObjectURL(url);
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
      <Helmet><title>Payment Reconciliation – Solohans Admin</title></Helmet>
      <div>
        <h1 className="text-3xl font-bold text-gray-800 mb-1">Payment Reconciliation</h1>
        <p className="text-gray-500 text-sm mb-6">
          Money only. Expected amounts are calculated automatically from today's completed orders — just enter what was actually counted for each payment method.
        </p>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading…</div>
        ) : expected?.isClosed ? (
          <div className="bg-gray-100 rounded-2xl p-8 text-center text-gray-600">
            <Lock size={32} className="mx-auto mb-3" />
            <p className="font-medium">Today's payment reconciliation has already been closed.</p>
            {expected.closedRecord && (
              <div className="mt-5 text-sm text-left max-w-lg mx-auto space-y-2">
                {expected.closedRecord.methods.map((m) => (
                  <div key={m.key} className="flex items-center justify-between border-b border-gray-200 pb-1">
                    <span>{m.label}</span>
                    <span className="text-gray-500">Expected {naira(m.expected)} · Actual {naira(m.actual)}</span>
                    <StatusPill status={m.status} />
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 font-semibold">
                  <span>Total</span>
                  <span>Expected {naira(expected.closedRecord.totalExpected)} · Actual {naira(expected.closedRecord.totalActual)}</span>
                  <StatusPill status={expected.closedRecord.overallStatus} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto mb-6">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-sm">
                  <tr>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4">Transactions</th>
                    <th className="py-3 px-4">Expected Amount</th>
                    <th className="py-3 px-4">Actual Amount</th>
                    <th className="py-3 px-4">Difference</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const meta = METHOD_META[r.key];
                    const mismatch = r.status && r.status !== 'Reconciled';
                    return (
                      <tr key={r.key} className={`border-t border-gray-100 ${mismatch ? 'bg-red-50/50' : r.status === 'Reconciled' ? 'bg-green-50/40' : ''}`}>
                        <td className="py-3 px-4 font-medium text-gray-800 flex items-center gap-2">
                          <meta.icon size={16} className={meta.iconColor} /> {r.label}
                        </td>
                        <td className="py-3 px-4 text-gray-500">{r.count}</td>
                        <td className="py-3 px-4 font-medium">{naira(r.expected)}</td>
                        <td className="py-3 px-4">
                          <input
                            type="number"
                            min="0"
                            value={actual[r.key] ?? ''}
                            onChange={(e) => setActual({ ...actual, [r.key]: e.target.value })}
                            placeholder="0"
                            className={`w-32 px-3 py-1.5 border rounded-lg ${mismatch ? 'border-red-300' : ''}`}
                          />
                        </td>
                        <td className={`py-3 px-4 font-semibold ${r.difference === null ? 'text-gray-400' : r.difference === 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {r.difference === null ? '—' : `${r.difference >= 0 ? '+' : ''}${naira(r.difference)}`}
                        </td>
                        <td className="py-3 px-4"><StatusPill status={r.status} /></td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                    <td className="py-3 px-4">Total</td>
                    <td></td>
                    <td className="py-3 px-4">{naira(totalExpected)}</td>
                    <td className="py-3 px-4">{naira(totalActual)}</td>
                    <td className={`py-3 px-4 ${totalDifference === 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {totalDifference >= 0 ? '+' : ''}{naira(totalDifference)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <button onClick={handleCloseDay} disabled={closing} className="bg-[#C62828] text-white px-6 py-3 rounded-full font-semibold hover:bg-[#B71C1C] disabled:opacity-50">
              {closing ? 'Closing Day…' : 'Submit & Close Day'}
            </button>
          </>
        )}

        {result && (
          <div className={`mt-6 p-5 rounded-2xl ${result.overallStatus === 'Reconciled' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            <div className="flex items-center gap-2 font-bold mb-2">
              {result.overallStatus === 'Reconciled' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
              {result.overallStatus === 'Reconciled' ? 'Payment Reconciliation — Reconciled Successfully' : `Payment Reconciliation — ${result.overallStatus} of ${naira(Math.abs(result.totalDifference))}`}
            </div>
            <ul className="text-sm space-y-1">
              {result.methods.map((m) => (
                <li key={m.key} className={m.status !== 'Reconciled' ? 'flex items-center gap-1' : ''}>
                  {m.status !== 'Reconciled' && <AlertTriangle size={14} />}
                  {m.label}: expected {naira(m.expected)}, actual {naira(m.actual)} ({m.difference >= 0 ? '+' : ''}{naira(m.difference)}) — {m.status}
                </li>
              ))}
            </ul>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-gray-800">Past Reconciliations</h2>
              <button onClick={handleExportCSV} className="flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-full text-sm font-semibold hover:bg-gray-50">
                <Download size={15} /> Export CSV
              </button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-sm">
                  <tr><th className="py-3 px-4">Date</th><th className="py-3 px-4">Expected</th><th className="py-3 px-4">Actual</th><th className="py-3 px-4">Status</th></tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r._id} className="border-t border-gray-100">
                      <td className="py-3 px-4">{r.date}</td>
                      <td className="py-3 px-4">{naira(r.totalExpected)}</td>
                      <td className="py-3 px-4">{naira(r.totalActual)}</td>
                      <td className="py-3 px-4"><StatusPill status={r.overallStatus} /></td>
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