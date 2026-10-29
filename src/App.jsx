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
  UserCheck,
  UserMinus,
  Save
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import logo from './assets/logo.svg';

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
  const [expectedDraft, setExpectedDraft] = useState('0');
  const [savingExpected, setSavingExpected] = useState(false);
  const [showVolunteerModal, setShowVolunteerModal] = useState(false);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState('');
  const [creatingVolunteerInline, setCreatingVolunteerInline] = useState(false);
  const [volunteerDraft, setVolunteerDraft] = useState({ name: '', email: '', password: '' });
  const [savingVolunteerAssignment, setSavingVolunteerAssignment] = useState(false);
  const [assignedVolunteers, setAssignedVolunteers] = useState([]);
  const [loadingAssignedVolunteers, setLoadingAssignedVolunteers] = useState(false);
  const [removingVolunteerId, setRemovingVolunteerId] = useState('');
  const [statusDraft, setStatusDraft] = useState('Registrations Open');
  const [savingEventStatus, setSavingEventStatus] = useState(false);

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
        if (user.role === 'Core' || user.role === 'Event Head') await fetchUsers();
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
      if (me.role === 'Core' || me.role === 'Event Head') await fetchUsers();
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

  const fetchAssignedVolunteers = async (eventId = selectedEvent?.id) => {
    if (!eventId || !['Core', 'Event Head'].includes(currentRole)) return;
    try {
      setLoadingAssignedVolunteers(true);
      const res = await apiFetch(`${API_BASE}/events/${eventId}/volunteers`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load assigned volunteers');
      setAssignedVolunteers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Could not load assigned volunteers:', err);
    } finally {
      setLoadingAssignedVolunteers(false);
    }
  };

  const saveEventStatus = async () => {
    if (!selectedEvent || savingEventStatus) return;
    try {
      setSavingEventStatus(true);
      const res = await apiFetch(`${API_BASE}/events/${selectedEvent.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not update event status');
      setSelectedEvent((prev) => prev ? { ...prev, status: data.status } : prev);
      setEvents((prev) => prev.map((evt) => evt.id === selectedEvent.id ? { ...evt, status: data.status } : evt));
      alert('Event status updated.');
    } catch (err) { alert(`Status update failed: ${err.message}`); }
    finally { setSavingEventStatus(false); }
  };

  const removeAssignedVolunteer = async (volunteer) => {
    if (!selectedEvent || !volunteer || !window.confirm(`Remove ${volunteer.name} from ${selectedEvent.name}? Their user account will not be deleted.`)) return;
    try {
      setRemovingVolunteerId(volunteer.id);
      const res = await apiFetch(`${API_BASE}/events/${selectedEvent.id}/volunteers/${volunteer.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not remove volunteer');
      setAssignedVolunteers((prev) => prev.filter((item) => item.id !== volunteer.id));
      alert(data.message || 'Volunteer removed from event.');
    } catch (err) { alert(`Could not remove volunteer: ${err.message}`); }
    finally { setRemovingVolunteerId(''); }
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
      setExpectedDraft(String(data.expected_count ?? selectedEvent?.expected_participants ?? 0));
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

  useEffect(() => {
    if (activeTab !== 'event-detail' || !selectedEvent) return;
    setStatusDraft(selectedEvent.status || 'Registrations Open');
    setAssignedVolunteers([]);
    fetchAssignedVolunteers(selectedEvent.id);
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
    expectedParticipants: '0',
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
        expected_participants: Number(newEvent.expectedParticipants || 0),
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
      setNewEvent({ name: '', eventDate: '', eventHead1: '', eventHead2: '', expectedParticipants: '0', status: 'Registrations Open' });
      setShowCreateModal(false);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setSubmittingEvent(false);
    }
  };

  const saveExpectedParticipants = async () => {
    if (!selectedEvent || expectedDraft.trim() === '' || !Number.isInteger(Number(expectedDraft)) || Number(expectedDraft) < 0) {
      alert('Expected participant count must be a whole number of 0 or greater.');
      return;
    }
    try {
      setSavingExpected(true);
      const res = await apiFetch(`${API_BASE}/events/${selectedEvent.id}/expected-participants`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_participants: Number(expectedDraft) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not update expected count');
      setEventStats((prev) => prev ? { ...prev, expected_count: data.expected_participants, registration_difference: (prev.registered_count || 0) - data.expected_participants } : prev);
      setEvents((prev) => prev.map((evt) => evt.id === selectedEvent.id ? { ...evt, expected_participants: data.expected_participants } : evt));
      setSelectedEvent((prev) => prev ? { ...prev, expected_participants: data.expected_participants } : prev);
    } catch (err) { alert(`Expected count update failed: ${err.message}`); }
    finally { setSavingExpected(false); }
  };

  const handleAssignVolunteer = async (e) => {
    e.preventDefault();
    if (!selectedEvent) return;
    try {
      setSavingVolunteerAssignment(true);
      let volunteerId = selectedVolunteerId;
      if (creatingVolunteerInline) {
        if (!volunteerDraft.name.trim() || !volunteerDraft.email.trim() || !volunteerDraft.password) throw new Error('Enter the volunteer name, email, and password.');
        const createRes = await apiFetch(`${API_BASE}/users`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...volunteerDraft, role: 'Volunteer' }),
        });
        const created = await createRes.json();
        if (!createRes.ok) throw new Error(created.detail || 'Could not create volunteer');
        volunteerId = created.id;
        setUsers((prev) => [created, ...prev.filter((u) => u.id !== created.id)]);
      }
      if (!volunteerId) throw new Error('Choose a volunteer or create a new one.');
      const assignRes = await apiFetch(`${API_BASE}/events/${selectedEvent.id}/volunteers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: volunteerId }),
      });
      const assigned = await assignRes.json();
      if (!assignRes.ok) throw new Error(assigned.detail || 'Could not assign volunteer');
      setShowVolunteerModal(false);
      fetchAssignedVolunteers(selectedEvent.id);
      setCreatingVolunteerInline(false);
      setSelectedVolunteerId('');
      setVolunteerDraft({ name: '', email: '', password: '' });
      alert(assigned.message || 'Volunteer assigned successfully.');
    } catch (err) { alert(`Volunteer assignment failed: ${err.message}`); }
    finally { setSavingVolunteerAssignment(false); }
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
    return <div className="flex min-h-screen items-center justify-center bg-cream text-ink"><Loader2 className="mr-3 h-5 w-5 animate-spin text-brand" /> Checking session...</div>;
  }

  if (!currentUser) {
    return (
      <div className="flex min-h-screen bg-cream text-ink">
        <div className="hidden w-[38%] max-w-md shrink-0 flex-col items-center justify-center gap-4 bg-brand p-10 text-white md:flex">
          <img src={logo} alt="Thira Cochin" className="logo-enter h-40 w-auto" />
          <p className="text-3xl font-medium">Dashboard</p>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10">
          <form onSubmit={handleLogin} className="login-card w-full max-w-md rounded-2xl border border-line bg-paper p-8 shadow-sm">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand md:hidden">
              <img src={logo} alt="Thira Cochin" className="h-14 w-auto" />
            </div>
            <h1 className="mb-1 text-4xl font-semibold text-brand">thira-cochin</h1>
            <p className="mb-6 text-base text-muted">Sign in to your event dashboard</p>
            {loginError && <div role="alert" className="shake mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{loginError}</div>}
            <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="login-email">Email</label>
            <input id="login-email" type="email" autoComplete="username" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className="mb-4 w-full rounded-lg border border-line-strong bg-white p-3 text-base text-ink outline-none focus:border-accent" />
            <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="login-password">Password</label>
            <input id="login-password" type="password" autoComplete="current-password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="mb-6 w-full rounded-lg border border-line-strong bg-white p-3 text-base text-ink outline-none focus:border-accent" />
            <button type="submit" disabled={loggingIn} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {loggingIn && <Loader2 className="h-4 w-4 animate-spin" />}{loggingIn ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in flex h-screen bg-cream text-ink">
      {/* SIDEBAR */}
      <aside className="sidebar-enter flex w-64 shrink-0 flex-col justify-between bg-brand text-white">
        <div>
          <div className="flex flex-col items-center px-6 pb-6 pt-8">
            <img src={logo} alt="Thira Cochin" className="h-32 w-auto" />
            <p className="mt-3 text-2xl font-medium">Dashboard</p>
          </div>

          <nav className="mt-6 space-y-1.5 px-4">
            <button
              onClick={() => { setActiveTab('events'); setSelectedEvent(null); }}
              aria-current={activeTab === 'events' || activeTab === 'event-detail' ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-xl font-medium transition-colors ${
                activeTab === 'events' || activeTab === 'event-detail'
                  ? 'bg-white/20'
                  : 'text-white/90 hover:bg-white/10'
              }`}
            >
              <Calendar className="h-5 w-5" />
              Events
            </button>

            {currentRole === 'Core' && <button
              onClick={() => { setActiveTab('users'); setSelectedEvent(null); }}
              aria-current={activeTab === 'users' ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-xl font-medium transition-colors ${
                activeTab === 'users'
                  ? 'bg-white/20'
                  : 'text-white/90 hover:bg-white/10'
              }`}
            >
              <Users className="h-5 w-5" />
              Users & Roles
            </button>}
          </nav>
        </div>

        <div className="bg-white/20 p-4">
          <p className="text-xl font-semibold leading-tight">{currentUser?.name}</p>
          <p className="break-all text-sm text-white/90">{currentUser?.email}</p>
          <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-white/40 ${
            currentRole === 'Core'
              ? 'bg-accent text-white'
              : currentRole === 'Event Head'
              ? 'bg-amber-400 text-ink'
              : 'bg-emerald-700 text-white'
          }`}>{currentRole}</span>
          <button onClick={handleLogout} className="mt-3 w-full rounded-lg border border-white/30 bg-brand py-1.5 text-lg hover:bg-brand-dark">Sign out</button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto bg-cream px-10 py-9">

        {error && (
          <div className="mb-6 bg-red-50 border border-red-300 text-red-800 p-4 rounded-xl text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchEvents} className="underline text-xs font-semibold">Retry</button>
          </div>
        )}

        {/* EVENTS PAGE */}
        {activeTab === 'events' && (
          <div className="page-enter">
            <div className="flex justify-between items-center mb-8">
              <div className="page-enter">
                <h2 className="text-4xl font-semibold text-ink">Events</h2>
                <p className="text-muted text-sm mt-1">Manage events, assign event heads, and track registrations.</p>
              </div>

              {currentRole === 'Core' ? (
                <button
                  onClick={() => { fetchUsers(); setShowCreateModal(true); }}
                  className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-brand/20"
                >
                  <Plus className="w-4 h-4" />
                  Create Event
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs bg-cream-deep text-muted px-3 py-2 rounded-md border border-line-strong">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  <span>Only Core can create events</span>
                </div>
              )}
            </div>

            <div className="bg-paper border border-line rounded-xl overflow-hidden shadow-sm">
              {loadingEvents ? (
                <div className="p-12 flex items-center justify-center gap-3 text-muted">
                  <Loader2 className="w-5 h-5 animate-spin text-brand" />
                  Loading events from Supabase...
                </div>
              ) : events.length === 0 ? (
                <div className="p-12 text-center text-muted text-sm">
                  No events found. Click "+ Create Event" to add your first event!
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-line text-muted text-xs bg-cream-deep/40">
                      <th className="p-4">Event Name</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Event Date</th>
                      <th className="p-4">Event Head 1</th>
                      <th className="p-4">Event Head 2</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="row-stagger divide-y divide-line text-sm">
                    {events.map((evt) => (
                      <tr key={evt.id} className="hover:bg-cream/50 transition-colors">
                        <td className="p-4 font-semibold text-ink">{evt.name}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
 evt.status === 'Registrations Open'
 ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
 : evt.status === 'Ongoing'
 ? 'bg-accent/10 border-accent/30 text-accent-dark'
 : 'bg-cream-deep border-line-strong text-muted'
 }`}>
                            {evt.status}
                          </span>
                        </td>
                        <td className="p-4 text-ink-soft">{evt.event_date}</td>
                        <td className="p-4 text-ink-soft text-xs">{evt.event_head_1}</td>
                        <td className="p-4 text-ink-soft text-xs">{evt.event_head_2}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => { setSelectedEvent(evt); setParticipantSearch(''); setParticipants([]); setEventStats(null); setManualCheckInMessage(''); setActiveTab('event-detail'); }}
                            className="inline-flex items-center gap-1.5 text-xs text-accent-dark hover:text-brand font-medium"
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
                <h2 className="text-4xl font-semibold text-ink">Users & Roles</h2>
                <p className="text-muted text-sm mt-1">Manage team permissions across Core, Event Head, and Volunteer roles.</p>
              </div>

              {currentRole === 'Core' ? (
                <button
                  onClick={() => setShowUserModal(true)}
                  className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-brand/20"
                >
                  <UserPlus className="w-4 h-4" />
                  Add User
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs bg-cream-deep text-muted px-3 py-2 rounded-md border border-line-strong">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  <span>Only Core can manage users</span>
                </div>
              )}
            </div>

            <div className="bg-paper border border-line rounded-xl overflow-hidden shadow-sm">
              {loadingUsers ? (
                <div className="p-12 flex items-center justify-center gap-3 text-muted">
                  <Loader2 className="w-5 h-5 animate-spin text-brand" />
                  Loading users from Supabase...
                </div>
              ) : users.length === 0 ? (
                <div className="p-12 text-center text-muted text-sm">
                  No users found in database.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-line text-muted text-xs bg-cream-deep/40">
                      <th className="p-4">Name & Email</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Created Date</th>
                      <th className="p-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="row-stagger divide-y divide-line text-sm">
                    {users.map((usr) => (
                      <tr key={usr.id} className="hover:bg-cream/50 transition-colors">
                        <td className="p-4">
                          <div className="font-semibold text-ink">{usr.name}</div>
                          <div className="text-xs text-muted">{usr.email}</div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
 usr.role === 'Core'
 ? 'bg-accent/10 border-accent/30 text-accent-dark'
 : usr.role === 'Event Head'
 ? 'bg-amber-100 border-amber-300 text-amber-800'
 : 'bg-emerald-100 border-emerald-300 text-emerald-700'
 }`}>
                            {usr.role}
                          </span>
                        </td>
                        <td className="p-4 text-ink-soft text-xs">{usr.created_at}</td>
                        <td className="p-4 text-right">
                          <span className="text-xs text-emerald-700 font-medium">● Active</span>
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
          <div className="page-enter">
            <button
              onClick={() => setActiveTab('events')}
              className="text-xs text-muted hover:text-ink mb-4 block"
            >
              ← Back to Events List
            </button>
            <div className="mb-6 flex justify-between items-center">
              <div>
                <h2 className="text-4xl font-semibold text-ink">{selectedEvent.name}</h2>
                <p className="text-xs text-muted">Scheduled: {selectedEvent.event_date} | ID: {selectedEvent.id}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                {(currentRole === 'Core' || currentRole === 'Event Head') && (
                  <div className="flex items-center gap-2 rounded-lg border border-line bg-paper p-2">
                    <label htmlFor="event-status" className="text-xs text-muted">Status</label>
                    <select id="event-status" value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)} className="bg-white border border-line-strong text-ink rounded-md px-2 py-1.5 text-xs">
                      <option>Registrations Open</option><option>Ongoing</option><option>Completed</option>
                    </select>
                    <button type="button" onClick={saveEventStatus} disabled={savingEventStatus || statusDraft === selectedEvent.status} className="inline-flex items-center gap-1 rounded-md bg-brand hover:bg-brand-dark disabled:opacity-40 px-2 py-1.5 text-xs text-white"><Save className="w-3.5 h-3.5" />{savingEventStatus ? 'Saving…' : 'Save'}</button>
                  </div>
                )}
                {(currentRole === 'Core' || currentRole === 'Event Head') && <button type="button" onClick={() => { fetchUsers(); setShowVolunteerModal(true); }} className="inline-flex items-center gap-2 rounded-lg bg-brand hover:bg-brand-dark px-3 py-2 text-xs font-semibold text-white"><UserPlus className="w-4 h-4" /> Assign Volunteers</button>}
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-accent/10 border border-accent/30 text-accent-dark">Live Workspace ({currentRole} Mode)</span>
              </div>
            </div>

            {(currentRole === 'Core' || currentRole === 'Event Head') && (
              <section className="bg-paper border border-line rounded-xl p-5 mb-6">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div><h3 className="text-base font-semibold text-ink">Assigned Volunteers</h3><p className="text-xs text-muted mt-1">Removing a volunteer only removes their access to this event; their account remains.</p></div>
                  <span className="text-xs text-muted">{assignedVolunteers.length} assigned</span>
                </div>
                {loadingAssignedVolunteers ? <p className="text-sm text-muted">Loading assigned volunteers…</p> : assignedVolunteers.length === 0 ? <p className="text-sm text-muted">No volunteers assigned to this event yet.</p> : (
                  <div className="divide-y divide-line">
                    {assignedVolunteers.map((volunteer) => (
                      <div key={volunteer.id} className="flex items-center justify-between gap-3 py-3">
                        <div><p className="text-sm font-medium text-ink">{volunteer.name}</p><p className="text-xs text-muted">{volunteer.email}</p></div>
                        <button type="button" onClick={() => removeAssignedVolunteer(volunteer)} disabled={removingVolunteerId === volunteer.id} className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50 px-2.5 py-1.5 text-xs"><UserMinus className="w-3.5 h-3.5" />{removingVolunteerId === volunteer.id ? 'Removing…' : 'Remove'}</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Attendance metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4 mb-6">
              <div className="bg-paper border border-line rounded-xl p-5">
                <p className="text-xs text-muted mb-2">Registered Participants</p>
                <p className="text-3xl font-bold text-ink">{loadingStats ? '—' : (eventStats?.registered_count ?? '—')}</p>
              </div>
              <div className="bg-paper border border-line rounded-xl p-5">
                <p className="text-xs text-muted mb-2">Expected Participants</p>
                <p className="text-3xl font-bold text-accent-dark">{loadingStats ? '—' : (eventStats?.expected_count ?? selectedEvent.expected_participants ?? 0)}</p>
                <div className="flex gap-2 mt-3">
                  <input aria-label="Expected participant count" type="number" min="0" step="1" value={expectedDraft} onChange={(e) => setExpectedDraft(e.target.value)} className="min-w-0 w-full bg-white border border-line-strong rounded-md px-2 py-1 text-xs text-ink" />
                  <button type="button" onClick={saveExpectedParticipants} disabled={savingExpected} className="rounded-md bg-brand hover:bg-brand-dark px-2 py-1 text-xs text-white disabled:opacity-50">{savingExpected ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
              <div className="bg-paper border border-line rounded-xl p-5">
                <p className="text-xs text-muted mb-2">Registration vs Expected</p>
                <p className={`text-3xl font-bold ${(eventStats?.registration_difference ?? 0) >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{loadingStats ? '—' : (eventStats?.registration_difference ?? ((eventStats?.registered_count ?? 0) - (eventStats?.expected_count ?? 0)))}</p>
                <p className="text-xs text-muted mt-2">Registered minus target</p>
              </div>
              <div className="bg-paper border border-line rounded-xl p-5">
                <p className="text-xs text-muted mb-2">Checked In</p>
                <p className="text-3xl font-bold text-emerald-700">{loadingStats ? '—' : (eventStats?.checked_in_count ?? '—')}</p>
              </div>
              <div className="bg-paper border border-line rounded-xl p-5">
                <p className="text-xs text-muted mb-2">Not Yet Checked In</p>
                <p className="text-3xl font-bold text-amber-700">{loadingStats ? '—' : (eventStats?.not_checked_in_count ?? '—')}</p>
              </div>
              <div className="bg-paper border border-line rounded-xl p-5">
                <p className="text-xs text-muted mb-2">Attendance Rate</p>
                <p className="text-3xl font-bold text-ink">{loadingStats ? '—' : `${eventStats?.attendance_rate ?? 0}%`}</p>
              </div>
            </div>

            {/* Participant directory and manual check-in */}
            <section className="bg-paper border border-line rounded-xl p-5 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-ink">Participants</h3>
                  <p className="text-xs text-muted mt-1">Search by name or email. Manual check-in is available if a QR pass cannot be scanned.</p>
                </div>
                <button
                  type="button"
                  onClick={refreshParticipantWorkspace}
                  disabled={loadingParticipants || loadingStats}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-line-strong text-xs text-ink hover:bg-cream-deep disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${(loadingParticipants || loadingStats) ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="search"
                  value={participantSearch}
                  onChange={(e) => setParticipantSearch(e.target.value)}
                  placeholder="Search participants by name or email..."
                  className="w-full bg-white border border-line-strong text-ink rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-accent"
                />
              </div>
              {manualCheckInMessage && (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-line-strong bg-white px-3 py-2.5 mb-4 text-sm text-ink">
                  <span>{manualCheckInMessage}</span>
                  <button type="button" onClick={() => setManualCheckInMessage('')} aria-label="Dismiss message" className="text-muted hover:text-ink"><X className="w-4 h-4" /></button>
                </div>
              )}
              {participantError ? (
                <div className="text-sm text-red-800 bg-red-50 border border-red-300 rounded-lg p-3">{participantError}</div>
              ) : loadingParticipants ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted"><Loader2 className="w-4 h-4 animate-spin" /> Loading participants...</div>
              ) : participants.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted">{participantSearch ? 'No participants match your search.' : 'No participants have been added to this event yet.'}</div>
              ) : (
                <>
                  <div className="text-xs text-muted mb-2">Showing {participants.length} of {participantsTotal} participant{participantsTotal === 1 ? '' : 's'}{participantsTotal > participants.length ? ' (first 100)' : ''}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[650px]">
                      <thead><tr className="border-b border-line text-xs text-muted">
                        <th className="py-3 px-2 font-semibold">Participant</th>
                        <th className="py-3 px-2 font-semibold">Phone</th>
                        <th className="py-3 px-2 font-semibold">Attendance</th>
                        <th className="py-3 px-2 font-semibold">Checked In At</th>
                        <th className="py-3 px-2 text-right font-semibold">Action</th>
                      </tr></thead>
                      <tbody>
                        {participants.map((participant) => (
                          <tr key={participant.id} className="border-b border-line last:border-0 hover:bg-cream/50">
                            <td className="py-3 px-2">
                              <p className="text-sm font-medium text-ink">{participant.name}</p>
                              <p className="text-xs text-muted break-all">{participant.email}</p>
                            </td>
                            <td className="py-3 px-2 text-xs text-muted">{participant.phone || '—'}</td>
                            <td className="py-3 px-2">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${participant.checked_in ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-amber-100 text-amber-700 border border-amber-300'}`}>
                                {participant.checked_in ? <><CheckCircle2 className="w-3 h-3" /> Checked in</> : 'Not checked in'}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-xs text-muted">{participant.checked_in_at ? new Date(participant.checked_in_at).toLocaleString() : '—'}</td>
                            <td className="py-3 px-2 text-right">
                              {participant.checked_in ? (
                                <span className="text-xs text-muted">Already checked in</span>
                              ) : (
                                <button type="button" onClick={() => { setManualConfirmParticipant(participant); setManualCheckInMessage(''); }} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-2 text-xs font-semibold text-white">
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
              <div className="bg-paper border border-line p-6 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-accent/10 text-accent-dark rounded-lg">
                      <Upload className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-ink">1. CSV Import</h3>
                  </div>
                  <p className="text-xs text-muted mb-4">
                    Upload Google Forms export CSV. Matching <code className="text-accent-dark">Name + Email</code> duplicates are automatically skipped.
                  </p>
                </div>

                <div>
                  {currentRole === 'Volunteer' ? (
                    <div className="text-xs text-amber-700 bg-amber-100 border border-amber-300 p-2.5 rounded-lg text-center">
                      Restricted: Volunteers cannot import CSVs
                    </div>
                  ) : (
                    <button 
                      onClick={() => { setSelectedCsvFile(null); setShowCsvModal(true); }}
                      className="w-full py-2.5 bg-brand hover:bg-brand-dark text-xs font-semibold text-white rounded-lg transition-colors shadow-md"
                    >
                      Upload Participant CSV
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Email Campaign Card */}
              <div className="bg-paper border border-line p-6 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-brand/10 text-brand rounded-lg">
                      <Mail className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-ink">2. Email Pass Sender</h3>
                  </div>
                  <p className="text-xs text-muted mb-4">
                    Dispatch email notifications with embedded QR entry tickets and personalized instructions to all imported participants.
                  </p>
                </div>
                <button 
                  onClick={() => setShowEmailModal(true)}
                  disabled={currentRole === 'Volunteer'}
                  className="w-full py-2.5 bg-brand hover:bg-brand-dark disabled:opacity-50 text-xs font-semibold text-white rounded-lg transition-colors shadow-md"
                >
                  {currentRole === 'Volunteer' ? 'Restricted Access' : 'Compose & Send Passes'}
                </button>
              </div>

              {/* 3. QR Check-in Scanner Card */}
              <div className="bg-paper border border-line p-6 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-ink">3. Gate Check-in</h3>
                  </div>
                  <p className="text-xs text-muted mb-4">
                    Launch the scanner interface for volunteers to verify ticket passes and log entry status in real time.
                  </p>
                </div>
                <button 
                  onClick={() => { resetCheckInScanner(); setShowCheckInModal(true); }}
                  className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-xs font-semibold text-white rounded-lg transition-colors shadow-md"
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
        <div className="modal-backdrop fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="modal-panel bg-paper border border-line w-full max-w-md rounded-2xl p-6 shadow-xl shadow-ink/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700"><UserCheck className="w-5 h-5" /></div>
              <div><h3 className="text-lg font-bold text-ink">Confirm manual check-in</h3><p className="text-xs text-muted">Verify the participant before recording attendance.</p></div>
            </div>
            {manualCheckInMessage && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 mb-4 text-sm text-red-800">{manualCheckInMessage}</div>
            )}
            <div className="rounded-xl border border-line bg-white p-4 mb-5">
              <p className="font-semibold text-ink">{manualConfirmParticipant.name}</p>
              <p className="text-sm text-muted break-all">{manualConfirmParticipant.email}</p>
              {manualConfirmParticipant.phone && <p className="text-xs text-muted mt-1">{manualConfirmParticipant.phone}</p>}
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setManualConfirmParticipant(null)} disabled={manualCheckingIn} className="px-4 py-2 rounded-lg text-xs text-ink-soft hover:bg-cream-deep disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleManualCheckIn} disabled={manualCheckingIn} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-xs font-semibold text-white disabled:opacity-50">
                {manualCheckingIn && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm check-in
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE EVENT */}
      {showCreateModal && (
        <div className="modal-backdrop fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="modal-panel bg-paper border border-line w-full max-w-lg rounded-2xl p-6">
            <h3 className="text-lg font-bold text-ink mb-1">Create New Event</h3>
            <p className="text-xs text-muted mb-6">Enter event details and assign lead Event Heads.</p>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="text-xs text-ink-soft block mb-1 font-medium">Event Name</label>
                <input
                  type="text"
                  placeholder="e.g. Thira AI Summit 2026"
                  value={newEvent.name}
                  onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                  className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm focus:outline-none focus:border-accent"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-ink-soft block mb-1 font-medium">Event Date</label>
                <input
                  type="date"
                  value={newEvent.eventDate}
                  onChange={(e) => setNewEvent({ ...newEvent, eventDate: e.target.value })}
                  className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm focus:outline-none focus:border-accent"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-ink-soft block mb-1 font-medium">Expected Participants</label>
                <input type="number" min="0" step="1" value={newEvent.expectedParticipants} onChange={(e) => setNewEvent({ ...newEvent, expectedParticipants: e.target.value })} className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm focus:outline-none focus:border-accent" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-ink-soft block mb-1 font-medium">Event Head 1</label>
                  <select
                    value={newEvent.eventHead1}
                    onChange={(e) => setNewEvent({ ...newEvent, eventHead1: e.target.value })}
                    className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">Unassigned</option>
                    {users.filter((usr) => usr.role === 'Event Head').map((usr) => <option key={usr.id} value={usr.id}>{usr.name} ({usr.email})</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-ink-soft block mb-1 font-medium">Event Head 2</label>
                  <select
                    value={newEvent.eventHead2}
                    onChange={(e) => setNewEvent({ ...newEvent, eventHead2: e.target.value })}
                    className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">Unassigned</option>
                    {users.filter((usr) => usr.role === 'Event Head' && usr.id !== newEvent.eventHead1).map((usr) => <option key={usr.id} value={usr.id}>{usr.name} ({usr.email})</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEvent}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-brand hover:bg-brand-dark text-white rounded-lg transition-all disabled:opacity-50"
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
        <div className="modal-backdrop fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="modal-panel bg-paper border border-line w-full max-w-md rounded-2xl p-6 relative">
            <button
              onClick={() => setShowCsvModal(false)}
              className="absolute top-4 right-4 text-muted hover:text-ink"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-ink mb-1">Import Participant CSV</h3>
            <p className="text-xs text-muted mb-6">
              Upload Google Forms export for <span className="text-accent-dark font-medium">{selectedEvent.name}</span>.
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
 ? 'border-brand bg-accent/10 scale-[0.99]'
 : selectedCsvFile
 ? 'border-emerald-500/60 bg-emerald-50'
 : 'border-line hover:border-line-strong bg-cream-deep/40'
 }`}
              >
                {selectedCsvFile ? (
                  <div className="flex flex-col items-center">
                    <FileSpreadsheet className="w-10 h-10 text-emerald-700 mb-2" />
                    <p className="text-sm font-semibold text-ink break-all">{selectedCsvFile.name}</p>
                    <p className="text-xs text-muted mt-1">
                      {(selectedCsvFile.size / 1024).toFixed(1)} KB
                    </p>
                    <span className="mt-3 text-xs text-emerald-700 underline">Click or drop to replace</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="w-10 h-10 text-accent-dark mb-3" />
                    <p className="text-sm font-semibold text-ink">Drag & drop your CSV file here</p>
                    <p className="text-xs text-muted mt-1 mb-4">Supports .csv exported from Google Forms</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="px-4 py-2 bg-cream-deep hover:bg-line text-xs font-semibold text-ink rounded-lg border border-line-strong transition-colors"
                    >
                      Browse Files
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowCsvModal(false)}
                  className="px-4 py-2 text-xs font-medium text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedCsvFile || uploadingCsv}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-brand hover:bg-brand-dark text-white rounded-lg transition-all disabled:opacity-50 shadow-lg shadow-brand/20"
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
        <div className="modal-backdrop fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="modal-panel bg-paper border border-line w-full max-w-lg rounded-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-ink">Dispatch Email Passes</h3>
              <span className="text-xs bg-brand/10 text-brand border border-brand/30 px-2.5 py-1 rounded-full font-medium">
                {selectedEvent.name}
              </span>
            </div>
            <p className="text-xs text-muted mb-6">
              This will generate and send unique QR codes to all participants in this event.
            </p>

            <form onSubmit={handleSendEmails} className="space-y-4">
              <div>
                <label className="text-xs text-ink-soft block mb-1 font-medium">Email Subject</label>
                <input
                  type="text"
                  value={emailPayload.subject}
                  onChange={(e) => setEmailPayload({ ...emailPayload, subject: e.target.value })}
                  className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm focus:outline-none focus:border-accent"
                  required
                />
                <p className="text-xs text-muted mt-1">Placeholders available: <code className="text-brand">&#123;event_name&#125;</code>, <code className="text-brand">&#123;name&#125;</code></p>
              </div>

              <div>
                <label className="text-xs text-ink-soft block mb-1 font-medium">Custom Welcome Message</label>
                <textarea
                  rows={4}
                  value={emailPayload.customMessage}
                  onChange={(e) => setEmailPayload({ ...emailPayload, customMessage: e.target.value })}
                  className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm focus:outline-none focus:border-accent"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 text-xs font-medium text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingEmails}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-brand hover:bg-brand-dark text-white rounded-lg transition-all disabled:opacity-50 shadow-lg shadow-brand/20"
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
        <div className="modal-backdrop fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="modal-panel bg-paper border border-line w-full max-w-lg rounded-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-ink">Live Gate Check-in</h3>
              <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-300 px-2.5 py-1 rounded-full font-medium">
                {currentRole}
              </span>
            </div>
            <p className="text-xs text-muted mb-4">
              Scan or enter a pass to verify the participant. Check-in happens only after you confirm.
            </p>

            {!checkInPreview && (
              <>
                <div className="mb-4 bg-white border border-line rounded-xl overflow-hidden p-2">
                  <div id={`reader-${scannerCycle}`} className="w-full" />
                  {(verifyingPass || checkingIn) && (
                    <div className="flex items-center justify-center gap-2 py-3 text-xs text-ink-soft">
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
                      className="flex-1 bg-white border border-line-strong text-ink font-mono rounded-lg p-2.5 text-xs focus:outline-none focus:border-accent"
                    />
                    <button type="submit" disabled={verifyingPass || checkingIn || !checkInToken.trim()} className="px-4 py-2.5 bg-brand hover:bg-brand-dark text-xs font-semibold text-white rounded-lg disabled:opacity-50">
                      {verifyingPass ? 'Verifying…' : 'Verify Pass'}
                    </button>
                  </div>
                </form>
              </>
            )}

            {checkInPreview && (
              <div className="rounded-xl border border-line-strong bg-white p-4 mb-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs text-muted">Participant verified</p>
                    <h4 className="text-lg font-bold text-ink mt-1">{checkInPreview.name}</h4>
                    <p className="text-sm text-ink-soft break-all">{checkInPreview.email}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${checkInPreview.checked_in ? 'border-amber-400 bg-amber-100 text-amber-700' : 'border-emerald-400 bg-emerald-100 text-emerald-700'}`}>
                    {checkInPreview.checked_in ? 'ALREADY CHECKED IN' : 'NOT CHECKED IN'}
                  </span>
                </div>
                {checkInPreview.checked_in ? (
                  <p className="text-xs text-amber-800">This pass has already been used. No changes were made.</p>
                ) : (
                  <p className="text-xs text-muted">Confirm below to record this participant's entry.</p>
                )}
                <div className="flex gap-2 mt-4">
                  {!checkInPreview.checked_in && (
                    <button onClick={handleCheckIn} disabled={checkingIn} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                      {checkingIn && <Loader2 className="h-4 w-4 animate-spin" />}
                      {checkingIn ? 'Confirming…' : 'Confirm Check-in'}
                    </button>
                  )}
                  <button type="button" onClick={resetCheckInScanner} disabled={checkingIn || verifyingPass} className="rounded-lg border border-line-strong px-4 py-3 text-sm font-medium text-ink hover:bg-cream-deep disabled:opacity-50">
                    Scan Again
                  </button>
                </div>
              </div>
            )}

            {checkInResult && (
              <div role="status" className={`fade-in p-3 rounded-xl border text-sm mb-4 ${
 checkInResult.status === 'success' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' :
 checkInResult.status === 'already_checked_in' ? 'bg-amber-100 border-amber-300 text-amber-800' :
 'bg-red-50 border-red-300 text-red-800'
 }`}>
                <div className="font-semibold">{checkInResult.message}</div>
                {checkInResult.participant && (
                  <div className="text-xs mt-1 text-ink-soft">{checkInResult.participant.name}{checkInResult.participant.email ? ` (${checkInResult.participant.email})` : ''}</div>
                )}
                {checkInResult.status === 'success' && <p className="mt-1 text-xs">Scanner is ready for the next participant.</p>}
                {checkInResult.status !== 'success' && !checkInPreview && (
                  <button type="button" onClick={resetCheckInScanner} className="mt-3 rounded-lg border border-line-strong px-3 py-2 text-xs font-semibold text-ink hover:bg-cream-deep">Scan Next Pass</button>
                )}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-line">
              <button type="button" onClick={() => { setShowCheckInModal(false); setCheckInPreview(null); setCheckInToken(''); setCheckInResult(null); }} className="px-4 py-2 text-xs font-medium text-muted hover:text-ink">
                Close Scanner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN VOLUNTEER */}
      {showVolunteerModal && selectedEvent && (
        <div className="modal-backdrop fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="modal-panel bg-paper border border-line w-full max-w-lg rounded-2xl p-6">
            <div className="flex items-start justify-between mb-5">
              <div><h3 className="text-lg font-bold text-ink">Assign Volunteer</h3><p className="text-xs text-muted mt-1">For {selectedEvent.name}. Choose an existing user or create a Volunteer account.</p></div>
              <button type="button" onClick={() => { setShowVolunteerModal(false); setCreatingVolunteerInline(false); }} className="text-muted hover:text-ink"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAssignVolunteer} className="space-y-4">
              <div className="flex gap-2">
                <button type="button" onClick={() => setCreatingVolunteerInline(false)} className={`flex-1 rounded-lg px-3 py-2 text-xs border ${!creatingVolunteerInline ? 'bg-brand border-brand text-white' : 'border-line-strong text-ink-soft'}`}>Select existing</button>
                <button type="button" onClick={() => setCreatingVolunteerInline(true)} className={`flex-1 rounded-lg px-3 py-2 text-xs border ${creatingVolunteerInline ? 'bg-brand border-brand text-white' : 'border-line-strong text-ink-soft'}`}>Create new volunteer</button>
              </div>
              {!creatingVolunteerInline ? (
                <div><label className="text-xs text-ink-soft block mb-1">Volunteer user</label><select value={selectedVolunteerId} onChange={(e) => setSelectedVolunteerId(e.target.value)} required={!creatingVolunteerInline} className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm"><option value="">Select a volunteer…</option>{users.filter((usr) => usr.role === 'Volunteer').map((usr) => <option key={usr.id} value={usr.id}>{usr.name} ({usr.email})</option>)}</select>{users.filter((usr) => usr.role === 'Volunteer').length === 0 && <p className="text-xs text-amber-700 mt-2">No existing volunteer accounts found.</p>}</div>
              ) : (
                <>
                  <div><label className="text-xs text-ink-soft block mb-1">Full name</label><input value={volunteerDraft.name} onChange={(e) => setVolunteerDraft({ ...volunteerDraft, name: e.target.value })} required className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm" /></div>
                  <div><label className="text-xs text-ink-soft block mb-1">Email</label><input type="email" value={volunteerDraft.email} onChange={(e) => setVolunteerDraft({ ...volunteerDraft, email: e.target.value })} required className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm" /></div>
                  <div><label className="text-xs text-ink-soft block mb-1">Temporary password</label><input type="password" value={volunteerDraft.password} onChange={(e) => setVolunteerDraft({ ...volunteerDraft, password: e.target.value })} required minLength={8} className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm" /></div>
                </>
              )}
              <div className="flex justify-end gap-3 pt-4 border-t border-line"><button type="button" onClick={() => setShowVolunteerModal(false)} className="px-4 py-2 text-xs text-ink-soft">Cancel</button><button type="submit" disabled={savingVolunteerAssignment} className="inline-flex items-center gap-2 rounded-lg bg-brand hover:bg-brand-dark px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{savingVolunteerAssignment && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{creatingVolunteerInline ? 'Create & Assign' : 'Assign Volunteer'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE USER */}
      {showUserModal && (
        <div className="modal-backdrop fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="modal-panel bg-paper border border-line w-full max-w-md rounded-2xl p-6">
            <h3 className="text-lg font-bold text-ink mb-1">Add New Team User</h3>
            <p className="text-xs text-muted mb-6">
              {currentRole === 'Core' ? 'As Core, you can create Core, Event Head, or Volunteer accounts.' : 'As Event Head, you can create Volunteer accounts.'}
            </p>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-xs text-ink-soft block mb-1 font-medium">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Anand Kumar"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm focus:outline-none focus:border-accent"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-ink-soft block mb-1 font-medium">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. anand@thira-cochin.in"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm focus:outline-none focus:border-accent"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-ink-soft block mb-1 font-medium">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm focus:outline-none focus:border-accent"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-ink-soft block mb-1 font-medium">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full bg-white border border-line-strong text-ink rounded-lg p-2.5 text-sm focus:outline-none focus:border-accent"
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

              <div className="flex justify-end gap-3 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 text-xs font-medium text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUser}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-brand hover:bg-brand-dark text-white rounded-lg transition-all disabled:opacity-50"
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