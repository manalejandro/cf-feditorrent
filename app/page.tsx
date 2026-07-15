"use client";

import { useState, useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile: {
      render: (container: HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        "expired-callback": () => void;
      }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = "0x4AAAAAAD2Dn15jLPieTUrz";

type Locale = "en" | "es";

const dict = {
  en: {
    title: "FediTorrent",
    tagline: "Torrents, federated.",
    heroTitle: "Torrents for the Fediverse",
    heroSub: "FediTorrent lets you share torrents and magnet links that federate through ActivityPub. Share files with your followers across the fediverse — your torrents, your rules.",
    cta: "Get Started",
    learnMore: "Learn More",
    howItWorks: "How It Works",
    step1: "Create an Account",
    step1Desc: "Sign up with a username and start sharing torrents across the fediverse.",
    step2: "Share a Torrent",
    step2Desc: "Upload files to create a WebTorrent, or paste a magnet link to share existing torrents.",
    step3: "Federate",
    step3Desc: "Your torrent is shared with your followers via ActivityPub automatically.",
    features: "Features",
    feature1: "ActivityPub Federation",
    feature1Desc: "Every torrent is an ActivityPub Torrent object that federates to your followers.",
    feature2: "WebTorrent + Magnet",
    feature2Desc: "Upload files for browser-to-browser P2P sharing, or share magnet links.",
    feature3: "Open Source",
    feature3Desc: "Built with Next.js, Cloudflare, and ActivityPub. Fully open source.",
    login: "Sign In",
    register: "Sign Up",
    logout: "Sign Out",
    myTorrents: "My Torrents",
    uploadTorrent: "Share Torrent",
    name: "Name",
    namePlaceholder: "My Awesome Torrent",
    magnet: "Magnet Link",
    magnetPlaceholder: "magnet:?xt=urn:btih:...",
    magnetHelp: "Paste a magnet link to share an existing torrent.",
    description: "Description",
    descriptionPlaceholder: "What is this torrent about?",
    createTorrent: "Share Torrent",
    createDesc: "Upload a file to create a WebTorrent, or paste a magnet link to share it with the fediverse.",
    submit: "Share Torrent",
    success: "Torrent shared!",
    copy: "Copy",
    copied: "Copied!",
    remove: "Delete",
    noTorrents: "No torrents yet. Share your first one!",
    clicks: "downloads",
    yourTorrents: "Your Torrents",
    shareAnother: "Share another",
    shortUrl: "Torrent URL",
    poweredBy: "Powered by Next.js, Cloudflare & ActivityPub",
    source: "Source Code",
    language: "Language",
    username: "Username",
    email: "Email",
    password: "Password",
    confirmPassword: "Confirm Password",
    loginTitle: "Welcome Back",
    registerTitle: "Join FediTorrent",
    loginBtn: "Sign In",
    registerBtn: "Create Account",
    noAccount: "Don't have an account?",
    haveAccount: "Already have an account?",
    usernamePlaceholder: "yourusername",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "••••••••",
    search: "Search",
    notifications: "Notifications",
    loggingIn: "Signing in...",
    registering: "Creating account...",
    forgotPassword: "Forgot password?",
    forgotPasswordTitle: "Reset your password",
    forgotPasswordDesc: "Enter your email address and we'll send you a reset link.",
    forgotPasswordBtn: "Send reset link",
    forgotPasswordSent: "Check your email",
    forgotPasswordEmailSent: "If that email is registered, you will receive a password reset link.",
    resetPasswordTitle: "Set new password",
    resetPasswordBtn: "Reset password",
    resetPasswordSuccess: "Password has been reset successfully. You can now sign in.",
    newPassword: "New password",
    confirmNewPassword: "Confirm new password",
    resendVerification: "Resend verification email",
    resendVerificationSent: "If that email is registered, a new verification link will be sent.",
    emailVerified: "Email verified! Your account is now active.",
    emailVerificationFailed: "Verification failed. The link may be invalid or expired.",
    checkEmail: "Check your email for the verification link.",
    turnstileError: "Please complete the captcha verification.",
    resetTokenExpired: "Invalid or expired reset link.",
    backToLogin: "Back to sign in",
    dismiss: "Dismiss",
    size: "Size",
    files: "files",
    infoHash: "Info Hash",
    downloadTorrent: "Download .torrent",
    magnetLink: "Magnet Link",
    dragDrop: "Drag & Drop Files",
    dragDropDesc: "Drop files here to create a WebTorrent and share it via ActivityPub",
    selectFiles: "Select Files",
    selectFolder: "Select Folder",
    seeding: "Seeding",
    leeching: "Downloading",
    magnetOnly: "Magnet Link Only",
    bytes: "B",
    kb: "KB",
    mb: "MB",
    gb: "GB",
    tb: "TB",
  },
  es: {
    title: "FediTorrent",
    tagline: "Torrents, federados.",
    heroTitle: "Torrents para el Fediverso",
    heroSub: "FediTorrent te permite compartir torrents y enlaces magnet que se federan a través de ActivityPub. Comparte archivos con tus seguidores en todo el fediverso — tus torrents, tus reglas.",
    cta: "Comenzar",
    learnMore: "Más Información",
    howItWorks: "Cómo Funciona",
    step1: "Crea una Cuenta",
    step1Desc: "Regístrate con un usuario y comienza a compartir torrents en el fediverso.",
    step2: "Comparte un Torrent",
    step2Desc: "Sube archivos para crear un WebTorrent, o pega un enlace magnet para compartir torrents existentes.",
    step3: "Federa",
    step3Desc: "Tu torrent se comparte con tus seguidores automáticamente vía ActivityPub.",
    features: "Características",
    feature1: "Federación ActivityPub",
    feature1Desc: "Cada torrent es un objeto Torrent de ActivityPub que se federa a tus seguidores.",
    feature2: "WebTorrent + Magnet",
    feature2Desc: "Sube archivos para compartir P2P de navegador a navegador, o comparte enlaces magnet.",
    feature3: "Código Abierto",
    feature3Desc: "Construido con Next.js, Cloudflare y ActivityPub. Totalmente open source.",
    login: "Iniciar Sesión",
    register: "Registrarse",
    logout: "Cerrar Sesión",
    myTorrents: "Mis Torrents",
    uploadTorrent: "Compartir Torrent",
    name: "Nombre",
    namePlaceholder: "Mi Torrent Increíble",
    magnet: "Enlace Magnet",
    magnetPlaceholder: "magnet:?xt=urn:btih:...",
    magnetHelp: "Pega un enlace magnet para compartir un torrent existente.",
    description: "Descripción",
    descriptionPlaceholder: "¿De qué trata este torrent?",
    createTorrent: "Compartir Torrent",
    createDesc: "Sube un archivo para crear un WebTorrent, o pega un enlace magnet para compartirlo con el fediverso.",
    submit: "Compartir Torrent",
    success: "¡Torrent compartido!",
    copy: "Copiar",
    copied: "¡Copiado!",
    remove: "Eliminar",
    noTorrents: "Aún no hay torrents. ¡Comparte el primero!",
    clicks: "descargas",
    yourTorrents: "Tus Torrents",
    shareAnother: "Compartir otro",
    shortUrl: "URL del Torrent",
    poweredBy: "Desarrollado con Next.js, Cloudflare y ActivityPub",
    source: "Código Fuente",
    language: "Idioma",
    username: "Usuario",
    email: "Correo electrónico",
    password: "Contraseña",
    confirmPassword: "Confirmar Contraseña",
    loginTitle: "Bienvenido de Nuevo",
    registerTitle: "Únete a FediTorrent",
    loginBtn: "Iniciar Sesión",
    registerBtn: "Crear Cuenta",
    noAccount: "¿No tienes cuenta?",
    haveAccount: "¿Ya tienes cuenta?",
    usernamePlaceholder: "tuusuario",
    emailPlaceholder: "tu@ejemplo.com",
    passwordPlaceholder: "••••••••",
    search: "Buscar",
    notifications: "Notificaciones",
    loggingIn: "Iniciando sesión...",
    registering: "Creando cuenta...",
    forgotPassword: "¿Olvidaste tu contraseña?",
    forgotPasswordTitle: "Restablece tu contraseña",
    forgotPasswordDesc: "Ingresa tu correo electrónico y te enviaremos un enlace de restablecimiento.",
    forgotPasswordBtn: "Enviar enlace",
    forgotPasswordSent: "Revisa tu correo",
    forgotPasswordEmailSent: "Si ese correo está registrado, recibirás un enlace para restablecer tu contraseña.",
    resetPasswordTitle: "Nueva contraseña",
    resetPasswordBtn: "Restablecer contraseña",
    resetPasswordSuccess: "Contraseña restablecida exitosamente. Ahora puedes iniciar sesión.",
    newPassword: "Nueva contraseña",
    confirmNewPassword: "Confirmar nueva contraseña",
    resendVerification: "Reenviar verificación",
    resendVerificationSent: "Si ese correo está registrado, se enviará un nuevo enlace de verificación.",
    emailVerified: "¡Correo verificado! Tu cuenta ya está activa.",
    emailVerificationFailed: "Verificación fallida. El enlace puede ser inválido o haber expirado.",
    checkEmail: "Revisa tu correo para ver el enlace de verificación.",
    turnstileError: "Por favor completa la verificación captcha.",
    resetTokenExpired: "Enlace de restablecimiento inválido o expirado.",
    backToLogin: "Volver a iniciar sesión",
    dismiss: "Descartar",
    size: "Tamaño",
    files: "archivos",
    infoHash: "Hash",
    downloadTorrent: "Descargar .torrent",
    magnetLink: "Enlace Magnet",
    dragDrop: "Arrastra y Suelta",
    dragDropDesc: "Suelta archivos aquí para crear un WebTorrent y compartirlo vía ActivityPub",
    selectFiles: "Seleccionar Archivos",
    selectFolder: "Seleccionar Carpeta",
    seeding: "Compartiendo",
    leeching: "Descargando",
    magnetOnly: "Solo Enlace Magnet",
    bytes: "B",
    kb: "KB",
    mb: "MB",
    gb: "GB",
    tb: "TB",
  },
};

type D = typeof dict.en;

interface Torrent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  infoHash: string;
  magnetUri: string;
  torrentFileUrl: string | null;
  size: number;
  fileCount: number;
  fileType: string | null;
  magnetOnly: boolean;
  clicks: number;
  published: string;
  shortUrl: string;
}

function formatSize(bytes: number, d: D): string {
  if (bytes === 0) return "0 " + d.bytes;
  const k = 1024;
  const sizes = [d.bytes, d.kb, d.mb, d.gb, d.tb];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(dateStr: string, locale: Locale): string {
  try {
    return new Date(dateStr).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch { return dateStr; }
}

function Toggle({ locale, setLocale }: { locale: Locale; setLocale: (l: Locale) => void }) {
  return (
    <button onClick={() => setLocale(locale === "en" ? "es" : "en")}
      className="px-3 py-1.5 rounded-lg bg-card border border-border text-sm font-medium text-muted hover:text-foreground transition-colors">
      {locale === "en" ? "ES" : "EN"}
    </button>
  );
}

function AuthModal({ d, showAuth, setShowAuth, showRegister, setShowRegister, onRegistered }: {
  d: D; showAuth: boolean; setShowAuth: (v: boolean) => void;
  showRegister: boolean; setShowRegister: (v: boolean) => void; onRegistered: () => void;
}) {
  const [usernameInput, setUsernameInput] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendSent, setResendSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    if (!showAuth) {
      setUsernameInput(""); setEmail(""); setPassword("");
      setConfirmPassword(""); setAuthError("");
      setShowForgot(false); setForgotSent(false);
      setShowResend(false); setResendSent(false);
      setTurnstileToken("");
    }
  }, [showAuth]);

  useEffect(() => {
    if (!showAuth || showForgot || showResend) return;
    const scriptId = "cf-turnstile-script";
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id = scriptId;
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      document.body.appendChild(s);
    }
    const interval = setInterval(() => {
      if (turnstileRef.current && typeof window.turnstile !== "undefined") {
        if (turnstileWidgetId.current) {
          window.turnstile.reset(turnstileWidgetId.current);
          window.turnstile.remove(turnstileWidgetId.current);
        }
        turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(""),
        });
        clearInterval(interval);
      }
    }, 200);
    return () => {
      clearInterval(interval);
      if (turnstileWidgetId.current && typeof window.turnstile !== "undefined") {
        window.turnstile.remove(turnstileWidgetId.current);
        turnstileWidgetId.current = null;
      }
    };
  }, [showAuth, showRegister, showForgot, showResend]);

  const handleAuth = async () => {
    if (!turnstileToken && !showForgot && !showResend) {
      setAuthError(d.turnstileError);
      return;
    }
    setLoading(true); setAuthError("");
    try {
      const endpoint = showRegister ? "/api/auth/register" : "/api/auth/login";
      const body: Record<string, string> = { username: usernameInput, password, turnstileToken };
      if (showRegister) { body.email = email; body.confirmPassword = confirmPassword; }
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data: any = await res.json();
      if (!res.ok) {
        if (res.status === 403) { setResendEmail(email || usernameInput); setShowResend(true); }
        setAuthError(data.error || "Error");
        return;
      }
      if (showRegister && data.verified === false) {
        setShowAuth(false); setUsernameInput(""); setPassword("");
        setConfirmPassword(""); setEmail("");
        onRegistered?.(); return;
      }
      localStorage.setItem("ft_token", data.token);
      localStorage.setItem("ft_username", data.username);
      localStorage.setItem("ft_actorId", data.actorId);
      window.location.reload();
    } catch { setAuthError("Network error"); }
    finally { setLoading(false); }
  };

  const handleForgotPassword = async () => {
    setForgotLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotSent(true);
    } catch { setAuthError("Network error"); }
    finally { setForgotLoading(false); }
  };

  const handleResend = async () => {
    setResendLoading(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: resendEmail }),
      });
      setResendSent(true);
    } catch { /* ignore */ }
    finally { setResendLoading(false); }
  };

  const close = () => setShowAuth(false);
  if (!showAuth) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={close}>
      <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-md mx-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
        {showResend ? (
          <>
            <h2 className="text-2xl font-bold mb-2">{d.resendVerification}</h2>
            <p className="text-sm text-muted mb-6">Please verify your email before signing in.</p>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted mb-1.5 block">{d.email}</label>
                <input value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} placeholder={d.emailPlaceholder} type="email" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors" />
              </div>
              {resendSent ? (
                <p className="text-sm text-primary">{d.resendVerificationSent}</p>
              ) : (
                <button onClick={handleResend} disabled={resendLoading} className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">{resendLoading ? "..." : d.resendVerification}</button>
              )}
              <p className="text-center text-sm text-muted"><button onClick={() => { setShowResend(false); setResendSent(false); }} className="text-primary hover:underline">{d.backToLogin}</button></p>
            </div>
          </>
        ) : showForgot ? (
          <>
            <h2 className="text-2xl font-bold mb-2">{d.forgotPasswordTitle}</h2>
            <p className="text-sm text-muted mb-6">{d.forgotPasswordDesc}</p>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted mb-1.5 block">{d.email}</label>
                <input value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder={d.emailPlaceholder} type="email" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors" />
              </div>
              {forgotSent ? (
                <><p className="text-sm text-primary">{d.forgotPasswordEmailSent}</p><p className="text-center text-sm text-muted"><button onClick={() => { setShowForgot(false); setForgotSent(false); }} className="text-primary hover:underline">{d.backToLogin}</button></p></>
              ) : (
                <><button onClick={handleForgotPassword} disabled={forgotLoading} className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">{forgotLoading ? "..." : d.forgotPasswordBtn}</button><p className="text-center text-sm text-muted"><button onClick={() => { setShowForgot(false); }} className="text-primary hover:underline">{d.backToLogin}</button></p></>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-6">{showRegister ? d.registerTitle : d.loginTitle}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted mb-1.5 block">{d.username}</label>
                <input value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder={d.usernamePlaceholder} className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors" />
              </div>
              {showRegister && (
                <div>
                  <label className="text-sm text-muted mb-1.5 block">{d.email}</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={d.emailPlaceholder} type="email" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors" />
                </div>
              )}
              <div>
                <label className="text-sm text-muted mb-1.5 block">{d.password}</label>
                <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={d.passwordPlaceholder} type="password" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors" />
              </div>
              {showRegister && (
                <div>
                  <label className="text-sm text-muted mb-1.5 block">{d.confirmPassword}</label>
                  <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={d.passwordPlaceholder} type="password" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors" />
                </div>
              )}
              {authError && <p className="text-error text-sm">{authError}</p>}
              <div ref={turnstileRef} className="flex justify-center my-3 min-h-[65px]" />
              <button onClick={handleAuth} disabled={loading} className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">
                {loading ? (showRegister ? d.registering : d.loggingIn) : (showRegister ? d.registerBtn : d.loginBtn)}
              </button>
              {!showRegister && (
                <p className="text-center text-sm text-muted"><button onClick={() => { setShowForgot(true); setAuthError(""); }} className="text-primary hover:underline">{d.forgotPassword}</button></p>
              )}
              <p className="text-center text-sm text-muted">
                {showRegister ? d.haveAccount : d.noAccount}{" "}
                <button onClick={() => { setShowRegister(!showRegister); setAuthError(""); }} className="text-primary hover:underline">
                  {showRegister ? d.login : d.register}
                </button>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("en");
  const [ctaKey, setCtaKey] = useState(0);
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [newName, setNewName] = useState("");
  const [newMagnet, setNewMagnet] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [successUrl, setSuccessUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"magnet" | "upload">("magnet");

  const d = dict[locale];

  const [justRegistered, setJustRegistered] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<{ ok?: boolean; reason?: string }>({});
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedingInfo, setSeedingInfo] = useState<{ infoHash: string; name: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("verified");
    if (v === "true") {
      setVerificationStatus({ ok: true });
      const url = new URL(window.location.href);
      url.searchParams.delete("verified"); url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.toString());
    } else if (v === "false") {
      setVerificationStatus({ ok: false, reason: params.get("reason") ?? undefined });
      const url = new URL(window.location.href);
      url.searchParams.delete("verified"); url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.toString());
    }
    const rt = params.get("reset-token");
    if (rt) { setResetToken(rt); const url = new URL(window.location.href); url.searchParams.delete("reset-token"); window.history.replaceState({}, "", url.toString()); }
  }, []);

  const token = typeof window !== "undefined" ? localStorage.getItem("ft_token") : null;
  const username = typeof window !== "undefined" ? localStorage.getItem("ft_username") : null;

  useEffect(() => {
    if (token) {
      fetch("/api/torrents", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json()).then((data) => { if (Array.isArray(data)) setTorrents(data); }).catch(() => {});
    }
  }, [token]);

  const handleCreate = async () => {
    if (mode === "magnet" && !newMagnet) return;
    if (mode === "upload" && uploadedFiles.length === 0) return;
    setCreating(true); setError(""); setSuccessUrl("");
    try {
      const body: Record<string, any> = { name: newName || "Torrent", description: newDesc };
      if (mode === "magnet") {
        body.magnetUri = newMagnet;
        body.magnetOnly = true;
        body.infoHash = "";
        body.size = 0;
        body.fileCount = 0;
      } else if (seedingInfo) {
        body.magnetUri = `magnet:?xt=urn:btih:${seedingInfo.infoHash}&dn=${encodeURIComponent(seedingInfo.name)}`;
        body.infoHash = seedingInfo.infoHash;
        body.magnetOnly = false;
      }

      const res = await fetch("/api/torrents", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data: any = await res.json();
      if (!res.ok) { setError(data.error || "Error"); return; }
      setSuccessUrl(data.shortUrl);
      setNewName(""); setNewMagnet(""); setNewDesc(""); setUploadedFiles([]); setSeedingInfo(null); setIsSeeding(false);
      setTorrents((prev) => [data, ...prev]);
    } catch { setError("Network error"); }
    finally { setCreating(false); }
  };

  const handleDelete = async (torrentId: string) => {
    setDeleting(torrentId);
    try {
      const res = await fetch(`/api/torrents/${torrentId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      setTorrents((prev) => prev.filter((t) => t.id !== torrentId));
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  };

  const handleResetPassword = async () => {
    if (resetPassword.length < 8) { setResetError("Password must be at least 8 characters"); return; }
    if (resetPassword !== resetConfirmPassword) { setResetError("Passwords do not match"); return; }
    setResetting(true); setResetError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: resetPassword }),
      });
      const data: any = await res.json();
      if (!res.ok) { setResetError(data.error || "Error"); return; }
      setResetDone(true);
    } catch { setResetError("Network error"); }
    finally { setResetting(false); }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    setUploadedFiles(fileArray);
    setMode("upload");
  };

  const [showAuth, setShowAuth] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    if (ctaKey && ctaKey > 0) { setShowAuth(true); setShowRegister(true); }
  }, [ctaKey]);

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm group-hover:scale-105 transition-transform">F</div>
            <span className="font-semibold text-lg">{d.title}</span>
          </a>
          <div className="flex items-center gap-3">
            <Toggle locale={locale} setLocale={setLocale} />
            {token ? (
              <>
                <a href="/search" className="text-sm text-muted hover:text-foreground transition-colors">{d.search}</a>
                <a href="/notifications" className="text-sm text-muted hover:text-foreground transition-colors relative">{d.notifications}</a>
                <a href={`/users/${username}`} className="text-sm text-muted hover:text-foreground transition-colors">{username}</a>
                <a href="/links" className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors">{d.myTorrents}</a>
                <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="text-sm text-muted hover:text-error transition-colors">{d.logout}</button>
              </>
            ) : (
              <>
                <button onClick={() => { setShowAuth(true); setShowRegister(false); }} className="text-sm text-muted hover:text-foreground transition-colors">{d.login}</button>
                <button onClick={() => { setShowAuth(true); setShowRegister(true); }} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">{d.register}</button>
              </>
            )}
          </div>
        </div>
      </nav>

      <AuthModal d={d} showAuth={showAuth} setShowAuth={setShowAuth} showRegister={showRegister} setShowRegister={setShowRegister} onRegistered={() => setJustRegistered(true)} />

      <main className="flex-1">
        {resetToken && !resetDone && (
          <div className="max-w-lg mx-auto mt-6 px-4">
            <div className="bg-card border border-border rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-2">{d.resetPasswordTitle}</h2>
              <div className="space-y-4 mt-6">
                <div>
                  <label className="text-sm text-muted mb-1.5 block">{d.newPassword}</label>
                  <input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder={d.passwordPlaceholder} type="password" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors" />
                </div>
                <div>
                  <label className="text-sm text-muted mb-1.5 block">{d.confirmNewPassword}</label>
                  <input value={resetConfirmPassword} onChange={(e) => setResetConfirmPassword(e.target.value)} placeholder={d.passwordPlaceholder} type="password" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors" />
                </div>
                {resetError && <p className="text-error text-sm">{resetError}</p>}
                <button onClick={handleResetPassword} disabled={resetting} className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">{resetting ? "..." : d.resetPasswordBtn}</button>
              </div>
            </div>
          </div>
        )}
        {resetDone && (
          <div className="max-w-lg mx-auto mt-6 px-4">
            <div className="rounded-xl bg-success/10 border border-success/20 p-4 text-center">
              <p className="text-success font-semibold">{d.resetPasswordSuccess}</p>
              <button onClick={() => { setResetToken(null); setResetDone(false); setShowAuth(true); setShowRegister(false); }} className="mt-2 text-sm text-primary hover:underline">{d.loginBtn}</button>
            </div>
          </div>
        )}
        {justRegistered && (
          <div className="max-w-lg mx-auto mt-6 px-4">
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 text-center">
              <p className="text-primary font-semibold">{d.registerTitle}</p>
              <p className="text-sm text-muted mt-1">{d.checkEmail}</p>
              <button onClick={() => setJustRegistered(false)} className="mt-2 text-xs text-muted hover:text-foreground underline">{d.dismiss}</button>
            </div>
          </div>
        )}
        {verificationStatus.ok && (
          <div className="max-w-lg mx-auto mt-6 px-4">
            <div className="rounded-xl bg-success/10 border border-success/20 p-4 text-center">
              <p className="text-success font-semibold">{d.emailVerified}</p>
              <button onClick={() => { setVerificationStatus({}); setShowAuth(true); setShowRegister(false); }} className="mt-2 text-sm text-primary hover:underline">{d.loginBtn}</button>
            </div>
          </div>
        )}
        {verificationStatus.ok === false && (
          <div className="max-w-lg mx-auto mt-6 px-4">
            <div className="rounded-xl bg-error/10 border border-error/20 p-4 text-center">
              <p className="text-error font-semibold">{d.emailVerificationFailed}</p>
              <button onClick={() => setVerificationStatus({})} className="mt-2 text-xs text-muted hover:text-foreground underline">{d.dismiss}</button>
            </div>
          </div>
        )}

        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
          <div className="max-w-6xl mx-auto px-4 pt-24 pb-32 text-center relative">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary mb-8">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />ActivityPub + WebTorrent
            </div>
            <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-r from-white via-white to-primary bg-clip-text text-transparent">{d.heroTitle}</h1>
            <p className="text-lg sm:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">{d.heroSub}</p>
            <div className="flex items-center justify-center gap-4">
              {token ? (
                <a href="#create" onClick={(e) => { e.preventDefault(); document.getElementById("create")?.scrollIntoView({ behavior: "smooth" }); }}
                  className="px-8 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-all hover:scale-105">{d.uploadTorrent}</a>
              ) : (
                <button onClick={() => setCtaKey(k => k + 1)} className="px-8 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-all hover:scale-105">{d.cta}</button>
              )}
              <a href="#how-it-works" onClick={(e) => { e.preventDefault(); document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" }); }}
                className="px-8 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-card transition-colors">{d.learnMore}</a>
            </div>
          </div>
        </section>

        {/* Create Torrent Section */}
        {token && (
          <section id="create" className="max-w-2xl mx-auto px-4 pb-24">
            <div className="bg-card border border-border rounded-2xl p-8 animate-glow">
              <h2 className="text-2xl font-bold mb-2">{d.createTorrent}</h2>
              <p className="text-muted text-sm mb-6">{d.createDesc}</p>

              {successUrl ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-success/10 border border-success/20">
                    <svg className="w-5 h-5 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <div>
                      <p className="font-medium text-success">{d.success}</p>
                      <p className="text-sm text-foreground font-mono">{successUrl}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { navigator.clipboard.writeText(successUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="flex-1 py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors">{copied ? d.copied : d.copy}</button>
                    <button onClick={() => { setSuccessUrl(""); setNewName(""); setNewMagnet(""); setNewDesc(""); setUploadedFiles([]); setSeedingInfo(null); setIsSeeding(false); }}
                      className="flex-1 py-2.5 rounded-xl border border-border text-foreground font-medium hover:bg-card-hover transition-colors">{d.shareAnother}</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Mode Toggle */}
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => setMode("magnet")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "magnet" ? "bg-primary text-white" : "bg-secondary text-muted hover:text-foreground"}`}>🧲 {d.magnetLink}</button>
                    <button onClick={() => setMode("upload")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "upload" ? "bg-primary text-white" : "bg-secondary text-muted hover:text-foreground"}`}>📤 {d.dragDrop}</button>
                  </div>

                  <div>
                    <label className="text-sm text-muted mb-1.5 block">{d.name} *</label>
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={d.namePlaceholder} className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors" />
                  </div>

                  {mode === "magnet" ? (
                    <div>
                      <label className="text-sm text-muted mb-1.5 block">{d.magnet}</label>
                      <input value={newMagnet} onChange={(e) => setNewMagnet(e.target.value)} placeholder={d.magnetPlaceholder} className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors font-mono text-sm" />
                      <p className="text-xs text-muted mt-1">{d.magnetHelp}</p>
                    </div>
                  ) : (
                    <div>
                      <label className="text-sm text-muted mb-1.5 block">{d.dragDrop}</label>
                      <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files); }}
                        onClick={() => fileInputRef.current?.click()}>
                        {uploadedFiles.length > 0 ? (
                          <div>
                            <p className="text-primary font-medium">{uploadedFiles.length} {d.files} selected</p>
                            <p className="text-xs text-muted mt-1">{uploadedFiles.map(f => f.name).join(", ").slice(0, 80)}...</p>
                          </div>
                        ) : (
                          <>
                            <p className="text-muted mb-3">{d.dragDropDesc}</p>
                            <div className="flex items-center justify-center gap-3">
                              <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors">{d.selectFiles}</button>
                              <button onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }} className="px-4 py-2 rounded-lg bg-secondary text-muted text-sm font-medium hover:text-foreground transition-colors">{d.selectFolder}</button>
                            </div>
                          </>
                        )}
                      </div>
                      <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => handleFileSelect(e.target.files)} />
                      <input ref={folderInputRef} type="file" {...{ webkitdirectory: "" } as any} multiple style={{ display: "none" }} onChange={(e) => handleFileSelect(e.target.files)} />
                      {isSeeding && seedingInfo && (
                        <div className="mt-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                          <p className="text-sm text-primary font-medium">{d.seeding}: {seedingInfo.name}</p>
                          <p className="text-xs text-muted font-mono mt-1">{seedingInfo.infoHash.slice(0, 20)}...</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-sm text-muted mb-1.5 block">{d.description}</label>
                    <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder={d.descriptionPlaceholder} rows={3} className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors resize-none" />
                  </div>

                  {error && <p className="text-error text-sm">{error}</p>}
                  <button onClick={handleCreate} disabled={creating || (mode === "magnet" && !newMagnet) || (mode === "upload" && uploadedFiles.length === 0)}
                    className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">
                    {creating ? "..." : d.submit}
                  </button>
                </div>
              )}
            </div>

            {/* Torrents List */}
            {torrents.length > 0 && (
              <div className="mt-12">
                <h3 className="text-xl font-bold mb-4">{d.yourTorrents}</h3>
                <div className="space-y-3">
                  {torrents.map((torrent) => (
                    <div key={torrent.id} className="bg-card border border-border rounded-xl p-4 hover:bg-card-hover transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{torrent.name}</p>
                            {torrent.magnetOnly && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted">{d.magnetOnly}</span>}
                          </div>
                          <p className="text-sm text-primary font-mono mt-1">{window.location.origin}/torrents/{torrent.slug}</p>
                          {torrent.description && <p className="text-xs text-muted mt-1 truncate">{torrent.description}</p>}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                            {torrent.size > 0 && <span>{formatSize(torrent.size, d)}</span>}
                            {torrent.fileCount > 0 && <span>{torrent.fileCount} {d.files}</span>}
                            <span>{torrent.clicks} {d.clicks}</span>
                            <span>{formatDate(torrent.published, locale)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={torrent.magnetUri} className="px-3 py-1.5 rounded-lg bg-secondary text-sm text-muted hover:text-foreground transition-colors" title={d.magnetLink}>🧲</a>
                          <button onClick={() => handleDelete(torrent.id)} disabled={deleting === torrent.id}
                            className="px-3 py-1.5 rounded-lg bg-error/10 text-error text-sm hover:bg-error/20 transition-colors disabled:opacity-50">{deleting === torrent.id ? "..." : d.remove}</button>
                          <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/torrents/${torrent.slug}`); }}
                            className="px-3 py-1.5 rounded-lg bg-secondary text-sm text-muted hover:text-foreground transition-colors">{d.copy}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* How It Works & Features */}
        {!token && (
          <>
            <section id="how-it-works" className="max-w-6xl mx-auto px-4 pb-24">
              <h2 className="text-3xl font-bold text-center mb-16">{d.howItWorks}</h2>
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { num: "01", title: d.step1, desc: d.step1Desc },
                  { num: "02", title: d.step2, desc: d.step2Desc },
                  { num: "03", title: d.step3, desc: d.step3Desc },
                ].map((step) => (
                  <div key={step.num} className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
                    <div className="relative bg-card border border-border rounded-2xl p-8">
                      <span className="text-4xl font-bold text-primary/30">{step.num}</span>
                      <h3 className="text-xl font-bold mt-4 mb-3">{step.title}</h3>
                      <p className="text-muted leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="max-w-6xl mx-auto px-4 pb-24">
              <h2 className="text-3xl font-bold text-center mb-16">{d.features}</h2>
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { title: d.feature1, desc: d.feature1Desc, icon: "🔄" },
                  { title: d.feature2, desc: d.feature2Desc, icon: "🧲" },
                  { title: d.feature3, desc: d.feature3Desc, icon: "📖" },
                ].map((feat) => (
                  <div key={feat.title} className="bg-card border border-border rounded-2xl p-8 hover:border-primary/30 transition-colors">
                    <span className="text-3xl">{feat.icon}</span>
                    <h3 className="text-lg font-bold mt-4 mb-3">{feat.title}</h3>
                    <p className="text-muted leading-relaxed text-sm">{feat.desc}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted">{d.poweredBy}</p>
          <div className="flex items-center gap-6">
            <button onClick={() => setLocale(locale === "en" ? "es" : "en")} className="text-sm text-muted hover:text-foreground transition-colors">{d.language}: {locale === "en" ? "Español" : "English"}</button>
            <a href="https://github.com/manalejandro/cf-feditorrent" target="_blank" rel="noopener noreferrer" className="text-sm text-muted hover:text-foreground transition-colors">{d.source} ↗</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
