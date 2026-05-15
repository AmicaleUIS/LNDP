// ============================================================
// AUTH — LOGIN / REGISTER / LOGOUT
// ============================================================

const Auth = {
  UIS_EMAIL_DOMAIN: "uis.fr",

  normalizeUisLogin(value) {
    const raw = String(value || "").trim().toLowerCase();
    const withoutDomain = raw.replace(/@uis\.fr$/i, "");
    const normalized = withoutDomain
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['’`´]/g, "")
      .replace(/[^a-z0-9._\s-]/g, "")
      .replace(/[\s_-]+/g, ".")
      .replace(/\.{2,}/g, ".")
      .replace(/^\.+|\.+$/g, "");

    if (!normalized || !normalized.includes(".")) {
      throw new Error("Utilise le format prenom.nom.");
    }

    if (!/^[a-z0-9]+(?:\.[a-z0-9]+)+$/.test(normalized)) {
      throw new Error("Identifiant invalide. Exemple attendu : prenom.nom");
    }

    return normalized;
  },

  toUisEmail(value) {
    return `${this.normalizeUisLogin(value)}@${this.UIS_EMAIL_DOMAIN}`;
  },

  async getSession() {
    const { data, error } = await window.sb.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  async requireSession() {
    const session = await this.getSession();
    if (!session) {
      window.location.href = "login.html";
      return null;
    }
    return session;
  },

  async redirectIfLoggedIn() {
    const session = await this.getSession();
    if (session) window.location.href = "app.html";
  },

  async login(login, password) {
    const email = this.toUisEmail(login);
    const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async register(login, password, pseudo) {
    const identifier = this.normalizeUisLogin(login);
    const email = `${identifier}@${this.UIS_EMAIL_DOMAIN}`;
    const cleanPseudo = String(pseudo || "").trim();

    if (!cleanPseudo) {
      throw new Error("Choisis un surnom.");
    }

    const { data, error } = await window.sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          pseudo: cleanPseudo,
          login_identifier: identifier,
          is_fictive_email: true
        }
      }
    });
    if (error) throw error;
    return data;
  },

  async logout() {
    await window.sb.auth.signOut();
    window.location.href = "login.html";
  }
};

window.Auth = Auth;
