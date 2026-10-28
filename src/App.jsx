import React, { useState, useEffect } from 'react';
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
  ShieldAlert
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';

const API_BASE = "http://localhost:8000";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('events');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [currentRole, setCurrentRole] = useState('Core');

  // Real Database States
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState(null);

  // Fetch events and users on mount & role change
  useEffect(() => {
    fetchEvents();
    fetchUsers();
  }, []);

  const fetchEvents = async () => {
    try {
      setLoadingEvents(true);
      const res = await fetch(`${API_BASE}/events`);
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
      const res = await fetch(`${API_BASE}/users`);
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUsers(false);
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
      const res = await fetch(`${API_BASE}/events/${selectedEvent.id}/send-passes`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': currentRole 
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

      const res = await fetch(`${API_BASE}/events`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': currentRole 
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
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': currentRole 
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

  // Modal State for Gate Check-in Scanner
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [checkInToken, setCheckInToken] = useState('');
  const [checkInResult, setCheckInResult] = useState(null);
  const [checkingIn, setCheckingIn] = useState(false);

  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!selectedEvent || !checkInToken) return;

    try {
      setCheckingIn(true);
      setCheckInResult(null);

      const res = await fetch(`${API_BASE}/events/${selectedEvent.id}/check-in`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': currentRole 
        },
        body: JSON.stringify({ qr_token: checkInToken })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Check-in failed");

      setCheckInResult(data);
      setCheckInToken('');
    } catch (err) {
      setCheckInResult({ status: 'error', message: err.message });
    } finally {
      setCheckingIn(false);
    }
  };

  useEffect(() => {
  let scanner = null;
  if (showCheckInModal && selectedEvent) {
    // Slight timeout to ensure the DOM element #reader is rendered
    const timer = setTimeout(() => {
      scanner = new Html5QrcodeScanner("reader", { 
        fps: 10, 
        qrbox: { width: 250, height: 250 } 
      }, false);

      scanner.render(
        async (decodedText) => {
          // Success callback when QR is scanned by camera
          setCheckInToken(decodedText);
          // Automatically trigger check-in API with scanned token
          try {
            const res = await fetch(`${API_BASE}/events/${selectedEvent.id}/check-in`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'x-user-role': currentRole 
              },
              body: JSON.stringify({ qr_token: decodedText.trim() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Check-in failed");
            setCheckInResult(data);
          } catch (err) {
            setCheckInResult({ status: 'error', message: err.message });
          }
        },
        (error) => {
          // Scanning frame error (ignored to prevent console spam while searching for code)
        }
      );
    }, 100);

    return () => {
      clearTimeout(timer);
      if (scanner) {
        scanner.clear().catch((e) => console.error("Failed to clear scanner", e));
      }
    };
  }
}, [showCheckInModal, selectedEvent]);

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

            <button
              onClick={() => { setActiveTab('users'); setSelectedEvent(null); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'users' 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Users className="w-5 h-5" />
              Users & Roles
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <label className="text-xs text-slate-400 block mb-2 font-medium">
            Simulate Role:
          </label>
          <select 
            value={currentRole}
            onChange={(e) => setCurrentRole(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-md p-2 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="Core">Core (Full Access)</option>
            <option value="Event Head">Event Head</option>
            <option value="Volunteer">Volunteer</option>
          </select>
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
                            onClick={() => { setSelectedEvent(evt); setActiveTab('event-detail'); }}
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

              {currentRole !== 'Volunteer' ? (
                <button
                  onClick={() => setShowUserModal(true)}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-indigo-600/20"
                >
                  <UserPlus className="w-4 h-4" />
                  {currentRole === 'Core' ? 'Add User (Core / Head / Volunteer)' : 'Add Volunteer'}
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs bg-slate-800 text-slate-400 px-3 py-2 rounded-md border border-slate-700">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Volunteers cannot add users</span>
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
                    <>
                      <input
                        type="file"
                        accept=".csv"
                        id={`csv-upload-${selectedEvent.id}`}
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;

                          const formData = new FormData();
                          formData.append("file", file);

                          try {
                            const res = await fetch(`${API_BASE}/events/${selectedEvent.id}/import-csv`, {
                              method: 'POST',
                              headers: { 'x-user-role': currentRole },
                              body: formData
                            });
                            if (!res.ok) {
                              const err = await res.json();
                              throw new Error(err.detail || "Failed to upload CSV");
                            }
                            const result = await res.json();
                            alert(`CSV Import Successful!\n- Added: ${result.added} new participants\n- Skipped: ${result.skipped} duplicate(s)`);
                          } catch (err) {
                            alert("Error: " + err.message);
                          }
                        }}
                      />
                      <label 
                        htmlFor={`csv-upload-${selectedEvent.id}`}
                        className="w-full cursor-pointer block text-center py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white rounded-lg transition-colors shadow-md"
                      >
                        Upload Participant CSV
                      </label>
                    </>
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
                  onClick={() => { setShowCheckInModal(true); setCheckInResult(null); }}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white rounded-lg transition-colors shadow-md"
                >
                  Open QR Scanner
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

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

      {/* MODAL: GATE CHECK-IN SCANNER WITH CAMERA */}
      {showCheckInModal && selectedEvent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 w-full max-w-lg rounded-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-white">Live Gate Check-in Scanner</h3>
              <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 px-2.5 py-1 rounded-full font-medium">
                Role: {currentRole}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Point your camera at the participant's QR pass or paste the token code manually.
            </p>

            {/* CAMERA VIEWFINDER CONTAINER */}
            <div className="mb-4 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-2">
              <div id="reader" className="w-full"></div>
            </div>

            {/* MANUAL FALLBACK INPUT */}
            <form onSubmit={handleCheckIn} className="space-y-3 mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Or type/paste token (e.g. THIRA-8F4A2C11)"
                  value={checkInToken}
                  onChange={(e) => setCheckInToken(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 text-white font-mono rounded-lg p-2.5 text-xs focus:outline-none focus:border-emerald-500 uppercase"
                />
                <button
                  type="submit"
                  disabled={checkingIn}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white rounded-lg transition-all disabled:opacity-50 shadow-md"
                >
                  {checkingIn ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </form>

            {/* Result feedback box */}
            {checkInResult && (
              <div className={`p-3 rounded-xl border text-sm mb-4 ${
                checkInResult.status === 'success' 
                  ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200' 
                  : checkInResult.status === 'already_checked_in'
                  ? 'bg-amber-950/80 border-amber-800 text-amber-200'
                  : 'bg-red-950/80 border-red-800 text-red-200'
              }`}>
                <div className="font-semibold">{checkInResult.message}</div>
                {checkInResult.participant && (
                  <div className="text-xs mt-1 text-slate-300">
                    Participant: <strong className="text-white">{checkInResult.participant.name}</strong> ({checkInResult.participant.email})
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowCheckInModal(false);
                }}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
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