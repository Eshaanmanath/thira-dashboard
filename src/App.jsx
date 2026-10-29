import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, 
  Users, 
  Plus, 
  Upload, 
  Mail, 
  QrCode, 
  ArrowRight,
  UserPlus,
  Loader2,
  ShieldAlert,
  FileSpreadsheet,
  X,
  Search,
  CheckCircle2,
  RefreshCw,
  UserCheck
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const TOKEN_KEY = "thira_access_token";

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // The backend derives identity and role from the JWT; never trust a role supplied by the UI.
  headers.delete("x-user-role");
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event('thira:unauthorized'));
  }
  return response;
}

export default function Dashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState('events');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const currentRole = currentUser?.role || null;

  // Real Database States
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState(null);

  // Participant workspace data
  const [participants, setParticipants] = useState([]);
  const [participantsTotal, setParticipantsTotal] = useState(0);
  const [participantSearch, setParticipantSearch] = useState('');
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [participantError, setParticipantError] = useState('');
  const [eventStats, setEventStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [manualConfirmParticipant, setManualConfirmParticipant] = useState(null);
  const [manualCheckingIn, setManualCheckingIn] = useState(false);
  const [manualCheckInMessage, setManualCheckInMessage] = useState('');

  useEffect(() => {
    const onUnauthorized = () => {
      setCurrentUser(null);
      setSelectedEvent(null);
      setEvents([]);
      setUsers([]);
    };
    window.addEventListener('thira:unauthorized', onUnauthorized);
    return () => window.removeEventListener('thira:unauthorized', onUnauthorized);
  }, []);

  // Restore a previously authenticated session, if the token is still valid.
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setAuthChecking(false);
        setLoadingEvents(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Session expired');
        const user = await res.json();
        setCurrentUser(user);
        await fetchEvents();
        if (user.role === 'Core') await fetchUsers();
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        setCurrentUser(null);
        setLoadingEvents(false);
      } finally {
        setAuthChecking(false);
      }
    };
    restoreSession();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Login failed');
      localStorage.setItem(TOKEN_KEY, data.access_token);
      const meRes = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const me = await meRes.json();
      if (!meRes.ok) throw new Error(me.detail || 'Could not load your account');
      setCurrentUser(me);
      setLoginPassword('');
      setError(null);
      await fetchEvents();
      if (me.role === 'Core') await fetchUsers();
    } catch (err) {
      localStorage.removeItem(TOKEN_KEY);
      setLoginError(err.message || 'Unable to sign in');
    } finally {
      setLoggingIn(false);
      setAuthChecking(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setCurrentUser(null);
    setSelectedEvent(null);
    setEvents([]);
    setUsers([]);
    setActiveTab('events');
    setError(null);
    setLoginPassword('');
  };

  const fetchEvents = async () => {
    try {
      setLoadingEvents(true);
      const res = await apiFetch(`${API_BASE}/events`);
      if (!res.ok) throw new Error("Failed to fetch events");
      const data = await res.json();
      setEvents(data);
    } catch (err) {
      console.error(err);
      setError("Could not connect to FastAPI backend.");
    } finally {
      setLoadingEvents(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await apiFetch(`${API_BASE}/users`);
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchParticipants = async (eventId = selectedEvent?.id, search = participantSearch) => {
    if (!eventId) return;
    try {
      setLoadingParticipants(true);
      setParticipantError('');
      const params = new URLSearchParams({ limit: '100', offset: '0' });
      if (search.trim()) params.set('q', search.trim());
      const res = await apiFetch(`${API_BASE}/events/${eventId}/participants?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load participants');
      setParticipants(Array.isArray(data.participants) ? data.participants : []);
      setParticipantsTotal(Number(data.total ?? 0));
    } catch (err) {
      setParticipantError(err.message || 'Could not load participants');
    } finally {
      setLoadingParticipants(false);
    }
  };

  const fetchEventStats = async (eventId = selectedEvent?.id) => {
    if (!eventId) return;
    try {
      setLoadingStats(true);
      const res = await apiFetch(`${API_BASE}/events/${eventId}/stats`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load event statistics');
      setEventStats(data);
    } catch (err) {
      console.error('Could not load event statistics:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const refreshParticipantWorkspace = async () => {
    if (!selectedEvent) return;
    await Promise.all([
      fetchParticipants(selectedEvent.id, participantSearch),
      fetchEventStats(selectedEvent.id),
    ]);
  };

  useEffect(() => {
    if (activeTab !== 'event-detail' || !selectedEvent) return;
    const timer = setTimeout(() => {
      fetchParticipants(selectedEvent.id, participantSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [activeTab, selectedEvent?.id, participantSearch]);

  useEffect(() => {
    if (activeTab !== 'event-detail' || !selectedEvent) return;
    fetchEventStats(selectedEvent.id);
  }, [activeTab, selectedEvent?.id]);

  const handleManualCheckIn = async () => {
    if (!selectedEvent || !manualConfirmParticipant || manualCheckingIn) return;
    try {
      setManualCheckingIn(true);
      setManualCheckInMessage('');
      const res = await apiFetch(
        `${API_BASE}/events/${selectedEvent.id}/participants/${manualConfirmParticipant.id}/manual-check-in`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Manual check-in failed');
      setManualCheckInMessage(data.message || (data.status === 'success' ? 'Check-in successful.' : 'Participant was already checked in.'));
      setManualConfirmParticipant(null);
      await refreshParticipantWorkspace();
    } catch (err) {
      setManualCheckInMessage(err.message || 'Manual check-in failed');
    } finally {
      setManualCheckingIn(false);
    }
  };

  // Modal State for CSV Import (Drag and Drop)
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [selectedCsvFile, setSelectedCsvFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv')) {
        setSelectedCsvFile(file);
      } else {
        alert("Please drop a valid .csv file.");
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleCsvUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCsvFile || !selectedEvent) return;

    const formData = new FormData();
    formData.append("file", selectedCsvFile);

    try {
      setUploadingCsv(true);
      const res = await apiFetch(`${API_BASE}/events/${selectedEvent.id}/import-csv`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to upload CSV");
      }
      const result = await res.json();
      alert(`CSV Import Successful!\n- Added: ${result.added} new participants\n- Skipped: ${result.skipped} row(s)`);
      await refreshParticipantWorkspace();
      setShowCsvModal(false);
      setSelectedCsvFile(null);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setUploadingCsv(false);
    }
  };

  // Modal State for Email Passes
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailPayload, setEmailPayload] = useState({
    subject: "Your Entry Pass for {event_name}",
    customMessage: "We are excited to welcome you! Please present the attached QR code token at the entry gate."
  });
  const [sendingEmails, setSendingEmails] = useState(false);

  const handleSendEmails = async (e) => {
    e.preventDefault();
    if (!selectedEvent) return;

    try {
      setSendingEmails(true);
      const res = await apiFetch(`${API_BASE}/events/${selectedEvent.id}/send-passes`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: emailPayload.subject,
          custom_message: emailPayload.customMessage
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to send email passes");
      }

      const result = await res.json();
      alert(`Email Passes Dispatch Complete!\n\n- Sent: ${result.sent}\n- Mode: ${result.mode}`);
      setShowEmailModal(false);
    } catch (err) {
      alert("Email Error: " + err.message);
    } finally {
      setSendingEmails(false);
    }
  };

  // Modal State for New Event Creation
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEvent, setNewEvent] = useState({ 
    name: '', 
    eventDate: '', 
    eventHead1: '', 
    eventHead2: '', 
    status: 'Registrations Open' 
  });
  const [submittingEvent, setSubmittingEvent] = useState(false);

  // Modal State for New User Creation
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Volunteer'
  });
  const [submittingUser, setSubmittingUser] = useState(false);

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!newEvent.name || !newEvent.eventDate) return;

    try {
      setSubmittingEvent(true);
      const payload = {
        name: newEvent.name,
        event_date: newEvent.eventDate,
        event_head_1: newEvent.eventHead1 || "Unassigned",
        event_head_2: newEvent.eventHead2 || "Unassigned",
        status: newEvent.status || "Registrations Open"
      };

      const res = await apiFetch(`${API_BASE}/events`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create event");
      }
      
      const createdEvent = await res.json();
      setEvents([createdEvent, ...events]);
      setNewEvent({ name: '', eventDate: '', eventHead1: '', eventHead2: '', status: 'Registrations Open' });
      setShowCreateModal(false);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setSubmittingEvent(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.password) return;

    try {
      setSubmittingUser(true);
      const res = await apiFetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newUser)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create user");
      }

      const createdUser = await res.json();
      setUsers([createdUser, ...users]);
      setNewUser({ name: '', email: '', password: '', role: 'Volunteer' });
      setShowUserModal(false);
      alert("User created successfully!");
    } catch (err) {
      alert("Permission Error: " + err.message);
    } finally {
      setSubmittingUser(false);
    }
  };

  // QR scanner states
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [checkInToken, setCheckInToken] = useState('');
  const [checkInPreview, setCheckInPreview] = useState(null);
  const [checkInResult, setCheckInResult] = useState(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [verifyingPass, setVerifyingPass] = useState(false);
  const [scannerCycle, setScannerCycle] = useState(0);
  const scannerLockRef = useRef(false);

  const verifyPass = async (rawToken) => {
    const token = (rawToken || '').trim();
    if (!selectedEvent || !token || verifyingPass || checkingIn) return;

    setVerifyingPass(true);
    setCheckInResult(null);
    setCheckInPreview(null);
    setCheckInToken(token);
    try {
      const res = await apiFetch(`${API_BASE}/events/${selectedEvent.id}/verify-pass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_token: token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not verify this pass');
      setCheckInPreview(data.participant);
      if (data.participant.checked_in) {
        setCheckInResult({
          status: 'already_checked_in',
          message: 'This participant has already checked in.',
          participant: data.participant,
        });
      }
    } catch (err) {
      setCheckInResult({ status: 'error', message: err.message });
    } finally {
      setVerifyingPass(false);
    }
  };

  const handleCheckIn = async (e) => {
    if (e) e.preventDefault();
    if (!selectedEvent || !checkInPreview || checkInPreview.checked_in || checkingIn) return;

    try {
      setCheckingIn(true);
      setCheckInResult(null);
      const res = await apiFetch(`${API_BASE}/events/${selectedEvent.id}/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_token: checkInToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Check-in failed');

      setCheckInResult(data);
      await refreshParticipantWorkspace();
      setCheckInToken('');
      setCheckInPreview(null);
      if (data.status === 'success') {
        scannerLockRef.current = false;
        setScannerCycle((cycle) => cycle + 1);
      }
    } catch (err) {
      setCheckInResult({ status: 'error', message: err.message });
    } finally {
      setCheckingIn(false);
    }
  };

  useEffect(() => {
    let scanner = null;
    let cancelled = false;
    if (!showCheckInModal || !selectedEvent || checkInPreview || verifyingPass || checkingIn) {
      return undefined;
    }

    scannerLockRef.current = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const readerId = `reader-${scannerCycle}`;
      const reader = document.getElementById(readerId);
      if (!reader) return;

      scanner = new Html5QrcodeScanner(readerId, {
        fps: 12,
        qrbox: { width: 250, height: 250 },
        rememberLastUsedCamera: true,
      }, false);

      scanner.render(
        async (decodedText) => {
          if (scannerLockRef.current) return;
          scannerLockRef.current = true;
          try {
            await scanner?.clear();
          } catch (err) {
            console.debug('Scanner pause:', err);
          }
          await verifyPass(decodedText);
        },
        () => {}
      );
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (scanner) {
        scanner.clear().catch((err) => console.debug('Scanner cleanup:', err));
      }
    };
  }, [showCheckInModal, selectedEvent, scannerCycle, checkInPreview, verifyingPass, checkingIn]);

  const resetCheckInScanner = () => {
    setCheckInToken('');
    setCheckInPreview(null);
    setCheckInResult(null);
    scannerLockRef.current = false;
    setScannerCycle((cycle) => cycle + 1);
  };

  if (authChecking) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-200"><Loader2 className="mr-3 h-5 w-5 animate-spin text-indigo-400" /> Checking session...</div>;
  }

  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 text-slate-100">
        <form onSubmit={handleLogin} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-8 shadow-2xl">
          <h1 className="mb-1 text-2xl font-bold text-indigo-400">thira<span className="text-white">-cochin</span></h1>
          <p className="mb-6 text-sm text-slate-400">Sign in to your event dashboard</p>
          {loginError && <div role="alert" className="mb-4 rounded-lg border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{loginError}</div>}
          <label className="mb-1 block text-sm text-slate-300" htmlFor="login-email">Email</label>
          <input id="login-email" type="email" autoComplete="username" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white outline-none focus:border-indigo-500" />
          <label className="mb-1 block text-sm text-slate-300" htmlFor="login-password">Password</label>
          <input id="login-password" type="password" autoComplete="current-password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="mb-6 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white outline-none focus:border-indigo-500" />
          <button type="submit" disabled={loggingIn} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
            {loggingIn && <Loader2 className="h-4 w-4 animate-spin" />}{loggingIn ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col justify-between">
        <div>
          <div className="p-6 border-b border-slate-800">
            <h1 className="text-xl font-bold tracking-tight text-indigo-400">
              thira<span className="text-white">-cochin</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">dashboard.thira-cochin.in</p>
          </div>

          <nav className="p-4 space-y-2">
            <button
              onClick={() => { setActiveTab('events'); setSelectedEvent(null); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'events' || activeTab === 'event-detail'
                  ? 'bg-indigo-600 text-white' 
                  : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Calendar className="w-5 h-5" />
              Events
            </button>

            {currentRole === 'Core' && <button
              onClick={() => { setActiveTab('users'); setSelectedEvent(null); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'users' 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Users className="w-5 h-5" />
              Users & Roles
            </button>}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="mb-3">
            <p className="text-sm font-semibold text-white">{currentUser?.name}</p>
            <p className="text-xs text-slate-400">{currentUser?.email}</p>
            <span className="mt-2 inline-block rounded-full border border-indigo-800 bg-indigo-950 px-2 py-1 text-xs text-indigo-300">{currentRole}</span>
          </div>
          <button onClick={handleLogout} className="w-full rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Sign out</button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto bg-slate-900 p-8">
        
        {error && (
          <div className="mb-6 bg-red-950/80 border border-red-800 text-red-200 p-4 rounded-xl text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchEvents} className="underline text-xs font-semibold">Retry</button>
          </div>
        )}

        {/* EVENTS PAGE */}
        {activeTab === 'events' && (
          <div>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-white">Events (Live Supabase DB)</h2>
                <p className="text-slate-400 text-sm mt-1">Manage events, assign event heads, and track registrations.</p>
              </div>

              {currentRole === 'Core' ? (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-indigo-600/20"
                >
                  <Plus className="w-4 h-4" />
                  Create Event
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs bg-slate-800 text-slate-400 px-3 py-2 rounded-md border border-slate-700">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Only Core can create events</span>
                </div>
              )}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              {loadingEvents ? (
                <div className="p-12 flex items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                  Loading events from Supabase...
                </div>
              ) : events.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  No events found. Click "+ Create Event" to add your first event!
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider bg-slate-900/50">
                      <th className="p-4">Event Name</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Event Date</th>
                      <th className="p-4">Event Head 1</th>
                      <th className="p-4">Event Head 2</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-sm">
                    {events.map((evt) => (
                      <tr key={evt.id} className="hover:bg-slate-900/60 transition-colors">
                        <td className="p-4 font-semibold text-white">{evt.name}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                            evt.status === 'Registrations Open'
                              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                              : evt.status === 'Ongoing'
                              ? 'bg-blue-950/60 border-blue-800 text-blue-400'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}>
                            {evt.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-300">{evt.event_date}</td>
                        <td className="p-4 text-slate-300 text-xs">{evt.event_head_1}</td>
                        <td className="p-4 text-slate-300 text-xs">{evt.event_head_2}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => { setSelectedEvent(evt); setParticipantSearch(''); setParticipants([]); setEventStats(null); setManualCheckInMessage(''); setActiveTab('event-detail'); }}
                            className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                          >
                            Open Workspace <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* USERS & ROLES PAGE */}
        {activeTab === 'users' && (
          <div>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-white">Users & Roles (Live Supabase DB)</h2>
                <p className="text-slate-400 text-sm mt-1">Manage team permissions across Core, Event Head, and Volunteer roles.</p>
              </div>

              {currentRole === 'Core' ? (
                <button
                  onClick={() => setShowUserModal(true)}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-indigo-600/20"
                >
                  <UserPlus className="w-4 h-4" />
                  Add User
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs bg-slate-800 text-slate-400 px-3 py-2 rounded-md border border-slate-700">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Only Core can manage users</span>
                </div>
              )}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              {loadingUsers ? (
                <div className="p-12 flex items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                  Loading users from Supabase...
                </div>
              ) : users.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  No users found in database.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider bg-slate-900/50">
                      <th className="p-4">Name & Email</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Created Date</th>
                      <th className="p-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-sm">
                    {users.map((usr) => (
                      <tr key={usr.id} className="hover:bg-slate-900/60 transition-colors">
                        <td className="p-4">
                          <div className="font-semibold text-white">{usr.name}</div>
                          <div className="text-xs text-slate-400">{usr.email}</div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                            usr.role === 'Core'
                              ? 'bg-purple-950/60 border-purple-800 text-purple-300'
                              : usr.role === 'Event Head'
                              ? 'bg-blue-950/60 border-blue-800 text-blue-300'
                              : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                          }`}>
                            {usr.role}
                          </span>
                        </td>
                        <td className="p-4 text-slate-300 text-xs">{usr.created_at}</td>
                        <td className="p-4 text-right">
                          <span className="text-xs text-emerald-400 font-medium">● Active</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* EVENT DETAIL WORKSPACE */}
        {activeTab === 'event-detail' && selectedEvent && (
          <div>
            <button
              onClick={() => setActiveTab('events')}
              className="text-xs text-slate-400 hover:text-white mb-4 block"
            >
              ← Back to Events List
            </button>
            <div className="mb-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedEvent.name}</h2>
                <p className="text-xs text-slate-400">Scheduled: {selectedEvent.event_date} | ID: {selectedEvent.id}</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-950 border border-indigo-800 text-indigo-300">
                Live Workspace ({currentRole} Mode)
              </span>
            </div>

            {/* Attendance metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5">
                <p className="text-xs text-slate-400 mb-2">Registered Participants</p>
                <p className="text-3xl font-bold text-white">{loadingStats ? '—' : (eventStats?.registered_count ?? '—')}</p>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5">
                <p className="text-xs text-slate-400 mb-2">Checked In</p>
                <p className="text-3xl font-bold text-emerald-400">{loadingStats ? '—' : (eventStats?.checked_in_count ?? '—')}</p>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5">
                <p className="text-xs text-slate-400 mb-2">Not Yet Checked In</p>
                <p className="text-3xl font-bold text-amber-300">{loadingStats ? '—' : (eventStats?.not_checked_in_count ?? '—')}</p>
              </div>
            </div>

            {/* Participant directory and manual check-in */}
            <section className="bg-slate-950 border border-slate-800 rounded-xl p-5 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">Participants</h3>
                  <p className="text-xs text-slate-400 mt-1">Search by name or email. Manual check-in is available if a QR pass cannot be scanned.</p>
                </div>
                <button
                  type="button"
                  onClick={refreshParticipantWorkspace}
                  disabled={loadingParticipants || loadingStats}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${(loadingParticipants || loadingStats) ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="search"
                  value={participantSearch}
                  onChange={(e) => setParticipantSearch(e.target.value)}
                  placeholder="Search participants by name or email..."
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              {manualCheckInMessage && (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 mb-4 text-sm text-slate-200">
                  <span>{manualCheckInMessage}</span>
                  <button type="button" onClick={() => setManualCheckInMessage('')} aria-label="Dismiss message" className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
              )}
              {participantError ? (
                <div className="text-sm text-red-300 bg-red-950/30 border border-red-900 rounded-lg p-3">{participantError}</div>
              ) : loadingParticipants ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading participants...</div>
              ) : participants.length === 0 ? (
                <div className="text-center py-10 text-sm text-slate-500">{participantSearch ? 'No participants match your search.' : 'No participants have been added to this event yet.'}</div>
              ) : (
                <>
                  <div className="text-xs text-slate-500 mb-2">Showing {participants.length} of {participantsTotal} participant{participantsTotal === 1 ? '' : 's'}{participantsTotal > participants.length ? ' (first 100)' : ''}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[650px]">
                      <thead><tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-2 font-semibold">Participant</th>
                        <th className="py-3 px-2 font-semibold">Phone</th>
                        <th className="py-3 px-2 font-semibold">Attendance</th>
                        <th className="py-3 px-2 font-semibold">Checked In At</th>
                        <th className="py-3 px-2 text-right font-semibold">Action</th>
                      </tr></thead>
                      <tbody>
                        {participants.map((participant) => (
                          <tr key={participant.id} className="border-b border-slate-900 last:border-0 hover:bg-slate-900/60">
                            <td className="py-3 px-2">
                              <p className="text-sm font-medium text-white">{participant.name}</p>
                              <p className="text-xs text-slate-500 break-all">{participant.email}</p>
                            </td>
                            <td className="py-3 px-2 text-xs text-slate-400">{participant.phone || '—'}</td>
                            <td className="py-3 px-2">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${participant.checked_in ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'}`}>
                                {participant.checked_in ? <><CheckCircle2 className="w-3 h-3" /> Checked in</> : 'Not checked in'}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-xs text-slate-400">{participant.checked_in_at ? new Date(participant.checked_in_at).toLocaleString() : '—'}</td>
                            <td className="py-3 px-2 text-right">
                              {participant.checked_in ? (
                                <span className="text-[10px] text-slate-500">Already checked in</span>
                              ) : (
                                <button type="button" onClick={() => { setManualConfirmParticipant(participant); setManualCheckInMessage(''); }} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">
                                  <UserCheck className="w-3.5 h-3.5" /> Manual check-in
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* 1. CSV Import Card */}
              <div className="bg-slate-950 border border-slate-800 p-6 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-900/50 text-indigo-400 rounded-lg">
                      <Upload className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-white">1. CSV Import</h3>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Upload Google Forms export CSV. Matching <code className="text-indigo-300">Name + Email</code> duplicates are automatically skipped.
                  </p>
                </div>

                <div>
                  {currentRole === 'Volunteer' ? (
                    <div className="text-xs text-amber-400 bg-amber-950/40 border border-amber-900 p-2.5 rounded-lg text-center">
                      Restricted: Volunteers cannot import CSVs
                    </div>
                  ) : (
                    <button 
                      onClick={() => { setSelectedCsvFile(null); setShowCsvModal(true); }}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white rounded-lg transition-colors shadow-md"
                    >
                      Upload Participant CSV
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Email Campaign Card */}
              <div className="bg-slate-950 border border-slate-800 p-6 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-purple-900/50 text-purple-400 rounded-lg">
                      <Mail className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-white">2. Email Pass Sender</h3>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Dispatch email notifications with embedded QR entry tickets and personalized instructions to all imported participants.
                  </p>
                </div>
                <button 
                  onClick={() => setShowEmailModal(true)}
                  disabled={currentRole === 'Volunteer'}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-xs font-semibold text-white rounded-lg transition-colors shadow-md"
                >
                  {currentRole === 'Volunteer' ? 'Restricted Access' : 'Compose & Send Passes'}
                </button>
              </div>

              {/* 3. QR Check-in Scanner Card */}
              <div className="bg-slate-950 border border-slate-800 p-6 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-900/50 text-emerald-400 rounded-lg">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-white">3. Gate Check-in</h3>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Launch the scanner interface for volunteers to verify ticket passes and log entry status in real time.
                  </p>
                </div>
                <button 
                  onClick={() => { resetCheckInScanner(); setShowCheckInModal(true); }}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white rounded-lg transition-colors shadow-md"
                >
                  Open QR Scanner
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: CONFIRM MANUAL CHECK-IN */}
      {manualConfirmParticipant && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-slate-950 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-emerald-900/50 text-emerald-400"><UserCheck className="w-5 h-5" /></div>
              <div><h3 className="text-lg font-bold text-white">Confirm manual check-in</h3><p className="text-xs text-slate-400">Verify the participant before recording attendance.</p></div>
            </div>
            {manualCheckInMessage && (
              <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 mb-4 text-sm text-red-200">{manualCheckInMessage}</div>
            )}
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 mb-5">
              <p className="font-semibold text-white">{manualConfirmParticipant.name}</p>
              <p className="text-sm text-slate-400 break-all">{manualConfirmParticipant.email}</p>
              {manualConfirmParticipant.phone && <p className="text-xs text-slate-500 mt-1">{manualConfirmParticipant.phone}</p>}
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setManualConfirmParticipant(null)} disabled={manualCheckingIn} className="px-4 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleManualCheckIn} disabled={manualCheckingIn} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white disabled:opacity-50">
                {manualCheckingIn && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm check-in
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE EVENT */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 w-full max-w-lg rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-1">Create New Event</h3>
            <p className="text-xs text-slate-400 mb-6">Enter event details and assign lead Event Heads.</p>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">Event Name</label>
                <input
                  type="text"
                  placeholder="e.g. Thira AI Summit 2026"
                  value={newEvent.name}
                  onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">Event Date</label>
                <input
                  type="date"
                  value={newEvent.eventDate}
                  onChange={(e) => setNewEvent({ ...newEvent, eventDate: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-medium">Event Head 1</label>
                  <input
                    type="text"
                    placeholder="Name / Email"
                    value={newEvent.eventHead1}
                    onChange={(e) => setNewEvent({ ...newEvent, eventHead1: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-medium">Event Head 2</label>
                  <input
                    type="text"
                    placeholder="Name / Email"
                    value={newEvent.eventHead2}
                    onChange={(e) => setNewEvent({ ...newEvent, eventHead2: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEvent}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all disabled:opacity-50"
                >
                  {submittingEvent && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DRAG & DROP CSV UPLOAD */}
      {showCsvModal && selectedEvent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 w-full max-w-md rounded-2xl p-6 relative">
            <button
              onClick={() => setShowCsvModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-white mb-1">Import Participant CSV</h3>
            <p className="text-xs text-slate-400 mb-6">
              Upload Google Forms export for <span className="text-indigo-400 font-medium">{selectedEvent.name}</span>.
            </p>

            <form onSubmit={handleCsvUploadSubmit} className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedCsvFile(e.target.files[0]);
                  }
                }}
              />

              {/* DROP ZONE */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-950/30 scale-[0.99]'
                    : selectedCsvFile
                    ? 'border-emerald-500/50 bg-emerald-950/10'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-900/50'
                }`}
              >
                {selectedCsvFile ? (
                  <div className="flex flex-col items-center">
                    <FileSpreadsheet className="w-10 h-10 text-emerald-400 mb-2" />
                    <p className="text-sm font-semibold text-white break-all">{selectedCsvFile.name}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {(selectedCsvFile.size / 1024).toFixed(1)} KB
                    </p>
                    <span className="mt-3 text-[11px] text-emerald-400 underline">Click or drop to replace</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="w-10 h-10 text-indigo-400 mb-3" />
                    <p className="text-sm font-semibold text-white">Drag & drop your CSV file here</p>
                    <p className="text-xs text-slate-400 mt-1 mb-4">Supports .csv exported from Google Forms</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-lg border border-slate-700 transition-colors"
                    >
                      Browse Files
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCsvModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedCsvFile || uploadingCsv}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/20"
                >
                  {uploadingCsv && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {uploadingCsv ? 'Importing...' : 'Upload & Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: COMPOSE EMAIL PASSES */}
      {showEmailModal && selectedEvent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 w-full max-w-lg rounded-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-white">Dispatch Email Passes</h3>
              <span className="text-xs bg-purple-950 text-purple-300 border border-purple-800 px-2.5 py-1 rounded-full font-medium">
                {selectedEvent.name}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-6">
              This will generate and send unique QR codes to all participants in this event.
            </p>

            <form onSubmit={handleSendEmails} className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">Email Subject</label>
                <input
                  type="text"
                  value={emailPayload.subject}
                  onChange={(e) => setEmailPayload({ ...emailPayload, subject: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-purple-500"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">Placeholders available: <code className="text-purple-300">&#123;event_name&#125;</code>, <code className="text-purple-300">&#123;name&#125;</code></p>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">Custom Welcome Message</label>
                <textarea
                  rows={4}
                  value={emailPayload.customMessage}
                  onChange={(e) => setEmailPayload({ ...emailPayload, customMessage: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingEmails}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-all disabled:opacity-50 shadow-lg shadow-purple-600/20"
                >
                  {sendingEmails && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {sendingEmails ? 'Dispatching Passes...' : 'Send Passes Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GATE CHECK-IN SCANNER WITH EXPLICIT CONFIRMATION */}
      {showCheckInModal && selectedEvent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 w-full max-w-lg rounded-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-white">Live Gate Check-in</h3>
              <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 px-2.5 py-1 rounded-full font-medium">
                {currentRole}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Scan or enter a pass to verify the participant. Check-in happens only after you confirm.
            </p>

            {!checkInPreview && (
              <>
                <div className="mb-4 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-2">
                  <div id={`reader-${scannerCycle}`} className="w-full" />
                  {(verifyingPass || checkingIn) && (
                    <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-300">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {verifyingPass ? 'Verifying pass…' : 'Checking in participant…'}
                    </div>
                  )}
                </div>

                <form onSubmit={(e) => { e.preventDefault(); verifyPass(checkInToken); }} className="space-y-3 mb-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Or type/paste pass token"
                      value={checkInToken}
                      onChange={(e) => setCheckInToken(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 text-white font-mono rounded-lg p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                    />
                    <button type="submit" disabled={verifyingPass || checkingIn || !checkInToken.trim()} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white rounded-lg disabled:opacity-50">
                      {verifyingPass ? 'Verifying…' : 'Verify Pass'}
                    </button>
                  </div>
                </form>
              </>
            )}

            {checkInPreview && (
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 mb-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Participant verified</p>
                    <h4 className="text-lg font-bold text-white mt-1">{checkInPreview.name}</h4>
                    <p className="text-sm text-slate-300 break-all">{checkInPreview.email}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${checkInPreview.checked_in ? 'border-amber-700 bg-amber-950 text-amber-300' : 'border-emerald-700 bg-emerald-950 text-emerald-300'}`}>
                    {checkInPreview.checked_in ? 'ALREADY CHECKED IN' : 'NOT CHECKED IN'}
                  </span>
                </div>
                {checkInPreview.checked_in ? (
                  <p className="text-xs text-amber-200">This pass has already been used. No changes were made.</p>
                ) : (
                  <p className="text-xs text-slate-400">Confirm below to record this participant's entry.</p>
                )}
                <div className="flex gap-2 mt-4">
                  {!checkInPreview.checked_in && (
                    <button onClick={handleCheckIn} disabled={checkingIn} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                      {checkingIn && <Loader2 className="h-4 w-4 animate-spin" />}
                      {checkingIn ? 'Confirming…' : 'Confirm Check-in'}
                    </button>
                  )}
                  <button type="button" onClick={resetCheckInScanner} disabled={checkingIn || verifyingPass} className="rounded-lg border border-slate-700 px-4 py-3 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                    Scan Again
                  </button>
                </div>
              </div>
            )}

            {checkInResult && (
              <div role="status" className={`p-3 rounded-xl border text-sm mb-4 ${
                checkInResult.status === 'success' ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200' :
                checkInResult.status === 'already_checked_in' ? 'bg-amber-950/80 border-amber-800 text-amber-200' :
                'bg-red-950/80 border-red-800 text-red-200'
              }`}>
                <div className="font-semibold">{checkInResult.message}</div>
                {checkInResult.participant && (
                  <div className="text-xs mt-1 text-slate-300">{checkInResult.participant.name}{checkInResult.participant.email ? ` (${checkInResult.participant.email})` : ''}</div>
                )}
                {checkInResult.status === 'success' && <p className="mt-1 text-xs">Scanner is ready for the next participant.</p>}
                {checkInResult.status !== 'success' && !checkInPreview && (
                  <button type="button" onClick={resetCheckInScanner} className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">Scan Next Pass</button>
                )}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button type="button" onClick={() => { setShowCheckInModal(false); setCheckInPreview(null); setCheckInToken(''); setCheckInResult(null); }} className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white">
                Close Scanner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE USER */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 w-full max-w-md rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-1">Add New Team User</h3>
            <p className="text-xs text-slate-400 mb-6">
              {currentRole === 'Core' ? 'As Core, you can create Core, Event Head, or Volunteer accounts.' : 'As Event Head, you can create Volunteer accounts.'}
            </p>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Anand Kumar"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. anand@thira-cochin.in"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                >
                  {currentRole === 'Core' && (
                    <>
                      <option value="Core">Core</option>
                      <option value="Event Head">Event Head</option>
                    </>
                  )}
                  <option value="Volunteer">Volunteer</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUser}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all disabled:opacity-50"
                >
                  {submittingUser && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}