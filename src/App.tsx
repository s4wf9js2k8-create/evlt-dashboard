import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Award,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Info,
  ListChecks,
  LogOut,
  Menu,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  Train,
  Users,
  Wrench,
  X
} from 'lucide-react';
import { requestFCMToken, subscribeToForegroundMessages, VAPID_KEY, firebaseConfig } from './firebase';

// --- Type Definitions ---
export interface Volunteer {
  Name: string;
  Pin: string;
  Roles: string;
  'DBS Status': string;
}

export interface FleetItem {
  name: string;
  type: 'Steam' | 'Diesel' | 'Electric' | 'Coach' | 'Other';
  gauge: string;
  state: 'In Service' | 'Out of Service' | 'Overhaul';
}

export interface Incident {
  id: number;
  asset: string;
  Description: string;
  'Red Tag Status': 'Operational' | 'Out of Service';
  Status: 'Open' | 'Resolved';
  Date: string;
  reportedBy?: string;
}

export interface MaintenanceLog {
  id: number;
  assetName: string;
  workDone: string;
  startDate: string;
  endDate: string;
  performedBy: string[];
  updateState?: string;
}

export interface ClockLog {
  id: number;
  name: string;
  date: string;
  clockIn: string;
  clockOut: string;
  status: 'Clocked In' | 'Completed';
}

export interface ActionItem {
  id: number;
  Title: string;
  Description: string;
  Asset?: string;
  AssignedTo?: string;
  DueDate: string;
  Priority?: 'Normal' | 'Medium' | 'High';
  Status: 'Pending' | 'Completed';
  createdDate: string;
}

export interface TrackSection {
  id: string;
  name: string;
  health: 'Good' | 'Needs Inspection' | 'Blocked / Poor';
  notes?: string;
}

export interface DailyChecks {
  lastCheckDate?: string;
  trackWalk?: {
    inspector?: string;
    result?: 'Pass' | 'Fail' | 'Not Completed';
    notes?: string;
  };
  testRun?: {
    inspector?: string;
    result?: 'Pass' | 'Fail' | 'Not Completed';
    notes?: string;
    trains?: string[];
  };
  runningTrains?: string[];
}

export interface UserSession {
  name: string;
  isSystemAdmin: boolean;
  isShopKiosk: boolean;
  volData?: Volunteer;
}

// --- Initial Mock Data ---
function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

const INITIAL_VOLUNTEERS: Volunteer[] = [
  { Name: 'Louie Hull', Pin: '1234', Roles: 'Admin, Management, Driver, Maintenance', 'DBS Status': 'Cleared' },
  { Name: 'Dave Mitchell', Pin: '4321', Roles: 'Driver, Platform, Maintenance', 'DBS Status': 'Cleared' },
  { Name: 'Sarah Jenkins', Pin: '5566', Roles: 'Shop, Tearoom, Platform', 'DBS Status': 'Cleared' },
  { Name: 'Peter Adams', Pin: '7788', Roles: 'Driver, Barn, Eurotunnel', 'DBS Status': 'Cleared' },
];

const INITIAL_FLEET: FleetItem[] = [
  { name: 'Canadian Pacific', type: 'Steam', gauge: "7 1/4''", state: 'In Service' },
  { name: 'DB', type: 'Diesel', gauge: "7 1/4''", state: 'In Service' },
  { name: 'Santa Fe', type: 'Diesel', gauge: "7 1/4''", state: 'In Service' },
  { name: 'George', type: 'Steam', gauge: "7 1/4''", state: 'In Service' },
  { name: 'Edward', type: 'Steam', gauge: "5''", state: 'In Service' },
  { name: 'Dylan', type: 'Electric', gauge: "5''", state: 'In Service' },
  { name: 'June', type: 'Coach', gauge: "7 1/4''", state: 'In Service' },
  { name: 'Daphne', type: 'Coach', gauge: "7 1/4''", state: 'In Service' }
];

const INITIAL_TRACK_SECTIONS: TrackSection[] = [
  { id: 'running-loop', name: 'Running loop', health: 'Good', notes: 'Ballast secure, clear line of sight.' },
  { id: 'left-platform', name: 'Left platform', health: 'Good', notes: 'Clearance normal.' },
  { id: 'right-platform', name: 'Right platform', health: 'Good', notes: 'Surface intact.' },
  { id: 'platform-crossover', name: 'Right exit crossover', health: 'Good', notes: 'Points throw freely.' },
  { id: 'platform-throat', name: 'Platform convergence', health: 'Needs Inspection', notes: 'Points switch tension requires review.' },
  { id: 'northbound-line', name: 'Northbound single line', health: 'Good', notes: 'Track walk verified.' },
  { id: 'right-platform-siding', name: 'Right platform siding', health: 'Good', notes: 'Buffer stop secure.' }
];

const AVAILABLE_TRAINS = ["Canadian Pacific", "DB", "Santa Fe", "George", "Edward", "Dylan", "June", "Daphne"];

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isDefectModalOpen, setIsDefectModalOpen] = useState(false);
  const [isOpCheckModalOpen, setIsOpCheckModalOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [opCheckType, setOpCheckType] = useState<'trackWalk' | 'testRun'>('trackWalk');

  // App State with localStorage persistence
  const [volunteers, setVolunteers] = useState<Volunteer[]>(() => {
    const saved = localStorage.getItem('evlt_volunteers');
    return saved ? JSON.parse(saved) : INITIAL_VOLUNTEERS;
  });

  const [fleetItems, setFleetItems] = useState<FleetItem[]>(() => {
    const saved = localStorage.getItem('evlt_fleet');
    return saved ? JSON.parse(saved) : INITIAL_FLEET;
  });

  const [incidents, setIncidents] = useState<Incident[]>(() => {
    const saved = localStorage.getItem('evlt_incidents');
    return saved ? JSON.parse(saved) : [
      {
        id: 1,
        asset: 'Canadian Pacific',
        Description: 'Injector water valve sticky during initial steam-up',
        'Red Tag Status': 'Out of Service',
        Status: 'Open',
        Date: getTodayString(),
        reportedBy: 'Louie Hull'
      }
    ];
  });

  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>(() => {
    const saved = localStorage.getItem('evlt_maint_logs');
    return saved ? JSON.parse(saved) : [
      {
        id: 1,
        assetName: 'Canadian Pacific',
        workDone: 'Lubricated steam regulator linkage and inspected safety valves.',
        startDate: getTodayString(),
        endDate: getTodayString(),
        performedBy: ['Louie Hull', 'Dave Mitchell'],
        updateState: 'In Service'
      }
    ];
  });

  const [clockLogs, setClockLogs] = useState<ClockLog[]>(() => {
    const saved = localStorage.getItem('evlt_clock_logs');
    return saved ? JSON.parse(saved) : [
      { id: 1, name: 'Louie Hull', date: getTodayString(), clockIn: '09:15', clockOut: '-', status: 'Clocked In' },
      { id: 2, name: 'Dave Mitchell', date: getTodayString(), clockIn: '09:30', clockOut: '-', status: 'Clocked In' }
    ];
  });

  const [actions, setActions] = useState<ActionItem[]>(() => {
    const saved = localStorage.getItem('evlt_actions');
    return saved ? JSON.parse(saved) : [
      {
        id: 1,
        Title: 'Lubricate Peene Yard platform points',
        Description: 'Grease mechanical throw bar and verify alignment switches.',
        Asset: 'Platform Throat',
        AssignedTo: 'Maintenance Team',
        DueDate: getTodayString(),
        Priority: 'High',
        Status: 'Pending',
        createdDate: getTodayString()
      },
      {
        id: 2,
        Title: 'Brake cylinder check on Coach June',
        Description: 'Inspect air seals and check vacuum pipe connections.',
        Asset: 'June',
        AssignedTo: 'Dave Mitchell',
        DueDate: getTodayString(),
        Priority: 'Normal',
        Status: 'Pending',
        createdDate: getTodayString()
      }
    ];
  });

  const [dailyChecks, setDailyChecks] = useState<DailyChecks>(() => {
    const saved = localStorage.getItem('evlt_daily_checks');
    return saved ? JSON.parse(saved) : {
      lastCheckDate: getTodayString(),
      trackWalk: { inspector: 'Louie Hull', result: 'Pass', notes: 'Track bed clear, ballast sound, points operational.' },
      testRun: { inspector: 'Dave Mitchell', result: 'Pass', notes: 'Smooth running loop clearance check completed.', trains: ['Canadian Pacific'] },
      runningTrains: ['Canadian Pacific', 'June']
    };
  });

  const [trackSections, setTrackSections] = useState<TrackSection[]>(() => {
    const saved = localStorage.getItem('evlt_track_sections');
    return saved ? JSON.parse(saved) : INITIAL_TRACK_SECTIONS;
  });

  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem('evlt_current_user');
    return saved ? JSON.parse(saved) : { name: 'System Admin', isSystemAdmin: true, isShopKiosk: false };
  });

  // Notification status handling & Firebase FCM
  const isNotificationAvailable = typeof window !== 'undefined' && 'Notification' in window;
  const [notificationPerm, setNotificationPerm] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });
  const [fcmToken, setFcmToken] = useState<string>(() => {
    return localStorage.getItem('evlt_fcm_token') || '';
  });
  const [isRegisteringFcm, setIsRegisteringFcm] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [notificationStatusMsg, setNotificationStatusMsg] = useState<string | null>(null);

  // Subscribe to foreground FCM messages
  useEffect(() => {
    const unsubscribe = subscribeToForegroundMessages((payload) => {
      console.log('Foreground push received:', payload);
      const title = payload.notification?.title || payload.data?.title || '🚨 EVLT Operational Alert';
      const body = payload.notification?.body || payload.data?.body || 'New message received from Railway Operations.';
      setNotificationStatusMsg(`${title}: ${body}`);
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/apple-touch-icon.png' });
        }
      } catch {}
    });
    return unsubscribe;
  }, []);

  // Sync to localStorage
  useEffect(() => { localStorage.setItem('evlt_volunteers', JSON.stringify(volunteers)); }, [volunteers]);
  useEffect(() => { localStorage.setItem('evlt_fleet', JSON.stringify(fleetItems)); }, [fleetItems]);
  useEffect(() => { localStorage.setItem('evlt_incidents', JSON.stringify(incidents)); }, [incidents]);
  useEffect(() => { localStorage.setItem('evlt_maint_logs', JSON.stringify(maintenanceLogs)); }, [maintenanceLogs]);
  useEffect(() => { localStorage.setItem('evlt_clock_logs', JSON.stringify(clockLogs)); }, [clockLogs]);
  useEffect(() => { localStorage.setItem('evlt_actions', JSON.stringify(actions)); }, [actions]);
  useEffect(() => { localStorage.setItem('evlt_daily_checks', JSON.stringify(dailyChecks)); }, [dailyChecks]);
  useEffect(() => { localStorage.setItem('evlt_track_sections', JSON.stringify(trackSections)); }, [trackSections]);
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('evlt_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('evlt_current_user');
    }
  }, [currentUser]);

  // Calculations
  const activeClockIns = clockLogs.filter(l => l.status === 'Clocked In');
  const activeStaffCount = activeClockIns.length;

  let qualifiedDriverCount = 0;
  activeClockIns.forEach(log => {
    const vol = volunteers.find(v => v.Name.toLowerCase() === log.name.toLowerCase());
    if (vol && (vol.Roles || '').toLowerCase().includes('driver')) {
      qualifiedDriverCount++;
    }
  });

  const openIncidents = incidents.filter(i => i.Status !== 'Resolved');
  const openIncidentsCount = openIncidents.length;
  const overdueActions = actions.filter(a => a.Status !== 'Completed' && a.DueDate && a.DueDate < getTodayString());
  const overdueActionsCount = overdueActions.length;

  // Track inspector state
  const [inspectedSectionId, setInspectedSectionId] = useState<string | null>(null);
  const [sectionHealthDraft, setSectionHealthDraft] = useState<'Good' | 'Needs Inspection' | 'Blocked / Poor'>('Good');
  const [sectionNotesDraft, setSectionNotesDraft] = useState('');
  const [selectedTrainToAdd, setSelectedTrainToAdd] = useState('');

  // Clock Actions
  const handleClockAction = (name: string, type: 'In' | 'Out') => {
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const today = getTodayString();
    if (type === 'In') {
      const newLog: ClockLog = { id: Date.now(), name, date: today, clockIn: nowTime, clockOut: '-', status: 'Clocked In' };
      setClockLogs(prev => [newLog, ...prev]);
    } else {
      setClockLogs(prev => prev.map(log => log.name === name && log.status === 'Clocked In' ? { ...log, clockOut: nowTime, status: 'Completed' } : log));
    }
  };

  // Safe Notification & FCM Registration Handler
  const handleRequestPushPermission = async () => {
    setIsRegisteringFcm(true);
    setNotificationStatusMsg(null);

    if (!isNotificationAvailable) {
      setNotificationStatusMsg('Browser notifications are restricted in this preview iframe. Open the application directly in a full browser tab to register.');
      setIsRegisteringFcm(false);
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      setNotificationPerm(perm);

      if (perm === 'granted') {
        // Attempt FCM token retrieval via Service Worker
        const fcmResult = await requestFCMToken();
        if (fcmResult.success && fcmResult.token) {
          setFcmToken(fcmResult.token);
          localStorage.setItem('evlt_fcm_token', fcmResult.token);
          setNotificationStatusMsg('✅ Push notifications active! Firebase Cloud Messaging device token generated.');
        } else {
          setNotificationStatusMsg(`Notification permission granted. Note: ${fcmResult.error || 'Open in new tab to register Service Worker.'}`);
        }

        try {
          new Notification('🚂 EVLT Operations Alert', {
            body: 'Background operational notifications are active on this device.',
            icon: '/apple-touch-icon.png'
          });
        } catch {
          // Ignore if blocked in sandboxed iframe
        }
      } else {
        setNotificationStatusMsg('Notifications were denied or blocked in browser settings.');
      }
    } catch {
      setNotificationStatusMsg('Could not complete notification setup in current iframe environment.');
    } finally {
      setIsRegisteringFcm(false);
    }
  };

  const copyFcmTokenToClipboard = () => {
    if (!fcmToken) return;
    navigator.clipboard.writeText(fcmToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2500);
  };

  const getTrackColor = (health: 'Good' | 'Needs Inspection' | 'Blocked / Poor') => {
    if (health === 'Good') return '#16a34a';
    if (health === 'Needs Inspection') return '#ca8a04';
    return '#dc2626';
  };

  const runningTrains = dailyChecks.runningTrains || [];
  const trackWalkPassed = dailyChecks.trackWalk?.result === 'Pass';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-emerald-950/40 bg-[#1e3a1e] px-4 text-white shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="rounded p-1.5 hover:bg-white/10 text-white sm:hidden"
            aria-label="Toggle navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
            <svg className="h-8 w-8 shrink-0" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="48" fill="#fcf8ee" stroke="#1e3a1e" strokeWidth="4"/>
              <defs>
                <path id="topArcHead" d="M 15,50 A 35,35 0 0,1 85,50" />
                <path id="bottomArcHead" d="M 85,50 A 35,35 0 0,1 15,50" />
              </defs>
              <text fontFamily="system-ui, sans-serif" fontSize="8.5" fontWeight="bold" fill="#1e3a1e">
                <textPath href="#topArcHead" startOffset="50%" textAnchor="middle">WHEELS OF TIME</textPath>
              </text>
              <text fontFamily="system-ui, sans-serif" fontSize="7" fontWeight="bold" fill="#1e3a1e">
                <textPath href="#bottomArcHead" startOffset="50%" textAnchor="middle">RAILWAY MUSEUM</textPath>
              </text>
              <rect x="20" y="38" width="60" height="24" rx="12" fill="#1e3a1e"/>
              <rect x="22" y="40" width="56" height="20" rx="10" fill="#fcf8ee"/>
              <text x="50" y="49" fontFamily="serif" fontSize="6.5" fontWeight="bold" fill="#1e3a1e" textAnchor="middle">ELHAM VALLEY</text>
              <text x="50" y="56" fontFamily="system-ui, sans-serif" fontSize="4" fontWeight="bold" fill="#1e3a1e" textAnchor="middle">LINE TRUST</text>
            </svg>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-white sm:text-base">EVLT Operations</span>
              <span className="hidden sm:inline text-[10px] text-emerald-200/80 font-mono tracking-wider uppercase">Peene Yard 7¼″ Railway</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsNotificationModalOpen(true)}
            className="relative flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition"
            title="Notification Center & Background Push Setup"
          >
            <Bell className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Push Alerts</span>
            {openIncidentsCount > 0 && (
              <span className="h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#1e3a1e]" />
            )}
          </button>

          {currentUser ? (
            <div className="flex items-center gap-2 border-l border-emerald-800/60 pl-2">
              <span className="hidden lg:inline text-xs font-medium text-emerald-100">{currentUser.name}</span>
              <button
                onClick={() => setCurrentUser(null)}
                className="rounded p-1.5 text-emerald-200 hover:bg-white/10 hover:text-white transition"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsLoginOpen(true)}
              className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500 shadow-xs transition"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 relative">
        {/* Mobile Backdrop */}
        {isSidebarOpen && (
          <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs sm:hidden" onClick={() => setIsSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={`fixed sm:sticky top-14 left-0 z-40 h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-900 text-slate-300 p-3 flex flex-col justify-between transition-transform duration-200 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}`}>
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Operations</div>
              <button onClick={() => { setCurrentView('dashboard'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${currentView === 'dashboard' ? 'bg-[#1e3a1e] text-white font-bold' : 'hover:bg-slate-800 text-slate-300'}`}>
                <Train className="h-4 w-4" /> Operations Dashboard
              </button>
              <button onClick={() => { setCurrentView('clock'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${currentView === 'clock' ? 'bg-[#1e3a1e] text-white font-bold' : 'hover:bg-slate-800 text-slate-300'}`}>
                <Clock className="h-4 w-4" /> Clock In / Out
              </button>
              <button onClick={() => { setCurrentView('incidents'); setIsSidebarOpen(false); }} className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition ${currentView === 'incidents' ? 'bg-[#1e3a1e] text-white font-bold' : 'hover:bg-slate-800 text-slate-300'}`}>
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-red-400" /> Incident &amp; Red Tag
                </div>
                {openIncidentsCount > 0 && (
                  <span className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{openIncidentsCount}</span>
                )}
              </button>
              <button onClick={() => { setCurrentView('maintenance'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${currentView === 'maintenance' ? 'bg-[#1e3a1e] text-white font-bold' : 'hover:bg-slate-800 text-slate-300'}`}>
                <Wrench className="h-4 w-4" /> Fleet &amp; Maintenance
              </button>
              <button onClick={() => { setCurrentView('actions'); setIsSidebarOpen(false); }} className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition ${currentView === 'actions' ? 'bg-[#1e3a1e] text-white font-bold' : 'hover:bg-slate-800 text-slate-300'}`}>
                <div className="flex items-center gap-2.5">
                  <CheckSquare className="h-4 w-4" /> Actions &amp; Tasks
                </div>
                {overdueActionsCount > 0 && (
                  <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{overdueActionsCount}</span>
                )}
              </button>
            </div>

            <div className="space-y-1">
              <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Personnel &amp; Roster</div>
              <button onClick={() => { setCurrentView('volunteers'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${currentView === 'volunteers' ? 'bg-[#1e3a1e] text-white font-bold' : 'hover:bg-slate-800 text-slate-300'}`}>
                <Users className="h-4 w-4" /> Volunteers &amp; DBS
              </button>
              <button onClick={() => { setCurrentView('calendar'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${currentView === 'calendar' ? 'bg-[#1e3a1e] text-white font-bold' : 'hover:bg-slate-800 text-slate-300'}`}>
                <Calendar className="h-4 w-4" /> Attendance Calendar
              </button>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-500">
            <p className="font-semibold text-slate-400">Elham Valley Line Trust</p>
            <p>Peene, Folkestone CT18 8AZ</p>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto min-w-0">
          {/* Driver Compliance Safety Banner */}
          {qualifiedDriverCount >= 2 ? (
            <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 shadow-xs">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>Qualified drivers currently clocked in: <strong>{qualifiedDriverCount}</strong> — Railway Safety Requirement Satisfied.</span>
            </div>
          ) : (
            <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-900 shadow-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 animate-pulse" />
                <span>SAFETY RESTRICTION: Only <strong>{qualifiedDriverCount}</strong> qualified driver currently on site. A minimum of 2 drivers is required to run trains.</span>
              </div>
              <button onClick={() => setCurrentView('clock')} className="rounded bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-700">Clock Station</button>
            </div>
          )}

          {/* VIEW: DASHBOARD */}
          {currentView === 'dashboard' && (
            <div className="space-y-5">
              {/* Notifications / FCM Banner */}
              <div className="rounded-lg border border-emerald-900/20 bg-emerald-900/5 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1e3a1e] text-white shrink-0">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Background Push Notifications &amp; Alerts</h4>
                    <p className="text-[11px] text-slate-600">
                      Stay informed of Red Tag equipment lockouts and safety roster warnings even when the browser is closed.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleRequestPushPermission}
                    className="rounded-md bg-[#1e3a1e] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#152915] transition shadow-xs"
                  >
                    Enable Notifications
                  </button>
                  <button
                    onClick={() => setIsNotificationModalOpen(true)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Setup Guide
                  </button>
                </div>
              </div>

              {notificationStatusMsg && (
                <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 flex items-center justify-between">
                  <span>{notificationStatusMsg}</span>
                  <button onClick={() => setNotificationStatusMsg(null)} className="text-amber-700 hover:text-amber-900 font-bold ml-2">×</button>
                </div>
              )}

              {/* Page Title & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">Operations Dashboard</h2>
                  <p className="text-xs text-slate-500">Peene Yard 7¼″ Railway daily safety inspections and live operational tracking.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsDefectModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-700 shadow-xs"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Report Defect / Red Tag
                  </button>
                </div>
              </div>

              {/* Running Locos */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Train className="h-3.5 w-3.5 text-emerald-700" /> Today's Running Locomotives &amp; Stock
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">Resets Daily</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {runningTrains.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">No locomotives assigned for running today.</span>
                  ) : (
                    runningTrains.map(train => (
                      <span key={train} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-800">
                        <Train className="h-3 w-3 text-emerald-600" /> {train}
                        <button
                          type="button"
                          onClick={() => setDailyChecks({ ...dailyChecks, runningTrains: runningTrains.filter(t => t !== train) })}
                          className="ml-1 text-emerald-700 hover:text-red-600 transition"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1 max-w-sm">
                  <select
                    value={selectedTrainToAdd}
                    onChange={(e) => setSelectedTrainToAdd(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-emerald-600"
                  >
                    <option value="">-- Add Loco to Today's Run --</option>
                    {AVAILABLE_TRAINS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (selectedTrainToAdd && !runningTrains.includes(selectedTrainToAdd)) {
                        setDailyChecks({ ...dailyChecks, runningTrains: [...runningTrains, selectedTrainToAdd] });
                        setSelectedTrainToAdd('');
                      }
                    }}
                    disabled={!selectedTrainToAdd}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
              </div>

              {/* Mandatory Daily Safety Checks */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-slate-600">
                  Mandatory Daily Safety Inspections
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="py-2.5 px-4">Inspection</th>
                      <th className="py-2.5 px-4">Inspector</th>
                      <th className="py-2.5 px-4 text-center">Result</th>
                      <th className="py-2.5 px-4">Notes</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold">Track Walk Inspection</td>
                      <td className="py-3 px-4 text-slate-600">{dailyChecks.trackWalk?.inspector || 'Unassigned'}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-white font-bold ${dailyChecks.trackWalk?.result === 'Pass' ? 'bg-emerald-600' : 'bg-slate-300 text-slate-600'}`}>
                          {dailyChecks.trackWalk?.result === 'Pass' ? <Check className="h-3.5 w-3.5" /> : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{dailyChecks.trackWalk?.notes || '-'}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => { setOpCheckType('trackWalk'); setIsOpCheckModalOpen(true); }}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-slate-50"
                        >
                          Log Check
                        </button>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold">Test Run Inspection</td>
                      <td className="py-3 px-4 text-slate-600">{dailyChecks.testRun?.inspector || 'Unassigned'}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-white font-bold ${dailyChecks.testRun?.result === 'Pass' ? 'bg-emerald-600' : 'bg-slate-300 text-slate-600'}`}>
                          {dailyChecks.testRun?.result === 'Pass' ? <Check className="h-3.5 w-3.5" /> : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{dailyChecks.testRun?.notes || '-'}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => { setOpCheckType('testRun'); setIsOpCheckModalOpen(true); }}
                          disabled={!trackWalkPassed}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40"
                          title={!trackWalkPassed ? 'Track Walk must pass first' : ''}
                        >
                          Log Check
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Stats Counters */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div onClick={() => setCurrentView('clock')} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-emerald-600 transition cursor-pointer">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Staff On Site</span>
                    <Users className="h-4 w-4 text-emerald-700" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900 mt-2">{activeStaffCount}</div>
                </div>

                <div onClick={() => setCurrentView('incidents')} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-red-600 transition cursor-pointer">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Open Defects</span>
                    <ShieldAlert className="h-4 w-4 text-red-600" />
                  </div>
                  <div className={`text-2xl font-bold mt-2 ${openIncidentsCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>{openIncidentsCount}</div>
                </div>

                <div onClick={() => setCurrentView('maintenance')} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-emerald-600 transition cursor-pointer">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Fleet Units</span>
                    <Wrench className="h-4 w-4 text-emerald-700" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900 mt-2">{fleetItems.length}</div>
                </div>

                <div onClick={() => setCurrentView('actions')} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-amber-600 transition cursor-pointer">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Overdue Tasks</span>
                    <Clock className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className={`text-2xl font-bold mt-2 ${overdueActionsCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{overdueActionsCount}</div>
                </div>
              </div>

              {/* Interactive Peene Yard Track Condition Diagram */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">7¼″ Peene Yard Track Condition</h3>
                    <p className="text-xs text-slate-500">Tap any track segment below to inspect or update safety status.</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-semibold">
                    <span className="flex items-center gap-1 text-emerald-700"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Good</span>
                    <span className="flex items-center gap-1 text-amber-700"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Needs Inspection</span>
                    <span className="flex items-center gap-1 text-red-700"><span className="h-2.5 w-2.5 rounded-full bg-red-600" /> Blocked / Poor</span>
                  </div>
                </div>

                <div className="relative rounded-lg border border-slate-200 bg-[#eef3ee] p-3 overflow-hidden">
                  <svg className="w-full h-auto max-h-[400px] select-none" viewBox="0 0 720 540" role="img" aria-label="Peene Yard track diagram">
                    <rect x="0" y="0" width="720" height="540" rx="8" fill="#eef3ee" />
                    <text x="24" y="32" fontSize="14" fontWeight="800" fill="#334155" fontFamily="system-ui">PEENE YARD • 7¼″ GAUGE</text>
                    <text x="24" y="52" fontSize="11" fontWeight="600" fill="#64748b" fontFamily="system-ui">Single Running Loop &amp; Terminal Platforms</text>

                    {/* Running Loop */}
                    <path d="M270 275 C170 245 105 325 135 425 C165 525 275 560 360 515 C445 560 555 525 585 425 C615 325 550 245 450 275" fill="none" stroke="#475569" strokeWidth="20" strokeLinecap="round" opacity="0.8" />
                    <path
                      d="M270 275 C170 245 105 325 135 425 C165 525 275 560 360 515 C445 560 555 525 585 425 C615 325 550 245 450 275"
                      fill="none"
                      stroke={getTrackColor(trackSections.find(s => s.id === 'running-loop')?.health || 'Good')}
                      strokeWidth="10"
                      strokeLinecap="round"
                      className="cursor-pointer hover:stroke-[14px] transition-all"
                      onClick={() => {
                        const sec = trackSections.find(s => s.id === 'running-loop');
                        if (sec) { setInspectedSectionId(sec.id); setSectionHealthDraft(sec.health); setSectionNotesDraft(sec.notes || ''); }
                      }}
                    />

                    {/* Left Platform */}
                    <path d="M270 275 C300 250 320 205 335 145 C342 120 350 103 360 92" fill="none" stroke="#475569" strokeWidth="18" strokeLinecap="round" opacity="0.8" />
                    <path
                      d="M270 275 C300 250 320 205 335 145 C342 120 350 103 360 92"
                      fill="none"
                      stroke={getTrackColor(trackSections.find(s => s.id === 'left-platform')?.health || 'Good')}
                      strokeWidth="9"
                      strokeLinecap="round"
                      className="cursor-pointer hover:stroke-[13px] transition-all"
                      onClick={() => {
                        const sec = trackSections.find(s => s.id === 'left-platform');
                        if (sec) { setInspectedSectionId(sec.id); setSectionHealthDraft(sec.health); setSectionNotesDraft(sec.notes || ''); }
                      }}
                    />

                    {/* Right Platform */}
                    <path d="M450 275 C420 250 400 205 385 145 C378 120 370 103 360 92" fill="none" stroke="#475569" strokeWidth="18" strokeLinecap="round" opacity="0.8" />
                    <path
                      d="M450 275 C420 250 400 205 385 145 C378 120 370 103 360 92"
                      fill="none"
                      stroke={getTrackColor(trackSections.find(s => s.id === 'right-platform')?.health || 'Good')}
                      strokeWidth="9"
                      strokeLinecap="round"
                      className="cursor-pointer hover:stroke-[13px] transition-all"
                      onClick={() => {
                        const sec = trackSections.find(s => s.id === 'right-platform');
                        if (sec) { setInspectedSectionId(sec.id); setSectionHealthDraft(sec.health); setSectionNotesDraft(sec.notes || ''); }
                      }}
                    />

                    {/* Platform Crossover */}
                    <path d="M450 275 C415 285 380 270 350 235 C335 218 325 200 320 180" fill="none" stroke="#475569" strokeWidth="16" strokeLinecap="round" opacity="0.8" />
                    <path
                      d="M450 275 C415 285 380 270 350 235 C335 218 325 200 320 180"
                      fill="none"
                      stroke={getTrackColor(trackSections.find(s => s.id === 'platform-crossover')?.health || 'Good')}
                      strokeWidth="8"
                      strokeLinecap="round"
                      className="cursor-pointer hover:stroke-[12px] transition-all"
                      onClick={() => {
                        const sec = trackSections.find(s => s.id === 'platform-crossover');
                        if (sec) { setInspectedSectionId(sec.id); setSectionHealthDraft(sec.health); setSectionNotesDraft(sec.notes || ''); }
                      }}
                    />

                    {/* Northbound Single Line */}
                    <path d="M360 92 L360 35" fill="none" stroke="#475569" strokeWidth="18" strokeLinecap="round" opacity="0.8" />
                    <path
                      d="M360 92 L360 35"
                      fill="none"
                      stroke={getTrackColor(trackSections.find(s => s.id === 'northbound-line')?.health || 'Good')}
                      strokeWidth="9"
                      strokeLinecap="round"
                      className="cursor-pointer hover:stroke-[13px] transition-all"
                      onClick={() => {
                        const sec = trackSections.find(s => s.id === 'northbound-line');
                        if (sec) { setInspectedSectionId(sec.id); setSectionHealthDraft(sec.health); setSectionNotesDraft(sec.notes || ''); }
                      }}
                    />

                    {/* Text labels */}
                    <text x="210" y="195" fontSize="12" fontWeight="700" fill="#334155">LEFT PLATFORM</text>
                    <text x="430" y="195" fontSize="12" fontWeight="700" fill="#334155">RIGHT PLATFORM</text>
                    <text x="310" y="500" fontSize="12" fontWeight="700" fill="#475569">RUNNING LOOP</text>
                    <circle cx="360" cy="92" r="7" fill="#1e3a1e" stroke="#fff" strokeWidth="2.5" />
                  </svg>
                </div>

                {/* Track Section Inspector Modal/Card if selected */}
                {inspectedSectionId && (
                  <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <h4 className="font-bold text-xs text-slate-800">
                        Inspect Section: {trackSections.find(s => s.id === inspectedSectionId)?.name}
                      </h4>
                      <button onClick={() => setInspectedSectionId(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Safety Status</label>
                        <select
                          value={sectionHealthDraft}
                          onChange={(e) => setSectionHealthDraft(e.target.value as any)}
                          className="w-full rounded border border-slate-300 bg-white p-1.5 text-xs outline-none"
                        >
                          <option value="Good">Good (Cleared for running)</option>
                          <option value="Needs Inspection">Needs Inspection (Caution)</option>
                          <option value="Blocked / Poor">Blocked / Poor (Danger - Track Walk Mandatory)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Inspection Notes</label>
                        <input
                          type="text"
                          value={sectionNotesDraft}
                          onChange={(e) => setSectionNotesDraft(e.target.value)}
                          placeholder="e.g. Points clear, ballast firm"
                          className="w-full rounded border border-slate-300 bg-white p-1.5 text-xs outline-none"
                        >
                        </input>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={() => setInspectedSectionId(null)} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold bg-white">Cancel</button>
                      <button
                        onClick={() => {
                          setTrackSections(prev => prev.map(s => s.id === inspectedSectionId ? { ...s, health: sectionHealthDraft, notes: sectionNotesDraft } : s));
                          setInspectedSectionId(null);
                        }}
                        className="rounded bg-[#1e3a1e] px-3 py-1 text-xs font-bold text-white shadow-xs"
                      >
                        Save Track Status
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW: CLOCK IN / OUT */}
          {currentView === 'clock' && (
            <div className="space-y-5">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Volunteer Attendance Station</h2>
                <p className="text-xs text-slate-500">Record volunteer arrival and departure times for safety, competency, and insurance records.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-emerald-700" /> Record Attendance Timestamp
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">Select Volunteer</label>
                      <select id="clock-volunteer" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs outline-none">
                        {volunteers.map(v => (
                          <option key={v.Name} value={v.Name}>{v.Name} ({v.Roles})</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const el = document.getElementById('clock-volunteer') as HTMLSelectElement;
                          if (el) handleClockAction(el.value, 'In');
                        }}
                        className="flex-1 rounded-md bg-[#1e3a1e] py-2 text-xs font-bold text-white shadow hover:bg-[#152915]"
                      >
                        Clock In (Arrived)
                      </button>
                      <button
                        onClick={() => {
                          const el = document.getElementById('clock-volunteer') as HTMLSelectElement;
                          if (el) handleClockAction(el.value, 'Out');
                        }}
                        className="flex-1 rounded-md border border-slate-300 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs"
                      >
                        Clock Out (Departed)
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Currently Clocked In ({activeStaffCount})</h3>
                  <div className="divide-y divide-slate-100">
                    {activeClockIns.length === 0 ? (
                      <p className="py-4 text-xs text-slate-400 italic">No staff currently clocked in.</p>
                    ) : (
                      activeClockIns.map(log => (
                        <div key={log.id} className="py-2 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-800">{log.name}</span>
                            <span className="ml-2 text-slate-400 font-mono text-[11px]">Since {log.clockIn}</span>
                          </div>
                          <button
                            onClick={() => handleClockAction(log.name, 'Out')}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Clock Out
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: INCIDENTS / RED TAG */}
          {currentView === 'incidents' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">Incident &amp; Defect Safety Log</h2>
                  <p className="text-xs text-slate-500">Defect tracking, red-tag equipment lockouts, and safety remediation.</p>
                </div>
                <button
                  onClick={() => setIsDefectModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-700 shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Report Defect / Red Tag
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Asset / Location</th>
                      <th className="py-2.5 px-4">Defect Description</th>
                      <th className="py-2.5 px-4">Lockout Status</th>
                      <th className="py-2.5 px-4">Resolution</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {incidents.map(inc => (
                      <tr key={inc.id} className={`hover:bg-slate-50 ${inc['Red Tag Status'] === 'Out of Service' && inc.Status !== 'Resolved' ? 'bg-red-50/40' : ''}`}>
                        <td className="py-3 px-4 font-mono text-slate-600">{inc.Date}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{inc.asset}</td>
                        <td className="py-3 px-4 text-slate-700">{inc.Description}</td>
                        <td className="py-3 px-4">
                          {inc['Red Tag Status'] === 'Out of Service' ? (
                            <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">OUT OF SERVICE</span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Operational</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${inc.Status === 'Resolved' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>
                            {inc.Status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setIncidents(prev => prev.map(i => i.id === inc.id ? { ...i, Status: i.Status === 'Resolved' ? 'Open' : 'Resolved' } : i));
                            }}
                            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-slate-50"
                          >
                            {inc.Status === 'Resolved' ? 'Reopen' : 'Resolve'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW: FLEET & MAINTENANCE */}
          {currentView === 'maintenance' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">Maintenance &amp; Fleet Overview</h2>
                  <p className="text-xs text-slate-500">Locomotives, passenger stock, and workshop servicing logs.</p>
                </div>
                <button
                  onClick={() => {
                    const name = prompt('Enter Locomotive or Carriage name:');
                    if (name) setFleetItems(prev => [...prev, { name, type: 'Steam', gauge: "7 1/4''", state: 'In Service' }]);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a1e] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#152915] shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Fleet Unit
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {fleetItems.map(item => (
                  <div key={item.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900">{item.name}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{item.type}</span>
                    </div>
                    <div className="text-xs text-slate-500 font-mono">Gauge: {item.gauge}</div>
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className={`font-semibold ${item.state === 'In Service' ? 'text-emerald-700' : 'text-amber-700'}`}>{item.state}</span>
                      <button
                        onClick={() => {
                          setFleetItems(prev => prev.map(f => f.name === item.name ? { ...f, state: f.state === 'In Service' ? 'Out of Service' : 'In Service' } : f));
                        }}
                        className="text-[11px] text-slate-600 hover:underline"
                      >
                        Toggle Status
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-slate-600">
                  Recent Workshop Maintenance Logs
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="py-2 px-4">Date</th>
                      <th className="py-2 px-4">Asset</th>
                      <th className="py-2 px-4">Work Done</th>
                      <th className="py-2 px-4">Performed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {maintenanceLogs.map(m => (
                      <tr key={m.id}>
                        <td className="py-2.5 px-4 font-mono text-slate-600">{m.startDate}</td>
                        <td className="py-2.5 px-4 font-bold text-slate-900">{m.assetName}</td>
                        <td className="py-2.5 px-4 text-slate-700">{m.workDone}</td>
                        <td className="py-2.5 px-4 text-slate-600">{m.performedBy.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW: ACTIONS & TASKS */}
          {currentView === 'actions' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">Operational Actions &amp; Tasks</h2>
                  <p className="text-xs text-slate-500">Remediation actions, scheduled servicing, and track maintenance.</p>
                </div>
                <button
                  onClick={() => {
                    const title = prompt('Enter task title:');
                    if (title) {
                      const newAct: ActionItem = {
                        id: Date.now(),
                        Title: title,
                        Description: 'Operational task created on station.',
                        DueDate: getTodayString(),
                        Priority: 'Normal',
                        Status: 'Pending',
                        createdDate: getTodayString()
                      };
                      setActions(prev => [newAct, ...prev]);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a1e] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#152915] shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Task
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-xs divide-y divide-slate-100">
                {actions.map(act => {
                  const isOverdue = act.Status !== 'Completed' && act.DueDate && act.DueDate < getTodayString();
                  return (
                    <div key={act.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-sm ${act.Status === 'Completed' ? 'line-through text-slate-400' : 'text-slate-900'}`}>{act.Title}</span>
                          {isOverdue && <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">OVERDUE</span>}
                        </div>
                        <p className="text-slate-500">{act.Description}</p>
                        <div className="text-[11px] text-slate-400">Due: {act.DueDate} • Priority: {act.Priority || 'Normal'}</div>
                      </div>
                      <button
                        onClick={() => {
                          setActions(prev => prev.map(a => a.id === act.id ? { ...a, Status: a.Status === 'Completed' ? 'Pending' : 'Completed' } : a));
                        }}
                        className={`rounded px-3 py-1 text-xs font-bold transition ${act.Status === 'Completed' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}
                      >
                        {act.Status === 'Completed' ? 'Completed' : 'Mark Done'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW: VOLUNTEERS */}
          {currentView === 'volunteers' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">Volunteer Directory &amp; Competency</h2>
                  <p className="text-xs text-slate-500">Certified operational roles, safety DBS clearances, and PIN security profiles.</p>
                </div>
                <button
                  onClick={() => {
                    const name = prompt('Enter volunteer full name:');
                    if (name) setVolunteers(prev => [...prev, { Name: name, Pin: '1234', Roles: 'Driver, Platform', 'DBS Status': 'Cleared' }]);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a1e] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#152915] shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Volunteer
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="py-2.5 px-4">Name</th>
                      <th className="py-2.5 px-4">Roles</th>
                      <th className="py-2.5 px-4">DBS Status</th>
                      <th className="py-2.5 px-4 text-right">PIN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {volunteers.map(v => (
                      <tr key={v.Name} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-900">{v.Name}</td>
                        <td className="py-3 px-4 text-slate-600">{v.Roles}</td>
                        <td className="py-3 px-4">
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{v['DBS Status']}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-400">••••</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW: CALENDAR */}
          {currentView === 'calendar' && (
            <div className="space-y-5">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Attendance &amp; Hours Log</h2>
                <p className="text-xs text-slate-500">Historical volunteer duty logs and shift completion timestamps.</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Volunteer</th>
                      <th className="py-2.5 px-4">Clock In</th>
                      <th className="py-2.5 px-4">Clock Out</th>
                      <th className="py-2.5 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clockLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-slate-600">{log.date}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{log.name}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{log.clockIn}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{log.clockOut}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${log.status === 'Clocked In' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: REPORT DEFECT / RED TAG */}
      {isDefectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" /> Report Defect / Red Tag Lockout
              </h3>
              <button onClick={() => setIsDefectModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const asset = (form.elements.namedItem('asset') as HTMLInputElement).value;
                const desc = (form.elements.namedItem('description') as HTMLTextAreaElement).value;
                const redTag = (form.elements.namedItem('redTag') as HTMLSelectElement).value as any;

                const newIncident: Incident = {
                  id: Date.now(),
                  asset,
                  Description: desc,
                  'Red Tag Status': redTag,
                  Status: 'Open',
                  Date: getTodayString(),
                  reportedBy: currentUser ? currentUser.name : 'Staff On Duty'
                };
                setIncidents(prev => [newIncident, ...prev]);

                if (redTag === 'Out of Service') {
                  setFleetItems(prev => prev.map(f => f.name.toLowerCase() === asset.toLowerCase() ? { ...f, state: 'Out of Service' } : f));
                  // Trigger safe in-browser notification if permitted
                  if (isNotificationAvailable && Notification.permission === 'granted') {
                    try {
                      new Notification(`🚨 RED TAG LOCKOUT: ${asset}`, {
                        body: `Equipment locked out: ${desc}`,
                      });
                    } catch {}
                  }
                }

                setIsDefectModalOpen(false);
              }}
              className="space-y-3"
            >
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Asset / Locomotive / Location</label>
                <input name="asset" required placeholder="e.g. Canadian Pacific, North Turnout" className="w-full rounded border border-slate-300 p-2 text-xs outline-none" />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Defect Description</label>
                <textarea name="description" required rows={3} placeholder="Describe mechanical or safety observation..." className="w-full rounded border border-slate-300 p-2 text-xs outline-none" />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Lockout Status</label>
                <select name="redTag" className="w-full rounded border border-slate-300 p-2 text-xs outline-none">
                  <option value="Operational">Operational (Minor maintenance note)</option>
                  <option value="Out of Service">Out of Service (RED TAG LOCKOUT)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsDefectModalOpen(false)} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold">Cancel</button>
                <button type="submit" className="rounded bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700">Log Defect</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: OP CHECK (Track Walk / Test Run) */}
      {isOpCheckModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Log {opCheckType === 'trackWalk' ? 'Track Walk' : 'Test Run'} Inspection
              </h3>
              <button onClick={() => setIsOpCheckModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const inspector = (form.elements.namedItem('inspector') as HTMLSelectElement).value;
                const result = (form.elements.namedItem('result') as HTMLSelectElement).value as any;
                const notes = (form.elements.namedItem('notes') as HTMLInputElement).value;

                setDailyChecks(prev => ({
                  ...prev,
                  [opCheckType]: { inspector, result, notes }
                }));
                setIsOpCheckModalOpen(false);
              }}
              className="space-y-3"
            >
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Inspector</label>
                <select name="inspector" className="w-full rounded border border-slate-300 p-2 text-xs outline-none">
                  {volunteers.map(v => (
                    <option key={v.Name} value={v.Name}>{v.Name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Result</label>
                <select name="result" className="w-full rounded border border-slate-300 p-2 text-xs outline-none">
                  <option value="Pass">Pass (Cleared for operational service)</option>
                  <option value="Fail">Fail (Disallow traffic)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Notes</label>
                <input name="notes" placeholder="e.g. Clearance normal, switches lubricated" className="w-full rounded border border-slate-300 p-2 text-xs outline-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsOpCheckModalOpen(false)} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold">Cancel</button>
                <button type="submit" className="rounded bg-[#1e3a1e] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#152915]">Submit Inspection</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LOGIN */}
      {isLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Sign In to EVLT Operations</h3>
              <button onClick={() => setIsLoginOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const account = (form.elements.namedItem('account') as HTMLSelectElement).value;
                const pin = (form.elements.namedItem('pin') as HTMLInputElement).value;

                if (account === 'SYSTEM_ADMIN') {
                  setCurrentUser({ name: 'System Admin', isSystemAdmin: true, isShopKiosk: false });
                  setIsLoginOpen(false);
                } else if (account === 'SHOP_IPAD') {
                  setCurrentUser({ name: 'Shop iPad', isSystemAdmin: false, isShopKiosk: true });
                  setIsLoginOpen(false);
                } else {
                  const vol = volunteers.find(v => v.Name === account);
                  setCurrentUser({ name: account, isSystemAdmin: false, isShopKiosk: false, volData: vol });
                  setIsLoginOpen(false);
                }
              }}
              className="space-y-3"
            >
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Account</label>
                <select name="account" className="w-full rounded border border-slate-300 p-2 text-xs outline-none">
                  <option value="SYSTEM_ADMIN">System Admin (PIN 2026)</option>
                  <option value="SHOP_IPAD">Shop iPad / Kiosk Station (PIN 5678)</option>
                  {volunteers.map(v => (
                    <option key={v.Name} value={v.Name}>{v.Name} ({v.Roles})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Security PIN</label>
                <input name="pin" type="password" required placeholder="Enter PIN" defaultValue="2026" className="w-full rounded border border-slate-300 p-2 text-xs outline-none" />
              </div>
              <button type="submit" className="w-full rounded bg-[#1e3a1e] py-2 text-xs font-bold text-white shadow hover:bg-[#152915]">
                Sign In
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOTIFICATION CENTER & FIREBASE FCM SETUP GUIDE */}
      {isNotificationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Bell className="h-4 w-4 text-emerald-700" /> Push Notifications &amp; Background Setup
              </h3>
              <button onClick={() => setIsNotificationModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Browser Permission:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${notificationPerm === 'granted' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {notificationPerm.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] bg-white rounded-md p-2.5 border border-slate-200">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Firebase Project</span>
                    <span className="font-mono font-bold text-slate-800">{firebaseConfig.projectId}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Sender ID</span>
                    <span className="font-mono font-bold text-slate-800">{firebaseConfig.messagingSenderId}</span>
                  </div>
                </div>

                {/* Device FCM Token Box */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] text-slate-800">Your Device Push Token:</span>
                    {fcmToken && (
                      <button
                        onClick={copyFcmTokenToClipboard}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 transition"
                      >
                        {tokenCopied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        {tokenCopied ? 'Copied to Clipboard!' : 'Copy Device Token'}
                      </button>
                    )}
                  </div>

                  {fcmToken ? (
                    <div className="relative rounded-md bg-slate-900 p-2.5 font-mono text-[10px] text-emerald-300 break-all border border-slate-800 max-h-20 overflow-y-auto">
                      {fcmToken}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">
                      No device token generated yet. Click &quot;Register Device Token&quot; below while in a standard browser tab.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-200/80">
                  <button
                    onClick={handleRequestPushPermission}
                    disabled={isRegisteringFcm}
                    className="rounded bg-[#1e3a1e] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#152915] transition shadow-xs disabled:opacity-50"
                  >
                    {isRegisteringFcm ? 'Registering with FCM...' : fcmToken ? 'Refresh Device Token' : 'Register Device for Push'}
                  </button>
                  {notificationPerm === 'granted' && (
                    <button
                      onClick={() => {
                        try {
                          new Notification('🔔 EVLT Test Notification', {
                            body: 'Instant test notification from EVLT Operations Platform.',
                            icon: '/apple-touch-icon.png'
                          });
                        } catch {}
                      }}
                      className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 transition"
                    >
                      Instant Test Alert
                    </button>
                  )}
                </div>
              </div>

              {/* Step by step guide for background alerts when closed */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <Info className="h-4 w-4 text-emerald-700" />
                  How to test receiving an alert when the app is CLOSED:
                </h4>
                <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 space-y-2 text-[11px] text-slate-700">
                  <p className="leading-relaxed">
                    With your <strong>VAPID key</strong> and <strong>Firebase config</strong> now active, your background Service Worker (<code>/firebase-messaging-sw.js</code>) is ready:
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 font-medium">
                    <li>Click <strong>&quot;Register Device for Push&quot;</strong> above and copy your generated Device Token.</li>
                    <li>Open your <a href="https://console.firebase.google.com/project/evlt-admin/messaging" target="_blank" rel="noreferrer" className="text-emerald-700 underline font-bold inline-flex items-center gap-0.5">Firebase Messaging Console <ExternalLink className="h-2.5 w-2.5 inline" /></a>.</li>
                    <li>Click <strong>New campaign</strong> → <strong>Firebase Notification messages</strong>.</li>
                    <li>Type a title (e.g. <code>🚨 RED TAG: Canadian Pacific</code>) and text.</li>
                    <li>Click <strong>Send test message</strong>, paste your copied <strong>Device Token</strong>, and press <strong>Test</strong>.</li>
                  </ol>
                  <p className="text-[10px] text-slate-500 pt-1 border-t border-emerald-200/50">
                    The notification will appear on your device even if you close this browser tab or lock the screen.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsNotificationModalOpen(false)}
                className="rounded bg-slate-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
