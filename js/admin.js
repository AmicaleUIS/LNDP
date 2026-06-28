// ============================================================
// LE NID DES PRONOS — ADMIN V1.8.40
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
    manualBadges: [],
    appSettings: {},
    loginOwlMessage: null,
    owlMessages: [],
    owlPollResults: [],
    owlPollVoteDetails: [],
    familyModeEnabled: false,
    preparationModuleEnabled: true,
    graphPreviewTestMatchesEnabled: false,
    graphMockPreviewEnabled: false,
    homeProgressIncludeTestMatches: false,
    liveDemoMatchEnabled: false,
    championFirstBonusPoints: 100,
    championSecondBonusPoints: 50,
    auditLogs: [],
    healthSnapshot: null,
    healthError: null,
    finalReportSelectedUserId: null
  },


  adminStoragePrefix() {
    return `nid-pronos-admin:${this.state.session?.user?.id || "anonymous"}`;
  },

  lastAdminSectionStorageKey() {
    return `${this.adminStoragePrefix()}:last-section`;
  },

  readLastAdminSection() {
    try {
      return localStorage.getItem(this.lastAdminSectionStorageKey()) || "";
    } catch (error) {
      return "";
    }
  },

  rememberLastAdminSection(section) {
    try {
      if (section) localStorage.setItem(this.lastAdminSectionStorageKey(), section);
    } catch (error) {
      // LocalStorage peut être indisponible en navigation privée stricte.
    }
  },

  initialAdminSection() {
    const allowedSections = ["quick", "teams", "messages", "scores", "backups", "health", "audit", "final-report", "users", "family"];
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("section") || this.readLastAdminSection() || "quick";
    return allowedSections.includes(requested) ? requested : "quick";
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
        app_version: "1.8.40",
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


  familyInviteUserIds() {
    return new Set((this.state.familyInvites || []).filter((invite) => invite.used_by).map((invite) => String(invite.used_by)));
  },

  isFamilyAccount(user, inviteUserIds = this.familyInviteUserIds()) {
    return Boolean(
      user?.role === "family"
      || user?.player_scope === "family"
      || user?.invited_by
      || inviteUserIds.has(String(user?.id || ""))
    );
  },

  userFamilyModeLabel(user, inviteUserIds = this.familyInviteUserIds()) {
    if (this.isFamilyAccount(user, inviteUserIds)) return "Compte Famille";
    return "Joueur normal";
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
    this.setAdminSection(this.initialAdminSection());
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
    H.$("#toggleGraphPreviewBtn")?.addEventListener("click", () => this.toggleGraphPreviewTestMatches());
    H.$("#toggleGraphMockPreviewBtn")?.addEventListener("click", () => this.toggleGraphMockPreview());
    H.$("#toggleHomeProgressTestMatchesBtn")?.addEventListener("click", () => this.toggleHomeProgressTestMatches());
    H.$("#toggleLiveDemoMatchBtn")?.addEventListener("click", () => this.toggleLiveDemoMatch());
    H.$("#saveChampionBonusPointsBtn")?.addEventListener("click", () => this.saveChampionBonusPoints());
    this.ensureLiveDemoControls();
    H.$("#fullLaunchResetBtn")?.addEventListener("click", () => this.fullLaunchReset());
    H.$("#cleanStartPreservePredictionsBtn")?.addEventListener("click", () => this.cleanStartPreservePredictions());
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
    this.rememberLastAdminSection(section);
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
    const selected = match.is_test_match
      ? "tf1"
      : channels.includes("w9") ? "w9" : channels.includes("m6") ? "m6" : "bein";
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
    const tf1Logo = `<img class="tv-logo tv-logo-tf1" src="assets/icons/tf1.png" alt="TF1" loading="lazy">`;

    if (match.is_test_match) {
      return `
        <div class="tv-choice-row prep-tv-choice-row" aria-label="Diffuseur TV préparation">
          ${option("tf1", "TF1", tf1Logo, "Les matchs de préparation sont diffusés sur TF1")}
        </div>
      `;
    }

    return `
      <div class="tv-choice-row" aria-label="Diffuseurs TV">
        ${option("bein", "beIN seul", beinLogo, "Tous les matchs officiels sont sur beIN Sports")}
        ${option("m6", "beIN + M6", `${beinLogo}${m6Logo}`, "Ajouter M6 sur ce match officiel")}
        ${option("w9", "beIN + W9", `${beinLogo}${w9Logo}`, "Ajouter W9 sur ce match officiel")}
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
    if (value === "tf1") return "TF1";
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
      { code: "CA", label: "Canada" },
      { code: "FR", label: "France" }
    ];
    return options.map((option) => `<option value="${option.code}" ${code === option.code ? "selected" : ""}>${H.escapeHtml(option.label)}</option>`).join("");
  },

  matchInfoEditorHtml(match, prefix) {
    const effectiveMatch = match.is_test_match && !match.venue_country_code
      ? { ...match, venue_country_code: "FR", venue_country_name: "France", venue_country_flag_url: "assets/icons/flags/fr.png" }
      : match;
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
                ${this.hostCountryOptionsHtml(effectiveMatch.venue_country_code)}
              </select>
              <span class="host-country-preview">${H.hostCountryFlagHtml(effectiveMatch, "host-country-flag location-country-flag")}</span>
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
        this.loadManualBadges(),
        this.loadFamilyModeSetting(),
        this.loadOwlMessagesAdmin(),
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


  async loadManualBadges() {
    const { data, error } = await window.sb
      .from("manual_user_badges")
      .select("user_id,badge_id,granted_at,reason");

    if (error) {
      console.warn("manual_user_badges indisponible", error);
      this.state.manualBadges = [];
      return;
    }

    this.state.manualBadges = data || [];
  },

  manualBadgeGranted(userId, badgeId) {
    return (this.state.manualBadges || []).some((row) =>
      String(row.user_id) === String(userId) && row.badge_id === badgeId
    );
  },

  displayCountryName(name = "") {
    return String(name || "").trim() === "Mexico" ? "Mexique" : name;
  },

  normalizeTeamLabels(row = {}) {
    const copy = { ...row };
    [
      "name",
      "team_name",
      "home_team_name",
      "away_team_name",
      "qualified_team_name",
      "winner_team_name",
      "venue_country_name"
    ].forEach((key) => {
      if (copy[key]) copy[key] = this.displayCountryName(copy[key]);
    });
    return copy;
  },

  footballTeamOptionsHtml(currentId = "") {
    const current = String(currentId || "");
    return [
      `<option value="">À déterminer</option>`,
      ...(this.state.footballTeams || []).map((team) =>
        `<option value="${team.id}" ${String(team.id) === current ? "selected" : ""}>${H.escapeHtml(this.displayCountryName(team.name))} ${team.short_name ? `(${H.escapeHtml(team.short_name)})` : ""}</option>`
      )
    ].join("");
  },

  finalTeamsEditorHtml(match = {}) {
    if (match.stage === "group" || match.is_test_match) return "";
    return `
      <details class="final-teams-editor">
        <summary>Équipes qualifiées / phase finale</summary>
        <p class="mini-help">Sélectionne manuellement les équipes du match. Les pronos et scores déjà posés restent liés au match.</p>
        <div class="match-info-grid final-teams-grid">
          <label>
            Équipe domicile
            <select class="match-home-team-id">
              ${this.footballTeamOptionsHtml(match.home_team_id)}
            </select>
          </label>
          <label>
            Équipe extérieur
            <select class="match-away-team-id">
              ${this.footballTeamOptionsHtml(match.away_team_id)}
            </select>
          </label>
        </div>
      </details>
    `;
  },

  finalBracketNumber(match = {}) {
    return H.officialBracketMatchNumber?.(match) || null;
  },

  finalBracketMatchMap(matches = this.state.matches || []) {
    const map = new Map();
    (matches || []).forEach((match) => {
      const number = this.finalBracketNumber(match);
      if (number && !map.has(number)) map.set(number, match);
    });
    return map;
  },

  scoreNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  },

  finalBracketWinnerTeamId(match = {}) {
    if (!match || match.status !== "finished") return null;
    if (match.winner_team_id) return match.winner_team_id;
    const home = this.scoreNumber(match.home_score);
    const away = this.scoreNumber(match.away_score);
    if (home === null || away === null) return null;
    if (home > away) return match.home_team_id || null;
    if (away > home) return match.away_team_id || null;
    return null;
  },

  finalBracketLoserTeamId(match = {}) {
    if (!match || match.status !== "finished") return null;
    const winner = this.finalBracketWinnerTeamId(match);
    if (!winner) return null;
    if (String(winner) === String(match.home_team_id)) return match.away_team_id || null;
    if (String(winner) === String(match.away_team_id)) return match.home_team_id || null;
    return null;
  },

  finalBracketQualifiedTeamId(match = {}, mode = "winner") {
    return mode === "loser"
      ? this.finalBracketLoserTeamId(match)
      : this.finalBracketWinnerTeamId(match);
  },

  async propagateFinalBracketTeams(source = "manual") {
    const progression = H.finalBracketProgressionMap?.() || {};
    const order = H.finalBracketProgressionOrder?.() || Object.keys(progression).map(Number).sort((a, b) => a - b);
    if (!order.length) return 0;

    const matchMap = this.finalBracketMatchMap();
    let changedCount = 0;

    for (const targetNumber of order) {
      const rule = progression[targetNumber];
      const target = matchMap.get(Number(targetNumber));
      if (!rule || !target) continue;

      const [sourceA, sourceB] = rule.sources || [];
      const matchA = matchMap.get(Number(sourceA));
      const matchB = matchMap.get(Number(sourceB));
      if (!matchA || !matchB) continue;

      const nextHomeId = this.finalBracketQualifiedTeamId(matchA, rule.use);
      const nextAwayId = this.finalBracketQualifiedTeamId(matchB, rule.use);
      if (!nextHomeId || !nextAwayId) continue;

      const alreadyOk = String(target.home_team_id || "") === String(nextHomeId)
        && String(target.away_team_id || "") === String(nextAwayId);
      if (alreadyOk) continue;

      const payload = {
        home_team_id: nextHomeId,
        away_team_id: nextAwayId
      };

      const { error } = await window.sb
        .from("matches")
        .update(payload)
        .eq("id", target.id);

      if (error) {
        console.warn("Propagation phase finale impossible", { targetNumber, sourceA, sourceB, error });
        continue;
      }

      target.home_team_id = nextHomeId;
      target.away_team_id = nextAwayId;
      changedCount += 1;

      if (this.isSuperAdmin()) {
        await this.logAdminAction("auto_propagate_final_bracket", "match", {
          source,
          target_match_number: targetNumber,
          from_matches: [sourceA, sourceB],
          propagation_mode: rule.use,
          home_team_id: nextHomeId,
          away_team_id: nextAwayId
        }).catch(() => {});
      }
    }

    if (changedCount) {
      H.toast(`${changedCount} match${changedCount > 1 ? "s" : ""} de phase finale mis à jour automatiquement`, "success");
    }

    return changedCount;
  },

  async reloadAndPropagateFinalBracket(source = "manual") {
    await this.loadMatches();
    const changed = await this.propagateFinalBracketTeams(source);
    if (changed) await this.loadMatches();
    return changed;
  },


  async loadUsers() {
    const { data, error } = await window.sb
      .from("profiles")
      .select("id,email,pseudo,role,player_scope,office_team_id,is_active,inactive_reason,created_at,avatar_key,badge_shape,badge_color,profile_setup_done,show_family_players,force_password_change,invited_by,is_banned,can_chat,can_predict,can_change_avatar,can_change_pseudo")
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
    this.state.footballTeams = (data || []).map((row) => this.normalizeTeamLabels(row));
  },


  dueLiveMatches(matches = []) {
    const now = Date.now();
    return matches.filter((match) => {
      if (!match.kickoff_at) return false;
      const kickoff = new Date(match.kickoff_at).getTime();
      if (!Number.isFinite(kickoff) || kickoff > now) return false;
      if (["finished", "cancelled", "postponed"].includes(match.status)) return false;
      return match.status !== "live" || match.home_score === null || match.home_score === undefined || match.away_score === null || match.away_score === undefined;
    });
  },

  async autoInitializeLiveMatches(matches = []) {
    const due = this.dueLiveMatches(matches);
    if (!due.length) return false;

    for (const match of due) {
      const payload = {
        status: "live",
        home_score: match.home_score ?? 0,
        away_score: match.away_score ?? 0,
        winner_team_id: null
      };

      const { error } = await window.sb
        .from("matches")
        .update(payload)
        .eq("id", match.id);

      if (error) {
        console.warn("Initialisation live impossible", match.id, error);
        continue;
      }

      if (this.isSuperAdmin()) {
        await this.logAdminAction("auto_start_live_match", "score", {
          match_id: match.id,
          home_score: payload.home_score,
          away_score: payload.away_score
        }).catch(() => {});
      }
    }

    return true;
  },

  async loadMatches() {
    const { data, error } = await window.sb
      .from("v_matches")
      .select("*")
      .order("kickoff_at", { ascending: true });

    if (error) throw error;
    const rows = data || [];
    const changed = await this.autoInitializeLiveMatches(rows);
    if (changed) {
      const { data: refreshed, error: refreshError } = await window.sb
        .from("v_matches")
        .select("*")
        .order("kickoff_at", { ascending: true });
      if (refreshError) throw refreshError;
      this.state.matches = (refreshed || []).map((row) => this.normalizeTeamLabels(row));
      H.toast("Match live initialisé à 0 - 0", "info");
      return;
    }
    this.state.matches = rows.map((row) => this.normalizeTeamLabels(row));
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

  settingNumber(value, fallback = 0) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    if (typeof value === "string") {
      const parsed = Number(value.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (value && typeof value === "object") {
      const raw = value.points ?? value.value ?? value.amount ?? value.enabled;
      return this.settingNumber(raw, fallback);
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },


  async loadOwlMessagesAdmin() {
    if (!this.isSuperAdmin()) {
      this.state.owlMessages = [];
      this.state.owlPollResults = [];
      this.state.owlPollVoteDetails = [];
      return;
    }

    const { data, error } = await window.sb
      .from("owl_messages")
      .select("*")
      .order("start_at", { ascending: false })
      .limit(200);

    if (error) {
      console.warn("Historique Hibou indisponible : lance le patch SQL V1.6.4", error);
      this.state.owlMessages = [];
      this.state.owlPollResults = [];
      this.state.owlPollVoteDetails = [];
      return;
    }

    this.state.owlMessages = data || [];
    await this.loadOwlPollResultsAdmin();
    await this.loadOwlPollVoteDetailsAdmin();
  },

  async loadOwlPollResultsAdmin() {
    const messageIds = (this.state.owlMessages || [])
      .filter((message) => message.poll_enabled)
      .map((message) => message.id)
      .filter(Boolean);
    if (!messageIds.length) {
      this.state.owlPollResults = [];
      return;
    }

    const { data, error } = await window.sb
      .from("v_admin_owl_poll_results")
      .select("*")
      .in("message_id", messageIds);

    if (error) {
      console.warn("Résultats de sondage Hibou indisponibles : lance le patch SQL V1.8.40", error);
      this.state.owlPollResults = [];
      return;
    }

    this.state.owlPollResults = data || [];
  },

  async loadOwlPollVoteDetailsAdmin() {
    const messageIds = (this.state.owlMessages || [])
      .filter((message) => message.poll_enabled)
      .map((message) => message.id)
      .filter(Boolean);
    if (!messageIds.length) {
      this.state.owlPollVoteDetails = [];
      return;
    }

    const { data, error } = await window.sb
      .from("v_owl_poll_vote_details")
      .select("*")
      .in("message_id", messageIds);

    if (error) {
      console.warn("Détail des votes Hibou indisponible : lance le patch SQL V1.8.40", error);
      this.state.owlPollVoteDetails = [];
      return;
    }

    this.state.owlPollVoteDetails = data || [];
  },

  async loadFamilyModeSetting() {
    const { data, error } = await window.sb
      .from("app_settings")
      .select("key,value")
      .in("key", ["family_mode_enabled", "preparation_module_enabled", "graph_preview_test_matches_enabled", "graph_mock_preview_enabled", "home_progress_include_test_matches", "live_demo_match_enabled", "login_owl_message", "champion_bonus_initial_points", "champion_bonus_second_points"]);

    if (error) {
      console.warn("Paramètres app indisponibles", error);
      this.state.familyModeEnabled = false;
      this.state.preparationModuleEnabled = true;
      this.state.graphPreviewTestMatchesEnabled = false;
      this.state.graphMockPreviewEnabled = false;
      this.state.homeProgressIncludeTestMatches = false;
      this.state.liveDemoMatchEnabled = false;
      this.state.championFirstBonusPoints = 100;
      this.state.championSecondBonusPoints = 50;
      this.state.loginOwlMessage = null;
      return;
    }

    const settings = Object.fromEntries((data || []).map((row) => [row.key, row.value]));
    this.state.appSettings = settings;
    this.state.familyModeEnabled = this.settingBoolean(settings.family_mode_enabled, false);
    this.state.preparationModuleEnabled = this.settingBoolean(settings.preparation_module_enabled, true);
    this.state.graphPreviewTestMatchesEnabled = this.settingBoolean(settings.graph_preview_test_matches_enabled, false);
    this.state.graphMockPreviewEnabled = this.settingBoolean(settings.graph_mock_preview_enabled, false);
    this.state.homeProgressIncludeTestMatches = this.settingBoolean(settings.home_progress_include_test_matches, false);
    this.state.liveDemoMatchEnabled = this.settingBoolean(settings.live_demo_match_enabled, false);
    this.state.championFirstBonusPoints = Math.max(0, Math.round(this.settingNumber(settings.champion_bonus_initial_points, 100)));
    this.state.championSecondBonusPoints = Math.max(0, Math.round(this.settingNumber(settings.champion_bonus_second_points, 50)));
    this.state.loginOwlMessage = settings.login_owl_message || null;
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
      console.warn("Journal admin indisponible : lance le patch SQL V1.3.6", error);
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
      console.warn("Santé du Nid indisponible : lance le patch SQL V1.3.6", error);
      this.state.healthSnapshot = null;
      this.state.healthError = error;
      return;
    }

    this.state.healthError = null;
    this.state.healthSnapshot = Array.isArray(data) ? data[0] : data;
  },

  isLiveDemoMatch(match = null) {
    if (!match) return false;
    return Number(match.api_match_id) === -133000
      || String(match.test_match_label || "").toLowerCase().includes("labo live")
      || String(match.test_match_label || "").toLowerCase().includes("live demo")
      || String(match.group_name || "").toLowerCase().includes("labo live");
  },

  adminVisibleMatches(matches = this.state.matches) {
    return matches.filter((match) => {
      if (this.isLiveDemoMatch(match)) return this.state.preparationModuleEnabled !== false && this.state.liveDemoMatchEnabled === true;
      if (this.state.preparationModuleEnabled === false && match.is_test_match) return false;
      return true;
    });
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


  worldCupLaunchStatusHtml(summary = {}) {
    const prepOff = summary.preparation_module_enabled === false || this.state.preparationModuleEnabled === false;
    const graphTestOff = this.state.graphPreviewTestMatchesEnabled !== true;
    const graphMockOff = this.state.graphMockPreviewEnabled !== true;
    const homeProgressOfficialOnly = this.state.homeProgressIncludeTestMatches !== true;
    const liveDemoOff = this.state.liveDemoMatchEnabled !== true && !this.liveDemoMatch();
    const noFinishedWithoutScore = Number(summary.finished_without_score || 0) === 0;
    const allGreen = prepOff && graphTestOff && graphMockOff && homeProgressOfficialOnly && liveDemoOff && noFinishedWithoutScore;

    const item = (ok, title, message) => `
      <article class="worldcup-ready-row ${ok ? "ok" : "warning"}">
        <span class="health-dot">${ok ? "🟢" : "🟠"}</span>
        <div>
          <strong>${H.escapeHtml(title)}</strong>
          <p class="muted">${H.escapeHtml(message)}</p>
        </div>
        <span class="pill ${ok ? "success" : "warning"}">${ok ? "OK" : "À régler"}</span>
      </article>
    `;

    const info = (title, message) => `
      <article class="worldcup-ready-row info">
        <span class="health-dot">🔒</span>
        <div>
          <strong>${H.escapeHtml(title)}</strong>
          <p class="muted">${H.escapeHtml(message)}</p>
        </div>
        <span class="pill neutral">Protégé</span>
      </article>
    `;

    return `
      <section class="admin-mini-panel worldcup-ready-panel ${allGreen ? "is-ready" : "has-warning"}">
        <div class="card-title-row">
          <div>
            <h3>${allGreen ? "🟢 État Coupe du monde : réglages propres" : "🟠 État Coupe du monde : réglages à vérifier"}</h3>
            <p class="muted">Checklist non destructive : on ne touche pas aux pronos déjà posés par les joueurs.</p>
          </div>
        </div>
        <div class="worldcup-ready-list">
          ${item(prepOff, "Matchs test normals", prepOff ? "Le module préparation est désactivé." : "Désactive le module préparation dans Sauvegardes > Préparation.")}
          ${item(graphTestOff, "Graph avec matchs test désactivé", graphTestOff ? "Les graphs ignorent les matchs test." : "Désactive la prévisualisation graphs avec matchs test.")}
          ${item(graphMockOff, "Maquette graph désactivée", graphMockOff ? "Aucune courbe fictive n’est Famillee." : "Désactive la maquette graph avant lancement.")}
          ${item(homeProgressOfficialOnly, "Progression accueil officielle", homeProgressOfficialOnly ? "La progression de l’accueil ignore les matchs test." : "La progression de l’accueil inclut les matchs test. À couper pour le vrai lancement.")}
          ${item(liveDemoOff, "Labo live retiré", liveDemoOff ? "Aucun match fictif labo n’est actif." : "Retire le match fictif live avant validation Coupe du monde.")}
          ${item(noFinishedWithoutScore, "Scores terminés cohérents", noFinishedWithoutScore ? "Aucun match terminé sans score complet." : `${Number(summary.finished_without_score || 0)} match(s) terminé(s) sans score complet.`)}
          ${info("Pronos joueurs conservés", "Des joueurs peuvent déjà avoir posé des pronos : ne lance pas de reset complet sauf vraie volonté de repartir à zéro.")}
        </div>
        <p class="muted tiny-note">Ce voyant peut être au vert sans supprimer les sauvegardes, coupons ou messages. On privilégie la sécurité des données réelles.</p>
      </section>
    `;
  },

  renderHealth() {
    const root = H.$("#healthAdmin");
    if (!root) return;

    if (this.state.healthError) {
      root.innerHTML = `
        <div class="admin-empty-state health-error-state">
          <strong>Diagnostic indisponible</strong>
          <p class="muted">Lance le patch SQL V1.3.6 pour activer la Santé du Nid.</p>
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

      ${this.worldCupLaunchStatusHtml(summary)}

      <div class="health-metrics-grid">
        ${metric("Joueurs actifs", summary.active_users)}
        ${metric("Comptes Famille", summary.family_users)}
        ${metric("Matchs officiels", summary.official_matches)}
        ${metric("Matchs préparation", summary.preparation_matches, summary.preparation_module_enabled === false ? "normals" : "visibles")}
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
      hide_chat_message: "Message normal",
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
          <p class="muted">Le journal se remplira avec les prochaines actions super admin. Lance le patch SQL V1.3.6 si cette zone reste vide après une action.</p>
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


  auditDetailLabel(key) {
    const labels = {
      user_id: "joueur",
      p_user_id: "joueur",
      target_user_id: "joueur",
      inviter_id: "inviteur",
      previous_used_by: "ancien invité",
      office_team_id: "team",
      match_id: "match",
      backup_id: "sauvegarde"
    };
    return labels[key] || key;
  },

  auditDetailValue(key, value) {
    if (value === null || value === undefined || value === "") return "—";
    const stringValue = String(value);
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stringValue);

    if (["user_id", "p_user_id", "target_user_id", "inviter_id", "previous_used_by"].includes(key) || uuidLike) {
      const user = this.state.users.find((item) => item.id === stringValue);
      if (user) return this.userDisplayName(user, "Joueur");
    }

    if (key === "office_team_id") {
      return this.teamName(stringValue);
    }

    if (typeof value === "object") return JSON.stringify(value);
    return stringValue;
  },

  auditRowsHtml(filter = "all") {
    const rows = this.state.auditLogs.filter((log) => filter === "all" || log.category === filter);
    if (!rows.length) return `<p class="muted">Aucune action dans ce filtre.</p>`;

    return rows.map((log) => {
      const details = log.details || {};
      const detailItems = Object.entries(details)
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .slice(0, 4)
        .map(([key, value]) => `<span class="audit-detail-chip">${H.escapeHtml(this.auditDetailLabel(key))} : ${H.escapeHtml(this.auditDetailValue(key, value))}</span>`)
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
            <button class="primary-btn" id="openFinalReportBtn" type="button" ${selected ? "" : "disabled"}>Ouvrir</button>
          </div>
          <p class="muted tiny-note">Les fonds de pages sont câblés dans <code>assets/reports/</code>. Ouvre le bilan pour imprimer/exporter en PDF.</p>
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
                ${user.force_password_change ? `<span class="pill warning">MDP à changer</span>` : ""}
                ${this.isFamilyAccount(user) ? `<span class="pill success">Compte Famille réel</span>` : `<span class="pill neutral">Joueur normal</span>`}
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
                ${["admin", "super_admin"].includes(role) ? "" : `<button class="ghost-btn user-family-mode-toggle-btn ${role === "family" ? "danger-soft" : ""}" data-enabled="${role === "family" ? "false" : "true"}">${role === "family" ? "Repasser normal" : "Passer famille"}</button>`}
                <button class="ghost-btn admin-password-reset-btn">Mot de passe</button>
                <div class="manual-badge-controls">
                  <span class="manual-badge-label">Badges souvenir</span>
                  <button class="ghost-btn tiny-btn manual-badge-btn ${this.manualBadgeGranted(user.id, "preparation-two-picks") ? "is-granted" : ""}" type="button" data-badge-id="preparation-two-picks" data-action="${this.manualBadgeGranted(user.id, "preparation-two-picks") ? "revoke" : "grant"}">${this.manualBadgeGranted(user.id, "preparation-two-picks") ? "Retirer Prépa" : "Ajouter Prépa"}</button>
                  <button class="ghost-btn tiny-btn manual-badge-btn ${this.manualBadgeGranted(user.id, "prep-good-pick") ? "is-granted" : ""}" type="button" data-badge-id="prep-good-pick" data-action="${this.manualBadgeGranted(user.id, "prep-good-pick") ? "revoke" : "grant"}">${this.manualBadgeGranted(user.id, "prep-good-pick") ? "Retirer Test concluant" : "Ajouter Test concluant"}</button>
                </div>
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

    H.$$(".user-family-mode-toggle-btn", root).forEach((btn) => {
      btn.addEventListener("click", (event) => this.setUserFamilyMode(event.currentTarget.closest(".admin-row"), event.currentTarget.dataset.enabled === "true"));
    });

    H.$$(".admin-password-reset-btn", root).forEach((btn) => {
      btn.addEventListener("click", (event) => this.openPasswordResetModal(event.currentTarget.closest(".admin-row")));
    });

    H.$$(".manual-badge-btn", root).forEach((btn) => {
      btn.addEventListener("click", (event) => this.toggleManualBadge(event.currentTarget.closest(".admin-row"), event.currentTarget.dataset.badgeId, event.currentTarget.dataset.action));
    });
  },

  async toggleManualBadge(row, badgeId, action = "grant") {
    const userId = row?.dataset?.userId;
    if (!userId || !badgeId) return;
    const fn = action === "revoke" ? "admin_revoke_manual_badge" : "admin_grant_manual_badge";
    const label = badgeId === "prep-good-pick" ? "Test concluant" : "Préparation du nid";
    const confirmText = action === "revoke"
      ? `Retirer le badge “${label}” à ce joueur ?`
      : `Ajouter manuellement le badge “${label}” à ce joueur ?`;
    if (!confirm(confirmText)) return;

    const { error } = await window.sb.rpc(fn, {
      p_user_id: userId,
      p_badge_id: badgeId,
      p_reason: "Ajout manuel super admin"
    });

    if (error) {
      H.toast(error.message || "Impossible de modifier le badge manuel. Lance le patch SQL V1.3.41.", "error");
      return;
    }

    await this.loadManualBadges();
    await this.logAdminAction(action === "revoke" ? "manual_badge_revoke" : "manual_badge_grant", "badges", { user_id: userId, badge_id: badgeId });
    this.renderUsers();
    H.toast(action === "revoke" ? "Badge retiré" : "Badge ajouté", "success");
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
    H.toast(role === "family" ? "Utilisateur mis à jour : vrai compte Famille" : "Utilisateur mis à jour", "success");
    await this.reloadAll();
  },


  generateTemporaryPassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let body = "";
    if (window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(10);
      window.crypto.getRandomValues(bytes);
      body = Array.from(bytes).map((byte) => alphabet[byte % alphabet.length]).join("");
    } else {
      body = Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    }
    return `Nid-${body}-26`;
  },

  async copyTextToClipboard(text, successMessage = "Copié") {
    const value = String(text || "").trim();
    if (!value) return false;

    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement("textarea");
        input.value = value;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      H.toast(successMessage, "success");
      return true;
    } catch (error) {
      H.toast("Copie impossible.", "error");
      return false;
    }
  },

  async setUserFamilyMode(row, enabled) {
    const userId = row?.dataset?.userId;
    if (!userId) return;

    const message = enabled
      ? "Passer ce compte en vraie catégorie Famille ? Il sortira du classement général normal."
      : "Repasser ce compte en joueur normal ? Il reviendra dans le classement général.";
    if (!confirm(message)) return;

    const { error } = await window.sb.rpc("admin_set_user_family_mode", {
      p_user_id: userId,
      p_enabled: enabled
    });

    if (error) {
      H.toast(error.message || "Impossible de modifier la catégorie réelle du joueur.", "error");
      return;
    }

    await this.logAdminAction("set_user_family_role", "family", { user_id: userId, enabled });
    H.toast(enabled ? "Compte passé en Famille" : "Compte repassé en joueur normal", "success");
    await this.reloadAll();
  },

  openPasswordResetModal(row) {
    const userId = row?.dataset?.userId;
    const user = this.state.users.find((item) => item.id === userId);
    if (!user) return;

    const tempPassword = this.generateTemporaryPassword();
    H.$("#adminPasswordResetModal")?.remove();

    const modal = document.createElement("div");
    modal.id = "adminPasswordResetModal";
    modal.className = "modal-backdrop admin-password-reset-modal";
    modal.innerHTML = `
      <div class="modal-card admin-password-reset-card" role="dialog" aria-modal="true" aria-labelledby="adminPasswordResetTitle">
        <button class="modal-x-btn" id="closeAdminPasswordResetBtn" type="button" aria-label="Fermer">×</button>
        <p class="eyebrow">Sécurité joueur</p>
        <h2 id="adminPasswordResetTitle">Changer le mot de passe</h2>
        <p class="muted">Le joueur <strong>${H.escapeHtml(this.userDisplayName(user, "Joueur"))}</strong> devra se connecter avec ce mot de passe temporaire, puis choisir immédiatement son nouveau mot de passe.</p>

        <form id="adminPasswordResetForm" class="form-stack admin-password-reset-form">
          <label>
            <span>Mot de passe temporaire</span>
            <input type="text" name="temporary_password" value="${H.escapeHtml(tempPassword)}" minlength="8" required>
          </label>
          <div class="admin-password-actions">
            <button class="ghost-btn" id="copyTemporaryPasswordBtn" type="button">Copier</button>
            <button class="primary-btn" type="submit">Activer le changement</button>
          </div>
          <p class="muted small-note">À transmettre au joueur par un canal sûr. Après connexion, l’écran “Changer mon mot de passe” bloquera l’application tant que le nouveau mot de passe n’est pas enregistré.</p>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    H.$("#closeAdminPasswordResetBtn", modal)?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });

    const input = modal.querySelector('input[name="temporary_password"]');
    H.$("#copyTemporaryPasswordBtn", modal)?.addEventListener("click", async () => {
      await this.copyTextToClipboard(input.value, "Mot de passe temporaire copié");
    });

    H.$("#adminPasswordResetForm", modal)?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = String(new FormData(event.currentTarget).get("temporary_password") || "").trim();
      if (password.length < 8) return H.toast("Mot de passe temporaire trop court.", "error");

      const { error } = await window.sb.rpc("admin_force_password_change", {
        p_user_id: userId,
        p_temporary_password: password
      });

      if (error) {
        H.toast(error.message || "Impossible de forcer le changement.", "error");
        return;
      }

      await this.logAdminAction("force_password_change", "user", { user_id: userId });
      H.toast("Changement de mot de passe activé", "success");
      close();
      await this.reloadAll();
    });

    setTimeout(() => input?.select(), 80);
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

    const inviteUserIds = this.familyInviteUserIds();
    const familyUsers = this.state.users.filter((user) => this.isFamilyAccount(user, inviteUserIds));
    const inviterCandidates = this.state.users.filter((user) => !this.isFamilyAccount(user, inviteUserIds) && user.is_active !== false);
    const familyVisibilityUsers = this.state.users
      .filter((user) => user.is_active !== false && !["admin", "super_admin"].includes(user.role))
      .sort((a, b) =>
        Number(Boolean(b.show_family_players)) - Number(Boolean(a.show_family_players))
        || Number(this.isFamilyAccount(b, inviteUserIds)) - Number(this.isFamilyAccount(a, inviteUserIds))
        || String(a.pseudo || a.email || "").localeCompare(String(b.pseudo || b.email || ""), "fr")
      );
    const familyVisibleCount = familyVisibilityUsers.filter((user) => this.isFamilyAccount(user, inviteUserIds)).length;
    const familyHiddenCount = familyVisibilityUsers.filter((user) => !this.isFamilyAccount(user, inviteUserIds)).length;
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


      <section class="admin-mini-panel family-visibility-panel">
        <div class="card-title-row">
          <div>
            <h3>Qui affiche le mode Famille ?</h3>
            <p class="muted">Vue de contrôle : qui a activé les classements/messages Famille dans son profil.</p>
          </div>
          <div class="family-visibility-counters">
            <span class="pill success">${familyVisibleCount} Famille${familyVisibleCount > 1 ? "s" : ""}</span>
            <span class="pill neutral">${familyHiddenCount} normal${familyHiddenCount > 1 ? "s" : ""}</span>
          </div>
        </div>
        <div class="admin-list compact family-visibility-list">
          ${familyVisibilityUsers.length ? familyVisibilityUsers.map((user) => {
            const isFam = this.isFamilyAccount(user, inviteUserIds);
            const team = this.state.teams.find((item) => item.id === user.office_team_id);
            const sourceInvite = this.state.familyInvites.find((invite) => invite.used_by === user.id);
            const inviter = this.state.users.find((item) => item.id === (user.invited_by || sourceInvite?.inviter_id));
            return `
              <article class="admin-row family-visibility-row ${user.show_family_players || isFam ? "enabled" : "disabled"}">
                <div class="admin-main user-admin-main">
                  ${H.profileBadgeHtml(user, "profile-badge mini")}
                  <div>
                    <strong>${H.escapeHtml(user.pseudo || user.email || "Joueur")}</strong>
                    <small>${H.escapeHtml(team?.name || "Sans team")} · ${H.escapeHtml(user.email || "")}</small>
                    ${isFam ? `<small>Invité par ${H.escapeHtml(inviter ? this.userDisplayName(inviter, "joueur") : "origine inconnue")}${sourceInvite?.code ? ` · code ${H.escapeHtml(sourceInvite.code)}` : ""}</small>` : ""}
                  </div>
                </div>
                <div class="family-visibility-actions">
                  <span class="pill ${isFam ? "success" : "neutral"}">${H.escapeHtml(this.userFamilyModeLabel(user, inviteUserIds))}</span>
                  <button class="ghost-btn small-btn family-visibility-toggle-btn ${isFam ? "danger-soft" : ""}" data-user-id="${H.escapeHtml(user.id)}" data-enabled="${isFam ? "false" : "true"}">${isFam ? "Repasser normal" : "Passer famille"}</button>
                </div>
              </article>
            `;
          }).join("") : `<p class="muted">Aucun joueur à afficher.</p>`}
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

    H.$$(".family-visibility-toggle-btn", root).forEach((button) => {
      button.addEventListener("click", async () => {
        const row = button.closest(".admin-row");
        if (!row) return;
        row.dataset.userId = button.dataset.userId;
        await this.setUserFamilyMode(row, button.dataset.enabled === "true");
      });
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

  normalizeOwlPollOptions(rawValue = "") {
    return String(rawValue || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((label, index) => ({ key: `choice_${index + 1}`, label }));
  },

  owlPollOptionsText(message = {}) {
    const options = Array.isArray(message.poll_options) ? message.poll_options : [];
    return options.map((option) => option?.label || option?.text || "").filter(Boolean).join("\n");
  },

  owlPollResultsForMessage(messageId) {
    return (this.state.owlPollResults || []).filter((row) => String(row.message_id) === String(messageId));
  },

  owlPollVoteDetailsForMessage(messageId) {
    return (this.state.owlPollVoteDetails || [])
      .filter((row) => String(row.message_id) === String(messageId))
      .slice()
      .sort((a, b) => String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr"));
  },

  owlPollVoteDetailsHtml(message = {}) {
    const options = Array.isArray(message.poll_options) ? message.poll_options : [];
    const details = this.owlPollVoteDetailsForMessage(message.id);
    const byOption = new Map();
    details.forEach((row) => {
      const key = String(row.option_key || "");
      if (!byOption.has(key)) byOption.set(key, []);
      byOption.get(key).push(row);
    });
    return `
      <details class="admin-owl-poll-voters">
        <summary>Voir qui a voté quoi 🕵️‍♂️</summary>
        <div class="admin-owl-poll-voters-grid">
          ${options.map((option) => {
            const voters = byOption.get(String(option.key)) || [];
            return `<div class="admin-owl-poll-voter-group">
              <strong>${H.escapeHtml(option.label || option.key)}</strong>
              ${voters.length ? `<ul>${voters.map((vote) => `<li><span>${H.escapeHtml(vote.pseudo || "Joueur")}</span><small>${vote.voted_at ? H.formatDateTime(vote.voted_at) : ""}</small></li>`).join("")}</ul>` : `<small>Aucun vote.</small>`}
            </div>`;
          }).join("")}
        </div>
      </details>
    `;
  },

  owlPollAdminSummaryHtml(message = {}) {
    if (!message.poll_enabled) return "";
    const options = Array.isArray(message.poll_options) ? message.poll_options : [];
    const results = this.owlPollResultsForMessage(message.id);
    const countFor = (key) => Number((results.find((row) => String(row.option_key) === String(key)) || {}).votes_count || 0);
    const total = results.reduce((sum, row) => sum + Number(row.votes_count || 0), 0);
    const closed = message.poll_end_at && new Date(message.poll_end_at).getTime() < Date.now();
    return `
      <div class="admin-owl-poll-summary">
        <div class="admin-owl-poll-summary-head">
          <strong>📊 ${H.escapeHtml(message.poll_question || "Sondage du Hibou")}</strong>
          <span class="pill ${closed ? "neutral" : "success"}">${closed ? "Sondage terminé" : "Sondage ouvert"}</span>
        </div>
        <small class="muted">${total} vote(s)${message.poll_end_at ? ` · fin ${H.formatDateTime(message.poll_end_at)}` : ""}</small>
        <div class="admin-owl-poll-bars">
          ${options.length ? options.map((option) => {
            const votes = countFor(option.key);
            const pct = total ? Math.round((votes / total) * 100) : 0;
            return `<div class="admin-owl-poll-bar-row"><span>${H.escapeHtml(option.label || option.key)}</span><b>${votes}</b><div><i style="width:${pct}%"></i></div><em>${pct}%</em></div>`;
          }).join("") : `<p class="muted">Aucun choix configuré.</p>`}
        </div>
        ${this.owlPollVoteDetailsHtml(message)}
      </div>
    `;
  },



  owlLoginMessageAdminHtml() {
    const msg = this.state.loginOwlMessage || {};
    const start = msg.start_at ? this.datetimeLocalValue(msg.start_at) : this.datetimeLocalValue(new Date());
    const durationDays = Number(msg.duration_days || 1);
    const rows = (this.state.owlMessages || []).slice().sort((a, b) => new Date(b.start_at || b.created_at || 0) - new Date(a.start_at || a.created_at || 0));

    return `
      <section class="card admin-owl-message-card">
        <div class="card-title-row">
          <div>
            <h3>${H.icon("diffusion")} Messages du Hibou masqué</h3>
            <p class="muted">Crée une annonce à la connexion, puis gère tous les anciens messages : actif, affiché dans l’historique, ou caché au fond du nid.</p>
          </div>
          <span class="pill ${rows.some((row) => row.enabled) ? "success" : "neutral"}">${rows.length} message(s)</span>
        </div>

        <div class="admin-chat-actions">
          <button class="primary-btn" id="newOwlMessageBtn" type="button">Créer un nouveau message du Hibou</button>
        </div>

        <form id="owlLoginMessageForm" class="form-stack owl-message-create-form" hidden>
          <input type="hidden" name="message_id" id="owlMessageEditId" value="">
          <div class="grid two">
            <label><span>Titre</span><input name="title" maxlength="120" value="${H.escapeHtml(msg.title || "Message du Hibou masqué")}" required></label>
            <label><span>Importance</span><select name="importance">
              ${["info", "fun", "warning", "urgent"].map((value) => `<option value="${value}" ${msg.importance === value ? "selected" : ""}>${value}</option>`).join("")}
            </select></label>
            <label><span>Date et heure de début</span><input type="datetime-local" name="start_at" value="${H.escapeHtml(start)}" required></label>
            <label><span>Durée en jours</span><input type="number" name="duration_days" min="0.04" step="0.04" value="${H.escapeHtml(String(durationDays || 1))}" required></label>
          </div>
          <label><span>Message</span><textarea name="body" rows="8" maxlength="4000" placeholder="Ex : Le Hibou masqué rappelle que les 16èmes arrivent. Pas de panique, juste des plumes." required>${H.escapeHtml(msg.body || msg.message || "")}</textarea><small class="muted">Maximum 4000 caractères. Le Hibou masqué peut enfin faire son discours.</small></label>
          <div class="admin-owl-poll-editor">
            <label class="check-line"><input type="checkbox" name="poll_enabled" ${msg.poll_enabled ? "checked" : ""}> Ajouter un sondage à ce message</label>
            <div class="grid two">
              <label><span>Question du sondage</span><input name="poll_question" maxlength="180" value="${H.escapeHtml(msg.poll_question || "")}" placeholder="Ex : Validez-vous le nouveau barème champion ?"></label>
              <label><span>Date et heure de fin du sondage</span><input type="datetime-local" name="poll_end_at" value="${H.escapeHtml(msg.poll_end_at ? this.datetimeLocalValue(msg.poll_end_at) : "")}"></label>
            </div>
            <label><span>Choix de réponse</span><textarea name="poll_options" rows="5" maxlength="1200" placeholder="Un choix par ligne. Exemple :
Oui, on passe à 30 / 15
Non, on garde 100 / 50
Je m’en remets au Hibou">${H.escapeHtml(this.owlPollOptionsText(msg))}</textarea><small class="muted">Un choix par ligne. Tu peux faire Oui/Non, 3 choix, 4 choix, etc. Maximum 8 choix.</small></label>
          </div>
          <div class="grid two">
            <label class="check-line"><input type="checkbox" name="enabled" ${msg.enabled === false ? "" : "checked"}> Activer / planifier ce message</label>
            <label class="check-line"><input type="checkbox" name="show_in_history" ${msg.show_in_history === false ? "" : "checked"}> Afficher dans le bouton “Messages du Hibou”</label>
          </div>
          <div class="admin-chat-actions">
            <button class="primary-btn" id="owlMessageSubmitBtn" type="submit">Créer le message</button>
            <button class="ghost-btn" id="cancelOwlMessageEditBtn" type="button" hidden>Annuler la modification</button>
            <button class="danger-btn" id="clearOwlLoginMessageBtn" type="button">Désactiver les messages actifs</button>
          </div>
        </form>

        <div class="admin-owl-message-history">
          <div class="section-title-row">
            <h4>Historique des messages</h4>
            <small class="muted">Tri décroissant · plus récent en haut</small>
          </div>
          ${rows.length ? rows.map((message) => `
            <article class="admin-owl-message-row ${message.enabled ? "" : "is-disabled"}" data-owl-message-id="${H.escapeHtml(message.id)}" data-enabled="${message.enabled ? "true" : "false"}" data-history="${message.show_in_history === false ? "false" : "true"}">
              <div>
                <strong>${H.escapeHtml(message.title || "Message du Hibou masqué")}</strong>
                <small>${H.escapeHtml(message.importance || "info")} · début ${H.formatDateTime(message.start_at || message.created_at)}${message.end_at ? ` · fin ${H.formatDateTime(message.end_at)}` : ""}</small>
                <p>${H.escapeHtml(String(message.body || "").slice(0, 260))}${String(message.body || "").length > 260 ? "…" : ""}</p>
                ${this.owlPollAdminSummaryHtml(message)}
              </div>
              <div class="admin-owl-message-actions">
                <span class="pill ${message.enabled ? "success" : "neutral"}">${message.enabled ? "Actif/planifié" : "Inactif"}</span>
                <span class="pill ${message.show_in_history === false ? "neutral" : "success"}">${message.show_in_history === false ? "Caché historique" : "Visible historique"}</span>
                <button class="ghost-btn edit-owl-message-btn" type="button">Modifier</button>
                <button class="ghost-btn toggle-owl-message-enabled-btn" type="button">${message.enabled ? "Désactiver" : "Activer"}</button>
                <button class="ghost-btn toggle-owl-message-history-btn" type="button">${message.show_in_history === false ? "Afficher historique" : "Masquer historique"}</button>
                <button class="danger-btn archive-owl-message-btn" type="button">Cacher partout</button>
              </div>
            </article>
          `).join("") : `<p class="muted">Aucun message Hibou enregistré pour l’instant.</p>`}
        </div>
      </section>
    `;
  },

  datetimeLocalValue(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (!Number.isFinite(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  },

  async saveOwlLoginMessage(form) {
    const formData = new FormData(form);
    const startLocal = String(formData.get("start_at") || "");
    const startDate = startLocal ? new Date(startLocal) : new Date();
    const durationDays = Math.max(0.04, Number(formData.get("duration_days") || 1));
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const pollEnabled = formData.get("poll_enabled") === "on";
    const pollOptions = this.normalizeOwlPollOptions(formData.get("poll_options") || "");
    const pollEndLocal = String(formData.get("poll_end_at") || "").trim();
    const pollEndDate = pollEndLocal ? new Date(pollEndLocal) : endDate;
    const payload = {
      enabled: formData.get("enabled") === "on",
      show_in_history: formData.get("show_in_history") === "on",
      title: String(formData.get("title") || "Message du Hibou masqué").trim(),
      body: String(formData.get("body") || "").trim(),
      importance: String(formData.get("importance") || "info"),
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      duration_days: durationDays,
      poll_enabled: pollEnabled,
      poll_question: pollEnabled ? String(formData.get("poll_question") || "").trim() : null,
      poll_options: pollEnabled ? pollOptions : [],
      poll_end_at: pollEnabled ? pollEndDate.toISOString() : null
    };

    if (!payload.body) {
      H.toast("Le Hibou refuse de hululer dans le vide.", "error");
      return;
    }

    if (payload.poll_enabled) {
      if (!payload.poll_question) {
        H.toast("Ajoute une question de sondage, sinon le Nid va voter dans le brouillard.", "error");
        return;
      }
      if (!payload.poll_options || payload.poll_options.length < 2) {
        H.toast("Un sondage doit avoir au moins 2 choix.", "error");
        return;
      }
    }

    const messageId = String(formData.get("message_id") || "").trim();
    const request = messageId
      ? window.sb.from("owl_messages").update(payload).eq("id", messageId)
      : window.sb.from("owl_messages").insert(payload);
    const { error } = await request;
    if (error) {
      H.toast(error.message || "Impossible d’enregistrer le message. Lance le patch SQL V1.8.40.", "error");
      return;
    }

    await this.loadOwlMessagesAdmin();
    await this.loadFamilyModeSetting();
    this.renderChatModeration();
    H.toast(messageId ? "Message du Hibou modifié" : "Message du Hibou créé", "success");
  },

  startEditOwlMessage(row) {
    const id = row?.dataset.owlMessageId;
    if (!id) return;
    const message = (this.state.owlMessages || []).find((item) => String(item.id) === String(id));
    if (!message) return H.toast("Message introuvable dans le nid.", "error");

    const root = H.$("#chatModerationAdmin");
    const form = H.$("#owlLoginMessageForm", root);
    const newButton = H.$("#newOwlMessageBtn", root);
    if (!form) return;

    const durationDays = Number(message.duration_days || ((new Date(message.end_at || 0) - new Date(message.start_at || Date.now())) / 86400000) || 1);
    form.hidden = false;
    H.$("#owlMessageEditId", form).value = String(message.id);
    form.elements.title.value = message.title || "Message du Hibou masqué";
    form.elements.importance.value = message.importance || "info";
    form.elements.start_at.value = this.datetimeLocalValue(message.start_at || message.created_at || new Date());
    form.elements.duration_days.value = String(Math.max(0.04, durationDays || 1));
    form.elements.body.value = message.body || message.message || "";
    if (form.elements.poll_enabled) form.elements.poll_enabled.checked = Boolean(message.poll_enabled);
    if (form.elements.poll_question) form.elements.poll_question.value = message.poll_question || "";
    if (form.elements.poll_options) form.elements.poll_options.value = this.owlPollOptionsText(message);
    if (form.elements.poll_end_at) form.elements.poll_end_at.value = message.poll_end_at ? this.datetimeLocalValue(message.poll_end_at) : "";
    form.elements.enabled.checked = message.enabled !== false;
    form.elements.show_in_history.checked = message.show_in_history !== false;
    H.$("#owlMessageSubmitBtn", form).textContent = "Enregistrer les modifications";
    H.$("#cancelOwlMessageEditBtn", form).hidden = false;
    if (newButton) newButton.textContent = "Refermer le formulaire du Hibou";
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  },

  resetOwlMessageForm() {
    const root = H.$("#chatModerationAdmin");
    const form = H.$("#owlLoginMessageForm", root);
    if (!form) return;
    form.reset();
    H.$("#owlMessageEditId", form).value = "";
    form.elements.title.value = "Message du Hibou masqué";
    form.elements.importance.value = "info";
    form.elements.start_at.value = this.datetimeLocalValue(new Date());
    form.elements.duration_days.value = "1";
    form.elements.enabled.checked = true;
    form.elements.show_in_history.checked = true;
    H.$("#owlMessageSubmitBtn", form).textContent = "Créer le message";
    H.$("#cancelOwlMessageEditBtn", form).hidden = true;
  },

  async clearOwlLoginMessage() {
    if (!confirm("Désactiver tous les messages Hibou actifs ou planifiés ?")) return;
    const { error } = await window.sb
      .from("owl_messages")
      .update({ enabled: false })
      .eq("enabled", true);

    if (error) {
      H.toast(error.message || "Impossible de désactiver les messages.", "error");
      return;
    }

    await this.loadOwlMessagesAdmin();
    this.renderChatModeration();
    H.toast("Messages Hibou désactivés", "success");
  },

  async toggleOwlMessageEnabled(row) {
    const id = row?.dataset.owlMessageId;
    if (!id) return;
    const next = row.dataset.enabled !== "true";
    const { error } = await window.sb.from("owl_messages").update({ enabled: next }).eq("id", id);
    if (error) return H.toast(error.message || "Modification impossible.", "error");
    await this.loadOwlMessagesAdmin();
    this.renderChatModeration();
    H.toast(next ? "Message activé" : "Message désactivé", "success");
  },

  async toggleOwlMessageHistory(row) {
    const id = row?.dataset.owlMessageId;
    if (!id) return;
    const next = row.dataset.history !== "true";
    const { error } = await window.sb.from("owl_messages").update({ show_in_history: next }).eq("id", id);
    if (error) return H.toast(error.message || "Modification impossible.", "error");
    await this.loadOwlMessagesAdmin();
    this.renderChatModeration();
    H.toast(next ? "Message visible dans l’historique" : "Message masqué de l’historique", "success");
  },

  async archiveOwlMessage(row) {
    const id = row?.dataset.owlMessageId;
    if (!id) return;
    if (!confirm("Cacher ce message partout ? Il restera en base mais ne sera plus visible côté joueurs.")) return;
    const { error } = await window.sb.from("owl_messages").update({ enabled: false, show_in_history: false }).eq("id", id);
    if (error) return H.toast(error.message || "Modification impossible.", "error");
    await this.loadOwlMessagesAdmin();
    this.renderChatModeration();
    H.toast("Message caché partout", "success");
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

      ${this.isSuperAdmin() ? this.owlLoginMessageAdminHtml() : ""}
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
                <small>${H.escapeHtml(this.chatScopeLabel(message))} · ${H.formatDateTime(message.created_at)}${message.deleted_at ? ` · normal le ${H.formatDateTime(message.deleted_at)}` : ""}</small>
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

    H.$("#newOwlMessageBtn", root)?.addEventListener("click", () => {
      const form = H.$("#owlLoginMessageForm", root);
      const button = H.$("#newOwlMessageBtn", root);
      if (!form || !button) return;
      form.hidden = !form.hidden;
      if (!form.hidden) this.resetOwlMessageForm();
      button.textContent = form.hidden ? "Créer un nouveau message du Hibou" : "Refermer le formulaire du Hibou";
    });

    H.$("#owlLoginMessageForm", root)?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.saveOwlLoginMessage(event.currentTarget);
    });
    H.$("#clearOwlLoginMessageBtn", root)?.addEventListener("click", async () => this.clearOwlLoginMessage());
    H.$("#cancelOwlMessageEditBtn", root)?.addEventListener("click", () => this.resetOwlMessageForm());
    H.$$(".edit-owl-message-btn", root).forEach((button) => {
      button.addEventListener("click", (event) => this.startEditOwlMessage(event.currentTarget.closest(".admin-owl-message-row")));
    });
    H.$$(".toggle-owl-message-enabled-btn", root).forEach((button) => {
      button.addEventListener("click", (event) => this.toggleOwlMessageEnabled(event.currentTarget.closest(".admin-owl-message-row")));
    });
    H.$$(".toggle-owl-message-history-btn", root).forEach((button) => {
      button.addEventListener("click", (event) => this.toggleOwlMessageHistory(event.currentTarget.closest(".admin-owl-message-row")));
    });
    H.$$(".archive-owl-message-btn", root).forEach((button) => {
      button.addEventListener("click", (event) => this.archiveOwlMessage(event.currentTarget.closest(".admin-owl-message-row")));
    });

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

    const reason = prompt("Raison de modération ?", "Message normal par admin") || "Message normal par admin";
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
    H.toast("Message normal", "success");
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
    if (typeof matchOrKickoff === "object" && this.isLiveDemoMatch(matchOrKickoff)) return true;
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

      if (a.stage !== "group" || b.stage !== "group") {
        const bracketDiff = (H.officialBracketSortValue?.(a) || pa.kickoff) - (H.officialBracketSortValue?.(b) || pb.kickoff);
        if (bracketDiff) return bracketDiff;
      }

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

    H.$$(".quick-reset-scheduled-btn", root).forEach((button) => {
      button.addEventListener("click", (event) => {
        const row = event.currentTarget.closest(".quick-score-card");
        row.querySelector(".quick-status").value = "scheduled";
        row.querySelector(".quick-home-score").value = "";
        row.querySelector(".quick-away-score").value = "";
        row.querySelector(".quick-winner").value = "";
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
      <article class="quick-score-card status-${H.escapeHtml(match.status || "scheduled")}" data-match-id="${match.id}" data-home-team-id="${match.home_team_id}" data-away-team-id="${match.away_team_id}" data-stage="${match.stage}" data-current-status="${H.escapeHtml(match.status || "scheduled")}" data-is-test-match="${match.is_test_match ? "true" : "false"}" data-is-live-demo-match="${this.isLiveDemoMatch(match) ? "true" : "false"}" data-kickoff-at="${H.escapeHtml(match.kickoff_at || "")}">
        <div class="quick-score-head">
          <div>
            <strong>${H.matchFlagHtml(match, "home")} ${H.escapeHtml(match.home_team_name)} <span>vs</span> ${H.matchFlagHtml(match, "away")} ${H.escapeHtml(match.away_team_name)}</strong>
            <small>${H.formatDateTime(match.kickoff_at)} · ${H.shortPoolRoundLabel(match)} · ${H.statusLabel(match.status)}</small>
            <small class="quick-location-line">${H.matchLocationHtml(match, true)}</small>
          </div>
          <div class="quick-score-pills">
            ${this.isLiveDemoMatch(match) ? `<span class="pill danger">LABO LIVE</span>` : match.is_test_match ? `<span class="pill warning">TEST</span>` : ""}
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
          ${match.status === "live" ? `<button type="button" class="ghost-btn quick-reset-scheduled-btn">Remettre à venir</button>` : ""}
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
    let homeScore = this.getScoreValue(row, ".quick-home-score");
    let awayScore = this.getScoreValue(row, ".quick-away-score");
    const status = forceFinished ? "finished" : row.querySelector(".quick-status").value;
    const stage = row.dataset.stage;
    const infoPayload = this.matchInfoPayloadFromRow(row, "quick");
    const effectiveKickoffAt = infoPayload.kickoff_at || row.dataset.kickoffAt;
    const isDemoMatch = row.dataset.isLiveDemoMatch === "true";
    const canScore = isDemoMatch || this.canScoreMatch(effectiveKickoffAt);
    let winnerTeamId = row.querySelector(".quick-winner").value || null;
    const resetToScheduled = status === "scheduled";
    if (resetToScheduled) {
      homeScore = null;
      awayScore = null;
      winnerTeamId = null;
    }

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
    await this.reloadAndPropagateFinalBracket("quick_score");
    H.toast(resetToScheduled ? "Match remis à venir" : status === "finished" ? "Score enregistré et match terminé" : "Match enregistré", "success");
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
              <article class="admin-row match-admin-row status-${H.escapeHtml(match.status || "scheduled")}" data-match-id="${match.id}" data-home-team-id="${match.home_team_id}" data-away-team-id="${match.away_team_id}" data-stage="${match.stage}" data-current-status="${H.escapeHtml(match.status || "scheduled")}" data-kickoff-at="${H.escapeHtml(match.kickoff_at || "")}">
                <div class="admin-main">
                  <strong>${H.matchFlagHtml(match, "home")} ${H.escapeHtml(match.home_team_name)} - ${H.matchFlagHtml(match, "away")} ${H.escapeHtml(match.away_team_name)}</strong>
                  <small>${H.formatDateTime(match.kickoff_at)} · ${H.shortPoolRoundLabel(match)} · ${H.statusLabel(match.status)} · <span class="admin-location-line">${H.matchLocationHtml(match, true)}</span></small>
                </div>
                ${this.matchInfoEditorHtml(match, "match")}
                ${this.finalTeamsEditorHtml(match)}
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
                  ${match.status === "live" ? `<button type="button" class="ghost-btn reset-match-scheduled-btn">Remettre à venir</button>` : ""}
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

    H.$$(".reset-match-scheduled-btn", root).forEach((btn) => {
      btn.addEventListener("click", (event) => {
        const row = event.currentTarget.closest(".match-admin-row");
        row.querySelector(".match-status").value = "scheduled";
        row.querySelector(".match-home-score").value = "";
        row.querySelector(".match-away-score").value = "";
        row.querySelector(".match-winner").value = "";
        this.saveMatch(row);
      });
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
    let homeScore = homeScoreRaw === "" ? null : Number(homeScoreRaw);
    let awayScore = awayScoreRaw === "" ? null : Number(awayScoreRaw);
    let winnerTeamId = row.querySelector(".match-winner").value || null;
    const infoPayload = this.matchInfoPayloadFromRow(row, "match");
    const effectiveKickoffAt = infoPayload.kickoff_at || row.dataset.kickoffAt;
    const isDemoMatch = row.dataset.isLiveDemoMatch === "true";
    const canScore = isDemoMatch || this.canScoreMatch(effectiveKickoffAt);
    const resetToScheduled = status === "scheduled";
    if (resetToScheduled) {
      homeScore = null;
      awayScore = null;
      winnerTeamId = null;
    }

    if (!canScore && ["live", "finished"].includes(status)) {
      H.toast("Ce match n'a pas encore commencé : impossible de le passer en direct ou terminé.", "error");
      return;
    }

    if (!canScore && (homeScore !== null || awayScore !== null || winnerTeamId)) {
      H.toast("Ce match n'a pas encore commencé : les scores sont verrouillés.", "error");
      return;
    }

    const homeTeamSelect = row.querySelector(".match-home-team-id");
    const awayTeamSelect = row.querySelector(".match-away-team-id");
    const effectiveHomeTeamId = homeTeamSelect?.value || row.dataset.homeTeamId || null;
    const effectiveAwayTeamId = awayTeamSelect?.value || row.dataset.awayTeamId || null;

    if (homeScore !== null && awayScore !== null) {
      if (homeScore > awayScore) winnerTeamId = effectiveHomeTeamId || winnerTeamId;
      if (awayScore > homeScore) winnerTeamId = effectiveAwayTeamId || winnerTeamId;
      if (homeScore === awayScore && row.dataset.stage === "group") winnerTeamId = null;
    }

    if (status === "finished" && row.dataset.stage !== "group" && homeScore === awayScore && !winnerTeamId) {
      H.toast("Choisis le qualifié pour ce match à élimination directe.", "error");
      return;
    }

    const manualTeamPayload = {};
    if (homeTeamSelect) manualTeamPayload.home_team_id = effectiveHomeTeamId;
    if (awayTeamSelect) manualTeamPayload.away_team_id = effectiveAwayTeamId;

    const payload = {
      status,
      home_score: homeScore,
      away_score: awayScore,
      winner_team_id: winnerTeamId,
      tv_channel: this.tvChannelValueFromRow(row, "match"),
      tv_channel_source: "manual",
      ...manualTeamPayload,
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
    await this.reloadAndPropagateFinalBracket("match_admin");
    H.toast(resetToScheduled ? "Match remis à venir" : "Match mis à jour", "success");
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
    const btn = H.$("#recalcAllBtn");
    if (btn) {
      btn.disabled = true;
      btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
      btn.textContent = "Réparation en cours…";
    }

    let result = null;
    let { data, error } = await window.sb.rpc("admin_repair_missing_scores");

    // Compatibilité : si le patch SQL V1.8.8 n'est pas encore lancé,
    // on tente quand même l'ancien recalcul global.
    if (error && /function .*admin_repair_missing_scores|Could not find the function|PGRST202/i.test(error.message || "")) {
      ({ data, error } = await window.sb.rpc("recalc_all_points"));
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || "Réparer scores manquants + recalculer";
    }

    if (error) {
      H.toast(error.message, "error");
      return;
    }

    result = Array.isArray(data) ? data[0] : data;
    const recalculated = Number(result?.recalculated_prediction_points ?? result ?? 0);
    const missingAfter = Number(result?.missing_after ?? 0);
    const message = missingAfter > 0
      ? `Recalcul terminé : ${recalculated} ligne(s). Encore ${missingAfter} score(s) manquant(s) à vérifier.`
      : `Scores manquants réparés : ${recalculated} ligne(s) recalculée(s).`;

    H.toast(message, missingAfter > 0 ? "warning" : "success");
    await this.reloadAll();
    if (this.state.adminSection === "scores") this.renderMatches();
    await this.loadAuditLogs();
    this.renderAudit();
  },


  ensureLiveDemoControls() {
    if (H.$("#toggleLiveDemoMatchBtn")) return;

    const prepBox = H.$(".prep-module-box") || H.$(".backup-panel-grid") || H.$("#backupsSection") || H.$("main");
    if (!prepBox) return;

    const box = document.createElement("div");
    box.className = "graph-preview-admin-box live-demo-admin-box injected-live-demo-box";
    box.innerHTML = `
      <h4>Labo score en direct</h4>
      <p class="prep-module-status muted" id="liveDemoMatchStatusText">Chargement du labo live...</p>
      <div class="graph-preview-actions">
        <button class="ghost-btn" id="toggleLiveDemoMatchBtn" type="button">Activer le match fictif live</button>
      </div>
      <div class="live-demo-score-inject" id="liveDemoScoreInjectBox"></div>
      <p class="muted tiny-note">Match 100% fictif : sert à tester l’affichage live, les scores et les classements. Il est compté temporairement tant qu’il est actif, puis supprimé avec ses pronos quand tu le retires. À retirer avant validation Coupe du monde.</p>
    `;

    prepBox.appendChild(box);
    H.$("#toggleLiveDemoMatchBtn")?.addEventListener("click", () => this.toggleLiveDemoMatch());
  },

  renderBackups() {
    this.ensureLiveDemoControls();
    const select = H.$("#backupSelect");
    const list = H.$("#backupListAdmin");
    const prepEnabled = this.state.preparationModuleEnabled !== false;
    const graphPreviewEnabled = this.state.graphPreviewTestMatchesEnabled === true;
    const graphMockPreviewEnabled = this.state.graphMockPreviewEnabled === true;
    const homeProgressIncludeTestMatches = this.state.homeProgressIncludeTestMatches === true;
    const liveDemoMatchEnabled = this.state.liveDemoMatchEnabled === true;
    const prepStatus = H.$("#prepModuleStatusText");
    const prepToggle = H.$("#togglePreparationModuleBtn");
    const graphPreviewStatus = H.$("#graphPreviewStatusText");
    const graphPreviewToggle = H.$("#toggleGraphPreviewBtn");
    const graphMockStatus = H.$("#graphMockPreviewStatusText");
    const graphMockToggle = H.$("#toggleGraphMockPreviewBtn");
    const homeProgressStatus = H.$("#homeProgressTestMatchesStatusText");
    const homeProgressToggle = H.$("#toggleHomeProgressTestMatchesBtn");
    const liveDemoStatus = H.$("#liveDemoMatchStatusText");
    const liveDemoToggle = H.$("#toggleLiveDemoMatchBtn");
    const championFirstInput = H.$("#championFirstBonusPointsInput");
    const championSecondInput = H.$("#championSecondBonusPointsInput");
    const championBonusStatus = H.$("#championBonusPointsStatusText");

    if (prepStatus) {
      prepStatus.innerHTML = prepEnabled
        ? `<strong>Actif</strong> · les matchs test restent visibles dans les écrans joueurs/admin.`
        : `<strong>Désactivé</strong> · les matchs test, règles et classements de préparation sont normals.`;
    }

    if (prepToggle) {
      prepToggle.textContent = prepEnabled ? "Désactiver le module préparation" : "Réactiver le module préparation";
      prepToggle.classList.toggle("danger-btn", prepEnabled);
      prepToggle.classList.toggle("ghost-btn", !prepEnabled);
    }

    if (graphPreviewStatus) {
      graphPreviewStatus.innerHTML = graphPreviewEnabled
        ? `<strong>Actif</strong> · les graphs d’évolution incluent les matchs test pour prévisualiser l’affichage.`
        : `<strong>Désactivé</strong> · les graphs suivent les règles normales et attendent les matchs officiels terminés.`;
    }

    if (graphPreviewToggle) {
      graphPreviewToggle.textContent = graphPreviewEnabled ? "Désactiver les graphs avec matchs test" : "Graphs avec matchs test";
      graphPreviewToggle.classList.toggle("danger-btn", graphPreviewEnabled);
      graphPreviewToggle.classList.toggle("ghost-btn", !graphPreviewEnabled);
    }

    if (graphMockStatus) {
      graphMockStatus.innerHTML = graphMockPreviewEnabled
        ? `<strong>Actif</strong> · une courbe fictive apparaît même sans match terminé.`
        : `<strong>Désactivé</strong> · aucune donnée fictive n’est injectée dans les graphs.`;
    }

    if (graphMockToggle) {
      graphMockToggle.textContent = graphMockPreviewEnabled ? "Désactiver la maquette graph" : "Maquette graph sans données";
      graphMockToggle.classList.toggle("danger-btn", graphMockPreviewEnabled);
      graphMockToggle.classList.toggle("ghost-btn", !graphMockPreviewEnabled);
    }

    if (homeProgressStatus) {
      homeProgressStatus.innerHTML = homeProgressIncludeTestMatches
        ? `<strong>Actif</strong> · la progression de l’accueil inclut aussi les matchs test.`
        : `<strong>Désactivé</strong> · la progression de l’accueil compte uniquement les matchs officiels.`;
    }

    if (homeProgressToggle) {
      homeProgressToggle.textContent = homeProgressIncludeTestMatches ? "Exclure les matchs test de la progression" : "Inclure les matchs test dans la progression";
      homeProgressToggle.classList.toggle("danger-btn", homeProgressIncludeTestMatches);
      homeProgressToggle.classList.toggle("ghost-btn", !homeProgressIncludeTestMatches);
    }

    if (liveDemoStatus) {
      liveDemoStatus.innerHTML = liveDemoMatchEnabled
        ? `<strong>Actif</strong> · le match fictif Labo live est visible dans l’admin et l’app. À retirer avant validation Coupe du monde.`
        : `<strong>Désactivé</strong> · aucun match fictif live n’est injecté.`;
    }

    if (liveDemoToggle) {
      liveDemoToggle.textContent = liveDemoMatchEnabled ? "Retirer le match fictif live" : "Activer le match fictif live";
      liveDemoToggle.classList.toggle("danger-btn", liveDemoMatchEnabled);
      liveDemoToggle.classList.toggle("ghost-btn", !liveDemoMatchEnabled);
    }

    if (championFirstInput && document.activeElement !== championFirstInput) championFirstInput.value = String(this.state.championFirstBonusPoints ?? 100);
    if (championSecondInput && document.activeElement !== championSecondInput) championSecondInput.value = String(this.state.championSecondBonusPoints ?? 50);
    if (championBonusStatus) {
      championBonusStatus.innerHTML = `<strong>${Number(this.state.championFirstBonusPoints ?? 100)} pts</strong> avant compétition · <strong>${Number(this.state.championSecondBonusPoints ?? 50)} pts</strong> avant phase finale. Les classements suivent ce réglage dès que le patch SQL est lancé.`;
    }

    this.renderLiveDemoScoreInjectBox();

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

  async saveChampionBonusPoints() {
    const first = Math.max(0, Math.min(500, Math.round(Number(H.$("#championFirstBonusPointsInput")?.value ?? 100))));
    const second = Math.max(0, Math.min(500, Math.round(Number(H.$("#championSecondBonusPointsInput")?.value ?? 50))));
    if (!Number.isFinite(first) || !Number.isFinite(second)) {
      H.toast("Entre deux nombres de points valides.", "error");
      return;
    }

    const { error } = await window.sb.rpc("admin_set_champion_bonus_points", {
      p_initial_points: first,
      p_second_points: second
    });

    if (error) {
      H.toast(error.message || "Impossible d’enregistrer les points bonus. Lance le patch SQL V1.8.40.", "error");
      return;
    }

    this.state.championFirstBonusPoints = first;
    this.state.championSecondBonusPoints = second;
    await this.loadFamilyModeSetting();
    this.renderBackups();
    await this.logAdminAction("set_champion_bonus_points", "settings", { initial_points: first, second_points: second });
    H.toast(`Bonus champion réglés : ${first} pts / ${second} pts`, "success");
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



  async cleanStartPreservePredictions() {
    const typed = H.$("#cleanStartConfirmInput")?.value || "";
    if (typed !== "DEPART PROPRE") {
      H.toast("Tape exactement : DEPART PROPRE", "error");
      return;
    }

    const first = confirm("Reset départ compétition : garder les pronostics déjà posés, mais remettre à zéro points, classements, scores/statuts, leaders accueil et labo. Continuer ?");
    if (!first) return;

    const second = confirm("Dernière sécurité : les pronos restent, mais les points actuels et scores de test seront effacés. Continuer ?");
    if (!second) return;

    const { data, error } = await window.sb.rpc("admin_clean_start_preserve_predictions", { p_confirm: "DEPART PROPRE" });
    if (error) {
      H.toast(error.message || "Reset classements impossible. Lance le patch SQL V1.8.40.", "error");
      return;
    }

    const summary = Array.isArray(data) ? data[0] : data;
    H.$("#cleanStartConfirmInput").value = "";
    await this.logAdminAction("clean_start_preserve_predictions", "reset", summary || {});
    H.toast(summary?.message || "Classements remis à zéro, pronos conservés", "success");
    await this.reloadAll();
  },

  async fullLaunchReset() {
    const typed = H.$("#launchResetConfirmInput")?.value || "";
    if (typed !== "LANCEMENT PROPRE") {
      H.toast("Tape exactement : LANCEMENT PROPRE", "error");
      return;
    }

    const first = confirm("DANGER : reset complet lancement. À ne PAS utiliser si des joueurs ont déjà posé de vrais pronos. Cela supprime pronos, points, champion, coupons, sauvegardes, messages, réactions, blocages et journal admin. Continuer ?");
    if (!first) return;

    const second = confirm("Dernière sécurité : cette action prépare l’application pour un lancement propre. Continuer ?");
    if (!second) return;

    const { data, error } = await window.sb.rpc("admin_full_launch_reset", { p_confirm: "LANCEMENT PROPRE" });
    if (error) {
      H.toast(error.message || "Reset lancement impossible. As-tu lancé le patch SQL V1.3.6 ?", "error");
      return;
    }

    const summary = Array.isArray(data) ? data[0] : data;
    H.$("#launchResetConfirmInput").value = "";
    H.toast(summary?.message || "Application remise à blanc pour le lancement", "success");
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




  async toggleHomeProgressTestMatches() {
    const enabledNow = this.state.homeProgressIncludeTestMatches === true;
    const nextEnabled = !enabledNow;
    const message = enabledNow
      ? "Exclure les matchs test de la progression de l’accueil ?"
      : "Inclure les matchs test dans la progression de l’accueil ? Utile pendant la phase de préparation.";

    if (!confirm(message)) return;

    const { error } = await window.sb.rpc("admin_set_home_progress_test_matches", { p_enabled: nextEnabled });
    if (error) {
      H.toast(error.message || "Impossible de modifier la progression accueil. Lance le patch SQL V1.3.6.", "error");
      return;
    }

    await this.loadFamilyModeSetting();
    await this.loadAuditLogs();
    this.renderBackups();
    this.renderHealth();
    this.renderAudit();
    H.toast(nextEnabled ? "Progression accueil : matchs test inclus" : "Progression accueil : officiels uniquement", "success");
  },

  async toggleGraphMockPreview() {
    const enabledNow = this.state.graphMockPreviewEnabled === true;
    const nextEnabled = !enabledNow;
    const message = enabledNow
      ? "Désactiver la maquette graph ? Les graphs reviendront aux vraies données."
      : "Activer une maquette graph fictive ? Cela permet de vérifier l’affichage avant même le premier match test. Aucun impact sur Supabase.";

    if (!confirm(message)) return;

    const { error } = await window.sb.rpc("admin_set_graph_mock_preview", { p_enabled: nextEnabled });
    if (error) {
      H.toast(error.message || "Impossible de modifier la maquette graph. Lance le patch SQL V1.3.6.", "error");
      return;
    }

    await this.loadFamilyModeSetting();
    await this.loadAuditLogs();
    this.renderBackups();
    this.renderHealth();
    this.renderAudit();
    H.toast(nextEnabled ? "Maquette graph activée" : "Maquette graph désactivée", "success");
  },

  async toggleGraphPreviewTestMatches() {
    const enabledNow = this.state.graphPreviewTestMatchesEnabled === true;
    const nextEnabled = !enabledNow;
    const message = enabledNow
      ? "Désactiver la prévisualisation des graphs ? Les courbes reviendront aux règles normales : matchs officiels terminés uniquement."
      : "Activer la prévisualisation des graphs avec les matchs test ? Utile pour vérifier l’affichage avant le premier match officiel.";

    if (!confirm(message)) return;

    const { error } = await window.sb.rpc("admin_set_graph_preview_test_matches", { p_enabled: nextEnabled });
    if (error) {
      H.toast(error.message || "Impossible de modifier la prévisualisation graphs. Lance le patch SQL V1.3.6.", "error");
      return;
    }

    await this.loadFamilyModeSetting();
    await this.loadAuditLogs();
    this.renderBackups();
    this.renderAudit();
    H.toast(nextEnabled ? "Prévisualisation graphs activée" : "Prévisualisation graphs désactivée", "success");
  },



  liveDemoMatch() {
    return (this.state.matches || []).find((match) => this.isLiveDemoMatch(match)) || null;
  },

  renderLiveDemoScoreInjectBox() {
    const box = H.$("#liveDemoScoreInjectBox");
    if (!box) return;

    const match = this.liveDemoMatch();
    const enabled = this.state.liveDemoMatchEnabled === true;

    if (!enabled) {
      box.innerHTML = "";
      return;
    }

    if (!match) {
      box.innerHTML = `
        <div class="live-demo-inject-empty">
          Active le match fictif live, puis reviens ici pour injecter des scores et des pronos.
        </div>
      `;
      return;
    }

    const scoreButtons = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
      [3, 1]
    ];

    box.innerHTML = `
      <div class="live-demo-inject-panel">
        <div>
          <strong>${H.escapeHtml(match.home_team_name || "Hiboux du Nid")} ${H.scoreText(match.home_score ?? 0, match.away_score ?? 0)} ${H.escapeHtml(match.away_team_name || "Chouettes du Live")}</strong>
          <small>Injection labo : visible pour tous les joueurs et comptée temporairement dans les classements tant que le labo est actif. Tout disparaît quand tu retires le labo.</small>
        </div>
        <div class="live-demo-inject-actions">
          <button class="ghost-btn" id="injectLiveDemoPredictionsBtn" type="button">Injecter des pronos pour tous</button>
          <button class="ghost-btn live-demo-status-btn" type="button" data-status="scheduled">Remettre à venir</button>
          <button class="ghost-btn live-demo-status-btn" type="button" data-status="live">Passer en direct</button>
          ${scoreButtons.map(([home, away]) => `<button class="ghost-btn live-demo-score-btn" type="button" data-home="${home}" data-away="${away}">${home}-${away}</button>`).join("")}
        </div>
      </div>
    `;

    H.$("#injectLiveDemoPredictionsBtn", box)?.addEventListener("click", () => this.injectLiveDemoPredictionsForAll());
    H.$$(".live-demo-status-btn", box).forEach((button) => {
      button.addEventListener("click", () => this.setLiveDemoStatus(button.dataset.status));
    });

    H.$$(".live-demo-score-btn", box).forEach((button) => {
      button.addEventListener("click", () => this.setLiveDemoScore(Number(button.dataset.home), Number(button.dataset.away)));
    });
  },

  async injectLiveDemoPredictionsForAll() {
    if (!confirm("Injecter des pronos de labo pour tous les joueurs actifs ? Ils seront supprimés quand tu retires le match labo.")) return;

    const { data, error } = await window.sb.rpc("admin_inject_live_demo_predictions");
    if (error) {
      H.toast(error.message || "Injection impossible. Lance le patch SQL V1.3.34.", "error");
      return;
    }

    const count = Array.isArray(data) ? data[0]?.inserted_count : data;
    await this.logAdminAction("inject_live_demo_predictions", "preparation", { count });
    H.toast(`${count ?? "Les"} prono(s) labo injecté(s)`, "success");
    await this.loadMatches();
    this.renderBackups();
    this.renderQuickScores();
  },

  async setLiveDemoStatus(status) {
    const { error } = await window.sb.rpc("admin_set_live_demo_score", {
      p_status: status,
      p_home_score: null,
      p_away_score: null
    });

    if (error) {
      H.toast(error.message || "Impossible de modifier le statut labo. Lance le patch SQL V1.3.35.", "error");
      return;
    }

    await this.logAdminAction("set_live_demo_status", "score", { status });
    H.toast(status === "scheduled" ? "Match labo remis à venir" : "Match labo passé en direct", "success");
    await this.loadMatches();
    await this.loadHealthSnapshot();
    this.renderBackups();
    this.renderQuickScores();
    this.renderHealth();
  },

  async setLiveDemoScore(home, away) {
    const { error } = await window.sb.rpc("admin_set_live_demo_score", {
      p_status: "live",
      p_home_score: home,
      p_away_score: away
    });

    if (error) {
      H.toast(error.message || "Impossible d’injecter ce score labo. Lance le patch SQL V1.3.35.", "error");
      return;
    }

    await this.logAdminAction("set_live_demo_score", "score", { home_score: home, away_score: away });
    H.toast(`Score labo injecté : ${home}-${away}`, "success");
    await this.loadMatches();
    await this.loadHealthSnapshot();
    this.renderBackups();
    this.renderQuickScores();
    this.renderHealth();
  },

  async toggleLiveDemoMatch() {
    const enabledNow = this.state.liveDemoMatchEnabled === true;
    const nextEnabled = !enabledNow;
    const message = enabledNow
      ? "Retirer le match fictif live ? Il sera supprimé avec ses pronos/points éventuels. À faire avant validation Coupe du monde."
      : "Activer le match fictif live ? Il apparaîtra dans l’admin et l’app pour tester les scores en direct. Il ne compte dans aucun classement.";

    if (!confirm(message)) return;

    const { error } = await window.sb.rpc("admin_set_live_demo_match", { p_enabled: nextEnabled });
    if (error) {
      H.toast(error.message || "Impossible de modifier le match fictif live. Lance le patch SQL V1.3.30 inclus dans le zip V1.3.32.", "error");
      return;
    }

    await this.loadFamilyModeSetting();
    await this.loadMatches();
    await this.loadHealthSnapshot();
    await this.loadAuditLogs();
    this.renderBackups();
    this.renderQuickScores();
    this.renderMatches();
    this.renderHealth();
    this.renderAudit();
    H.toast(nextEnabled ? "Match fictif live activé" : "Match fictif live retiré", "success");
  },

  async togglePreparationModule() {
    const enabledNow = this.state.preparationModuleEnabled !== false;
    const nextEnabled = !enabledNow;
    const message = enabledNow
      ? "Désactiver le module préparation ? Les matchs test, leurs règles et leurs classements par phase seront normals. Les 2 badges de préparation restent visibles dans les exploits."
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
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, async () => {
        if (!this.isSuperAdmin()) return;
        await this.loadFamilyModeSetting();
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
