// ============================================================
// AUTH — LOGIN / REGISTER / LOGOUT
// ============================================================

const Auth = {
  UIS_EMAIL_DOMAIN: "uis.fr",
  FAMILY_EMAIL_SUFFIX: "famille",

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

  toFamilyEmail(value) {
    return `${this.normalizeUisLogin(value)}.${this.FAMILY_EMAIL_SUFFIX}@${this.UIS_EMAIL_DOMAIN}`;
  },

  toEmailForMode(value, mode = "uis") {
    return mode === "family" ? this.toFamilyEmail(value) : this.toUisEmail(value);
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

  async login(login, password, mode = "uis") {
    const email = this.toEmailForMode(login, mode);
    const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async changePassword(newPassword) {
    const { data, error } = await window.sb.auth.updateUser({ password: newPassword });
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
          player_scope: "uis",
          is_fictive_email: true
        }
      }
    });
    if (error) throw error;
    return data;
  },

  async registerFamily(login, password, pseudo, inviteCode) {
    const identifier = this.normalizeUisLogin(login);
    const email = this.toFamilyEmail(identifier);
    const cleanPseudo = String(pseudo || "").trim();
    const cleanCode = String(inviteCode || "").trim();

    if (!cleanPseudo) throw new Error("Choisis un nom dans le jeu.");
    if (!cleanCode) throw new Error("Entre ton code d’invitation Famille.");

    const { data, error } = await window.sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          pseudo: cleanPseudo,
          login_identifier: identifier,
          player_scope: "family",
          invite_code: cleanCode,
          is_fictive_email: true
        }
      }
    });
    if (error) throw error;

    const { error: redeemError } = await window.sb.rpc("redeem_family_invite", { p_code: cleanCode });
    if (redeemError) throw redeemError;

    return data;
  },

  async logout() {
    await window.sb.auth.signOut();
    window.location.href = "login.html";
  }
};

window.Auth = Auth;
