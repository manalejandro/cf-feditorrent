export type Locale = "en" | "es";

export type Dict = {
  lang: Locale;
  site: { title: string; tagline: string; description: string };
  nav: { home: string; myTorrents: string; uploadTorrent: string; login: string; register: string; logout: string; profile: string; search: string; notifications: string };
  hero: { title: string; subtitle: string; cta: string; learnMore: string };
  torrent: { create: string; createDesc: string; name: string; namePlaceholder: string; magnet: string; magnetPlaceholder: string; magnetHelp: string; description: string; descriptionPlaceholder: string; submit: string; success: string; copy: string; copied: string; delete: string; confirmDelete: string; noTorrents: string; stats: string; clicks: string; created: string; yourTorrents: string; uploadAnother: string; size: string; files: string; infoHash: string; downloadTorrent: string; magnetLink: string; dragDrop: string; dragDropDesc: string; selectFiles: string; selectFolder: string; seeding: string; leeching: string; magnetOnly: string };
  auth: { username: string; email: string; password: string; confirmPassword: string; loginTitle: string; registerTitle: string; loginBtn: string; registerBtn: string; noAccount: string; haveAccount: string; usernamePlaceholder: string; emailPlaceholder: string; passwordPlaceholder: string; loggingIn: string; registering: string; loginError: string; registerError: string; forgotPassword: string; forgotPasswordTitle: string; forgotPasswordDesc: string; forgotPasswordBtn: string; forgotPasswordSent: string; forgotPasswordEmailSent: string; resetPasswordTitle: string; resetPasswordBtn: string; resetPasswordSuccess: string; newPassword: string; confirmNewPassword: string; resendVerification: string; resendVerificationSent: string; emailVerified: string; emailVerificationFailed: string; checkEmail: string; turnstileError: string };
  profile: { title: string; torrents: string; followers: string; following: string; editProfile: string; displayName: string; bio: string; save: string; saved: string };
  footer: { poweredBy: string; source: string; language: string };
  sizeUnits: { bytes: string; kb: string; mb: string; gb: string; tb: string };
  errors: { notFound: string; serverError: string; unauthorised: string };
};

export const dicts: Record<Locale, Dict> = {
  en: {
    lang: "en",
    site: { title: "FediTorrent", tagline: "Torrents, federated.", description: "A federated torrent sharing platform powered by ActivityPub. Share files and magnet links across the fediverse." },
    nav: { home: "Home", myTorrents: "My Torrents", uploadTorrent: "Upload Torrent", login: "Sign In", register: "Sign Up", logout: "Sign Out", profile: "Profile", search: "Search", notifications: "Notifications" },
    hero: { title: "Torrents for the Fediverse", subtitle: "FediTorrent lets you share torrents and magnet links that federate through ActivityPub. Share files with your followers across the fediverse — your torrents, your rules.", cta: "Get Started", learnMore: "Learn More" },
    torrent: {
      create: "Share Torrent", createDesc: "Upload a file to create a WebTorrent, or paste a magnet link to share it with the fediverse.",
      name: "Name", namePlaceholder: "My Awesome Torrent",
      magnet: "Magnet Link", magnetPlaceholder: "magnet:?xt=urn:btih:...", magnetHelp: "Paste a magnet link to share an existing torrent.",
      description: "Description", descriptionPlaceholder: "What is this torrent about?",
      submit: "Share Torrent", success: "Torrent shared!", copy: "Copy", copied: "Copied!",
      delete: "Delete", confirmDelete: "Are you sure you want to delete this torrent?",
      noTorrents: "No torrents yet. Share your first one!",
      stats: "Stats", clicks: "downloads", created: "Created",
      yourTorrents: "Your Torrents", uploadAnother: "Share another",
      size: "Size", files: "files", infoHash: "Info Hash",
      downloadTorrent: "Download .torrent", magnetLink: "Magnet Link",
      dragDrop: "Drag & Drop Files", dragDropDesc: "Drop files here to create a WebTorrent and share it via ActivityPub",
      selectFiles: "Select Files", selectFolder: "Select Folder",
      seeding: "Seeding", leeching: "Downloading",
      magnetOnly: "Magnet Link Only",
    },
    auth: {
      username: "Username", email: "Email", password: "Password", confirmPassword: "Confirm Password",
      loginTitle: "Welcome Back", registerTitle: "Join FediTorrent",
      loginBtn: "Sign In", registerBtn: "Create Account",
      noAccount: "Don't have an account?", haveAccount: "Already have an account?",
      usernamePlaceholder: "yourusername", emailPlaceholder: "you@example.com", passwordPlaceholder: "••••••••",
      loggingIn: "Signing in...", registering: "Creating account...",
      loginError: "Invalid username or password", registerError: "Registration failed",
      forgotPassword: "Forgot password?", forgotPasswordTitle: "Reset your password",
      forgotPasswordDesc: "Enter your email address and we'll send you a reset link.",
      forgotPasswordBtn: "Send reset link", forgotPasswordSent: "Check your email",
      forgotPasswordEmailSent: "If that email is registered, you will receive a password reset link.",
      resetPasswordTitle: "Set new password", resetPasswordBtn: "Reset password",
      resetPasswordSuccess: "Password has been reset successfully. You can now sign in.",
      newPassword: "New password", confirmNewPassword: "Confirm new password",
      resendVerification: "Resend verification email", resendVerificationSent: "If that email is registered, a new verification link will be sent.",
      emailVerified: "Email verified! Your account is now active.",
      emailVerificationFailed: "Verification failed. The link may be invalid or expired.",
      checkEmail: "Check your email for the verification link.",
      turnstileError: "Please complete the captcha verification.",
    },
    profile: { title: "Profile", torrents: "Torrents", followers: "Followers", following: "Following", editProfile: "Edit Profile", displayName: "Display Name", bio: "Bio", save: "Save", saved: "Saved!" },
    footer: { poweredBy: "Powered by Next.js, Cloudflare & ActivityPub", source: "Source Code", language: "Language" },
    sizeUnits: { bytes: "B", kb: "KB", mb: "MB", gb: "GB", tb: "TB" },
    errors: { notFound: "Page not found", serverError: "Server error", unauthorised: "Unauthorised" },
  },
  es: {
    lang: "es",
    site: { title: "FediTorrent", tagline: "Torrents, federados.", description: "Una plataforma federada de intercambio de torrents impulsada por ActivityPub. Comparte archivos y enlaces magnet a través del fediverso." },
    nav: { home: "Inicio", myTorrents: "Mis Torrents", uploadTorrent: "Subir Torrent", login: "Iniciar Sesión", register: "Registrarse", logout: "Cerrar Sesión", profile: "Perfil", search: "Buscar", notifications: "Notificaciones" },
    hero: { title: "Torrents para el Fediverso", subtitle: "FediTorrent te permite compartir torrents y enlaces magnet que se federan a través de ActivityPub. Comparte archivos con tus seguidores en todo el fediverso — tus torrents, tus reglas.", cta: "Comenzar", learnMore: "Más Información" },
    torrent: {
      create: "Compartir Torrent", createDesc: "Sube un archivo para crear un WebTorrent, o pega un enlace magnet para compartirlo con el fediverso.",
      name: "Nombre", namePlaceholder: "Mi Torrent Increíble",
      magnet: "Enlace Magnet", magnetPlaceholder: "magnet:?xt=urn:btih:...", magnetHelp: "Pega un enlace magnet para compartir un torrent existente.",
      description: "Descripción", descriptionPlaceholder: "¿De qué trata este torrent?",
      submit: "Compartir Torrent", success: "¡Torrent compartido!", copy: "Copiar", copied: "¡Copiado!",
      delete: "Eliminar", confirmDelete: "¿Estás seguro de que quieres eliminar este torrent?",
      noTorrents: "Aún no hay torrents. ¡Comparte el primero!",
      stats: "Estadísticas", clicks: "descargas", created: "Creado",
      yourTorrents: "Tus Torrents", uploadAnother: "Compartir otro",
      size: "Tamaño", files: "archivos", infoHash: "Hash",
      downloadTorrent: "Descargar .torrent", magnetLink: "Enlace Magnet",
      dragDrop: "Arrastra y Suelta", dragDropDesc: "Suelta archivos aquí para crear un WebTorrent y compartirlo vía ActivityPub",
      selectFiles: "Seleccionar Archivos", selectFolder: "Seleccionar Carpeta",
      seeding: "Compartiendo", leeching: "Descargando",
      magnetOnly: "Solo Enlace Magnet",
    },
    auth: {
      username: "Usuario", email: "Correo electrónico", password: "Contraseña", confirmPassword: "Confirmar Contraseña",
      loginTitle: "Bienvenido de Nuevo", registerTitle: "Únete a FediTorrent",
      loginBtn: "Iniciar Sesión", registerBtn: "Crear Cuenta",
      noAccount: "¿No tienes cuenta?", haveAccount: "¿Ya tienes cuenta?",
      usernamePlaceholder: "tuusuario", emailPlaceholder: "tu@ejemplo.com", passwordPlaceholder: "••••••••",
      loggingIn: "Iniciando sesión...", registering: "Creando cuenta...",
      loginError: "Usuario o contraseña inválidos", registerError: "Registro fallido",
      forgotPassword: "¿Olvidaste tu contraseña?", forgotPasswordTitle: "Restablece tu contraseña",
      forgotPasswordDesc: "Ingresa tu correo electrónico y te enviaremos un enlace de restablecimiento.",
      forgotPasswordBtn: "Enviar enlace", forgotPasswordSent: "Revisa tu correo",
      forgotPasswordEmailSent: "Si ese correo está registrado, recibirás un enlace para restablecer tu contraseña.",
      resetPasswordTitle: "Nueva contraseña", resetPasswordBtn: "Restablecer contraseña",
      resetPasswordSuccess: "Contraseña restablecida exitosamente. Ahora puedes iniciar sesión.",
      newPassword: "Nueva contraseña", confirmNewPassword: "Confirmar nueva contraseña",
      resendVerification: "Reenviar verificación", resendVerificationSent: "Si ese correo está registrado, se enviará un nuevo enlace de verificación.",
      emailVerified: "¡Correo verificado! Tu cuenta ya está activa.",
      emailVerificationFailed: "Verificación fallida. El enlace puede ser inválido o haber expirado.",
      checkEmail: "Revisa tu correo para ver el enlace de verificación.",
      turnstileError: "Por favor completa la verificación captcha.",
    },
    profile: { title: "Perfil", torrents: "Torrents", followers: "Seguidores", following: "Siguiendo", editProfile: "Editar Perfil", displayName: "Nombre", bio: "Biografía", save: "Guardar", saved: "¡Guardado!" },
    footer: { poweredBy: "Desarrollado con Next.js, Cloudflare y ActivityPub", source: "Código Fuente", language: "Idioma" },
    sizeUnits: { bytes: "B", kb: "KB", mb: "MB", gb: "GB", tb: "TB" },
    errors: { notFound: "Página no encontrada", serverError: "Error del servidor", unauthorised: "No autorizado" },
  },
};

export function t(locale: Locale): Dict {
  return dicts[locale];
}

export function detectLocale(acceptLanguage: string, pathLocale?: string): Locale {
  if (pathLocale === "es" || pathLocale === "en") return pathLocale;
  if (acceptLanguage?.startsWith("es")) return "es";
  return "en";
}
