import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Calendar, Clock, Users, LogOut, Plus, Copy, Check, Trash2, Globe, ChevronLeft, Share2, Eye, EyeOff, Link as LinkIcon, Pencil } from "lucide-react";
import { supabase } from "./supabase.js";

// =============== CONFIGURATION ===============
const BRAND_NAME = "Union Savings";
const BRAND_TAGLINE = "Meeting scheduler";

// Canadian time zones only
const CANADIAN_TIMEZONES = [
  { value: "America/St_Johns", label: "Newfoundland (NST/NDT)", abbr: "NT" },
  { value: "America/Halifax", label: "Atlantic (AST/ADT) — Halifax, NB, PEI, NS", abbr: "AT" },
  { value: "America/Toronto", label: "Eastern (EST/EDT) — Toronto, Ottawa, Montreal", abbr: "ET" },
  { value: "America/Winnipeg", label: "Central (CST/CDT) — Winnipeg, Manitoba", abbr: "CT" },
  { value: "America/Regina", label: "Central — Saskatchewan (no DST)", abbr: "CST" },
  { value: "America/Edmonton", label: "Mountain (MST/MDT) — Edmonton, Calgary", abbr: "MT" },
  { value: "America/Vancouver", label: "Pacific (PST/PDT) — Vancouver, BC", abbr: "PT" },
  { value: "America/Whitehorse", label: "Yukon (MST, no DST)", abbr: "YT" },
];

// Meeting length options
const MEETING_LENGTHS = [
  { value: "30min", label: "30 minutes", slotsNeeded: 1 },
  { value: "1hr", label: "1 hour", slotsNeeded: 2 },
  { value: "2hr", label: "2 hours", slotsNeeded: 4 },
  { value: "allday", label: "All day", slotsNeeded: 0 }, // 0 means day-based, not slot-based
];
const isAllDay = (poll) => poll?.meetingLength === "allday";

// =============== LOGO (SVG recreation of Union Savings mark) ===============
const Logo = ({ size = 40, bg = "#000" }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <rect width="200" height="200" fill={bg} rx="8" />
    {/* Blue top arm */}
    <path
      d="M 100,55 Q 138,55 148,88 Q 150,95 144,98 Q 138,100 134,94 Q 126,72 100,72 Q 90,72 90,63 Q 90,55 100,55 Z"
      fill="#2098C9"
    />
    {/* Green right arm */}
    <path
      d="M 145,100 Q 145,138 112,148 Q 105,150 102,144 Q 100,138 106,134 Q 128,126 128,100 Q 128,90 137,90 Q 145,90 145,100 Z"
      fill="#A3CD39"
    />
    {/* Blue bottom arm */}
    <path
      d="M 100,145 Q 62,145 52,112 Q 50,105 56,102 Q 62,100 66,106 Q 74,128 100,128 Q 110,128 110,137 Q 110,145 100,145 Z"
      fill="#2098C9"
    />
    {/* Purple left arm */}
    <path
      d="M 55,100 Q 55,62 88,52 Q 95,50 98,56 Q 100,62 94,66 Q 72,74 72,100 Q 72,110 63,110 Q 55,110 55,100 Z"
      fill="#8E3A8A"
    />
    {/* Center dots to suggest connection */}
    <circle cx="100" cy="82" r="5" fill="#2098C9" />
    <circle cx="118" cy="100" r="5" fill="#A3CD39" />
    <circle cx="100" cy="118" r="5" fill="#2098C9" />
    <circle cx="82" cy="100" r="5" fill="#8E3A8A" />
  </svg>
);

// =============== DATABASE HELPERS (Supabase) ===============
// Convert a DB row (snake_case) to the shape the app uses (camelCase)
const pollFromDb = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description || "",
  dates: row.dates || [],
  timezone: row.timezone,
  startHour: row.start_hour,
  endHour: row.end_hour,
  meetingLength: row.meeting_length || "30min", // "30min" | "1hr" | "2hr" | "allday"
  createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
  responses: {}, // loaded separately
});

const responseFromDb = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email || "",
  note: row.note || "",
  timezone: row.timezone,
  selectedSlots: row.selected_slots || [],
  submittedAt: row.submitted_at ? new Date(row.submitted_at).getTime() : Date.now(),
});

const db = {
  // Load all polls (admin view) with their responses
  async getAllPolls() {
    const { data: pollRows, error: pollErr } = await supabase
      .from("polls")
      .select("*")
      .order("created_at", { ascending: false });
    if (pollErr) throw pollErr;

    const { data: respRows, error: respErr } = await supabase
      .from("responses")
      .select("*");
    if (respErr) throw respErr;

    const polls = {};
    for (const row of pollRows || []) {
      polls[row.id] = pollFromDb(row);
    }
    for (const row of respRows || []) {
      if (polls[row.poll_id]) {
        const r = responseFromDb(row);
        polls[row.poll_id].responses[r.id] = r;
      }
    }
    return polls;
  },

  // Load a single poll (participant view) - no responses included
  async getPoll(pollId) {
    const { data, error } = await supabase
      .from("polls")
      .select("*")
      .eq("id", pollId)
      .maybeSingle();
    if (error) throw error;
    return data ? pollFromDb(data) : null;
  },

  // Create a new poll (admin only — enforced by RLS)
  async createPoll(poll) {
    const { error } = await supabase.from("polls").insert({
      id: poll.id,
      title: poll.title,
      description: poll.description,
      dates: poll.dates,
      timezone: poll.timezone,
      start_hour: poll.startHour,
      end_hour: poll.endHour,
      meeting_length: poll.meetingLength || "30min",
    });
    if (error) throw error;
  },

  // Update an existing poll (admin only)
  async updatePoll(poll) {
    const { error } = await supabase
      .from("polls")
      .update({
        title: poll.title,
        description: poll.description,
        dates: poll.dates,
        timezone: poll.timezone,
        start_hour: poll.startHour,
        end_hour: poll.endHour,
        meeting_length: poll.meetingLength || "30min",
        updated_at: new Date().toISOString(),
      })
      .eq("id", poll.id);
    if (error) throw error;
  },

  // Delete a poll + cascade its responses (admin only)
  async deletePoll(pollId) {
    const { error } = await supabase.from("polls").delete().eq("id", pollId);
    if (error) throw error;
  },

  // Submit a participant response (anyone)
  async submitResponse(pollId, response) {
    const { error } = await supabase.from("responses").insert({
      id: response.id,
      poll_id: pollId,
      name: response.name,
      email: response.email,
      note: response.note,
      timezone: response.timezone,
      selected_slots: response.selectedSlots,
    });
    if (error) throw error;
  },

  // Replace responses for a poll after schedule-edit filter (admin only)
  async replaceResponses(pollId, responses) {
    // Delete all existing responses for this poll
    const { error: delErr } = await supabase.from("responses").delete().eq("poll_id", pollId);
    if (delErr) throw delErr;
    // Re-insert the filtered set
    const rows = Object.values(responses).map(r => ({
      id: r.id,
      poll_id: pollId,
      name: r.name,
      email: r.email,
      note: r.note,
      timezone: r.timezone,
      selected_slots: r.selectedSlots,
      submitted_at: new Date(r.submittedAt).toISOString(),
    }));
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("responses").insert(rows);
      if (insErr) throw insErr;
    }
  },
};

// =============== AUTH HELPERS ===============
const auth = {
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  },
  async signOut() {
    await supabase.auth.signOut();
  },
  async getCurrentUser() {
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  },
};

// =============== UTILITIES ===============
const genId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const formatDate = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
};

const formatDateLong = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
};

// Summarize a list of dates for compact display, e.g. "Apr 20 – Apr 30 (5 dates)"
const summarizeDates = (dates) => {
  if (!dates || dates.length === 0) return "No dates";
  const sorted = [...dates].sort();
  if (sorted.length === 1) return formatDate(sorted[0]);
  const first = formatDate(sorted[0]);
  const last = formatDate(sorted[sorted.length - 1]);
  return `${first} – ${last} · ${sorted.length} ${sorted.length === 1 ? "date" : "dates"}`;
};

// Get the UTC offset (in minutes) for a given instant in a given IANA timezone.
// Positive means timezone is ahead of UTC (e.g., Asia/Tokyo = +540); negative means behind (e.g., America/Toronto = -240 or -300).
const getTimezoneOffsetMinutes = (utcMs, timezone) => {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const v = {};
  parts.forEach(p => { if (p.type !== "literal") v[p.type] = p.value; });
  const asUtcOfLocalTime = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second);
  return (asUtcOfLocalTime - utcMs) / 60000;
};

// Convert a slot (date + hour + minute in a source TZ) to a UTC timestamp
const slotToUTC = (dateStr, hour, minute, timezone) => {
  // Start with a UTC guess: treat the local date/time as if it were UTC
  const guessUtc = Date.UTC(
    +dateStr.slice(0, 4),
    +dateStr.slice(5, 7) - 1,
    +dateStr.slice(8, 10),
    hour, minute, 0
  );
  // The real UTC time = guess minus the offset of the source timezone at that instant.
  // Two iterations handle DST transitions where the offset changes across the guess.
  let offset1 = getTimezoneOffsetMinutes(guessUtc, timezone);
  let real = guessUtc - offset1 * 60000;
  let offset2 = getTimezoneOffsetMinutes(real, timezone);
  if (offset1 !== offset2) {
    real = guessUtc - offset2 * 60000;
  }
  return real;
};

// Convert a UTC timestamp to { date, hour, minute } in target timezone
const utcToSlot = (utcMs, timezone) => {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const v = {};
  parts.forEach(p => { if (p.type !== "literal") v[p.type] = p.value; });
  return {
    date: `${v.year}-${v.month}-${v.day}`,
    hour: +v.hour,
    minute: +v.minute,
  };
};

const formatTime = (hour, minute) => {
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
};

const getDateRange = (startDate, endDate) => {
  const dates = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

// Normalize a poll (handles legacy polls that used startDate/endDate instead of a dates array)
const normalizePoll = (poll) => {
  if (!poll) return poll;
  if (Array.isArray(poll.dates) && poll.dates.length > 0) return poll;
  if (poll.startDate && poll.endDate) {
    return { ...poll, dates: getDateRange(poll.startDate, poll.endDate) };
  }
  return { ...poll, dates: [] };
};

// Detect a poll token from the URL hash
const getPollTokenFromUrl = () => {
  const hash = window.location.hash.slice(1);
  const match = hash.match(/^poll\/([a-z0-9]+)$/i);
  return match ? match[1] : null;
};

// =============== SHARED STYLES ===============
const colors = {
  brandBlue: "#2098C9",
  brandGreen: "#A3CD39",
  brandPurple: "#8E3A8A",
  black: "#0a0a0a",
  darkBg: "#141414",
  surface: "#ffffff",
  border: "#e5e5e5",
  borderStrong: "#d4d4d4",
  text: "#171717",
  textMuted: "#737373",
  textLight: "#a3a3a3",
  available: "#ffffff",       // White — selectable (with green border)
  availableBorder: "#A3CD39",
  selected: "#A3CD39",          // Solid brand green — selected
  selectedText: "#1a3d00",
  unavailable: "#fafafa",
  heatmap: ["#ffffff", "#F0F7E0", "#D7EBA8", "#B5DC65", "#A3CD39", "#7DA624"],
};

// =============== ADMIN LOGIN ===============
function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await auth.signIn(email.trim(), password);
      onLogin();
    } catch (e) {
      setError(e?.message || "Sign in failed");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: colors.black, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ background: colors.surface, borderRadius: "12px", padding: "48px 40px", maxWidth: "420px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "32px" }}>
          <Logo size={72} />
          <h1 style={{ fontSize: "22px", fontWeight: 500, margin: "20px 0 4px", color: colors.text }}>{BRAND_NAME}</h1>
          <p style={{ fontSize: "14px", color: colors.textMuted, margin: 0 }}>{BRAND_TAGLINE} — admin sign in</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: colors.text, marginBottom: "6px" }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
              autoComplete="email"
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "14px",
                border: `1px solid ${error ? "#dc2626" : colors.border}`,
                borderRadius: "8px",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: colors.text, marginBottom: "6px" }}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoComplete="current-password"
                style={{
                  width: "100%",
                  padding: "10px 40px 10px 12px",
                  fontSize: "14px",
                  border: `1px solid ${error ? "#dc2626" : colors.border}`,
                  borderRadius: "8px",
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: "4px", color: colors.textMuted }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {error && <p style={{ fontSize: "12px", color: "#dc2626", margin: "6px 0 0" }}>{error}</p>}
          </div>

          <button
            onClick={handleSubmit}
            disabled={busy}
            style={{
              background: colors.brandBlue,
              color: "white",
              padding: "11px",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.7 : 1,
              fontFamily: "inherit",
            }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>

        <p style={{ fontSize: "12px", color: colors.textLight, textAlign: "center", marginTop: "32px", marginBottom: 0 }}>
          Participants do not need to sign in — they use a shared meeting link.
        </p>
      </div>
    </div>
  );
}

// =============== POLL FORM MODAL (create + edit) ===============
function PollFormModal({ existingPoll, onClose, onSave }) {
  const isEdit = !!existingPoll;
  const normalized = existingPoll ? normalizePoll(existingPoll) : null;

  const [title, setTitle] = useState(normalized?.title || "");
  const [description, setDescription] = useState(normalized?.description || "");
  const [selectedDates, setSelectedDates] = useState(new Set(normalized?.dates || []));
  const [timezone, setTimezone] = useState(normalized?.timezone || "America/Toronto");
  const [startHour, setStartHour] = useState(normalized?.startHour ?? 9);
  const [endHour, setEndHour] = useState(normalized?.endHour ?? 17);
  const [meetingLength, setMeetingLength] = useState(normalized?.meetingLength || "30min");
  const [error, setError] = useState("");

  // Month navigation for the calendar picker
  const todayObj = new Date();
  const initialMonth = (() => {
    if (normalized?.dates?.length) {
      const first = [...normalized.dates].sort()[0];
      const d = new Date(first + "T00:00:00");
      return { y: d.getFullYear(), m: d.getMonth() };
    }
    return { y: todayObj.getFullYear(), m: todayObj.getMonth() };
  })();
  const [viewYear, setViewYear] = useState(initialMonth.y);
  const [viewMonth, setViewMonth] = useState(initialMonth.m);

  const responseCount = isEdit ? Object.keys(existingPoll.responses || {}).length : 0;

  // Detect schedule changes for warning banner
  const scheduleChanged = isEdit && (() => {
    const origDates = new Set(normalized.dates || []);
    if (origDates.size !== selectedDates.size) return true;
    for (const d of selectedDates) if (!origDates.has(d)) return true;
    return (
      timezone !== normalized.timezone ||
      startHour !== normalized.startHour ||
      endHour !== normalized.endHour ||
      meetingLength !== normalized.meetingLength
    );
  })();

  // Toggle a single date
  const toggleDate = (dateStr) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  // Add all weekdays (Mon–Fri) in the currently viewed month
  const addWeekdaysInMonth = () => {
    const last = new Date(viewYear, viewMonth + 1, 0).getDate();
    const toAdd = [];
    for (let day = 1; day <= last; day++) {
      const d = new Date(viewYear, viewMonth, day);
      const dow = d.getDay(); // 0=Sun, 6=Sat
      if (dow >= 1 && dow <= 5) {
        const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        // Only add if not in the past
        const todayStr = todayObj.toISOString().slice(0, 10);
        if (ds >= todayStr) toAdd.push(ds);
      }
    }
    setSelectedDates(prev => {
      const next = new Set(prev);
      toAdd.forEach(d => next.add(d));
      return next;
    });
  };

  const clearMonth = () => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`;
      for (const d of prev) if (d.startsWith(prefix)) next.delete(d);
      return next;
    });
  };

  const clearAll = () => setSelectedDates(new Set());

  const gotoPrevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const gotoNextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const submit = () => {
    if (!title.trim()) return setError("Please enter a meeting title");
    if (selectedDates.size === 0) return setError("Please pick at least one date");
    if (meetingLength !== "allday" && startHour >= endHour) return setError("End hour must be after start hour");

    if (isEdit && scheduleChanged && responseCount > 0) {
      const confirmed = confirm(
        `You've changed the schedule and this poll has ${responseCount} ${responseCount === 1 ? "response" : "responses"}.\n\nResponses that fall outside the new schedule will be dropped. Valid ones will be kept.\n\nContinue?`
      );
      if (!confirmed) return;
    }

    const datesArr = Array.from(selectedDates).sort();

    if (isEdit) {
      const updated = {
        ...existingPoll,
        title: title.trim(),
        description: description.trim(),
        dates: datesArr,
        timezone,
        startHour,
        endHour,
        meetingLength,
        updatedAt: Date.now(),
      };
      delete updated.startDate;
      delete updated.endDate;

      // Rebuild valid responses under new schedule
      const newResponses = {};
      if (meetingLength === "allday") {
        // All-day: valid "slots" are date strings
        const validDates = new Set(datesArr);
        Object.entries(existingPoll.responses || {}).forEach(([rid, r]) => {
          // Filter: keep selections that are valid dates. Legacy responses with UTC timestamps are dropped.
          const filtered = (r.selectedSlots || []).filter(s => typeof s === "string" && validDates.has(s));
          newResponses[rid] = { ...r, selectedSlots: filtered };
        });
      } else {
        // Time-based: valid slots are UTC timestamps within new date range + hour range
        const validSlots = new Set();
        for (const dateStr of datesArr) {
          for (let h = startHour; h < endHour; h++) {
            for (const m of [0, 30]) {
              validSlots.add(slotToUTC(dateStr, h, m, timezone));
            }
          }
        }
        Object.entries(existingPoll.responses || {}).forEach(([rid, r]) => {
          const filtered = (r.selectedSlots || []).filter(utc => typeof utc === "number" && validSlots.has(utc));
          newResponses[rid] = { ...r, selectedSlots: filtered };
        });
      }
      updated.responses = newResponses;

      onSave(updated);
    } else {
      const poll = {
        id: genId(),
        title: title.trim(),
        description: description.trim(),
        dates: datesArr,
        timezone,
        startHour,
        endHour,
        meetingLength,
        createdAt: Date.now(),
        responses: {},
      };
      onSave(poll);
    }
  };

  // ---- Calendar grid rendering ----
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dowLabels = ["S", "M", "T", "W", "T", "F", "S"];
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const firstDow = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayStr = todayObj.toISOString().slice(0, 10);

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pad = (n) => String(n).padStart(2, "0");
  const dateStrFor = (day) => `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;

  const selectedList = Array.from(selectedDates).sort();

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "20px" }}>
      <div style={{ background: "white", borderRadius: "12px", padding: "28px 32px", maxWidth: "580px", width: "100%", maxHeight: "92vh", overflowY: "auto" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 500, margin: "0 0 20px", color: colors.text }}>{isEdit ? "Edit poll" : "New meeting poll"}</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Meeting title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q2 planning session" style={inputStyle} />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Description (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Brief note for participants" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>

          {/* Date picker */}
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>
              Dates * <span style={{ color: colors.textMuted, fontWeight: 400 }}>— click to toggle individual days</span>
            </label>
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "12px" }}>
              {/* Month header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <button type="button" onClick={gotoPrevMonth} style={{ ...secondaryBtn, padding: "5px 10px", fontSize: "12px" }}>‹</button>
                <div style={{ fontSize: "14px", fontWeight: 500, color: colors.text }}>{monthNames[viewMonth]} {viewYear}</div>
                <button type="button" onClick={gotoNextMonth} style={{ ...secondaryBtn, padding: "5px 10px", fontSize: "12px" }}>›</button>
              </div>

              {/* Day-of-week header */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" }}>
                {dowLabels.map((l, i) => (
                  <div key={i} style={{ fontSize: "11px", fontWeight: 500, color: colors.textMuted, textAlign: "center", padding: "4px 0" }}>{l}</div>
                ))}
              </div>

              {/* Day cells */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
                {cells.map((day, idx) => {
                  if (day === null) return <div key={idx} />;
                  const ds = dateStrFor(day);
                  const isPast = ds < todayStr;
                  const isToday = ds === todayStr;
                  const isSelected = selectedDates.has(ds);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => { if (!isPast) toggleDate(ds); }}
                      disabled={isPast}
                      style={{
                        padding: "0",
                        aspectRatio: "1 / 1",
                        border: isSelected
                          ? `1px solid ${colors.brandGreen}`
                          : isToday
                          ? `1px solid ${colors.brandBlue}`
                          : `1px solid ${colors.border}`,
                        borderRadius: "6px",
                        background: isPast
                          ? "#f5f5f5"
                          : isSelected
                          ? colors.selected
                          : "white",
                        color: isPast
                          ? colors.textLight
                          : isSelected
                          ? colors.selectedText
                          : colors.text,
                        fontWeight: isSelected ? 500 : 400,
                        fontSize: "13px",
                        cursor: isPast ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                      }}
                      title={ds}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* Helpers */}
              <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
                <button type="button" onClick={addWeekdaysInMonth} style={{ ...secondaryBtn, padding: "5px 10px", fontSize: "12px" }}>
                  + Weekdays this month
                </button>
                <button type="button" onClick={clearMonth} style={{ ...secondaryBtn, padding: "5px 10px", fontSize: "12px" }}>
                  Clear this month
                </button>
                {selectedDates.size > 0 && (
                  <button type="button" onClick={clearAll} style={{ ...secondaryBtn, padding: "5px 10px", fontSize: "12px", color: "#dc2626" }}>
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Selected-dates summary */}
            <div style={{ marginTop: "8px", fontSize: "12px", color: colors.textMuted }}>
              {selectedDates.size === 0 ? (
                <>No dates selected yet.</>
              ) : (
                <>
                  <strong style={{ fontWeight: 500, color: colors.text }}>{selectedDates.size}</strong> {selectedDates.size === 1 ? "date" : "dates"} selected
                  {selectedDates.size <= 6 && (
                    <span>: {selectedList.map(d => formatDate(d)).join(", ")}</span>
                  )}
                </>
              )}
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Meeting length *</label>
            <select value={meetingLength} onChange={(e) => setMeetingLength(e.target.value)} style={inputStyle}>
              {MEETING_LENGTHS.map(ml => <option key={ml.value} value={ml.value}>{ml.label}</option>)}
            </select>
            <p style={{ fontSize: "12px", color: colors.textMuted, margin: "6px 0 0" }}>
              {meetingLength === "allday"
                ? "Participants will pick whole days — no time selection."
                : meetingLength === "30min"
                ? "Participants pick 30-minute slots."
                : `Participants pick 30-minute slots. For a ${meetingLength === "1hr" ? "1-hour" : "2-hour"} meeting, they'll need at least ${meetingLength === "1hr" ? "2" : "4"} consecutive slots.`}
            </p>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Your time zone *</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} style={inputStyle}>
              {CANADIAN_TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </select>
            <p style={{ fontSize: "12px", color: colors.textMuted, margin: "6px 0 0" }}>Participants default to this time zone but can switch their own view.</p>
          </div>

          {meetingLength !== "allday" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Earliest hour</label>
                <select value={startHour} onChange={(e) => setStartHour(+e.target.value)} style={inputStyle}>
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{formatTime(i, 0)}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Latest hour</label>
                <select value={endHour} onChange={(e) => setEndHour(+e.target.value)} style={inputStyle}>
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i + 1}>{formatTime(i + 1, 0)}</option>)}
                </select>
              </div>
            </div>
          )}

          {isEdit && scheduleChanged && responseCount > 0 && (
            <div style={{ fontSize: "13px", color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "8px", padding: "10px 12px", margin: 0 }}>
              ⚠ You've changed the schedule. Participant slots that fall outside the new dates/hours will be dropped when you save.
            </div>
          )}

          {error && <p style={{ fontSize: "13px", color: "#dc2626", margin: 0 }}>{error}</p>}

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px" }}>
            <button onClick={onClose} style={secondaryBtn}>Cancel</button>
            <button onClick={submit} style={primaryBtn}>{isEdit ? "Save changes" : "Create poll"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============== ADMIN DASHBOARD (LIST OF POLLS) ===============
function AdminDashboard({ polls, onCreateNew, onOpenPoll, onLogout, onDeletePoll, onEditPoll }) {
  const [copiedId, setCopiedId] = useState(null);

  const pollList = Object.values(polls).sort((a, b) => b.createdAt - a.createdAt);

  const copyLink = (pollId) => {
    const url = `${window.location.origin}${window.location.pathname}#poll/${pollId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(pollId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <header style={{ background: colors.black, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Logo size={36} />
          <div>
            <div style={{ fontSize: "15px", fontWeight: 500, color: "white" }}>{BRAND_NAME}</div>
            <div style={{ fontSize: "12px", color: "#888" }}>{BRAND_TAGLINE} — admin</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ background: "transparent", color: "white", border: "1px solid #333", padding: "7px 12px", borderRadius: "6px", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontFamily: "inherit" }}>
          <LogOut size={14} /> Sign out
        </button>
      </header>

      <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 500, margin: 0, color: colors.text }}>Your polls</h1>
            <p style={{ fontSize: "14px", color: colors.textMuted, margin: "4px 0 0" }}>{pollList.length} {pollList.length === 1 ? "poll" : "polls"}</p>
          </div>
          <button onClick={onCreateNew} style={{ ...primaryBtn, display: "flex", alignItems: "center", gap: "6px" }}>
            <Plus size={16} /> New poll
          </button>
        </div>

        {pollList.length === 0 ? (
          <div style={{ background: "white", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "56px 24px", textAlign: "center" }}>
            <Calendar size={40} style={{ color: colors.textLight, marginBottom: "12px" }} />
            <h3 style={{ fontSize: "16px", fontWeight: 500, margin: "0 0 4px", color: colors.text }}>No polls yet</h3>
            <p style={{ fontSize: "14px", color: colors.textMuted, margin: "0 0 20px" }}>Create your first meeting poll to get started.</p>
            <button onClick={onCreateNew} style={{ ...primaryBtn, display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Plus size={16} /> Create poll
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {pollList.map(poll => {
              const responseCount = Object.keys(poll.responses || {}).length;
              const tzLabel = CANADIAN_TIMEZONES.find(t => t.value === poll.timezone)?.abbr || "";
              return (
                <div key={poll.id} style={{ background: "white", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: "240px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: 500, margin: "0 0 6px", color: colors.text, cursor: "pointer" }} onClick={() => onOpenPoll(poll.id)}>
                        {poll.title}
                      </h3>
                      {poll.description && <p style={{ fontSize: "13px", color: colors.textMuted, margin: "0 0 10px" }}>{poll.description}</p>}
                      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", fontSize: "13px", color: colors.textMuted }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Calendar size={13} /> {summarizeDates(normalizePoll(poll).dates)}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Globe size={13} /> {tzLabel}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Users size={13} /> {responseCount} {responseCount === 1 ? "response" : "responses"}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <button onClick={() => copyLink(poll.id)} style={{ ...secondaryBtn, display: "flex", alignItems: "center", gap: "6px", padding: "7px 10px" }} title="Copy participant link">
                        {copiedId === poll.id ? <><Check size={14} /> Copied</> : <><LinkIcon size={14} /> Copy link</>}
                      </button>
                      <button onClick={() => onEditPoll(poll.id)} style={{ ...secondaryBtn, padding: "7px 10px" }} title="Edit poll">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => onOpenPoll(poll.id)} style={{ ...primaryBtn, padding: "7px 14px" }}>Open</button>
                      <button onClick={() => { if (confirm(`Delete poll "${poll.title}"? This cannot be undone.`)) onDeletePoll(poll.id); }} style={{ ...secondaryBtn, padding: "7px 10px", color: "#dc2626" }} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// =============== ADMIN POLL DETAIL (HEATMAP + RESPONSES) ===============
function AdminPollDetail({ poll: rawPoll, onBack, onDelete, onEdit }) {
  const poll = useMemo(() => normalizePoll(rawPoll), [rawPoll]);
  const [viewTz, setViewTz] = useState(poll.timezone);
  const [copied, setCopied] = useState(false);
  const [hoveredSlot, setHoveredSlot] = useState(null); // { utc, x, y, date, hour, minute }

  const shareLink = `${window.location.origin}${window.location.pathname}#poll/${poll.id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const responses = Object.values(poll.responses || {});
  const dates = poll.dates;

  // Build all possible slots in admin's viewing TZ
  // Each slot across days at start/end hours, converted to UTC via poll.timezone reference
  const slots = useMemo(() => {
    if (isAllDay(poll)) return [];
    const result = [];
    // Generate slots in the ORIGINAL poll timezone, then we'll display them in viewTz
    for (const dateStr of dates) {
      for (let h = poll.startHour; h < poll.endHour; h++) {
        for (const m of [0, 30]) {
          const utc = slotToUTC(dateStr, h, m, poll.timezone);
          result.push(utc);
        }
      }
    }
    return result;
  }, [poll, dates]);

  // Count how many responses picked each slot (by UTC timestamp)
  const slotCounts = useMemo(() => {
    const counts = {};
    responses.forEach(r => {
      (r.selectedSlots || []).forEach(utc => {
        counts[utc] = (counts[utc] || 0) + 1;
      });
    });
    return counts;
  }, [responses]);

  const maxCount = Math.max(1, ...Object.values(slotCounts));

  // Group slots by date (in viewTz) for display
  const grouped = useMemo(() => {
    const map = {};
    slots.forEach(utc => {
      const s = utcToSlot(utc, viewTz);
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push({ utc, hour: s.hour, minute: s.minute });
    });
    // sort each day's slots chronologically
    Object.values(map).forEach(arr => arr.sort((a, b) => a.utc - b.utc));
    return map;
  }, [slots, viewTz]);

  const sortedDates = Object.keys(grouped).sort();

  const getHeatColor = (count) => {
    if (count === 0) return colors.heatmap[0];
    const ratio = count / maxCount;
    const idx = Math.min(colors.heatmap.length - 1, Math.ceil(ratio * (colors.heatmap.length - 1)));
    return colors.heatmap[idx];
  };

  // Find best slots (highest count). For all-day polls, keys are date strings; for time-based polls, UTC numbers.
  const bestSlots = useMemo(() => {
    const entries = Object.entries(slotCounts).map(([k, count]) => ({
      utc: isAllDay(poll) ? k : +k,
      count,
    }));
    entries.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      // tiebreak: earliest first
      if (isAllDay(poll)) return String(a.utc).localeCompare(String(b.utc));
      return a.utc - b.utc;
    });
    return entries.slice(0, 5);
  }, [slotCounts, poll]);

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <header style={{ background: colors.black, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Logo size={36} />
          <div>
            <div style={{ fontSize: "15px", fontWeight: 500, color: "white" }}>{BRAND_NAME}</div>
            <div style={{ fontSize: "12px", color: "#888" }}>{BRAND_TAGLINE} — admin</div>
          </div>
        </div>
        <button onClick={onBack} style={{ background: "transparent", color: "white", border: "1px solid #333", padding: "7px 12px", borderRadius: "6px", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontFamily: "inherit" }}>
          <ChevronLeft size={14} /> All polls
        </button>
      </header>

      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ background: "white", borderRadius: "12px", border: `1px solid ${colors.border}`, padding: "24px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ fontSize: "20px", fontWeight: 500, margin: "0 0 6px", color: colors.text }}>{poll.title}</h1>
              {poll.description && <p style={{ fontSize: "14px", color: colors.textMuted, margin: "0 0 10px" }}>{poll.description}</p>}
              <div style={{ fontSize: "13px", color: colors.textMuted }}>
                {summarizeDates(poll.dates)} · {isAllDay(poll) ? "All day" : `${formatTime(poll.startHour, 0)} to ${formatTime(poll.endHour, 0)}`} · Organizer TZ: {CANADIAN_TIMEZONES.find(t => t.value === poll.timezone)?.abbr}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={onEdit} style={{ ...secondaryBtn, display: "flex", alignItems: "center", gap: "6px" }}>
                <Pencil size={14} /> Edit
              </button>
              <button onClick={copyLink} style={{ ...secondaryBtn, display: "flex", alignItems: "center", gap: "6px" }}>
                {copied ? <><Check size={14} /> Copied</> : <><Share2 size={14} /> Share link</>}
              </button>
              <button onClick={onDelete} style={{ ...secondaryBtn, display: "flex", alignItems: "center", gap: "6px", color: "#dc2626" }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "24px", marginTop: "20px", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ minWidth: "100px" }}>
              <div style={{ fontSize: "11px", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 500 }}>Responses</div>
              <div style={{ fontSize: "26px", fontWeight: 500, color: colors.text, marginTop: "2px" }}>{responses.length}</div>
            </div>

            {bestSlots[0]?.count > 0 && (
              <div style={{ flex: 1, minWidth: "280px" }}>
                <div style={{ fontSize: "11px", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 500, marginBottom: "8px" }}>
                  Top {Math.min(3, bestSlots.filter(b => b.count > 0).length)} most popular {bestSlots.filter(b => b.count > 0).length === 1 ? "slot" : "slots"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {bestSlots.filter(b => b.count > 0).slice(0, 3).map((b, idx) => {
                    const isDay = isAllDay(poll);
                    const label = isDay
                      ? formatDateLong(b.utc)
                      : (() => {
                          const s = utcToSlot(b.utc, viewTz);
                          return `${formatDate(s.date)} · ${formatTime(s.hour, s.minute)}`;
                        })();
                    const who = responses.filter(r => (r.selectedSlots || []).includes(b.utc)).map(r => r.name);
                    const rankColors = [
                      { bg: "#FEF3C7", text: "#92400E" },   // gold
                      { bg: "#E5E7EB", text: "#374151" },   // silver
                      { bg: "#FED7AA", text: "#9A3412" },   // bronze
                    ];
                    const rc = rankColors[idx] || rankColors[2];
                    return (
                      <div
                        key={String(b.utc)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "8px 12px",
                          background: "#fafafa",
                          border: `1px solid ${colors.border}`,
                          borderRadius: "8px",
                        }}
                      >
                        <div
                          style={{
                            background: rc.bg,
                            color: rc.text,
                            width: "22px",
                            height: "22px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "12px",
                            fontWeight: 500,
                            flexShrink: 0,
                          }}
                        >
                          {idx + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "14px", fontWeight: 500, color: colors.text }}>
                            {label}
                          </div>
                          <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {b.count} of {responses.length} available{who.length > 0 ? ` · ${who.join(", ")}` : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Viewing timezone */}
        {!isAllDay(poll) && (
          <div style={{ background: "white", borderRadius: "12px", border: `1px solid ${colors.border}`, padding: "18px 24px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <Globe size={16} style={{ color: colors.textMuted }} />
            <span style={{ fontSize: "13px", color: colors.textMuted }}>View times in:</span>
            <select value={viewTz} onChange={(e) => setViewTz(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: "13px" }}>
              {CANADIAN_TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </select>
          </div>
        )}

        {/* Heatmap grid */}
        {responses.length === 0 ? (
          <div style={{ background: "white", borderRadius: "12px", border: `1px solid ${colors.border}`, padding: "56px 24px", textAlign: "center" }}>
            <Users size={40} style={{ color: colors.textLight, marginBottom: "12px" }} />
            <h3 style={{ fontSize: "16px", fontWeight: 500, margin: "0 0 4px" }}>Waiting for responses</h3>
            <p style={{ fontSize: "14px", color: colors.textMuted, margin: "0 0 20px" }}>Share the link with your participants to collect availability.</p>
            <div style={{ background: "#f5f5f5", padding: "10px 14px", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "13px", fontFamily: "ui-monospace, monospace", color: colors.text, maxWidth: "100%" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shareLink}</span>
              <button onClick={copyLink} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: "2px" }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        ) : isAllDay(poll) ? (
          /* All-day: date-card grid with counts */
          <div style={{ background: "white", borderRadius: "12px", border: `1px solid ${colors.border}`, padding: "20px", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 500, margin: 0 }}>Availability by day</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: colors.textMuted }}>
                <span>Fewer</span>
                {colors.heatmap.map((c, i) => (
                  <div key={i} style={{ width: "18px", height: "14px", background: c, border: `1px solid ${colors.border}` }} />
                ))}
                <span>More available</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px" }}>
              {poll.dates.map(d => {
                const count = slotCounts[d] || 0;
                return (
                  <div
                    key={d}
                    onMouseEnter={(e) => {
                      if (count === 0) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredSlot({
                        utc: d, // date string for all-day
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                        date: d,
                        hour: null,
                        minute: null,
                      });
                    }}
                    onMouseLeave={() => setHoveredSlot(null)}
                    style={{
                      padding: "14px 12px",
                      background: getHeatColor(count),
                      borderRadius: "10px",
                      border: `1px solid ${colors.border}`,
                      textAlign: "center",
                      cursor: count > 0 ? "help" : "default",
                      outline: hoveredSlot?.utc === d ? `2px solid ${colors.brandBlue}` : "none",
                      outlineOffset: "-1px",
                    }}
                  >
                    <div style={{ fontSize: "11px", fontWeight: 500, color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" }}>
                      {new Date(d + "T00:00:00").toLocaleDateString("en-CA", { weekday: "short" })}
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: 500, color: colors.text, marginBottom: "6px" }}>
                      {new Date(d + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: count > maxCount * 0.5 ? colors.selectedText : colors.text }}>
                      {count > 0 ? `${count} of ${responses.length}` : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ background: "white", borderRadius: "12px", border: `1px solid ${colors.border}`, padding: "20px", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 500, margin: 0 }}>Availability heatmap</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: colors.textMuted }}>
                <span>Fewer</span>
                {colors.heatmap.map((c, i) => (
                  <div key={i} style={{ width: "18px", height: "14px", background: c, border: `1px solid ${colors.border}` }} />
                ))}
                <span>More available</span>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "inline-block", minWidth: "100%" }}>
                {/* Header row: dates */}
                <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${sortedDates.length}, minmax(110px, 1fr))`, gap: "2px", marginBottom: "2px" }}>
                  <div style={{ position: "sticky", left: 0, background: "white", zIndex: 2 }}></div>
                  {sortedDates.map(d => (
                    <div key={d} style={{ padding: "6px 4px", fontSize: "12px", fontWeight: 500, textAlign: "center", color: colors.text, background: "#fafafa", borderRadius: "4px" }}>
                      {formatDate(d)}
                    </div>
                  ))}
                </div>
                {/* Time rows */}
                {(() => {
                  // Build union of time-of-day across all dates (since DST or TZ changes could vary)
                  const timeSet = new Set();
                  sortedDates.forEach(d => {
                    grouped[d].forEach(s => timeSet.add(`${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`));
                  });
                  const times = Array.from(timeSet).sort();
                  return times.map(tkey => {
                    const [hh, mm] = tkey.split(":").map(Number);
                    return (
                      <div key={tkey} style={{ display: "grid", gridTemplateColumns: `80px repeat(${sortedDates.length}, minmax(110px, 1fr))`, gap: "2px", marginBottom: "2px" }}>
                        <div style={{ padding: "4px 6px", fontSize: "11px", color: colors.textMuted, textAlign: "right", fontVariantNumeric: "tabular-nums", position: "sticky", left: 0, background: "white", zIndex: 1 }}>
                          {formatTime(hh, mm)}
                        </div>
                        {sortedDates.map(d => {
                          const slot = grouped[d].find(s => s.hour === hh && s.minute === mm);
                          if (!slot) return <div key={d} style={{ background: "#f5f5f5", borderRadius: "4px" }} />;
                          const count = slotCounts[slot.utc] || 0;
                          return (
                            <div
                              key={d}
                              onMouseEnter={(e) => {
                                if (count === 0) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                setHoveredSlot({
                                  utc: slot.utc,
                                  x: rect.left + rect.width / 2,
                                  y: rect.top,
                                  date: d,
                                  hour: hh,
                                  minute: mm,
                                });
                              }}
                              onMouseLeave={() => setHoveredSlot(null)}
                              style={{
                                padding: "4px 6px",
                                fontSize: "12px",
                                textAlign: "center",
                                background: getHeatColor(count),
                                borderRadius: "4px",
                                fontVariantNumeric: "tabular-nums",
                                color: count > maxCount * 0.5 ? colors.selectedText : colors.text,
                                fontWeight: count > 0 ? 500 : 400,
                                cursor: count > 0 ? "help" : "default",
                                outline: hoveredSlot?.utc === slot.utc ? `2px solid ${colors.brandBlue}` : "none",
                                outlineOffset: "-1px",
                              }}
                            >
                              {count > 0 ? count : "·"}
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Individual responses */}
        {responses.length > 0 && (
          <div style={{ background: "white", borderRadius: "12px", border: `1px solid ${colors.border}`, padding: "20px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 500, margin: "0 0 14px" }}>Individual responses</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {responses.sort((a, b) => b.submittedAt - a.submittedAt).map(r => {
                const tzLabel = CANADIAN_TIMEZONES.find(t => t.value === r.timezone)?.abbr || r.timezone;
                return (
                  <div key={r.id} style={{ border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "12px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 500, color: colors.text }}>{r.name}</div>
                      </div>
                      <div style={{ fontSize: "12px", color: colors.textMuted }}>
                        {(r.selectedSlots || []).length} {isAllDay(poll) ? "days" : "slots"}{isAllDay(poll) ? "" : ` · submitted in ${tzLabel}`} · {new Date(r.submittedAt).toLocaleDateString("en-CA")}
                      </div>
                    </div>
                    {r.note && <div style={{ fontSize: "13px", color: colors.textMuted, marginTop: "6px", fontStyle: "italic" }}>"{r.note}"</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {hoveredSlot && (() => {
        const who = responses
          .filter(r => (r.selectedSlots || []).includes(hoveredSlot.utc))
          .map(r => r.name);
        if (who.length === 0) return null;

        // Position: try above the cell; if too high (near top of viewport), show below instead
        const showBelow = hoveredSlot.y < 160;
        const tooltipStyle = {
          position: "fixed",
          left: hoveredSlot.x,
          top: showBelow ? hoveredSlot.y + 32 : hoveredSlot.y - 12,
          transform: showBelow ? "translateX(-50%)" : "translate(-50%, -100%)",
          background: "#1a1a1a",
          color: "white",
          padding: "10px 12px",
          borderRadius: "8px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          zIndex: 100,
          pointerEvents: "none",
          maxWidth: "280px",
          fontSize: "12px",
          lineHeight: 1.45,
        };
        return (
          <div style={tooltipStyle}>
            <div style={{ fontSize: "11px", color: "#bbb", marginBottom: "4px", fontVariantNumeric: "tabular-nums" }}>
              {hoveredSlot.hour === null
                ? formatDateLong(hoveredSlot.date)
                : `${formatDate(hoveredSlot.date)} · ${formatTime(hoveredSlot.hour, hoveredSlot.minute)}`}
            </div>
            <div style={{ fontSize: "12px", fontWeight: 500, marginBottom: "6px" }}>
              {who.length} available
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {who.map((name, i) => (
                <span
                  key={i}
                  style={{
                    background: "rgba(163, 205, 57, 0.2)",
                    color: "#c7e07a",
                    padding: "2px 8px",
                    borderRadius: "10px",
                    fontSize: "11px",
                    fontWeight: 500,
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// =============== PARTICIPANT VIEW ===============
function ParticipantView({ poll: rawPoll, onSubmit }) {
  const poll = useMemo(() => normalizePoll(rawPoll), [rawPoll]);
  const [step, setStep] = useState("intro"); // intro → select → done
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [viewTz, setViewTz] = useState(poll.timezone); // Default to organizer's TZ
  const [selectedUTCs, setSelectedUTCs] = useState(new Set());
  const [dragging, setDragging] = useState(null); // {mode: 'add'|'remove'}

  const dates = poll.dates;

  // Build available slots (in poll's original TZ) → UTC timestamps
  const allSlots = useMemo(() => {
    if (isAllDay(poll)) return [];
    const result = [];
    for (const dateStr of dates) {
      for (let h = poll.startHour; h < poll.endHour; h++) {
        for (const m of [0, 30]) {
          const utc = slotToUTC(dateStr, h, m, poll.timezone);
          result.push(utc);
        }
      }
    }
    return result;
  }, [poll, dates]);

  // Group by date in participant's viewTz
  const grouped = useMemo(() => {
    const map = {};
    allSlots.forEach(utc => {
      const s = utcToSlot(utc, viewTz);
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push({ utc, hour: s.hour, minute: s.minute });
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => a.utc - b.utc));
    return map;
  }, [allSlots, viewTz]);

  const sortedDates = Object.keys(grouped).sort();

  // Detect touch-only devices. Desktops with a mouse keep drag-to-select;
  // phones and tablets get per-cell tapping (no drag) so scrolling still works
  // and accidental selections don't happen.
  const isTouchDevice = useMemo(() => {
    if (typeof window === "undefined") return false;
    return ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  }, []);

  const toggleSlot = useCallback((utc) => {
    setSelectedUTCs(prev => {
      const next = new Set(prev);
      if (next.has(utc)) next.delete(utc);
      else next.add(utc);
      return next;
    });
  }, []);

  const handleMouseDown = (utc) => {
    if (isTouchDevice) {
      // On touch: a press is just a toggle; no drag-sweep
      toggleSlot(utc);
      return;
    }
    const mode = selectedUTCs.has(utc) ? "remove" : "add";
    setDragging({ mode });
    setSelectedUTCs(prev => {
      const next = new Set(prev);
      if (mode === "add") next.add(utc);
      else next.delete(utc);
      return next;
    });
  };

  const handleMouseEnter = (utc) => {
    if (isTouchDevice) return;
    if (!dragging) return;
    setSelectedUTCs(prev => {
      const next = new Set(prev);
      if (dragging.mode === "add") next.add(utc);
      else next.delete(utc);
      return next;
    });
  };

  useEffect(() => {
    const stop = () => setDragging(null);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchend", stop);
    return () => { window.removeEventListener("mouseup", stop); window.removeEventListener("touchend", stop); };
  }, []);

  const submit = () => {
    if (!name.trim()) return alert("Please enter your name.");
    if (selectedUTCs.size === 0) return alert(isAllDay(poll) ? "Please select at least one day." : "Please select at least one time slot.");
    const response = {
      id: genId(),
      name: name.trim(),
      note: note.trim(),
      timezone: viewTz,
      selectedSlots: Array.from(selectedUTCs),
      submittedAt: Date.now(),
    };
    onSubmit(response);
    setStep("done");
  };

  // --- INTRO SCREEN ---
  if (step === "intro") {
    const tzLabel = CANADIAN_TIMEZONES.find(t => t.value === poll.timezone)?.abbr || "";
    return (
      <div style={{ minHeight: "100vh", background: "#fafafa", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        <header style={{ background: colors.black, padding: "16px 24px", display: "flex", alignItems: "center", gap: "12px" }}>
          <Logo size={36} />
          <div>
            <div style={{ fontSize: "15px", fontWeight: 500, color: "white" }}>{BRAND_NAME}</div>
            <div style={{ fontSize: "12px", color: "#888" }}>{BRAND_TAGLINE}</div>
          </div>
        </header>
        <main style={{ maxWidth: "540px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ background: "white", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "32px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 500, margin: "0 0 8px", color: colors.text }}>{poll.title}</h1>
            <p style={{ fontSize: "14px", color: colors.textMuted, margin: "0 0 16px" }}>You've been invited to share your availability.</p>

            {poll.description && (
              <div style={{ fontSize: "14px", color: colors.text, padding: "12px 14px", background: "#fafafa", borderRadius: "8px", margin: "0 0 20px", border: `1px solid ${colors.border}` }}>
                {poll.description}
              </div>
            )}

            <div style={{ fontSize: "13px", color: colors.textMuted, padding: "12px 0", borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "4px" }}>
                <Calendar size={13} style={{ marginTop: "3px", flexShrink: 0 }} />
                <span>
                  {poll.dates.length <= 4
                    ? poll.dates.map(d => formatDateLong(d)).join(", ")
                    : `${poll.dates.length} dates between ${formatDateLong(poll.dates[0])} and ${formatDateLong(poll.dates[poll.dates.length - 1])}`}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <Clock size={13} /> {isAllDay(poll) ? "All day" : `${formatTime(poll.startHour, 0)} – ${formatTime(poll.endHour, 0)}`}
              </div>
              {!isAllDay(poll) && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Globe size={13} /> Organizer's time zone: {tzLabel}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Your name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus style={inputStyle} placeholder="Alex Smith" />
              </div>
              {!isAllDay(poll) && (
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Your time zone</label>
                  <select value={viewTz} onChange={(e) => setViewTz(e.target.value)} style={inputStyle}>
                    {CANADIAN_TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                  <p style={{ fontSize: "12px", color: colors.textMuted, margin: "6px 0 0" }}>
                    Defaulted to the organizer's zone. You can change it — times will convert automatically.
                  </p>
                </div>
              )}
              <button onClick={() => { if (!name.trim()) return alert("Please enter your name."); setStep("select"); }} style={{ ...primaryBtn, marginTop: "8px" }}>
                Continue to calendar
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- DONE SCREEN ---
  if (step === "done") {
    return (
      <div style={{ minHeight: "100vh", background: "#fafafa", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        <header style={{ background: colors.black, padding: "16px 24px", display: "flex", alignItems: "center", gap: "12px" }}>
          <Logo size={36} />
          <div>
            <div style={{ fontSize: "15px", fontWeight: 500, color: "white" }}>{BRAND_NAME}</div>
            <div style={{ fontSize: "12px", color: "#888" }}>{BRAND_TAGLINE}</div>
          </div>
        </header>
        <main style={{ maxWidth: "480px", margin: "0 auto", padding: "64px 24px", textAlign: "center" }}>
          <div style={{ background: "white", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "40px 28px" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#E6F7EC", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
              <Check size={28} style={{ color: colors.selectedText }} />
            </div>
            <h1 style={{ fontSize: "20px", fontWeight: 500, margin: "0 0 8px", color: colors.text }}>Thanks, {name.split(" ")[0]}!</h1>
            <p style={{ fontSize: "14px", color: colors.textMuted, margin: "0 0 4px" }}>Your availability has been recorded for</p>
            <p style={{ fontSize: "15px", fontWeight: 500, color: colors.text, margin: "0 0 20px" }}>{poll.title}</p>
            <p style={{ fontSize: "13px", color: colors.textMuted, margin: 0 }}>The organizer will be in touch with the confirmed time. You can close this tab.</p>
          </div>
        </main>
      </div>
    );
  }

  // --- CALENDAR SELECTION ---
  const tzLabel = CANADIAN_TIMEZONES.find(t => t.value === viewTz)?.abbr || "";
  const timeSet = new Set();
  sortedDates.forEach(d => grouped[d].forEach(s => timeSet.add(`${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`)));
  const times = Array.from(timeSet).sort();

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", fontFamily: "ui-sans-serif, system-ui, sans-serif", userSelect: dragging ? "none" : "auto" }}>
      <header style={{ background: colors.black, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Logo size={36} />
          <div>
            <div style={{ fontSize: "15px", fontWeight: 500, color: "white" }}>{BRAND_NAME}</div>
            <div style={{ fontSize: "12px", color: "#888" }}>{poll.title}</div>
          </div>
        </div>
        <button onClick={() => setStep("intro")} style={{ background: "transparent", color: "white", border: "1px solid #333", padding: "7px 12px", borderRadius: "6px", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontFamily: "inherit" }}>
          <ChevronLeft size={14} /> Back
        </button>
      </header>

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px 24px 120px" }}>
        <div style={{ background: "white", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "16px 20px", marginBottom: "16px", display: "flex", flexWrap: "wrap", gap: "12px 20px", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 500, margin: "0 0 4px", color: colors.text }}>
              {isAllDay(poll) ? "Select the days you're available" : "Select all times you're available"}
            </h2>
            <p style={{ fontSize: "13px", color: colors.textMuted, margin: 0 }}>
              {isAllDay(poll)
                ? "Tap any day to toggle. Green = available."
                : poll.meetingLength === "30min"
                ? (isTouchDevice ? "Tap each slot to select. Green = available." : "Click or drag to select. Green = available.")
                : `This meeting is ${poll.meetingLength === "1hr" ? "1 hour" : "2 hours"} — please pick ${poll.meetingLength === "1hr" ? "at least 2 consecutive" : "at least 4 consecutive"} slots where you're free.`}
            </p>
          </div>
          {!isAllDay(poll) && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Globe size={14} style={{ color: colors.textMuted }} />
              <select value={viewTz} onChange={(e) => setViewTz(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: "13px" }}>
                {CANADIAN_TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "14px", fontSize: "12px", color: colors.textMuted, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "16px", height: "16px", background: colors.available, border: `1px solid ${colors.availableBorder}`, borderRadius: "3px" }}></span>
            Available to pick
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "16px", height: "16px", background: colors.selected, borderRadius: "3px" }}></span>
            Your selection
          </span>
          <span style={{ marginLeft: "auto", fontWeight: 500, color: colors.text }}>
            {selectedUTCs.size} {isAllDay(poll)
              ? (selectedUTCs.size === 1 ? "day" : "days")
              : (selectedUTCs.size === 1 ? "slot" : "slots")} selected
          </span>
        </div>

        {isAllDay(poll) ? (
          /* All-day: grid of date cards */
          <div style={{ background: "white", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px" }}>
              {poll.dates.map(d => {
                const isSel = selectedUTCs.has(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setSelectedUTCs(prev => {
                        const next = new Set(prev);
                        if (next.has(d)) next.delete(d);
                        else next.add(d);
                        return next;
                      });
                    }}
                    style={{
                      padding: "16px 12px",
                      background: isSel ? colors.selected : colors.available,
                      border: `1px solid ${isSel ? colors.brandGreen : colors.availableBorder}`,
                      borderRadius: "10px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "center",
                      transition: "transform 0.05s",
                    }}
                  >
                    <div style={{ fontSize: "11px", fontWeight: 500, color: isSel ? colors.selectedText : colors.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                      {new Date(d + "T00:00:00").toLocaleDateString("en-CA", { weekday: "short" })}
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: 500, color: isSel ? colors.selectedText : colors.text }}>
                      {new Date(d + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Time-based: the original grid */
          <div style={{ background: "white", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "16px", overflowX: "auto" }}>
            <div style={{ display: "inline-block", minWidth: "100%" }}>
              {/* Header: dates */}
              <div style={{ display: "grid", gridTemplateColumns: `72px repeat(${sortedDates.length}, minmax(90px, 1fr))`, gap: "3px", marginBottom: "3px", position: "sticky", top: 0, background: "white", zIndex: 3 }}>
                <div style={{ fontSize: "11px", color: colors.textMuted, padding: "6px 4px", textAlign: "right", position: "sticky", left: 0, background: "white", zIndex: 4 }}>{tzLabel}</div>
                {sortedDates.map(d => (
                  <div key={d} style={{ padding: "8px 4px", fontSize: "12px", fontWeight: 500, textAlign: "center", color: colors.text, background: "#fafafa", borderRadius: "6px" }}>
                    {formatDate(d)}
                  </div>
                ))}
              </div>

              {/* Time rows */}
              {times.map(tkey => {
                const [hh, mm] = tkey.split(":").map(Number);
                return (
                  <div key={tkey} style={{ display: "grid", gridTemplateColumns: `72px repeat(${sortedDates.length}, minmax(90px, 1fr))`, gap: "3px", marginBottom: "3px" }}>
                    <div style={{ padding: "4px 6px", fontSize: "11px", color: colors.textMuted, textAlign: "right", fontVariantNumeric: "tabular-nums", alignSelf: "center", position: "sticky", left: 0, background: "white", zIndex: 2 }}>
                      {mm === 0 && formatTime(hh, mm)}
                    </div>
                    {sortedDates.map(d => {
                      const slot = grouped[d].find(s => s.hour === hh && s.minute === mm);
                      if (!slot) return <div key={d} style={{ background: "#f5f5f5", borderRadius: "4px", minHeight: "28px" }} />;
                      const isSelected = selectedUTCs.has(slot.utc);
                      return (
                        <div
                          key={d}
                          onClick={isTouchDevice ? () => toggleSlot(slot.utc) : undefined}
                          onMouseDown={!isTouchDevice ? () => handleMouseDown(slot.utc) : undefined}
                          onMouseEnter={!isTouchDevice ? () => handleMouseEnter(slot.utc) : undefined}
                          style={{
                            minHeight: isTouchDevice ? "36px" : "28px",
                            background: isSelected ? colors.selected : colors.available,
                            border: isSelected ? `1px solid ${colors.brandGreen}` : `1px solid ${colors.availableBorder}`,
                            borderRadius: "4px",
                            cursor: "pointer",
                            touchAction: "manipulation",
                          }}
                          title={`${formatDate(d)} ${formatTime(hh, mm)} ${tzLabel}`}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Optional note */}
        <div style={{ marginTop: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Note to organizer (optional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. I prefer mornings if possible" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
        </div>
      </main>

      {/* Sticky submit bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: `1px solid ${colors.border}`, padding: "14px 24px", boxShadow: "0 -2px 12px rgba(0,0,0,0.04)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "14px", color: colors.text }}>
            <strong style={{ fontWeight: 500 }}>{selectedUTCs.size}</strong> <span style={{ color: colors.textMuted }}>{isAllDay(poll)
              ? (selectedUTCs.size === 1 ? "day selected" : "days selected")
              : `${selectedUTCs.size === 1 ? "slot" : "slots"} selected in ${tzLabel}`}</span>
          </div>
          <button onClick={submit} disabled={selectedUTCs.size === 0} style={{ ...primaryBtn, opacity: selectedUTCs.size === 0 ? 0.5 : 1, cursor: selectedUTCs.size === 0 ? "not-allowed" : "pointer" }}>
            Submit availability
          </button>
        </div>
      </div>
    </div>
  );
}

// =============== POLL NOT FOUND ===============
function PollNotFound() {
  return (
    <div style={{ minHeight: "100vh", background: colors.black, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ background: "white", borderRadius: "12px", padding: "40px", maxWidth: "400px", width: "100%", textAlign: "center" }}>
        <Logo size={56} />
        <h1 style={{ fontSize: "18px", fontWeight: 500, margin: "20px 0 6px" }}>Meeting link not found</h1>
        <p style={{ fontSize: "14px", color: colors.textMuted, margin: 0 }}>This meeting link is invalid or has been deleted. Please ask the organizer for a new link.</p>
      </div>
    </div>
  );
}

// =============== SHARED STYLES ===============
const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  fontSize: "14px",
  border: `1px solid ${colors.border}`,
  borderRadius: "8px",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  background: "white",
  color: colors.text,
};

const primaryBtn = {
  background: colors.brandBlue,
  color: "white",
  padding: "9px 16px",
  border: "none",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

const secondaryBtn = {
  background: "white",
  color: colors.text,
  padding: "8px 14px",
  border: `1px solid ${colors.border}`,
  borderRadius: "8px",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

// =============== ROOT APP ===============
export default function App() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [polls, setPolls] = useState({});
  const [participantPoll, setParticipantPoll] = useState(undefined); // undefined=loading, null=not found, object=found
  const [openPollId, setOpenPollId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editPollId, setEditPollId] = useState(null);
  const [participantPollId, setParticipantPollId] = useState(null);
  const [loadError, setLoadError] = useState("");

  // Initial load
  useEffect(() => {
    (async () => {
      const token = getPollTokenFromUrl();
      if (token) {
        // Participant flow — load just this one poll from the database
        setParticipantPollId(token);
        try {
          const p = await db.getPoll(token);
          setParticipantPoll(p || null);
        } catch (e) {
          console.error(e);
          setParticipantPoll(null);
        }
        setLoading(false);
      } else {
        // Admin flow — check for an active Supabase auth session
        try {
          const user = await auth.getCurrentUser();
          if (user) {
            setIsAdmin(true);
            const loaded = await db.getAllPolls();
            setPolls(loaded);
          }
        } catch (e) {
          console.error(e);
        }
        setLoading(false);
      }
    })();

    // React to hash changes (participant clicks a new link in-app)
    const onHashChange = async () => {
      const token = getPollTokenFromUrl();
      setParticipantPollId(token);
      if (token) {
        setParticipantPoll(undefined);
        try {
          const p = await db.getPoll(token);
          setParticipantPoll(p || null);
        } catch {
          setParticipantPoll(null);
        }
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Reload all polls (called after admin actions)
  const reloadPolls = async () => {
    try {
      const loaded = await db.getAllPolls();
      setPolls(loaded);
    } catch (e) {
      setLoadError(e?.message || "Failed to load polls");
    }
  };

  const handleSavePoll = async (poll) => {
    const isNew = !polls[poll.id];
    try {
      if (isNew) {
        await db.createPoll(poll);
      } else {
        await db.updatePoll(poll);
        // Rewrite responses (they may have been filtered by the edit)
        await db.replaceResponses(poll.id, poll.responses || {});
      }
      await reloadPolls();
      setShowCreate(false);
      setEditPollId(null);
      if (isNew) setOpenPollId(poll.id);
    } catch (e) {
      alert("Could not save: " + (e?.message || "unknown error"));
    }
  };

  const handleDeletePoll = async (pollId) => {
    try {
      await db.deletePoll(pollId);
      const next = { ...polls };
      delete next[pollId];
      setPolls(next);
      if (openPollId === pollId) setOpenPollId(null);
    } catch (e) {
      alert("Could not delete: " + (e?.message || "unknown error"));
    }
  };

  const handleParticipantSubmit = async (response) => {
    if (!participantPollId) return;
    try {
      await db.submitResponse(participantPollId, response);
    } catch (e) {
      alert("Could not submit: " + (e?.message || "unknown error"));
      throw e;
    }
  };

  const handleLogin = async () => {
    setIsAdmin(true);
    setLoading(true);
    await reloadPolls();
    setLoading(false);
  };

  const handleLogout = async () => {
    await auth.signOut();
    setIsAdmin(false);
    setOpenPollId(null);
    setPolls({});
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: colors.black, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Logo size={48} />
      </div>
    );
  }

  // PARTICIPANT FLOW — no admin data leaks here, they only see their one poll
  if (participantPollId) {
    if (participantPoll === undefined) {
      return (
        <div style={{ minHeight: "100vh", background: colors.black, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Logo size={48} />
        </div>
      );
    }
    if (!participantPoll) return <PollNotFound />;
    return <ParticipantView poll={participantPoll} onSubmit={handleParticipantSubmit} />;
  }

  // ADMIN FLOW — must log in before seeing anything
  if (!isAdmin) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  // Admin: poll detail view
  if (openPollId && polls[openPollId]) {
    return (
      <>
        <AdminPollDetail
          poll={polls[openPollId]}
          onBack={() => setOpenPollId(null)}
          onDelete={() => {
            if (confirm(`Delete poll "${polls[openPollId].title}"? This cannot be undone.`)) {
              handleDeletePoll(openPollId);
            }
          }}
          onEdit={() => setEditPollId(openPollId)}
        />
        {editPollId && polls[editPollId] && (
          <PollFormModal
            existingPoll={polls[editPollId]}
            onClose={() => setEditPollId(null)}
            onSave={handleSavePoll}
          />
        )}
      </>
    );
  }

  // Admin: dashboard
  return (
    <>
      <AdminDashboard
        polls={polls}
        onCreateNew={() => setShowCreate(true)}
        onOpenPoll={setOpenPollId}
        onLogout={handleLogout}
        onDeletePoll={handleDeletePoll}
        onEditPoll={setEditPollId}
        onRefresh={reloadPolls}
      />
      {showCreate && <PollFormModal onClose={() => setShowCreate(false)} onSave={handleSavePoll} />}
      {editPollId && polls[editPollId] && (
        <PollFormModal
          existingPoll={polls[editPollId]}
          onClose={() => setEditPollId(null)}
          onSave={handleSavePoll}
        />
      )}
    </>
  );
}
