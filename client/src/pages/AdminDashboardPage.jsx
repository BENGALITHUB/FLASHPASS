import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { initSocket } from '../services/socket';
import ComicButton from '../components/common/ComicButton';
import ComicCard from '../components/common/ComicCard';
import ComicBadge from '../components/common/ComicBadge';
import { playSuccessChime } from '../utils/audioFeedback';
import { exportAttendeesCSV, exportAttendeesExcel, exportAttendeesPDF } from '../utils/exportAttendees';
import EventRemovalDialog from '../components/admin/EventRemovalDialog';
import './AdminDashboard.css';
import {
  LayoutDashboard, Calendar, Ticket, Shield, DollarSign, Users,
  Settings, LogOut, Search, PlusCircle, Globe, RefreshCw, AlertTriangle,
  CheckCircle2, XCircle, ArrowRight, ArrowLeft, Menu, X, Download, ShieldAlert,
  Sliders, Lock, Eye, Check, ChevronRight, Zap, BarChart3, TrendingUp, Activity, PieChart, Radio, Building2, Sparkles, ChevronDown,
  Bell, Tag, ShoppingBag, HeartHandshake, FileText, Printer, Volume2, Store, Phone, Mail, Send, MessageSquare, Trash2, ExternalLink, Clock,
  Shirt, Coffee, Car, Crown, Pencil, EyeOff, CreditCard, Key,
  Copy, IndianRupee, FileSpreadsheet, ShieldCheck
} from 'lucide-react';
import IngressVelocityChart from '../components/analytics/IngressVelocityChart';
import GateCongestionHeatmap from '../components/analytics/GateCongestionHeatmap';
import RevenueSplitDonut from '../components/analytics/RevenueSplitDonut';
import LiveScannerTicker from '../components/analytics/LiveScannerTicker';
import FraudAlertCenter from '../components/analytics/FraudAlertCenter';
import SaaSSettlementLedger, { PendingPayoutBanner } from '../components/analytics/SaaSSettlementLedger';
import EventComparisonCards from '../components/analytics/EventComparisonCards';
import OrganizerPayoutCard from '../components/analytics/OrganizerPayoutCard';
import TicketTiersManager from '../components/admin/TicketTiersManager';
import ShiftsPanel from '../components/admin/ShiftsPanel';
import { DemoPinBanner, StaffActions } from '../components/admin/StaffSecurity';

// Display metadata for every inquiry/lead type the public site can submit
const INQUIRY_META = {
  SPONSOR: {
    label: '🏆 SPONSOR', tab: '🏆 SPONSORS', topic: 'Sponsorship', icon: Building2,
    chip: 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50', border: 'border-yellow-400/50 hover:border-yellow-400',
    solid: 'bg-yellow-400 text-black'
  },
  STALL: {
    label: '🎪 STALL / EXHIBITOR', tab: '🎪 STALLS & CREATORS', topic: 'Stall Booking', icon: Store,
    chip: 'bg-accent/20 text-accent border border-accent/50', border: 'border-accent/50 hover:border-accent',
    solid: 'bg-accent text-white'
  },
  GROUP: {
    label: '👥 GROUP BOOKING', tab: '👥 GROUPS', topic: 'Group Booking', icon: Users,
    chip: 'bg-info/20 text-info border border-info/50', border: 'border-info/50 hover:border-info',
    solid: 'bg-info text-black', sizeLabel: 'Group Size'
  },
  AMBASSADOR: {
    label: '📣 AMBASSADOR', tab: '📣 AMBASSADORS', topic: 'Ambassador Program', icon: Sparkles,
    chip: 'bg-success/20 text-success border border-success/50', border: 'border-success/50 hover:border-success',
    solid: 'bg-success text-black', sizeLabel: 'Audience / Reach'
  },
  ORGANIZER: {
    label: '🚀 ORGANIZER LEAD', tab: '🚀 ORGANIZERS', topic: 'Event Hosting', icon: Calendar,
    chip: 'bg-warning/20 text-warning border border-warning/50', border: 'border-warning/50 hover:border-warning',
    solid: 'bg-warning text-black', sizeLabel: 'Expected Footfall', categoryLabel: 'Event Type'
  }
};
const inquiryMeta = (type) => INQUIRY_META[type] || INQUIRY_META.STALL;

// Merch / add-on categories offered in the admin store manager
const MERCH_CATEGORIES = {
  MERCH: { label: 'Merchandise', icon: Shirt },
  FOOD: { label: 'Food & drinks', icon: Coffee },
  PARKING: { label: 'Parking', icon: Car },
  VIP_PERK: { label: 'VIP perk', icon: Crown }
};

// KPI tile used across the overview. tone: yellow | cyan | magenta | success | warning | danger | neutral
function Kpi({ label, value, sub, tone = 'neutral', icon: Icon, badge, highlight = false, children }) {
  return (
    <div className={`adm-kpi adm-tone-${tone} ${highlight ? 'adm-kpi-highlight' : ''} relative rounded-2xl p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">
          {Icon && <Icon className="adm-kpi-icon h-3.5 w-3.5" />} {label}
        </span>
        {badge && <span className="adm-chip adm-chip-tone shrink-0">{badge}</span>}
      </div>
      <div className="adm-kpi-value mt-2.5 font-comic text-3xl sm:text-[2rem] leading-none">{value}</div>
      {sub && <div className="mt-2 font-mono text-[11px] text-text-muted truncate">{sub}</div>}
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 font-comic text-xl tracking-wide text-white">
          {Icon && <Icon className="h-4 w-4 text-primary" />} {title}
        </h3>
        {hint && <p className="mt-0.5 font-mono text-[11px] text-text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

// '2026-12-24', 3 -> ['2026-12-24', '2026-12-25', '2026-12-26'] (calendar days, no time zone shift)
const eventDatesFrom = (start, count) => Array.from({ length: count }, (_, i) => {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
});

const PICK_EVENT ='Choose an event in "Event scope" first (or press "Manage this event" on its card), then save again.';

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem('cc_staff_user') || '{}'));
  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';
  const isEventAdmin = currentUser.role === 'EVENT_ADMIN';

  // Navigation state (Sidebar)
  const [activeTab, setActiveTab] = useState('DASHBOARD'); // 'DASHBOARD' | 'EVENTS' | 'PASSES' | 'GATES' | 'LEDGER' | 'STAFF' | 'SETTINGS'
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Multi-Event Scope state (Super Admin filter or Event Admin assigned event)
  const [selectedEventScope, setSelectedEventScope] = useState(() => {
    const user = JSON.parse(localStorage.getItem('cc_staff_user') || '{}');
    if (user.role === 'EVENT_ADMIN' && user.assignedEventId) {
      return user.assignedEventId;
    }
    return 'ALL';
  });
  // The event being edited: an event admin's own, or the one the super admin picked in Event scope.
  // There is no default event, so with "All events" open, changes wait until an event is picked.
  const pickedEvent = isEventAdmin ? (currentUser.assignedEventId || null) : (selectedEventScope !== 'ALL' ? selectedEventScope : null);
  const editScope = () => {
    if (!pickedEvent) throw new Error(PICK_EVENT);
    return pickedEvent;
  };
  // The 12-second auto-refresh runs from a long-lived timer, so it reads the scope from here
  const scopeRef = useRef(selectedEventScope);
  useEffect(() => { scopeRef.current = selectedEventScope; }, [selectedEventScope]);

  // Core Data
  const [metrics, setMetrics] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [platformOverview, setPlatformOverview] = useState(null);
  const [eventsList, setEventsList] = useState([]);
  // Super Admin delete / archive / restore of one event: { event, mode }
  const [eventAction, setEventAction] = useState(null);
  const [eventsNotice, setEventsNotice] = useState('');
  const [staffUsersList, setStaffUsersList] = useState([]);
  const [securityKey, setSecurityKey] = useState(0); // re-checks the demo-PIN banner after a PIN change
  const [loading, setLoading] = useState(true);

  // Search & Pass Detail
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [attendeesChannel, setAttendeesChannel] = useState('');
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState(null);
  const [selectedPass, setSelectedPass] = useState(null);
  const [passDetail, setPassDetail] = useState(null);
  const [forceResetReason, setForceResetReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // New Event Modal state (Super Admin)
  const [newEventModal, setNewEventModal] = useState(false);
  const [newEventForm, setNewEventForm] = useState({
    name: '',
    venue: '',
    basePriceRupees: 50,
    platformFeeRupees: 2,
    capacity: 3000,
    startDate: '',
    dayCount: 3,
    adminUsername: '',
    adminName: '',
    adminPin: '',
    adminEmail: '',
    adminPhone: ''
  });
  const [newEventStatus, setNewEventStatus] = useState({ state: 'idle' }); // idle | saving | error | done
  const [showNewEventPin, setShowNewEventPin] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('kck-7-master');
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // New Staff Modal state
  const [newStaffModal, setNewStaffModal] = useState(false);
  const [newStaffForm, setNewStaffForm] = useState({
    username: '',
    name: '',
    pin: '',
    role: 'CASHIER'
  });

  // Settings & CMS Form state
  const [adminPin, setAdminPin] = useState('');
  const [settingsForm, setSettingsForm] = useState({
    eventName: '',
    venue: '',
    announcementText: 'Tickets selling fast! Online passes valid for all 3 days.',
    baseRupees: 50,
    feeRupees: 2,
    capacity: 3000,
    allowReentry: true,
    maxReentriesPerDay: 2,
    reentryMode: 'WRISTBAND',
    emergencyLockdown: false,
    onlineSalesEnabled: true,
    cashSalesEnabled: true,
    gateOpenTime: '00:00',
    gateCloseTime: '23:59',
    cardDisplay: {
      showDays: true,
      showDailyCap: false,
      showTiers: false,
      customFields: []
    },
    cardTemplate: {
      layout: 'standard',
      templateName: '',
      logoUrl: '',
      watermarkUrl: '',
      tagline: [],
      colors: { ink: '#0A0A0A', orange: '#FF7A1A', burst: '#F2FF00', button: '#FFC21A', red: '#E10600' }
    }
  });

  // Advanced Event Settings & Live Entities
  const [ticketTiers, setTicketTiers] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [addOns, setAddOns] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [zones, setZones] = useState([]);
  const [liveAnnouncements, setLiveAnnouncements] = useState([]);
  const [emergencyEvacuation, setEmergencyEvacuation] = useState({ active: false, message: '' });

  // Multi-Tenant Payment Gateway Form State (Top 5 Gateways)
  const [paymentGatewayForm, setPaymentGatewayForm] = useState({
    enabled: true,
    provider: 'PAYU',
    usePlatformDefault: true,
    merchantKey: '',
    merchantSalt: '',
    razorpayKeyId: '',
    razorpayKeySecret: '',
    cashfreeAppId: '',
    cashfreeSecretKey: '',
    phonepeMerchantId: '',
    phonepeSaltKey: '',
    phonepeSaltIndex: '1',
    stripePublishableKey: '',
    stripeSecretKey: '',
    env: 'TEST'
  });
  const [showGatewaySalt, setShowGatewaySalt] = useState(false);
  const [exportFullPhone, setExportFullPhone] = useState(false);
  const [paymentGatewayStatus, setPaymentGatewayStatus] = useState({ ready: true, providerAvailable: true, savedSecrets: {}, platformPayUEnv: 'TEST' });
  const secretPlaceholder = (field, example) => (paymentGatewayStatus.savedSecrets?.[field] ? 'Saved. Leave blank to keep it' : example);

  // Settings Sub-tab state
  const [settingsSubTab, setSettingsSubTab] = useState('CMS'); // 'CMS' | 'TIERS' | 'COUPONS' | 'MERCH' | 'AFFILIATES' | 'ANNOUNCEMENTS' | 'PAYMENT' | 'EVACUATION'

  // Helpdesk State
  const [helpdeskQuery, setHelpdeskQuery] = useState('');
  const [helpdeskResults, setHelpdeskResults] = useState([]);
  const [helpdeskLoading, setHelpdeskLoading] = useState(false);
  const [reissuedPassData, setReissuedPassData] = useState(null);

  // New Coupon Form
  const [newCouponForm, setNewCouponForm] = useState({
    code: '',
    discountType: 'PERCENT',
    discountValue: 20,
    maxUses: 100
  });

  // New Add-On / Merch Form
  // Inline edit draft for one merch item: { addOnId, name, priceRupees, inventory }
  const [merchEdit, setMerchEdit] = useState(null);
  const [newAddOnForm, setNewAddOnForm] = useState({
    name: '',
    priceRupees: 299,
    category: 'MERCH',
    description: '',
    variants: 'S, M, L, XL, XXL',
    inventory: 300
  });

  // Live Announcement Form
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    message: '',
    priority: 'HIGH',
    targetAudience: 'ALL_PASSES'
  });

  // Executive Audit Report Modal
  const [executiveReportModal, setExecutiveReportModal] = useState(false);
  const [executiveReportData, setExecutiveReportData] = useState(null);
  const [executiveReportLoading, setExecutiveReportLoading] = useState(false);

  // Inquiries & Partnerships State
  const [inquiriesList, setInquiriesList] = useState([]);
  const [inquiryStats, setInquiryStats] = useState({ total: 0, unread: 0, sponsors: 0, stalls: 0, new: 0 });
  // Platform commission on closed sponsor/stall deals (rate + receivables for the current scope)
  const [commissionStats, setCommissionStats] = useState({ ratePct: 10, duePaise: 0, paidPaise: 0, closedDeals: 0, dealValuePaise: 0 });
  const [commissionRateInput, setCommissionRateInput] = useState('');
  const [unreadInquiriesCount, setUnreadInquiriesCount] = useState(0);
  const [inquirySubTab, setInquirySubTab] = useState('ALL'); // 'ALL' | 'SPONSOR' | 'STALL'
  const [inquiryStatusFilter, setInquiryStatusFilter] = useState('ALL'); // 'ALL' | 'NEW' | 'CONTACTED' | 'ACCEPTED' | 'REJECTED'
  const [inquiryNoteInput, setInquiryNoteInput] = useState({});
  const [inquirySavingId, setInquirySavingId] = useState(null);
  const [inquiryToast, setInquiryToast] = useState(null);

  useEffect(() => {
    document.title = 'Admin Dashboard — FlashPass';
    // The session itself lives in an HttpOnly cookie; the API sends us back to
    // /staff if it has ended. This only stops the wrong role opening the page.
    const user = JSON.parse(localStorage.getItem('cc_staff_user') || '{}');
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'EVENT_ADMIN') {
      navigate('/staff');
      return;
    }
    setCurrentUser(user);

    loadAllData();

    // Socket listener for live metrics
    const socket = initSocket();
    socket.on('admin:metrics', (data) => {
      setMetrics(data);
    });

    // Socket listener for real-time incoming inquiries (Sponsors & Stalls)
    socket.on('admin:new_inquiry', (newInq) => {
      // Event isolation check: Super Admin gets all; Event Admin only gets assigned event
      if (user.role === 'SUPER_ADMIN' || user.assignedEventId === newInq.eventId) {
        setInquiriesList(prev => [newInq, ...prev.filter(i => i._id !== newInq._id && i.inquiryId !== newInq.inquiryId)]);
        setUnreadInquiriesCount(prev => prev + 1);
        setInquiryStats(prev => ({
          ...prev,
          total: prev.total + 1,
          unread: prev.unread + 1,
          new: prev.new + 1,
          sponsors: newInq.type === 'SPONSOR' ? prev.sponsors + 1 : prev.sponsors,
          stalls: newInq.type === 'STALL' ? prev.stalls + 1 : prev.stalls
        }));
        setInquiryToast({
          id: newInq.inquiryId,
          brand: newInq.brandName,
          type: newInq.type,
          eventName: newInq.eventName,
          contact: newInq.contactPerson,
          phone: newInq.phone,
          time: new Date().toLocaleTimeString()
        });
        playSuccessChime();
        setTimeout(() => setInquiryToast(null), 8000);
      }
    });

    // Live numbers only: never overwrite settings the admin may be typing into
    const interval = setInterval(() => loadAllData(scopeRef.current, { keepForms: true }), 12000);
    return () => clearInterval(interval);
  }, [navigate]);

  // keepForms: background refresh. It updates live figures and lists but leaves the
  // editable settings and payment forms alone so unsaved typing is not lost.
  const loadAllData = async (scope = selectedEventScope, { keepForms = false } = {}) => {
    try {
      const user = JSON.parse(localStorage.getItem('cc_staff_user') || '{}');
      const effectiveScope = user.role === 'EVENT_ADMIN' ? (user.assignedEventId || '__no-event__') : scope;
      const data = await api.adminMetrics(effectiveScope);
      setMetrics(data);

      const analytics = await api.adminGetAnalytics(effectiveScope).catch(() => null);
      setAnalyticsData(analytics);
      if (data.settings) {
        if (!keepForms) setSettingsForm({
          eventName: data.settings.eventName || '',
          venue: data.settings.venue || '',
          startDate: data.settings.eventDays?.[0]?.date || '',
          dayCount: data.settings.eventDays?.length || 3,
          announcementText: data.settings.announcementText || '',
          baseRupees: (data.settings.basePricePaise || 5000) / 100,
          feeRupees: (data.settings.platformFeePaise || 200) / 100,
          capacity: data.settings.capacityLimit || 3000,
          allowReentry: data.settings.allowReentry !== false,
          maxReentriesPerDay: data.settings.maxReentriesPerDay ?? 2,
          reentryMode: data.settings.reentryMode || 'WRISTBAND',
          emergencyLockdown: Boolean(data.settings.emergencyLockdown),
          onlineSalesEnabled: data.settings.onlineSalesEnabled !== false,
          cashSalesEnabled: data.settings.cashSalesEnabled !== false,
          gateOpenTime: data.settings.gateOpenTime || '00:00',
          gateCloseTime: data.settings.gateCloseTime || '23:59',
          cardDisplay: data.settings.cardDisplay || {
            showDays: true,
            showDailyCap: false,
            showTiers: false,
            customFields: []
          },
          cardTemplate: data.settings.cardTemplate || {
            layout: cfgEventId === 'kolkata-comics-karnival-7-0' ? 'kolkata-dusk' : 'standard',
            templateName: '',
            logoUrl: '',
            watermarkUrl: '',
            tagline: cfgEventId === 'kolkata-comics-karnival-7-0' ? ['Comics', 'Gaming', 'Collectibles', 'Cosplay'] : [],
            colors: { ink: '#0A0A0A', orange: '#FF7A1A', burst: '#F2FF00', button: '#FFC21A', red: '#E10600' }
          }
        });

        if (Array.isArray(data.settings.ticketTiers)) setTicketTiers(data.settings.ticketTiers);
        if (Array.isArray(data.settings.coupons)) setCoupons(data.settings.coupons);
        if (Array.isArray(data.settings.addOns)) setAddOns(data.settings.addOns);
        if (Array.isArray(data.settings.affiliates)) setAffiliates(data.settings.affiliates);
        if (Array.isArray(data.settings.zones)) setZones(data.settings.zones);
        if (Array.isArray(data.settings.liveAnnouncements)) setLiveAnnouncements(data.settings.liveAnnouncements);
        if (data.settings.emergencyEvacuation) setEmergencyEvacuation(data.settings.emergencyEvacuation);
        if (data.settings.paymentGateway) {
          const pg = data.settings.paymentGateway;
          // Status always refreshes; the server never sends secrets, only whether one is saved
          setPaymentGatewayStatus({
            ready: pg.ready !== false,
            providerAvailable: pg.providerAvailable !== false,
            savedSecrets: pg.savedSecrets || {},
            platformPayUEnv: pg.platformPayUEnv || 'TEST'
          });
          if (!keepForms) {
            setPaymentGatewayForm({
              enabled: pg.enabled !== false,
              provider: pg.provider || 'PAYU',
              usePlatformDefault: pg.usePlatformDefault !== false,
              merchantKey: pg.merchantKey || '',
              merchantSalt: '',
              razorpayKeyId: pg.razorpayKeyId || '',
              razorpayKeySecret: '',
              cashfreeAppId: pg.cashfreeAppId || '',
              cashfreeSecretKey: '',
              phonepeMerchantId: pg.phonepeMerchantId || '',
              phonepeSaltKey: '',
              phonepeSaltIndex: pg.phonepeSaltIndex || '1',
              stripePublishableKey: pg.stripePublishableKey || '',
              stripeSecretKey: '',
              env: pg.env || 'TEST'
            });
          }
        }
      }

      const users = await api.adminGetUsers().catch(() => []);
      setStaffUsersList(users);

      const events = await api.adminListEvents().catch(() => []);
      setEventsList(events);

      if (user.role === 'SUPER_ADMIN') {
        const [overview, tpls] = await Promise.all([
          api.adminGetPlatformOverview().catch(() => null),
          api.adminGetTemplates().catch(() => ({ templates: [] }))
        ]);
        setPlatformOverview(overview);
        setSavedTemplates(tpls?.templates || []);
      }

      // Load Inquiries strictly respecting effective event scope
      try {
        const inqParams = effectiveScope && effectiveScope !== 'ALL' ? { eventId: effectiveScope } : {};
        const inqRes = await api.adminGetInquiries(inqParams);
        setInquiriesList(inqRes.inquiries || []);
        setInquiryStats(inqRes.stats || { total: 0, unread: 0, sponsors: 0, stalls: 0, new: 0 });
        setUnreadInquiriesCount(inqRes.stats?.unread || 0);
        if (inqRes.commission) setCommissionStats(inqRes.commission);
      } catch (err) {
        console.error('Failed to load inquiries', err);
      }
    } catch (e) {
      console.error('Data load error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleEventScopeChange = (newEventId) => {
    setSelectedEventScope(newEventId);
    loadAllData(newEventId);
  };

  const loadAttendees = async (scopeOverride, qOverride, channelOverride) => {
    setAttendeesLoading(true);
    try {
      const effectiveScope = isEventAdmin
        ? (currentUser?.assignedEventId || '__no-event__')
        : (scopeOverride !== undefined ? scopeOverride : (selectedEventScope || 'ALL'));
      const res = await api.adminGetAttendees({
        eventId: effectiveScope,
        q: qOverride !== undefined ? qOverride : searchQuery,
        channel: channelOverride !== undefined ? channelOverride : attendeesChannel
      });
      setSearchResults(res.attendees || []);
    } catch (e) {}
    finally {
      setAttendeesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'PASSES' && currentUser?.role) {
      loadAttendees();
    }
  }, [activeTab, selectedEventScope, currentUser?.role]);

  const handleSearch = async (e) => {
    e?.preventDefault();
    await loadAttendees();
  };

  const openPassDetail = async (pass) => {
    setSelectedPass(pass);
    try {
      const data = await api.adminGetPassDetail(pass._id);
      setPassDetail(data);
    } catch (e) {}
  };

  const handleForceReset = async () => {
    if (!forceResetReason.trim()) {
      alert('A valid reason is required to force-reset presence');
      return;
    }
    setActionLoading(true);
    try {
      await api.adminForceReset(selectedPass._id, forceResetReason);
      alert(`Pass ${selectedPass.orderId} force-reset to OUTSIDE.`);
      setForceResetReason('');
      openPassDetail(selectedPass);
      loadAllData();
    } catch (err) {
      alert(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVoidPass = async () => {
    const reason = prompt('Enter reason for voiding this pass:');
    if (!reason) return;
    try {
      await api.adminVoidPass(selectedPass._id, reason);
      alert(`Pass ${selectedPass.orderId} voided.`);
      openPassDetail(selectedPass);
      loadAllData();
    } catch (err) {
      alert(err.message || 'Void failed');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (adminPin.length !== 6) {
      alert('Enter your 6-digit PIN to confirm changes.');
      return;
    }

    try {
      const effectiveScope = editScope();
      await api.adminUpdateSettings({
        eventId: effectiveScope,
        eventName: settingsForm.eventName,
        venue: settingsForm.venue,
        ...(settingsForm.startDate ? { eventDates: eventDatesFrom(settingsForm.startDate, settingsForm.dayCount || 3) } : {}),
        announcementText: settingsForm.announcementText,
        basePricePaise: Math.round(settingsForm.baseRupees * 100),
        platformFeePaise: Math.round(settingsForm.feeRupees * 100),
        capacityLimit: Number(settingsForm.capacity),
        allowReentry: Boolean(settingsForm.allowReentry),
        maxReentriesPerDay: Number(settingsForm.maxReentriesPerDay),
        reentryMode: settingsForm.reentryMode,
        emergencyLockdown: Boolean(settingsForm.emergencyLockdown),
        onlineSalesEnabled: Boolean(settingsForm.onlineSalesEnabled),
        cashSalesEnabled: Boolean(settingsForm.cashSalesEnabled),
        gateOpenTime: settingsForm.gateOpenTime,
        gateCloseTime: settingsForm.gateCloseTime,
        cardDisplay: settingsForm.cardDisplay,
        cardTemplate: settingsForm.cardTemplate
      }, adminPin);

      alert('Event settings & CMS updated successfully!');
      setAdminPin('');
      loadAllData();
    } catch (err) {
      alert(err.message || 'Update failed');
    }
  };

  // Called by TicketTiersManager; it shows its own errors and success message
  const handleSaveTiers = async (tiers, pin) => {
    const effectiveScope = editScope();
    await api.adminUpdateSettings({ ticketTiers: tiers, eventId: effectiveScope }, pin);
    await loadAllData();
  };

  const handleSavePaymentGateway = async (e) => {
    e?.preventDefault?.();
    if (adminPin.length !== 6) {
      alert('Please enter your 6-digit Admin PIN in the PIN field to authorize.');
      return;
    }
    try {
      const effectiveScope = editScope();
      await api.adminUpdateSettings({
        paymentGateway: paymentGatewayForm,
        eventId: effectiveScope
      }, adminPin);
      alert(`Payment gateway settings saved for event "${effectiveScope}".`);
      setAdminPin('');
      loadAllData();
    } catch (err) {
      alert(err.message || 'Failed to update payment gateway settings');
    }
  };

  const handleAddCoupon = async (e) => {
    e.preventDefault();
    if (!newCouponForm.code.trim()) return;
    if (adminPin.length !== 6) {
      alert('Enter 6-digit PIN in the PIN field below to authorize.');
      return;
    }
    const cleanCode = newCouponForm.code.trim().toUpperCase();
    const updatedCoupons = [
      ...coupons.filter(c => c.code !== cleanCode),
      {
        code: cleanCode,
        discountType: newCouponForm.discountType,
        // FLAT is stored in paise (what the server subtracts); the form takes rupees
        discountValue: newCouponForm.discountType === 'FLAT'
          ? Math.round(Number(newCouponForm.discountValue) * 100)
          : Number(newCouponForm.discountValue),
        maxUses: Number(newCouponForm.maxUses) || 100,
        usedCount: 0,
        active: true
      }
    ];
    try {
      const effectiveScope = editScope();
      await api.adminUpdateSettings({
        coupons: updatedCoupons,
        eventId: effectiveScope
      }, adminPin);
      alert(`Promo Code ${cleanCode} created and activated!`);
      setNewCouponForm({ code: '', discountType: 'PERCENT', discountValue: 20, maxUses: 100 });
      setAdminPin('');
      loadAllData();
    } catch (err) {
      alert(err.message || 'Failed to create promo code');
    }
  };

  const handleAddAddOn = async (e) => {
    e.preventDefault();
    if (!newAddOnForm.name.trim()) return;
    if (adminPin.length !== 6) {
      alert('Enter 6-digit PIN in the PIN field below to authorize.');
      return;
    }

    try {
      const effectiveScope = editScope();
      const addOnId = `${effectiveScope}-addon-${Date.now().toString(36)}`;
      const variantsArr = newAddOnForm.category === 'MERCH' && newAddOnForm.variants.trim()
        ? newAddOnForm.variants.split(',').map(v => v.trim()).filter(Boolean)
        : [];

      const newItem = {
        addOnId,
        name: newAddOnForm.name.trim(),
        pricePaise: Math.round(Number(newAddOnForm.priceRupees) * 100),
        category: newAddOnForm.category,
        description: newAddOnForm.description.trim() || `Official ${newAddOnForm.name.trim()}`,
        inventory: Number(newAddOnForm.inventory || 300),
        variants: variantsArr,
        active: true
      };

      const updatedAddOns = [...addOns, newItem];
      await api.adminUpdateSettings({
        addOns: updatedAddOns,
        eventId: effectiveScope
      }, adminPin);

      alert(`Added "${newItem.name}" to ${effectiveScope}! Changes reflect on checkout immediately.`);
      setNewAddOnForm({ name: '', priceRupees: 299, category: 'MERCH', description: '', variants: 'S, M, L, XL, XXL', inventory: 300 });
      setAdminPin('');
      loadAllData();
    } catch (err) {
      alert(err.message || 'Failed to add merch item');
    }
  };

  const handleDeleteAddOn = async (addOnId) => {
    if (!confirm('Remove this add-on from this event?')) return;
    if (adminPin.length !== 6) {
      alert('Enter 6-digit PIN in the PIN field below to authorize.');
      return;
    }

    try {
      const effectiveScope = editScope();
      const updatedAddOns = addOns.filter(a => a.addOnId !== addOnId);
      await api.adminUpdateSettings({
        addOns: updatedAddOns,
        eventId: effectiveScope
      }, adminPin);
      alert('Add-on removed successfully');
      setAdminPin('');
      loadAllData();
    } catch (err) {
      alert(err.message || 'Failed to delete add-on');
    }
  };

  // Patch one merch item (price / stock / name / visibility) — same PIN-guarded settings write as add/delete
  const handleUpdateAddOn = async (addOnId, patch) => {
    if (adminPin.length !== 6) {
      alert('Enter 6-digit PIN in the PIN field below to authorize.');
      return false;
    }
    try {
      const effectiveScope = editScope();
      const updatedAddOns = addOns.map(a => (a.addOnId === addOnId ? { ...a, ...patch } : a));
      await api.adminUpdateSettings({ addOns: updatedAddOns, eventId: effectiveScope }, adminPin);
      setAdminPin('');
      loadAllData();
      return true;
    } catch (err) {
      alert(err.message || 'Failed to update merch item');
      return false;
    }
  };

  const handleTriggerEvacuation = async (active) => {
    const effectiveScope = pickedEvent;
    if (!effectiveScope) { alert(PICK_EVENT); return; }
    const msg = active
      ? prompt('Enter Emergency Evacuation broadcast message for all gates & attendee passes:', 'EMERGENCY EVACUATION ACTIVE: Please proceed calmly to the nearest exit.')
      : null;
    if (active && msg === null) return;

    try {
      const res = await api.adminTriggerEmergencyEvacuation({
        active,
        message: msg || undefined,
        eventId: effectiveScope
      });
      setEmergencyEvacuation(res.emergencyEvacuation);
      alert(active ? '🚨 EMERGENCY EVACUATION BROADCAST ACTIVATED! Red siren alert sent to all gate scanners & digital passes.' : '✅ Emergency Evacuation stood down. Gates restored to normal.');
      loadAllData();
    } catch (err) {
      alert(err.message || 'Failed to trigger emergency evacuation');
    }
  };

  const handlePostAnnouncement = async (e) => {
    e.preventDefault();
    if (!announcementForm.message.trim()) return;
    const effectiveScope = pickedEvent;
    if (!effectiveScope) { alert(PICK_EVENT); return; }
    try {
      await api.adminPostAnnouncement({
        title: announcementForm.title || 'Live Notice',
        message: announcementForm.message,
        priority: announcementForm.priority,
        targetAudience: announcementForm.targetAudience,
        eventId: effectiveScope
      });
      alert('📢 Live Notice pushed to all attendee pass screens via real-time WebSocket!');
      setAnnouncementForm({ title: '', message: '', priority: 'HIGH', targetAudience: 'ALL_PASSES' });
      loadAllData();
    } catch (err) {
      alert(err.message || 'Failed to post announcement');
    }
  };

  const handleHelpdeskSearch = async (e) => {
    e?.preventDefault();
    if (!helpdeskQuery.trim()) return;
    setHelpdeskLoading(true);
    try {
      const effectiveScope = pickedEvent;
      const res = await api.helpdeskSearch(helpdeskQuery.trim(), effectiveScope);
      setHelpdeskResults(res);
    } catch (err) {
      alert(err.message || 'Helpdesk search error');
    } finally {
      setHelpdeskLoading(false);
    }
  };

  const handleHelpdeskReissue = async (pass) => {
    const reason = prompt(`Reissue Pass for ${pass.holderName}?\nOld QR token will be permanently INVALIDATED at all gates.\nEnter reason (e.g. Lost Phone / Dead Battery):`);
    if (!reason) return;
    try {
      const res = await api.helpdeskReissue(pass.passId || pass._id, reason);
      setReissuedPassData(res.pass);
      alert(`Pass REISSUED!\nNew Order ID: ${res.pass.orderId}\nOld QR Nonce invalidated.`);
      handleHelpdeskSearch();
    } catch (err) {
      alert(err.message || 'Failed to reissue pass');
    }
  };

  const handleOpenExecutiveReport = async () => {
    setExecutiveReportLoading(true);
    setExecutiveReportModal(true);
    try {
      const effectiveScope = editScope();
      const rep = await api.adminGetExecutiveReport(effectiveScope);
      setExecutiveReportData(rep);
    } catch (err) {
      alert(err.message || 'Failed to generate report');
    } finally {
      setExecutiveReportLoading(false);
    }
  };

  const emptyNewEventForm = {
    name: '',
    venue: '',
    basePriceRupees: 50,
    platformFeeRupees: 2,
    capacity: 3000,
    adminUsername: '',
    adminName: '',
    adminPin: '',
    adminEmail: '',
    adminPhone: ''
  };

  const closeNewEventModal = () => {
    setNewEventModal(false);
    setNewEventStatus({ state: 'idle' });
    setShowNewEventPin(false);
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!newEventForm.name || !newEventForm.venue || !newEventForm.adminUsername || newEventForm.adminPin.length !== 6) {
      setNewEventStatus({ state: 'error', message: 'Event name, venue, admin username and a 6-digit PIN are required.' });
      return;
    }

    setNewEventStatus({ state: 'saving' });
    try {
      const { startDate, dayCount, ...eventFields } = newEventForm;
      const chosenTpl = savedTemplates.find(t => t.templateId === selectedTemplateId);
      const tplPayload = chosenTpl ? {
        cardTemplate: {
          layout: chosenTpl.layout || 'kolkata-dusk',
          templateName: chosenTpl.name,
          logoUrl: chosenTpl.logoUrl || '',
          watermarkUrl: chosenTpl.watermarkUrl || '',
          tagline: chosenTpl.tagline || [],
          colors: chosenTpl.colors || {}
        },
        cardDisplay: chosenTpl.cardDisplay || { showDays: true, showDailyCap: false, showTiers: false, customFields: [] },
        ...(chosenTpl.announcementText ? { announcementText: chosenTpl.announcementText } : {})
      } : {};
      const res = await api.adminCreateEvent({ ...eventFields, ...tplPayload, ...(startDate ? { eventDates: eventDatesFrom(startDate, dayCount || 3) } : {}) });
      // Show the credentials once inside the modal so they can be handed to the client
      setNewEventStatus({
        state: 'done',
        eventName: res.event.name,
        eventId: res.event.eventId,
        username: res.eventAdmin.username,
        pin: newEventForm.adminPin
      });
      setNewEventForm(emptyNewEventForm);
      loadAllData();
    } catch (err) {
      setNewEventStatus({ state: 'error', message: err.message || 'Failed to create event' });
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!newStaffForm.username || !newStaffForm.name || newStaffForm.pin.length !== 6) {
      alert('Username, Name, and 6-digit PIN are required!');
      return;
    }

    const assignedEventId = isSuperAdmin ? (newStaffForm.assignedEventId || pickedEvent || '') : undefined;
    if (isSuperAdmin && !assignedEventId) {
      alert('Choose the event this staff member works for.');
      return;
    }
    try {
      await api.adminCreateUser({ ...newStaffForm, assignedEventId });
      alert(`Staff "${newStaffForm.username}" (${newStaffForm.role}) created successfully!`);
      setNewStaffModal(false);
      setNewStaffForm({ username: '', name: '', pin: '', role: 'CASHIER' });
      loadAllData();
    } catch (err) {
      alert(err.message || 'Failed to create staff');
    }
  };

  const handleExport = (type, { fullPhone = false } = {}) => {
    // The session cookie goes with the request; no token in the URL.
    // Phones are masked unless full numbers are asked for (the server logs that).
    const params = new URLSearchParams();
    if (!isEventAdmin && selectedEventScope && selectedEventScope !== 'ALL') params.set('eventId', selectedEventScope);
    if (fullPhone) params.set('includeFullPhone', '1');
    const qs = params.toString();
    window.open(`/api/v1/admin/export/${type}${qs ? `?${qs}` : ''}`, '_blank');
  };

  // Inquiry & Partnership Actions
  const handleUpdateInquiryStatus = async (inquiry, newStatus) => {
    const payload = { status: newStatus };

    // Closing a sponsor/stall deal records the platform commission, so the final deal value is required
    if (newStatus === 'ACCEPTED' && ['SPONSOR', 'STALL'].includes(inquiry.type)) {
      const entered = prompt(
        `Final deal amount for ${inquiry.brandName} (₹)?\n\nFlashPass commission: ${commissionStats.ratePct}% of this amount, payable to the platform.`,
        ''
      );
      if (entered === null) return;
      const amount = Number(String(entered).replace(/[^\d.]/g, ''));
      if (!(amount > 0)) {
        alert('Please enter a valid deal amount in rupees.');
        return;
      }
      payload.dealAmountRupees = amount;
    }

    try {
      const res = await api.adminUpdateInquiryStatus(inquiry._id, payload);
      setInquiriesList(prev => prev.map(item => item._id === inquiry._id ? res.inquiry : item));
      if (res.inquiry.isRead) {
        setUnreadInquiriesCount(prev => Math.max(0, prev - 1));
      }
      if (res.inquiry.commissionStatus !== inquiry.commissionStatus || payload.dealAmountRupees) {
        loadAllData();
      }
    } catch (err) {
      alert(err.message || 'Failed to update inquiry status');
    }
  };

  const handleMarkCommissionPaid = async (inquiry) => {
    const amount = ((inquiry.commissionPaise || 0) / 100).toLocaleString('en-IN');
    if (!confirm(`Confirm you have received ₹${amount} commission for ${inquiry.brandName}?`)) return;
    try {
      const res = await api.adminMarkCommissionPaid(inquiry._id);
      setInquiriesList(prev => prev.map(item => item._id === inquiry._id ? res.inquiry : item));
      loadAllData();
    } catch (err) {
      alert(err.message || 'Failed to mark commission as paid');
    }
  };

  const handleSaveCommissionRate = async () => {
    const pct = Number(commissionRateInput);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      alert('Commission must be between 0 and 100%');
      return;
    }
    if (adminPin.length !== 6) {
      alert('Enter your 6-digit Admin PIN to change the commission rate.');
      return;
    }
    try {
      await api.adminSetCommissionRate(pct, adminPin);
      setAdminPin('');
      setCommissionRateInput('');
      loadAllData();
      alert(`Commission set to ${pct}% — applies to deals accepted from now on.`);
    } catch (err) {
      alert(err.message || 'Failed to update commission rate');
    }
  };

  const handleSaveInquiryNote = async (inquiryId) => {
    const note = inquiryNoteInput[inquiryId];
    if (note === undefined) return;
    setInquirySavingId(inquiryId);
    try {
      const res = await api.adminUpdateInquiryStatus(inquiryId, { adminNotes: note });
      setInquiriesList(prev => prev.map(item => item._id === inquiryId ? res.inquiry : item));
      alert('Internal admin note saved!');
    } catch (err) {
      alert(err.message || 'Failed to save note');
    } finally {
      setInquirySavingId(null);
    }
  };

  const handleDeleteInquiry = async (inquiryId) => {
    if (!confirm('Are you sure you want to permanently delete this inquiry?')) return;
    try {
      await api.adminDeleteInquiry(inquiryId);
      setInquiriesList(prev => prev.filter(i => i._id !== inquiryId));
      setInquiryStats(prev => ({
        ...prev,
        total: Math.max(0, prev.total - 1)
      }));
    } catch (err) {
      alert(err.message || 'Failed to delete inquiry');
    }
  };

  const handleMarkAllInquiriesRead = async () => {
    const user = JSON.parse(localStorage.getItem('cc_staff_user') || '{}');
    const effectiveScope = user.role === 'EVENT_ADMIN' ? (user.assignedEventId || '__no-event__') : selectedEventScope;
    try {
      await api.adminMarkInquiriesRead(effectiveScope !== 'ALL' ? effectiveScope : undefined);
      setInquiriesList(prev => prev.map(i => ({ ...i, isRead: true })));
      setUnreadInquiriesCount(0);
      setInquiryStats(prev => ({ ...prev, unread: 0 }));
    } catch (err) {
      alert(err.message || 'Failed to mark all as read');
    }
  };

  const footfall = metrics?.footfall || null;
  // In hand-stamp mode nobody is scanned out, so "inside now" can't be known;
  // the crowd number is how many came in today (an upper bound on who is inside).
  const stampMode = footfall?.reentryMode === 'WRISTBAND';
  const todayFootfall = metrics?.attendance?.todayFootfall || 0;
  const insideNow = stampMode ? todayFootfall : (metrics?.attendance?.insideNow || 0);
  const crowdWord = stampMode ? 'came today' : 'inside';
  const capacity = metrics?.attendance?.capacityLimit || 3000;
  const capacityPct = Math.round((insideNow / capacity) * 100);
  const capacityTone = capacityPct > 90 ? 'danger' : capacityPct > 75 ? 'warning' : 'cyan';

  // Sidebar navigation menu items
  const menuItems = [
    { id: 'DASHBOARD', group: 'Monitor', label: isEventAdmin ? 'Overview & Payouts' : 'Overview', icon: LayoutDashboard, badge: null },
    { id: 'ANALYTICS', group: 'Monitor', label: 'Live Charts & Radar', icon: BarChart3, badge: 'LIVE', live: true },
    ...(isSuperAdmin ? [{ id: 'EVENTS', group: 'Sell', label: 'Events SaaS', icon: Calendar, badge: eventsList.length }] : []),
    { id: 'PASSES', group: 'Sell', label: 'Passes & Attendees', icon: Ticket, badge: null },
    { id: 'LEDGER', group: 'Sell', label: isEventAdmin ? 'Earnings & Settlement' : 'Financial Ledger', icon: DollarSign, badge: `₹${isEventAdmin ? (metrics?.ledger?.organizerRupees || '0') : (metrics?.ledger?.grossRupees || '0')}` },
    { id: 'INQUIRIES', group: 'Sell', label: 'Sponsors & Stalls', icon: Building2, badge: unreadInquiriesCount ? `${unreadInquiriesCount} new` : null, alert: unreadInquiriesCount > 0 },
    { id: 'GATES', group: 'Operate', label: 'Gate Ingress & Safety', icon: Shield, badge: `${insideNow} in` },
    { id: 'HELPDESK', group: 'Operate', label: 'Helpdesk & Lost Phone', icon: Sparkles, badge: 'KIOSK' },
    { id: 'STAFF', group: 'Operate', label: isEventAdmin ? 'Event Staff & POS' : 'Staff Accounts', icon: Users, badge: staffUsersList.length },
    { id: 'SETTINGS', group: 'Configure', label: isEventAdmin ? 'Event CMS & Gate Rules' : 'Event CMS & Policies', icon: Settings, badge: null }
  ];
  const menuGroups = ['Monitor', 'Sell', 'Operate', 'Configure'];

  return (
    <div className="admin-shell min-h-screen text-text flex overflow-hidden font-sans">
      {/* 1. SIDEBAR — fixed header/footer, scrolling menu */}
      <aside id="admin-navigation" className={`adm-sidebar fixed inset-y-0 left-0 z-[60] w-72 max-w-[85vw] shrink-0 h-dvh flex flex-col transition-transform duration-300 motion-reduce:transition-none xl:static xl:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="adm-sidebar-glow pointer-events-none absolute inset-x-0 top-0 h-56" aria-hidden="true" />
        <span className="adm-sidebar-edge pointer-events-none absolute inset-y-0 right-0 w-px" aria-hidden="true" />

        {/* Brand */}
        <div className="relative z-10 shrink-0 px-5 pt-5 pb-4 flex items-center justify-between">
          <button type="button" className="flex items-center gap-3 group text-left" onClick={() => setActiveTab('DASHBOARD')} aria-label="Go to overview">
            <span className="adm-icon-tile adm-icon-tile-yellow h-11 w-11 rounded-2xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
              <Zap className="h-6 w-6 fill-black" />
            </span>
            <span>
              <span className="flex items-center gap-2">
                <span className="font-comic text-2xl tracking-wider leading-none text-white">FLASH<span className="text-primary">PASS</span></span>
              </span>
              <span className={`adm-role-pill mt-1.5 inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] ${isSuperAdmin ? 'adm-role-pill-magenta' : 'adm-role-pill-cyan'}`}>
                {isEventAdmin ? 'Organizer HQ' : 'Admin console'}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close admin navigation"
            className="xl:hidden adm-icon-btn shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close admin navigation"
            className="adm-icon-btn xl:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile + scope */}
        <div className="relative z-10 shrink-0 px-3.5 pb-3">
          <div className="adm-profile rounded-2xl p-px">
            <div className="adm-profile-inner rounded-[15px] p-3.5">
              <div className="flex items-center gap-3">
                <span className="adm-avatar relative h-11 w-11 shrink-0 rounded-full p-[2px]">
                  <span className="flex h-full w-full items-center justify-center rounded-full bg-[#0b0b14] font-comic text-lg tracking-wide text-white">
                    {(currentUser.username || 'admin').slice(0, 2).toUpperCase()}
                  </span>
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#11111d] bg-success" aria-label="Online" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">@{currentUser.username || 'admin'}</span>
                  <span className={`mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider ${isSuperAdmin ? 'text-accent' : 'text-info'}`}>
                    {isSuperAdmin ? <Crown className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                    {isSuperAdmin ? 'Super admin' : 'Event organizer'}
                  </span>
                </div>
              </div>

              {isEventAdmin ? (
                <div className="mt-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-comic text-base text-white">{metrics?.settings?.eventName || 'All events'}</span>
                    <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] font-bold uppercase text-success"><span className="h-1.5 w-1.5 rounded-full bg-success motion-safe:animate-pulse" /> Live</span>
                  </div>
                  <div className={`adm-tone-${capacityTone} mt-2`}>
                    <div className="adm-meter h-1.5 overflow-hidden rounded-full">
                      <div className="adm-meter-fill h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(Math.min(capacityPct, 100), 2)}%` }} />
                    </div>
                    <div className="mt-1.5 flex justify-between font-mono text-[10px] text-text-muted">
                      <span><strong className="text-white">{insideNow}</strong> {crowdWord}</span>
                      <span>cap {capacity}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="sidebar-scope" className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-text-muted">
                      <Building2 className="w-3 h-3 text-primary" /> Event scope
                    </label>
                    {selectedEventScope !== 'ALL' && (
                      <button onClick={() => handleEventScopeChange('ALL')} className="font-mono text-[9px] text-info hover:underline">
                        Show all
                      </button>
                    )}
                  </div>
                  <select
                    id="sidebar-scope"
                    value={selectedEventScope}
                    onChange={(e) => handleEventScopeChange(e.target.value)}
                    className="adm-select w-full rounded-xl px-2.5 py-2 font-mono text-[11px] font-bold"
                  >
                    <option value="ALL">All events (combined)</option>
                    {eventsList.map(ev => (
                      <option key={ev.eventId} value={ev.eventId}>
                        {ev.name} ({ev.eventId})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation, grouped — the only part that scrolls */}
        <nav className="adm-nav relative z-10 min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Admin sections">
          {menuGroups.map((group) => {
            const items = menuItems.filter((m) => m.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="mt-4 first:mt-1">
                <div className="flex items-center gap-2 px-2 pb-2">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-text-muted/70">{group}</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                </div>
                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                        aria-current={isActive ? 'page' : undefined}
                        className={`adm-nav-item group relative w-full flex items-center justify-between gap-2 pl-2 pr-2.5 py-2 rounded-xl text-[13px] font-medium ${isActive ? 'adm-nav-active' : ''}`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="adm-nav-tile flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.badge !== null && item.badge !== undefined && item.badge !== '' && (
                          <span className={`adm-nav-badge shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${item.alert ? 'adm-nav-badge-alert' : item.live ? 'adm-nav-badge-live' : ''}`}>
                            {item.live && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle motion-safe:animate-pulse" />}
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="adm-sidebar-foot relative z-10 shrink-0 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
            <span className="flex items-center gap-2 font-mono text-[11px] text-text-muted">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-70 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              All systems live
            </span>
            <span className="adm-chip">Day {metrics?.attendance?.currentDay || 1}</span>
          </div>

          <button
            onClick={async () => { await api.staffLogout().catch(() => {}); navigate('/staff'); }}
            className="adm-btn adm-btn-danger w-full justify-center group"
          >
            <LogOut className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button type="button" aria-label="Close admin navigation backdrop" onClick={() => setSidebarOpen(false)} className="xl:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-xs" />
      )}

      {/* 2. MAIN WORKSPACE / CONTENT AREA */}
      <div className="min-w-0 flex-1 flex flex-col h-dvh overflow-y-auto">
        {/* Top Header Bar with Scope Dropdown */}
        <header className="admin-header adm-topbar sticky top-0 z-30 px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 max-w-full items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label={sidebarOpen ? 'Close admin navigation' : 'Open admin navigation'}
              aria-expanded={sidebarOpen}
              aria-controls="admin-navigation"
              className="adm-icon-btn xl:hidden shrink-0 cursor-pointer"
            >
              {sidebarOpen ? <X className="w-5 h-5 text-primary" /> : <Menu className="w-5 h-5" />}
            </button>

            <button
              type="button"
              onClick={() => navigate(-1)}
              className="adm-icon-btn adm-back-btn shrink-0"
              title="Go back to previous page"
              aria-label="Go back"
            >
              <ArrowLeft className="w-4 h-4 text-primary" />
              <span className="hidden sm:inline font-mono text-xs font-bold">Back</span>
            </button>

            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="font-comic text-2xl sm:text-[1.7rem] leading-none text-white tracking-wide uppercase truncate">
                {menuItems.find(m => m.id === activeTab)?.label || 'Dashboard'}
              </h2>

              {isSuperAdmin ? (
                <label className="adm-scope flex min-w-0 max-w-full items-center gap-2 rounded-xl pl-3 pr-2 py-1.5">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="sr-only">Event scope</span>
                  <select
                    value={selectedEventScope}
                    onChange={(e) => handleEventScopeChange(e.target.value)}
                    className="min-w-0 w-full bg-transparent text-primary font-mono text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="ALL" className="bg-[#161626] text-white">All events (combined)</option>
                    {eventsList.map(ev => (
                      <option key={ev.eventId} value={ev.eventId} className="bg-[#161626] text-white">
                        {ev.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="adm-scope flex min-w-0 items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-success motion-safe:animate-pulse" />
                  <span className="text-white font-bold truncate max-w-[220px]">
                    {metrics?.settings?.eventName || 'All events'}
                  </span>
                  <span className="text-info text-[10px] hidden sm:inline">{currentUser.assignedEventId || 'no event'}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('INQUIRIES')}
              className={`adm-icon-btn relative ${unreadInquiriesCount > 0 ? 'adm-icon-btn-alert' : ''}`}
              title={`Sponsor & Stall Inquiries (${unreadInquiriesCount} unread)`}
              aria-label={`Sponsor and stall inquiries, ${unreadInquiriesCount} unread`}
            >
              <Bell className="w-4 h-4" />
              {unreadInquiriesCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-accent text-white text-[10px] font-bold font-mono px-1 rounded-full flex items-center justify-center border-2 border-[#0B0B14]">
                  {unreadInquiriesCount > 99 ? '99+' : unreadInquiriesCount}
                </span>
              )}
            </button>

            <button type="button" onClick={handleOpenExecutiveReport} className="adm-btn adm-btn-ghost hidden md:inline-flex">
              <FileText className="w-4 h-4 text-accent" />
              <span>Audit report</span>
            </button>

            {isSuperAdmin && (
              <button type="button" onClick={() => setNewEventModal(true)} className="adm-btn adm-btn-primary">
                <PlusCircle className="w-4 h-4" />
                <span>New event</span>
              </button>
            )}

            {isEventAdmin && (
              <a href="/gate" target="_blank" rel="noreferrer" className="adm-btn adm-btn-cyan hidden sm:inline-flex">
                <Shield className="w-4 h-4" />
                <span>Gate scanner</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>
            )}

            <button
              onClick={() => loadAllData(selectedEventScope)}
              className="adm-icon-btn group"
              title="Refresh data"
              aria-label="Refresh data"
            >
              <RefreshCw className="w-4 h-4 transition-transform duration-500 group-hover:rotate-180" />
            </button>
          </div>
        </header>

        {/* Dynamic Tab Views */}
        <main className="p-3 sm:p-6 min-w-0 flex-1 max-w-7xl mx-auto w-full space-y-6">

          {/* Real-time Incoming Sponsor/Stall Inquiry Toast */}
          {inquiryToast && (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-accent/20 via-surface to-primary/20 border-2 border-accent text-white shadow-[0_10px_35px_rgba(255,46,136,0.35),4px_4px_0_#000] flex flex-wrap items-center justify-between gap-4 animate-in slide-in-from-top-3 duration-300">
              <div className="flex items-center gap-3.5">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold border-2 border-black shadow-[2px_2px_0_#000] ${inquiryMeta(inquiryToast.type).solid}`}>
                  {React.createElement(inquiryMeta(inquiryToast.type).icon, { className: 'w-6 h-6' })}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-accent text-white shadow-[0_0_8px_#FF2E88]">
                      ⚡ NEW {inquiryToast.type} INQUIRY
                    </span>
                    <span className="text-xs font-mono text-primary font-bold">Event: {inquiryToast.eventName}</span>
                    <span className="text-xs font-mono text-text-muted">• {inquiryToast.time}</span>
                  </div>
                  <div className="font-comic text-xl text-white mt-1">
                    {inquiryToast.brand} <span className="text-text-muted text-sm font-sans font-normal">— Contact: {inquiryToast.contact} ({inquiryToast.phone})</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ComicButton
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setActiveTab('INQUIRIES');
                    setInquiryToast(null);
                  }}
                >
                  VIEW LEAD NOW →
                </ComicButton>
                <button
                  onClick={() => setInquiryToast(null)}
                  className="p-2 rounded-xl bg-surface-2 hover:bg-danger text-text-muted hover:text-white border border-border transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 1: OVERVIEW DASHBOARD */}
          {/* ======================================================== */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-6">
              {/* Event Admin Hero: Organizer Payout & Settlement HQ */}
              {isEventAdmin && (
                <OrganizerPayoutCard
                  metrics={metrics}
                  eventName={metrics?.settings?.eventName}
                  onExportLedger={() => handleExport('ledger')}
                />
              )}

              {/* Demo accounts still on published PINs */}
              <DemoPinBanner refreshKey={securityKey} onFix={() => setActiveTab('STAFF')} />

              {/* Organizers waiting to be paid */}
              {isSuperAdmin && (
                <PendingPayoutBanner
                  onOpen={() => {
                    setActiveTab('EVENTS');
                    setTimeout(() => document.getElementById('settlements')?.scrollIntoView({ behavior: 'smooth' }), 100);
                  }}
                />
              )}

              {/* Super Admin Master SaaS Headline Card */}
              {isSuperAdmin && platformOverview && (
                <section className="adm-hero relative overflow-hidden rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-5">
                  <div className="adm-hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />
                  <div className="relative flex items-center gap-4">
                    <div className="adm-icon-tile adm-icon-tile-magenta h-12 w-12 sm:h-14 sm:w-14 rounded-2xl">
                      <Crown className="h-6 w-6 sm:h-7 sm:w-7" />
                    </div>
                    <div>
                      <h3 className="font-comic text-2xl sm:text-3xl text-white tracking-wide leading-tight">FlashPass <span className="text-accent">Command Center</span></h3>
                      <p className="mt-1 font-mono text-xs text-text-muted">
                        <strong className="text-primary">{platformOverview.platform.totalEvents}</strong> client events • <strong className="text-primary">{platformOverview.platform.totalPaidOrders}</strong> paid orders
                      </p>
                    </div>
                  </div>

                  <div className="relative flex flex-wrap items-center gap-5">
                    <div className="sm:text-right">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted block">Platform net commission</span>
                      <span className="font-comic text-4xl text-info leading-none">₹{platformOverview.platform.totalPlatformFeeRupees}</span>
                    </div>
                    <button type="button" className="adm-btn adm-btn-primary group" onClick={() => setActiveTab('EVENTS')}>
                      Manage events <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </section>
              )}

              {/* Multi-Event Revenue Breakdown & Comparison Widget (Only shown to Platform Super Admin) */}
              {isSuperAdmin && (
                <EventComparisonCards
                  eventsBreakdown={metrics?.eventsBreakdown}
                  selectedEventId={selectedEventScope}
                  onSelectEvent={(id) => handleEventScopeChange(id)}
                />
              )}

              {/* Money (super admin only — event admins see it in the Settlement HQ card above) */}
              {isSuperAdmin && (
                <section className="space-y-3" aria-label="Revenue">
                  <SectionTitle
                    icon={DollarSign}
                    title="Revenue"
                    hint={selectedEventScope === 'ALL' ? 'All events combined' : `${metrics?.settings?.eventName || 'Selected event'} only`}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Kpi
                      highlight
                      tone="yellow"
                      icon={TrendingUp}
                      label="Gross ticketing"
                      value={`₹${metrics?.ledger?.grossRupees || '0.00'}`}
                      sub={`Online ₹${metrics?.ledger?.onlineGrossRupees || '0.00'} • Cash ₹${metrics?.ledger?.cashGrossRupees || '0.00'}`}
                    />
                    <Kpi
                      tone="neutral"
                      icon={Building2}
                      label="Organizer net"
                      value={`₹${metrics?.ledger?.organizerRupees || '0.00'}`}
                      sub={selectedEventScope === 'ALL' ? 'All client organizers' : `${metrics?.settings?.eventName || 'Client'} net`}
                      badge={`${metrics?.ledger?.paidPassCount || 0} passes`}
                    />
                    <Kpi
                      tone="cyan"
                      icon={Zap}
                      label="Platform fee revenue"
                      value={`₹${metrics?.ledger?.platformRupees || '0.00'}`}
                      sub={`Flat ₹${((metrics?.pricing?.platformFeePaise || 200) / 100).toFixed(2)} SaaS fee / pass`}
                    />
                  </div>
                </section>
              )}

              {/* Live crowd numbers */}
              <section className="space-y-3" aria-label="Live at the venue">
                <SectionTitle
                  icon={Activity}
                  title="Live at the venue"
                  hint={`Day ${metrics?.attendance?.currentDay || 1} • updates in real time`}
                  action={
                    <span className="adm-chip adm-chip-cyan">
                      <span className="h-1.5 w-1.5 rounded-full bg-info motion-safe:animate-pulse" /> Gate response &lt; 500ms
                    </span>
                  }
                />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Kpi
                    highlight
                    tone={capacityTone}
                    icon={capacityPct > 90 ? AlertTriangle : Users}
                    label={stampMode ? 'Came in today' : 'Inside right now'}
                    value={<>{insideNow} <span className="font-mono text-sm text-text-muted">/ {capacity}</span></>}
                    badge={capacityPct > 90 ? 'Near capacity' : `${capacityPct}% full`}
                  >
                    <div className="adm-meter mt-3 h-2 overflow-hidden rounded-full" role="meter" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={insideNow} aria-label="Venue capacity used">
                      <div className="adm-meter-fill h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(capacityPct, 100)}%` }} />
                    </div>
                  </Kpi>
                  <Kpi
                    tone="neutral"
                    icon={Ticket}
                    label="Paid attendees"
                    value={metrics?.ledger?.paidPassCount || 0}
                    sub={`${metrics?.attendance?.turnoutPct || 0}% came today`}
                  />
                  <Kpi
                    tone="success"
                    icon={CheckCircle2}
                    label="First entries today"
                    value={metrics?.attendance?.todayFootfall || 0}
                    sub="Unique fans scanned in"
                  />
                  {stampMode ? (
                    <Kpi
                      tone="danger"
                      icon={ShieldAlert}
                      label="Reused passes stopped"
                      value={footfall?.blockedReuseToday || 0}
                      sub="Same pass scanned again today"
                    />
                  ) : (
                    <Kpi
                      tone="warning"
                      icon={RefreshCw}
                      label="Re-entries handled"
                      value={metrics?.attendance?.reEntriesToday || 0}
                      sub="Exit → re-entry scans"
                    />
                  )}
                </div>
              </section>

              {/* Footfall report: people who actually came, not tickets sold */}
              {footfall && (
                <section className="space-y-3" aria-label="Footfall report">
                  <SectionTitle
                    icon={Users}
                    title="Footfall report"
                    hint="People who actually came in — tickets sold is a separate number"
                    action={
                      <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => handleExport('footfall')}>
                        <Download className="h-3.5 w-3.5" /> Footfall CSV
                      </button>
                    }
                  />
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Kpi
                      tone="neutral"
                      icon={Ticket}
                      label="Tickets sold"
                      value={footfall.ticketsSold}
                      sub="Paid, active passes"
                    />
                    <Kpi
                      highlight
                      tone="success"
                      icon={CheckCircle2}
                      label="Unique people came"
                      value={footfall.uniqueFootfall}
                      badge={`${footfall.turnoutPct}%`}
                      sub="Each person counted once"
                    />
                    <Kpi
                      tone="warning"
                      icon={XCircle}
                      label="No-show"
                      value={footfall.noShow}
                      sub="Bought a ticket, never came"
                    />
                    <Kpi
                      tone="cyan"
                      icon={TrendingUp}
                      label="Total visits"
                      value={footfall.totalVisits}
                      sub="All days added up"
                    />
                  </div>
                  {footfall.byDay?.length > 0 && (
                    <div className={`grid gap-3 ${footfall.byDay.length >= 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
                      {footfall.byDay.map(d => {
                        const isToday = d.day === metrics?.attendance?.currentDay;
                        const pct = footfall.ticketsSold > 0 ? Math.round((d.count / footfall.ticketsSold) * 100) : 0;
                        return (
                          <div key={d.day} className={`adm-panel rounded-2xl p-4 ${isToday ? 'ring-1 ring-info/60' : ''}`}>
                            <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-text-muted">
                              <span className="font-bold uppercase tracking-wider">{d.label || `Day ${d.day}`}</span>
                              {isToday && <span className="adm-chip adm-chip-cyan">Today</span>}
                            </div>
                            <div className="mt-2 font-comic text-3xl leading-none text-white">{d.count}</div>
                            <div className="mt-1.5 font-mono text-[11px] text-text-muted">{d.date} • {pct}% of tickets sold</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="font-mono text-[11px] text-text-muted">
                    Total stopped at the gate for reusing a pass: <strong className="text-danger">{footfall.blockedReuseTotal}</strong>
                  </p>
                </section>
              )}

              <SectionTitle icon={BarChart3} title="Analytics" hint="Ingress, gates, revenue mix and live scanner feed" />
              {/* LIVE VISUAL CHARTS SECTION */}
              <IngressVelocityChart data={analyticsData?.hourlyData} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GateCongestionHeatmap distribution={analyticsData?.gateDistribution} />
                <RevenueSplitDonut channelData={analyticsData?.channelBreakdown} />
              </div>

              {/* LIVE SCANNER STREAM & FRAUD RADAR */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <LiveScannerTicker scans={analyticsData?.liveScanTicker} />
                <FraudAlertCenter incidents={analyticsData?.formattedIncidents} />
              </div>

              {/* Quick Navigation Panels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Event Summary Card */}
                <section className="adm-panel rounded-3xl p-5" aria-labelledby="event-status-title">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <h3 id="event-status-title" className="flex items-center gap-2 font-comic text-xl tracking-wide text-white">
                      <Settings className="h-4 w-4 text-primary" /> Event status
                    </h3>
                    <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setActiveTab('SETTINGS')}>
                      Edit <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <dl className="divide-y divide-white/[0.06] text-xs font-mono">
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-text-muted">Event</dt>
                      <dd className="text-white font-bold text-right truncate">{settingsForm.eventName}</dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-text-muted">Venue</dt>
                      <dd className="text-white text-right truncate">{settingsForm.venue}</dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-text-muted">Re-entry</dt>
                      <dd>
                        {settingsForm.reentryMode === 'WRISTBAND' ? (
                          <span className="adm-chip adm-chip-success">Hand stamp • 1 scan/day</span>
                        ) : (
                          <span className={`adm-chip ${settingsForm.allowReentry ? 'adm-chip-success' : 'adm-chip-danger'}`}>
                            {settingsForm.allowReentry ? `Allowed • max ${settingsForm.maxReentriesPerDay}/day` : 'Single entry only'}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-text-muted">Gate hours</dt>
                      <dd className="text-white flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-info" /> {settingsForm.gateOpenTime} – {settingsForm.gateCloseTime}</dd>
                    </div>
                  </dl>
                </section>

                {/* Quick Staff & Reports Card */}
                <section className="adm-panel rounded-3xl p-5" aria-labelledby="exports-title">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <h3 id="exports-title" className="flex items-center gap-2 font-comic text-xl tracking-wide text-white">
                      <Download className="h-4 w-4 text-info" /> Exports
                    </h3>
                    <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setActiveTab('LEDGER')}>
                      Full ledger <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => handleExport('passes', { fullPhone: exportFullPhone })} className="adm-action-tile adm-tone-yellow group rounded-2xl p-4 text-left">
                      <span className="adm-icon-tile adm-icon-tile-yellow mb-3 h-9 w-9 rounded-xl"><Ticket className="h-4 w-4" /></span>
                      <strong className="block font-mono text-xs text-white">Passes CSV</strong>
                      <span className="mt-0.5 block font-mono text-[10px] text-text-muted">All attendee tickets</span>
                    </button>
                    <button type="button" onClick={() => handleExport('orders', { fullPhone: exportFullPhone })} className="adm-action-tile adm-tone-yellow group rounded-2xl p-4 text-left">
                      <span className="adm-icon-tile adm-icon-tile-yellow mb-3 h-9 w-9 rounded-xl"><ShoppingBag className="h-4 w-4" /></span>
                      <strong className="block font-mono text-xs text-white">Orders CSV</strong>
                      <span className="mt-0.5 block font-mono text-[10px] text-text-muted">Every order, paid or not</span>
                    </button>
                    <button type="button" onClick={() => handleExport('ledger')} className="adm-action-tile adm-tone-cyan group col-span-2 rounded-2xl p-4 text-left">
                      <span className="adm-icon-tile adm-icon-tile-cyan mb-3 h-9 w-9 rounded-xl"><FileText className="h-4 w-4" /></span>
                      <strong className="block font-mono text-xs text-white">Financial CSV</strong>
                      <span className="mt-0.5 block font-mono text-[10px] text-text-muted">Audited sales ledger</span>
                    </button>
                  </div>
                  <label className="mt-3 flex items-start gap-2 font-mono text-[11px] text-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={exportFullPhone}
                      onChange={(e) => setExportFullPhone(e.target.checked)}
                    />
                    <span>
                      Include full phone numbers in Passes and Orders. Off by default (98*****210); each full export is recorded in the audit log.
                    </span>
                  </label>
                </section>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW: VISUAL ANALYTICS & INGRESS RADAR */}
          {/* ======================================================== */}
          {activeTab === 'ANALYTICS' && (
            <div className="space-y-6">
              {/* Analytics Header Card */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-info/20 via-surface to-accent/20 border-2 border-info shadow-[4px_4px_0_#000] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-info text-black border-2 border-black flex items-center justify-center shadow-[3px_3px_0_#000]">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-comic text-2xl text-info tracking-wide">
                      VISUAL INGRESS RADAR & LIVE ANALYTICS
                    </h3>
                    <p className="font-mono text-xs text-text-muted">
                      Predictive crowd velocity, congestion balancing, and anti-fraud telemetry
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="px-3.5 py-1.5 rounded-xl bg-surface-2 border border-border text-right font-mono text-xs">
                    <span className="text-[10px] text-text-muted block uppercase">Surge Status</span>
                    <strong className={
                      capacityPct >= 85 ? 'text-danger font-bold' : capacityPct >= 70 ? 'text-warning font-bold' : 'text-success font-bold'
                    }>
                      ● {capacityPct >= 85 ? 'CRITICAL SURGE (>85%)' : capacityPct >= 70 ? 'WARNING (70-85%)' : 'OPTIMAL FLOW (<70%)'}
                    </strong>
                  </div>
                  <ComicButton variant="info" size="sm" onClick={loadAllData}>
                    <RefreshCw className="w-4 h-4 mr-1 text-black" /> REFRESH
                  </ComicButton>
                </div>
              </div>

              {/* Ingress Velocity Chart */}
              <IngressVelocityChart data={analyticsData?.hourlyData} />

              {/* 2-Column Grid: Gate Heatmap & Revenue Mix */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GateCongestionHeatmap distribution={analyticsData?.gateDistribution} />
                <RevenueSplitDonut channelData={analyticsData?.channelBreakdown} />
              </div>

              {/* Live Scanner Stream & Fraud Monitor */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <LiveScannerTicker scans={analyticsData?.liveScanTicker} />
                <FraudAlertCenter incidents={analyticsData?.formattedIncidents} />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 2: MULTI-EVENT SAAS PORTFOLIO */}
          {/* ======================================================== */}
          {activeTab === 'EVENTS' && isSuperAdmin && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000]">
                <div>
                  <h3 className="font-comic text-2xl text-primary">CLIENT EVENTS PORTFOLIO</h3>
                  <p className="text-xs font-mono text-text-muted">
                    Manage multi-tenant events, onboard new organizers, and assign Event Admins.
                  </p>
                </div>
                <ComicButton variant="primary" size="md" onClick={() => setNewEventModal(true)}>
                  <PlusCircle className="w-4 h-4 mr-2" />
                  <span>+ CREATE NEW EVENT & ADMIN</span>
                </ComicButton>
              </div>

              {eventsNotice && (
                <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-success/40 bg-success/10 px-4 py-3 font-mono text-xs text-success">
                  <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" /> {eventsNotice}</span>
                  <button type="button" onClick={() => setEventsNotice('')} className="adm-icon-btn shrink-0" aria-label="Dismiss"><X className="h-4 w-4" /></button>
                </div>
              )}

              {/* Events Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {eventsList.map((ev) => (
                  <div key={ev._id} className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${ev.status === 'ARCHIVED' ? 'bg-white/5 text-text-muted border-white/20' : 'bg-success/20 text-success border-success/40'}`}>
                          {ev.status}
                        </span>
                        <span className="font-mono text-xs text-text-muted">Slug: {ev.eventId}</span>
                      </div>
                      <h4 className="font-comic text-2xl text-text mb-1">{ev.name}</h4>
                      <p className="text-xs font-mono text-text-muted mb-4">{ev.venue}</p>

                      <div className="p-3 rounded-2xl bg-surface-2 border border-border space-y-1.5 text-xs font-mono mb-4">
                        <div className="flex justify-between">
                          <span className="text-text-muted">Ticket Rate:</span>
                          <strong className="text-primary font-comic text-base">₹{(ev.basePricePaise/100).toFixed(2)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Platform Fee:</span>
                          <strong className="text-info font-comic text-base">+ ₹{(ev.platformFeePaise/100).toFixed(2)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Capacity:</span>
                          <span className="text-text">{ev.capacityLimit} passes</span>
                        </div>
                        <div className="flex justify-between border-t border-border/60 pt-1.5 mt-1">
                          <span className="text-text-muted">Event Admin:</span>
                          <strong className="text-accent">{ev.organizer?.username || 'admin'}</strong>
                        </div>
                        <div className="flex justify-between items-center border-t border-border/60 pt-1.5 mt-1">
                          <span className="text-text-muted">Gateway:</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            ev.paymentGateway?.usePlatformDefault === false && ev.paymentGateway?.hasCustomKey
                              ? 'bg-success/20 text-success border border-success/40'
                              : 'bg-primary/20 text-primary border border-primary/40'
                          }`}>
                            {ev.paymentGateway?.usePlatformDefault === false && ev.paymentGateway?.hasCustomKey
                              ? `${ev.paymentGateway.provider || 'Gateway'} Custom (${ev.paymentGateway.env || 'TEST'})`
                              : `${ev.paymentGateway?.provider || 'PayU'} Platform Default`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <ComicButton
                        variant="info"
                        size="sm"
                        onClick={() => {
                          setSelectedEventScope(ev.eventId);
                          loadAllData(ev.eventId);
                          loadAttendees(ev.eventId, '', '');
                          setActiveTab('PASSES');
                        }}
                        className="w-full"
                      >
                        👥 ATTENDEES
                      </ComicButton>
                      <ComicButton
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedEventScope(ev.eventId);
                          loadAllData(ev.eventId);
                          setActiveTab('SETTINGS');
                        }}
                        className="w-full"
                      >
                        MANAGE →
                      </ComicButton>
                    </div>
                    {(
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm justify-center" onClick={() => setEventAction({ event: ev, mode: ev.status === 'ARCHIVED' ? 'restore' : 'archive' })}>
                          {ev.status === 'ARCHIVED' ? <><Eye className="h-3.5 w-3.5" /> Restore</> : <><EyeOff className="h-3.5 w-3.5" /> Archive</>}
                        </button>
                        <button type="button" className="adm-btn adm-btn-danger adm-btn-sm justify-center" onClick={() => setEventAction({ event: ev, mode: 'delete' })}>
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Multi-Tenant SaaS Financial Settlement Ledger */}
              <div id="settlements">
                <SaaSSettlementLedger />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 3: PASSES & ATTENDEE SEARCH */}
          {/* ======================================================== */}
          {activeTab === 'PASSES' && (() => {
            const totalAttendees = searchResults.length;
            // A pass counts as checked in once it is scanned in today. Hand-stamp events
            // never scan people out, so presence alone stays OUTSIDE there.
            const insideCount = searchResults.filter(r => r.presence === 'INSIDE' || r.cameToday).length;
            const onlineCount = searchResults.filter(r => (r.channel || 'ONLINE') === 'ONLINE').length;
            const counterCount = totalAttendees - onlineCount;
            const totalAmountRupees = (searchResults.reduce((sum, r) => sum + (Number(r.amountPaise) || 0), 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
            const activeEventLabel = isEventAdmin
              ? (settingsForm.eventName || 'Your Event')
              : (selectedEventScope === 'ALL' ? 'All Events' : (eventsList.find(e => e.eventId === selectedEventScope)?.name || selectedEventScope));

            const checkInPct = totalAttendees ? Math.round((insideCount / totalAttendees) * 100) : 0;
            const onlinePct = totalAttendees ? Math.round((onlineCount / totalAttendees) * 100) : 0;
            const CHANNEL_META = {
              ONLINE: { label: 'Online', cls: 'adm-pa-ch-online', Icon: Globe },
              POS_WALKIN: { label: 'Box Office', cls: 'adm-pa-ch-pos', Icon: Store },
              CASH_TOKEN: { label: 'Token', cls: 'adm-pa-ch-token', Icon: Tag }
            };
            const AVATAR_TONES = ['adm-pa-av-yellow', 'adm-pa-av-magenta', 'adm-pa-av-cyan', 'adm-pa-av-green', 'adm-pa-av-orange'];
            const avatarTone = (name = '') => AVATAR_TONES[[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_TONES.length];
            const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('') || '?';
            const copyOrderId = (id) => {
              if (!navigator.clipboard) return;
              navigator.clipboard.writeText(id).then(() => {
                setCopiedOrderId(id);
                setTimeout(() => setCopiedOrderId(cur => (cur === id ? null : cur)), 1500);
              }).catch(() => {});
            };
            const showSkeleton = attendeesLoading && searchResults.length === 0;

            const OrderIdChip = ({ id }) => (
              <button
                type="button"
                onClick={() => copyOrderId(id)}
                title="Copy order ID"
                className="adm-pa-order group"
              >
                <span>{id}</span>
                {copiedOrderId === id
                  ? <Check className="w-3 h-3 text-success" />
                  : <Copy className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity" />}
              </button>
            );
            const ChannelChip = ({ channel }) => {
              const meta = CHANNEL_META[channel || 'ONLINE'] || CHANNEL_META.ONLINE;
              return (
                <span className={`adm-pa-ch ${meta.cls}`}>
                  <meta.Icon className="w-3 h-3" />
                  {meta.label}
                </span>
              );
            };
            const scanTime = (at) => at ? new Date(at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '';
            const presenceOf = (p) => {
              const when = p.lastScan?.at ? ` at ${scanTime(p.lastScan.at)}${p.lastScan.gateId ? ` via ${p.lastScan.gateId}` : ''}` : '';
              if (p.presence === 'INSIDE') return { label: 'Inside', cls: 'adm-chip-success', dot: 'bg-success animate-pulse shadow-[0_0_8px_#22c55e]', title: `Scanned in${when}` };
              if (p.cameToday && p.stampMode) return { label: 'Came in', cls: 'adm-chip-success', dot: 'bg-success shadow-[0_0_8px_#22c55e]', title: `Scanned in today${when} — hand-stamp mode, no exit scans` };
              if (p.cameToday) return { label: 'Exited', cls: 'adm-pa-presence-exited', dot: 'bg-warning', title: `Came in today, scanned out${when}` };
              if (p.everCame) return { label: 'Not today', cls: '', dot: 'bg-text-muted/60', title: `Came on an earlier day; last scan${when}` };
              return { label: 'Not arrived', cls: '', dot: 'bg-text-muted/40', title: 'Not scanned at the gate yet' };
            };
            const PresenceChip = ({ pass }) => {
              const st = presenceOf(pass);
              return (
                <span className={`adm-chip ${st.cls}`} title={st.title}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
              );
            };
            const StatusChip = ({ status }) => (
              <span className={`adm-chip ${status === 'ACTIVE' ? 'adm-pa-status-active' : 'adm-chip-danger'}`}>
                {status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {status === 'ACTIVE' ? 'Active' : status}
              </span>
            );

            return (
            <div className="space-y-5">
              {/* 1. KPI Summary Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="adm-kpi adm-pa-stat adm-kpi-highlight adm-tone-cyan rounded-2xl p-4 sm:p-5 relative overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <span className="adm-pa-eyebrow">Total Attendees</span>
                    <span className="adm-pa-kpi-icon"><Users className="w-4 h-4" /></span>
                  </div>
                  <div className="adm-kpi-value font-comic text-3xl sm:text-4xl mt-2 leading-none">{totalAttendees.toLocaleString('en-IN')}</div>
                  <p className="text-[11px] font-mono text-text-muted mt-2 truncate" title={activeEventLabel}>{activeEventLabel}</p>
                </div>

                <div className="adm-kpi adm-pa-stat adm-tone-success rounded-2xl p-4 sm:p-5 relative overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <span className="adm-pa-eyebrow">Checked In</span>
                    <span className="adm-pa-kpi-icon"><CheckCircle2 className="w-4 h-4" /></span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="adm-kpi-value font-comic text-3xl sm:text-4xl leading-none">{insideCount.toLocaleString('en-IN')}</span>
                    <span className="font-mono text-[11px] font-bold text-text-muted">{checkInPct}%</span>
                  </div>
                  <div className="adm-meter h-1.5 rounded-full mt-3 overflow-hidden">
                    <div className="adm-meter-fill h-full rounded-full transition-all duration-700" style={{ width: `${checkInPct}%` }} />
                  </div>
                  <p className="text-[11px] font-mono text-text-muted mt-2">{(totalAttendees - insideCount).toLocaleString('en-IN')} yet to arrive today</p>
                </div>

                <div className="adm-kpi adm-pa-stat adm-tone-magenta rounded-2xl p-4 sm:p-5 relative overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <span className="adm-pa-eyebrow">Booking Channels</span>
                    <span className="adm-pa-kpi-icon"><Globe className="w-4 h-4" /></span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2 font-comic text-3xl sm:text-4xl leading-none">
                    <span className="text-info">{onlineCount}</span>
                    <span className="text-xs font-mono text-text-muted">vs</span>
                    <span className="text-warning">{counterCount}</span>
                  </div>
                  <div className="h-1.5 rounded-full mt-3 overflow-hidden flex bg-white/[0.06]">
                    <div className="h-full bg-info shadow-[0_0_8px_#22d3ee] transition-all duration-700" style={{ width: `${onlinePct}%` }} />
                    <div className="h-full bg-warning transition-all duration-700" style={{ width: `${totalAttendees ? 100 - onlinePct : 0}%` }} />
                  </div>
                  <p className="text-[11px] font-mono text-text-muted mt-2">
                    <span className="text-info">Online</span> • <span className="text-warning">Counter / Token</span>
                  </p>
                </div>

                <div className="adm-kpi adm-pa-stat adm-kpi-highlight adm-tone-yellow rounded-2xl p-4 sm:p-5 relative overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <span className="adm-pa-eyebrow">Total Value</span>
                    <span className="adm-pa-kpi-icon"><IndianRupee className="w-4 h-4" /></span>
                  </div>
                  <div className="adm-kpi-value adm-number-glow font-comic text-3xl sm:text-4xl mt-2 leading-none">₹{totalAmountRupees}</div>
                  <p className="text-[11px] font-mono text-text-muted mt-2">
                    Avg ₹{totalAttendees ? Math.round(searchResults.reduce((s, r) => s + (Number(r.amountPaise) || 0), 0) / 100 / totalAttendees).toLocaleString('en-IN') : 0} per pass
                  </p>
                </div>
              </div>

              {/* 2. Directory header: title, exports, search & channel filter */}
              <div className="adm-hero rounded-3xl p-5 sm:p-6 relative overflow-hidden">
                <div className="adm-hero-glow absolute inset-0 pointer-events-none" />
                <div className="relative space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="adm-icon-tile adm-icon-tile-cyan w-12 h-12 rounded-2xl flex-shrink-0">
                        <Ticket className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-info">
                          <span className="w-1.5 h-1.5 rounded-full bg-info animate-pulse shadow-[0_0_8px_#22d3ee]" />
                          Live directory
                          <span className="text-text-muted normal-case tracking-normal font-semibold truncate">• {activeEventLabel}</span>
                        </span>
                        <h3 className="font-comic text-2xl sm:text-3xl text-white tracking-wide mt-0.5 leading-tight">
                          ATTENDEES &amp; <span className="text-primary">TICKET BUYERS</span>
                        </h3>
                      </div>
                    </div>

                    {/* Export suite */}
                    <div className="adm-pa-segment">
                      <span className="hidden sm:inline px-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">Export</span>
                      <button
                        type="button"
                        disabled={searchResults.length === 0}
                        onClick={() => exportAttendeesCSV(searchResults, activeEventLabel)}
                        className="adm-pa-export"
                      >
                        <Download className="w-3.5 h-3.5" /> CSV
                      </button>
                      <button
                        type="button"
                        disabled={searchResults.length === 0}
                        onClick={() => exportAttendeesExcel(searchResults, activeEventLabel)}
                        className="adm-pa-export adm-pa-export-green"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                      </button>
                      <button
                        type="button"
                        disabled={searchResults.length === 0}
                        onClick={() => exportAttendeesPDF(searchResults, activeEventLabel)}
                        className="adm-pa-export adm-pa-export-magenta"
                      >
                        <FileText className="w-3.5 h-3.5" /> PDF
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleSearch} className="flex flex-col lg:flex-row gap-3">
                    <div className="adm-pa-search relative flex-1">
                      <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-info pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search name, mobile, email or order ID…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-12 bg-[#0B0B14] border border-[#2e2e4d] rounded-2xl pl-11 pr-11 font-mono text-xs sm:text-sm text-white placeholder:text-[#6e6e8f]"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => { setSearchQuery(''); loadAttendees(undefined, '', undefined); }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-white hover:bg-white/[0.06] cursor-pointer"
                          title="Clear search"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="adm-pa-segment overflow-x-auto">
                      {[
                        { id: '', label: 'All', Icon: Users },
                        { id: 'ONLINE', label: 'Online', Icon: Globe },
                        { id: 'POS_WALKIN', label: 'Box Office', Icon: Store },
                        { id: 'CASH_TOKEN', label: 'Token', Icon: Tag }
                      ].map(ch => (
                        <button
                          key={ch.id || 'ALL'}
                          type="button"
                          onClick={() => {
                            setAttendeesChannel(ch.id);
                            loadAttendees(undefined, undefined, ch.id);
                          }}
                          className={`adm-pa-pill ${attendeesChannel === ch.id ? 'adm-pa-pill-active' : ''}`}
                        >
                          <ch.Icon className="w-3.5 h-3.5" />
                          {ch.label}
                        </button>
                      ))}
                    </div>

                    <button type="submit" className="adm-btn adm-btn-primary adm-btn-lg h-12 justify-center px-6 shrink-0 cursor-pointer" disabled={attendeesLoading}>
                      {attendeesLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      {attendeesLoading ? 'SEARCHING' : 'SEARCH'}
                    </button>
                  </form>
                </div>
              </div>

              {/* 3. Attendee records */}
              <div className="adm-panel rounded-3xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-white/[0.03] to-transparent">
                  <div className="flex items-center gap-2.5">
                    <span className="adm-chip adm-chip-cyan">
                      <ShieldCheck className="w-3 h-3" />
                      {searchResults.length.toLocaleString('en-IN')} verified
                    </span>
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-text-muted">Buyer records</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadAttendees()}
                    className="adm-btn adm-btn-sm adm-btn-cyan cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${attendeesLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {showSkeleton ? (
                  <div className="divide-y divide-white/[0.05]">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                        <div className="h-7 w-28 rounded-lg bg-white/[0.06]" />
                        <div className="w-9 h-9 rounded-xl bg-white/[0.06]" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-1/3 rounded bg-white/[0.07]" />
                          <div className="h-2.5 w-1/4 rounded bg-white/[0.04]" />
                        </div>
                        <div className="hidden md:block h-7 w-24 rounded-full bg-white/[0.05]" />
                      </div>
                    ))}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="py-16 px-6 text-center">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-4">
                      <Users className="w-7 h-7 text-text-muted/60" />
                    </div>
                    <p className="font-comic text-xl text-white tracking-wide">NO RECORDS FOUND</p>
                    <p className="text-xs font-mono text-text-muted mt-1.5">
                      {searchQuery || attendeesChannel ? 'Nothing matches this search or channel filter.' : 'Passes will appear here as soon as they are booked.'}
                    </p>
                    {(searchQuery || attendeesChannel) && (
                      <button
                        type="button"
                        onClick={() => { setSearchQuery(''); setAttendeesChannel(''); loadAttendees(undefined, '', ''); }}
                        className="adm-btn adm-btn-sm adm-btn-ghost mt-4 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" /> Clear filters
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left font-mono text-xs">
                        <thead>
                          <tr className="border-b border-white/[0.08] bg-black/30 text-[10px] uppercase tracking-[0.12em] text-text-muted">
                            <th className="py-3.5 px-5 font-bold">Order</th>
                            <th className="py-3.5 px-4 font-bold">Attendee</th>
                            <th className="py-3.5 px-4 font-bold">Contact</th>
                            <th className="py-3.5 px-4 font-bold">Pass</th>
                            <th className="py-3.5 px-4 font-bold">Presence</th>
                            <th className="py-3.5 px-4 font-bold">Status</th>
                            <th className="py-3.5 px-5 font-bold text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.05]">
                          {searchResults.map(p => (
                            <tr key={p._id} className="adm-pa-row">
                              <td className="py-4 px-5 whitespace-nowrap">
                                <OrderIdChip id={p.orderId} />
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-3">
                                  <div className={`adm-pa-avatar ${avatarTone(p.holderName)}`}>
                                    {initials(p.holderName)}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="font-sans font-bold text-white block text-[13px] leading-tight">{p.holderName || '—'}</span>
                                    {isSuperAdmin && selectedEventScope === 'ALL' && p.eventName && (
                                      <span className="text-[10px] text-text-muted">{p.eventName}</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="space-y-1">
                                  <a href={`tel:${p.phone}`} className="flex items-center gap-1.5 text-white hover:text-primary transition-colors whitespace-nowrap">
                                    <Phone className="w-3 h-3 text-text-muted" />{p.phone}
                                  </a>
                                  {p.email ? (
                                    <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-info/90 hover:text-info hover:underline break-all" title={p.email}>
                                      <Mail className="w-3 h-3 text-text-muted flex-shrink-0" />{p.email}
                                    </a>
                                  ) : (
                                    <span className="flex items-center gap-1.5 text-text-muted/50"><Mail className="w-3 h-3" />—</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <span className="block text-white font-semibold font-sans text-[13px] leading-snug">{p.tierName || p.badge}</span>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <ChannelChip channel={p.channel} />
                                  <span className="font-bold text-primary">₹{((p.amountPaise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                </div>
                              </td>
                              <td className="py-4 px-4"><PresenceChip pass={p} /></td>
                              <td className="py-4 px-4"><StatusChip status={p.status} /></td>
                              <td className="py-4 px-5 text-right">
                                <button
                                  type="button"
                                  onClick={() => openPassDetail(p)}
                                  className="adm-pa-view"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View
                                  <ChevronRight className="w-3.5 h-3.5 -mr-1" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden p-3 space-y-3">
                      {searchResults.map(p => (
                        <div key={p._id} className="adm-pa-card rounded-2xl p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`adm-pa-avatar ${avatarTone(p.holderName)}`}>{initials(p.holderName)}</div>
                              <div className="min-w-0">
                                <span className="font-bold text-white block text-sm truncate">{p.holderName || '—'}</span>
                                <span className="text-[11px] font-mono text-text-muted truncate block">{p.tierName || p.badge}</span>
                              </div>
                            </div>
                            <span className="font-comic text-xl text-primary leading-none flex-shrink-0">₹{((p.amountPaise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-3">
                            <OrderIdChip id={p.orderId} />
                            <ChannelChip channel={p.channel} />
                            <PresenceChip pass={p} />
                            <StatusChip status={p.status} />
                          </div>
                          <div className="grid grid-cols-[1fr_auto] items-end gap-3 mt-3 pt-3 border-t border-white/[0.06] font-mono text-xs">
                            <div className="space-y-1 min-w-0">
                              <a href={`tel:${p.phone}`} className="flex items-center gap-1.5 text-white"><Phone className="w-3 h-3 text-text-muted" />{p.phone}</a>
                              {p.email && <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-info truncate"><Mail className="w-3 h-3 text-text-muted flex-shrink-0" /><span className="truncate">{p.email}</span></a>}
                            </div>
                            <button type="button" onClick={() => openPassDetail(p)} className="adm-pa-view">
                              <Eye className="w-3.5 h-3.5" /> View
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            );
          })()}

          {/* ======================================================== */}
          {/* VIEW: SPONSORS & EXHIBITION STALLS INQUIRY CRM */}
          {/* ======================================================== */}
          {activeTab === 'INQUIRIES' && (
            <div className="space-y-6">
              {/* Header Box */}
              <div className="p-6 rounded-3xl bg-surface border-2 border-primary shadow-[6px_6px_0_#000] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-primary text-black border-2 border-black flex items-center justify-center font-comic text-2xl shadow-[3px_3px_0_#000]">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-comic text-2xl sm:text-3xl text-primary tracking-wide">
                        SPONSORS & EXHIBITION STALLS CRM
                      </h3>
                      <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-surface-2 border border-border text-info">
                        MULTI-EVENT ISOLATED
                      </span>
                    </div>
                    <p className="text-xs font-mono text-text-muted mt-0.5">
                      {isEventAdmin
                        ? `Viewing verified business inquiries exclusively submitted for: ${currentUser.assignedEventId || 'no event'}`
                        : selectedEventScope === 'ALL'
                        ? 'Viewing all incoming brand inquiries across the entire multi-tenant network.'
                        : `Filtered to event: ${selectedEventScope}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {unreadInquiriesCount > 0 && (
                    <ComicButton
                      variant="outline"
                      size="sm"
                      onClick={handleMarkAllInquiriesRead}
                    >
                      <Check className="w-4 h-4 mr-1.5 text-success" />
                      <span>MARK ALL READ</span>
                    </ComicButton>
                  )}

                  <ComicButton
                    variant="primary"
                    size="sm"
                    onClick={() => loadAllData()}
                  >
                    <RefreshCw className="w-4 h-4 mr-1.5 text-black" />
                    <span>REFRESH LEADS</span>
                  </ComicButton>
                </div>
              </div>

              {/* Platform commission on website-sourced sponsor/stall deals */}
              <div className="relative rounded-3xl p-[2px] shadow-[6px_6px_0_#000]" style={{ background: 'linear-gradient(135deg, #FFD60A, #16A34A 60%, #22D3EE)' }}>
                <div className="relative rounded-[calc(1.5rem-2px)] bg-[#0D0D1A] p-5 overflow-hidden">
                  <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ background: 'radial-gradient(circle at 0% 0%, #FFD60A, transparent 55%)' }} />
                  <div className="relative flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div>
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Partner commission</span>
                      <h3 className="font-comic text-2xl text-white uppercase tracking-wide leading-none">
                        {commissionStats.ratePct}% on every sponsor & stall deal
                      </h3>
                      <p className="text-[11px] font-mono text-text-muted mt-1 max-w-xl">
                        When a lead from the website is marked ACCEPTED, its final deal value is recorded and the commission becomes due to FlashPass.
                      </p>
                    </div>
                    {isSuperAdmin && (
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            placeholder={String(commissionStats.ratePct)}
                            value={commissionRateInput}
                            onChange={(e) => setCommissionRateInput(e.target.value)}
                            className="w-24 bg-[#14142A] border-2 border-primary/60 rounded-xl pl-3 pr-7 py-2 font-mono text-sm text-primary font-bold focus:outline-none focus:border-primary"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-primary">%</span>
                        </div>
                        <input
                          type="password"
                          maxLength={6}
                          placeholder="PIN"
                          value={adminPin}
                          onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                          className="w-24 bg-[#14142A] border-2 border-accent/60 rounded-xl p-2 font-mono text-center tracking-widest text-sm text-accent font-bold"
                        />
                        <button
                          type="button"
                          onClick={handleSaveCommissionRate}
                          disabled={commissionRateInput === ''}
                          className="px-4 py-2 rounded-xl bg-primary text-black font-mono text-xs font-bold border-2 border-black shadow-[2px_2px_0_#000] disabled:opacity-40"
                        >
                          Set rate
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: 'Commission due', value: commissionStats.duePaise, c: 'text-warning' },
                      { label: 'Commission received', value: commissionStats.paidPaise, c: 'text-success' },
                      { label: 'Deals closed', value: null, raw: commissionStats.closedDeals, c: 'text-info' },
                      { label: 'Deal value closed', value: commissionStats.dealValuePaise, c: 'text-white' }
                    ].map(s => (
                      <div key={s.label} className="rounded-2xl bg-white/[0.04] border border-white/10 p-3">
                        <div className={`font-comic text-3xl leading-none ${s.c}`}>
                          {s.value === null ? s.raw : `₹${(s.value / 100).toLocaleString('en-IN')}`}
                        </div>
                        <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats Cards Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000]">
                  <span className="text-[10px] font-mono uppercase text-text-muted font-bold block mb-1">
                    TOTAL INQUIRIES
                  </span>
                  <div className="font-comic text-4xl text-text">
                    {inquiryStats.total}
                  </div>
                  <span className="text-xs font-mono text-text-muted">Total leads received</span>
                </div>

                <div className="p-5 rounded-3xl bg-surface border-2 border-yellow-400/60 shadow-[4px_4px_0_#000]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-mono uppercase text-yellow-400 font-bold block">
                      🏆 SPONSORS
                    </span>
                    <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                  </div>
                  <div className="font-comic text-4xl text-yellow-400">
                    {inquiryStats.sponsors}
                  </div>
                  <span className="text-xs font-mono text-text-muted">Brand partnerships</span>
                </div>

                <div className="p-5 rounded-3xl bg-surface border-2 border-accent/60 shadow-[4px_4px_0_#000]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-mono uppercase text-accent font-bold block">
                      🎪 STALLS / BOOTHS
                    </span>
                    <span className="w-2 h-2 rounded-full bg-accent"></span>
                  </div>
                  <div className="font-comic text-4xl text-accent">
                    {inquiryStats.stalls}
                  </div>
                  <span className="text-xs font-mono text-text-muted">Creators & food stalls</span>
                </div>

                <div className="p-5 rounded-3xl bg-surface border-2 border-danger/60 shadow-[4px_4px_0_#000]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-mono uppercase text-danger font-bold block">
                      🔔 UNREAD / NEW
                    </span>
                    {unreadInquiriesCount > 0 && (
                      <span className="w-2 h-2 rounded-full bg-danger animate-ping"></span>
                    )}
                  </div>
                  <div className="font-comic text-4xl text-danger">
                    {unreadInquiriesCount}
                  </div>
                  <span className="text-xs font-mono text-text-muted">Awaiting initial contact</span>
                </div>
              </div>

              {/* Filtering Controls */}
              <div className="p-4 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] flex flex-wrap items-center justify-between gap-4">
                {/* Category Sub-Tabs (All, Sponsors, Stalls) */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setInquirySubTab('ALL')}
                    className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all ${
                      inquirySubTab === 'ALL'
                        ? 'bg-primary text-black shadow-[2px_2px_0_#000]'
                        : 'bg-surface-2 text-text-muted hover:text-white border border-border'
                    }`}
                  >
                    ALL LEADS ({inquiriesList.length})
                  </button>

                  <button
                    onClick={() => setInquirySubTab('SPONSOR')}
                    className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 ${
                      inquirySubTab === 'SPONSOR'
                        ? 'bg-yellow-400 text-black shadow-[2px_2px_0_#000]'
                        : 'bg-surface-2 text-text-muted hover:text-white border border-border'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>🏆 SPONSORS ({inquiriesList.filter(i => i.type === 'SPONSOR').length})</span>
                  </button>

                  <button
                    onClick={() => setInquirySubTab('STALL')}
                    className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 ${
                      inquirySubTab === 'STALL'
                        ? 'bg-accent text-white shadow-[2px_2px_0_#000]'
                        : 'bg-surface-2 text-text-muted hover:text-white border border-border'
                    }`}
                  >
                    <Store className="w-3.5 h-3.5" />
                    <span>🎪 STALLS & CREATORS ({inquiriesList.filter(i => i.type === 'STALL').length})</span>
                  </button>

                  {['GROUP', 'AMBASSADOR', 'ORGANIZER'].map((t) => {
                    const meta = INQUIRY_META[t];
                    return (
                      <button
                        key={t}
                        onClick={() => setInquirySubTab(t)}
                        className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 ${
                          inquirySubTab === t
                            ? `${meta.solid} shadow-[2px_2px_0_#000]`
                            : 'bg-surface-2 text-text-muted hover:text-white border border-border'
                        }`}
                      >
                        <meta.icon className="w-3.5 h-3.5" />
                        <span>{meta.tab} ({inquiriesList.filter(i => i.type === t).length})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Status Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                  <span className="text-[11px] text-text-muted font-bold mr-1">Status:</span>
                  {['ALL', 'NEW', 'CONTACTED', 'ACCEPTED', 'REJECTED'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setInquiryStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        inquiryStatusFilter === st
                          ? 'bg-white text-black font-bold shadow-[1px_1px_0_#000]'
                          : 'bg-surface-2 text-text-muted hover:text-white border border-border/80'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inquiry Leads List */}
              {(() => {
                const filtered = inquiriesList.filter(item => {
                  if (inquirySubTab !== 'ALL' && item.type !== inquirySubTab) return false;
                  if (inquiryStatusFilter !== 'ALL' && item.status !== inquiryStatusFilter) return false;
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-12 text-center rounded-3xl bg-surface border-2 border-dashed border-border space-y-3">
                      <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto text-text-muted">
                        <Building2 className="w-7 h-7" />
                      </div>
                      <h4 className="font-comic text-2xl text-text">NO INQUIRIES FOUND</h4>
                      <p className="text-xs font-mono text-text-muted max-w-md mx-auto">
                        No inquiries match the current filter. Prospective sponsors and stall holders can submit their leads directly on the live event landing page.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {filtered.map(item => {
                      const isSponsor = item.type === 'SPONSOR';
                      const meta = inquiryMeta(item.type);
                      const isUnread = !item.isRead;
                      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '';

                      const waMsg = encodeURIComponent(
                        `Hello ${item.contactPerson}! This is regarding your ${meta.topic} inquiry for ${item.eventName || 'our upcoming event'} (${item.inquiryId}). We would love to discuss the details with you!`
                      );

                      return (
                        <div
                          key={item._id}
                          className={`p-6 rounded-3xl bg-surface border-2 transition-all shadow-[4px_4px_0_#000] ${
                            isUnread
                              ? 'border-accent shadow-[0_0_20px_rgba(255,46,136,0.15),4px_4px_0_#000]'
                              : meta.border
                          }`}
                        >
                          {/* Card Top Meta */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border mb-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-primary">
                                {item.inquiryId}
                              </span>

                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${meta.chip}`}>
                                {meta.label}
                              </span>

                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-surface-2 text-text-muted border border-border">
                                🎪 {item.eventName || item.eventId}
                              </span>

                              {isUnread && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-danger text-white animate-pulse">
                                  ● NEW
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 font-mono text-xs text-text-muted">
                              <Clock className="w-3.5 h-3.5" />
                              <span>{dateStr}</span>
                            </div>
                          </div>

                          {/* Brand & Main Details */}
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Column 1: Brand & Contact Info */}
                            <div className="space-y-3">
                              <div>
                                <h4 className="font-comic text-2xl text-white tracking-wide">
                                  {item.brandName}
                                </h4>
                                <div className="text-xs font-mono text-text-muted mt-0.5 flex items-center gap-1.5">
                                  <Users className="w-3.5 h-3.5 text-primary" />
                                  <span>Contact Person: <strong className="text-text">{item.contactPerson}</strong></span>
                                </div>
                              </div>

                              {/* Direct Contact Action Buttons */}
                              <div className="flex flex-wrap gap-2 pt-1">
                                {item.phone && (
                                  <>
                                    <a
                                      href={`https://wa.me/91${item.phone}?text=${waMsg}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-3 py-1.5 rounded-xl bg-success/20 hover:bg-success text-success hover:text-black border border-success/40 font-mono text-xs font-bold transition-all flex items-center gap-1.5 shadow-[2px_2px_0_#000]"
                                    >
                                      <MessageSquare className="w-3.5 h-3.5" />
                                      <span>WhatsApp</span>
                                    </a>

                                    <a
                                      href={`tel:+91${item.phone}`}
                                      className="px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-white text-text-muted hover:text-black border border-border font-mono text-xs font-bold transition-all flex items-center gap-1.5 shadow-[2px_2px_0_#000]"
                                    >
                                      <Phone className="w-3.5 h-3.5" />
                                      <span>+91 {item.phone}</span>
                                    </a>
                                  </>
                                )}

                                {item.email && (
                                  <a
                                    href={`mailto:${item.email}?subject=${encodeURIComponent(`${item.eventName || 'Event'} ${item.type} Inquiry`)}`}
                                    className="px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-white text-text-muted hover:text-black border border-border font-mono text-xs font-bold transition-all flex items-center gap-1.5 shadow-[2px_2px_0_#000]"
                                  >
                                    <Mail className="w-3.5 h-3.5" />
                                    <span>{item.email}</span>
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Column 2: Inquiry Parameters & Proposal */}
                            <div className="p-4 rounded-2xl bg-surface-2 border border-border font-mono text-xs space-y-2">
                              {isSponsor ? (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-text-muted">Sponsorship Tier:</span>
                                    <strong className="text-yellow-400">{item.sponsorshipTier || 'ASSOCIATE_SPONSOR'}</strong>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-text-muted">Estimated Budget:</span>
                                    <strong className="text-primary">{item.budget || 'Open for discussion'}</strong>
                                  </div>
                                </>
                              ) : meta.sizeLabel ? (
                                <>
                                  <div className="flex justify-between gap-3">
                                    <span className="text-text-muted">{meta.sizeLabel}:</span>
                                    <strong className="text-primary text-right">{item.budget || '—'}</strong>
                                  </div>
                                  {meta.categoryLabel && (
                                    <div className="flex justify-between gap-3">
                                      <span className="text-text-muted">{meta.categoryLabel}:</span>
                                      <strong className="text-text text-right">{item.category || '—'}</strong>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-text-muted">Stall / Booth Type:</span>
                                    <strong className="text-accent">{item.stallType || 'STANDARD_BOOTH'}</strong>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-text-muted">Category:</span>
                                    <strong className="text-text">{item.category || 'Pop Culture Merchandise'}</strong>
                                  </div>
                                </>
                              )}

                              {item.message && (
                                <div className="pt-2 border-t border-border/60">
                                  <span className="text-[10px] uppercase text-text-muted font-bold block mb-1">
                                    Special Requirements / Note:
                                  </span>
                                  <p className="text-text/90 italic bg-surface/60 p-2 rounded-lg border border-border/40 text-[11px] leading-relaxed">
                                    "{item.message}"
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Column 3: Admin Review & Status Management */}
                            <div className="space-y-3 flex flex-col justify-between">
                              <div>
                                <label className="block text-[11px] font-mono text-text-muted uppercase mb-1 font-bold">
                                  Lead Status
                                </label>
                                <select
                                  value={item.status}
                                  onChange={(e) => handleUpdateInquiryStatus(item, e.target.value)}
                                  className={`w-full font-mono text-xs font-bold rounded-xl px-3 py-2 border-2 focus:outline-none cursor-pointer ${
                                    item.status === 'NEW'
                                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                                      : item.status === 'CONTACTED'
                                      ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                                      : item.status === 'ACCEPTED'
                                      ? 'bg-success/20 text-success border-success/50'
                                      : 'bg-danger/20 text-danger border-danger/50'
                                  }`}
                                >
                                  <option value="NEW" className="bg-[#121220] text-blue-400">🟢 NEW (Unreviewed)</option>
                                  <option value="CONTACTED" className="bg-[#121220] text-yellow-400">🟡 CONTACTED (In Negotiation)</option>
                                  <option value="ACCEPTED" className="bg-[#121220] text-success">🟣 ACCEPTED (Confirmed Deal)</option>
                                  <option value="REJECTED" className="bg-[#121220] text-danger">🔴 REJECTED (Declined)</option>
                                </select>
                              </div>

                              {/* Platform commission on this closed deal */}
                              {item.commissionStatus && item.commissionStatus !== 'NONE' && (
                                <div className={`p-3 rounded-2xl border-2 font-mono text-xs space-y-1.5 ${
                                  item.commissionStatus === 'PAID' ? 'bg-success/10 border-success/50' : 'bg-warning/10 border-warning/60'
                                }`}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase font-bold text-text-muted">FlashPass commission</span>
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border-2 border-black ${
                                      item.commissionStatus === 'PAID' ? 'bg-success text-black' : 'bg-warning text-black'
                                    }`}>
                                      {item.commissionStatus === 'PAID' ? '✓ RECEIVED' : '● DUE'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-text-muted">
                                    <span>Deal value</span>
                                    <span className="text-text">₹{((item.dealAmountPaise || 0) / 100).toLocaleString('en-IN')}</span>
                                  </div>
                                  <div className="flex justify-between items-baseline">
                                    <span className="text-text-muted">{item.commissionPct}% commission</span>
                                    <strong className={`font-comic text-xl ${item.commissionStatus === 'PAID' ? 'text-success' : 'text-warning'}`}>
                                      ₹{((item.commissionPaise || 0) / 100).toLocaleString('en-IN')}
                                    </strong>
                                  </div>
                                  {item.commissionStatus === 'PAID' && item.commissionPaidAt && (
                                    <div className="text-[10px] text-text-muted">
                                      Received {new Date(item.commissionPaidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </div>
                                  )}
                                  {item.commissionStatus === 'DUE' && isSuperAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => handleMarkCommissionPaid(item)}
                                      className="w-full mt-1 py-1.5 rounded-xl bg-success text-black font-bold border-2 border-black shadow-[2px_2px_0_#000] hover:-translate-y-0.5 transition-all"
                                    >
                                      Mark as received ✓
                                    </button>
                                  )}
                                  {item.commissionStatus === 'DUE' && !isSuperAdmin && (
                                    <div className="text-[10px] text-text-muted leading-snug">Payable to FlashPass for this website-sourced deal.</div>
                                  )}
                                </div>
                              )}

                              {/* Internal Admin Note */}
                              <div>
                                <label className="block text-[10px] font-mono text-text-muted uppercase mb-1 font-bold flex justify-between">
                                  <span>Internal Admin Notes</span>
                                  {inquirySavingId === item._id && <span className="text-primary text-[9px]">Saving...</span>}
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="e.g. Offered 10% discount on stall #4"
                                    value={inquiryNoteInput[item._id] !== undefined ? inquiryNoteInput[item._id] : (item.adminNotes || '')}
                                    onChange={(e) => setInquiryNoteInput({ ...inquiryNoteInput, [item._id]: e.target.value })}
                                    className="flex-1 bg-surface-2 border border-border focus:border-primary rounded-xl px-2.5 py-1.5 font-mono text-[11px] text-text focus:outline-none"
                                  />
                                  <button
                                    onClick={() => handleSaveInquiryNote(item._id)}
                                    className="px-2.5 py-1.5 rounded-xl bg-surface-2 hover:bg-primary text-text-muted hover:text-black font-mono text-xs font-bold border border-border transition-all"
                                    title="Save internal note"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>

                              {/* Delete Action */}
                              <div className="flex justify-end pt-1">
                                <button
                                  onClick={() => handleDeleteInquiry(item._id)}
                                  className="text-text-muted hover:text-danger text-[11px] font-mono flex items-center gap-1 transition-colors"
                                  title="Delete lead"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete Lead</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW: HELPDESK & LOST PHONE KIOSK MODE */}
          {/* ======================================================== */}
          {activeTab === 'HELPDESK' && (
            <div className="space-y-6">
              <div className="p-5 rounded-3xl bg-surface border-2 border-accent shadow-[4px_4px_0_#000] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-accent text-white border-2 border-black flex items-center justify-center font-comic text-2xl shadow-[3px_3px_0_#000]">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-comic text-2xl text-accent">HELPDESK & LOST PHONE KIOSK</h3>
                    <p className="text-xs font-mono text-text-muted">
                      Verify attendee face photo, search by mobile or name, and 1-click reissue digital pass (invalidates old QR).
                    </p>
                  </div>
                </div>
              </div>

              {/* Search Box */}
              <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000]">
                <form onSubmit={handleHelpdeskSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-5 h-5 absolute left-3.5 top-3 text-text-muted" />
                    <input
                      type="text"
                      placeholder="Type 10-digit mobile, attendee name, or Order ID (e.g. 9876543210 or Sourav)..."
                      value={helpdeskQuery}
                      onChange={(e) => setHelpdeskQuery(e.target.value)}
                      className="w-full bg-surface-2 border-2 border-border rounded-2xl pl-11 pr-4 py-2.5 font-mono text-sm text-text placeholder-text-muted/60 focus:outline-none focus:border-accent"
                    />
                  </div>
                  <ComicButton type="submit" variant="accent" size="md">
                    {helpdeskLoading ? 'SEARCHING...' : 'SEARCH ATTENDEE'}
                  </ComicButton>
                </form>
              </div>

              {/* Helpdesk Results Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {helpdeskResults.map((p) => (
                  <div key={p.passId || p._id} className="p-4 rounded-3xl bg-surface border-2 border-border shadow-[3px_3px_0_#000] flex flex-col justify-between">
                    <div className="flex items-start gap-3.5 mb-3">
                      {p.photoUrl ? (
                        <div className="relative flex-shrink-0">
                          <img
                            src={p.photoUrl}
                            alt={p.holderName}
                            className="w-20 h-20 rounded-2xl object-cover border-2 border-black shadow-[2px_2px_0_#000] bg-surface-2"
                          />
                          <span className="absolute -bottom-1.5 inset-x-0 mx-auto w-max px-1.5 py-0.2 rounded bg-success text-black font-mono text-[8px] font-bold">
                            VERIFIED
                          </span>
                        </div>
                      ) : (
                        <div className="w-20 h-20 rounded-2xl bg-surface-2 border-2 border-dashed border-border flex items-center justify-center text-text-muted text-xs font-mono">
                          No Photo
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <span className="font-comic text-xl text-text truncate block">{p.holderName}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            p.tierId === 'vip' ? 'bg-primary text-black' : p.tierId === 'cosplay' ? 'bg-accent text-white' : 'bg-surface-2 text-text-muted'
                          }`}>
                            {p.tierName || p.badge || 'GENERAL'}
                          </span>
                        </div>
                        <span className="font-mono text-xs text-text-muted block mt-0.5">{p.phone}</span>
                        <span className="font-mono text-[11px] text-primary block mt-0.5 font-bold">Pass: {p.orderId}</span>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            p.presence === 'INSIDE' ? 'bg-success/20 text-success' : 'bg-surface-2 text-text-muted'
                          }`}>
                            ● {p.presence || 'OUTSIDE'}
                          </span>
                          <span className="text-[10px] font-mono text-text-muted">
                            Zones: {(p.allowedZones || ['MAIN_HALL']).join(', ')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border/70 pt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleHelpdeskReissue(p)}
                        className="flex-1 py-2 rounded-xl bg-accent text-white font-mono text-xs font-bold border-2 border-black shadow-[2px_2px_0_#000] hover:bg-accent/90"
                      >
                        🔄 REISSUE PASS (INVALIDATE OLD QR)
                      </button>
                      <a
                        href={`/pass/${p.orderId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 rounded-xl bg-surface-2 border border-border text-text font-mono text-xs font-bold hover:border-primary flex items-center justify-center"
                      >
                        VIEW PASS ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              {helpdeskResults.length === 0 && !helpdeskLoading && (
                <div className="p-8 text-center bg-surface-2/40 border border-border rounded-3xl">
                  <p className="font-mono text-sm text-text-muted">
                    No attendee found. Type a mobile number or name above to look up passes.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 4: GATES & INGRESS SAFETY */}
          {/* ======================================================== */}
          {activeTab === 'GATES' && (
            <div className="space-y-6">
              {/* MASTER EMERGENCY EVACUATION SIREN CONTROL */}
              <div className={`p-5 rounded-3xl border-4 transition-all ${
                emergencyEvacuation?.active
                  ? 'bg-danger/20 border-danger shadow-[6px_6px_0_#FF2E88] animate-pulse'
                  : 'bg-surface border-border shadow-[4px_4px_0_#000]'
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-comic text-2xl border-2 border-black ${
                      emergencyEvacuation?.active ? 'bg-danger text-white animate-bounce' : 'bg-surface-2 text-text'
                    }`}>
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-comic text-2xl text-text">
                        EMERGENCY EVACUATION PROTOCOL
                      </h3>
                      <p className="font-mono text-xs text-text-muted">
                        Broadcasts 1-click flashing siren to all volunteer scanners and unlocks all turnstiles for unrestricted egress.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {emergencyEvacuation?.active ? (
                      <button
                        type="button"
                        onClick={() => handleTriggerEvacuation(false)}
                        className="px-5 py-2.5 rounded-2xl bg-white text-danger font-mono text-xs font-bold border-2 border-black shadow-[3px_3px_0_#000] hover:bg-gray-100"
                      >
                        DEACTIVATE / STAND DOWN SIREN
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleTriggerEvacuation(true)}
                        className="px-5 py-2.5 rounded-2xl bg-danger text-white font-mono text-xs font-bold border-2 border-black shadow-[3px_3px_0_#000] hover:bg-danger/90 flex items-center gap-2"
                      >
                        <Volume2 className="w-4 h-4" />
                        <span>TRIGGER RED SIREN EVACUATION</span>
                      </button>
                    )}
                  </div>
                </div>

                {emergencyEvacuation?.active && (
                  <div className="mt-3 p-3 rounded-xl bg-danger text-white font-mono text-xs font-bold flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping"></span>
                    <span>ACTIVE MESSAGE: {emergencyEvacuation.message || 'Please proceed calmly to emergency exits.'}</span>
                  </div>
                )}
              </div>
              {/* Gate Capacity & Status Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000]">
                  <span className="text-[10px] font-mono uppercase text-text-muted font-bold block mb-1">TOTAL INGRESS TODAY</span>
                  <div className="font-comic text-3xl text-success">
                    {metrics?.attendance?.todayFootfall || 0}
                  </div>
                  <span className="text-xs font-mono text-text-muted">Unique valid scans</span>
                </div>

                <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000]">
                  <span className="text-[10px] font-mono uppercase text-text-muted font-bold block mb-1">RE-ENTRIES ALLOWED</span>
                  <div className="font-comic text-3xl text-warning">
                    {metrics?.attendance?.reEntriesToday || 0}
                  </div>
                  <span className="text-xs font-mono text-text-muted">Returning attendees</span>
                </div>

                <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000]">
                  <span className="text-[10px] font-mono uppercase text-text-muted font-bold block mb-1">EMERGENCY KILL SWITCH</span>
                  <div className="font-comic text-2xl text-text mt-1">
                    {settingsForm.emergencyLockdown ? (
                      <span className="text-danger flex items-center gap-1.5 animate-pulse">
                        <AlertTriangle className="w-5 h-5" /> LOCKDOWN ACTIVE
                      </span>
                    ) : (
                      <span className="text-success">NORMAL (GATES OPEN)</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Gate Scanners & Quick Links */}
              <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000]">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-comic text-xl text-primary">GATE STATIONS & DEVICES</h3>
                  <a
                    href="/gate"
                    target="_blank"
                    className="flex items-center gap-1 text-xs font-mono text-info hover:underline"
                  >
                    Open Live Gate Scanner in New Tab →
                  </a>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                  {['Gate 1 (Main Entrance)', 'Gate 2 (VIP / Cosplay)', 'Gate 3 (Exit Lane)'].map((g, idx) => (
                    <div key={idx} className="p-4 rounded-2xl bg-surface-2 border border-border">
                      <div className="flex justify-between items-center mb-2">
                        <strong className="text-text">{g}</strong>
                        <span className="w-2 h-2 rounded-full bg-success animate-ping"></span>
                      </div>
                      <span className="text-[11px] text-text-muted block">Status: Online & Ready</span>
                      <span className="text-[11px] text-text-muted block">Latency: &lt; 200ms</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 5: FINANCIAL LEDGER */}
          {/* ======================================================== */}
          {activeTab === 'LEDGER' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000]">
                <div>
                  <h3 className="font-comic text-2xl text-primary">
                    {isEventAdmin ? 'EVENT EARNINGS & BANK SETTLEMENT LEDGER' : 'AUDITED FINANCIAL LEDGER'}
                  </h3>
                  <p className="text-xs font-mono text-text-muted">
                    {isEventAdmin
                      ? 'Reconciled event collections, flat platform SaaS fee breakdown, and verified organizer payout records.'
                      : 'Immutable double-entry transaction record. Guaranteed multi-tenant reconciliation.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ComicButton variant="outline" size="sm" onClick={() => handleExport('ledger')}>
                    <Download className="w-4 h-4 mr-1.5" />
                    <span>EXPORT LEDGER CSV</span>
                  </ComicButton>
                </div>
              </div>

              {/* Dedicated Organizer Payout Settlement Card */}
              {isEventAdmin && (
                <OrganizerPayoutCard
                  metrics={metrics}
                  eventName={metrics?.settings?.eventName}
                  onExportLedger={() => handleExport('ledger')}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-3xl bg-surface border border-border">
                  <span className="text-[10px] font-mono uppercase text-text-muted block mb-1">Total Gross Ticketing</span>
                  <div className="font-comic text-3xl text-primary">₹{metrics?.ledger?.grossRupees || '0.00'}</div>
                  <span className="text-[11px] font-mono text-text-muted">
                    Online: ₹{metrics?.ledger?.onlineGrossRupees || '0.00'} • Cash: ₹{metrics?.ledger?.cashGrossRupees || '0.00'}
                  </span>
                </div>
                <div className="p-5 rounded-3xl bg-surface border border-border">
                  <span className="text-[10px] font-mono uppercase text-text-muted block mb-1">Organizer Net Take-Home</span>
                  <div className="font-comic text-3xl text-success">₹{metrics?.ledger?.organizerRupees || '0.00'}</div>
                  <span className="text-[11px] font-mono text-success">● Verified ready for disbursement</span>
                </div>
                <div className="p-5 rounded-3xl bg-surface border border-border">
                  <span className="text-[10px] font-mono uppercase text-text-muted block mb-1">Platform SaaS Fee Deducted</span>
                  <div className="font-comic text-3xl text-info">₹{metrics?.ledger?.platformRupees || '0.00'}</div>
                  <span className="text-[11px] font-mono text-text-muted">Flat ₹2 SaaS convenience fee / pass</span>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 6: STAFF & RBAC USERS */}
          {/* ======================================================== */}
          {activeTab === 'STAFF' && (
            <div className="space-y-6">
              <DemoPinBanner refreshKey={securityKey} />
              <ShiftsPanel onExport={handleExport} />
              <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000]">
                <div>
                  <h3 className="font-comic text-2xl text-info">STAFF CREDENTIALS & ACCESS</h3>
                  <p className="text-xs font-mono text-text-muted">
                    Manage event staff, box office cashiers, and gate security volunteers.
                  </p>
                </div>
                <ComicButton variant="info" size="sm" onClick={() => setNewStaffModal(true)}>
                  <PlusCircle className="w-4 h-4 mr-2" />
                  <span>+ ADD NEW STAFF</span>
                </ComicButton>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {staffUsersList.map(u => (
                  <div key={u._id} className="p-4 rounded-3xl bg-surface border-2 border-border shadow-[3px_3px_0_#000]">
                    <div className="flex justify-between items-start mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        u.role === 'SUPER_ADMIN' ? 'bg-accent text-white' :
                        u.role === 'EVENT_ADMIN' ? 'bg-primary text-black' :
                        u.role === 'CASHIER' ? 'bg-warning/20 text-warning' : 'bg-info/20 text-info'
                      }`}>
                        {u.role}
                      </span>
                      <span className={`text-[10px] font-mono ${u.active === false ? 'text-danger' : 'text-success'}`}>{u.active === false ? '● Switched off' : '● Active'}</span>
                    </div>
                    <strong className="font-comic text-xl text-text block">{u.name}</strong>
                    <span className="font-mono text-xs text-text-muted block">Username: @{u.username}</span>
                    <span className="font-mono text-[11px] text-text-muted block mt-2">
                      Event: {u.assignedEventId || 'Global Platform'}
                    </span>
                    <StaffActions user={u} currentUserId={currentUser.id} onChanged={async () => { await loadAllData(); setSecurityKey(k => k + 1); }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 7: EVENT CMS & POLICIES */}
          {/* ======================================================== */}
          {activeTab === 'SETTINGS' && (
            <div className="space-y-6">
              <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-comic text-2xl text-primary">EVENT CMS, TIERS & POLICY COMMAND</h3>
                  <p className="text-xs font-mono text-text-muted">
                    Manage multi-tier categories, coupon engines, merch inventory, live notices, and ingress policies.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <ComicButton variant="outline" size="sm" onClick={handleOpenExecutiveReport}>
                    <FileText className="w-4 h-4 mr-1 text-accent" />
                    <span>AUDIT CERTIFICATE</span>
                  </ComicButton>
                </div>
              </div>

              {/* Sub-Navigation Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-white/[0.08]">
                {[
                  { id: 'CMS', label: '1. CORE CMS & RULES' },
                  { id: 'TIERS', label: `2. TICKET TIERS (${ticketTiers.length})` },
                  { id: 'COUPONS', label: `3. PROMO CODES (${coupons.length})` },
                  { id: 'MERCH', label: `4. MERCH PRE-ORDERS (${addOns.length})` },
                  { id: 'AFFILIATES', label: `5. AMBASSADORS (${affiliates.length})` },
                  { id: 'ANNOUNCEMENTS', label: `6. LIVE NOTICES (${liveAnnouncements.length})` },
                  { id: 'PAYMENT', label: '7. PAYMENT GATEWAYS (5 SERVICES)' }
                ].map(sub => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setSettingsSubTab(sub.id)}
                    className={`px-3.5 py-2 rounded-xl font-mono text-xs font-bold transition-all whitespace-nowrap ${
                      settingsSubTab === sub.id
                        ? 'bg-primary text-black shadow-[2px_2px_0_#000]'
                        : 'bg-surface-2 text-text-muted hover:text-white'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>

              {/* SUB-VIEW 1: CORE CMS & GATE RULES */}
              {settingsSubTab === 'CMS' && (
                <form onSubmit={handleSaveSettings} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Card 1: Event CMS Branding */}
                    <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] space-y-4">
                      <h4 className="font-comic text-lg text-primary flex items-center gap-2">
                        <span>📄 1. EVENT BRANDING & CMS</span>
                      </h4>
                      <div>
                        <label className="text-xs font-mono text-text-muted block mb-1">Event Title</label>
                        <input
                          type="text"
                          required
                          value={settingsForm.eventName}
                          onChange={(e) => setSettingsForm({ ...settingsForm, eventName: e.target.value })}
                          className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-mono text-text-muted block mb-1">Venue Location</label>
                        <input
                          type="text"
                          required
                          value={settingsForm.venue}
                          onChange={(e) => setSettingsForm({ ...settingsForm, venue: e.target.value })}
                          className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                        />
                      </div>
                      {/* The event's days. Sold passes keep their day numbers, so they move with the dates. */}
                      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                        <div>
                          <label htmlFor="set-start-date" className="text-xs font-mono text-text-muted block mb-1">First day of the event</label>
                          <input
                            id="set-start-date"
                            type="date"
                            value={settingsForm.startDate || ''}
                            onChange={(e) => setSettingsForm({ ...settingsForm, startDate: e.target.value })}
                            className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text [color-scheme:dark]"
                          />
                        </div>
                        <div>
                          <label htmlFor="set-day-count" className="text-xs font-mono text-text-muted block mb-1">Days</label>
                          <select
                            id="set-day-count"
                            value={settingsForm.dayCount || 3}
                            onChange={(e) => setSettingsForm({ ...settingsForm, dayCount: Number(e.target.value) })}
                            className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                          >
                            {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n} {n === 1 ? 'day' : 'days'}</option>)}
                          </select>
                        </div>
                        {settingsForm.startDate && (
                          <p className="col-span-2 -mt-1 font-mono text-[10px] text-info">
                            {eventDatesFrom(settingsForm.startDate, settingsForm.dayCount || 3).map((d, i) => `Day ${i + 1}: ${new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`).join(' • ')}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-mono text-text-muted block mb-1">Announcement Notice</label>
                        <textarea
                          rows={3}
                          value={settingsForm.announcementText}
                          onChange={(e) => setSettingsForm({ ...settingsForm, announcementText: e.target.value })}
                          className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text resize-none"
                        />
                      </div>
                    </div>

                    {/* Card 2: Pricing & Capacity */}
                    <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] space-y-4">
                      <h4 className="font-comic text-lg text-info flex items-center gap-2">
                        <span>💰 2. PRICING & CAPACITY</span>
                      </h4>
                      <div>
                        <label className="text-xs font-mono text-text-muted block mb-1">Base Ticket Price (₹)</label>
                        <input
                          type="number"
                          min="0"
                          value={settingsForm.baseRupees}
                          onChange={(e) => setSettingsForm({ ...settingsForm, baseRupees: Number(e.target.value) })}
                          className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-mono text-text-muted block mb-1">Platform Convenience Fee (₹)</label>
                        <input
                          type="number"
                          min="0"
                          value={settingsForm.feeRupees}
                          onChange={(e) => setSettingsForm({ ...settingsForm, feeRupees: Number(e.target.value) })}
                          className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                        />
                      </div>
                      <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 flex justify-between items-center font-mono text-xs">
                        <span className="text-text-muted">Total Customer Price:</span>
                        <strong className="text-primary font-comic text-xl">
                          ₹{(Number(settingsForm.baseRupees) + Number(settingsForm.feeRupees)).toFixed(2)}
                        </strong>
                      </div>
                      <div>
                        <label className="text-xs font-mono text-text-muted block mb-1">Event Capacity Limit</label>
                        <input
                          type="number"
                          min="50"
                          value={settingsForm.capacity}
                          onChange={(e) => setSettingsForm({ ...settingsForm, capacity: Number(e.target.value) })}
                          className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                        />
                      </div>
                    </div>

                    {/* Card 3: Gate & Re-entry Policies */}
                    <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] space-y-4">
                      <h4 className="font-comic text-lg text-accent flex items-center gap-2">
                        <span>🛡️ 3. RE-ENTRY & GATE RULES</span>
                      </h4>

                      <div className="p-3 rounded-2xl bg-surface-2 border border-border">
                        <span className="font-mono text-xs font-bold text-text block mb-2">How re-entry is checked</span>
                        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Re-entry check method">
                          {[
                            { id: 'WRISTBAND', title: '✋ Hand stamp', hint: 'Scan once a day on entry. No exit scan.' },
                            { id: 'IN_OUT', title: '⇄ Scan in & out', hint: 'Scan at entry and exit gates.' }
                          ].map(opt => (
                            <button
                              key={opt.id}
                              type="button"
                              role="radio"
                              aria-checked={settingsForm.reentryMode === opt.id}
                              onClick={() => setSettingsForm({ ...settingsForm, reentryMode: opt.id })}
                              className={`rounded-xl p-2.5 text-left font-mono border ${
                                settingsForm.reentryMode === opt.id
                                  ? 'bg-accent text-white border-black shadow-[2px_2px_0_#000]'
                                  : 'bg-surface text-text-muted border-border'
                              }`}
                            >
                              <span className="block text-xs font-bold">{opt.title}</span>
                              <span className="block text-[10px] mt-0.5 opacity-80">{opt.hint}</span>
                            </button>
                          ))}
                        </div>
                        {settingsForm.reentryMode === 'WRISTBAND' && (
                          <p className="mt-2 font-mono text-[10px] text-warning leading-relaxed">
                            A pass gets one green per day. A second scan the same day shows "Already used today — check hand stamp". Use a different stamp colour each day.
                          </p>
                        )}
                      </div>

                      {settingsForm.reentryMode !== 'WRISTBAND' && (
                      <div className="p-3 rounded-2xl bg-surface-2 border border-border">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-mono text-xs font-bold text-text">Re-Entry Policy</span>
                          <button
                            type="button"
                            onClick={() => setSettingsForm({ ...settingsForm, allowReentry: !settingsForm.allowReentry })}
                            className={`px-3 py-1 rounded-lg font-mono text-xs font-bold ${
                              settingsForm.allowReentry
                                ? 'bg-success text-black border border-black shadow-[1px_1px_0_#000]'
                                : 'bg-danger text-white border border-black'
                            }`}
                          >
                            {settingsForm.allowReentry ? '✓ ALLOWED' : '✕ SINGLE ENTRY'}
                          </button>
                        </div>

                        {settingsForm.allowReentry && (
                          <div className="flex justify-between items-center pt-2 border-t border-border/50 font-mono text-[11px]">
                            <span className="text-text-muted">Max Re-entries/day:</span>
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={settingsForm.maxReentriesPerDay}
                              onChange={(e) => setSettingsForm({ ...settingsForm, maxReentriesPerDay: Number(e.target.value) })}
                              className="w-16 bg-surface border border-border rounded p-1 text-center font-mono text-xs text-text"
                            />
                          </div>
                        )}
                      </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                        <div>
                          <label className="text-[10px] text-text-muted block mb-1">Gate Open</label>
                          <input
                            type="text"
                            value={settingsForm.gateOpenTime}
                            onChange={(e) => setSettingsForm({ ...settingsForm, gateOpenTime: e.target.value })}
                            className="w-full bg-surface-2 border border-border rounded-xl p-2 font-mono text-xs text-text"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-text-muted block mb-1">Gate Close</label>
                          <input
                            type="text"
                            value={settingsForm.gateCloseTime}
                            onChange={(e) => setSettingsForm({ ...settingsForm, gateCloseTime: e.target.value })}
                            className="w-full bg-surface-2 border border-border rounded-xl p-2 font-mono text-xs text-text"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Public Card Display & Custom Highlight Fields */}
                  <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-comic text-lg text-primary flex items-center gap-2">
                          <span>🎨 4. PUBLIC EVENT CARD STATS & CUSTOM FIELDS</span>
                        </h4>
                        <p className="text-[11px] font-mono text-text-muted">
                          Choose which stats appear on the public event card and add custom fields like Date, Timing, Age Limit, etc.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const cd = settingsForm.cardDisplay || { showDays: true, showDailyCap: false, showTiers: false, customFields: [] };
                          if ((cd.customFields || []).length >= 8) return;
                          setSettingsForm({
                            ...settingsForm,
                            cardDisplay: {
                              ...cd,
                              customFields: [...(cd.customFields || []), { label: '', value: '', icon: 'CalendarDays' }]
                            }
                          });
                        }}
                        disabled={(settingsForm.cardDisplay?.customFields || []).length >= 8}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-black border-2 border-black font-mono text-xs font-bold shadow-[2px_2px_0_#000] hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Add Custom Field
                      </button>
                    </div>

                    {/* Built-in stat toggles */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { key: 'showDays', label: 'Show Days Count', hint: 'e.g. "3 Days"' },
                        { key: 'showDailyCap', label: 'Show Daily Capacity', hint: 'e.g. "20,000 Daily Cap"' },
                        { key: 'showTiers', label: 'Show Ticket Tiers', hint: 'e.g. "1 Tier"' }
                      ].map(({ key, label, hint }) => {
                        const cd = settingsForm.cardDisplay || { showDays: true, showDailyCap: false, showTiers: false, customFields: [] };
                        const checked = key === 'showDays' ? cd.showDays !== false : Boolean(cd[key]);
                        return (
                          <label
                            key={key}
                            className={`flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition-all ${
                              checked ? 'bg-primary/10 border-primary/50' : 'bg-surface-2 border-border'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => setSettingsForm({
                                ...settingsForm,
                                cardDisplay: { ...cd, [key]: e.target.checked }
                              })}
                              className="mt-0.5 accent-primary w-4 h-4 cursor-pointer"
                            />
                            <div>
                              <span className="font-mono text-xs font-bold text-text block">{label}</span>
                              <span className="font-mono text-[10px] text-text-muted">{hint}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {/* Custom Fields List */}
                    {(settingsForm.cardDisplay?.customFields || []).length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-border/60">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted block">
                          Custom Fields ({settingsForm.cardDisplay.customFields.length}/8)
                        </span>
                        {settingsForm.cardDisplay.customFields.map((field, idx) => (
                          <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_140px_auto] gap-2 items-center bg-surface-2 p-2.5 rounded-2xl border border-border">
                            <input
                              type="text"
                              placeholder="Label (e.g. Date, Timing)"
                              maxLength={30}
                              value={field.label}
                              onChange={(e) => {
                                const cd = settingsForm.cardDisplay;
                                const updated = cd.customFields.map((f, i) => i === idx ? { ...f, label: e.target.value } : f);
                                setSettingsForm({ ...settingsForm, cardDisplay: { ...cd, customFields: updated } });
                              }}
                              className="bg-surface border border-border rounded-xl px-3 py-2 font-mono text-xs text-text"
                            />
                            <input
                              type="text"
                              placeholder="Value (e.g. 12–14 Dec, 10 AM–8 PM)"
                              maxLength={50}
                              value={field.value}
                              onChange={(e) => {
                                const cd = settingsForm.cardDisplay;
                                const updated = cd.customFields.map((f, i) => i === idx ? { ...f, value: e.target.value } : f);
                                setSettingsForm({ ...settingsForm, cardDisplay: { ...cd, customFields: updated } });
                              }}
                              className="bg-surface border border-border rounded-xl px-3 py-2 font-mono text-xs text-text"
                            />
                            <select
                              value={field.icon || 'CalendarDays'}
                              onChange={(e) => {
                                const cd = settingsForm.cardDisplay;
                                const updated = cd.customFields.map((f, i) => i === idx ? { ...f, icon: e.target.value } : f);
                                setSettingsForm({ ...settingsForm, cardDisplay: { ...cd, customFields: updated } });
                              }}
                              className="bg-surface border border-border rounded-xl px-2.5 py-2 font-mono text-xs text-text"
                            >
                              <option value="CalendarDays">📅 Date</option>
                              <option value="Clock">⏰ Time</option>
                              <option value="MapPin">📍 Location</option>
                              <option value="Users">👥 Crowd / Age</option>
                              <option value="Ticket">🎫 Pass / Entry</option>
                              <option value="Zap">⚡ Highlight</option>
                              <option value="Flame">🔥 Special</option>
                              <option value="Crown">👑 VIP</option>
                              <option value="ShieldCheck">🛡️ Safety</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                const cd = settingsForm.cardDisplay;
                                const updated = cd.customFields.filter((_, i) => i !== idx);
                                setSettingsForm({ ...settingsForm, cardDisplay: { ...cd, customFields: updated } });
                              }}
                              title="Remove field"
                              className="p-2 rounded-xl bg-danger/15 text-danger hover:bg-danger hover:text-white border border-danger/30 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card 5: Card Visual Template & Reusable Presets */}
                  <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-comic text-lg text-accent flex items-center gap-2">
                          <span>✨ 5. CARD VISUAL TEMPLATE &amp; THEME</span>
                        </h4>
                        <p className="text-[11px] font-mono text-text-muted">
                          Switch between Standard Neon or the KCK 7.0 Kolkata Dusk &amp; Starburst template and customize colors, tagline, or logos.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { id: 'standard', title: '⚡ Standard Neon Card', hint: 'Clean dark card with neon gradients' },
                        { id: 'kolkata-dusk', title: '🌅 Kolkata Dusk & Starburst', hint: 'KCK 7.0 style with Howrah Bridge, rays & burst price' }
                      ].map(opt => {
                        const active = (settingsForm.cardTemplate?.layout || 'standard') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSettingsForm({
                              ...settingsForm,
                              cardTemplate: { ...(settingsForm.cardTemplate || {}), layout: opt.id }
                            })}
                            className={`rounded-2xl p-3.5 text-left font-mono border-2 transition-all cursor-pointer ${
                              active ? 'bg-accent/15 border-accent text-white shadow-[3px_3px_0_#000]' : 'bg-surface-2 border-border text-text-muted hover:border-white/30'
                            }`}
                          >
                            <span className="block text-xs font-bold text-white">{opt.title}</span>
                            <span className="block text-[10px] mt-0.5 opacity-80">{opt.hint}</span>
                          </button>
                        );
                      })}
                    </div>

                    {settingsForm.cardTemplate?.layout === 'kolkata-dusk' && (
                      <div className="space-y-3 pt-2 border-t border-border/60">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-mono uppercase text-text-muted block mb-1">Tagline Chips (comma-separated)</label>
                            <input
                              type="text"
                              placeholder="Comics, Gaming, Collectibles, Cosplay"
                              value={(settingsForm.cardTemplate?.tagline || []).join(', ')}
                              onChange={(e) => setSettingsForm({
                                ...settingsForm,
                                cardTemplate: {
                                  ...settingsForm.cardTemplate,
                                  tagline: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                }
                              })}
                              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 font-mono text-xs text-text"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-mono uppercase text-text-muted block mb-1">Custom Title Logo URL (optional)</label>
                            <input
                              type="text"
                              placeholder="/events/.../logo.png (leave blank for event name)"
                              value={settingsForm.cardTemplate?.logoUrl || ''}
                              onChange={(e) => setSettingsForm({
                                ...settingsForm,
                                cardTemplate: { ...settingsForm.cardTemplate, logoUrl: e.target.value }
                              })}
                              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 font-mono text-xs text-text"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { key: 'orange', label: 'Sky & Band Color', def: '#FF7A1A' },
                            { key: 'burst', label: 'Starburst Price', def: '#F2FF00' },
                            { key: 'button', label: 'Book Button', def: '#FFC21A' }
                          ].map(c => (
                            <label key={c.key} className="flex items-center gap-2.5 bg-surface-2 border border-border rounded-xl px-3 py-2 cursor-pointer">
                              <input
                                type="color"
                                value={settingsForm.cardTemplate?.colors?.[c.key] || c.def}
                                onChange={(e) => setSettingsForm({
                                  ...settingsForm,
                                  cardTemplate: {
                                    ...settingsForm.cardTemplate,
                                    colors: { ...(settingsForm.cardTemplate?.colors || {}), [c.key]: e.target.value }
                                  }
                                })}
                                className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                              />
                              <span className="font-mono text-[10px] text-text">{c.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Super Admin: Save current event design as a reusable template */}
                    {isSuperAdmin && (
                      <div className="pt-3 border-t border-border/60 flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          placeholder="Template name (e.g. KCK 7.0 Master)"
                          value={templateNameInput}
                          onChange={(e) => setTemplateNameInput(e.target.value)}
                          className="flex-1 min-w-[200px] bg-surface-2 border border-border rounded-xl px-3 py-2 font-mono text-xs text-text"
                        />
                        <button
                          type="button"
                          disabled={savingTemplate || !templateNameInput.trim()}
                          onClick={async () => {
                            setSavingTemplate(true);
                            try {
                              const res = await api.adminSaveTemplate({
                                name: templateNameInput.trim(),
                                layout: settingsForm.cardTemplate?.layout || 'kolkata-dusk',
                                logoUrl: settingsForm.cardTemplate?.logoUrl || '',
                                watermarkUrl: settingsForm.cardTemplate?.watermarkUrl || '',
                                tagline: settingsForm.cardTemplate?.tagline || [],
                                colors: settingsForm.cardTemplate?.colors || {},
                                cardDisplay: settingsForm.cardDisplay || {},
                                announcementText: settingsForm.announcementText || ''
                              });
                              setSavedTemplates(res.templates || []);
                              setTemplateNameInput('');
                              alert('Template saved! You can now select it whenever creating a new event.');
                            } catch (err) {
                              alert(err.message || 'Could not save template');
                            } finally {
                              setSavingTemplate(false);
                            }
                          }}
                          className="px-4 py-2 rounded-xl bg-primary text-black border-2 border-black font-mono text-xs font-bold shadow-[2px_2px_0_#000] hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {savingTemplate ? 'SAVING...' : '💾 SAVE AS TEMPLATE'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Save Section */}
                  <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-mono uppercase text-accent font-bold">
                        Enter 6-Digit PIN to Authorize:
                      </label>
                      <input
                        type="password"
                        required
                        maxLength={6}
                        placeholder="••••••"
                        value={adminPin}
                        onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                        className="w-36 bg-surface-2 border-2 border-accent rounded-xl p-2 font-mono text-center tracking-widest text-sm text-accent font-bold"
                      />
                    </div>

                    <ComicButton type="submit" variant="primary" size="md">
                      SAVE CORE SETTINGS →
                    </ComicButton>
                  </div>
                </form>
              )}

              {/* SUB-VIEW 2: TICKET TYPES (admin decides what checkout sells) */}
              {settingsSubTab === "TIERS" && (
                <TicketTiersManager
                  tiers={ticketTiers}
                  defaultPricePaise={Math.round(Number(settingsForm.baseRupees) * 100)}
                  feePaise={Math.round(Number(settingsForm.feeRupees) * 100)}
                  onSave={handleSaveTiers}
                />
              )}

              {/* SUB-VIEW 3: PROMO CODES & COUPONS */}
              {settingsSubTab === 'COUPONS' && (
                <div className="space-y-4">
                  {/* Create New Coupon */}
                  <div className="p-4 rounded-3xl bg-surface border-2 border-border shadow-[3px_3px_0_#000]">
                    <h4 className="font-comic text-base text-accent mb-3 flex items-center gap-2">
                      <Tag className="w-4 h-4" /> CREATE NEW PROMO CODE
                    </h4>
                    <form onSubmit={handleAddCoupon} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                      <div>
                        <label className="text-[10px] font-mono text-text-muted block mb-1">Coupon Code *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. FLASH50"
                          value={newCouponForm.code}
                          onChange={(e) => setNewCouponForm({ ...newCouponForm, code: e.target.value.toUpperCase() })}
                          className="w-full bg-surface-2 border border-border rounded-xl p-2 font-mono text-xs uppercase text-text font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-text-muted block mb-1">Discount Type</label>
                        <select
                          value={newCouponForm.discountType}
                          onChange={(e) => setNewCouponForm({ ...newCouponForm, discountType: e.target.value })}
                          className="w-full bg-surface-2 border border-border rounded-xl p-2 font-mono text-xs text-text"
                        >
                          <option value="PERCENT">Percentage (%)</option>
                          <option value="FLAT">Flat Cash (₹)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-text-muted block mb-1">Value</label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={newCouponForm.discountValue}
                          onChange={(e) => setNewCouponForm({ ...newCouponForm, discountValue: Number(e.target.value) })}
                          className="w-full bg-surface-2 border border-border rounded-xl p-2 font-mono text-xs text-text"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-text-muted block mb-1">Max Uses Cap</label>
                        <input
                          type="number"
                          min="1"
                          value={newCouponForm.maxUses}
                          onChange={(e) => setNewCouponForm({ ...newCouponForm, maxUses: Number(e.target.value) })}
                          className="w-full bg-surface-2 border border-border rounded-xl p-2 font-mono text-xs text-text"
                        />
                      </div>
                      <div>
                        <ComicButton type="submit" variant="accent" size="sm" className="w-full">
                          + ADD CODE
                        </ComicButton>
                      </div>
                    </form>
                  </div>

                  {/* Existing Coupons Table */}
                  <div className="p-4 rounded-3xl bg-surface border-2 border-border shadow-[3px_3px_0_#000] overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs">
                      <thead>
                        <tr className="border-b border-border/80 text-text-muted">
                          <th className="py-2.5 px-3">CODE</th>
                          <th className="py-2.5 px-3">DISCOUNT</th>
                          <th className="py-2.5 px-3">USAGE CAP</th>
                          <th className="py-2.5 px-3">TIMES USED</th>
                          <th className="py-2.5 px-3">STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coupons.map((c, idx) => (
                          <tr key={idx} className="border-b border-border/40">
                            <td className="py-3 px-3 font-bold text-primary">{c.code}</td>
                            <td className="py-3 px-3">
                              {c.discountType === 'PERCENT' ? `${c.discountValue}% OFF` : `₹${(c.discountValue / 100).toLocaleString('en-IN')} FLAT OFF`}
                            </td>
                            <td className="py-3 px-3">{c.maxUses || 'Unlimited'}</td>
                            <td className="py-3 px-3 text-success font-bold">{c.usedCount || 0} used</td>
                            <td className="py-3 px-3">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-success/20 text-success font-bold">
                                ACTIVE
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SUB-VIEW 4: MERCH PRE-ORDERS */}
              {settingsSubTab === 'MERCH' && (() => {
                const scopeLabel = isEventAdmin ? (currentUser.assignedEventId || 'no event') : selectedEventScope;
                const unitsSold = addOns.reduce((s, a) => s + (a.soldCount || 0), 0);
                const revenuePaise = addOns.reduce((s, a) => s + (a.soldCount || 0) * a.pricePaise, 0);
                const lowStock = addOns.filter(a => {
                  const left = (a.inventory || 0) - (a.soldCount || 0);
                  return a.inventory > 0 && left <= Math.max(10, Math.round(a.inventory * 0.15));
                }).length;
                const merchInput = 'w-full bg-[#14142A] border-2 border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm text-text focus:outline-none focus:border-primary transition-colors';

                return (
                  <div className="space-y-6">
                    {/* Header + PIN */}
                    <div className="relative rounded-3xl p-[2px] shadow-[6px_6px_0_#000]" style={{ background: 'linear-gradient(135deg, #22D3EE, #FFD60A 60%, #FF2E88)' }}>
                      <div className="relative rounded-[calc(1.5rem-2px)] bg-[#0D0D1A] p-5 sm:p-6 overflow-hidden">
                        <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ background: 'radial-gradient(circle at 0% 0%, #22D3EE, transparent 55%)' }} />
                        <ShoppingBag className="absolute -right-6 -top-6 w-40 h-40 text-info opacity-[0.06] rotate-12 pointer-events-none" />
                        <div className="relative flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-info">Merch store</span>
                            <h3 className="font-comic text-3xl text-white uppercase tracking-wide leading-none">Event merch & extras</h3>
                            <p className="text-xs font-mono text-text-muted mt-1">
                              Showing for <strong className="text-primary">{scopeLabel}</strong> — shown on the landing page and at checkout.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-accent" />
                            <input
                              type="password"
                              maxLength={6}
                              placeholder="Admin PIN"
                              value={adminPin}
                              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                              className="w-36 bg-[#14142A] border-2 border-accent rounded-xl p-2 font-mono text-center tracking-widest text-sm text-accent font-bold placeholder:tracking-normal placeholder:text-accent/50"
                            />
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
                          {[
                            { label: 'Items listed', value: addOns.length, c: 'text-info' },
                            { label: 'Units sold', value: unitsSold.toLocaleString('en-IN'), c: 'text-primary' },
                            { label: 'Merch revenue', value: `₹${(revenuePaise / 100).toLocaleString('en-IN')}`, c: 'text-success' },
                            { label: 'Low stock', value: lowStock, c: lowStock > 0 ? 'text-danger' : 'text-text-muted' }
                          ].map(s => (
                            <div key={s.label} className="rounded-2xl bg-white/[0.04] border border-white/10 p-3">
                              <div className={`font-comic text-3xl leading-none ${s.c}`}>{s.value}</div>
                              <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">{s.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Create new item */}
                    <form onSubmit={handleAddAddOn} className="rounded-3xl bg-[#0D0D1A] border-2 border-white/10 p-5 sm:p-6 shadow-[4px_4px_0_#000] space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="w-9 h-9 rounded-xl bg-primary text-black flex items-center justify-center border-2 border-black shadow-[2px_2px_0_#000]">
                          <PlusCircle className="w-5 h-5" />
                        </span>
                        <h4 className="font-comic text-2xl text-white tracking-wide">Add a new item</h4>
                      </div>

                      {/* Category picker */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {Object.entries(MERCH_CATEGORIES).map(([key, meta]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setNewAddOnForm({ ...newAddOnForm, category: key })}
                            className={`flex items-center gap-2 p-3 rounded-2xl border-2 text-left transition-all ${
                              newAddOnForm.category === key ? 'bg-info/15 border-info shadow-[2px_2px_0_#000]' : 'bg-white/[0.03] border-white/10 hover:border-white/30'
                            }`}
                          >
                            <meta.icon className={`w-5 h-5 ${newAddOnForm.category === key ? 'text-info' : 'text-text-muted'}`} />
                            <span className="font-mono text-xs font-bold text-text">{meta.label}</span>
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-3">
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1.5 font-bold">Item name</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Official Festival T-Shirt"
                            value={newAddOnForm.name}
                            onChange={(e) => setNewAddOnForm({ ...newAddOnForm, name: e.target.value })}
                            className={merchInput}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1.5 font-bold">Price (₹)</label>
                          <input
                            type="number"
                            required
                            min="0"
                            value={newAddOnForm.priceRupees}
                            onChange={(e) => setNewAddOnForm({ ...newAddOnForm, priceRupees: Number(e.target.value) })}
                            className={merchInput}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1.5 font-bold">Stock</label>
                          <input
                            type="number"
                            min="1"
                            value={newAddOnForm.inventory}
                            onChange={(e) => setNewAddOnForm({ ...newAddOnForm, inventory: Number(e.target.value) })}
                            className={merchInput}
                          />
                        </div>
                      </div>

                      <div className={`grid grid-cols-1 ${newAddOnForm.category === 'MERCH' ? 'md:grid-cols-2' : ''} gap-3`}>
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1.5 font-bold">Short description <span className="normal-case tracking-normal font-normal">(shown on the landing page)</span></label>
                          <input
                            type="text"
                            placeholder="e.g. 100% cotton, limited festival print"
                            value={newAddOnForm.description}
                            onChange={(e) => setNewAddOnForm({ ...newAddOnForm, description: e.target.value })}
                            className={merchInput}
                          />
                        </div>
                        {newAddOnForm.category === 'MERCH' && (
                          <div>
                            <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1.5 font-bold">Sizes <span className="normal-case tracking-normal font-normal">(comma-separated, blank = no size)</span></label>
                            <input
                              type="text"
                              placeholder="e.g. S, M, L, XL, XXL"
                              value={newAddOnForm.variants}
                              onChange={(e) => setNewAddOnForm({ ...newAddOnForm, variants: e.target.value })}
                              className={merchInput}
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-black font-comic text-xl tracking-wide border-2 border-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 transition-all"
                        >
                          <PlusCircle className="w-5 h-5" /> Add to store
                        </button>
                      </div>
                    </form>

                    {/* Items */}
                    {addOns.length === 0 ? (
                      <div className="p-12 text-center rounded-3xl bg-[#0D0D1A] border-2 border-dashed border-white/15 space-y-2">
                        <ShoppingBag className="w-10 h-10 mx-auto text-text-muted" />
                        <h4 className="font-comic text-2xl text-text">No merch yet</h4>
                        <p className="text-xs font-mono text-text-muted">Add your first item above — it appears on the event card and checkout instantly.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {addOns.map((item) => {
                          const meta = MERCH_CATEGORIES[item.category] || MERCH_CATEGORIES.MERCH;
                          const inventory = item.inventory || 0;
                          const sold = item.soldCount || 0;
                          const left = Math.max(0, inventory - sold);
                          const pct = inventory > 0 ? Math.min(100, Math.round((sold / inventory) * 100)) : 0;
                          const isLow = inventory > 0 && left <= Math.max(10, Math.round(inventory * 0.15));
                          const isLive = item.active !== false;
                          const isEditing = merchEdit?.addOnId === item.addOnId;

                          return (
                            <div
                              key={item.addOnId}
                              className={`relative rounded-3xl bg-[#0D0D1A] border-2 shadow-[4px_4px_0_#000] overflow-hidden flex flex-col ${isLive ? 'border-white/10' : 'border-dashed border-white/15 opacity-70'}`}
                            >
                              <div className="h-1.5 bg-gradient-to-r from-info via-primary to-accent" />
                              <div className="p-5 flex-1 flex flex-col gap-4">
                                <div className="flex items-start gap-3">
                                  <div className="w-12 h-12 rounded-2xl bg-info/15 border-2 border-info/40 flex items-center justify-center shrink-0">
                                    <meta.icon className="w-6 h-6 text-info" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        value={merchEdit.name}
                                        onChange={(e) => setMerchEdit({ ...merchEdit, name: e.target.value })}
                                        className={merchInput}
                                      />
                                    ) : (
                                      <div className="font-comic text-xl text-white tracking-wide leading-tight">{item.name}</div>
                                    )}
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 font-mono text-[9px] font-bold text-text-muted uppercase">{meta.label}</span>
                                      <span className={`px-2 py-0.5 rounded-full font-mono text-[9px] font-bold uppercase border ${isLive ? 'bg-success/15 text-success border-success/40' : 'bg-white/5 text-text-muted border-white/15'}`}>
                                        {isLive ? '● Live' : 'Hidden'}
                                      </span>
                                    </div>
                                  </div>
                                  {!isEditing && (
                                    <span className="font-comic text-3xl text-primary leading-none">₹{(item.pricePaise / 100).toFixed(0)}</span>
                                  )}
                                </div>

                                {isEditing ? (
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="text-[10px] font-mono uppercase text-text-muted block mb-1 font-bold">Price (₹)</label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={merchEdit.priceRupees}
                                        onChange={(e) => setMerchEdit({ ...merchEdit, priceRupees: e.target.value })}
                                        className={merchInput}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-mono uppercase text-text-muted block mb-1 font-bold">Total stock</label>
                                      <input
                                        type="number"
                                        min={sold}
                                        value={merchEdit.inventory}
                                        onChange={(e) => setMerchEdit({ ...merchEdit, inventory: e.target.value })}
                                        className={merchInput}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {/* Stock meter */}
                                    <div className="space-y-1.5">
                                      <div className="flex justify-between font-mono text-[11px]">
                                        <span className="text-text-muted">{sold.toLocaleString('en-IN')} sold</span>
                                        <span className={isLow ? 'text-danger font-bold' : 'text-text'}>
                                          {left === 0 ? 'SOLD OUT' : `${left.toLocaleString('en-IN')} left`}
                                        </span>
                                      </div>
                                      <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${isLow ? 'bg-gradient-to-r from-warning to-danger' : 'bg-gradient-to-r from-info to-primary'}`}
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                                      <div className="rounded-xl bg-white/[0.04] border border-white/10 p-2.5">
                                        <div className="text-text-muted uppercase text-[9px]">Revenue</div>
                                        <div className="font-comic text-xl text-success leading-tight">₹{((sold * item.pricePaise) / 100).toLocaleString('en-IN')}</div>
                                      </div>
                                      <div className="rounded-xl bg-white/[0.04] border border-white/10 p-2.5">
                                        <div className="text-text-muted uppercase text-[9px]">Total stock</div>
                                        <div className="font-comic text-xl text-white leading-tight">{inventory.toLocaleString('en-IN')}</div>
                                      </div>
                                    </div>

                                    {item.variants?.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {item.variants.map(v => (
                                          <span key={v} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 font-mono text-[10px] font-bold text-text">{v}</span>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )}

                                {/* Actions */}
                                <div className="mt-auto pt-1 flex gap-2">
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const ok = await handleUpdateAddOn(item.addOnId, {
                                            name: merchEdit.name.trim() || item.name,
                                            pricePaise: Math.round(Number(merchEdit.priceRupees) * 100),
                                            inventory: Math.max(sold, Number(merchEdit.inventory) || 0)
                                          });
                                          if (ok) setMerchEdit(null);
                                        }}
                                        className="flex-1 py-2 rounded-xl bg-primary text-black font-comic text-lg tracking-wide border-2 border-black shadow-[2px_2px_0_#000] flex items-center justify-center gap-1.5"
                                      >
                                        <Check className="w-4 h-4" /> Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setMerchEdit(null)}
                                        className="px-4 py-2 rounded-xl bg-white/5 border-2 border-white/15 text-text font-mono text-xs font-bold"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setMerchEdit({ addOnId: item.addOnId, name: item.name, priceRupees: item.pricePaise / 100, inventory })}
                                        className="flex-1 py-2 rounded-xl bg-white/5 border-2 border-white/15 text-text hover:border-info hover:text-info font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                                      >
                                        <Pencil className="w-3.5 h-3.5" /> Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateAddOn(item.addOnId, { active: !isLive })}
                                        title={isLive ? 'Hide from site' : 'Show on site'}
                                        className="px-3 py-2 rounded-xl bg-white/5 border-2 border-white/15 text-text hover:border-primary hover:text-primary transition-colors"
                                      >
                                        {isLive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteAddOn(item.addOnId)}
                                        title="Delete item"
                                        className="px-3 py-2 rounded-xl bg-danger/10 border-2 border-danger/40 text-danger hover:bg-danger/20 transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* SUB-VIEW 5: AMBASSADORS & AFFILIATES */}
              {settingsSubTab === 'AFFILIATES' && (
                <div className="p-4 rounded-3xl bg-surface border-2 border-border shadow-[3px_3px_0_#000] overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-border/80 text-text-muted">
                        <th className="py-2.5 px-3">INFLUENCER / CODE</th>
                        <th className="py-2.5 px-3">REFERRAL LINK</th>
                        <th className="py-2.5 px-3">COMMISSION %</th>
                        <th className="py-2.5 px-3">SALES COUNT</th>
                        <th className="py-2.5 px-3">COMMISSION DUE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {affiliates.map((aff, idx) => (
                        <tr key={idx} className="border-b border-border/40">
                          <td className="py-3 px-3">
                            <strong className="text-text block">{aff.name}</strong>
                            <span className="text-[11px] text-accent font-bold">@{aff.code}</span>
                          </td>
                          <td className="py-3 px-3">
                            <code className="text-[11px] bg-surface-2 px-2 py-1 rounded text-primary">
                              /?ref={aff.code}
                            </code>
                          </td>
                          <td className="py-3 px-3">{aff.commissionPct || 10}%</td>
                          <td className="py-3 px-3 font-bold text-text">{aff.totalSalesCount || 0} passes</td>
                          <td className="py-3 px-3 font-comic text-base text-success">
                            ₹{((aff.totalCommissionPaise || 0) / 100).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* SUB-VIEW 6: LIVE ANNOUNCEMENT PUSH */}
              {settingsSubTab === 'ANNOUNCEMENTS' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-3xl bg-surface border-2 border-border shadow-[3px_3px_0_#000]">
                    <h4 className="font-comic text-base text-accent mb-3 flex items-center gap-2">
                      <Bell className="w-4 h-4" /> COMPOSE PASS PUSH NOTICE
                    </h4>
                    <form onSubmit={handlePostAnnouncement} className="space-y-3">
                      <div>
                        <label className="text-[10px] font-mono text-text-muted block mb-1">Headline</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Cosplay Contest Registration Closes at 4 PM"
                          value={announcementForm.title}
                          onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                          className="w-full bg-surface-2 border border-border rounded-xl p-2 font-mono text-xs text-text"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-text-muted block mb-1">Notice Body</label>
                        <textarea
                          rows={2}
                          required
                          placeholder="Please report to Stage B desk for badge tagging..."
                          value={announcementForm.message}
                          onChange={(e) => setAnnouncementForm({ ...announcementForm, message: e.target.value })}
                          className="w-full bg-surface-2 border border-border rounded-xl p-2 font-mono text-xs text-text resize-none"
                        />
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-[11px] font-mono text-text-muted">
                          Pushes in real-time to attendee pass screens via WebSocket
                        </span>
                        <ComicButton type="submit" variant="accent" size="sm">
                          PUSH NOTICE NOW →
                        </ComicButton>
                      </div>
                    </form>
                  </div>

                  {/* Active Announcements */}
                  <div className="space-y-2">
                    {liveAnnouncements.map((a, idx) => (
                      <div key={idx} className="p-3 bg-surface-2 border border-border rounded-2xl flex justify-between items-start">
                        <div>
                          <strong className="font-mono text-xs text-text block">📢 {a.title}</strong>
                          <p className="text-[11px] font-mono text-text-muted mt-0.5">{a.message}</p>
                        </div>
                        <span className="text-[9px] font-mono bg-success/20 text-success px-2 py-0.5 rounded font-bold">
                          ACTIVE
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SUB-VIEW 7: MULTI-TENANT PAYMENT GATEWAY CONFIGURATION */}
              {settingsSubTab === 'PAYMENT' && (
                <div className="space-y-6">
                  {/* Status Banner */}
                  <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <CreditCard className="w-5 h-5 text-primary" />
                        <h4 className="font-comic text-2xl text-primary">EVENT PAYMENT GATEWAY SETUP</h4>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          paymentGatewayForm.usePlatformDefault
                            ? 'bg-primary/20 text-primary border border-primary/40'
                            : 'bg-success/20 text-success border border-success/40'
                        }`}>
                          {paymentGatewayForm.usePlatformDefault ? 'PLATFORM DEFAULT ACCOUNT' : 'DEDICATED ORGANIZER GATEWAY'}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-text-muted">
                        Choose which PayU account collects online ticket payments for this event.
                      </p>
                      {paymentGatewayStatus.ready ? (
                        <p className="mt-2 text-xs font-mono text-success font-bold">
                          ✓ Online payments are working for this event.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs font-mono text-accent font-bold">
                          ⚠ Online payments are OFF for this event: {
                            !paymentGatewayStatus.providerAvailable
                              ? `${paymentGatewayForm.provider} is not available yet. Select PayU and save.`
                              : paymentGatewayForm.usePlatformDefault
                                ? 'the platform PayU account is not set up on the server (PAYU_MERCHANT_KEY / PAYU_MERCHANT_SALT).'
                                : 'enter the organizer\'s PayU Merchant Key and Salt below.'
                          } Buyers can still pay at the Cash Desk.
                        </p>
                      )}
                    </div>

                    <div className="px-3.5 py-2 rounded-2xl bg-surface-2 border border-border text-right">
                      <span className="text-[10px] font-mono text-text-muted block">Active Event Scope</span>
                      <strong className="font-comic text-base text-white">
                        {isEventAdmin ? (currentUser.assignedEventId || 'no event') : selectedEventScope}
                      </strong>
                    </div>
                  </div>

                  {/* Gateway Form */}
                  <div className="p-6 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] space-y-6">
                    {/* Mode Selector */}
                    <div>
                      <label className="text-xs font-mono text-text-muted block mb-2 uppercase font-bold">
                        1. Settlement Account Routing
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setPaymentGatewayForm(prev => ({ ...prev, usePlatformDefault: true }))}
                          className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                            paymentGatewayForm.usePlatformDefault
                              ? 'bg-primary/10 border-primary shadow-[2px_2px_0_#000]'
                              : 'bg-surface-2 border-border opacity-70 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-comic text-base text-white">Platform Master Account</span>
                            {paymentGatewayForm.usePlatformDefault && (
                              <span className="h-5 w-5 rounded-full bg-primary text-black flex items-center justify-center font-bold text-xs">✓</span>
                            )}
                          </div>
                          <p className="text-xs font-mono text-text-muted">
                            Default global PayU credentials configured in server environment (.env). Centralized platform collection.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPaymentGatewayForm(prev => ({ ...prev, usePlatformDefault: false }))}
                          className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                            !paymentGatewayForm.usePlatformDefault
                              ? 'bg-success/10 border-success shadow-[2px_2px_0_#000]'
                              : 'bg-surface-2 border-border opacity-70 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-comic text-base text-white">Dedicated Organizer Gateway</span>
                            {!paymentGatewayForm.usePlatformDefault && (
                              <span className="h-5 w-5 rounded-full bg-success text-black flex items-center justify-center font-bold text-xs">✓</span>
                            )}
                          </div>
                          <p className="text-xs font-mono text-text-muted">
                            Route all ticket payments for this event directly into the organizer's own PayU Merchant account.
                          </p>
                        </button>
                      </div>
                    </div>

                    {/* Provider Selection */}
                    <div>
                      <label className="text-xs font-mono text-text-muted block mb-2 uppercase font-bold">
                        2. Payment Gateway Service (Choose Provider)
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[
                          // Only PayU has a complete, verified payment flow. The rest stay listed but cannot be chosen yet.
                          { id: 'PAYU', name: 'PayU Hosted', tag: '🇮🇳 India', desc: 'Hosted Checkout, UPI, NetBanking, Credit/Debit Cards, Wallets', available: true },
                          { id: 'RAZORPAY', name: 'Razorpay', tag: 'Coming soon', desc: 'Instant UPI Intent, Dynamic QR, NetBanking, Credit/Debit Cards', available: false },
                          { id: 'PHONEPE', name: 'PhonePe PG', tag: 'Coming soon', desc: 'Direct PhonePe UPI Intent, QR, Seamless Mobile Ingress Checkout', available: false },
                          { id: 'CASHFREE', name: 'Cashfree', tag: 'Coming soon', desc: 'Instant UPI, Drop Checkout, NetBanking, Low Transaction Fees', available: false },
                          { id: 'STRIPE', name: 'Stripe', tag: 'Coming soon', desc: 'International & Domestic Cards, Apple Pay, Google Pay, Global Fans', available: false }
                        ].map((gw) => {
                          const isSelected = (paymentGatewayForm.provider || 'PAYU') === gw.id;
                          return (
                            <button
                              key={gw.id}
                              type="button"
                              disabled={!gw.available}
                              title={gw.available ? undefined : 'Not available yet'}
                              onClick={() => gw.available && setPaymentGatewayForm(prev => ({ ...prev, provider: gw.id }))}
                              className={`p-3.5 rounded-2xl border-2 text-left transition-all relative ${
                                !gw.available
                                  ? 'bg-surface-2 border-border opacity-40 cursor-not-allowed'
                                  : isSelected
                                    ? 'bg-primary/10 border-primary shadow-[2px_2px_0_#000] cursor-pointer'
                                    : 'bg-surface-2 border-border opacity-70 hover:opacity-100 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-comic text-base text-white tracking-wide">{gw.name}</span>
                                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/10 text-text-muted">
                                  {gw.tag}
                                </span>
                              </div>
                              <p className="text-[11px] font-mono text-text-muted leading-tight">
                                {gw.desc}
                              </p>
                              {isSelected && (
                                <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary text-black font-bold text-[10px] flex items-center justify-center">
                                  ✓
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Environment Selection: only the organizer's own keys have a per-event mode */}
                    {paymentGatewayForm.usePlatformDefault ? (
                      <div className="p-3 rounded-xl bg-surface-2/60 border border-border text-[11px] font-mono text-text-muted">
                        ℹ️ The platform PayU account runs in <strong>{paymentGatewayStatus.platformPayUEnv === 'PRODUCTION' ? 'PRODUCTION (real money)' : 'TEST (PayU sandbox, no real money)'}</strong> mode. This is set on the server (PAYU_ENV), not here.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-mono text-text-muted block mb-1">
                            Organizer PayU Account Mode
                          </label>
                          <select
                            value={paymentGatewayForm.env || 'TEST'}
                            onChange={(e) => setPaymentGatewayForm(prev => ({ ...prev, env: e.target.value }))}
                            className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                          >
                            <option value="TEST">TEST (PayU sandbox, no real money)</option>
                            <option value="PRODUCTION">PRODUCTION (live payments, real money)</option>
                          </select>
                        </div>

                        <div className="flex items-center">
                          <div className="p-3 rounded-xl bg-surface-2/60 border border-border text-[11px] font-mono text-text-muted">
                            ℹ️ Must match the keys: PayU test keys only work in <strong>TEST</strong>, live keys only in <strong>PRODUCTION</strong>.
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Dedicated Credentials (Only shown if custom gateway enabled) */}
                    {!paymentGatewayForm.usePlatformDefault && (
                      <div className="space-y-4 pt-4 border-t border-border">
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4 text-accent" />
                          <h5 className="font-comic text-lg text-white">
                            ORGANIZER CREDENTIALS: {paymentGatewayForm.provider || 'PAYU'}
                          </h5>
                        </div>

                        {/* 1. PAYU CREDENTIALS */}
                        {(paymentGatewayForm.provider === 'PAYU' || !paymentGatewayForm.provider) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-mono text-text-muted block mb-1">
                                PayU Merchant Key <span className="text-accent">*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="Your PayU Merchant Key"
                                value={paymentGatewayForm.merchantKey}
                                onChange={(e) => setPaymentGatewayForm(prev => ({ ...prev, merchantKey: e.target.value }))}
                                className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                              />
                              <span className="text-[10px] font-mono text-text-muted mt-1 block">
                                Found in PayU Merchant Dashboard &gt; Integration Details.
                              </span>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-mono text-text-muted">
                                  PayU Merchant Salt <span className="text-accent">*</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowGatewaySalt(s => !s)}
                                  className="text-[10px] font-mono text-primary underline cursor-pointer"
                                >
                                  {showGatewaySalt ? 'Hide Salt' : 'Reveal Salt'}
                                </button>
                              </div>
                              <input
                                type={showGatewaySalt ? 'text' : 'password'}
                                placeholder={secretPlaceholder('merchantSalt', 'Your PayU Merchant Salt')}
                                value={paymentGatewayForm.merchantSalt}
                                onChange={(e) => setPaymentGatewayForm(prev => ({ ...prev, merchantSalt: e.target.value }))}
                                className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                              />
                              <span className="text-[10px] font-mono text-text-muted mt-1 block">
                                Used for SHA-512 request hashing & reverse response verification.
                              </span>
                            </div>
                          </div>
                        )}

                        {/* 2. RAZORPAY CREDENTIALS */}
                        {paymentGatewayForm.provider === 'RAZORPAY' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-mono text-text-muted block mb-1">
                                Razorpay Key ID <span className="text-accent">*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. rzp_test_1DP5mmOlF5G5ag"
                                value={paymentGatewayForm.razorpayKeyId}
                                onChange={(e) => setPaymentGatewayForm(prev => ({ ...prev, razorpayKeyId: e.target.value }))}
                                className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                              />
                              <span className="text-[10px] font-mono text-text-muted mt-1 block">
                                Found in Razorpay Dashboard &gt; Settings &gt; API Keys.
                              </span>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-mono text-text-muted">
                                  Razorpay Key Secret <span className="text-accent">*</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowGatewaySalt(s => !s)}
                                  className="text-[10px] font-mono text-primary underline cursor-pointer"
                                >
                                  {showGatewaySalt ? 'Hide Secret' : 'Reveal Secret'}
                                </button>
                              </div>
                              <input
                                type={showGatewaySalt ? 'text' : 'password'}
                                placeholder={secretPlaceholder('razorpayKeySecret', 'e.g. c395V1c2x...secret')}
                                value={paymentGatewayForm.razorpayKeySecret}
                                onChange={(e) => setPaymentGatewayForm(prev => ({ ...prev, razorpayKeySecret: e.target.value }))}
                                className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                              />
                              <span className="text-[10px] font-mono text-text-muted mt-1 block">
                                Used for HMAC-SHA256 signature verification upon payment completion.
                              </span>
                            </div>
                          </div>
                        )}

                        {/* 3. CASHFREE CREDENTIALS */}
                        {paymentGatewayForm.provider === 'CASHFREE' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-mono text-text-muted block mb-1">
                                Cashfree App ID / Client ID <span className="text-accent">*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. TEST103849... or CF_LIVE..."
                                value={paymentGatewayForm.cashfreeAppId}
                                onChange={(e) => setPaymentGatewayForm(prev => ({ ...prev, cashfreeAppId: e.target.value }))}
                                className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                              />
                              <span className="text-[10px] font-mono text-text-muted mt-1 block">
                                Found in Cashfree Merchant Portal &gt; Developers &gt; API Keys.
                              </span>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-mono text-text-muted">
                                  Cashfree Secret Key <span className="text-accent">*</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowGatewaySalt(s => !s)}
                                  className="text-[10px] font-mono text-primary underline cursor-pointer"
                                >
                                  {showGatewaySalt ? 'Hide Secret' : 'Reveal Secret'}
                                </button>
                              </div>
                              <input
                                type={showGatewaySalt ? 'text' : 'password'}
                                placeholder={secretPlaceholder('cashfreeSecretKey', 'e.g. cfsk_ma_test_...')}
                                value={paymentGatewayForm.cashfreeSecretKey}
                                onChange={(e) => setPaymentGatewayForm(prev => ({ ...prev, cashfreeSecretKey: e.target.value }))}
                                className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                              />
                              <span className="text-[10px] font-mono text-text-muted mt-1 block">
                                Used for Cashfree drop checkout session generation & webhooks.
                              </span>
                            </div>
                          </div>
                        )}

                        {/* 4. PHONEPE CREDENTIALS */}
                        {paymentGatewayForm.provider === 'PHONEPE' && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                              <label className="text-xs font-mono text-text-muted block mb-1">
                                PhonePe Merchant ID <span className="text-accent">*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. PGTESTPAYUAT"
                                value={paymentGatewayForm.phonepeMerchantId}
                                onChange={(e) => setPaymentGatewayForm(prev => ({ ...prev, phonepeMerchantId: e.target.value }))}
                                className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                              />
                              <span className="text-[10px] font-mono text-text-muted mt-1 block">
                                Found in PhonePe Business Console &gt; Integration.
                              </span>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-mono text-text-muted">
                                  PhonePe Salt Key <span className="text-accent">*</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowGatewaySalt(s => !s)}
                                  className="text-[10px] font-mono text-primary underline cursor-pointer"
                                >
                                  {showGatewaySalt ? 'Hide Key' : 'Reveal Key'}
                                </button>
                              </div>
                              <input
                                type={showGatewaySalt ? 'text' : 'password'}
                                placeholder={secretPlaceholder('phonepeSaltKey', 'Your PhonePe Salt Key')}
                                value={paymentGatewayForm.phonepeSaltKey}
                                onChange={(e) => setPaymentGatewayForm(prev => ({ ...prev, phonepeSaltKey: e.target.value }))}
                                className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                              />
                              <span className="text-[10px] font-mono text-text-muted mt-1 block">
                                Used for X-VERIFY SHA-256 header generation.
                              </span>
                            </div>

                            <div>
                              <label className="text-xs font-mono text-text-muted block mb-1">
                                PhonePe Salt Index
                              </label>
                              <input
                                type="text"
                                placeholder="1"
                                value={paymentGatewayForm.phonepeSaltIndex || '1'}
                                onChange={(e) => setPaymentGatewayForm(prev => ({ ...prev, phonepeSaltIndex: e.target.value }))}
                                className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                              />
                              <span className="text-[10px] font-mono text-text-muted mt-1 block">
                                Default is index 1.
                              </span>
                            </div>
                          </div>
                        )}

                        {/* 5. STRIPE CREDENTIALS */}
                        {paymentGatewayForm.provider === 'STRIPE' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-mono text-text-muted block mb-1">
                                Stripe Publishable Key <span className="text-accent">*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. pk_test_51Mz..."
                                value={paymentGatewayForm.stripePublishableKey}
                                onChange={(e) => setPaymentGatewayForm(prev => ({ ...prev, stripePublishableKey: e.target.value }))}
                                className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                              />
                              <span className="text-[10px] font-mono text-text-muted mt-1 block">
                                Found in Stripe Dashboard &gt; Developers &gt; API keys.
                              </span>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-mono text-text-muted">
                                  Stripe Secret Key <span className="text-accent">*</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowGatewaySalt(s => !s)}
                                  className="text-[10px] font-mono text-primary underline cursor-pointer"
                                >
                                  {showGatewaySalt ? 'Hide Secret' : 'Reveal Secret'}
                                </button>
                              </div>
                              <input
                                type={showGatewaySalt ? 'text' : 'password'}
                                placeholder={secretPlaceholder('stripeSecretKey', 'e.g. sk_test_51Mz...')}
                                value={paymentGatewayForm.stripeSecretKey}
                                onChange={(e) => setPaymentGatewayForm(prev => ({ ...prev, stripeSecretKey: e.target.value }))}
                                className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-xs text-text"
                              />
                              <span className="text-[10px] font-mono text-text-muted mt-1 block">
                                Used for creating Stripe Checkout Sessions server-side.
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Authorization & Save Button */}
                    <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-4">
                      <div className="w-full sm:w-64">
                        <label className="text-xs font-mono text-text-muted block mb-1">
                          Authorize with 6-Digit Admin PIN <span className="text-accent">*</span>
                        </label>
                        <input
                          type="password"
                          maxLength={6}
                          placeholder="••••••"
                          value={adminPin}
                          onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                          className="w-full bg-surface-2 border border-border rounded-xl p-2.5 font-mono text-sm tracking-widest text-primary text-center"
                        />
                      </div>

                      <ComicButton
                        variant="primary"
                        size="md"
                        onClick={handleSavePaymentGateway}
                        disabled={adminPin.length !== 6}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        <span>SAVE GATEWAY SETTINGS</span>
                      </ComicButton>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* 3. MODAL: PASS DETAIL & EMERGENCY FORCE-RESET */}
      {selectedPass && passDetail && (
        <div className="responsive-dialog fixed inset-0 z-[70] bg-black/85 flex items-start justify-center p-4 overflow-y-auto overscroll-contain">
          <div className="bg-surface border-2 border-primary rounded-3xl p-6 max-w-lg w-full shadow-[6px_6px_0_#000] max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-comic text-2xl text-primary">PASS DETAIL</h3>
              <button onClick={() => setSelectedPass(null)} className="text-text-muted hover:text-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            {passDetail.pass.photoUrl && (
              <div className="flex items-center gap-3 p-3 mb-4 rounded-xl bg-surface-2 border border-border">
                <img
                  src={passDetail.pass.photoUrl}
                  alt={passDetail.pass.holderName}
                  className="w-16 h-16 rounded-xl object-cover border-2 border-black shadow-[2px_2px_0_#000]"
                />
                <div>
                  <span className="text-xs font-mono font-bold text-success block">★ Photo Verified Pass</span>
                  <span className="text-[10px] font-mono text-text-muted block">Captured during checkout for fast gate face matching</span>
                </div>
              </div>
            )}

            <div className="p-4 rounded-xl bg-surface-2 border border-border font-mono text-xs space-y-1.5 mb-4">
              <div className="flex justify-between">
                <span className="text-text-muted">Order ID:</span>
                <strong className="text-primary">{passDetail.pass.orderId}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Holder Name:</span>
                <span className="text-text font-bold">{passDetail.pass.holderName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Mobile:</span>
                <span className="text-text">{passDetail.pass.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Presence:</span>
                <span className={passDetail.pass.presence === 'INSIDE' ? 'text-success font-bold' : 'text-text-muted'}>
                  {passDetail.pass.presence}
                </span>
              </div>

              {passDetail.pass.presence === 'INSIDE' && (
                <div className="mt-3 pt-3 border-t border-border">
                  <label className="text-[11px] font-mono text-warning block mb-1">
                    Emergency Force-Reset to OUTSIDE (Reason required):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Left through unscanned gate"
                      value={forceResetReason}
                      onChange={(e) => setForceResetReason(e.target.value)}
                      className="flex-1 bg-surface border border-border rounded-lg p-2 text-xs font-mono"
                    />
                    <button
                      onClick={handleForceReset}
                      disabled={actionLoading}
                      className="px-3 py-1 bg-warning text-black font-mono text-xs font-bold rounded-lg border border-black shadow-[1px_1px_0_#000]"
                    >
                      RESET
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2 border-t border-border">
              <button onClick={handleVoidPass} className="text-xs font-mono text-danger hover:underline">
                Void Pass / Cancel
              </button>
              <ComicButton variant="outline" size="sm" onClick={() => setSelectedPass(null)}>
                CLOSE
              </ComicButton>
            </div>
          </div>
        </div>
      )}

      {eventAction && (
        <EventRemovalDialog
          event={eventAction.event}
          mode={eventAction.mode}
          onClose={() => setEventAction(null)}
          onDone={async (message) => {
            const removedId = eventAction.event.eventId;
            setEventAction(null);
            setEventsNotice(message);
            const events = await api.adminListEvents().catch(() => null);
            if (events) setEventsList(events);
            // Stop showing a deleted event's data.
            if (selectedEventScope === removedId && events && !events.some(e => e.eventId === removedId)) {
              setSelectedEventScope('ALL');
              loadAllData('ALL');
            }
          }}
        />
      )}

      {/* 4. MODAL: + CREATE NEW EVENT & PROVISION ADMIN (Super Admin Only) */}
      {newEventModal && (() => {
        const base = Number(newEventForm.basePriceRupees) || 0;
        const fee = Number(newEventForm.platformFeeRupees) || 0;
        const pinLen = newEventForm.adminPin.length;
        const canSubmit = newEventForm.name.trim() && newEventForm.venue.trim() && newEventForm.adminUsername && pinLen === 6;
        const saving = newEventStatus.state === 'saving';
        const done = newEventStatus.state === 'done';
        const copy = (key, value) => {
          navigator.clipboard?.writeText(value);
          setCopiedField(key);
          setTimeout(() => setCopiedField(null), 1500);
        };
        return (
          <div
            className="responsive-dialog adm-modal-backdrop fixed inset-0 z-[70] flex items-start justify-center p-4 overflow-y-auto overscroll-contain"
            onKeyDown={(e) => { if (e.key === 'Escape' && !saving) closeNewEventModal(); }}
          >
            <div role="dialog" aria-modal="true" aria-labelledby="new-event-title" className="adm-modal relative w-full max-w-xl my-8 rounded-3xl p-px">
              <div className="adm-modal-inner relative overflow-hidden rounded-[23px]">
                <div className="adm-hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />

                {/* Header */}
                <div className="relative flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-white/[0.08]">
                  <div className="flex items-center gap-3.5">
                    <span className="adm-icon-tile adm-icon-tile-yellow h-11 w-11 shrink-0 rounded-2xl">
                      {done ? <CheckCircle2 className="h-5 w-5" /> : <PlusCircle className="h-5 w-5" />}
                    </span>
                    <div>
                      <h3 id="new-event-title" className="font-comic text-2xl sm:text-3xl tracking-wide text-white leading-none">
                        {done ? <>Event <span className="text-success">created</span></> : <>New event <span className="text-primary">+ admin</span></>}
                      </h3>
                      <p className="mt-1.5 font-mono text-[11px] text-text-muted">
                        {done ? 'Share these login details with the organizer.' : 'Set up the event and give the organizer their own login.'}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={closeNewEventModal} disabled={saving} className="adm-icon-btn shrink-0" aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {done ? (
                  /* Success: credentials card */
                  <div className="relative p-6 space-y-4">
                    <div className="adm-cred rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Event</span>
                        <span className="text-right">
                          <strong className="block font-comic text-lg text-white leading-tight">{newEventStatus.eventName}</strong>
                          {newEventStatus.eventId && <span className="font-mono text-[10px] text-info">{newEventStatus.eventId}</span>}
                        </span>
                      </div>
                      {[
                        { key: 'user', label: 'Admin username', value: newEventStatus.username },
                        { key: 'pin', label: 'Admin PIN', value: newEventStatus.pin }
                      ].map((row) => (
                        <div key={row.key} className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{row.label}</span>
                          <span className="flex items-center gap-2">
                            <code className="rounded-lg bg-black/40 px-2.5 py-1 font-mono text-sm font-bold tracking-wider text-primary">{row.value}</code>
                            <button type="button" onClick={() => copy(row.key, row.value)} className="adm-btn adm-btn-ghost adm-btn-sm" aria-label={`Copy ${row.label}`}>
                              {copiedField === row.key ? <Check className="h-3.5 w-3.5 text-success" /> : <FileText className="h-3.5 w-3.5" />}
                              {copiedField === row.key ? 'Copied' : 'Copy'}
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="flex items-start gap-2 rounded-xl border border-exit/30 bg-exit/10 px-3 py-2.5 font-mono text-[11px] text-exit">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      The PIN isn't shown again after you close this. Copy it now.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className="adm-btn adm-btn-ghost flex-1 justify-center" onClick={() => setNewEventStatus({ state: 'idle' })}>
                        <PlusCircle className="h-4 w-4" /> Create another
                      </button>
                      <button type="button" className="adm-btn adm-btn-primary flex-1 justify-center" onClick={closeNewEventModal}>
                        Done <Check className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleCreateEvent} className="relative p-6 space-y-5" noValidate>
                    {/* Step 1 */}
                    <fieldset className="adm-step rounded-2xl p-4 space-y-4">
                      <legend className="sr-only">Event details</legend>
                      <div className="flex items-center gap-2.5">
                        <span className="adm-step-num adm-step-num-yellow">1</span>
                        <span className="font-comic text-lg tracking-wide text-white">Event details</span>
                      </div>
                      <div>
                        <label htmlFor="ne-template" className="adm-label">🎨 Card Template <span className="text-info normal-case">(customizable anytime)</span></label>
                        <select
                          id="ne-template"
                          value={selectedTemplateId}
                          onChange={(e) => setSelectedTemplateId(e.target.value)}
                          className="adm-input"
                        >
                          <option value="standard">⚡ Standard Neon Card (Default)</option>
                          {savedTemplates.map(tpl => (
                            <option key={tpl.templateId} value={tpl.templateId}>
                              ✨ {tpl.name} ({tpl.layout === 'kolkata-dusk' ? 'Kolkata Dusk & Starburst' : 'Standard'})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="ne-name" className="adm-label">Event name <span className="text-accent">*</span></label>
                          <input id="ne-name" type="text" required autoFocus placeholder="e.g. Kolkata Anime Con"
                            value={newEventForm.name}
                            onChange={(e) => setNewEventForm({ ...newEventForm, name: e.target.value })}
                            className="adm-input" />
                        </div>
                        <div>
                          <label htmlFor="ne-venue" className="adm-label">Venue <span className="text-accent">*</span></label>
                          <input id="ne-venue" type="text" required placeholder="e.g. Biswa Bangla Mela Prangan"
                            value={newEventForm.venue}
                            onChange={(e) => setNewEventForm({ ...newEventForm, venue: e.target.value })}
                            className="adm-input" />
                        </div>
                      </div>

                      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                        <div>
                          <label htmlFor="ne-start" className="adm-label">First day</label>
                          <input id="ne-start" type="date"
                            value={newEventForm.startDate}
                            onChange={(e) => setNewEventForm({ ...newEventForm, startDate: e.target.value })}
                            className="adm-input [color-scheme:dark]" />
                        </div>
                        <div>
                          <label htmlFor="ne-days" className="adm-label">Days</label>
                          <select id="ne-days" value={newEventForm.dayCount}
                            onChange={(e) => setNewEventForm({ ...newEventForm, dayCount: Number(e.target.value) })}
                            className="adm-input">
                            {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n} {n === 1 ? 'day' : 'days'}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label htmlFor="ne-base" className="adm-label">Ticket price</label>
                          <div className="adm-affix">
                            <span>₹</span>
                            <input id="ne-base" type="number" min="0" inputMode="numeric"
                              value={newEventForm.basePriceRupees}
                              onChange={(e) => setNewEventForm({ ...newEventForm, basePriceRupees: Number(e.target.value) })}
                              className="adm-input" />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="ne-fee" className="adm-label text-info">Platform fee</label>
                          <div className="adm-affix adm-affix-cyan">
                            <span>₹</span>
                            <input id="ne-fee" type="number" min="0" inputMode="numeric"
                              value={newEventForm.platformFeeRupees}
                              onChange={(e) => setNewEventForm({ ...newEventForm, platformFeeRupees: Number(e.target.value) })}
                              className="adm-input text-info font-bold" />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="ne-cap" className="adm-label">Capacity</label>
                          <div className="adm-affix">
                            <Users className="h-3.5 w-3.5" />
                            <input id="ne-cap" type="number" min="10" inputMode="numeric"
                              value={newEventForm.capacity}
                              onChange={(e) => setNewEventForm({ ...newEventForm, capacity: Number(e.target.value) })}
                              className="adm-input" />
                          </div>
                        </div>
                      </div>

                      {/* Live price breakdown */}
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/25 px-3.5 py-2.5 font-mono text-[11px]">
                        <span className="text-text-muted">Fans pay <strong className="text-white">₹{base + fee}</strong></span>
                        <span className="text-text-muted">Organizer <strong className="text-primary">₹{base}</strong> • Platform <strong className="text-info">₹{fee}</strong> / pass</span>
                      </div>
                    </fieldset>

                    {/* Step 2 */}
                    <fieldset className="adm-step rounded-2xl p-4 space-y-4">
                      <legend className="sr-only">Organizer login</legend>
                      <div className="flex items-center gap-2.5">
                        <span className="adm-step-num adm-step-num-magenta">2</span>
                        <span className="font-comic text-lg tracking-wide text-white">Organizer login</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="ne-user" className="adm-label">Admin username <span className="text-accent">*</span></label>
                          <div className="adm-affix">
                            <span>@</span>
                            <input id="ne-user" type="text" required placeholder="anime_admin" autoComplete="off" spellCheck={false}
                              value={newEventForm.adminUsername}
                              onChange={(e) => setNewEventForm({ ...newEventForm, adminUsername: e.target.value.toLowerCase().trim() })}
                              className="adm-input" />
                          </div>
                          <p className="mt-1.5 font-mono text-[10px] text-text-muted">Lowercase, no spaces</p>
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <label htmlFor="ne-pin" className="adm-label">6-digit PIN <span className="text-accent">*</span></label>
                            <button
                              type="button"
                              className="mb-1.5 font-mono text-[10px] font-bold text-info hover:underline"
                              onClick={() => {
                                const pin = String(window.crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
                                setNewEventForm({ ...newEventForm, adminPin: pin });
                                setShowNewEventPin(true);
                              }}
                            >
                              🎲 Generate
                            </button>
                          </div>
                          <div className={`adm-affix adm-affix-pin ${pinLen === 6 ? 'adm-affix-ok' : ''}`}>
                            <Lock className="h-3.5 w-3.5" />
                            <input id="ne-pin" type={showNewEventPin ? 'text' : 'password'} required maxLength={6} inputMode="numeric" autoComplete="new-password" placeholder="••••••"
                              value={newEventForm.adminPin}
                              onChange={(e) => setNewEventForm({ ...newEventForm, adminPin: e.target.value.replace(/\D/g, '') })}
                              className="adm-input tracking-[0.4em] font-bold" />
                            <button type="button" onClick={() => setShowNewEventPin((v) => !v)} className="adm-affix-btn" aria-label={showNewEventPin ? 'Hide PIN' : 'Show PIN'}>
                              {showNewEventPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <p className={`mt-1.5 font-mono text-[10px] ${pinLen === 6 ? 'text-success' : 'text-text-muted'}`}>
                            {pinLen === 6 ? '✓ PIN ready' : `${pinLen}/6 digits`}
                          </p>
                        </div>
                      </div>
                    </fieldset>

                    {newEventStatus.state === 'error' && (
                      <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 font-mono text-xs text-red-300">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{newEventStatus.message}</span>
                      </div>
                    )}

                    <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
                      <button type="button" onClick={closeNewEventModal} disabled={saving} className="adm-btn adm-btn-ghost sm:flex-1 justify-center min-h-12">
                        Cancel
                      </button>
                      <button type="submit" disabled={!canSubmit || saving} className="adm-btn adm-btn-primary adm-btn-lg sm:flex-[1.6] justify-center min-h-12 group">
                        {saving ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" /> : <Zap className="h-4 w-4 fill-black" />}
                        {saving ? 'Creating…' : 'Create event'}
                        {!saving && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 5. MODAL: + ADD NEW STAFF */}
      {newStaffModal && (
        <div className="responsive-dialog fixed inset-0 z-[70] bg-black/85 flex items-start justify-center p-4 overflow-y-auto overscroll-contain">
          <div className="bg-surface border-2 border-info rounded-3xl p-6 max-w-sm w-full shadow-[6px_6px_0_#000]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-comic text-2xl text-info">+ ADD NEW STAFF</h3>
              <button onClick={() => setNewStaffModal(false)} className="text-text-muted hover:text-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3">
              <div>
                <label className="text-xs font-mono text-text-muted block mb-1">Username *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. gate2_volunteer"
                  value={newStaffForm.username}
                  onChange={(e) => setNewStaffForm({ ...newStaffForm, username: e.target.value.toLowerCase().trim() })}
                  className="w-full bg-surface-2 border border-border rounded-xl p-2 font-mono text-xs text-text"
                />
              </div>
              <div>
                <label className="text-xs font-mono text-text-muted block mb-1">Staff Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={newStaffForm.name}
                  onChange={(e) => setNewStaffForm({ ...newStaffForm, name: e.target.value })}
                  className="w-full bg-surface-2 border border-border rounded-xl p-2 font-mono text-xs text-text"
                />
              </div>
              <div>
                <label className="text-xs font-mono text-text-muted block mb-1">Role</label>
                <select
                  value={newStaffForm.role}
                  onChange={(e) => setNewStaffForm({ ...newStaffForm, role: e.target.value })}
                  className="w-full bg-surface-2 border border-border rounded-xl p-2 font-mono text-xs text-text"
                >
                  <option value="CASHIER">Cashier (Box Office POS)</option>
                  <option value="GATE_VOLUNTEER">Gate Volunteer (QR Scanner)</option>
                </select>
              </div>
              {/* The super admin picks the event; an event admin's staff join their own event. */}
              {isSuperAdmin && (
                <div>
                  <label htmlFor="new-staff-event" className="text-xs font-mono text-text-muted block mb-1">Works for event *</label>
                  <select
                    id="new-staff-event"
                    value={newStaffForm.assignedEventId || pickedEvent || ''}
                    onChange={(e) => setNewStaffForm({ ...newStaffForm, assignedEventId: e.target.value })}
                    className="w-full bg-surface-2 border border-border rounded-xl p-2 font-mono text-xs text-text"
                  >
                    <option value="" disabled>Choose an event</option>
                    {eventsList.filter(ev => ev.status !== 'ARCHIVED').map(ev => <option key={ev.eventId} value={ev.eventId}>{ev.name} ({ev.eventId})</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-mono text-accent font-bold block mb-1">6-Digit Login PIN *</label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  placeholder="••••••"
                  value={newStaffForm.pin}
                  onChange={(e) => setNewStaffForm({ ...newStaffForm, pin: e.target.value.replace(/\D/g, '') })}
                  className="w-full bg-surface-2 border-2 border-accent rounded-xl p-2 font-mono text-center tracking-widest text-accent font-bold text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <ComicButton type="button" variant="outline" size="sm" onClick={() => setNewStaffModal(false)} className="flex-1">
                  CANCEL
                </ComicButton>
                <ComicButton type="submit" variant="info" size="sm" className="flex-1">
                  CREATE STAFF
                </ComicButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: AUDITED POST-EVENT EXECUTIVE RECONCILIATION REPORT */}
      {executiveReportModal && (
        <div className="responsive-dialog fixed inset-0 z-[70] bg-black/90 flex items-start justify-center p-4 overflow-y-auto overscroll-contain">
          <div className="bg-[#0A0A16] border-2 border-accent rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-[8px_8px_0_#FF2E88] my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4 border-b border-white/[0.08] pb-4">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-accent block">
                  OFFICIAL AUDITED RECONCILIATION CERTIFICATE
                </span>
                <h3 className="font-comic text-3xl text-white">EXECUTIVE EVENT AUDIT</h3>
                <p className="text-xs font-mono text-text-muted mt-0.5">
                  Report ID: {executiveReportData?.reportId || 'GENERATING...'} • Immutable Platform Audit
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-xl bg-accent text-white font-mono text-xs font-bold border border-black shadow-[1px_1px_0_#000] flex items-center gap-1.5 hover:bg-accent/90"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>PRINT PDF</span>
                </button>
                <button onClick={() => setExecutiveReportModal(false)} className="text-text-muted hover:text-white p-1">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {executiveReportLoading ? (
              <div className="p-12 text-center font-comic text-xl text-primary animate-pulse">
                GENERATING AUDITED RECONCILIATION DATA...
              </div>
            ) : executiveReportData ? (
              <div className="space-y-5 font-mono text-xs">
                {/* Event Metadata Banner */}
                <div className="p-3.5 bg-white/[0.03] border border-white/[0.08] rounded-2xl flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <span className="text-xs text-text-muted block">Event:</span>
                    <strong className="text-sm font-comic text-white">{executiveReportData.event?.name}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-text-muted block">Venue:</span>
                    <strong className="text-xs text-white">{executiveReportData.event?.venue}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-text-muted block">Audit Status:</span>
                    <span className="text-success font-bold">● {executiveReportData.complianceCertificate?.status}</span>
                  </div>
                </div>

                {/* Financial Summary Grid */}
                <div>
                  <span className="text-[11px] font-mono uppercase text-primary font-bold block mb-2">
                    1. Reconciled Financial Settlement
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 bg-surface-2 rounded-2xl border border-border">
                      <span className="text-[10px] text-text-muted block uppercase">Gross Collections</span>
                      <div className="font-comic text-2xl text-primary mt-1">
                        ₹{executiveReportData.financialSummary?.grossRevenueRupees}
                      </div>
                      <span className="text-[10px] text-text-muted">
                        From {executiveReportData.financialSummary?.paidOrdersCount} orders
                      </span>
                    </div>

                    <div className="p-3.5 bg-surface-2 rounded-2xl border border-border">
                      <span className="text-[10px] text-text-muted block uppercase">Platform SaaS Fee</span>
                      <div className="font-comic text-2xl text-info mt-1">
                        ₹{executiveReportData.financialSummary?.platformFeeRupees}
                      </div>
                      <span className="text-[10px] text-text-muted">Flat ₹2 fee deducted</span>
                    </div>

                    <div className="p-3.5 bg-surface-2 rounded-2xl border border-border">
                      <span className="text-[10px] text-text-muted block uppercase">Organizer Net Payout</span>
                      <div className="font-comic text-2xl text-success mt-1">
                        ₹{executiveReportData.financialSummary?.organizerNetRupees}
                      </div>
                      <span className="text-[10px] text-success font-bold">● Disbursed to Bank</span>
                    </div>
                  </div>
                </div>

                {/* Tier Sales Audit Table */}
                {executiveReportData.tierStats && executiveReportData.tierStats.length > 0 && (
                  <div>
                    <span className="text-[11px] font-mono uppercase text-primary font-bold block mb-2">
                      2. Ticket Category Breakdown
                    </span>
                    <div className="overflow-x-auto border border-white/[0.08] rounded-2xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-surface-2 border-b border-border text-text-muted">
                          <tr>
                            <th className="py-2 px-3">TIER NAME</th>
                            <th className="py-2 px-3">RATE</th>
                            <th className="py-2 px-3">PASSES SOLD</th>
                            <th className="py-2 px-3">CAPACITY</th>
                            <th className="py-2 px-3 text-right">GROSS (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {executiveReportData.tierStats.map(t => (
                            <tr key={t.tierId} className="border-b border-border/40">
                              <td className="py-2.5 px-3 font-bold text-white">{t.name}</td>
                              <td className="py-2.5 px-3">₹{t.priceRupees}</td>
                              <td className="py-2.5 px-3 font-bold text-primary">{t.sold}</td>
                              <td className="py-2.5 px-3">{t.capacity || 'Unlimited'}</td>
                              <td className="py-2.5 px-3 text-right font-comic text-sm text-white">₹{t.revenueRupees}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Turnstile Ingress Audit */}
                <div>
                  <span className="text-[11px] font-mono uppercase text-accent font-bold block mb-2">
                    3. Turnstile Attendance & Anti-Fraud Audit
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-3 bg-surface-2 rounded-xl text-center">
                      <span className="text-[10px] text-text-muted block">Total Entries</span>
                      <strong className="text-lg text-success font-comic">
                        {executiveReportData.attendanceStats?.totalEntries}
                      </strong>
                    </div>
                    <div className="p-3 bg-surface-2 rounded-xl text-center">
                      <span className="text-[10px] text-text-muted block">Total Exits</span>
                      <strong className="text-lg text-exit font-comic">
                        {executiveReportData.attendanceStats?.totalExits}
                      </strong>
                    </div>
                    <div className="p-3 bg-surface-2 rounded-xl text-center">
                      <span className="text-[10px] text-text-muted block">Turnout Rate</span>
                      <strong className="text-lg text-primary font-comic">
                        {executiveReportData.attendanceStats?.turnoutPct}%
                      </strong>
                    </div>
                    <div className="p-3 bg-surface-2 rounded-xl text-center">
                      <span className="text-[10px] text-text-muted block">Fraud Prevented</span>
                      <strong className="text-lg text-danger font-comic">
                        {executiveReportData.attendanceStats?.fraudAttemptsBlocked}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Cryptographic Compliance Seal */}
                <div className="p-3.5 bg-black/50 border border-success/40 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-success uppercase font-bold block">
                      Cryptographic Audit Seal (SHA-256)
                    </span>
                    <span className="text-[10px] font-mono text-text-muted truncate block">
                      {executiveReportData.complianceCertificate?.hashSignature}
                    </span>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-success/20 text-success text-[10px] font-mono font-bold border border-success/40">
                    VERIFIED COMPLIANT
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 7. MODAL: REISSUED PASS CONFIRMATION */}
      {reissuedPassData && (
        <div className="responsive-dialog fixed inset-0 z-[70] bg-black/90 flex items-start justify-center p-4 overflow-y-auto overscroll-contain">
          <div className="bg-surface border-2 border-success rounded-3xl p-6 max-w-sm w-full text-center shadow-[6px_6px_0_#16A34A]">
            <span className="text-xs font-mono font-bold text-success uppercase block mb-1">
              ✓ PASS SUCCESSFULLY REISSUED
            </span>
            <h3 className="font-comic text-2xl text-white mb-2">{reissuedPassData.holderName}</h3>
            <p className="text-xs font-mono text-text-muted mb-3">
              New Pass ID: <strong className="text-primary">{reissuedPassData.orderId}</strong>
            </p>
            <p className="text-[11px] font-mono text-warning bg-warning/10 p-2 rounded-xl border border-warning/30 mb-4">
              Old QR code has been permanently invalidated. Gate volunteers will only accept this new pass.
            </p>

            <div className="flex gap-2">
              <a
                href={`/pass/${reissuedPassData.orderId}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2 rounded-xl bg-primary text-black font-mono text-xs font-bold border border-black shadow-[1px_1px_0_#000] flex items-center justify-center"
              >
                OPEN PASS ↗
              </a>
              <button
                onClick={() => setReissuedPassData(null)}
                className="px-4 py-2 rounded-xl bg-surface-2 border border-border text-text font-mono text-xs font-bold"
              >
                DONE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
