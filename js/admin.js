// ============================================================
// LE NID DES PRONOS — ADMIN V1.2.6
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
    backups: [],
    familyInvites: [],
    appSettings: {},
    familyModeEnabled: false,
    preparationModuleEnabled: true,
    auditLogs: [],
    healthSnapshot: null,
    healthError: null,
    finalReportSelectedUserId: null
  },

  isSuperAdmin() {
    return this.state.profile?.role === "super_admin";
  },

  isScoreAdmin() {
    return ["admin", "super_admin"].includes(this.state.profile?.role);
  },

  async logAdminAction(action, category = "system", details = {}) {
    if (!this.isSuperAdmin()) return;

    const { error } = await window.sb.rpc("admin_log_action", {
      p_action: action,
      p_category: category,
      p_details: details || {},
      p_metadata: {
        app_version: "1.2.5",
        source: "admin_front"
      }
    });

    if (error) {
      console.warn("Journal admin indisponible", error);
    }
  },

  roleLabel(role) {
    if (role === "super_admin") return "Super admin";
    if (role === "admin") return "Admin matchs";
    if (role === "family") return "Famille";
    return "Joueur";
  },

  async init() {
    this.state.session = await Auth.requireSession();
    if (!this.state.session) return;

    await this.loadProfile();
    if (!["admin", "super_admin"].includes(this.state.profile.role)) {
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
    H.$("#togglePreparationModuleBtn")?.addEventListener("click", () => this.togglePreparationModule());
    H.$("#refreshHealthBtn")?.addEventListener("click", async () => { await this.loadHealthSnapshot(); this.renderHealth(); });
    H.$("#refreshAuditBtn")?.addEventListener("click", async () => { await this.loadAuditLogs(); this.renderAudit(); });

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
      health: ["Santé du Nid", "Contrôler rapidement les voyants essentiels de l’application."],
      audit: ["Journal du Nid", "Consulter les actions sensibles effectuées dans l’administration."],
      "final-report": ["Bilan PDF final", "Prévisualiser les carnets de vol et diplômes de fin de compétition."],
      users: ["Joueurs", "Gérer les joueurs, rôles, teams et statuts actif/inactif."],
      family: ["Mode Famille", "Invitations, inscriptions Famille et droits associés."]
    };

    H.$$("[data-admin-section]").forEach((btn) => btn.classList.toggle("active", btn.dataset.adminSection === section));
    H.$$("[data-section-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.sectionPanel === section));

    const title = H.$("#adminPageTitle");
    const subtitle = H.$("#adminPageSubtitle");
    const sectionIcon = {
      quick: "admin",
      teams: "classements",
      messages: "diffusion",
      scores: "score-exact",
      backups: "verrouille",
      health: "sante",
      audit: "journal",
      "final-report": "bilan",
      users: "profil",
      family: "famille"
    }[section] || "admin";
    if (title) title.innerHTML = `${H.icon(sectionIcon, "")} ${H.escapeHtml(titles[section]?.[0] || "Administration")}`;
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
      .select("id,email,pseudo,role,player_scope,is_active")
      .eq("id", this.state.session.user.id)
      .single();

    if (error) throw error;
    this.state.profile = data;
  },

  async reloadAll() {
    if (this.isSuperAdmin()) {
      await Promise.all([
        this.loadUsers(),
        this.loadTeams(),
        this.loadFootballTeams(),
        this.loadMatches(),
        this.loadBackups(),
        this.loadChatMessages(),
        this.loadFamilyInvites(),
        this.loadFamilyModeSetting(),
        this.loadAuditLogs(),
        this.loadHealthSnapshot()
      ]);

      this.renderUsers();
      this.renderTeams();
      this.renderChatModeration();
      this.renderQuickScores();
      this.renderMatches();
      this.renderBackups();
      this.renderFamilyAdmin();
      this.renderHealth();
      this.renderAudit();
      this.renderFinalReportAdmin();
    } else {
      await Promise.all([
        this.loadTeams(),
        this.loadFootballTeams(),
        this.loadMatches(),
        this.loadFamilyModeSetting()
      ]);
      this.renderQuickScores();
      this.renderMatches();
      if (!["quick", "scores"].includes(this.state.adminSection)) this.state.adminSection = "quick";
    }

    this.applyRolePermissions();
    this.setAdminSection(this.state.adminSection || "quick");
    H.toast("Admin rafraîchi", "success");
  },

  async loadUsers() {
    const { data, error } = await window.sb
      .from("profiles")
      .select("id,email,pseudo,role,player_scope,office_team_id,is_active,inactive_reason,created_at,avatar_key,badge_shape,badge_color,profile_setup_done,show_family_players,invited_by,is_banned,can_chat,can_predict,can_change_avatar,can_change_pseudo")
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

  async loadFamilyInvites() {
    const { data, error } = await window.sb
      .from("family_invites")
      .select("id,code,inviter_id,office_team_id,used_by,used_at,expires_at,created_at,revoked_at")
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      console.warn("Invitations Famille indisponibles", error);
      this.state.familyInvites = [];
      return;
    }
    this.state.familyInvites = data || [];
  },

  settingBoolean(value, fallback = false) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value === "true";
    if (value && typeof value === "object" && "enabled" in value) return Boolean(value.enabled);
    return Boolean(value);
  },

  async loadFamilyModeSetting() {
    const { data, error } = await window.sb
      .from("app_settings")
      .select("key,value")
      .in("key", ["family_mode_enabled", "preparation_module_enabled"]);

    if (error) {
      console.warn("Paramètres app indisponibles", error);
      this.state.familyModeEnabled = false;
      this.state.preparationModuleEnabled = true;
      return;
    }

    const settings = Object.fromEntries((data || []).map((row) => [row.key, row.value]));
    this.state.appSettings = settings;
    this.state.familyModeEnabled = this.settingBoolean(settings.family_mode_enabled, false);
    this.state.preparationModuleEnabled = this.settingBoolean(settings.preparation_module_enabled, true);
  },

  async loadAuditLogs() {
    if (!this.isSuperAdmin()) {
      this.state.auditLogs = [];
      return;
    }

    const { data, error } = await window.sb
      .from("admin_audit_logs")
      .select("id,created_at,actor_id,actor_email,actor_pseudo,action,category,details,metadata")
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      console.warn("Journal admin indisponible : lance le patch SQL V1.2.5", error);
      this.state.auditLogs = [];
      return;
    }

    this.state.auditLogs = data || [];
  },

  async loadHealthSnapshot() {
    if (!this.isSuperAdmin()) {
      this.state.healthSnapshot = null;
      return;
    }

    const { data, error } = await window.sb.rpc("admin_get_health_snapshot");
    if (error) {
      console.warn("Santé du Nid indisponible : lance le patch SQL V1.2.5", error);
      this.state.healthSnapshot = null;
      this.state.healthError = error;
      return;
    }

    this.state.healthError = null;
    this.state.healthSnapshot = Array.isArray(data) ? data[0] : data;
  },

  adminVisibleMatches(matches = this.state.matches) {
    return this.state.preparationModuleEnabled === false
      ? matches.filter((match) => !match.is_test_match)
      : matches;
  },

  applyRolePermissions() {
    const superAdmin = this.isSuperAdmin();
    H.$$('[data-admin-section]').forEach((btn) => {
      const section = btn.dataset.adminSection;
      const allowed = superAdmin || ["quick", "scores"].includes(section);
      btn.hidden = !allowed;
      btn.disabled = !allowed;
    });
    H.$$('[data-section-panel]').forEach((panel) => {
      const section = panel.dataset.sectionPanel;
      panel.hidden = !(superAdmin || ["quick", "scores"].includes(section));
    });
  },


  healthLevelMeta(level) {
    const key = level || "info";
    if (key === "ok") return { label: "OK", className: "ok", emoji: "🟢" };
    if (key === "warning") return { label: "Attention", className: "warning", emoji: "🟠" };
    if (key === "danger") return { label: "Problème", className: "danger", emoji: "🔴" };
    return { label: "Info", className: "info", emoji: "🔵" };
  },

  renderHealth() {
    const root = H.$("#healthAdmin");
    if (!root) return;

    if (this.state.healthError) {
      root.innerHTML = `
        <div class="admin-empty-state health-error-state">
          <strong>Diagnostic indisponible</strong>
          <p class="muted">Lance le patch SQL V1.2.5 pour activer la Santé du Nid.</p>
          <p class="muted small-note">${H.escapeHtml(this.state.healthError.message || "Erreur inconnue")}</p>
        </div>
      `;
      return;
    }

    const snapshot = this.state.healthSnapshot;
    if (!snapshot) {
      root.innerHTML = `<p class="muted">Diagnostic en attente...</p>`;
      return;
    }

    const summary = snapshot.summary || {};
    const checks = Array.isArray(snapshot.checks) ? snapshot.checks : [];
    const overall = this.healthLevelMeta(snapshot.overall || "info");

    const metric = (label, value, note = "") => `
      <article class="health-metric-card">
        <strong>${H.escapeHtml(String(value ?? "—"))}</strong>
        <span>${H.escapeHtml(label)}</span>
        ${note ? `<small>${H.escapeHtml(note)}</small>` : ""}
      </article>
    `;

    root.innerHTML = `
      <section class="health-hero health-${overall.className}">
        <div>
          <p class="eyebrow">${overall.emoji} ${overall.label}</p>
          <h3>${H.escapeHtml(snapshot.message || "État du Nid")}</h3>
          <p class="muted">Dernier diagnostic : ${H.formatDateTime(snapshot.checked_at || new Date().toISOString())}</p>
        </div>
        <button class="ghost-btn" type="button" id="healthRefreshInlineBtn">Relancer</button>
      </section>

      <div class="health-metrics-grid">
        ${metric("Joueurs actifs", summary.active_users)}
        ${metric("Comptes Famille", summary.family_users)}
        ${metric("Matchs officiels", summary.official_matches)}
        ${metric("Matchs préparation", summary.preparation_matches, summary.preparation_module_enabled === false ? "masqués" : "visibles")}
        ${metric("Coupons disponibles", summary.available_family_invites)}
        ${metric("Sauvegardes", summary.backups_count)}
        ${metric("Badges attribués", summary.badges_count)}
        ${metric("Messages chat visibles", summary.visible_chat_messages)}
      </div>

      <section class="admin-mini-panel health-checks-panel">
        <h3>Voyants détaillés</h3>
        <div class="health-check-list">
          ${checks.map((check) => {
            const meta = this.healthLevelMeta(check.level);
            return `
              <article class="health-check-row ${meta.className}">
                <span class="health-dot">${meta.emoji}</span>
                <div>
                  <strong>${H.escapeHtml(check.title || "Contrôle")}</strong>
                  <p class="muted">${H.escapeHtml(check.message || "")}</p>
                </div>
                <span class="pill ${meta.className === "ok" ? "success" : meta.className === "danger" ? "danger" : meta.className === "warning" ? "warning" : "neutral"}">${meta.label}</span>
              </article>
            `;
          }).join("") || `<p class="muted">Aucun voyant à afficher.</p>`}
        </div>
      </section>
    `;

    H.$("#healthRefreshInlineBtn", root)?.addEventListener("click", async () => {
      await this.loadHealthSnapshot();
      this.renderHealth();
    });
  },

  auditCategoryLabel(category) {
    const labels = {
      backup: "Sauvegarde",
      reset: "Reset",
      preparation: "Préparation",
      family: "Famille",
      user: "Joueur",
      chat: "Chat",
      score: "Score",
      system: "Système"
    };
    return labels[category] || category || "Action";
  },

  auditActionLabel(action) {
    const labels = {
      create_backup: "Sauvegarde créée",
      restore_backup: "Sauvegarde restaurée",
      reset_all_predictions: "Remise à zéro pronos",
      reset_preparation_scores: "Reset scores préparation",
      set_preparation_module: "Module préparation modifié",
      set_family_mode: "Mode Famille modifié",
      create_family_invite: "Coupon Famille créé",
      create_bonus_family_invite: "Coupon bonus créé",
      reset_family_invite: "Coupon réinitialisé",
      update_profile_controls: "Profil modifié",
      set_profile_active: "Activation joueur modifiée",
      hide_chat_message: "Message masqué",
      recalc_all_points: "Recalcul global",
      recalc_match_points: "Recalcul match",
      save_match: "Match modifié",
      save_quick_score: "Score rapide modifié"
    };
    return labels[action] || action || "Action admin";
  },

  renderAudit() {
    const root = H.$("#auditAdmin");
    if (!root) return;

    if (!this.state.auditLogs.length) {
      root.innerHTML = `
        <div class="admin-empty-state audit-empty-state">
          <strong>Aucune trace pour l’instant</strong>
          <p class="muted">Le journal se remplira avec les prochaines actions super admin. Lance le patch SQL V1.2.5 si cette zone reste vide après une action.</p>
        </div>
      `;
      return;
    }

    const filters = [
      ["all", "Tout"],
      ["reset", "Resets"],
      ["family", "Famille"],
      ["backup", "Sauvegardes"],
      ["preparation", "Préparation"],
      ["user", "Joueurs"],
      ["chat", "Chat"]
    ];

    root.innerHTML = `
      <div class="audit-toolbar segmented-control" id="auditFilters">
        ${filters.map(([key, label]) => `<button class="chip-btn ${key === "all" ? "active" : ""}" type="button" data-audit-filter="${key}">${label}</button>`).join("")}
      </div>
      <div class="admin-list audit-list" id="auditList">
        ${this.auditRowsHtml("all")}
      </div>
    `;

    H.$$("[data-audit-filter]", root).forEach((button) => {
      button.addEventListener("click", () => {
        H.$$("[data-audit-filter]", root).forEach((btn) => btn.classList.toggle("active", btn === button));
        const list = H.$("#auditList", root);
        if (list) list.innerHTML = this.auditRowsHtml(button.dataset.auditFilter || "all");
      });
    });
  },

  auditRowsHtml(filter = "all") {
    const rows = this.state.auditLogs.filter((log) => filter === "all" || log.category === filter);
    if (!rows.length) return `<p class="muted">Aucune action dans ce filtre.</p>`;

    return rows.map((log) => {
      const details = log.details || {};
      const detailItems = Object.entries(details)
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .slice(0, 4)
        .map(([key, value]) => `<span class="audit-detail-chip">${H.escapeHtml(key)} : ${H.escapeHtml(typeof value === "object" ? JSON.stringify(value) : String(value))}</span>`)
        .join("");

      return `
        <article class="admin-row audit-row">
          <div class="admin-main audit-main">
            <span class="profile-badge mini audit-icon">${H.icon("journal", "")}</span>
            <div>
              <strong>${H.escapeHtml(this.auditActionLabel(log.action))}</strong>
              <small>${H.formatDateTime(log.created_at)} · par ${H.escapeHtml(log.actor_pseudo || log.actor_email || "super admin")}</small>
              ${detailItems ? `<div class="audit-detail-line">${detailItems}</div>` : ""}
            </div>
          </div>
          <span class="pill neutral">${H.escapeHtml(this.auditCategoryLabel(log.category))}</span>
        </article>
      `;
    }).join("");
  },


  renderFinalReportAdmin() {
    const root = H.$("#finalReportAdmin");
    if (!root) return;

    const players = this.state.users
      .filter((user) => user.is_active !== false && !user.is_banned)
      .sort((a, b) => String(a.pseudo || a.email || "").localeCompare(String(b.pseudo || b.email || ""), "fr"));

    if (!this.state.finalReportSelectedUserId && players.length) {
      this.state.finalReportSelectedUserId = players[0].id;
    }

    const selectedId = this.state.finalReportSelectedUserId || "";
    const selected = players.find((player) => player.id === selectedId) || players[0];
    const previewUrl = selected ? `bilan.html?player=${encodeURIComponent(selected.id)}&preview=admin` : "";

    root.innerHTML = `
      <div class="final-report-admin-shell">
        <section class="admin-mini-panel final-report-controls">
          <h3>Prévisualisation temps réel</h3>
          <p class="muted">Choisis un joueur : le carnet PDF se recharge avec ses points, badges, records, courbes, pronos et diplôme.</p>
          <div class="inline-form final-report-picker">
            <select id="finalReportPlayerSelect">
              ${players.map((player) => `<option value="${H.escapeHtml(player.id)}" ${player.id === selectedId ? "selected" : ""}>${H.escapeHtml(player.pseudo || player.email || "Joueur")} · ${H.escapeHtml(this.teamName(player.office_team_id))}</option>`).join("")}
            </select>
            <button class="ghost-btn" id="openFinalReportBtn" type="button" ${selected ? "" : "disabled"}>Ouvrir</button>
            <button class="primary-btn" id="printFinalReportBtn" type="button" ${selected ? "" : "disabled"}>Imprimer / PDF</button>
          </div>
          <p class="muted tiny-note">Les fonds de pages pourront être ajoutés plus tard dans <code>assets/reports/</code>. Les emplacements sont déjà prévus.</p>
        </section>
        <section class="final-report-preview-wrap">
          ${selected ? `<iframe id="finalReportPreview" class="final-report-preview" src="${H.escapeHtml(previewUrl)}" title="Aperçu bilan PDF"></iframe>` : `<p class="muted">Aucun joueur disponible.</p>`}
        </section>
      </div>
    `;

    const select = H.$("#finalReportPlayerSelect", root);
    select?.addEventListener("change", () => {
      this.state.finalReportSelectedUserId = select.value;
      this.renderFinalReportAdmin();
    });

    H.$("#openFinalReportBtn", root)?.addEventListener("click", () => {
      if (!selected) return;
      window.open(`bilan.html?player=${encodeURIComponent(selected.id)}&preview=admin`, "_blank", "noopener");
    });

    H.$("#printFinalReportBtn", root)?.addEventListener("click", () => {
      const iframe = H.$("#finalReportPreview", root);
      if (iframe?.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } else if (selected) {
        window.open(`bilan.html?player=${encodeURIComponent(selected.id)}&print=1`, "_blank", "noopener");
      }
    });
  },

  renderUsers() {
    const root = H.$("#usersAdmin");
    if (!root) return;
    root.innerHTML = `
      <div class="admin-list">
        ${this.state.users.map((user) => {
          const teamOptions = this.state.teams.map((team) => `
            <option value="${team.id}" ${user.office_team_id === team.id ? "selected" : ""}>${H.escapeHtml(team.name)}</option>
          `).join("");
          const role = user.role || (user.player_scope === "family" ? "family" : "user");

          return `
            <article class="admin-row ${!user.is_active || user.is_banned ? "inactive" : ""}" data-user-id="${user.id}">
              <div class="admin-main user-admin-main">
                ${H.profileBadgeHtml(user, "profile-badge mini")}
                <div><strong>${H.escapeHtml(user.pseudo || "Joueur")}</strong>
                <small>${H.escapeHtml(user.email || "")}</small>
                <span class="pill neutral">${H.escapeHtml(this.roleLabel(role))}</span>
                ${user.is_banned ? `<span class="pill danger">Banni</span>` : (!user.is_active ? `<span class="pill danger">Inactif</span>` : `<span class="pill success">Actif</span>`)}
                ${!user.profile_setup_done ? `<span class="pill neutral">Profil à compléter</span>` : ""}
                </div>
              </div>

              <div class="admin-controls user-admin-controls-v110">
                <select class="user-team-select" ${role === "family" ? "disabled" : ""}>
                  <option value="">Sans team</option>
                  ${teamOptions}
                </select>
                <select class="user-role-select">
                  <option value="user" ${role === "user" ? "selected" : ""}>Joueur</option>
                  <option value="family" ${role === "family" ? "selected" : ""}>Famille</option>
                  <option value="admin" ${role === "admin" ? "selected" : ""}>Admin matchs</option>
                  <option value="super_admin" ${role === "super_admin" ? "selected" : ""}>Super admin</option>
                </select>
                <label class="mini-check"><input class="user-can-chat" type="checkbox" ${user.can_chat !== false ? "checked" : ""}> Chat</label>
                <label class="mini-check"><input class="user-can-predict" type="checkbox" ${user.can_predict !== false ? "checked" : ""}> Pronos</label>
                <label class="mini-check"><input class="user-can-avatar" type="checkbox" ${user.can_change_avatar !== false ? "checked" : ""}> Avatar</label>
                <label class="mini-check"><input class="user-can-pseudo" type="checkbox" ${user.can_change_pseudo !== false ? "checked" : ""}> Pseudo</label>
                <label class="mini-check danger"><input class="user-is-banned" type="checkbox" ${user.is_banned ? "checked" : ""}> Ban</label>
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
    const teamId = row.querySelector(".user-team-select")?.value || null;
    const role = row.querySelector(".user-role-select")?.value || "user";

    const payload = {
      p_user_id: userId,
      p_role: role,
      p_office_team_id: role === "family" ? null : teamId,
      p_is_banned: row.querySelector(".user-is-banned")?.checked || false,
      p_can_chat: row.querySelector(".user-can-chat")?.checked !== false,
      p_can_predict: row.querySelector(".user-can-predict")?.checked !== false,
      p_can_change_avatar: row.querySelector(".user-can-avatar")?.checked !== false,
      p_can_change_pseudo: row.querySelector(".user-can-pseudo")?.checked !== false
    };

    const { error } = await window.sb.rpc("admin_update_profile_controls", payload);

    if (error) {
      H.toast(error.message, "error");
      return;
    }

    await this.logAdminAction("update_profile_controls", "user", {
      user_id: userId,
      role,
      office_team_id: teamId,
      banned: payload.p_is_banned
    });
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

    await this.logAdminAction("set_profile_active", "user", {
      user_id: userId,
      active,
      reason
    });
    H.toast(active ? "Joueur réactivé" : "Joueur désactivé", "success");
    await this.reloadAll();
  },

  familyInviteStatus(invite) {
    if (invite.revoked_at) return { key: "revoked", label: "Annulé", pill: "danger" };
    if (invite.used_at || invite.used_by) return { key: "used", label: "Utilisé", pill: "success" };
    const expiresAt = invite.expires_at ? new Date(invite.expires_at).getTime() : null;
    if (expiresAt && expiresAt < Date.now()) return { key: "expired", label: "Expiré", pill: "warning" };
    return { key: "available", label: "Disponible", pill: "neutral" };
  },

  userDisplayName(user, fallback = "—") {
    return user?.pseudo || user?.email || fallback;
  },

  teamName(teamId) {
    return this.state.teams.find((team) => team.id === teamId)?.name || "—";
  },

  renderFamilyAdmin() {
    const root = H.$("#familyAdmin");
    if (!root) return;

    const familyUsers = this.state.users.filter((user) => user.role === "family" || user.player_scope === "family");
    const inviterCandidates = this.state.users.filter((user) => user.player_scope !== "family" && user.role !== "family" && user.is_active !== false);
    const teamOptions = this.state.teams.map((team) => `<option value="${H.escapeHtml(team.id)}">${H.escapeHtml(team.name)}</option>`).join("");
    const inviterOptions = inviterCandidates.map((user) => {
      const teamName = this.teamName(user.office_team_id);
      return `<option value="${H.escapeHtml(user.id)}" data-team-id="${H.escapeHtml(user.office_team_id || "")}">${H.escapeHtml(this.userDisplayName(user, "Joueur"))}${user.office_team_id ? ` · ${H.escapeHtml(teamName)}` : " · sans team"}</option>`;
    }).join("");

    const invitesByInviter = new Map();
    this.state.familyInvites.forEach((invite) => {
      const key = invite.inviter_id || "__direct";
      if (!invitesByInviter.has(key)) invitesByInviter.set(key, []);
      invitesByInviter.get(key).push(invite);
    });

    const inviterSummaryRows = Array.from(invitesByInviter.entries()).map(([inviterId, invites]) => {
      const inviter = this.state.users.find((user) => user.id === inviterId);
      const total = invites.filter((invite) => !invite.revoked_at).length;
      const used = invites.filter((invite) => invite.used_at || invite.used_by).length;
      const available = invites.filter((invite) => this.familyInviteStatus(invite).key === "available").length;
      const bonus = Math.max(0, total - 3);
      return `
        <article class="admin-row family-coupon-summary-row">
          <div class="admin-main user-admin-main">
            ${inviter ? H.profileBadgeHtml(inviter, "profile-badge mini") : `<span class="profile-badge mini">${H.icon("famille", "")}</span>`}
            <div>
              <strong>${H.escapeHtml(inviter ? this.userDisplayName(inviter, "Joueur") : "Invitations directes")}</strong>
              <small>${inviter ? `Team ${H.escapeHtml(this.teamName(inviter.office_team_id))}` : "Créées directement par le super admin"}</small>
            </div>
          </div>
          <div class="family-coupon-summary-pills">
            <span class="pill neutral">${total}/3 base</span>
            ${bonus ? `<span class="pill warning">+${bonus} bonus</span>` : ""}
            <span class="pill success">${used} utilisé${used > 1 ? "s" : ""}</span>
            <span class="pill neutral">${available} dispo</span>
          </div>
        </article>
      `;
    }).join("");

    root.innerHTML = `
      <div class="family-admin-grid family-admin-grid-v123">
        <section class="admin-mini-panel">
          <h3>Inscriptions Famille</h3>
          <p class="muted">Quand le mode est fermé, les nouveaux codes ne peuvent pas être utilisés.</p>
          <label class="family-toggle-line">
            <input id="adminFamilyModeToggle" type="checkbox" ${this.state.familyModeEnabled ? "checked" : ""}>
            <span>Mode Famille ouvert</span>
          </label>
        </section>

        <section class="admin-mini-panel">
          <h3>Invitation directe</h3>
          <p class="muted">Créer une invitation Famille directement sur une team, sans passer par un joueur.</p>
          <div class="inline-form">
            <select id="adminFamilyInviteTeam"><option value="">Choisir une team</option>${teamOptions}</select>
            <button class="primary-btn" id="adminCreateFamilyInviteBtn" type="button">Créer</button>
          </div>
        </section>

        <section class="admin-mini-panel family-bonus-panel">
          <h3>Coupon bonus joueur</h3>
          <p class="muted">Ajoute un code bonus à un joueur UIS, même s’il a déjà ses 3 invitations.</p>
          <div class="inline-form family-bonus-form">
            <select id="adminBonusInviteUser"><option value="">Choisir un joueur</option>${inviterOptions}</select>
            <select id="adminBonusInviteTeam"><option value="">Team du joueur</option>${teamOptions}</select>
            <button class="primary-btn" id="adminCreateBonusFamilyInviteBtn" type="button">Ajouter un coupon bonus</button>
          </div>
          <p class="muted small-note">Le coupon bonus apparaîtra dans la liste du joueur. La limite normale reste 3, mais le super admin peut dépasser cette limite.</p>
        </section>
      </div>

      <section class="admin-mini-panel family-coupon-summary-panel">
        <h3>Coupons par joueur</h3>
        <p class="muted">Vue rapide pour voir qui a combien de coupons, ceux déjà utilisés, disponibles ou bonus.</p>
        <div class="admin-list compact">
          ${inviterSummaryRows || `<p class="muted">Aucun coupon créé pour le moment.</p>`}
        </div>
      </section>

      <section class="admin-mini-panel family-invites-admin-panel">
        <h3>Tous les coupons d’invitation</h3>
        <p class="muted">Tu peux réinitialiser un coupon utilisé ou expiré : il redevient disponible 7 jours. Le compte déjà invité n’est pas modifié automatiquement.</p>
        <div class="admin-list compact">
          ${this.state.familyInvites.length ? this.state.familyInvites.map((invite) => {
            const inviter = this.state.users.find((user) => user.id === invite.inviter_id);
            const usedBy = this.state.users.find((user) => user.id === invite.used_by);
            const team = this.state.teams.find((item) => item.id === invite.office_team_id);
            const status = this.familyInviteStatus(invite);
            const canReset = ["used", "expired", "revoked"].includes(status.key);
            return `
              <article class="admin-row family-invite-admin-row family-invite-admin-row-v123" data-invite-id="${H.escapeHtml(invite.id)}">
                <div class="admin-main family-invite-admin-main">
                  <div>
                    <strong>${H.escapeHtml(invite.code)}</strong>
                    <small>Team ${H.escapeHtml(team?.name || "—")} · coupon de ${H.escapeHtml(inviter ? this.userDisplayName(inviter, "Joueur") : "Super admin")}</small>
                    <small>${usedBy ? `Invité : ${H.escapeHtml(this.userDisplayName(usedBy, "membre Famille"))} · utilisé le ${H.formatDateTime(invite.used_at)}` : `Créé le ${H.formatDateTime(invite.created_at)} · expire le ${H.formatDateTime(invite.expires_at)}`}</small>
                  </div>
                </div>
                <div class="family-invite-admin-actions">
                  <span class="pill ${status.pill}">${status.label}</span>
                  ${canReset ? `<button class="ghost-btn tiny-btn reset-family-invite-btn" type="button" data-family-invite-reset="${H.escapeHtml(invite.id)}">Réinitialiser</button>` : ""}
                </div>
              </article>
            `;
          }).join("") : `<p class="muted">Aucune invitation Famille.</p>`}
        </div>
      </section>

      <section class="admin-mini-panel">
        <h3>Personnes invitées</h3>
        <p class="muted">Liste des comptes Famille, avec leur coupon d’origine et la personne qui les a invités.</p>
        <div class="admin-list compact">
          ${familyUsers.length ? familyUsers.map((user) => {
            const sourceInvite = this.state.familyInvites.find((invite) => invite.used_by === user.id);
            const inviter = this.state.users.find((item) => item.id === (user.invited_by || sourceInvite?.inviter_id));
            const team = this.state.teams.find((item) => item.id === user.office_team_id);
            return `
              <article class="admin-row family-member-admin-row">
                <div class="admin-main user-admin-main">
                  ${H.profileBadgeHtml(user, "profile-badge mini")}
                  <div>
                    <strong>${H.escapeHtml(user.pseudo || "Famille")}</strong>
                    <small>${H.escapeHtml(user.email || "")}</small>
                    <small>Invité par ${H.escapeHtml(inviter ? this.userDisplayName(inviter, "Joueur") : "origine inconnue")} · Team ${H.escapeHtml(team?.name || "—")}${sourceInvite?.code ? ` · code ${H.escapeHtml(sourceInvite.code)}` : ""}</small>
                  </div>
                </div>
                <span class="pill neutral">Famille</span>
              </article>
            `;
          }).join("") : `<p class="muted">Aucun membre Famille pour le moment.</p>`}
        </div>
      </section>
    `;

    H.$("#adminFamilyModeToggle", root)?.addEventListener("change", async (event) => {
      const { error } = await window.sb.rpc("admin_set_family_mode", { p_enabled: event.currentTarget.checked });
      if (error) return H.toast(error.message, "error");
      await this.loadFamilyModeSetting();
      this.renderFamilyAdmin();
      H.toast(event.currentTarget.checked ? "Mode Famille activé" : "Mode Famille désactivé", "success");
    });

    H.$("#adminCreateFamilyInviteBtn", root)?.addEventListener("click", async () => {
      const teamId = H.$("#adminFamilyInviteTeam", root)?.value;
      if (!teamId) return H.toast("Choisis une team.", "error");
      const { data, error } = await window.sb.rpc("admin_create_family_invite", { p_office_team_id: teamId });
      if (error) return H.toast(error.message, "error");
      await this.loadFamilyInvites();
      const code = Array.isArray(data) ? data[0]?.code : data?.code;
      H.toast(code ? `Code créé : ${code}` : "Code créé", "success");
      this.renderFamilyAdmin();
    });

    const bonusUserSelect = H.$("#adminBonusInviteUser", root);
    const bonusTeamSelect = H.$("#adminBonusInviteTeam", root);
    bonusUserSelect?.addEventListener("change", () => {
      const selected = bonusUserSelect.selectedOptions?.[0];
      const userTeamId = selected?.dataset?.teamId || "";
      if (bonusTeamSelect && userTeamId) bonusTeamSelect.value = userTeamId;
    });

    H.$("#adminCreateBonusFamilyInviteBtn", root)?.addEventListener("click", async () => {
      const inviterId = H.$("#adminBonusInviteUser", root)?.value;
      const teamId = H.$("#adminBonusInviteTeam", root)?.value || null;
      if (!inviterId) return H.toast("Choisis le joueur qui recevra le coupon bonus.", "error");
      const { data, error } = await window.sb.rpc("admin_create_bonus_family_invite", {
        p_inviter_id: inviterId,
        p_office_team_id: teamId,
        p_valid_days: 7
      });
      if (error) return H.toast(error.message, "error");
      await this.loadFamilyInvites();
      const code = Array.isArray(data) ? data[0]?.code : data?.code;
      H.toast(code ? `Coupon bonus créé : ${code}` : "Coupon bonus créé", "success");
      this.renderFamilyAdmin();
    });

    H.$$('[data-family-invite-reset]', root).forEach((button) => {
      button.addEventListener("click", async () => {
        const inviteId = button.dataset.familyInviteReset;
        if (!inviteId) return;
        if (!confirm("Réinitialiser ce coupon ? Il redeviendra disponible 7 jours. Le compte déjà invité ne sera pas modifié.")) return;
        const { data, error } = await window.sb.rpc("admin_reset_family_invite", {
          p_invite_id: inviteId,
          p_valid_days: 7
        });
        if (error) return H.toast(error.message, "error");
        await this.loadFamilyInvites();
        await this.loadUsers();
        const code = Array.isArray(data) ? data[0]?.code : data?.code;
        H.toast(code ? `Coupon réinitialisé : ${code}` : "Coupon réinitialisé", "success");
        this.renderFamilyAdmin();
      });
    });
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

    await this.logAdminAction("hide_chat_message", "chat", {
      message_id: messageId,
      reason
    });
    H.toast("Message masqué", "success");
    await this.loadChatMessages();
    await this.loadAuditLogs();
    this.renderChatModeration();
    this.renderAudit();
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
    return Object.values(H.groupMatchesByPouleRound(this.adminVisibleMatches(matches)))
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

    const matches = this.adminVisibleMatches(this.state.matches)
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

    await this.logAdminAction("save_quick_score", "score", {
      match_id: matchId,
      status,
      home_score: homeScore,
      away_score: awayScore
    });
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

    await this.logAdminAction("save_match", "score", {
      match_id: matchId,
      status,
      home_score: homeScore,
      away_score: awayScore
    });
    H.toast("Match mis à jour", "success");
    await this.reloadAll();
  },

  async recalcMatch(matchId) {
    const { error } = await window.sb.rpc("recalc_match_points", { p_match_id: matchId });
    if (error) {
      H.toast(error.message, "error");
      return;
    }
    await this.logAdminAction("recalc_match_points", "score", { match_id: matchId });
    H.toast("Points du match recalculés", "success");
    await this.loadAuditLogs();
    this.renderAudit();
  },

  async recalcAll() {
    const { error } = await window.sb.rpc("recalc_all_points");
    if (error) {
      H.toast(error.message, "error");
      return;
    }
    H.toast("Tous les points ont été recalculés", "success");
    await this.loadAuditLogs();
    this.renderAudit();
  },

  renderBackups() {
    const select = H.$("#backupSelect");
    const list = H.$("#backupListAdmin");
    const prepEnabled = this.state.preparationModuleEnabled !== false;
    const prepStatus = H.$("#prepModuleStatusText");
    const prepToggle = H.$("#togglePreparationModuleBtn");

    if (prepStatus) {
      prepStatus.innerHTML = prepEnabled
        ? `<strong>Actif</strong> · les matchs test restent visibles dans les écrans joueurs/admin.`
        : `<strong>Désactivé</strong> · les matchs test, règles et classements de préparation sont masqués.`;
    }

    if (prepToggle) {
      prepToggle.textContent = prepEnabled ? "Désactiver le module préparation" : "Réactiver le module préparation";
      prepToggle.classList.toggle("danger-btn", prepEnabled);
      prepToggle.classList.toggle("ghost-btn", !prepEnabled);
    }

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

    await this.logAdminAction("create_backup", "backup", { label: label || "Sauvegarde manuelle" });
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

    await this.logAdminAction("restore_backup", "backup", { backup_id: backupId });
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

    await this.logAdminAction("reset_all_predictions", "reset", { confirmed: true });
    H.$("#resetConfirmInput").value = "";
    H.toast("Pronos et messages remis à zéro", "success");
    await this.reloadAll();
  },

  async togglePreparationModule() {
    const enabledNow = this.state.preparationModuleEnabled !== false;
    const nextEnabled = !enabledNow;
    const message = enabledNow
      ? "Désactiver le module préparation ? Les matchs test, leurs règles et leurs classements par phase seront masqués. Les 2 badges de préparation restent visibles dans les exploits."
      : "Réactiver le module préparation ? Les matchs test redeviendront visibles dans les écrans joueurs et admin.";

    if (!confirm(message)) return;

    const { error } = await window.sb.rpc("admin_set_preparation_module", { p_enabled: nextEnabled });
    if (error) {
      H.toast(error.message || "Impossible de modifier le module préparation. As-tu lancé le patch SQL V1.2.4 ?", "error");
      return;
    }

    await this.loadFamilyModeSetting();
    await this.loadAuditLogs();
    await this.loadHealthSnapshot();
    this.renderBackups();
    this.renderQuickScores();
    this.renderMatches();
    this.renderHealth();
    this.renderAudit();
    H.toast(nextEnabled ? "Module préparation réactivé" : "Module préparation désactivé", "success");
  },

  async resetPreparationScores() {
    if (!confirm("Remettre à zéro uniquement les scores des matchs de préparation ? Les pronos joueurs restent conservés.")) return;

    const { error } = await window.sb.rpc("reset_preparation_scores_secure");
    if (error) {
      H.toast(error.message || "Reset des scores de préparation impossible. As-tu lancé le patch SQL V0.26.0 ?", "error");
      return;
    }

    await this.logAdminAction("reset_preparation_scores", "preparation", {});
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
      .on("postgres_changes", { event: "*", schema: "public", table: "family_invites" }, async () => {
        if (!this.isSuperAdmin()) return;
        await this.loadFamilyInvites();
        this.renderFamilyAdmin();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, async () => {
        if (!this.isSuperAdmin()) return;
        await this.loadUsers();
        this.renderFamilyAdmin();
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
