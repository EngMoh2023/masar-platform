import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";

/* ============================================================
   مسار — منصة توظيف شاملة (شركات + باحثون عن عمل)
   مبنية على Supabase (مصادقة حقيقية + قاعدة بيانات Postgres)
   ============================================================ */

const C = {
  ink: "#14192B",
  paper: "#EAEBE1",
  paperDark: "#DEDFD2",
  card: "#F6F5EE",
  brass: "#B3862F",
  brassDark: "#8C6A24",
  green: "#35664B",
  red: "#A23E32",
  amber: "#8C6A24",
  amberBg: "#F0E6CD",
  textInk: "#1C2030",
  textMuted: "#5B5F55",
  line: "#C9C9B8",
};

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
};

/* ---------------- Stamp: العنصر البصري المميّز ---------------- */
function Stamp({ text, color = C.brass, size = "md", filled = false }) {
  const pad = size === "sm" ? "3px 12px" : size === "lg" ? "8px 22px" : "5px 16px";
  const fs = size === "sm" ? "0.72rem" : size === "lg" ? "1rem" : "0.82rem";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: `2px dashed ${color}`,
        borderRadius: 999,
        padding: pad,
        color: filled ? "#fff" : color,
        background: filled ? color : "transparent",
        fontWeight: 600,
        fontSize: fs,
        transform: "rotate(-3deg)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function Logo({ dark }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: `2px dashed ${C.brass}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: "rotate(-6deg)",
          flexShrink: 0,
        }}
      >
        <span className="f-display" style={{ color: C.brass, fontSize: 18, transform: "rotate(6deg)" }}>م</span>
      </div>
      <span className="f-display" style={{ fontSize: 26, color: dark ? "#fff" : C.ink }}>مسار</span>
    </div>
  );
}

/* ============================================================ */

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [apps, setApps] = useState([]);
  const [view, setView] = useState("landing"); // landing | auth | dashboard
  const [authMode, setAuthMode] = useState("login");
  const [authRole, setAuthRole] = useState("company");
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  const flash = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadJobs = useCallback(async () => {
    const { data, error } = await supabase.from("jobs").select("*").order("posted_at", { ascending: false });
    if (!error) setJobs(data || []);
  }, []);

  const loadApplications = useCallback(async (prof) => {
    if (!prof) return;
    const col = prof.role === "company" ? "company_id" : "candidate_id";
    const { data, error } = await supabase.from("applications").select("*").eq(col, prof.id).order("applied_at", { ascending: false });
    if (!error) setApps(data || []);
  }, []);

  const loadProfile = useCallback(async (userId) => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (!error && data) {
      setProfile(data);
      setView("dashboard");
      await loadApplications(data);
    }
  }, [loadApplications]);

  useEffect(() => {
    (async () => {
      await loadJobs();
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (!sess) {
        setProfile(null);
        setView("landing");
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignup = async (form) => {
    setSaving(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });
    if (error) {
      setSaving(false);
      flash(error.message || "تعذّر إنشاء الحساب", "err");
      return;
    }
    const userId = data.user?.id;
    if (!userId) {
      setSaving(false);
      flash("تعذّر إنشاء الحساب، حاول مجدداً", "err");
      return;
    }
    const { error: profErr } = await supabase.from("profiles").insert({
      id: userId,
      role: form.role,
      name: form.name,
      company: form.role === "company" ? form.company || form.name : null,
      phone: form.phone || null,
    });
    setSaving(false);
    if (profErr) {
      flash(profErr.message || "تعذّر حفظ بيانات الحساب", "err");
      return;
    }
    if (!data.session) {
      // تفعيل البريد الإلكتروني مفعّل في إعدادات Supabase
      setPendingConfirm(true);
      flash("تم إنشاء الحساب! تحقّق من بريدك الإلكتروني لتأكيده قبل الدخول");
      return;
    }
    await loadProfile(userId);
    flash("تم إنشاء الحساب بنجاح، أهلاً بك في مسار");
  };

  const handleLogin = async (email, password) => {
    setSaving(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setSaving(false);
    if (error) {
      flash("البريد الإلكتروني أو كلمة المرور غير صحيحة", "err");
      return;
    }
    await loadProfile(data.user.id);
    flash("مرحباً بعودتك");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setApps([]);
    setView("landing");
  };

  const persistJobsRefresh = async () => {
    setSaving(true);
    await loadJobs();
    if (profile) await loadApplications(profile);
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px dashed ${C.brass}`, borderTopColor: "transparent", animation: "spin 1.2s linear infinite", margin: "0 auto 14px" }} />
          <p style={{ color: "#fff", opacity: 0.7 }}>جارٍ فتح السجلّات...</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: C.paper, color: C.textInk }}>
      {toast && (
        <div style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 100, background: toast.type === "err" ? C.red : C.ink, color: "#fff", padding: "10px 22px", borderRadius: 999, fontSize: "0.9rem", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
          {toast.msg}
        </div>
      )}
      {view === "landing" && (
        <Landing
          onStart={(role) => { setAuthRole(role); setAuthMode("signup"); setPendingConfirm(false); setView("auth"); }}
          onLogin={() => { setAuthMode("login"); setPendingConfirm(false); setView("auth"); }}
          jobsCount={jobs.filter((j) => j.status === "open").length}
        />
      )}
      {view === "auth" && (
        <AuthPage
          mode={authMode}
          setMode={setAuthMode}
          role={authRole}
          setRole={setAuthRole}
          onSignup={handleSignup}
          onLogin={handleLogin}
          onBack={() => setView("landing")}
          pendingConfirm={pendingConfirm}
          saving={saving}
        />
      )}
      {view === "dashboard" && profile && profile.role === "company" && (
        <CompanyDashboard user={profile} jobs={jobs} apps={apps} refresh={persistJobsRefresh} onLogout={handleLogout} saving={saving} setSaving={setSaving} flash={flash} />
      )}
      {view === "dashboard" && profile && profile.role === "candidate" && (
        <CandidateDashboard user={profile} jobs={jobs} apps={apps} refresh={persistJobsRefresh} onLogout={handleLogout} saving={saving} setSaving={setSaving} flash={flash} />
      )}
    </div>
  );
}

/* ============================== Landing ============================== */
function Landing({ onStart, onLogin, jobsCount }) {
  return (
    <div>
      <header style={{ background: C.ink }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Logo dark />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onLogin} style={btnGhostDark}>تسجيل الدخول</button>
            <button onClick={() => onStart("company")} style={btnBrass}>ابدأ التوظيف</button>
          </div>
        </div>
      </header>

      <section style={{ background: C.ink, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: -60, top: -60, width: 260, height: 260, borderRadius: "50%", border: "2px dashed rgba(179,134,47,0.35)" }} />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "70px 24px 90px", display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 40, alignItems: "center" }}>
          <div>
            <Stamp text="موثّق بالكامل" color={C.brass} />
            <h1 className="f-display" style={{ color: "#fff", fontSize: "3.2rem", lineHeight: 1.25, margin: "18px 0 16px" }}>
              التوظيف حين يُختم بالثقة
            </h1>
            <p style={{ color: "rgba(255,255,255,0.72)", fontSize: "1.05rem", lineHeight: 2, maxWidth: 480 }}>
              منصّة واحدة تجمع الشركات الباحثة عن كفاءات، والباحثين عن فرصهم القادمة.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 30, flexWrap: "wrap" }}>
              <button onClick={() => onStart("company")} style={btnBrass}>سجّل كشركة</button>
              <button onClick={() => onStart("candidate")} style={btnGhostDark}>سجّل كباحث عن عمل</button>
            </div>
            <div style={{ marginTop: 42 }}>
              <div className="f-display" style={{ color: C.brass, fontSize: "2.2rem" }}>{jobsCount}</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.82rem" }}>وظيفة مفتوحة الآن</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ width: 280, height: 280, borderRadius: "50%", border: `3px dashed ${C.brass}`, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-6deg)", background: "rgba(179,134,47,0.06)" }}>
              <div style={{ textAlign: "center", transform: "rotate(6deg)" }}>
                <div className="f-display" style={{ fontSize: 64, color: C.brass }}>مسار</div>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.85rem", marginTop: 6 }}>منصة توظيف موثّقة</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "70px 24px" }}>
        <h2 className="f-display" style={{ fontSize: "2rem", marginBottom: 34 }}>كيف يعمل مسار</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22 }}>
          <FeatureCard stamp="للشركات" color={C.brass} title="انشر وظائفك بدقّة" desc="أضف تفاصيل الوظيفة وتابع المتقدمين في لوحة تحكم واحدة." />
          <FeatureCard stamp="للباحثين" color={C.green} title="تقدّم بضغطة واحدة" desc="تصفّح الوظائف، صفِّها، وتابع حالة كل طلب لحظة بلحظة." />
          <FeatureCard stamp="الثقة أولاً" color={C.ink} title="سجلّ موثّق للجميع" desc="بيانات محفوظة فعليًا في قاعدة بيانات آمنة، بلا فوضى." />
        </div>
      </section>

      <footer style={{ background: C.ink, padding: "26px 24px", textAlign: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}>مسار — منصة توظيف.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ stamp, color, title, desc }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 26 }}>
      <Stamp text={stamp} color={color} size="sm" />
      <h3 className="f-display" style={{ fontSize: "1.4rem", margin: "16px 0 10px" }}>{title}</h3>
      <p style={{ color: C.textMuted, lineHeight: 1.9, fontSize: "0.92rem" }}>{desc}</p>
    </div>
  );
}

/* ============================== Auth ============================== */
function AuthPage({ mode, setMode, role, setRole, onSignup, onLogin, onBack, pendingConfirm, saving }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", company: "", phone: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (mode === "signup") {
      if (!form.name || !form.email || !form.password) return;
      onSignup({ role, name: form.name, email: form.email, password: form.password, phone: form.phone, company: form.company });
    } else {
      onLogin(form.email, form.password);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ marginBottom: 24, display: "flex", justifyContent: "center" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <Logo dark />
          </button>
        </div>
        <div style={{ background: C.card, borderRadius: 16, padding: 30, border: `1px solid ${C.line}` }}>
          {pendingConfirm ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <Stamp text="بانتظار التأكيد" color={C.amber} />
              <p style={{ marginTop: 16, color: C.textMuted, lineHeight: 1.9 }}>
                أرسلنا رابط تأكيد إلى بريدك الإلكتروني. افتح الرابط ثم عد إلى هنا وسجّل الدخول.
              </p>
              <button onClick={() => setMode("login")} style={{ ...btnOutline, marginTop: 16 }}>الذهاب لتسجيل الدخول</button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 22, background: C.paperDark, borderRadius: 999, padding: 4 }}>
                <TabBtn active={mode === "login"} onClick={() => setMode("login")}>تسجيل الدخول</TabBtn>
                <TabBtn active={mode === "signup"} onClick={() => setMode("signup")}>حساب جديد</TabBtn>
              </div>

              {mode === "signup" && (
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <RoleBtn active={role === "company"} onClick={() => setRole("company")} label="شركة" />
                  <RoleBtn active={role === "candidate"} onClick={() => setRole("candidate")} label="باحث عن عمل" />
                </div>
              )}

              <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {mode === "signup" && <Field label={role === "company" ? "اسم المسؤول" : "الاسم الكامل"} value={form.name} onChange={set("name")} required />}
                {mode === "signup" && role === "company" && <Field label="اسم الشركة" value={form.company} onChange={set("company")} />}
                <Field label="البريد الإلكتروني" type="email" value={form.email} onChange={set("email")} required />
                <Field label="كلمة المرور" type="password" value={form.password} onChange={set("password")} required />
                {mode === "signup" && <Field label="رقم الجوال (اختياري)" value={form.phone} onChange={set("phone")} />}
                <button type="submit" disabled={saving} style={{ ...btnBrass, marginTop: 8, justifyContent: "center", opacity: saving ? 0.7 : 1 }}>
                  {saving ? "جارٍ التنفيذ..." : mode === "signup" ? "إنشاء الحساب" : "دخول"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, children, onClick }) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: "9px 0", borderRadius: 999, border: "none", cursor: "pointer", background: active ? C.ink : "transparent", color: active ? "#fff" : C.textMuted, fontWeight: 600, fontSize: "0.88rem" }}>
      {children}
    </button>
  );
}
function RoleBtn({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer", border: `2px dashed ${active ? C.brass : C.line}`, background: active ? C.amberBg : "transparent", color: active ? C.brassDark : C.textMuted, fontWeight: 600, fontSize: "0.85rem" }}>
      {label}
    </button>
  );
}
function Field({ label, type = "text", value, onChange, required }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.85rem", color: C.textMuted }}>
      {label}
      <input type={type} value={value} onChange={onChange} required={required} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: "0.95rem", background: "#fff", color: C.textInk }} />
    </label>
  );
}

const btnBrass = { background: C.brass, color: "#fff", border: "none", borderRadius: 999, padding: "11px 22px", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", display: "inline-flex", alignItems: "center" };
const btnGhostDark = { background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 999, padding: "10px 20px", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer" };
const btnOutline = { background: "transparent", color: C.ink, border: `1px solid ${C.line}`, borderRadius: 999, padding: "9px 18px", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" };

/* ============================== Top bar ============================== */
function TopBar({ user, onLogout, saving }) {
  return (
    <div style={{ background: C.ink, padding: "16px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Logo dark />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {saving && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.78rem" }}>جارٍ الحفظ...</span>}
          <Stamp text={user.role === "company" ? "حساب شركة" : "باحث عن عمل"} color={C.brass} size="sm" />
          <span style={{ color: "#fff", fontSize: "0.88rem" }}>{user.name}</span>
          <button onClick={onLogout} style={btnGhostDark}>تسجيل الخروج</button>
        </div>
      </div>
    </div>
  );
}

/* ============================== Company Dashboard ============================== */
function CompanyDashboard({ user, jobs, apps, refresh, onLogout, saving, setSaving, flash }) {
  const [tab, setTab] = useState("jobs");
  const [editingJob, setEditingJob] = useState(null);
  const myJobs = useMemo(() => jobs.filter((j) => j.company_id === user.id), [jobs, user.id]);
  const myApps = apps; // already scoped to company via query

  const saveJob = async (job) => {
    setSaving(true);
    if (job.id) {
      const { error } = await supabase.from("jobs").update({
        title: job.title, location: job.location, job_type: job.jobType,
        salary: job.salary, description: job.description, requirements: job.requirements,
      }).eq("id", job.id);
      if (error) flash(error.message, "err");
    } else {
      const { error } = await supabase.from("jobs").insert({
        company_id: user.id, company_name: user.company || user.name,
        title: job.title, location: job.location, job_type: job.jobType,
        salary: job.salary, description: job.description, requirements: job.requirements,
        status: "open",
      });
      if (error) flash(error.message, "err");
    }
    await refresh();
    setEditingJob(null);
    setTab("jobs");
  };

  const toggleJobStatus = async (job) => {
    setSaving(true);
    await supabase.from("jobs").update({ status: job.status === "open" ? "closed" : "open" }).eq("id", job.id);
    await refresh();
  };

  const deleteJob = async (job) => {
    setSaving(true);
    await supabase.from("jobs").delete().eq("id", job.id);
    await refresh();
  };

  const updateAppStatus = async (appId, status) => {
    setSaving(true);
    await supabase.from("applications").update({ status }).eq("id", appId);
    await refresh();
  };

  return (
    <div>
      <TopBar user={user} onLogout={onLogout} saving={saving} />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "30px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26, flexWrap: "wrap", gap: 12 }}>
          <h1 className="f-display" style={{ fontSize: "2rem" }}>لوحة {user.company || user.name}</h1>
          <div style={{ display: "flex", gap: 10 }}>
            <TabPill active={tab === "jobs"} onClick={() => setTab("jobs")} label="وظائفي" count={myJobs.length} />
            <TabPill active={tab === "applicants"} onClick={() => setTab("applicants")} label="المتقدمون" count={myApps.length} />
            <button onClick={() => { setEditingJob({}); setTab("new"); }} style={btnBrass}>+ وظيفة جديدة</button>
          </div>
        </div>

        {tab === "jobs" && <JobsList jobs={myJobs} onEdit={(j) => { setEditingJob(j); setTab("new"); }} onToggle={toggleJobStatus} onDelete={deleteJob} apps={apps} />}
        {tab === "new" && <JobForm initial={editingJob} onCancel={() => setTab("jobs")} onSave={saveJob} />}
        {tab === "applicants" && <ApplicantsPanel myJobs={myJobs} apps={myApps} onUpdate={updateAppStatus} />}
      </div>
    </div>
  );
}

function TabPill({ active, onClick, label, count }) {
  return (
    <button onClick={onClick} style={{ border: `1px solid ${active ? C.ink : C.line}`, background: active ? C.ink : "#fff", color: active ? "#fff" : C.textInk, borderRadius: 999, padding: "9px 18px", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}>
      {label} {typeof count === "number" && <span style={{ opacity: 0.7 }}>({count})</span>}
    </button>
  );
}

function JobsList({ jobs, onEdit, onToggle, onDelete, apps }) {
  if (jobs.length === 0) return <EmptyState title="لا وظائف بعد" desc="انشر وظيفتك الأولى ليبدأ الباحثون بالتقدّم إليها." />;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {jobs.map((j) => {
        const count = apps.filter((a) => a.job_id === j.id).length;
        return (
          <div key={j.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                <h3 className="f-display" style={{ fontSize: "1.3rem" }}>{j.title}</h3>
                <Stamp text={j.status === "open" ? "مفتوحة" : "مغلقة"} color={j.status === "open" ? C.green : C.textMuted} size="sm" />
              </div>
              <p style={{ color: C.textMuted, fontSize: "0.88rem", marginBottom: 6 }}>{j.location} · {j.job_type} · {j.salary || "الراتب حسب الاتفاق"}</p>
              <p style={{ fontSize: "0.88rem", lineHeight: 1.8, maxWidth: 560 }}>{j.description}</p>
              <p style={{ color: C.textMuted, fontSize: "0.78rem", marginTop: 10 }}>{count} متقدّم · نُشرت في {fmtDate(j.posted_at)}</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <button onClick={() => onEdit({ ...j, jobType: j.job_type })} style={btnOutline}>تعديل</button>
              <button onClick={() => onToggle(j)} style={btnOutline}>{j.status === "open" ? "إغلاق" : "إعادة فتح"}</button>
              <button onClick={() => onDelete(j)} style={{ ...btnOutline, borderColor: C.red, color: C.red }}>حذف</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JobForm({ initial, onCancel, onSave }) {
  const [f, setF] = useState({
    title: initial?.title || "", location: initial?.location || "",
    jobType: initial?.jobType || "دوام كامل", salary: initial?.salary || "",
    description: initial?.description || "", requirements: initial?.requirements || "",
    id: initial?.id,
  });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 28, maxWidth: 640 }}>
      <h2 className="f-display" style={{ fontSize: "1.6rem", marginBottom: 20 }}>{initial?.id ? "تعديل الوظيفة" : "وظيفة جديدة"}</h2>
      <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="المسمّى الوظيفي" value={f.title} onChange={set("title")} required />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="الموقع / المدينة" value={f.location} onChange={set("location")} required />
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.85rem", color: C.textMuted }}>
            نوع الدوام
            <select value={f.jobType} onChange={set("jobType")} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", background: "#fff" }}>
              <option>دوام كامل</option><option>دوام جزئي</option><option>عن بعد</option><option>تدريب</option><option>عقد مؤقت</option>
            </select>
          </label>
        </div>
        <Field label="الراتب (اختياري)" value={f.salary} onChange={set("salary")} />
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.85rem", color: C.textMuted }}>
          وصف الوظيفة
          <textarea value={f.description} onChange={set("description")} required rows={4} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", resize: "vertical" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.85rem", color: C.textMuted }}>
          المتطلبات (اختياري)
          <textarea value={f.requirements} onChange={set("requirements")} rows={3} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", resize: "vertical" }} />
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button type="submit" style={btnBrass}>{initial?.id ? "حفظ التعديلات" : "نشر الوظيفة"}</button>
          <button type="button" onClick={onCancel} style={btnOutline}>إلغاء</button>
        </div>
      </form>
    </div>
  );
}

const STATUS_COLORS = { "قيد المراجعة": C.amber, "مقابلة": C.brass, "مقبول": C.green, "مرفوض": C.red };

function ApplicantsPanel({ myJobs, apps, onUpdate }) {
  if (apps.length === 0) return <EmptyState title="لا طلبات بعد" desc="عندما يتقدّم أحد للوظائف المنشورة، ستظهر طلباته هنا." />;
  const byJob = {};
  apps.forEach((a) => { byJob[a.job_id] = byJob[a.job_id] || []; byJob[a.job_id].push(a); });
  return (
    <div style={{ display: "grid", gap: 22 }}>
      {Object.entries(byJob).map(([jobId, list]) => {
        const job = myJobs.find((j) => j.id === jobId);
        return (
          <div key={jobId}>
            <h3 className="f-display" style={{ fontSize: "1.25rem", marginBottom: 10 }}>{job?.title || list[0]?.job_title || "وظيفة"}</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {list.map((a) => (
                <div key={a.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{a.candidate_name}</p>
                    <p style={{ color: C.textMuted, fontSize: "0.82rem", marginTop: 2 }}>تقدّم في {fmtDate(a.applied_at)}</p>
                    {a.note && <p style={{ fontSize: "0.85rem", marginTop: 6, maxWidth: 460 }}>{a.note}</p>}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Stamp text={a.status} color={STATUS_COLORS[a.status] || C.textMuted} size="sm" />
                    <select value={a.status} onChange={(e) => onUpdate(a.id, e.target.value)} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", fontSize: "0.82rem", background: "#fff" }}>
                      <option>قيد المراجعة</option><option>مقابلة</option><option>مقبول</option><option>مرفوض</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================== Candidate Dashboard ============================== */
function CandidateDashboard({ user, jobs, apps, refresh, onLogout, saving, setSaving, flash }) {
  const [tab, setTab] = useState("browse");
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [applyJob, setApplyJob] = useState(null);

  const myApps = apps; // scoped via query to candidate
  const openJobs = useMemo(() => jobs.filter((j) => j.status === "open"), [jobs]);

  const filtered = useMemo(() => openJobs.filter((j) => {
    const matchesQuery = !query || j.title.includes(query) || (j.company_name || "").includes(query);
    const matchesLoc = !locationFilter || j.location.includes(locationFilter);
    const matchesType = !typeFilter || j.job_type === typeFilter;
    return matchesQuery && matchesLoc && matchesType;
  }), [openJobs, query, locationFilter, typeFilter]);

  const alreadyApplied = (jobId) => myApps.some((a) => a.job_id === jobId);

  const submitApplication = async (job, note) => {
    setSaving(true);
    const { error } = await supabase.from("applications").insert({
      job_id: job.id, job_title: job.title,
      company_id: job.company_id, company_name: job.company_name,
      candidate_id: user.id, candidate_name: user.name,
      status: "قيد المراجعة", note,
    });
    if (error) flash(error.message, "err");
    await refresh();
    setApplyJob(null);
    setTab("applications");
  };

  return (
    <div>
      <TopBar user={user} onLogout={onLogout} saving={saving} />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "30px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26, flexWrap: "wrap", gap: 12 }}>
          <h1 className="f-display" style={{ fontSize: "2rem" }}>أهلاً، {user.name}</h1>
          <div style={{ display: "flex", gap: 10 }}>
            <TabPill active={tab === "browse"} onClick={() => setTab("browse")} label="الوظائف المتاحة" count={openJobs.length} />
            <TabPill active={tab === "applications"} onClick={() => setTab("applications")} label="طلباتي" count={myApps.length} />
          </div>
        </div>

        {tab === "browse" && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
              <input placeholder="ابحث عن وظيفة أو شركة..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 2, minWidth: 200, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", background: "#fff" }} />
              <input placeholder="المدينة" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} style={{ flex: 1, minWidth: 140, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", background: "#fff" }} />
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", background: "#fff" }}>
                <option value="">كل الأنواع</option><option>دوام كامل</option><option>دوام جزئي</option><option>عن بعد</option><option>تدريب</option><option>عقد مؤقت</option>
              </select>
            </div>
            {filtered.length === 0 ? (
              <EmptyState title="لا وظائف مطابقة" desc="جرّب تعديل كلمات البحث أو الفلاتر." />
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {filtered.map((j) => (
                  <div key={j.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                        <h3 className="f-display" style={{ fontSize: "1.3rem" }}>{j.title}</h3>
                        <Stamp text={j.job_type} color={C.brass} size="sm" />
                      </div>
                      <p style={{ color: C.textMuted, fontSize: "0.88rem", marginBottom: 6 }}>{j.company_name} · {j.location} · {j.salary || "الراتب حسب الاتفاق"}</p>
                      <p style={{ fontSize: "0.88rem", lineHeight: 1.8, maxWidth: 560 }}>{j.description}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start" }}>
                      {alreadyApplied(j.id) ? <Stamp text="تم التقديم" color={C.green} /> : <button onClick={() => setApplyJob(j)} style={btnBrass}>تقديم الآن</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "applications" && (
          myApps.length === 0 ? <EmptyState title="لم تتقدّم لأي وظيفة بعد" desc="تصفّح الوظائف المتاحة وابدأ بالتقديم." /> : (
            <div style={{ display: "grid", gap: 12 }}>
              {myApps.map((a) => (
                <div key={a.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 18, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <p style={{ fontWeight: 700 }}>{a.job_title}</p>
                    <p style={{ color: C.textMuted, fontSize: "0.82rem", marginTop: 2 }}>{a.company_name} · تقدّمت في {fmtDate(a.applied_at)}</p>
                  </div>
                  <Stamp text={a.status} color={STATUS_COLORS[a.status] || C.textMuted} />
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {applyJob && <ApplyModal job={applyJob} onClose={() => setApplyJob(null)} onSubmit={(note) => submitApplication(applyJob, note)} />}
    </div>
  );
}

function ApplyModal({ job, onClose, onSubmit }) {
  const [note, setNote] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,25,43,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 26, maxWidth: 460, width: "100%" }}>
        <h3 className="f-display" style={{ fontSize: "1.4rem", marginBottom: 6 }}>التقديم على: {job.title}</h3>
        <p style={{ color: C.textMuted, fontSize: "0.85rem", marginBottom: 16 }}>{job.company_name} · {job.location}</p>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.85rem", color: C.textMuted }}>
          رسالة مختصرة (اختياري)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="لماذا أنت مناسب لهذه الوظيفة؟" style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", resize: "vertical" }} />
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={() => onSubmit(note)} style={btnBrass}>إرسال الطلب</button>
          <button onClick={onClose} style={btnOutline}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, desc }) {
  return (
    <div style={{ border: `2px dashed ${C.line}`, borderRadius: 14, padding: "50px 20px", textAlign: "center" }}>
      <h3 className="f-display" style={{ fontSize: "1.3rem", marginBottom: 8 }}>{title}</h3>
      <p style={{ color: C.textMuted, fontSize: "0.9rem" }}>{desc}</p>
    </div>
  );
}
