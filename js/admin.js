// ============================================================
// LE NID DES PRONOS — ADMIN V1.0.15
// ============================================================

const H = window.Helpers;

const Admin = {
  state: {
    session: null,
    profile: null,
    users: [],
    matches: [],
    teams: [],
    footballTeams: [],
    chatMessages: [],
    chatModerationError: null,
    chatModerationScope: "all",
    chatModerationLimit: 30,
    quickScoreFilter: "work",
    adminSection: "quick",
    backups: []
  },

  async init() {
    this.state.session = await Auth.requireSession();
    if (!this.state.session) return;

    await this.loadProfile();
    if (this.state.profile.role !== "admin") {
      window.location.href = "app.html";
      return;
    }

    this.bindActions();
    await this.reloadAll();
    this.setupRealtime();
  },

  bindActions() {
    H.$("#backToApp")?.addEventListener("click", () => window.location.href = "app.html");
    H.$("#logoutBtn")?.addEventListener("click", () => Auth.logout());
    H.$("#logoutBtnMobile")?.addEventListener("click", () => Auth.logout());
    H.$("#refreshAdmin")?.addEventListener("click", () => this.reloadAll());
    H.$("#refreshAdminMobile")?.addEventListener("click", () => { this.closeMobileMenu(); this.reloadAll(); });
    this.bindMobileMenu();
    H.$("#recalcAllBtn")?.addEventListener("click", () => this.recalcAll());
    H.$("#addOfficeTeamForm")?.addEventListener("submit", (event) => this.addOfficeTeam(event));
    H.$("#createBackupBtn")?.addEventListener("click", () => this.createBackup());
    H.$("#restoreBackupBtn")?.addEventListener("click", () => this.restoreSelectedBackup());
    H.$("#resetPredictionsBtn")?.addEventListener("click", () => this.resetAllPredictions());
    H.$("#resetPreparationScoresBtn")?.addEventListener("click", () => this.resetPreparationScores());

    const scrollTopBtn = H.$("#adminScrollTopOwl");
    if (scrollTopBtn && scrollTopBtn.dataset.bound !== "true") {
      scrollTopBtn.dataset.bound = "true";
      const updateScrollTopButton = () => {
        scrollTopBtn.classList.toggle("is-visible", window.scrollY > 360);
      };
      scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
      window.addEventListener("scroll", updateScrollTopButton, { passive: true });
      updateScrollTopButton();
    }

    H.$$("[data-admin-section]").forEach((button) => {
      button.addEventListener("click", () => this.setAdminSection(button.dataset.adminSection || "quick"));
    });

    H.$$("#quickScoreFilters [data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        this.state.quickScoreFilter = button.dataset.filter || "work";
        H.$$("#quickScoreFilters [data-filter]").forEach((btn) => btn.classList.toggle("active", btn === button));
        this.renderQuickScores();
      });
    });
  },

  bindMobileMenu() {
    const toggle = H.$("#adminMobileMenuToggle");
    const closeBtn = H.$("#adminMobileMenuClose");
    const backdrop = H.$("#adminMobileMenuBackdrop");

    toggle?.addEventListener("click", () => this.openMobileMenu());
    closeBtn?.addEventListener("click", () => this.closeMobileMenu());
    backdrop?.addEventListener("click", () => this.closeMobileMenu());

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.closeMobileMenu();
    });
  },

  openMobileMenu() {
    const toggle = H.$("#adminMobileMenuToggle");
    const panel = H.$("#adminMobileMenuPanel");
    const backdrop = H.$("#adminMobileMenuBackdrop");
    if (!panel || !backdrop) return;

    panel.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add("mobile-menu-open");
    toggle?.setAttribute("aria-expanded", "true");
  },

  closeMobileMenu() {
    const toggle = H.$("#adminMobileMenuToggle");
    const panel = H.$("#adminMobileMenuPanel");
    const backdrop = H.$("#adminMobileMenuBackdrop");

    document.body.classList.remove("mobile-menu-open");
    toggle?.setAttribute("aria-expanded", "false");

    window.setTimeout(() => {
      if (!document.body.classList.contains("mobile-menu-open")) {
        if (panel) panel.hidden = true;
        if (backdrop) backdrop.hidden = true;
      }
    }, 160);
  },

  setAdminSection(section = "quick") {
    this.closeMobileMenu();
    this.state.adminSection = section;
    const titles = {
      quick: ["Saisie rapide des scores", "Prochains matchs en haut, validation rapide et scores manuels."],
      teams: ["Gestion des équipes", "Créer, renommer, recolorer ou supprimer les teams bureau."],
      messages: ["Modération des messages", "Masquer les messages du chat global ou des chats de team."],
      scores: ["Gestion complète des scores", "Modifier les scores, lieux, horaires, diffuseurs et recalculer."],
      backups: ["Sauvegardes", "Sauvegarder, restaurer ou remettre à zéro les pronostics."],
      users: ["Joueurs", "Gérer les joueurs, rôles, teams et statuts actif/inactif."]
    };

    H.$$("[data-admin-section]").forEach((btn) => btn.classList.toggle("active", btn.dataset.adminSection === section));
    H.$$("[data-section-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.sectionPanel === section));

    const title = H.$("#adminPageTitle");
    const subtitle = H.$("#adminPageSubtitle");
    if (title) title.innerHTML = `${H.icon(section === "teams" ? "classements" : section === "messages" ? "diffusion" : section === "scores" ? "score-exact" : section === "backups" ? "verrouille" : section === "users" ? "profil" : "admin", "")} ${H.escapeHtml(titles[section]?.[0] || "Administration")}`;
    if (subtitle) subtitle.textContent = titles[section]?.[1] || "Mode gestion.";
  },

  tvChannelTogglesHtml(match, prefix) {
    const channels = H.tvChannelList(match.tv_channel);
    const selected = channels.includes("w9") ? "w9" : channels.includes("m6") ? "m6" : "bein";
    const name = `${prefix}-tv-${match.id || Math.random().toString(36).slice(2)}`;

    const option = (value, label, logos, title) => `
      <label class="tv-choice ${selected === value ? "selected" : ""}" title="${H.escapeHtml(title)}">
        <input class="${prefix}-tv-choice" type="radio" name="${H.escapeHtml(name)}" value="${value}" ${selected === value ? "checked" : ""}>
        <span class="tv-choice-label">${H.escapeHtml(label)}</span>
        <span class="tv-choice-logos">${logos}</span>
      </label>
    `;

    const beinLogo = `<img class="tv-logo tv-logo-bein" src="assets/icons/bein.png" alt="beIN Sports" loading="lazy">`;
    const m6Logo = `<img class="tv-logo tv-logo-m6" src="assets/icons/m6.png" alt="M6" loading="lazy">`;
    const w9Logo = `<img class="tv-logo tv-logo-w9" src="assets/icons/w9.png" alt="W9" loading="lazy">`;

    return `
      <div class="tv-choice-row" aria-label="Diffuseurs TV">
        ${option("bein", "beIN seul", beinLogo, "Tous les matchs sont sur beIN Sports")}
        ${option("m6", "beIN + M6", `${beinLogo}${m6Logo}`, "Ajouter M6 sur ce match")}
        ${option("w9", "beIN + W9", `${beinLogo}${w9Logo}`, "Ajouter W9 sur ce match")}
      </div>
    `;
  },

  bindTvChannelToggles(root) {
    H.$$(".tv-choice input", root).forEach((input) => {
      input.addEventListener("change", (event) => {
        const row = event.currentTarget.closest(".tv-choice-row");
        if (!row) return;
        H.$$(".tv-choice", row).forEach((label) => {
          const radio = label.querySelector("input");
          label.classList.toggle("selected", Boolean(radio?.checked));
        });
      });
    });
  },

  tvChannelValueFromRow(row, prefix) {
    const value = row.querySelector(`.${prefix}-tv-choice:checked`)?.value || "bein";
    if (value === "w9") return "beIN Sports / W9";
    if (value === "m6") return "beIN Sports / M6";
    return "beIN Sports";
  },

  toDatetimeLocalValue(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },


  hostCountryOptionsHtml(currentCode = "") {
    const code = String(currentCode || "").toUpperCase();
    const options = [
      { code: "", label: "Pays hôte" },
      { code: "MX", label: "Mexique" },
      { code: "US", label: "États-Unis" },
      { code: "CA", label: "Canada" }
    ];
    return options.map((option) => `<option value="${option.code}" ${code === option.code ? "selected" : ""}>${H.escapeHtml(option.label)}</option>`).join("");
  },

  matchInfoEditorHtml(match, prefix) {
    return `
      <details class="match-info-editor ${prefix}-match-edit">
        <summary>Modifier horaire / lieu</summary>
        <p class="mini-help">Format d’affichage : pays - ville - stade.</p>
        <div class="match-info-grid location-admin-grid">
          <label>
            Horaire
            <input class="${prefix}-kickoff" type="datetime-local" value="${H.escapeHtml(this.toDatetimeLocalValue(match.kickoff_at))}">
          </label>
          <label>
            Pays hôte
            <div class="host-country-editor">
              <select class="${prefix}-host-country" aria-label="Pays hôte">
                ${this.hostCountryOptionsHtml(match.venue_country_code)}
              </select>
              <span class="host-country-preview">${H.hostCountryFlagHtml(match, "host-country-flag location-country-flag")}</span>
            </div>
          </label>
          <label>
            Ville
            <input class="${prefix}-city" type="text" value="${H.escapeHtml(match.city || "")}" placeholder="Ville">
          </label>
          <label>
            Stade
            <input class="${prefix}-venue" type="text" value="${H.escapeHtml(match.venue || "")}" placeholder="Stade à confirmer">
          </label>
        </div>
      </details>
    `;
  },

  matchInfoPayloadFromRow(row, prefix) {
    const kickoffInput = row.querySelector(`.${prefix}-kickoff`);
    const venueInput = row.querySelector(`.${prefix}-venue`);
    const cityInput = row.querySelector(`.${prefix}-city`);
    const countryInput = row.querySelector(`.${prefix}-host-country`);
    const payload = {};

    if (kickoffInput && kickoffInput.value) {
      const kickoffDate = new Date(kickoffInput.value);
      if (!Number.isNaN(kickoffDate.getTime())) {
        payload.kickoff_at = kickoffDate.toISOString();
        payload.match_day = kickoffInput.value.slice(0, 10);
      }
    }

    if (venueInput) payload.venue = venueInput.value.trim() || null;
    if (cityInput) payload.city = cityInput.value.trim() || null;
    if (countryInput) {
      const info = H.hostCountryInfo(countryInput.value);
      payload.venue_country_code = info?.code || null;
      payload.venue_country_name = info?.name || null;
      payload.venue_country_flag_url = info?.flagUrl || null;
    }

    return payload;
  },

  async loadProfile() {
    const { data, error } = await window.sb
      .from("profiles")
      .select("id,email,pseudo,role,is_active")
      .eq("id", this.state.session.user.id)
      .single();

    if (error) throw error;
    this.state.profile = data;
  },

  async reloadAll() {
    await Promise.all([
      this.loadUsers(),
      this.loadTeams(),
      this.loadFootballTeams(),
      this.loadMatches(),
      this.loadBackups(),
      this.loadChatMessages()
    ]);

    this.renderUsers();
    this.renderTeams();
    this.renderChatModeration();
    this.renderQuickScores();
    this.renderMatches();
    this.renderBackups();
    this.setAdminSection(this.state.adminSection || "quick");
    H.toast("Admin rafraîchi", "success");
  },

  async loadUsers() {
    const { data, error } = await window.sb
      .from("profiles")
      .select("id,email,pseudo,role,office_team_id,is_active,inactive_reason,created_at,avatar_key,badge_shape,badge_color,profile_setup_done")
      .order("pseudo");

    if (error) throw error;
    this.state.users = data || [];
  },

  async loadTeams() {
    const { data, error } = await window.sb
      .from("office_teams")
      .select("id,name,slug,color,avatar_url")
      .order("name");

    if (error) throw error;
    this.state.teams = data || [];
  },

  async loadFootballTeams() {
    const { data, error } = await window.sb
      .from("football_teams")
      .select("id,name,short_name,country_code,flag_url")
      .order("name");

    if (error) throw error;
    this.state.footballTeams = data || [];
  },

  async loadMatches() {
    const { data, error } = await window.sb
      .from("v_matches")
      .select("*")
      .order("kickoff_at", { ascending: true });

    if (error) throw error;
    this.state.matches = data || [];
  },

  async loadBackups() {
    const { data, error } = await window.sb
      .from("app_backups")
      .select("id,label,backup_type,created_at,created_by")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.warn("Sauvegardes indisponibles : lance le patch SQL V0.22.0", error);
      this.state.backups = [];
      return;
    }

    this.state.backups = data || [];
  },

  async loadChatMessages() {
    this.state.chatModerationError = null;
    const scope = this.state.chatModerationScope || "all";
    let query = window.sb
      .from("v_admin_team_chat_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.max(10, Number(this.state.chatModerationLimit || 30)));

    if (scope === "global") query = query.eq("scope", "global");
    if (scope === "team") query = query.eq("scope", "team");
    if (scope === "hidden") query = query.not("deleted_at", "is", null);

    const { data, error } = await query;
    if (error) {
      console.warn("Modération chat indisponible : lance le patch SQL V0.25.1", error);
      this.state.chatMessages = [];
      this.state.chatModerationError = error;
      return;
    }

    this.state.chatMessages = data || [];
  },

  renderUsers() {
    const root = H.$("#usersAdmin");
    root.innerHTML = `
      <div class="admin-list">
        ${this.state.users.map((user) => {
          const teamOptions = this.state.teams.map((team) => `
            <option value="${team.id}" ${user.office_team_id === team.id ? "selected" : ""}>${H.escapeHtml(team.name)}</option>
          `).join("");

          return `
            <article class="admin-row ${!user.is_active ? "inactive" : ""}" data-user-id="${user.id}">
              <div class="admin-main user-admin-main">
                ${H.profileBadgeHtml(user, "profile-badge mini")}
                <div><strong>${H.escapeHtml(user.pseudo)}</strong>
                <small>${H.escapeHtml(user.email || "")}</small>
                ${!user.is_active ? `<span class="pill danger">Inactif</span>` : `<span class="pill success">Actif</span>`}
                  ${!user.profile_setup_done ? `<span class="pill neutral">Profil à compléter</span>` : ""}
                </div>
              </div>

              <div class="admin-controls">
                <select class="user-team-select">
                  <option value="">Sans team</option>
                  ${teamOptions}
                </select>
                <select class="user-role-select">
                  <option value="user" ${user.role === "user" ? "selected" : ""}>Joueur</option>
                  <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
                </select>
                <button class="ghost-btn save-user-btn">Sauver</button>
                ${user.is_active
                  ? `<button class="danger-btn toggle-active-btn" data-active="false">Désactiver</button>`
                  : `<button class="primary-btn toggle-active-btn" data-active="true">Réactiver</button>`
                }
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;

    H.$$(".save-user-btn", root).forEach((btn) => {
      btn.addEventListener("click", (event) => this.saveUser(event.currentTarget.closest(".admin-row")));
    });

    H.$$(".toggle-active-btn", root).forEach((btn) => {
      btn.addEventListener("click", (event) => this.toggleActive(event.currentTarget.closest(".admin-row"), event.currentTarget.dataset.active === "true"));
    });
  },

  async saveUser(row) {
    const userId = row.dataset.userId;
    const teamId = row.querySelector(".user-team-select").value || null;
    const role = row.querySelector(".user-role-select").value;

    const { error } = await window.sb
      .from("profiles")
      .update({ office_team_id: teamId, role })
      .eq("id", userId);

    if (error) {
      H.toast(error.message, "error");
      return;
    }

    H.toast("Utilisateur mis à jour", "success");
    await this.reloadAll();
  },

  async toggleActive(row, active) {
    const userId = row.dataset.userId;
    const reason = active ? null : prompt("Raison de la désactivation ?", "Ne participe plus") || "Désactivé par admin";

    const { error } = await window.sb.rpc("set_profile_active", {
      p_user_id: userId,
      p_is_active: active,
      p_reason: reason
    });

    if (error) {
      H.toast(error.message, "error");
      return;
    }

    H.toast(active ? "Joueur réactivé" : "Joueur désactivé", "success");
    await this.reloadAll();
  },

  renderTeams() {
    const root = H.$("#teamsAdmin");
    root.innerHTML = `
      <div class="team-admin-list">
        ${this.state.teams.map((team) => `
          <article class="team-admin-row" data-team-id="${team.id}">
            <div class="team-chip-preview" style="--team-color:${H.escapeHtml(team.color || "#facc15")}">
              <span></span>
              <strong>${H.escapeHtml(team.name)}</strong>
            </div>
            <div class="team-admin-fields">
              <input class="team-name-input" type="text" value="${H.escapeHtml(team.name)}" aria-label="Nom de la team">
              <input class="team-color-input" type="color" value="${H.escapeHtml(team.color || "#facc15")}" aria-label="Couleur de la team">
            </div>
            <div class="team-admin-actions">
              <button class="ghost-btn save-team-btn" type="button">Sauver</button>
              <button class="danger-btn delete-team-btn" type="button">Supprimer</button>
            </div>
          </article>
        `).join("")}
      </div>
    `;

    H.$$(".save-team-btn", root).forEach((btn) => {
      btn.addEventListener("click", (event) => this.saveTeam(event.currentTarget.closest(".team-admin-row")));
    });

    H.$$(".delete-team-btn", root).forEach((btn) => {
      btn.addEventListener("click", (event) => this.deleteTeam(event.currentTarget.closest(".team-admin-row")));
    });
  },

  makeSlug(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `team-${Date.now()}`;
  },

  async saveTeam(row) {
    const teamId = row.dataset.teamId;
    const name = row.querySelector(".team-name-input").value.trim();
    const color = row.querySelector(".team-color-input").value || "#facc15";
    if (!name) return H.toast("Nom de team obligatoire", "error");

    const { error } = await window.sb
      .from("office_teams")
      .update({ name, color, slug: this.makeSlug(name), updated_at: new Date().toISOString() })
      .eq("id", teamId);

    if (error) return H.toast(error.message, "error");
    H.toast("Team mise à jour", "success");
    await this.reloadAll();
  },

  async deleteTeam(row) {
    const teamId = row.dataset.teamId;
    const name = row.querySelector(".team-name-input").value.trim();
    if (!confirm(`Supprimer la team ${name} ? Les joueurs associés passeront sans team.`)) return;

    const { error } = await window.sb
      .from("office_teams")
      .delete()
      .eq("id", teamId);

    if (error) return H.toast(error.message, "error");
    H.toast("Team supprimée", "success");
    await this.reloadAll();
  },

  async addOfficeTeam(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const color = formData.get("color") || "#facc15";

    if (!name) return;

    const slug = this.makeSlug(name);

    const { error } = await window.sb
      .from("office_teams")
      .upsert({ name, slug, color }, { onConflict: "slug" });

    if (error) {
      H.toast(error.message, "error");
      return;
    }

    form.reset();
    H.toast("Team ajoutée", "success");
    await this.reloadAll();
  },

  chatScopeLabel(message) {
    if (message.scope === "team") return message.office_team_name || "Chat team";
    return "Tout le monde";
  },

  renderChatModeration() {
    const root = H.$("#chatModerationAdmin");
    if (!root) return;

    const scope = this.state.chatModerationScope || "all";

    if (this.state.chatModerationError) {
      root.innerHTML = `
        <div class="chat-warning admin-chat-warning">
          <strong>Modération chat pas encore branchée.</strong>
          <p>Lance le patch SQL <code>patch_v0_25_1_teams_details_moderation.sql</code> dans Supabase.</p>
          <small>${H.escapeHtml(this.state.chatModerationError.message || "Vue admin manquante")}</small>
        </div>
      `;
      return;
    }

    root.innerHTML = `
      <div class="admin-chat-toolbar">
        <div class="segmented small">
          <button class="${scope === "all" ? "active" : ""}" type="button" data-chat-admin-filter="all">Tous</button>
          <button class="${scope === "global" ? "active" : ""}" type="button" data-chat-admin-filter="global">Global</button>
          <button class="${scope === "team" ? "active" : ""}" type="button" data-chat-admin-filter="team">Teams</button>
          <button class="${scope === "hidden" ? "active" : ""}" type="button" data-chat-admin-filter="hidden">Masqués</button>
        </div>
        <div class="admin-chat-actions">
          <button class="ghost-btn" id="loadMoreAdminChatBtn" type="button">Afficher plus</button>
          <button class="ghost-btn" id="refreshAdminChatBtn" type="button">Rafraîchir</button>
        </div>
      </div>

      <div class="admin-chat-list">
        ${this.state.chatMessages.length ? this.state.chatMessages.map((message) => `
          <article class="admin-chat-row ${message.deleted_at ? "hidden-message" : ""}" data-message-id="${H.escapeHtml(message.id)}">
            <div class="admin-chat-main">
              ${H.profileBadgeHtml({
                pseudo: message.author_pseudo,
                office_team_color: message.author_office_team_color,
                avatar_key: message.avatar_key || "owl-01",
                badge_shape: message.badge_shape || "rounded",
                badge_color: message.badge_color || message.author_office_team_color || "#facc15"
              }, "profile-badge mini")}
              <div>
                <strong>${H.escapeHtml(message.author_pseudo || "Joueur")}</strong>
                <small>${H.escapeHtml(this.chatScopeLabel(message))} · ${H.formatDateTime(message.created_at)}${message.deleted_at ? ` · masqué le ${H.formatDateTime(message.deleted_at)}` : ""}</small>
                <p>${H.escapeHtml(message.body)}</p>
                ${message.deleted_reason ? `<small class="moderation-reason">Raison : ${H.escapeHtml(message.deleted_reason)}</small>` : ""}
              </div>
            </div>
            <div class="admin-chat-row-actions">
              ${message.deleted_at
                ? `<span class="pill danger">Masqué</span>`
                : `<button class="danger-btn hide-chat-message-btn" type="button">Masquer</button>`}
            </div>
          </article>
        `).join("") : `<p class="muted">Aucun message dans ce filtre.</p>`}
      </div>
    `;

    H.$$('[data-chat-admin-filter]', root).forEach((button) => {
      button.addEventListener("click", async () => {
        this.state.chatModerationScope = button.dataset.chatAdminFilter || "all";
        this.state.chatModerationLimit = 30;
        await this.loadChatMessages();
        this.renderChatModeration();
      });
    });

    H.$("#refreshAdminChatBtn", root)?.addEventListener("click", async () => {
      await this.loadChatMessages();
      this.renderChatModeration();
      H.toast("Messages rafraîchis", "success");
    });

    H.$("#loadMoreAdminChatBtn", root)?.addEventListener("click", async () => {
      this.state.chatModerationLimit += 30;
      await this.loadChatMessages();
      this.renderChatModeration();
    });

    H.$$(".hide-chat-message-btn", root).forEach((button) => {
      button.addEventListener("click", (event) => this.hideChatMessage(event.currentTarget.closest(".admin-chat-row")));
    });
  },

  async hideChatMessage(row) {
    const messageId = row?.dataset.messageId;
    if (!messageId) return;

    const reason = prompt("Raison de modération ?", "Message masqué par admin") || "Message masqué par admin";
    if (!confirm("Masquer ce message ? Il ne sera plus visible côté joueurs.")) return;

    const { error } = await window.sb.rpc("moderate_team_chat_message", {
      p_message_id: messageId,
      p_reason: reason
    });

    if (error) {
      H.toast(error.message, "error");
      return;
    }

    H.toast("Message masqué", "success");
    await this.loadChatMessages();
    this.renderChatModeration();
  },


  isMatchBeforeKickoff(matchOrKickoff) {
    const kickoffAt = typeof matchOrKickoff === "string" ? matchOrKickoff : matchOrKickoff?.kickoff_at;
    if (!kickoffAt) return false;
    return new Date(kickoffAt).getTime() > Date.now();
  },

  canScoreMatch(matchOrKickoff) {
    return !this.isMatchBeforeKickoff(matchOrKickoff);
  },

  statusOptionsHtml(currentStatus, canScore = true) {
    const statuses = canScore
      ? ["scheduled", "live", "finished", "postponed", "cancelled"]
      : ["scheduled", "postponed", "cancelled"];

    return statuses
      .map((s) => `<option value="${s}" ${currentStatus === s ? "selected" : ""}>${H.statusLabel(s)}</option>`)
      .join("");
  },

  localDateKey(value) {
    if (!value) return "";
    const d = new Date(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },

  matchAdminPriority(match) {
    const kickoff = match?.kickoff_at ? new Date(match.kickoff_at).getTime() : 9999999999999;
    if (match.status === "live") return { bucket: 0, kickoff };
    if (!["finished", "cancelled"].includes(match.status)) return { bucket: 1, kickoff };
    if (match.status === "cancelled") return { bucket: 8, kickoff };
    return { bucket: 9, kickoff };
  },

  sortMatchesForAdmin(matches = []) {
    return [...matches].sort((a, b) => {
      const pa = this.matchAdminPriority(a);
      const pb = this.matchAdminPriority(b);
      if (pa.bucket !== pb.bucket) return pa.bucket - pb.bucket;

      // Les prochains matchs montent en haut. Les matchs terminés descendent en bas,
      // avec le plus récent en premier dans leur zone.
      if (pa.bucket >= 8) return pb.kickoff - pa.kickoff;
      return pa.kickoff - pb.kickoff;
    });
  },

  groupMatchesForAdmin(matches = []) {
    return Object.values(H.groupMatchesByPouleRound(matches))
      .map((group) => {
        const sortedMatches = this.sortMatchesForAdmin(group.matches);
        const openMatches = sortedMatches.filter((m) => !["finished", "cancelled"].includes(m.status));
        const liveMatches = sortedMatches.filter((m) => m.status === "live");
        const finishedMatches = sortedMatches.filter((m) => m.status === "finished");
        const nextKickoff = openMatches[0]?.kickoff_at
          ? new Date(openMatches[0].kickoff_at).getTime()
          : 9999999999999;
        const isCompletedGroup = openMatches.length === 0;

        return {
          ...group,
          matches: sortedMatches,
          openMatches,
          liveMatches,
          finishedMatches,
          isCompletedGroup,
          adminOrder: isCompletedGroup ? 1000 + group.order : group.order,
          nextKickoff
        };
      })
      .sort((a, b) => {
        // Les phases avec matchs encore à traiter restent avant les phases déjà validées.
        if (a.isCompletedGroup !== b.isCompletedGroup) return a.isCompletedGroup ? 1 : -1;
        return a.adminOrder - b.adminOrder || a.nextKickoff - b.nextKickoff;
      });
  },

  getQuickScoreMatches() {
    const filter = this.state.quickScoreFilter || "work";
    const todayKey = this.localDateKey(new Date());

    const matches = this.state.matches
      .filter((match) => {
        const matchDateKey = this.localDateKey(match.kickoff_at);
        if (filter === "all") return true;
        if (filter === "today") return matchDateKey === todayKey;
        if (filter === "finished") return ["finished", "cancelled"].includes(match.status);
        if (filter === "next") return !["finished", "cancelled"].includes(match.status);
        // Mode par défaut : on garde tout, mais l'ordre met les prochains en haut
        // et les matchs validés/terminés en bas.
        return true;
      });

    return this.sortMatchesForAdmin(matches).slice(0, 104);
  },

  renderQuickScores() {
    const root = H.$("#quickScoresAdmin");
    if (!root) return;

    const matches = this.getQuickScoreMatches();

    if (!matches.length) {
      root.innerHTML = `
        <div class="empty-state compact">
          Aucun match dans ce filtre.
        </div>
      `;
      return;
    }

    const grouped = this.groupMatchesForAdmin(matches);

    root.innerHTML = grouped.map((group) => {
      const groupClasses = ["quick-score-group"];
      if (group.isCompletedGroup) groupClasses.push("completed-group");
      if (group.liveMatches.length) groupClasses.push("live-group");

      return `
        <section class="${groupClasses.join(" ")}">
          <div class="quick-score-group-head">
            <div>
              <h3>${H.escapeHtml(group.key)}</h3>
              <p>
                ${group.matches.length} match${group.matches.length > 1 ? "s" : ""} · ${H.matchDateRangeLabel(group.matches)}
                ${group.openMatches.length ? ` · ${group.openMatches.length} à traiter` : " · phase validée"}
              </p>
            </div>
            <div class="phase-status-pills">
              ${group.liveMatches.length ? `<span class="pill warning">${group.liveMatches.length} en direct</span>` : ""}
              <span class="pill ${group.isCompletedGroup ? "success" : "neutral"}">${group.finishedMatches.length}/${group.matches.length} terminés</span>
            </div>
          </div>
          <div class="quick-score-group-grid">
            ${group.matches.map((match) => this.quickScoreCardHtml(match)).join("")}
          </div>
        </section>
      `;
    }).join("");

    H.$$(".score-step", root).forEach((button) => {
      button.addEventListener("click", (event) => this.changeQuickScore(event.currentTarget));
    });

    H.$$(".quick-home-score, .quick-away-score", root).forEach((input) => {
      input.addEventListener("input", (event) => this.autoSelectWinner(event.currentTarget.closest(".quick-score-card")));
    });

    H.$$(".quick-live-btn", root).forEach((button) => {
      button.addEventListener("click", (event) => {
        const row = event.currentTarget.closest(".quick-score-card");
        row.querySelector(".quick-status").value = "live";
        this.saveQuickScore(row);
      });
    });

    H.$$(".quick-save-btn", root).forEach((button) => {
      button.addEventListener("click", (event) => this.saveQuickScore(event.currentTarget.closest(".quick-score-card")));
    });

    H.$$(".quick-finish-btn", root).forEach((button) => {
      button.addEventListener("click", (event) => this.saveQuickScore(event.currentTarget.closest(".quick-score-card"), true));
    });

    this.bindTvChannelToggles(root);
  },

  quickScoreCardHtml(match) {
    const isKnockout = match.stage !== "group";
    const canScore = this.canScoreMatch(match);
    const scoreLockHint = canScore
      ? ""
      : `<div class="score-lock-hint">${H.icon("lock")} Match pas encore commencé : scores et statut "Terminé" verrouillés.</div>`;
    const scoreDisabled = canScore ? "" : "disabled";
    const winnerOptions = `
      <option value="">${isKnockout ? "Qualifié à choisir si match nul" : "Vainqueur auto / nul"}</option>
      <option value="${match.home_team_id}" ${match.winner_team_id === match.home_team_id ? "selected" : ""}>${H.escapeHtml(match.home_team_name)}</option>
      <option value="${match.away_team_id}" ${match.winner_team_id === match.away_team_id ? "selected" : ""}>${H.escapeHtml(match.away_team_name)}</option>
    `;

    return `
      <article class="quick-score-card status-${H.escapeHtml(match.status || "scheduled")}" data-match-id="${match.id}" data-home-team-id="${match.home_team_id}" data-away-team-id="${match.away_team_id}" data-stage="${match.stage}" data-kickoff-at="${H.escapeHtml(match.kickoff_at || "")}">
        <div class="quick-score-head">
          <div>
            <strong>${H.matchFlagHtml(match, "home")} ${H.escapeHtml(match.home_team_name)} <span>vs</span> ${H.matchFlagHtml(match, "away")} ${H.escapeHtml(match.away_team_name)}</strong>
            <small>${H.formatDateTime(match.kickoff_at)} · ${H.shortPoolRoundLabel(match)} · ${H.statusLabel(match.status)}</small>
            <small class="quick-location-line">${H.matchLocationHtml(match, true)}</small>
          </div>
          <div class="quick-score-pills">
            ${match.is_test_match ? `<span class="pill warning">TEST</span>` : ""}
            <span class="pill ${match.status === "finished" ? "success" : match.status === "live" ? "warning" : ""}">${H.statusLabel(match.status)}</span>
          </div>
        </div>

        ${scoreLockHint}

        <div class="quick-score-controls">
          <div class="quick-team-score">
            <span>${H.escapeHtml(match.home_team_short_name || match.home_team_name)}</span>
            <div class="score-stepper" data-field="home">
              <button type="button" class="score-step" data-delta="-1" ${scoreDisabled}>−</button>
              <input class="quick-home-score" type="number" min="0" inputmode="numeric" value="${match.home_score ?? ""}" placeholder="0" ${scoreDisabled}>
              <button type="button" class="score-step" data-delta="1" ${scoreDisabled}>+</button>
            </div>
          </div>

          <div class="quick-score-separator">—</div>

          <div class="quick-team-score right">
            <span>${H.escapeHtml(match.away_team_short_name || match.away_team_name)}</span>
            <div class="score-stepper" data-field="away">
              <button type="button" class="score-step" data-delta="-1" ${scoreDisabled}>−</button>
              <input class="quick-away-score" type="number" min="0" inputmode="numeric" value="${match.away_score ?? ""}" placeholder="0" ${scoreDisabled}>
              <button type="button" class="score-step" data-delta="1" ${scoreDisabled}>+</button>
            </div>
          </div>
        </div>

        <div class="quick-score-meta">
          <select class="quick-status" aria-label="Statut du match">
            ${this.statusOptionsHtml(match.status, canScore)}
          </select>
          <select class="quick-winner" aria-label="Vainqueur ou qualifié" ${scoreDisabled}>
            ${winnerOptions}
          </select>
          ${this.tvChannelTogglesHtml(match, "quick")}
        </div>

        ${this.matchInfoEditorHtml(match, "quick")}

        <div class="quick-score-actions">
          <button type="button" class="ghost-btn quick-live-btn" ${scoreDisabled}>En direct</button>
          <button type="button" class="primary-btn quick-finish-btn" ${scoreDisabled}>Sauver + terminé</button>
          <button type="button" class="ghost-btn quick-save-btn">Sauver</button>
        </div>
      </article>
    `;
  },

  getScoreValue(row, selector) {
    const value = row.querySelector(selector).value;
    return value === "" ? null : Math.max(0, Number(value));
  },

  changeQuickScore(button) {
    const row = button.closest(".quick-score-card");
    const stepper = button.closest(".score-stepper");
    const field = stepper.dataset.field;
    const input = field === "home" ? row.querySelector(".quick-home-score") : row.querySelector(".quick-away-score");
    const delta = Number(button.dataset.delta || 0);
    const current = input.value === "" ? 0 : Number(input.value);
    input.value = Math.max(0, current + delta);
    this.autoSelectWinner(row);
  },

  autoSelectWinner(row) {
    const home = this.getScoreValue(row, ".quick-home-score");
    const away = this.getScoreValue(row, ".quick-away-score");
    const winner = row.querySelector(".quick-winner");

    if (home === null || away === null) return;
    if (home > away) winner.value = row.dataset.homeTeamId;
    if (away > home) winner.value = row.dataset.awayTeamId;
    if (home === away && row.dataset.stage === "group") winner.value = "";
  },

  async saveQuickScore(row, forceFinished = false) {
    const matchId = row.dataset.matchId;
    const homeScore = this.getScoreValue(row, ".quick-home-score");
    const awayScore = this.getScoreValue(row, ".quick-away-score");
    const status = forceFinished ? "finished" : row.querySelector(".quick-status").value;
    const stage = row.dataset.stage;
    const infoPayload = this.matchInfoPayloadFromRow(row, "quick");
    const effectiveKickoffAt = infoPayload.kickoff_at || row.dataset.kickoffAt;
    const canScore = this.canScoreMatch(effectiveKickoffAt);
    let winnerTeamId = row.querySelector(".quick-winner").value || null;

    if (!canScore && ["live", "finished"].includes(status)) {
      H.toast("Ce match n'a pas encore commencé : impossible de le passer en direct ou terminé.", "error");
      return;
    }

    if (!canScore && (homeScore !== null || awayScore !== null || winnerTeamId)) {
      H.toast("Ce match n'a pas encore commencé : les scores sont verrouillés. Tu peux seulement modifier la chaîne TV ou le statut reporté/annulé.", "error");
      return;
    }

    if (status === "finished" && (homeScore === null || awayScore === null)) {
      H.toast("Entre les deux scores avant de terminer le match.", "error");
      return;
    }

    if (homeScore !== null && awayScore !== null) {
      if (homeScore > awayScore) winnerTeamId = row.dataset.homeTeamId;
      if (awayScore > homeScore) winnerTeamId = row.dataset.awayTeamId;
      if (homeScore === awayScore && stage === "group") winnerTeamId = null;
    }

    if (status === "finished" && stage !== "group" && homeScore === awayScore && !winnerTeamId) {
      H.toast("Choisis le qualifié pour ce match à élimination directe.", "error");
      return;
    }

    const payload = {
      status,
      home_score: homeScore,
      away_score: awayScore,
      winner_team_id: winnerTeamId,
      tv_channel: this.tvChannelValueFromRow(row, "quick"),
      tv_channel_source: "manual",
      ...infoPayload
    };

    const saveBtn = row.querySelector(".quick-save-btn");
    const finishBtn = row.querySelector(".quick-finish-btn");
    if (saveBtn) saveBtn.disabled = true;
    if (finishBtn) finishBtn.disabled = true;

    const { error } = await window.sb
      .from("matches")
      .update(payload)
      .eq("id", matchId);

    if (saveBtn) saveBtn.disabled = false;
    if (finishBtn) finishBtn.disabled = false;

    if (error) {
      H.toast(error.message, "error");
      return;
    }

    H.toast(status === "finished" ? "Score enregistré et match terminé" : "Match enregistré", "success");
    await this.reloadAll();
  },

  renderMatches() {
    const root = H.$("#matchesAdmin");
    const grouped = this.groupMatchesForAdmin(this.state.matches);

    root.innerHTML = grouped.map((group) => `
      <section class="admin-match-group ${group.isCompletedGroup ? "completed-group" : ""}">
        <div class="quick-score-group-head">
          <div>
            <h3>${H.escapeHtml(group.key)}</h3>
            <p>${group.matches.length} match${group.matches.length > 1 ? "s" : ""} · ${group.openMatches.length ? `${group.openMatches.length} à traiter` : "validés"}</p>
          </div>
          <span class="pill ${group.isCompletedGroup ? "success" : "neutral"}">${group.finishedMatches.length}/${group.matches.length} terminés</span>
        </div>
        <div class="admin-list">
          ${group.matches.map((match) => {
            const canScore = this.canScoreMatch(match);
            const scoreDisabled = canScore ? "" : "disabled";
            return `
              <article class="admin-row match-admin-row status-${H.escapeHtml(match.status || "scheduled")}" data-match-id="${match.id}" data-kickoff-at="${H.escapeHtml(match.kickoff_at || "")}">
                <div class="admin-main">
                  <strong>${H.matchFlagHtml(match, "home")} ${H.escapeHtml(match.home_team_name)} - ${H.matchFlagHtml(match, "away")} ${H.escapeHtml(match.away_team_name)}</strong>
                  <small>${H.formatDateTime(match.kickoff_at)} · ${H.shortPoolRoundLabel(match)} · ${H.statusLabel(match.status)} · <span class="admin-location-line">${H.matchLocationHtml(match, true)}</span></small>
                </div>
                ${this.matchInfoEditorHtml(match, "match")}
                <div class="admin-controls match-controls">
                  <select class="match-status">
                    ${this.statusOptionsHtml(match.status, canScore)}
                  </select>
                  <input class="match-home-score" type="number" min="0" placeholder="D" value="${match.home_score ?? ""}" ${scoreDisabled}>
                  <input class="match-away-score" type="number" min="0" placeholder="E" value="${match.away_score ?? ""}" ${scoreDisabled}>
                  <select class="match-winner" ${scoreDisabled}>
                    <option value="">Vainqueur / qualifié</option>
                    <option value="${match.home_team_id}" ${match.winner_team_id === match.home_team_id ? "selected" : ""}>${H.escapeHtml(match.home_team_name)}</option>
                    <option value="${match.away_team_id}" ${match.winner_team_id === match.away_team_id ? "selected" : ""}>${H.escapeHtml(match.away_team_name)}</option>
                  </select>
                  ${this.tvChannelTogglesHtml(match, "match")}
                  <button class="primary-btn save-match-btn">Sauver</button>
                  <button class="ghost-btn recalc-match-btn">Recalculer</button>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `).join("");

    H.$$(".save-match-btn", root).forEach((btn) => {
      btn.addEventListener("click", (event) => this.saveMatch(event.currentTarget.closest(".match-admin-row")));
    });

    H.$$(".recalc-match-btn", root).forEach((btn) => {
      btn.addEventListener("click", (event) => this.recalcMatch(event.currentTarget.closest(".match-admin-row").dataset.matchId));
    });

    this.bindTvChannelToggles(root);
  },

  async saveMatch(row) {
    const matchId = row.dataset.matchId;
    const homeScoreRaw = row.querySelector(".match-home-score").value;
    const awayScoreRaw = row.querySelector(".match-away-score").value;
    const status = row.querySelector(".match-status").value;
    const homeScore = homeScoreRaw === "" ? null : Number(homeScoreRaw);
    const awayScore = awayScoreRaw === "" ? null : Number(awayScoreRaw);
    const winnerTeamId = row.querySelector(".match-winner").value || null;
    const infoPayload = this.matchInfoPayloadFromRow(row, "match");
    const effectiveKickoffAt = infoPayload.kickoff_at || row.dataset.kickoffAt;
    const canScore = this.canScoreMatch(effectiveKickoffAt);

    if (!canScore && ["live", "finished"].includes(status)) {
      H.toast("Ce match n'a pas encore commencé : impossible de le passer en direct ou terminé.", "error");
      return;
    }

    if (!canScore && (homeScore !== null || awayScore !== null || winnerTeamId)) {
      H.toast("Ce match n'a pas encore commencé : les scores sont verrouillés.", "error");
      return;
    }

    const payload = {
      status,
      home_score: homeScore,
      away_score: awayScore,
      winner_team_id: winnerTeamId,
      tv_channel: this.tvChannelValueFromRow(row, "match"),
      tv_channel_source: "manual",
      ...infoPayload
    };

    const { error } = await window.sb
      .from("matches")
      .update(payload)
      .eq("id", matchId);

    if (error) {
      H.toast(error.message, "error");
      return;
    }

    H.toast("Match mis à jour", "success");
    await this.reloadAll();
  },

  async recalcMatch(matchId) {
    const { error } = await window.sb.rpc("recalc_match_points", { p_match_id: matchId });
    if (error) {
      H.toast(error.message, "error");
      return;
    }
    H.toast("Points du match recalculés", "success");
  },

  async recalcAll() {
    const { error } = await window.sb.rpc("recalc_all_points");
    if (error) {
      H.toast(error.message, "error");
      return;
    }
    H.toast("Tous les points ont été recalculés", "success");
  },

  renderBackups() {
    const select = H.$("#backupSelect");
    const list = H.$("#backupListAdmin");
    if (!select) return;

    if (!this.state.backups.length) {
      select.innerHTML = `<option value="">Aucune sauvegarde disponible</option>`;
      if (list) list.innerHTML = "";
      return;
    }

    select.innerHTML = this.state.backups.slice(0, 10).map((backup) => {
      const label = `${backup.label || backup.backup_type || "Sauvegarde"} · ${H.formatDateTime(backup.created_at)}`;
      return `<option value="${H.escapeHtml(backup.id)}">${H.escapeHtml(label)}</option>`;
    }).join("");

    if (list) list.innerHTML = "";
  },

  async createBackup() {
    const label = prompt("Nom de la sauvegarde ?", `Sauvegarde manuelle ${new Date().toLocaleString("fr-FR")}`);
    if (label === null) return;

    const { error } = await window.sb.rpc("create_app_backup", {
      p_label: label || "Sauvegarde manuelle",
      p_type: "manual"
    });

    if (error) {
      H.toast(error.message || "Sauvegarde impossible. As-tu lancé le patch SQL V0.22.0 ?", "error");
      return;
    }

    H.toast("Sauvegarde créée", "success");
    await this.loadBackups();
    this.renderBackups();
  },

  async restoreSelectedBackup() {
    const backupId = H.$("#backupSelect")?.value;
    if (!backupId) return H.toast("Choisis une sauvegarde", "error");
    if (!confirm("Restaurer cette sauvegarde ? Les pronos et résultats actuels seront remplacés par ceux de la sauvegarde.")) return;

    const { error } = await window.sb.rpc("restore_app_backup", { p_backup_id: backupId });
    if (error) {
      H.toast(error.message || "Restauration impossible", "error");
      return;
    }

    H.toast("Sauvegarde restaurée", "success");
    await this.reloadAll();
  },

  async resetAllPredictions() {
    const typed = H.$("#resetConfirmInput")?.value || "";
    if (typed !== "REMISE A ZERO") {
      H.toast("Tape exactement : REMISE A ZERO", "error");
      return;
    }
    if (!confirm("Dernière sécurité : supprimer tous les pronostics, badges calculés et messages du chat ? Une sauvegarde est créée avant. Les matchs restent conservés.")) return;

    const { error } = await window.sb.rpc("reset_all_predictions_secure", { p_confirm: "REMISE A ZERO" });
    if (error) {
      H.toast(error.message || "Remise à zéro impossible", "error");
      return;
    }

    H.$("#resetConfirmInput").value = "";
    H.toast("Pronos et messages remis à zéro", "success");
    await this.reloadAll();
  },

  async resetPreparationScores() {
    if (!confirm("Remettre à zéro uniquement les scores des matchs de préparation ? Les pronos joueurs restent conservés.")) return;

    const { error } = await window.sb.rpc("reset_preparation_scores_secure");
    if (error) {
      H.toast(error.message || "Reset des scores de préparation impossible. As-tu lancé le patch SQL V0.26.0 ?", "error");
      return;
    }

    H.toast("Scores de préparation remis à zéro", "success");
    await this.reloadAll();
  },

  setupRealtime() {
    window.sb
      .channel("admin-realtime-v0-26-0")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, async () => {
        await this.loadMatches();
        this.renderQuickScores();
        this.renderMatches();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "prediction_points" }, () => {
        console.info("[Le Nid des Pronos] Points recalculés");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "team_chat_messages" }, async () => {
        await this.loadChatMessages();
        this.renderChatModeration();
      })
      .subscribe((status) => {
        console.info("[Le Nid des Pronos] Realtime admin:", status);
      });
  }

};

window.addEventListener("DOMContentLoaded", () => {
  Admin.init().catch((error) => {
    console.error(error);
    H.toast(error.message || "Erreur admin", "error");
  });
});
