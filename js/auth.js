// ============================================================
// AUTH — LOGIN / REGISTER / LOGOUT
// ============================================================

const Auth = {
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

  async login(email, password) {
    const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async register(email, password, pseudo) {
    const { data, error } = await window.sb.auth.signUp({
      email,
      password,
      options: {
        data: { pseudo }
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
