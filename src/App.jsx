import React, { useState, useEffect, useRef } from 'react';
import {
  Home, Users, Settings as SettingsIcon, Plus, Search, Phone, Mail, MessageCircle, User,
  ChevronRight, ChevronLeft, Moon, Sun, CheckCircle2, Circle, AlertTriangle,
  Trash2, Pencil, Building2, FileText,
} from 'lucide-react';

const STORAGE_KEY_TENANTS = 'tenant-mgmt:tenants:v3';
const STORAGE_KEY_THEME = 'tenant-mgmt:theme:v3';

/* ---------- Theme tokens ---------- */
const THEME = {
  light: {
    pageBg: 'bg-neutral-100', appBg: 'bg-neutral-50', cardBg: 'bg-white', sheetBg: 'bg-white',
    inputBg: 'bg-neutral-50', chipBg: 'bg-neutral-200', hoverBg: 'bg-neutral-100',
    border: 'border-neutral-100', borderStrong: 'border-neutral-200',
    text: 'text-neutral-900', textSubtle: 'text-neutral-500', textMuted: 'text-neutral-400',
    accent: 'text-indigo-600', accentSoftBg: 'bg-indigo-50',
    toggleTrack: 'bg-neutral-200', segActive: 'bg-white', segActiveText: 'text-neutral-900',
    toastBg: 'bg-neutral-900', toastText: 'text-white',
  },
  dark: {
    pageBg: 'bg-black', appBg: 'bg-neutral-950', cardBg: 'bg-neutral-900', sheetBg: 'bg-neutral-900',
    inputBg: 'bg-neutral-800', chipBg: 'bg-neutral-800', hoverBg: 'bg-neutral-800',
    border: 'border-neutral-800', borderStrong: 'border-neutral-800',
    text: 'text-white', textSubtle: 'text-neutral-400', textMuted: 'text-neutral-500',
    accent: 'text-indigo-400', accentSoftBg: 'bg-indigo-950',
    toggleTrack: 'bg-neutral-800', segActive: 'bg-neutral-700', segActiveText: 'text-white',
    toastBg: 'bg-white', toastText: 'text-neutral-900',
  },
};

const STATUS_STYLES = {
  light: {
    paid: { text: 'text-emerald-600', bg: 'bg-emerald-50' },
    due: { text: 'text-amber-600', bg: 'bg-amber-50' },
    overdue: { text: 'text-rose-600', bg: 'bg-rose-50' },
    upcoming: { text: 'text-sky-600', bg: 'bg-sky-50' },
    settling: { text: 'text-sky-600', bg: 'bg-sky-50' },
    ended: { text: 'text-neutral-500', bg: 'bg-neutral-100' },
  },
  dark: {
    paid: { text: 'text-emerald-400', bg: 'bg-emerald-950' },
    due: { text: 'text-amber-400', bg: 'bg-amber-950' },
    overdue: { text: 'text-rose-400', bg: 'bg-rose-950' },
    upcoming: { text: 'text-sky-400', bg: 'bg-sky-950' },
    settling: { text: 'text-sky-400', bg: 'bg-sky-950' },
    ended: { text: 'text-neutral-400', bg: 'bg-neutral-800' },
  },
};
const STATUS_LABEL = { paid: '已缴清', due: '待缴费', overdue: '已逾期', upcoming: '未开始', settling: '首期未到', ended: '已结束' };

const PROPERTY_TYPES = ['Condominium', 'Serviced Residence', 'Apartment', 'Landed', 'Townhouse', 'Studio'];

/* ---------- Date / period helpers (all local-timezone, no toISOString) ---------- */
function uid() { return 'tn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function pad2(n) { return String(n).padStart(2, '0'); }
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function formatMYR(n) { return 'RM ' + (Number(n) || 0).toLocaleString('en-MY', { maximumFractionDigits: 0 }); }
function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}
function periodKeyOf(date) { return date.getFullYear() + '-' + pad2(date.getMonth() + 1); }
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = startOfDay(new Date(dateStr));
  const now = startOfDay(new Date());
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}
function getDueDateForPeriod(key) {
  // Due date is the 1st of the period's own month (prepaid, e.g. August rent is due 2026-08-01).
  // Which month counts as the first billable period is handled separately by getBillingStartMonth
  // (a partial move-in month is skipped, so this alone doesn't cause premature "overdue" flags).
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}
function toWhatsAppNumber(phone) {
  let digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return '60' + digits.slice(1);
  return '60' + digits;
}

/* The first month that actually gets billed: if move-in is on the 1st, that month counts
   in full; otherwise the partial month is skipped and billing starts the following month. */
function getBillingStartMonth(tenant) {
  if (!tenant.leaseStart) return null;
  const ls = new Date(tenant.leaseStart);
  if (ls.getDate() === 1) return new Date(ls.getFullYear(), ls.getMonth(), 1);
  return new Date(ls.getFullYear(), ls.getMonth() + 1, 1);
}

/* Single source of truth for "does this month apply, and what's its state" */
function getMonthInfo(tenant, year, monthIndex) {
  const key = year + '-' + pad2(monthIndex + 1);
  const billingStart = getBillingStartMonth(tenant);
  if (!billingStart) return { key, inLease: false };
  const monthStart = new Date(year, monthIndex, 1);
  if (monthStart < billingStart) return { key, inLease: false };
  if (tenant.leaseEnd) {
    const leaseEnd = new Date(tenant.leaseEnd);
    const leaseEndMonth = new Date(leaseEnd.getFullYear(), leaseEnd.getMonth(), 1);
    if (monthStart > leaseEndMonth) return { key, inLease: false };
  }
  const due = getDueDateForPeriod(key);
  const rec = (tenant.payments || {})[key] || { paid: false };
  const today = startOfDay(new Date());
  const dueDay = startOfDay(due);
  let state;
  if (rec.paid) state = 'paid';
  else if (dueDay < today) state = 'overdue';
  else if (key === periodKeyOf(today)) state = 'current';
  else state = 'future';
  return { key, inLease: true, due, rec, state };
}

/* Aggregate expected/collected rent across all tenants for an arbitrary month.
   Reuses getMonthInfo so it can never drift from the per-tenant/per-row logic. */
function getMonthTotals(tenants, year, monthIndex) {
  let expected = 0, collected = 0, activeCount = 0, paidCount = 0;
  tenants.forEach((t) => {
    const info = getMonthInfo(t, year, monthIndex);
    if (!info.inLease) return;
    activeCount++;
    expected += Number(t.rentAmount || 0);
    if (info.rec.paid) { collected += Number(t.rentAmount || 0); paidCount++; }
  });
  return { expected, collected, activeCount, paidCount };
}

/* Tenant-level status, derived from the SAME getMonthInfo used by the grid.
   'upcoming'  = hasn't moved in yet (today < leaseStart)
   'settling'  = has moved in, but the first full billing month hasn't started yet
   'ended'     = past leaseEnd */
function getCurrentStatus(tenant) {
  const today = new Date();
  if (tenant.leaseEnd && today > new Date(tenant.leaseEnd)) return 'ended';
  if (tenant.leaseStart && today < new Date(tenant.leaseStart)) return 'upcoming';
  const info = getMonthInfo(tenant, today.getFullYear(), today.getMonth());
  if (!info.inLease) return 'settling';
  return info.state === 'current' ? 'due' : info.state; // paid | overdue | due
}

function getNextDueDate(tenant) {
  const billingStart = getBillingStartMonth(tenant);
  if (!billingStart) return null;
  return getDueDateForPeriod(periodKeyOf(billingStart));
}

function getLeaseNote(tenant, status) {
  if (status === 'upcoming' || status === 'settling') {
    const nextDue = getNextDueDate(tenant);
    const dDue = nextDue ? daysUntil(nextDue) : null;
    const dEnd = daysUntil(tenant.leaseEnd);
    const text = dDue !== null ? '距下一期还款还有 ' + dDue + ' 天' : null;
    const sub = dEnd !== null ? '距合同到期还有 ' + dEnd + ' 天' : null;
    return text ? { text, cls: 'text-sky-500', sub } : null;
  }
  if (status === 'ended') return { text: '合同已结束', cls: 'text-neutral-400' };
  const d = daysUntil(tenant.leaseEnd);
  if (d !== null && d <= 30) {
    return d < 0 ? { text: '合同已到期 ' + Math.abs(d) + ' 天', cls: 'text-rose-500' } : { text: d + ' 天后合同到期', cls: 'text-amber-500' };
  }
  return null;
}

/* ---------- Small components ---------- */
function RadialGauge({ percent, theme }) {
  const size = 118, stroke = 10, radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" stroke="currentColor"
          className={theme === 'dark' ? 'text-neutral-800' : 'text-neutral-200'} />
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" stroke="currentColor"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="text-emerald-500 transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={'text-xl font-bold ' + THEME[theme].text}>{Math.round(clamped)}%</span>
        <span className={'text-xs ' + THEME[theme].textMuted}>收缴率</span>
      </div>
    </div>
  );
}

function MonthlyIncomeCard({ tenants, theme }) {
  const c = THEME[theme];
  const today = new Date();
  const initial = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());
  const isAtMax = year === today.getFullYear() && month === today.getMonth();

  const goPrev = () => { if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); };
  const goNext = () => { if (isAtMax) return; if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1); };

  const totals = getMonthTotals(tenants, year, month);
  const rate = totals.expected > 0 ? (totals.collected / totals.expected) * 100 : 0;

  return (
    <div className={c.cardBg + ' rounded-2xl p-5 border ' + c.border}>
      <div className="flex items-center justify-between mb-4">
        <p className={'text-xs font-medium ' + c.textMuted}>月度收入查询</p>
        <div className="flex items-center gap-3">
          <button onClick={goPrev} className={c.textMuted}><ChevronLeft size={16} /></button>
          <span className={'text-sm font-semibold ' + c.text}>{year}年{month + 1}月</span>
          <button onClick={goNext} disabled={isAtMax} className={c.textMuted + (isAtMax ? ' opacity-30' : '')}><ChevronRight size={16} /></button>
        </div>
      </div>
      {totals.activeCount === 0 ? (
        <p className={'text-sm ' + c.textMuted}>该月没有生效中的租户</p>
      ) : (
        <div className="flex items-center gap-5">
          <RadialGauge percent={rate} theme={theme} />
          <div className="flex-1 space-y-1.5 min-w-0">
            <p className={'text-xs ' + c.textMuted}>应收</p>
            <p className={'text-lg font-bold ' + c.text}>{formatMYR(totals.expected)}</p>
            <p className={'text-xs ' + c.textMuted + ' pt-1'}>已收 {formatMYR(totals.collected)} · {totals.paidCount}/{totals.activeCount} 户</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Segmented({ options, value, onChange, theme }) {
  const c = THEME[theme];
  return (
    <div className={'flex ' + c.toggleTrack + ' rounded-xl p-1'}>
      {options.map((opt) => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
          className={'flex-1 text-xs font-medium py-2 rounded-lg transition-colors ' +
            (value === opt.value ? c.segActive + ' ' + c.segActiveText + ' shadow-sm' : c.textSubtle)}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function TenantRow({ tenant, onClick, theme }) {
  const c = THEME[theme];
  const status = getCurrentStatus(tenant);
  const sc = STATUS_STYLES[theme][status];
  const initials = (tenant.name || '?').trim().slice(0, 1).toUpperCase();
  const leaseNote = getLeaseNote(tenant, status);
  return (
    <button onClick={onClick}
      className={'w-full flex items-center gap-3 ' + c.cardBg + ' rounded-2xl p-3.5 border ' + c.border + ' active:scale-[0.98] transition-transform text-left'}>
      <div className={'w-11 h-11 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ' + sc.bg + ' ' + sc.text}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className={'font-medium truncate ' + c.text}>{tenant.name}</p>
        <p className={'text-xs truncate ' + c.textSubtle}>{[tenant.propertyName, tenant.unit].filter(Boolean).join(' · ') || '未设置房产'}</p>
        {leaseNote && <p className={'text-xs font-medium mt-0.5 ' + leaseNote.cls}>{leaseNote.text}</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <p className={'text-sm font-semibold ' + c.text}>{formatMYR(tenant.rentAmount)}</p>
        <p className={'text-xs font-medium ' + sc.text}>{STATUS_LABEL[status]}</p>
      </div>
      <ChevronRight size={16} className={c.textMuted + ' flex-shrink-0'} />
    </button>
  );
}

function Sheet({ title, onClose, theme, children }) {
  const c = THEME[theme];
  const [show, setShow] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);
  const draggedRef = useRef(false);

  useEffect(() => { const t = setTimeout(() => setShow(true), 10); return () => clearTimeout(t); }, []);
  const handleClose = () => { setShow(false); setTimeout(onClose, 180); };

  const onTouchStart = (e) => {
    startYRef.current = e.touches[0].clientY;
    draggedRef.current = true;
    setDragging(true);
  };
  const onTouchMove = (e) => {
    if (!draggedRef.current) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) setDragY(delta);
  };
  const onTouchEnd = () => {
    draggedRef.current = false;
    setDragging(false);
    if (dragY > 110) {
      handleClose();
    } else {
      setDragY(0);
    }
  };

  const translateY = !show ? '100%' : dragY + 'px';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div onClick={handleClose} className={'absolute inset-0 bg-black transition-opacity duration-200 ' + (show ? 'opacity-40' : 'opacity-0')} />
      <div
        style={{ transform: 'translateY(' + translateY + ')', transition: dragging ? 'none' : 'transform 200ms ease-out' }}
        className={'relative w-full max-w-md ' + c.sheetBg + ' rounded-t-3xl max-h-screen overflow-y-auto'}
      >
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
          className={'sticky top-0 ' + c.sheetBg + ' border-b ' + c.border + ' rounded-t-3xl z-10'}
        >
          <div className={'mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full ' + c.chipBg} />
          <div className="px-5 py-3 flex items-center justify-between">
            <button onClick={handleClose} className={c.accent + ' text-sm font-medium w-12 text-left'}>取消</button>
            <h2 className={'font-semibold ' + c.text}>{title}</h2>
            <div className="w-12" />
          </div>
        </div>
        <div className="p-5 pb-8">{children}</div>
      </div>
    </div>
  );
}

function TenantForm({ initial, onSave, theme }) {
  const c = THEME[theme];
  const [form, setForm] = useState(initial || {
    name: '', phone: '', email: '',
    propertyName: '', propertyType: '', propertyAddress: '', unit: '',
    emergencyName: '', emergencyPhone: '', emergencyRelation: '',
    leaseStart: '', leaseEnd: '', rentAmount: '', notes: '', payments: {}, attachments: [],
  });
  const [error, setError] = useState('');
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    if (!form.name.trim()) { setError('请填写租户姓名'); return; }
    if (!form.rentAmount || Number(form.rentAmount) <= 0) { setError('请填写有效租金金额'); return; }
    setError('');
    onSave({ ...form, rentAmount: Number(form.rentAmount), payments: form.payments || {}, attachments: form.attachments || [], id: form.id || uid() });
  };

  const inputClass = 'w-full rounded-xl border ' + c.border + ' ' + c.inputBg + ' px-4 py-3 text-sm ' + c.text + ' placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const labelClass = 'text-xs font-medium ' + c.textSubtle + ' mb-1.5 block';

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>姓名 *</label>
        <input className={inputClass} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="租户姓名" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>电话</label>
          <input className={inputClass} value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="012-345 6789" />
        </div>
        <div>
          <label className={labelClass}>邮箱</label>
          <input className={inputClass} value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="email@example.com" />
        </div>
      </div>
      <div>
        <label className={labelClass}>房产名称</label>
        <input className={inputClass} value={form.propertyName} onChange={(e) => update('propertyName', e.target.value)} placeholder="例如：Sunway Velocity" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>房产类型</label>
          <select className={inputClass} value={form.propertyType} onChange={(e) => update('propertyType', e.target.value)}>
            <option value="">选择类型</option>
            {PROPERTY_TYPES.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>门牌号</label>
          <input className={inputClass} value={form.unit} onChange={(e) => update('unit', e.target.value)} placeholder="A-12-03" />
        </div>
      </div>
      <div>
        <label className={labelClass}>地址</label>
        <input className={inputClass} value={form.propertyAddress} onChange={(e) => update('propertyAddress', e.target.value)} placeholder="完整地址" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>租期开始</label>
          <input type="date" className={inputClass} value={form.leaseStart} onChange={(e) => update('leaseStart', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>租期结束</label>
          <input type="date" className={inputClass} value={form.leaseEnd} onChange={(e) => update('leaseEnd', e.target.value)} />
        </div>
      </div>
      <div>
        <label className={labelClass}>月租金 (RM) *</label>
        <input type="number" className={inputClass} value={form.rentAmount} onChange={(e) => update('rentAmount', e.target.value)} placeholder="1500" />
      </div>
      <div>
        <label className={labelClass}>紧急联系人姓名</label>
        <input className={inputClass} value={form.emergencyName} onChange={(e) => update('emergencyName', e.target.value)} placeholder="姓名" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>关系</label>
          <input className={inputClass} value={form.emergencyRelation} onChange={(e) => update('emergencyRelation', e.target.value)} placeholder="配偶 / 父母 / 朋友" />
        </div>
        <div>
          <label className={labelClass}>紧急联系人电话</label>
          <input className={inputClass} value={form.emergencyPhone} onChange={(e) => update('emergencyPhone', e.target.value)} placeholder="012-345 6789" />
        </div>
      </div>
      <div>
        <label className={labelClass}>备注</label>
        <textarea className={inputClass} rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="其他备注信息..." />
      </div>
      {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
      <button onClick={handleSubmit} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 rounded-xl transition-colors active:scale-[0.98]">
        保存
      </button>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, href, theme }) {
  const c = THEME[theme];
  const content = (
    <div className="flex items-center gap-3 p-3.5">
      <Icon size={16} className={c.textMuted + ' flex-shrink-0'} />
      <div className="flex-1 min-w-0">
        <p className={'text-xs ' + c.textMuted}>{label}</p>
        <p className={'text-sm font-medium truncate ' + c.text}>{value}</p>
      </div>
    </div>
  );
  return href ? <a href={href} className="block rounded-xl">{content}</a> : content;
}

function PhoneRow({ phone, label, theme }) {
  const c = THEME[theme];
  return (
    <div className="flex items-center gap-3 p-3.5">
      <Phone size={16} className={c.textMuted + ' flex-shrink-0'} />
      <div className="flex-1 min-w-0">
        <p className={'text-xs ' + c.textMuted}>{label || '电话'}</p>
        <p className={'text-sm font-medium truncate ' + c.text}>{phone || '—'}</p>
      </div>
      {phone && (
        <>
          <a href={'tel:' + phone} className={'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ' + c.hoverBg}>
            <Phone size={14} className={c.text} />
          </a>
          <a href={'https://wa.me/' + toWhatsAppNumber(phone)} target="_blank" rel="noopener noreferrer"
            className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <MessageCircle size={14} className="text-white" />
          </a>
        </>
      )}
    </div>
  );
}

/* Full-year, top-to-bottom (Jan -> Dec) payment checklist */
function YearGrid({ tenant, theme, onTogglePayment }) {
  const c = THEME[theme];
  const today = new Date();
  const defaultYear = (() => {
    if (tenant.leaseStart && today < new Date(tenant.leaseStart)) return new Date(tenant.leaseStart).getFullYear();
    return today.getFullYear();
  })();
  const [year, setYear] = useState(defaultYear);
  const curKey = periodKeyOf(today);

  if (!tenant.leaseStart) {
    return (
      <div>
        <p className={'text-xs font-medium ' + c.textMuted + ' mb-2'}>还款记录</p>
        <p className={'text-sm ' + c.textMuted + ' ' + c.cardBg + ' border ' + c.border + ' rounded-2xl p-4'}>请先在编辑中填写租期开始日期</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <p className={'text-xs font-medium ' + c.textMuted}>还款记录</p>
        <div className="flex items-center gap-3">
          <button onClick={() => setYear((y) => y - 1)} className={c.textMuted}><ChevronLeft size={16} /></button>
          <span className={'text-sm font-semibold ' + c.text}>{year}</span>
          <button onClick={() => setYear((y) => y + 1)} className={c.textMuted}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className={c.cardBg + ' border ' + c.border + ' rounded-2xl divide-y ' + c.border}>
        {Array.from({ length: 12 }, (_, i) => i).map((m) => {
          const info = getMonthInfo(tenant, year, m);
          const isCurrent = info.key === curKey;
          if (!info.inLease) {
            return (
              <div key={m} className="flex items-center justify-between p-3.5 opacity-40">
                <p className={'text-sm ' + c.textMuted}>{m + 1} 月</p>
                <p className={'text-xs ' + c.textMuted}>不在租期内</p>
              </div>
            );
          }
          const noteCls = info.state === 'overdue' ? 'text-rose-500 font-medium' : info.state === 'current' ? 'text-amber-500 font-medium' : c.textMuted;
          const noteExtra = info.rec.paid ? ' · 已还于 ' + formatDate(info.rec.paidDate)
            : info.state === 'overdue' ? ' · 已逾期'
            : info.state === 'current' ? ' · 本月待缴' : '';
          return (
            <div key={m} className={'flex items-center justify-between p-3.5 ' + (isCurrent ? c.accentSoftBg : '')}>
              <div>
                <p className={'text-sm font-medium ' + c.text}>{m + 1} 月{isCurrent ? '（本月）' : ''}</p>
                <p className={'text-xs ' + noteCls}>到期 {formatDate(info.due)}{noteExtra}</p>
              </div>
              <button onClick={() => onTogglePayment(info.key)} className="flex-shrink-0">
                {info.rec.paid ? <CheckCircle2 size={22} className="text-emerald-500" /> :
                  info.state === 'overdue' ? <Circle size={22} className="text-rose-500" /> : <Circle size={22} className={c.textMuted} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttachmentRow({ attachment, theme, onDelete }) {
  const c = THEME[theme];
  const [loading, setLoading] = useState(false);
  const handleView = async () => {
    setLoading(true);
    try {
      const res = await window.storage.get('attach:' + attachment.id);
      if (res && res.value) {
        const a = document.createElement('a');
        a.href = res.value; a.download = attachment.name; a.target = '_blank'; a.rel = 'noopener noreferrer';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
    } catch (e) {}
    setLoading(false);
  };
  return (
    <div className="flex items-center gap-3 p-3.5">
      <FileText size={18} className={c.textMuted + ' flex-shrink-0'} />
      <div className="flex-1 min-w-0">
        <p className={'text-sm font-medium truncate ' + c.text}>{attachment.name}</p>
        <p className={'text-xs ' + c.textMuted}>{Math.round(attachment.size / 1024)} KB · {formatDate(attachment.uploadedDate)}</p>
      </div>
      <button onClick={handleView} disabled={loading} className={'text-xs font-medium flex-shrink-0 ' + c.accent}>{loading ? '加载中' : '查看'}</button>
      <button onClick={onDelete} className="text-rose-500 flex-shrink-0"><Trash2 size={15} /></button>
    </div>
  );
}

function compressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else { width = Math.round((width * maxDim) / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('compress failed')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, size: blob.size });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function AttachmentSection({ tenant, theme, onAddAttachment, onDeleteAttachment }) {
  const c = THEME[theme];
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      if (file.type && file.type.startsWith('image/')) {
        const { dataUrl, size } = await compressImage(file, 1600, 0.75);
        if (size > 4 * 1024 * 1024) { setError('图片处理后仍过大，请换一张'); setBusy(false); return; }
        await onAddAttachment({ name: file.name, type: 'image/jpeg', size }, dataUrl);
      } else {
        if (file.size > 3 * 1024 * 1024) { setError('文件超过 3MB，请压缩后重试'); setBusy(false); return; }
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await onAddAttachment(file, dataUrl);
      }
    } catch (err) {
      setError('处理文件失败，请重试');
    }
    setBusy(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className={'text-xs font-medium ' + c.textMuted}>附件（租约 / 证件等）</p>
        <button onClick={() => inputRef.current && inputRef.current.click()} disabled={busy} className={'text-xs font-medium flex-shrink-0 ' + c.accent}>
          {busy ? '处理中…' : '+ 上传'}
        </button>
        <input ref={inputRef} type="file" accept="image/*,.pdf" onChange={handleFile}
          style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }} />
      </div>
      {error && <p className="text-xs text-rose-500 mb-2">{error}</p>}
      {(!tenant.attachments || tenant.attachments.length === 0) ? (
        <p className={'text-sm ' + c.textMuted}>暂无附件</p>
      ) : (
        <div className={c.cardBg + ' border ' + c.border + ' rounded-2xl divide-y ' + c.border}>
          {tenant.attachments.map((a) => <AttachmentRow key={a.id} attachment={a} theme={theme} onDelete={() => onDeleteAttachment(a.id)} />)}
        </div>
      )}
    </div>
  );
}

function TenantDetail({ tenant, onEdit, onDelete, onTogglePayment, onAddAttachment, onDeleteAttachment, confirming, onConfirmDelete, onCancelDelete, theme }) {
  const c = THEME[theme];
  const status = getCurrentStatus(tenant);
  const sc = STATUS_STYLES[theme][status];
  const initials = (tenant.name || '?').trim().slice(0, 1).toUpperCase();
  const leaseNote = getLeaseNote(tenant, status);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3.5">
        <div className={'w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg ' + sc.bg + ' ' + sc.text}>{initials}</div>
        <div>
          <p className={'text-lg font-bold ' + c.text}>{tenant.name}</p>
          <p className={'text-sm ' + c.textMuted}>{[tenant.propertyName, tenant.unit].filter(Boolean).join(' · ') || '未设置房产'}</p>
        </div>
      </div>

      {(tenant.propertyName || tenant.propertyType || tenant.propertyAddress) && (
        <div className={c.cardBg + ' border ' + c.border + ' rounded-2xl p-4'}>
          <div className="flex items-center justify-between mb-1.5">
            <p className={'text-xs ' + c.textMuted}>房产</p>
            {tenant.propertyType && <span className={'text-xs font-medium px-2 py-0.5 rounded-full ' + c.chipBg + ' ' + c.textSubtle}>{tenant.propertyType}</span>}
          </div>
          <p className={'text-sm font-medium ' + c.text}>{tenant.propertyName || '—'}{tenant.unit ? '（' + tenant.unit + '）' : ''}</p>
          {tenant.propertyAddress && <p className={'text-xs mt-1 ' + c.textSubtle}>{tenant.propertyAddress}</p>}
        </div>
      )}

      <div className={c.cardBg + ' border ' + c.border + ' rounded-2xl p-4'}>
        <div className="flex items-center justify-between mb-1.5">
          <p className={'text-xs ' + c.textMuted}>租期</p>
          <span className={'text-xs font-medium px-2 py-0.5 rounded-full ' + sc.bg + ' ' + sc.text}>{STATUS_LABEL[status]}</span>
        </div>
        <p className={'text-sm font-medium mb-1 ' + c.text}>{formatDate(tenant.leaseStart)} — {formatDate(tenant.leaseEnd)}</p>
        {leaseNote && <p className={'text-xs font-medium ' + leaseNote.cls}>{leaseNote.text}</p>}
        {leaseNote && leaseNote.sub && <p className={'text-xs mt-0.5 ' + c.textMuted}>{leaseNote.sub}</p>}
      </div>

      <div className={c.inputBg + ' rounded-2xl divide-y ' + c.border}>
        <PhoneRow phone={tenant.phone} theme={theme} />
        <InfoRow icon={Mail} label="邮箱" value={tenant.email || '—'} href={tenant.email ? 'mailto:' + tenant.email : null} theme={theme} />
      </div>

      {(tenant.emergencyName || tenant.emergencyPhone) && (
        <div>
          <p className={'text-xs font-medium ' + c.textMuted + ' mb-2'}>紧急联系人</p>
          <div className={c.inputBg + ' rounded-2xl divide-y ' + c.border}>
            <InfoRow icon={User} label="姓名" value={(tenant.emergencyName || '—') + (tenant.emergencyRelation ? '（' + tenant.emergencyRelation + '）' : '')} theme={theme} />
            <PhoneRow phone={tenant.emergencyPhone} theme={theme} />
          </div>
        </div>
      )}

      <YearGrid tenant={tenant} theme={theme} onTogglePayment={onTogglePayment} />

      <AttachmentSection tenant={tenant} theme={theme} onAddAttachment={onAddAttachment} onDeleteAttachment={onDeleteAttachment} />

      {tenant.notes && (
        <div>
          <p className={'text-xs font-medium ' + c.textMuted + ' mb-1.5'}>备注</p>
          <p className={'text-sm ' + c.inputBg + ' rounded-xl p-3.5 ' + c.textSubtle}>{tenant.notes}</p>
        </div>
      )}

      <div className="flex gap-2.5 pt-1">
        <button onClick={onEdit} className={'flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold ' + c.hoverBg + ' ' + c.text + ' rounded-xl py-3'}>
          <Pencil size={15} /> 编辑
        </button>
        {confirming ? (
          <>
            <button onClick={onConfirmDelete} className="flex-1 text-sm font-semibold text-white bg-rose-500 rounded-xl py-3">确认删除</button>
            <button onClick={onCancelDelete} className={'flex-1 text-sm font-semibold ' + c.textSubtle + ' ' + c.hoverBg + ' rounded-xl py-3'}>取消</button>
          </>
        ) : (
          <button onClick={onDelete} className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-rose-500 bg-rose-50 rounded-xl py-3">
            <Trash2 size={15} /> 删除
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- App ---------- */
export default function App() {
  const [theme, setTheme] = useState('light');
  const [tenants, setTenants] = useState([]);
  const [activeTab, setActiveTab] = useState('home');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sheet, setSheet] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);
  const loadedRef = useRef(false);
  const c = THEME[theme];

  useEffect(() => {
    try {
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'viewport'); document.head.appendChild(meta); }
      meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
      document.documentElement.style.overscrollBehavior = 'none';
      document.body.style.overscrollBehavior = 'none';
      document.body.style.touchAction = 'pan-y';
    } catch (e) {}
  }, []);

  useEffect(() => {
    (async () => {
      try { const t = await window.storage.get(STORAGE_KEY_TENANTS); if (t && t.value) setTenants(JSON.parse(t.value)); } catch (e) {}
      try { const th = await window.storage.get(STORAGE_KEY_THEME); if (th && th.value) setTheme(th.value); } catch (e) {}
      loadedRef.current = true;
      setReady(true);
    })();
  }, []);

  useEffect(() => { if (loadedRef.current) window.storage.set(STORAGE_KEY_TENANTS, JSON.stringify(tenants)).catch(() => {}); }, [tenants]);
  useEffect(() => { if (loadedRef.current) window.storage.set(STORAGE_KEY_THEME, theme).catch(() => {}); }, [theme]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  const handleSignOut = async () => {
    try { await window.auth.signOut(); } catch (e) {}
    // AuthGate listens for the auth state change and will swap back to the login screen itself.
  };

  const handleSaveTenant = (data) => {
    if (sheet && sheet.type === 'edit') {
      setTenants((ts) => ts.map((t) => (t.id === data.id ? { ...data, attachments: t.id === data.id ? t.attachments : data.attachments } : t)));
      showToast('已更新租户信息');
    } else {
      setTenants((ts) => [...ts, data]);
      showToast('已添加租户');
    }
    setSheet(null);
  };

  const handleDelete = async (id) => {
    const t = tenants.find((x) => x.id === id);
    if (t && t.attachments) {
      for (const a of t.attachments) { try { await window.storage.delete('attach:' + a.id); } catch (e) {} }
    }
    setTenants((ts) => ts.filter((x) => x.id !== id));
    setConfirmDeleteId(null); setSheet(null);
    showToast('已删除租户');
  };

  const handleTogglePayment = (tenantId, key) => {
    setTenants((ts) => ts.map((t) => {
      if (t.id !== tenantId) return t;
      const payments = { ...(t.payments || {}) };
      const rec = payments[key];
      payments[key] = rec && rec.paid ? { paid: false } : { paid: true, paidDate: todayStr() };
      return { ...t, payments };
    }));
    setSheet((s) => {
      if (s && s.tenant && s.tenant.id === tenantId) {
        const payments = { ...(s.tenant.payments || {}) };
        const rec = payments[key];
        payments[key] = rec && rec.paid ? { paid: false } : { paid: true, paidDate: todayStr() };
        return { ...s, tenant: { ...s.tenant, payments } };
      }
      return s;
    });
  };

  const handleAddAttachment = async (tenantId, file, dataUrl) => {
    const attId = 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    try { await window.storage.set('attach:' + attId, dataUrl); } catch (e) { showToast('附件保存失败'); return; }
    const meta = { id: attId, name: file.name, type: file.type, size: file.size, uploadedDate: todayStr() };
    setTenants((ts) => ts.map((t) => (t.id === tenantId ? { ...t, attachments: [...(t.attachments || []), meta] } : t)));
    setSheet((s) => (s && s.tenant && s.tenant.id === tenantId ? { ...s, tenant: { ...s.tenant, attachments: [...(s.tenant.attachments || []), meta] } } : s));
    showToast('附件已上传');
  };

  const handleDeleteAttachment = async (tenantId, attId) => {
    try { await window.storage.delete('attach:' + attId); } catch (e) {}
    setTenants((ts) => ts.map((t) => (t.id === tenantId ? { ...t, attachments: (t.attachments || []).filter((a) => a.id !== attId) } : t)));
    setSheet((s) => (s && s.tenant && s.tenant.id === tenantId ? { ...s, tenant: { ...s.tenant, attachments: (s.tenant.attachments || []).filter((a) => a.id !== attId) } } : s));
  };

  const filtered = tenants.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch = t.name.toLowerCase().includes(q) || (t.unit || '').toLowerCase().includes(q) ||
      (t.propertyName || '').toLowerCase().includes(q) || (t.propertyAddress || '').toLowerCase().includes(q);
    const matchesFilter = filter === 'all' || getCurrentStatus(t) === filter;
    return matchesSearch && matchesFilter;
  });

  const activeTenants = tenants.filter((t) => ['due', 'overdue', 'paid'].includes(getCurrentStatus(t)));
  const totalTenants = tenants.length;
  const totalRent = activeTenants.reduce((s, t) => s + Number(t.rentAmount || 0), 0);
  const collectedRent = activeTenants.filter((t) => getCurrentStatus(t) === 'paid').reduce((s, t) => s + Number(t.rentAmount || 0), 0);
  const portfolioRent = tenants.filter((t) => getCurrentStatus(t) !== 'ended').reduce((s, t) => s + Number(t.rentAmount || 0), 0);
  const overdueList = tenants.filter((t) => getCurrentStatus(t) === 'overdue');
  const expiringList = tenants
    .map((t) => ({ t, d: daysUntil(t.leaseEnd) }))
    .filter((x) => x.d !== null && x.d <= 30 && x.d >= 0)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.t);
  const collectRate = totalRent > 0 ? (collectedRent / totalRent) * 100 : 0;

  if (!ready) {
    return (
      <div className={(theme === 'dark' ? THEME.dark.pageBg : THEME.light.pageBg) + ' min-h-screen flex items-center justify-center'}>
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={c.pageBg + ' min-h-screen transition-colors duration-300'}>
      <div className={'max-w-md mx-auto min-h-screen ' + c.appBg + ' relative pb-24 shadow-xl'}>
        <div style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }} className={'sticky top-0 z-30 ' + c.appBg + ' border-b ' + c.border + ' px-5 pb-4 flex items-center justify-between'}>
          <h1 className={'text-2xl font-bold ' + c.text}>
            {activeTab === 'home' ? '概览' : activeTab === 'tenants' ? '租户' : '设置'}
          </h1>
          <button onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            className={'w-9 h-9 rounded-full ' + c.toggleTrack + ' flex items-center justify-center ' + c.textSubtle}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        {activeTab === 'home' && (
          <div className="px-5 pt-5 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className={c.cardBg + ' rounded-2xl p-4 border ' + c.border}>
                <div className={'flex items-center gap-2 ' + c.textMuted + ' mb-1'}><Users size={14} /><span className="text-xs font-medium">租户总数</span></div>
                <p className={'text-2xl font-bold ' + c.text}>{totalTenants}</p>
              </div>
              <div className={c.cardBg + ' rounded-2xl p-4 border ' + c.border}>
                <div className={'flex items-center gap-2 ' + c.textMuted + ' mb-1'}><AlertTriangle size={14} /><span className="text-xs font-medium">逾期未缴</span></div>
                <p className="text-2xl font-bold text-rose-500">{overdueList.length}</p>
              </div>
            </div>

            {totalTenants > 0 && (
              <div className={c.cardBg + ' rounded-2xl p-4 border ' + c.border + ' flex items-center justify-between'}>
                <p className={'text-xs ' + c.textMuted}>签约总租金 <span className="opacity-70">(含未开始租约)</span></p>
                <p className={'text-base font-bold ' + c.text}>{formatMYR(portfolioRent)} <span className={'text-xs font-normal ' + c.textMuted}>/ 月</span></p>
              </div>
            )}

            {totalTenants > 0 && (
              <div className={c.cardBg + ' rounded-2xl p-5 border ' + c.border + ' flex items-center gap-5'}>
                <RadialGauge percent={collectRate} theme={theme} />
                <div className="flex-1 space-y-1.5 min-w-0">
                  <p className={'text-xs ' + c.textMuted}>本月应收</p>
                  <p className={'text-lg font-bold ' + c.text}>{formatMYR(totalRent)}</p>
                  <p className={'text-xs ' + c.textMuted + ' pt-1'}>已收 {formatMYR(collectedRent)}</p>
                  {totalRent === 0 && <p className="text-xs text-sky-500 pt-0.5">暂无租户本月需缴费</p>}
                </div>
              </div>
            )}

            {totalTenants > 0 && <MonthlyIncomeCard tenants={tenants} theme={theme} />}

            {expiringList.length > 0 && (
              <div>
                <h3 className={'text-sm font-semibold mb-2.5 ' + c.text}>合同即将到期</h3>
                <div className="space-y-2.5">
                  {expiringList.slice(0, 3).map((t) => <TenantRow key={t.id} tenant={t} theme={theme} onClick={() => setSheet({ type: 'detail', tenant: t })} />)}
                </div>
              </div>
            )}

            {overdueList.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className={'text-sm font-semibold ' + c.text}>逾期未缴</h3>
                  <button onClick={() => { setActiveTab('tenants'); setFilter('overdue'); }} className={'text-xs font-medium ' + c.accent}>查看全部</button>
                </div>
                <div className="space-y-2.5">
                  {overdueList.slice(0, 3).map((t) => <TenantRow key={t.id} tenant={t} theme={theme} onClick={() => setSheet({ type: 'detail', tenant: t })} />)}
                </div>
              </div>
            )}

            {totalTenants === 0 && (
              <div className="text-center py-16">
                <div className={c.accentSoftBg + ' w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4'}><Building2 size={26} className="text-indigo-500" /></div>
                <p className={'font-semibold mb-1 ' + c.text}>还没有租户</p>
                <p className={'text-sm mb-5 ' + c.textMuted}>添加第一位租户开始管理</p>
                <button onClick={() => setSheet({ type: 'add' })} className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">添加租户</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tenants' && (
          <div className="px-5 pt-5 space-y-4">
            <div className="relative">
              <Search size={16} className={'absolute left-3.5 top-1/2 -translate-y-1/2 ' + c.textMuted} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索姓名或单位"
                className={'w-full ' + c.cardBg + ' border ' + c.border + ' rounded-xl pl-10 pr-4 py-2.5 text-sm ' + c.text + ' placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500'} />
            </div>
            <Segmented theme={theme} value={filter} onChange={setFilter}
              options={[{ value: 'all', label: '全部' }, { value: 'paid', label: '已缴' }, { value: 'due', label: '待缴' }, { value: 'overdue', label: '逾期' }]} />
            <div className="space-y-2.5">
              {filtered.map((t) => <TenantRow key={t.id} tenant={t} theme={theme} onClick={() => setSheet({ type: 'detail', tenant: t })} />)}
              {filtered.length === 0 && <div className="text-center py-14"><p className={'text-sm ' + c.textMuted}>没有找到符合条件的租户</p></div>}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="px-5 pt-5 space-y-6">
            <div>
              <h3 className={'text-xs font-semibold uppercase tracking-wide mb-2 px-1 ' + c.textMuted}>外观</h3>
              <div className={c.cardBg + ' rounded-2xl p-4 border ' + c.border}>
                <Segmented theme={theme} value={theme} onChange={setTheme} options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} />
              </div>
            </div>
            <div>
              <h3 className={'text-xs font-semibold uppercase tracking-wide mb-2 px-1 ' + c.textMuted}>数据</h3>
              <div className={c.cardBg + ' rounded-2xl border ' + c.border + ' divide-y ' + c.border}>
                <div className="p-4 flex items-center justify-between">
                  <span className={'text-sm ' + c.textSubtle}>租户总数</span>
                  <span className={'text-sm font-semibold ' + c.text}>{totalTenants}</span>
                </div>
                <div className="p-4">
                  {confirmDeleteId === 'ALL' ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setTenants([]); setConfirmDeleteId(null); showToast('已清除所有数据'); }} className="flex-1 text-sm font-semibold text-white bg-rose-500 rounded-xl py-2.5">确认清除</button>
                      <button onClick={() => setConfirmDeleteId(null)} className={'flex-1 text-sm font-semibold ' + c.textSubtle + ' ' + c.hoverBg + ' rounded-xl py-2.5'}>取消</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId('ALL')} className="text-sm font-medium text-rose-500 flex items-center gap-2"><Trash2 size={15} /> 清除所有数据</button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <h3 className={'text-xs font-semibold uppercase tracking-wide mb-2 px-1 ' + c.textMuted}>账号</h3>
              <div className={c.cardBg + ' rounded-2xl border ' + c.border + ' p-4'}>
                {confirmLogout ? (
                  <div className="flex items-center gap-2">
                    <button onClick={handleSignOut} className="flex-1 text-sm font-semibold text-white bg-rose-500 rounded-xl py-2.5">确认退出登录</button>
                    <button onClick={() => setConfirmLogout(false)} className={'flex-1 text-sm font-semibold ' + c.textSubtle + ' ' + c.hoverBg + ' rounded-xl py-2.5'}>取消</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmLogout(true)} className="text-sm font-medium text-rose-500">退出登录</button>
                )}
              </div>
            </div>
            <p className={'text-xs text-center pt-4 ' + c.textMuted}>租户管理 · v1.3</p>
          </div>
        )}

        {(activeTab === 'home' || activeTab === 'tenants') && totalTenants > 0 && (
          <div className="fixed bottom-24 inset-x-0 z-20 pointer-events-none">
            <div className="max-w-md mx-auto relative h-0">
              <button onClick={() => setSheet({ type: 'add' })}
                className="pointer-events-auto absolute right-5 bottom-0 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform">
                <Plus size={24} />
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div className={'fixed bottom-24 left-1/2 -translate-x-1/2 z-40 ' + c.toastBg + ' ' + c.toastText + ' text-sm font-medium px-4 py-2.5 rounded-full shadow-lg'}>{toast}</div>
        )}

        <div className="fixed bottom-0 inset-x-0 z-30">
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} className={'max-w-md mx-auto ' + c.appBg + ' border-t ' + c.border + ' px-6 pt-2.5 flex items-center justify-around'}>
            {[
              { id: 'home', label: '首页', Icon: Home },
              { id: 'tenants', label: '租户', Icon: Users },
              { id: 'settings', label: '设置', Icon: SettingsIcon },
            ].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="flex flex-col items-center gap-1 px-4 py-1">
                <tab.Icon size={22} className={activeTab === tab.id ? c.accent : c.textMuted} />
                <span className={'text-xs font-medium ' + (activeTab === tab.id ? c.accent : c.textMuted)}>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {sheet && sheet.type === 'add' && (
          <Sheet title="添加租户" onClose={() => setSheet(null)} theme={theme}><TenantForm onSave={handleSaveTenant} theme={theme} /></Sheet>
        )}
        {sheet && sheet.type === 'edit' && (
          <Sheet title="编辑租户" onClose={() => setSheet(null)} theme={theme}><TenantForm initial={sheet.tenant} onSave={handleSaveTenant} theme={theme} /></Sheet>
        )}
        {sheet && sheet.type === 'detail' && (
          <Sheet title="租户详情" onClose={() => { setSheet(null); setConfirmDeleteId(null); }} theme={theme}>
            <TenantDetail
              tenant={sheet.tenant}
              theme={theme}
              onEdit={() => setSheet({ type: 'edit', tenant: sheet.tenant })}
              onDelete={() => setConfirmDeleteId(sheet.tenant.id)}
              onTogglePayment={(key) => handleTogglePayment(sheet.tenant.id, key)}
              onAddAttachment={(file, dataUrl) => handleAddAttachment(sheet.tenant.id, file, dataUrl)}
              onDeleteAttachment={(attId) => handleDeleteAttachment(sheet.tenant.id, attId)}
              confirming={confirmDeleteId === sheet.tenant.id}
              onConfirmDelete={() => handleDelete(sheet.tenant.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
            />
          </Sheet>
        )}
      </div>
    </div>
  );
}
