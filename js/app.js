// ============================================================
// LE NID DES PRONOS — APP PRINCIPALE
// ============================================================

const H = window.Helpers;

const App = {
  state: {
    session: null,
    profile: null,
    officeTeams: [],
    footballTeams: [],
    activeCompetition: null,
    winnerPrediction: null,
    matches: [],
    myPredictions: [],
    visiblePredictions: [],
    currentView: "home",
    leaderboardTab: "overall",
    teamTab: "average",
    achievementsTab: "mine",
    worldcupTab: "groups",
    matchPhaseIndex: 0,
    myPredictionsPhaseIndex: 0,
    leaderboardPhaseIndex: 0
  },

  async init() {
    this.state.session = await Auth.requireSession();
    if (!this.state.session) return;

    this.bindNavigation();
    this.bindGlobalActions();
    await this.loadBaseData();
    const requestedView = new URLSearchParams(window.location.search).get("view") || "home";
    const allowedViews = ["home", "matches", "worldcup", "mypredictions", "leaderboard", "achievements", "profile"];
    const mustCompleteProfile = !this.profileSetupComplete();
    await this.loadView(mustCompleteProfile ? "profile" : (allowedViews.includes(requestedView) ? requestedView : "home"));
    if (mustCompleteProfile) H.toast("Bienvenue ! Choisis ton pseudo, ton avatar, ton badge et ta team pour entrer dans le nid.", "info");
    this.setupRealtime();
  },

  bindNavigation() {
    H.$$("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => this.loadView(btn.dataset.view));
    });
  },

  bindGlobalActions() {
    const logoutBtn = H.$("#logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", () => Auth.logout());

    const creditsBtn = H.$("#creditsBtn");
    if (creditsBtn) creditsBtn.addEventListener("click", () => this.openCreditsModal());
  },

  profileSetupComplete() {
    const p = this.state.profile;
    return Boolean(p?.profile_setup_done && p?.pseudo && p?.office_team_id && p?.avatar_key && p?.badge_shape && p?.badge_color);
  },

  avatarChoices() {
    return Object.entries(H.AVATAR_LABELS).map(([key, label]) => ({ key, label }));
  },

  badgeShapes() {
    return [
      { key: "rounded", label: "Carré arrondi" },
      { key: "circle", label: "Rond" },
      { key: "shield", label: "Blason" },
      { key: "hex", label: "Hexagone" },
      { key: "diamond", label: "Diamant" }
    ];
  },

  badgeColors() {
    return ["#facc15", "#38bdf8", "#22c55e", "#a78bfa", "#f97316", "#ef4444", "#14b8a6", "#ec4899", "#60a5fa", "#ffffff"];
  },

  openCreditsModal() {
    const existing = H.$("#creditsModal");
    if (existing) existing.remove();
    const modal = document.createElement("div");
    modal.id = "creditsModal";
    modal.className = "modal-backdrop credits-modal";
    modal.innerHTML = `
      <div class="modal-card credits-card" role="dialog" aria-modal="true" aria-labelledby="creditsTitle">
        <div class="card-title-row">
          <div>
            <p class="eyebrow">Crédits cachés</p>
            <h2 id="creditsTitle">Le Nid des Pronos</h2>
            <p class="muted">Version <strong>0.24.2</strong> · pré-déploiement. Le passage en <strong>1.0.0</strong> se fera au déploiement officiel.</p>
          </div>
          <button class="ghost-btn" id="closeCreditsBtn" type="button">Fermer</button>
        </div>
        <div class="credits-grid">
          <section>
            <h3>Principe de version</h3>
            <p><strong>0.24.2</strong> = version non déployée · évolution majeure n°24 · correction mineure 2.</p>
            <p><strong>1.x.x</strong> = version publique déployée.</p>
          </section>
          <section>
            <h3>Évolutions récentes</h3>
            <ul class="changelog-list">
              <li><strong>0.24.2</strong> — avatar joueur affiché dans les classements, à gauche des scores.</li>
              <li><strong>0.24.2</strong> — choix d’avatar sans fond parasite, galerie teintée par la couleur de la team et suppression du carré jaune derrière l’avatar du menu.</li>
              <li><strong>0.24.0</strong> — 90 avatars chouette pris en charge, galerie d’avatars masquée par défaut et ouverture via “Personnaliser l’avatar”.</li>
              <li><strong>0.23.0</strong> — menu Coupe du monde, déplacement des crédits/déconnexion dans Profil et suppression des raccourcis d’accueil.</li>
              <li><strong>0.22.5</strong> — affichage des lieux au format <code>drapeau pays hôte - ville - stade</code>, avec drapeaux locaux Canada / États-Unis / Mexique.</li>
              <li><strong>0.22.4</strong> — correctif sauvegardes/restauration : suppression sécurisée avec <code>WHERE true</code> pour éviter l’erreur <code>DELETE requires a WHERE clause</code>.</li>
              <li><strong>0.22.3</strong> — correctif sauvegardes/restauration : suppression de l’erreur <code>points_total</code> sur le choix champion.</li>
              <li><strong>0.22.2</strong> — pays hôte sur les matchs, écran d’accueil enrichi, patch sauvegardes corrigé sans erreur SQL.</li>
              <li><strong>0.22.0</strong> — menu desktop simplifié, accès profil via badge, admin par sections, sauvegardes/restauration et remise à zéro sécurisée.</li>
              <li><strong>0.21.0</strong> — onboarding première connexion, avatars chouette, badge joueur forme/couleur, teams bureau administrables.</li>
              <li><strong>0.20.0</strong> — icônes PNG chouette agrandies et recadrées.</li>
              <li><strong>0.17.0</strong> — choix du champion du monde +100 points.</li>
              <li><strong>0.15.x</strong> — logos TV beIN / M6 / W9.</li>
              <li><strong>0.14.0</strong> — admin mobile avec priorité prochains matchs.</li>
            </ul>
          </section>
          <section>
            <h3>Crédits</h3>
            <p>Application : Le Nid des Pronos · concept pronos + chouette.</p>
            <p>Version de travail par Parkaf.</p>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    H.$("#closeCreditsBtn", modal).addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  },

  async loadBaseData() {
    await Promise.all([
      this.loadProfile(),
      this.loadOfficeTeams(),
      this.loadFootballTeams(),
      this.loadActiveCompetition(),
      this.loadMatches(),
      this.loadMyPredictions(),
      this.loadVisiblePredictions()
    ]);

    await this.loadWinnerPrediction();
    this.renderShell();
  },

  async loadProfile() {
    const userId = this.state.session.user.id;
    const { data, error } = await window.sb
      .from("profiles")
      .select("id,email,pseudo,role,office_team_id,is_active,avatar_key,badge_shape,badge_color,profile_setup_done")
      .eq("id", userId)
      .single();

    if (error) throw error;
    this.state.profile = data;
  },

  async loadOfficeTeams() {
    const { data, error } = await window.sb
      .from("office_teams")
      .select("id,name,slug,color,avatar_url")
      .order("name");

    if (error) throw error;
    this.state.officeTeams = data || [];
  },

  async loadFootballTeams() {
    const { data, error } = await window.sb
      .from("football_teams")
      .select("id,name,short_name,country_code,flag_url")
      .order("name");

    if (error) throw error;
    this.state.footballTeams = data || [];
  },

  async loadActiveCompetition() {
    const { data, error } = await window.sb
      .from("competitions")
      .select("id,name,slug,is_active")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    this.state.activeCompetition = data || null;
  },

  async loadWinnerPrediction() {
    if (!this.state.activeCompetition) {
      this.state.winnerPrediction = null;
      return;
    }

    const { data, error } = await window.sb
      .from("winner_predictions")
      .select("*")
      .eq("user_id", this.state.session.user.id)
      .eq("competition_id", this.state.activeCompetition.id)
      .maybeSingle();

    if (error) {
      console.warn("winner_predictions indisponible pour le moment", error);
      this.state.winnerPrediction = null;
      return;
    }

    this.state.winnerPrediction = data || null;
  },

  async loadMatches() {
    const { data, error } = await window.sb
      .from("v_matches")
      .select("*")
      .order("kickoff_at", { ascending: true });

    if (error) throw error;
    this.state.matches = data || [];
  },

  async loadMyPredictions() {
    const { data, error } = await window.sb
      .from("predictions")
      .select("*")
      .eq("user_id", this.state.session.user.id);

    if (error) throw error;
    this.state.myPredictions = data || [];
  },

  async loadVisiblePredictions() {
    const { data, error } = await window.sb
      .from("v_visible_predictions")
      .select("*");

    if (error) {
      console.warn("v_visible_predictions indisponible pour le moment", error);
      this.state.visiblePredictions = [];
      return;
    }
    this.state.visiblePredictions = data || [];
  },

  renderShell() {
    const profile = this.state.profile;
    const team = this.state.officeTeams.find((t) => t.id === profile.office_team_id);

    H.$("#userPseudo").textContent = profile.pseudo || "Joueur";
    H.$("#userTeam").textContent = team ? team.name : "Team à choisir";
    const userAvatar = H.$("#userAvatar");
    if (userAvatar) userAvatar.innerHTML = H.profileBadgeHtml(profile, "profile-badge small");

    const isAdmin = profile.role === "admin";

    const adminLink = H.$("#adminLink");
    if (adminLink) {
      adminLink.hidden = !isAdmin;
    }

    const mobileAdminLink = H.$("#mobileAdminLink");
    const mobileNav = H.$(".mobile-nav");
    if (mobileAdminLink) {
      mobileAdminLink.hidden = !isAdmin;
    }
    if (mobileNav) {
      mobileNav.classList.toggle("has-admin", isAdmin);
    }
  },

  setActiveNav(viewName) {
    H.$$("[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === viewName);
    });
  },

  async loadView(viewName) {
    if (viewName !== "profile" && !this.profileSetupComplete()) {
      viewName = "profile";
      H.toast("Complète d’abord ton profil pour accéder au nid.", "info");
    }
    this.state.currentView = viewName;
    this.setActiveNav(viewName);

    const titleMap = {
      home: "Tableau de bord",
      matches: "Matchs & pronos",
      worldcup: "Coupe du monde",
      mypredictions: "Mes pronos",
      leaderboard: "Classements",
      achievements: "Exploits",
      profile: "Profil"
    };

    const title = H.$("#pageTitle");
    if (title) title.textContent = titleMap[viewName] || "Le Nid des Pronos";

    if (viewName === "home") await this.renderHome();
    if (viewName === "matches") await this.renderMatches();
    if (viewName === "worldcup") await this.renderWorldCup();
    if (viewName === "mypredictions") await this.renderMyPredictions();
    if (viewName === "leaderboard") await this.renderLeaderboard();
    if (viewName === "achievements") await this.renderAchievements();
    if (viewName === "profile") await this.renderProfile();
  },

  getMyPrediction(matchId) {
    return this.state.myPredictions.find((p) => p.match_id === matchId);
  },

  predictionsForMatch(matchId) {
    return this.state.visiblePredictions.filter((p) => p.match_id === matchId);
  },

  upcomingMatches() {
    return this.state.matches.filter((m) => new Date(m.kickoff_at).getTime() > Date.now());
  },

  missingPredictions() {
    return this.upcomingMatches().filter((m) => !this.getMyPrediction(m.id));
  },

  nextMatch() {
    return this.upcomingMatches()[0] || null;
  },

  competitionStartAt() {
    const dates = this.state.matches
      .map((m) => m.kickoff_at ? new Date(m.kickoff_at) : null)
      .filter(Boolean)
      .sort((a, b) => a - b);
    return dates[0] || null;
  },

  championPickLocked() {
    const start = this.competitionStartAt();
    return Boolean(start && start.getTime() <= Date.now());
  },

  teamOptionHtml(team) {
    const flag = H.flagImgHtml({
      flagUrl: team.flag_url,
      countryCode: team.country_code,
      shortName: team.short_name,
      name: team.name,
      className: "team-flag-img tiny-flag"
    });
    return `${flag}<span>${H.escapeHtml(team.name)}</span>`;
  },

  championCandidateTeams() {
    const groupTeamIds = new Set();
    this.state.matches
      .filter((match) => match.stage === "group")
      .forEach((match) => {
        if (match.home_team_id) groupTeamIds.add(match.home_team_id);
        if (match.away_team_id) groupTeamIds.add(match.away_team_id);
      });

    const candidates = groupTeamIds.size
      ? this.state.footballTeams.filter((team) => groupTeamIds.has(team.id))
      : this.state.footballTeams;

    return [...candidates].sort((a, b) => String(a.name).localeCompare(String(b.name), "fr"));
  },

  async saveChampionPick(teamId) {
    if (!this.state.activeCompetition) {
      H.toast("Compétition active introuvable", "error");
      return;
    }

    if (!teamId) {
      H.toast("Choisis une équipe championne", "error");
      return;
    }

    if (this.championPickLocked()) {
      H.toast("Choix champion verrouillé : la compétition a commencé", "error");
      return;
    }

    const payload = {
      user_id: this.state.session.user.id,
      competition_id: this.state.activeCompetition.id,
      predicted_team_id: teamId
    };

    const { error } = await window.sb
      .from("winner_predictions")
      .upsert(payload, { onConflict: "user_id,competition_id" });

    if (error) {
      H.toast(error.message, "error");
      return;
    }

    await this.loadWinnerPrediction();
    H.toast("Champion enregistré : 100 points si ça passe !", "success");
    await this.renderProfile();
  },

  async renderHome() {
    const root = H.$("#viewRoot");
    const next = this.nextMatch();
    const missing = this.missingPredictions();
    const myRank = await this.fetchMyRank();

    root.innerHTML = `
      <section class="hero-card">
        <div>
          <p class="eyebrow">${H.icon("nest")} Bienvenue dans le nid</p>
          <h2>Fais tes scores avant le coup d’envoi.</h2>
          <p class="muted">Les pronos des autres restent cachés jusqu’au début du match. Pas de copie, que du flair.</p>
        </div>
        <div class="hero-score">
          <span>${myRank ? `#${myRank.rank}` : "—"}</span>
          <small>ton rang</small>
        </div>
      </section>

      <section class="grid two">
        <article class="card">
          <div class="card-title-row">
            <h3>Prochain match</h3>
            <span class="pill">${next ? H.statusLabel(next.status) : "Aucun"}</span>
          </div>
          ${next ? this.matchMiniHtml(next) : `<p class="muted">Aucun match à venir pour le moment.</p>`}
        </article>

        <article class="card warning-soft">
          <div class="card-title-row">
            <h3>Pronos manquants</h3>
            <span class="count-badge">${missing.length}</span>
          </div>
          ${missing.length ? `
            <p class="muted">Tu as encore ${missing.length} match${missing.length > 1 ? "s" : ""} à pronostiquer.</p>
            <button class="primary-btn" data-view="matches">Voir les matchs</button>
          ` : `<p class="muted">Nickel, tous tes pronos à venir sont posés.</p>`}
        </article>
      </section>
    `;

    this.bindNavigation();
  },

  matchMiniHtml(match) {
    return `
      <div class="mini-match">
        <div class="teams-row">
          <strong>${H.matchFlagHtml(match, "home")} ${H.escapeHtml(match.home_team_name)}</strong>
          <span>vs</span>
          <strong>${H.matchFlagHtml(match, "away")} ${H.escapeHtml(match.away_team_name)}</strong>
        </div>
        <p class="muted mini-location-line">${H.matchLocationHtml(match, true)}</p>
        <p class="muted mini-tv-line">${H.formatDateTime(match.kickoff_at)} · ${H.tvChannelLogosHtml(match.tv_channel)}</p>
      </div>
    `;
  },

  async fetchMyRank() {
    const { data, error } = await window.sb
      .from("v_leaderboard_overall")
      .select("rank,user_id,total_points")
      .eq("user_id", this.state.session.user.id)
      .maybeSingle();

    if (error) return null;
    return data;
  },

  async renderMatches() {
    await Promise.all([this.loadMatches(), this.loadMyPredictions(), this.loadVisiblePredictions()]);

    const root = H.$("#viewRoot");
    const groups = this.groupMatchesByPouleRound(this.state.matches);
    const activeIndex = this.clampPhaseIndex("matchPhaseIndex", groups);
    const group = groups[activeIndex];

    if (!groups.length || !group) {
      root.innerHTML = `
        <section class="toolbar-card">
          <div>
            <h2>Matchs</h2>
            <p class="muted">Aucun match à afficher pour le moment.</p>
          </div>
          <button class="ghost-btn" id="refreshMatchesBtn">Rafraîchir</button>
        </section>
      `;
      H.$("#refreshMatchesBtn")?.addEventListener("click", async () => this.renderMatches());
      return;
    }

    const finishedCount = group.matches.filter((m) => m.status === "finished").length;
    const pager = this.phaseNavigatorHtml(groups, activeIndex, "matchPhaseIndex");

    root.innerHTML = `
      <section class="toolbar-card">
        <div>
          <h2>Matchs</h2>
          <p class="muted">Tu peux modifier ton score jusqu’au coup d’envoi. Navigue phase par phase avec les flèches.</p>
        </div>
        <button class="ghost-btn" id="refreshMatchesBtn">Rafraîchir</button>
      </section>

      ${pager}

      <div class="match-days single-phase-view">
        <section class="day-block pool-round-block">
          <div class="day-title-row">
            <div>
              <h3 class="day-title">${H.escapeHtml(group.key)}</h3>
              <p class="day-subtitle">${group.matches.length} match${group.matches.length > 1 ? "s" : ""} · ${H.matchDateRangeLabel(group.matches)}</p>
            </div>
            <span class="pill neutral">${finishedCount}/${group.matches.length} terminés</span>
          </div>
          <div class="match-list">
            ${group.matches.map((match) => this.matchCardHtml(match)).join("")}
          </div>
        </section>
      </div>

      ${pager}
    `;

    H.$("#refreshMatchesBtn")?.addEventListener("click", async () => {
      await this.renderMatches();
      H.toast("Matchs rafraîchis", "success");
    });

    this.bindPhaseNavigation("matchPhaseIndex", () => this.renderMatches());
    this.bindPredictionForms();
  },

  groupMatchesByPouleRound(matches) {
    const grouped = H.groupMatchesByPouleRound(matches);
    return Object.values(grouped)
      .map((group) => ({
        ...group,
        matches: group.matches.sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))
      }))
      .sort((a, b) => a.order - b.order || new Date(a.matches[0]?.kickoff_at || 0) - new Date(b.matches[0]?.kickoff_at || 0));
  },

  clampPhaseIndex(stateKey, groups) {
    const max = Math.max(groups.length - 1, 0);
    const current = Number(this.state[stateKey] || 0);
    const safe = Math.min(Math.max(current, 0), max);
    this.state[stateKey] = safe;
    return safe;
  },

  phaseNavigatorHtml(groups, activeIndex, stateKey) {
    if (!groups.length) return "";

    const current = groups[activeIndex];
    const prev = groups[activeIndex - 1];
    const next = groups[activeIndex + 1];

    return `
      <nav class="phase-pager" aria-label="Navigation des phases">
        <button class="phase-arrow" type="button" data-phase-state="${stateKey}" data-phase-target="${activeIndex - 1}" ${!prev ? "disabled" : ""}>
          <span aria-hidden="true">←</span>
          <small>${prev ? H.escapeHtml(prev.key) : "Début"}</small>
        </button>
        <div class="phase-current">
          <strong>${H.escapeHtml(current.key)}</strong>
          <small>${activeIndex + 1} / ${groups.length} · ${current.matches.length} match${current.matches.length > 1 ? "s" : ""}</small>
        </div>
        <button class="phase-arrow right" type="button" data-phase-state="${stateKey}" data-phase-target="${activeIndex + 1}" ${!next ? "disabled" : ""}>
          <small>${next ? H.escapeHtml(next.key) : "Fin"}</small>
          <span aria-hidden="true">→</span>
        </button>
      </nav>
    `;
  },

  bindPhaseNavigation(stateKey, renderCallback) {
    H.$$(`[data-phase-state="${stateKey}"]`).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const target = Number(btn.dataset.phaseTarget);
        if (Number.isNaN(target)) return;
        this.state[stateKey] = target;
        await renderCallback();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  },

  matchCardHtml(match) {
    const myPrediction = this.getMyPrediction(match.id);
    const locked = H.isKickoffPassed(match.kickoff_at);
    const isFinalPhase = match.stage !== "group";
    const visiblePreds = this.predictionsForMatch(match.id);
    const canSeeOthers = locked;

    return `
      <article class="match-card ${match.status === "live" ? "live" : ""}">
        <div class="match-head">
          <div>
            <span class="pill ${match.status}">${H.statusLabel(match.status)}</span>
            <span class="pill neutral">${H.stageLabel(match.stage)}</span>
            <span class="pill neutral">${H.shortPoolRoundLabel(match)}</span>
          </div>
          <span class="match-time">${H.formatDateTime(match.kickoff_at)}</span>
        </div>

        <div class="score-board">
          <div class="team-side">
            <span class="flag">${H.matchFlagHtml(match, "home")}</span>
            <strong>${H.escapeHtml(match.home_team_name)}</strong>
          </div>
          <div class="official-score">${match.status === "finished" || match.status === "live" ? H.scoreText(match.home_score, match.away_score) : "vs"}</div>
          <div class="team-side right">
            <span class="flag">${H.matchFlagHtml(match, "away")}</span>
            <strong>${H.escapeHtml(match.away_team_name)}</strong>
          </div>
        </div>

        <div class="match-meta">
          <span>${H.matchLocationHtml(match)}</span>
          <span class="match-tv-meta">${H.icon("tv")} ${H.tvChannelLogosHtml(match.tv_channel)}</span>
        </div>

        <form class="prediction-form" data-match-id="${match.id}" data-final-phase="${isFinalPhase}">
          <div class="prediction-inputs">
            <label>
              <small>${H.escapeHtml(match.home_team_short_name || match.home_team_name)}</small>
              <input type="number" min="0" step="1" name="home_score_pred" value="${myPrediction?.home_score_pred ?? ""}" ${locked ? "disabled" : ""} required>
            </label>
            <span class="dash">-</span>
            <label>
              <small>${H.escapeHtml(match.away_team_short_name || match.away_team_name)}</small>
              <input type="number" min="0" step="1" name="away_score_pred" value="${myPrediction?.away_score_pred ?? ""}" ${locked ? "disabled" : ""} required>
            </label>
          </div>

          ${isFinalPhase ? `
            <label class="qualified-select">
              <small>Qualifié</small>
              <select name="qualified_team_pred" ${locked ? "disabled" : ""} required>
                <option value="">Choisir</option>
                <option value="${match.home_team_id}" ${myPrediction?.qualified_team_pred === match.home_team_id ? "selected" : ""}>${H.escapeHtml(match.home_team_name)}</option>
                <option value="${match.away_team_id}" ${myPrediction?.qualified_team_pred === match.away_team_id ? "selected" : ""}>${H.escapeHtml(match.away_team_name)}</option>
              </select>
            </label>
          ` : ""}

          <div class="prediction-actions">
            ${locked
              ? `<span class="locked-label">${H.icon("lock")} Prono verrouillé</span>`
              : `<button class="primary-btn" type="submit">${myPrediction ? "Modifier" : "Valider"}</button>`
            }
            ${myPrediction ? `<span class="my-prediction-label">Ton prono : ${myPrediction.home_score_pred} - ${myPrediction.away_score_pred}</span>` : `<span class="muted">Aucun prono posé</span>`}
          </div>
        </form>

        <details class="others-predictions" ${canSeeOthers ? "" : "hidden"}>
          <summary>Voir les pronos du nid</summary>
          ${visiblePreds.length ? `
            <div class="pred-list">
              ${visiblePreds.map((p) => `
                <div class="pred-row">
                  <span>${H.escapeHtml(p.pseudo)} ${H.resultIcon(p)}</span>
                  <strong>${p.home_score_pred} - ${p.away_score_pred}</strong>
                  <small>${p.points_total ?? "—"} pt${(p.points_total || 0) > 1 ? "s" : ""}</small>
                </div>
              `).join("")}
            </div>
          ` : `<p class="muted">Aucun prono visible pour l’instant.</p>`}
        </details>
      </article>
    `;
  },

  bindPredictionForms() {
    H.$$(".prediction-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await this.savePrediction(form);
      });
    });
  },

  async savePrediction(form) {
    const matchId = form.dataset.matchId;
    const isFinalPhase = form.dataset.finalPhase === "true";
    const formData = new FormData(form);

    const payload = {
      user_id: this.state.session.user.id,
      match_id: matchId,
      home_score_pred: Number(formData.get("home_score_pred")),
      away_score_pred: Number(formData.get("away_score_pred")),
      qualified_team_pred: isFinalPhase ? formData.get("qualified_team_pred") : null
    };

    if (Number.isNaN(payload.home_score_pred) || Number.isNaN(payload.away_score_pred)) {
      H.toast("Entre deux scores valides.", "error");
      return;
    }

    const { error } = await window.sb
      .from("predictions")
      .upsert(payload, { onConflict: "user_id,match_id" });

    if (error) {
      H.toast(error.message || "Impossible d’enregistrer le prono.", "error");
      return;
    }

    await this.loadMyPredictions();
    H.toast("Prono enregistré", "success");
    await this.loadView(this.state.currentView);
  },

  async renderMyPredictions() {
    await Promise.all([this.loadMatches(), this.loadMyPredictions(), this.loadVisiblePredictions()]);

    const root = H.$("#viewRoot");
    const missing = this.missingPredictions();
    const done = this.state.matches.filter((m) => this.getMyPrediction(m.id));
    const groups = this.groupMatchesByPouleRound(this.state.matches);
    const activeIndex = this.clampPhaseIndex("myPredictionsPhaseIndex", groups);
    const group = groups[activeIndex];

    if (!groups.length || !group) {
      root.innerHTML = `<section class="card"><p class="muted">Aucun match à afficher pour le moment.</p></section>`;
      return;
    }

    const pager = this.phaseNavigatorHtml(groups, activeIndex, "myPredictionsPhaseIndex");
    const phaseMissing = group.matches.filter((m) => new Date(m.kickoff_at).getTime() > Date.now() && !this.getMyPrediction(m.id)).length;
    const phaseDone = group.matches.filter((m) => this.getMyPrediction(m.id)).length;

    root.innerHTML = `
      <section class="grid three stats-grid">
        <article class="stat-card"><strong>${done.length}</strong><span>Pronos posés</span></article>
        <article class="stat-card"><strong>${missing.length}</strong><span>Manquants</span></article>
        <article class="stat-card"><strong>${this.state.matches.filter((m) => H.isKickoffPassed(m.kickoff_at)).length}</strong><span>Verrouillés</span></article>
      </section>

      ${pager}

      <section class="card">
        <div class="card-title-row">
          <div>
            <h3>Mes pronos — ${H.escapeHtml(group.key)}</h3>
            <p class="muted">${phaseDone}/${group.matches.length} posé${phaseDone > 1 ? "s" : ""} · ${phaseMissing} manquant${phaseMissing > 1 ? "s" : ""} à venir</p>
          </div>
          <span class="pill neutral">${H.matchDateRangeLabel(group.matches)}</span>
        </div>
        <div class="simple-list phase-prediction-list">
          ${group.matches.map((m) => {
            const p = this.getMyPrediction(m.id);
            const points = this.state.visiblePredictions.find((vp) => vp.match_id === m.id && vp.user_id === this.state.session.user.id);
            return `
              <div class="simple-row phase-prediction-row">
                <div>
                  <strong>${H.matchFlagHtml(m, "home")} ${H.escapeHtml(m.home_team_name)} - ${H.matchFlagHtml(m, "away")} ${H.escapeHtml(m.away_team_name)}</strong>
                  <small>${H.formatDateTime(m.kickoff_at)} · ${H.stageLabel(m.stage)}${m.stage === "group" && m.pool_round ? ` · J. poule ${m.pool_round}` : ""}</small>
                </div>
                <div class="right-cell">
                  ${p ? `<strong>${p.home_score_pred} - ${p.away_score_pred}</strong>` : `<span class="missing">À faire</span>`}
                  ${points ? `<small>${points.points_total ?? 0} pts · ${H.escapeHtml(this.predictionReasonLabel(points))}</small>` : ""}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </section>

      ${pager}
    `;

    this.bindPhaseNavigation("myPredictionsPhaseIndex", () => this.renderMyPredictions());
  },

  async renderAchievements() {
    await Promise.all([this.loadMatches(), this.loadVisiblePredictions()]);

    const root = H.$("#viewRoot");
    root.innerHTML = `
      <section class="achievement-hero-card">
        <div>
          <p class="eyebrow">${H.icon("star")} Le mur des exploits</p>
          <h2>Les belles chouetteries… et les casseroles du nid.</h2>
          <p class="muted">Les exploits se débloquent automatiquement avec les matchs terminés. Plus tard, chaque badge pourra recevoir sa vraie image dans <code>assets/badges/</code>.</p>
        </div>
      </section>

      <div class="segmented achievement-tabs">
        <button class="${this.state.achievementsTab === "mine" ? "active" : ""}" data-achievements-tab="mine">Mes exploits</button>
        <button class="${this.state.achievementsTab === "hall" ? "active" : ""}" data-achievements-tab="hall">Hall du nid</button>
        <button class="${this.state.achievementsTab === "catalog" ? "active" : ""}" data-achievements-tab="catalog">Catalogue</button>
      </div>

      <section id="achievementsContent"></section>
    `;

    H.$$('[data-achievements-tab]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.achievementsTab = btn.dataset.achievementsTab;
        H.$$('[data-achievements-tab]').forEach((b) => b.classList.toggle("active", b === btn));
        await this.renderAchievementsContent();
      });
    });

    await this.renderAchievementsContent();
  },

  async renderAchievementsContent() {
    if (this.state.achievementsTab === "hall") return this.renderAchievementHall();
    if (this.state.achievementsTab === "catalog") return this.renderAchievementCatalog();
    return this.renderMyAchievements();
  },

  renderMyAchievements() {
    const root = H.$("#achievementsContent");
    const userId = this.state.session.user.id;
    const badges = this.computeBadgesForUser(userId);
    const positives = badges.filter((b) => b.type === "positive").length;
    const negatives = badges.filter((b) => b.type === "negative").length;
    const neutral = badges.filter((b) => b.type === "neutral").length;

    root.innerHTML = `
      <section class="grid three stats-grid achievement-stats">
        <article class="stat-card"><strong>${badges.length}</strong><span>exploits débloqués</span></article>
        <article class="stat-card"><strong>${positives}</strong><span>coups de maître</span></article>
        <article class="stat-card"><strong>${negatives}</strong><span>casseroles assumées</span></article>
      </section>
      <section class="card">
        <div class="card-title-row">
          <div>
            <h3>Mes exploits</h3>
            <p class="muted">Neutres : ${neutral}. Les badges négatifs sont là pour chambrer gentiment, pas pour humilier.</p>
          </div>
        </div>
        ${badges.length ? `<div class="achievement-grid large">${badges.map((badge) => this.badgeCardHtml(badge, true)).join("")}</div>` : `<p class="muted">Aucun exploit pour l’instant. Premier match terminé, premier badge débloqué.</p>`}
      </section>
    `;
  },

  async renderAchievementHall() {
    const root = H.$("#achievementsContent");
    const { data, error } = await window.sb
      .from("v_leaderboard_overall")
      .select("*")
      .order("rank");

    if (error) {
      root.innerHTML = `<p class="error-text">${H.escapeHtml(error.message)}</p>`;
      return;
    }

    const rows = (data || [])
      .map((row) => ({ row, badges: this.computeBadgesForUser(row.user_id) }))
      .sort((a, b) => b.badges.length - a.badges.length || Number(a.row.rank || 9999) - Number(b.row.rank || 9999));

    root.innerHTML = `
      <div class="badge-leaderboard-list">
        ${rows.length ? rows.map(({ row, badges }, index) => `
          <details class="badge-player-card ${row.user_id === this.state.session.user.id ? "me" : ""}" ${index < 3 ? "open" : ""}>
            <summary>
              <div>
                <strong>#${index + 1} exploits — ${H.escapeHtml(row.pseudo)}</strong>
                <small>${H.escapeHtml(row.office_team_name || "Sans team")} · ${badges.length} exploit${badges.length > 1 ? "s" : ""} · classement général #${row.rank}</small>
              </div>
              <div class="points">${row.total_points || 0}<small>pts</small></div>
            </summary>
            ${this.badgesPanelHtml(row.user_id)}
          </details>
        `).join("") : `<section class="card"><p class="muted">Aucun exploit pour le moment.</p></section>`}
      </div>
    `;
  },

  renderAchievementCatalog() {
    const root = H.$("#achievementsContent");
    const unlocked = new Set(this.computeBadgesForUser(this.state.session.user.id).map((badge) => badge.id));
    const catalog = this.badgeCatalog();
    const positives = catalog.filter((b) => b.type === "positive");
    const negatives = catalog.filter((b) => b.type === "negative");
    const neutral = catalog.filter((b) => b.type === "neutral");

    const block = (title, rows) => `
      <section class="card achievement-catalog-block">
        <div class="card-title-row">
          <h3>${H.escapeHtml(title)}</h3>
          <span class="pill neutral">${rows.filter((badge) => unlocked.has(badge.id)).length}/${rows.length}</span>
        </div>
        <div class="achievement-grid large">
          ${rows.map((badge) => this.badgeCardHtml(badge, unlocked.has(badge.id))).join("")}
        </div>
      </section>
    `;

    root.innerHTML = `
      <section class="toolbar-card compact-toolbar">
        <div>
          <h3>Catalogue des exploits</h3>
          <p class="muted">Les images pourront être ajoutées plus tard en PNG : <code>assets/badges/nom-du-badge.png</code>.</p>
        </div>
      </section>
      ${block("Badges de progression", neutral)}
      ${block("Coups de maître", positives)}
      ${block("Casseroles du nid", negatives)}
    `;
  },

  async renderWorldCup() {
    await this.loadMatches();
    const root = H.$("#viewRoot");
    root.innerHTML = `
      <section class="toolbar-card worldcup-hero">
        <div>
          <p class="eyebrow">${H.icon("worldcup")} Coupe du monde 2026</p>
          <h2>Groupes et phase finale</h2>
          <p class="muted">Retrouve le tableau des vrais groupes, puis le chemin vers la finale.</p>
        </div>
      </section>

      <div class="segmented worldcup-tabs">
        <button class="${this.state.worldcupTab === "groups" ? "active" : ""}" data-worldcup-tab="groups">Groupes</button>
        <button class="${this.state.worldcupTab === "finals" ? "active" : ""}" data-worldcup-tab="finals">Phase finale</button>
      </div>

      <section id="worldcupContent"></section>
    `;

    H.$$('[data-worldcup-tab]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.worldcupTab = btn.dataset.worldcupTab;
        H.$$('[data-worldcup-tab]').forEach((b) => b.classList.toggle("active", b === btn));
        await this.renderWorldCupContent();
      });
    });

    await this.renderWorldCupContent();
  },

  async renderWorldCupContent() {
    if (this.state.worldcupTab === "finals") return this.renderWorldCupFinals();
    return this.renderWorldCupGroups();
  },

  async renderWorldCupGroups() {
    const root = H.$("#worldcupContent");
    const { data, error } = await window.sb
      .from("v_group_standings")
      .select("*")
      .order("group_name")
      .order("group_rank");

    if (error) {
      root.innerHTML = `
        <section class="card">
          <h3>Tableau des groupes</h3>
          <p class="muted">La vue des groupes n’est pas encore disponible. Lance le patch <strong>patch_v1_5_groupes_flags.sql</strong> si besoin.</p>
          <p class="error-text">${H.escapeHtml(error.message)}</p>
        </section>
      `;
      return;
    }

    const grouped = (data || []).reduce((acc, row) => {
      acc[row.group_name] ||= [];
      acc[row.group_name].push(row);
      return acc;
    }, {});

    root.innerHTML = Object.keys(grouped).length ? `
      <section class="toolbar-card compact-toolbar">
        <div>
          <h3>Tableau des groupes</h3>
          <p class="muted">Les deux premiers de chaque groupe sont en zone directe. Les meilleurs troisièmes restent dans la course.</p>
        </div>
      </section>
      <div class="groups-grid worldcup-groups-grid">
        ${Object.entries(grouped).map(([groupName, rows]) => this.groupTableHtml(groupName, rows)).join("")}
      </div>
    ` : `<section class="card"><p class="muted">Aucun groupe à afficher pour le moment.</p></section>`;
  },

  renderWorldCupFinals() {
    const root = H.$("#worldcupContent");
    const finals = this.state.matches.filter((m) => m.stage !== "group");
    const stageOrder = {
      round_of_32: 1,
      round_of_16: 2,
      quarter_final: 3,
      semi_final: 4,
      third_place: 5,
      final: 6
    };

    const grouped = finals.reduce((acc, match) => {
      const key = H.stageLabel(match.stage);
      acc[key] ||= { key, order: stageOrder[match.stage] || 99, matches: [] };
      acc[key].matches.push(match);
      return acc;
    }, {});

    const sections = Object.values(grouped)
      .sort((a, b) => a.order - b.order)
      .map((stage) => ({ ...stage, matches: stage.matches.sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at)) }));

    root.innerHTML = `
      <section class="toolbar-card compact-toolbar">
        <div>
          <h3>Tableau phase finale</h3>
          <p class="muted">Les équipes seront connues après les groupes. Les matchs restent prêts pour les pronos et les scores admin.</p>
        </div>
      </section>
      ${sections.length ? `
        <div class="worldcup-bracket">
          ${sections.map((stage) => `
            <section class="bracket-stage card">
              <div class="card-title-row">
                <h3>${H.escapeHtml(stage.key)}</h3>
                <span class="pill neutral">${stage.matches.length} match${stage.matches.length > 1 ? "s" : ""}</span>
              </div>
              <div class="bracket-match-list">
                ${stage.matches.map((match) => `
                  <article class="bracket-match ${match.status}">
                    <div class="bracket-match-teams">
                      <strong>${H.matchFlagHtml(match, "home")} ${H.escapeHtml(match.home_team_name)}</strong>
                      <span>${match.status === "finished" || match.status === "live" ? H.scoreText(match.home_score, match.away_score) : "vs"}</span>
                      <strong>${H.matchFlagHtml(match, "away")} ${H.escapeHtml(match.away_team_name)}</strong>
                    </div>
                    <div class="bracket-match-meta muted">
                      <span>${H.formatDateTime(match.kickoff_at)}</span>
                      <span>${H.matchLocationHtml(match, true)}</span>
                    </div>
                  </article>
                `).join("")}
              </div>
            </section>
          `).join("")}
        </div>
      ` : `<section class="card"><p class="muted">Aucune phase finale à afficher pour le moment.</p></section>`}
    `;
  },

  async renderLeaderboard() {
    await Promise.all([this.loadMatches(), this.loadVisiblePredictions()]);

    const root = H.$("#viewRoot");
    root.innerHTML = `
      <section class="toolbar-card">
        <div>
          <h2>Classements</h2>
          <p class="muted">Les joueurs inactifs sont exclus automatiquement.</p>
        </div>
      </section>

      <div class="segmented">
        <button class="active" data-leaderboard-tab="overall">Général</button>
        <button data-leaderboard-tab="poolround">Par phase</button>
        <button data-leaderboard-tab="team">Teams bureau</button>
        <button data-leaderboard-tab="badges">Exploits</button>
      </div>

      <section id="leaderboardContent"></section>
    `;

    H.$$("[data-leaderboard-tab]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.leaderboardTab = btn.dataset.leaderboardTab;
        H.$$("[data-leaderboard-tab]").forEach((b) => b.classList.toggle("active", b === btn));
        await this.renderLeaderboardContent();
      });
    });

    await this.renderLeaderboardContent();
  },

  async renderLeaderboardContent() {
    if (this.state.leaderboardTab === "overall") return this.renderOverallLeaderboard();
    if (this.state.leaderboardTab === "poolround") return this.renderPoolRoundLeaderboard();
    if (this.state.leaderboardTab === "team") return this.renderTeamLeaderboard();
    if (this.state.leaderboardTab === "badges") return this.renderBadgesLeaderboard();
  },

  scoreDetailRowsForUser(userId, filters = {}) {
    return this.state.visiblePredictions
      .filter((p) => p.user_id === userId && p.points_total !== null && p.points_total !== undefined)
      .map((p) => {
        const match = this.state.matches.find((m) => m.id === p.match_id);
        return { prediction: p, match };
      })
      .filter(({ match }) => match
        && match.status === "finished"
        && (!filters.matchDay || match.match_day === filters.matchDay)
        && (!filters.poolRound || Number(match.pool_round || 0) === Number(filters.poolRound))
        && (!filters.matchIds || filters.matchIds.includes(match.id))
      )
      .sort((a, b) => new Date(a.match.kickoff_at) - new Date(b.match.kickoff_at));
  },

  pointsBreakdownHtml(row) {
    return `
      <div class="score-breakdown">
        <span title="Scores exacts">${H.icon("target")} ${row.exact_scores || 0}</span>
        <span title="Bons résultats">${H.icon("check")} ${row.good_results || 0}</span>
        <span title="Bons écarts">${H.icon("trend")} ${row.good_goal_diffs || 0}</span>
        ${row.good_qualified !== undefined ? `<span title="Bons qualifiés">${H.icon("star")} ${row.good_qualified || 0}</span>` : ""}
        ${row.winner_points ? `<span title="Bonus champion du monde">${H.icon("trophy")} +${row.winner_points}</span>` : ""}
        <span title="Matchs comptabilisés">${H.icon("list")} ${row.scored_matches || 0}</span>
      </div>
    `;
  },

  predictionReasonLabel(prediction) {
    if (!prediction || prediction.points_total === null || prediction.points_total === undefined) return "En attente";
    const bits = [];
    if (prediction.is_exact_score) bits.push("score exact");
    if (!prediction.is_exact_score && prediction.is_good_result) bits.push("bon résultat");
    if (prediction.is_good_goal_diff) bits.push("bon écart");
    if (prediction.is_good_qualified) bits.push("bon qualifié");
    return bits.length ? bits.join(" + ") : "mauvais résultat";
  },


  maxBooleanStreak(items, predicate) {
    let current = 0;
    let best = 0;
    items.forEach((item) => {
      if (predicate(item)) {
        current += 1;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    });
    return best;
  },

  outcomeFromScores(home, away) {
    if (home > away) return "home";
    if (home < away) return "away";
    return "draw";
  },

  badgeCatalog() {
    return [
      { id: "first-flight", title: "Premier envol", description: "Premier match comptabilisé. Le hibou a quitté le nid.", type: "neutral" },
      { id: "first-perfect", title: "Œil de chouette", description: "Premier score exact trouvé.", type: "positive" },
      { id: "surgical-beak", title: "Bec chirurgical", description: "3 scores exacts au total.", type: "positive" },
      { id: "streak-3-exact", title: "Triplé du Grand-Duc", description: "3 scores exacts d’affilée. Là, ça commence à sentir la sorcellerie.", type: "positive" },
      { id: "streak-5-exact", title: "Oracle du perchoir", description: "5 scores exacts d’affilée. Contrôle antidopage du marc de café.", type: "positive" },
      { id: "owl-sniper", title: "Sniper à plumes", description: "10 scores exacts. Le nid a demandé une vérification VAR.", type: "positive" },
      { id: "accountant", title: "Hibou comptable", description: "10 bons résultats. Pas flamboyant, mais rentable.", type: "positive" },
      { id: "safe-flight", title: "Vol sans turbulence", description: "5 bons résultats d’affilée.", type: "positive" },
      { id: "autopilot", title: "Pilote automatique", description: "10 bons résultats d’affilée. Même les courants d’air obéissent.", type: "positive" },
      { id: "geometry", title: "Géomètre du nid", description: "5 bons écarts trouvés.", type: "positive" },
      { id: "architect", title: "Architecte des cages", description: "10 bons écarts trouvés. Le compas est rangé dans les serres.", type: "positive" },
      { id: "qualified-oracle", title: "Oracle des qualifiés", description: "2 qualifiés correctement annoncés.", type: "positive" },
      { id: "knife-edge", title: "Match couperet maîtrisé", description: "Premier bon qualifié en phase finale.", type: "positive" },
      { id: "scenario", title: "Scénario parfait", description: "Score exact + bon qualifié sur un match couperet.", type: "positive" },
      { id: "round16-lord", title: "Seigneur des 16èmes", description: "Une réussite solide sur les 16èmes de finale.", type: "positive" },
      { id: "high-branch", title: "Sur la branche haute", description: "Un total de points qui te pose dans les hauteurs du nid.", type: "positive" },
      { id: "no-net", title: "Sans filet", description: "Un bon qualifié trouvé sur un match couperet sans score exact. Risqué, mais validé.", type: "positive" },
      { id: "comeback", title: "Réveil du perchoir", description: "Après une mauvaise série, le hibou s’est réveillé avec un score exact.", type: "positive" },
      { id: "gold-nest", title: "Nid doré", description: "50 points ou plus. Le nid commence à briller.", type: "positive" },
      { id: "platinum-nest", title: "Nid platine", description: "100 points ou plus. À ce stade, la branche plie.", type: "positive" },
      { id: "machine", title: "Machine à points", description: "Au moins 10 matchs avec 4 pts de moyenne ou plus.", type: "positive" },
      { id: "crystal-wing", title: "Aile de cristal", description: "Au moins 10 matchs avec 5 pts de moyenne ou plus. Beaucoup trop propre.", type: "positive" },
      { id: "full-perch", title: "Perchoir complet", description: "Tous les matchs terminés d’une journée de poule ont été pronostiqués.", type: "positive" },
      { id: "no-crumbs", title: "Sans miettes", description: "Tous les matchs d’une journée de poule ont rapporté au moins 1 point.", type: "positive" },
      { id: "pool-crystal", title: "Poule de cristal", description: "Tous les matchs pronostiqués d’une journée de poule sont des scores exacts.", type: "positive" },
      { id: "draw-master", title: "Maître du nul", description: "3 matchs nuls correctement sentis. Le 0-0 avait un parfum.", type: "positive" },
      { id: "small-score", title: "Petit score, grand flair", description: "3 scores exacts sur des matchs à un but d’écart.", type: "positive" },
      { id: "fireworks", title: "Feu d’artifice", description: "Un score exact sur un match à 5 buts ou plus.", type: "positive" },
      { id: "feather-harvest", title: "Moisson de plumes", description: "30 points ou plus sur une seule journée de poule.", type: "positive" },

      { id: "zero-tunnel", title: "Tunnel du néant", description: "5 matchs à zéro point. Même la chouette a éteint la lumière.", type: "negative" },
      { id: "myopic", title: "Chouette myope", description: "3 matchs d’affilée à zéro. Jumelles obligatoires.", type: "negative" },
      { id: "blackout", title: "Extinction des projecteurs", description: "5 matchs d’affilée à zéro. On cherche encore l’interrupteur.", type: "negative" },
      { id: "pool-disaster", title: "Journée brouillard", description: "Tous les matchs d’une journée de poule jouée à zéro point.", type: "negative" },
      { id: "broken-compass", title: "Boussole cassée", description: "3 vainqueurs pris à l’envers. Nord, sud… compliqué.", type: "negative" },
      { id: "cracked-wall", title: "Mur fissuré", description: "3 matchs nuls pronostiqués qui n’ont pas tenu debout.", type: "negative" },
      { id: "empty-nest", title: "Nid vide", description: "Plusieurs matchs joués, toujours zéro point. Respect pour la constance.", type: "negative" },
      { id: "anti-sniper", title: "Bec en mousse", description: "10 matchs comptabilisés sans aucun score exact.", type: "negative" },
      { id: "cold-perch", title: "Perchoir frigorifié", description: "10 matchs ou plus avec moins d’1 point de moyenne.", type: "negative" },
      { id: "draw-trap", title: "Piège à nuls", description: "5 matchs nuls pronostiqués qui n’ont pas fini nuls.", type: "negative" },
      { id: "wrong-exit", title: "Sortie de secours", description: "2 qualifiés de phase finale annoncés à l’envers.", type: "negative" },
      { id: "big-owch", title: "Aïe le hibou", description: "Un prono avec au moins 3 buts d’écart… dans le mauvais sens.", type: "negative" },
      { id: "wet-feathers", title: "Plumes mouillées", description: "Une série humide : plusieurs zéro point, quelques regrets et un ballon trempé.", type: "negative" }
    ];
  },

  badgeById(id) {
    return this.badgeCatalog().find((badge) => badge.id === id);
  },

  computeBadgesForUser(userId) {
    const rows = this.scoreDetailRowsForUser(userId);
    if (!rows.length) return [];

    const exact = rows.filter(({ prediction }) => prediction.is_exact_score).length;
    const goodResults = rows.filter(({ prediction }) => prediction.is_good_result).length;
    const goodDiffs = rows.filter(({ prediction }) => prediction.is_good_goal_diff).length;
    const goodQualified = rows.filter(({ prediction }) => prediction.is_good_qualified).length;
    const zeros = rows.filter(({ prediction }) => Number(prediction.points_total || 0) === 0).length;
    const totalPoints = rows.reduce((sum, { prediction }) => sum + Number(prediction.points_total || 0), 0);
    const avg = totalPoints / rows.length;

    const exactStreak = this.maxBooleanStreak(rows, ({ prediction }) => prediction.is_exact_score);
    const zeroStreak = this.maxBooleanStreak(rows, ({ prediction }) => Number(prediction.points_total || 0) === 0);
    const resultStreak = this.maxBooleanStreak(rows, ({ prediction }) => prediction.is_good_result);

    const reversePicks = rows.filter(({ prediction, match }) => {
      const pred = this.outcomeFromScores(prediction.home_score_pred, prediction.away_score_pred);
      const real = this.outcomeFromScores(match.home_score, match.away_score);
      return (pred === "home" && real === "away") || (pred === "away" && real === "home");
    }).length;

    const bustedDraws = rows.filter(({ prediction, match }) => {
      const pred = this.outcomeFromScores(prediction.home_score_pred, prediction.away_score_pred);
      const real = this.outcomeFromScores(match.home_score, match.away_score);
      return pred === "draw" && real !== "draw";
    }).length;

    const correctDraws = rows.filter(({ prediction, match }) => {
      const pred = this.outcomeFromScores(prediction.home_score_pred, prediction.away_score_pred);
      const real = this.outcomeFromScores(match.home_score, match.away_score);
      return pred === "draw" && real === "draw";
    }).length;

    const perfectKnockouts = rows.filter(({ prediction, match }) =>
      match.stage !== "group" && prediction.is_exact_score && prediction.is_good_qualified
    ).length;

    const wrongQualified = rows.filter(({ prediction, match }) =>
      match.stage !== "group"
      && prediction.qualified_team_pred
      && match.winner_team_id
      && prediction.qualified_team_pred !== match.winner_team_id
    ).length;

    const smallExactScores = rows.filter(({ prediction, match }) =>
      prediction.is_exact_score && Math.abs(Number(match.home_score) - Number(match.away_score)) === 1
    ).length;

    const highExactScores = rows.filter(({ prediction, match }) =>
      prediction.is_exact_score && Number(match.home_score || 0) + Number(match.away_score || 0) >= 5
    ).length;

    const bigWrongWay = rows.filter(({ prediction, match }) => {
      const pred = this.outcomeFromScores(prediction.home_score_pred, prediction.away_score_pred);
      const real = this.outcomeFromScores(match.home_score, match.away_score);
      const predDiff = Number(prediction.home_score_pred) - Number(prediction.away_score_pred);
      const realDiff = Number(match.home_score) - Number(match.away_score);
      return pred !== real && Math.abs(predDiff) >= 3 && Math.sign(predDiff) !== Math.sign(realDiff);
    }).length;

    const round16Good = rows.filter(({ prediction, match }) =>
      match.stage === "round_of_16" && Number(prediction.points_total || 0) >= 3
    ).length;

    const knockoutQualifiedNoExact = rows.filter(({ prediction, match }) =>
      match.stage !== "group" && prediction.is_good_qualified && !prediction.is_exact_score
    ).length;

    const hasComeback = (() => {
      let zeroRun = 0;
      for (const row of rows) {
        if (Number(row.prediction.points_total || 0) === 0) {
          zeroRun += 1;
        } else {
          if (zeroRun >= 2 && row.prediction.is_exact_score) return true;
          zeroRun = 0;
        }
      }
      return false;
    })();

    const roundGroups = rows.reduce((acc, row) => {
      const round = Number(row.match.pool_round || 0);
      if (!round || row.match.stage !== "group") return acc;
      acc[round] ||= [];
      acc[round].push(row);
      return acc;
    }, {});

    let fullPoolRounds = 0;
    let noCrumbRounds = 0;
    let crystalRounds = 0;
    let emptyPoolRounds = 0;
    let bestPoolRoundPoints = 0;

    Object.entries(roundGroups).forEach(([round, roundRows]) => {
      const finishedInRound = this.state.matches.filter((match) =>
        match.stage === "group"
        && match.status === "finished"
        && Number(match.pool_round || 0) === Number(round)
      ).length;
      const roundPoints = roundRows.reduce((sum, { prediction }) => sum + Number(prediction.points_total || 0), 0);
      bestPoolRoundPoints = Math.max(bestPoolRoundPoints, roundPoints);

      if (finishedInRound >= 3 && roundRows.length === finishedInRound) {
        fullPoolRounds += 1;
        if (roundRows.every(({ prediction }) => Number(prediction.points_total || 0) > 0)) noCrumbRounds += 1;
        if (roundRows.every(({ prediction }) => prediction.is_exact_score)) crystalRounds += 1;
        if (roundRows.every(({ prediction }) => Number(prediction.points_total || 0) === 0)) emptyPoolRounds += 1;
      }
    });

    const badges = [];
    const unlock = (id) => {
      const badge = this.badgeById(id);
      if (badge && !badges.some((b) => b.id === id)) badges.push({ ...badge });
    };

    if (rows.length >= 1) unlock("first-flight");
    if (exact >= 1) unlock("first-perfect");
    if (exact >= 3) unlock("surgical-beak");
    if (exactStreak >= 3) unlock("streak-3-exact");
    if (exactStreak >= 5) unlock("streak-5-exact");
    if (exact >= 10) unlock("owl-sniper");
    if (goodResults >= 10) unlock("accountant");
    if (resultStreak >= 5) unlock("safe-flight");
    if (resultStreak >= 10) unlock("autopilot");
    if (goodDiffs >= 5) unlock("geometry");
    if (goodDiffs >= 10) unlock("architect");
    if (goodQualified >= 1) unlock("knife-edge");
    if (goodQualified >= 2) unlock("qualified-oracle");
    if (perfectKnockouts >= 1) unlock("scenario");
    if (round16Good >= 1) unlock("round16-lord");
    if (totalPoints >= 40) unlock("high-branch");
    if (knockoutQualifiedNoExact >= 1) unlock("no-net");
    if (hasComeback) unlock("comeback");
    if (totalPoints >= 50) unlock("gold-nest");
    if (totalPoints >= 100) unlock("platinum-nest");
    if (rows.length >= 10 && avg >= 4) unlock("machine");
    if (rows.length >= 10 && avg >= 5) unlock("crystal-wing");
    if (fullPoolRounds >= 1) unlock("full-perch");
    if (noCrumbRounds >= 1) unlock("no-crumbs");
    if (crystalRounds >= 1) unlock("pool-crystal");
    if (correctDraws >= 3) unlock("draw-master");
    if (smallExactScores >= 3) unlock("small-score");
    if (highExactScores >= 1) unlock("fireworks");
    if (bestPoolRoundPoints >= 30) unlock("feather-harvest");

    if (zeros >= 5) unlock("zero-tunnel");
    if (zeroStreak >= 3) unlock("myopic");
    if (zeroStreak >= 5) unlock("blackout");
    if (emptyPoolRounds >= 1) unlock("pool-disaster");
    if (reversePicks >= 3) unlock("broken-compass");
    if (bustedDraws >= 3) unlock("cracked-wall");
    if (rows.length >= 3 && totalPoints === 0) unlock("empty-nest");
    if (rows.length >= 10 && exact === 0) unlock("anti-sniper");
    if (rows.length >= 10 && avg < 1) unlock("cold-perch");
    if (bustedDraws >= 5) unlock("draw-trap");
    if (wrongQualified >= 2) unlock("wrong-exit");
    if (bigWrongWay >= 1) unlock("big-owch");
    if (rows.length >= 5 && zeros >= 3) unlock("wet-feathers");

    return badges;
  },

  badgeIconName(badge) {
    if (badge.type === "negative") return "lock";
    if (badge.type === "neutral") return "nest";
    return "star";
  },

  badgeArtHtml(badge, unlocked = true) {
    const id = H.escapeHtml(badge.id);
    const title = H.escapeHtml(badge.title);
    return `
      <span class="achievement-art ${unlocked ? "unlocked" : "locked"}">
        <img src="assets/badges/${id}.png" alt="Badge ${title}" loading="lazy" onerror="this.remove()">
        <span class="achievement-fallback">${H.icon(this.badgeIconName(badge))}</span>
      </span>
    `;
  },

  badgeChipHtml(badge) {
    return `
      <span class="achievement-chip ${H.escapeHtml(badge.type)}" title="${H.escapeHtml(badge.description)}">
        ${this.badgeArtHtml(badge)}
        <span>${H.escapeHtml(badge.title)}</span>
      </span>
    `;
  },

  badgesPreviewHtml(userId, limit = 3) {
    const badges = this.computeBadgesForUser(userId);
    if (!badges.length) return "";
    return `<div class="achievement-preview">${badges.slice(0, limit).map((badge) => this.badgeChipHtml(badge)).join("")}</div>`;
  },

  badgeCardHtml(badge, unlocked = true) {
    return `
      <article class="achievement-card ${H.escapeHtml(badge.type)} ${unlocked ? "" : "locked"}">
        ${this.badgeArtHtml(badge, unlocked)}
        <div>
          <strong>${H.escapeHtml(badge.title)}</strong>
          <p>${H.escapeHtml(badge.description)}</p>
          ${unlocked ? `<small class="achievement-state">Débloqué</small>` : `<small class="achievement-state locked">À débloquer</small>`}
        </div>
      </article>
    `;
  },

  badgesPanelHtml(userId) {
    const badges = this.computeBadgesForUser(userId);
    if (!badges.length) return `<p class="muted detail-empty">Aucun exploit pour le moment. Le nid observe en silence.</p>`;
    return `<div class="achievement-grid">${badges.map((badge) => this.badgeCardHtml(badge, true)).join("")}</div>`;
  },

  playerScoreDetailsHtml(userId, filters = {}) {
    const rows = this.scoreDetailRowsForUser(userId, filters);
    if (!rows.length) {
      return `<p class="muted detail-empty">Aucun match terminé comptabilisé pour ce joueur.</p>`;
    }

    return `
      <div class="score-detail-list">
        ${rows.map(({ prediction: p, match }) => `
          <div class="score-detail-row">
            <div class="score-detail-match">
              <strong>${H.matchFlagHtml(match, "home")} ${H.escapeHtml(match.home_team_short_name || match.home_team_name)} - ${H.matchFlagHtml(match, "away")} ${H.escapeHtml(match.away_team_short_name || match.away_team_name)}</strong>
              <small>${H.shortPoolRoundLabel(match)} · Réel : ${H.scoreText(match.home_score, match.away_score)} · Prono : ${p.home_score_pred} - ${p.away_score_pred}${p.qualified_team_name ? ` · Qualifié : ${H.escapeHtml(p.qualified_team_name)}` : ""}</small>
            </div>
            <div class="score-detail-points">
              <strong>${p.points_total ?? 0}</strong>
              <small>${H.escapeHtml(this.predictionReasonLabel(p))}</small>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  },

  async renderOverallLeaderboard() {
    const { data, error } = await window.sb
      .from("v_leaderboard_overall")
      .select("*")
      .order("rank");

    const root = H.$("#leaderboardContent");
    if (error) {
      root.innerHTML = `<p class="error-text">${H.escapeHtml(error.message)}</p>`;
      return;
    }

    root.innerHTML = `
      <section class="card">
        <h3>Classement général</h3>
        ${this.leaderboardRowsHtml(data || [])}
      </section>
    `;
  },

  leaderboardRowsHtml(rows, options = {}) {
    if (!rows.length) return `<p class="muted">Pas encore de points.</p>`;
    const filters = options.filters || {};

    return `
      <div class="leaderboard-list">
        ${rows.map((r) => {
          const playerProfile = {
            pseudo: r.pseudo,
            avatar_key: r.avatar_key || "owl-01",
            badge_shape: r.badge_shape || "rounded",
            badge_color: r.badge_color || "#facc15"
          };
          return `
          <details class="leader-details ${r.user_id === this.state.session.user.id ? "me" : ""}">
            <summary class="leader-row">
              <div class="rank">#${r.rank}</div>
              <div class="leader-avatar" aria-hidden="true">
                ${H.profileBadgeHtml(playerProfile, "profile-badge leader")}
              </div>
              <div class="leader-main">
                <strong>${H.escapeHtml(r.pseudo)}</strong>
                <small>${H.escapeHtml(r.office_team_name || "Sans team")}</small>
                ${this.pointsBreakdownHtml(r)}
                ${this.badgesPreviewHtml(r.user_id)}
              </div>
              <div class="points">${r.total_points || 0}<small>pts</small></div>
            </summary>
            <div class="leader-expanded">
              <h4>Détail des points</h4>
              ${this.playerScoreDetailsHtml(r.user_id, filters)}
              ${r.winner_points ? `<div class="winner-bonus-line">${H.icon("trophy")} Bonus champion du monde : <strong>+${r.winner_points} pts</strong></div>` : ""}
              <h4>Badges d’exploit</h4>
              ${this.badgesPanelHtml(r.user_id)}
            </div>
          </details>`;
        }).join("")}
      </div>
    `;
  },

  async renderPoolRoundLeaderboard() {
    const root = H.$("#leaderboardContent");
    const groups = this.groupMatchesByPouleRound(this.state.matches);
    const activeIndex = this.clampPhaseIndex("leaderboardPhaseIndex", groups);
    const group = groups[activeIndex];

    if (!groups.length || !group) {
      root.innerHTML = `<section class="card"><p class="muted">Aucune phase à afficher pour le moment.</p></section>`;
      return;
    }

    const { data, error } = await window.sb
      .from("v_leaderboard_overall")
      .select("user_id,pseudo,office_team_name,avatar_key,badge_shape,badge_color")
      .order("pseudo");

    if (error) {
      root.innerHTML = `<section class="card"><p class="error-text">${H.escapeHtml(error.message)}</p></section>`;
      return;
    }

    const matchIds = group.matches.map((m) => m.id);
    const finishedCount = group.matches.filter((m) => m.status === "finished").length;
    const rows = (data || []).map((player) => {
      const details = this.scoreDetailRowsForUser(player.user_id, { matchIds });
      const total = details.reduce((sum, { prediction }) => sum + Number(prediction.points_total || 0), 0);
      const exact = details.filter(({ prediction }) => prediction.is_exact_score).length;
      const goodResults = details.filter(({ prediction }) => prediction.is_good_result).length;
      const goodDiffs = details.filter(({ prediction }) => prediction.is_good_goal_diff).length;
      const goodQualified = details.filter(({ prediction }) => prediction.is_good_qualified).length;
      return {
        ...player,
        total_points: total,
        exact_scores: exact,
        good_results: goodResults,
        good_goal_diffs: goodDiffs,
        good_qualified: goodQualified,
        scored_matches: details.length
      };
    })
      .sort((a, b) =>
        (b.total_points || 0) - (a.total_points || 0)
        || (b.exact_scores || 0) - (a.exact_scores || 0)
        || (b.good_results || 0) - (a.good_results || 0)
        || (b.good_goal_diffs || 0) - (a.good_goal_diffs || 0)
        || String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr")
      )
      .map((row, index) => ({ ...row, rank: index + 1 }));

    const pager = this.phaseNavigatorHtml(groups, activeIndex, "leaderboardPhaseIndex");

    root.innerHTML = `
      ${pager}
      <section class="card pool-leaderboard-card">
        <div class="card-title-row">
          <div>
            <h3>Classement — ${H.escapeHtml(group.key)}</h3>
            <p class="muted">${finishedCount}/${group.matches.length} match${group.matches.length > 1 ? "s" : ""} terminé${finishedCount > 1 ? "s" : ""} · ${H.matchDateRangeLabel(group.matches)}</p>
          </div>
        </div>
        ${this.leaderboardRowsHtml(rows, { filters: { matchIds } })}
      </section>
      ${pager}
    `;

    this.bindPhaseNavigation("leaderboardPhaseIndex", () => this.renderPoolRoundLeaderboard());
  },


  async renderBadgesLeaderboard() {
    const { data, error } = await window.sb
      .from("v_leaderboard_overall")
      .select("*")
      .order("rank");

    const root = H.$("#leaderboardContent");
    if (error) {
      root.innerHTML = `<p class="error-text">${H.escapeHtml(error.message)}</p>`;
      return;
    }

    const rows = (data || []).map((row) => ({
      row,
      badges: this.computeBadgesForUser(row.user_id)
    }));

    root.innerHTML = `
      <section class="toolbar-card compact-toolbar">
        <div>
          <h3>Badges d’exploit</h3>
          <p class="muted">Des petites récompenses positives… et quelques casseroles assumées.</p>
        </div>
      </section>
      <div class="badge-leaderboard-list">
        ${rows.length ? rows.map(({ row, badges }) => `
          <details class="badge-player-card ${row.user_id === this.state.session.user.id ? "me" : ""}">
            <summary>
              <div class="badge-player-summary-main">
                ${H.profileBadgeHtml(row, "profile-badge leaderboard-badge")}
                <div>
                  <strong>#${row.rank} — ${H.escapeHtml(row.pseudo)}</strong>
                  <small>${H.escapeHtml(row.office_team_name || "Sans team")} · ${badges.length} badge${badges.length > 1 ? "s" : ""}</small>
                </div>
              </div>
              <div class="points">${row.total_points || 0}<small>pts</small></div>
            </summary>
            ${this.badgesPanelHtml(row.user_id)}
          </details>
        `).join("") : `<section class="card"><p class="muted">Aucun badge pour le moment.</p></section>`}
      </div>
    `;
  },

  async renderTeamLeaderboard() {
    const root = H.$("#leaderboardContent");
    root.innerHTML = `
      <div class="segmented small">
        <button class="${this.state.teamTab === "average" ? "active" : ""}" data-team-tab="average">Moyenne</button>
        <button class="${this.state.teamTab === "total" ? "active" : ""}" data-team-tab="total">Total</button>
      </div>
      <section class="card" id="teamLeaderboardRows"></section>
    `;

    H.$$("[data-team-tab]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.teamTab = btn.dataset.teamTab;
        await this.renderTeamLeaderboard();
      });
    });

    const view = this.state.teamTab === "average" ? "v_team_leaderboard_average" : "v_team_leaderboard_total";
    const { data, error } = await window.sb.from(view).select("*").order("rank");
    const list = H.$("#teamLeaderboardRows");

    if (error) {
      list.innerHTML = `<p class="error-text">${H.escapeHtml(error.message)}</p>`;
      return;
    }

    list.innerHTML = `
      <h3>Classement teams — ${this.state.teamTab === "average" ? "moyenne" : "total"}</h3>
      ${(data || []).length ? `
        <div class="leaderboard-list">
          ${(data || []).map((r) => `
            <div class="leader-row team-row">
              <div class="rank">#${r.rank}</div>
              <div class="leader-main">
                <strong>${H.escapeHtml(r.office_team_name)}</strong>
                <small>${r.active_players} joueur${r.active_players > 1 ? "s" : ""} actif${r.active_players > 1 ? "s" : ""} · total ${r.total_points || 0} pts</small>
                <div class="score-breakdown team-breakdown">
                  <span title="Scores exacts">${H.icon("target")} ${r.exact_scores || 0}</span>
                  <span title="Bons résultats">${H.icon("check")} ${r.good_results || 0}</span>
                </div>
              </div>
              <div class="points">${this.state.teamTab === "average" ? (r.average_points || 0) : (r.total_points || 0)}<small>${this.state.teamTab === "average" ? "pts/j" : "pts"}</small></div>
            </div>
          `).join("")}
        </div>
      ` : `<p class="muted">Pas encore de team classée.</p>`}
    `;
  },


  qualificationLabel(status) {
    const labels = {
      qualified: { text: "Qualifié", className: "success" },
      qualification_zone: { text: "Zone qualif.", className: "success" },
      qualified_best_third: { text: "Qualifié 3e", className: "success" },
      best_third_zone: { text: "Meilleur 3e", className: "warning" },
      in_progress: { text: "En course", className: "neutral" },
      eliminated: { text: "Éliminé", className: "danger" }
    };
    return labels[status] || { text: status || "En course", className: "neutral" };
  },

  async renderGroupStandings() {
    const root = H.$("#leaderboardContent");
    const { data, error } = await window.sb
      .from("v_group_standings")
      .select("*")
      .order("group_name")
      .order("group_rank");

    if (error) {
      root.innerHTML = `
        <section class="card">
          <h3>Classement des groupes</h3>
          <p class="error-text">${H.escapeHtml(error.message)}</p>
          <p class="muted">Si la vue n’existe pas encore, lance le patch SQL <strong>patch_v1_5_groupes_flags.sql</strong> dans Supabase.</p>
        </section>
      `;
      return;
    }

    const grouped = (data || []).reduce((acc, row) => {
      acc[row.group_name] ||= [];
      acc[row.group_name].push(row);
      return acc;
    }, {});

    root.innerHTML = Object.keys(grouped).length ? `
      <section class="toolbar-card compact-toolbar">
        <div>
          <h3>Classement des groupes</h3>
          <p class="muted">Les 2 premiers sont en zone qualifiée. Les 8 meilleurs troisièmes peuvent aussi passer.</p>
        </div>
      </section>
      <div class="groups-grid">
        ${Object.entries(grouped).map(([groupName, rows]) => this.groupTableHtml(groupName, rows)).join("")}
      </div>
    ` : `<section class="card"><p class="muted">Aucun groupe à afficher pour le moment.</p></section>`;
  },

  groupTableHtml(groupName, rows) {
    return `
      <section class="card group-card">
        <div class="card-title-row">
          <h3>Groupe ${H.escapeHtml(groupName)}</h3>
          <span class="pill neutral">${rows[0]?.finished_group_matches || 0}/${rows[0]?.total_group_matches || 0} matchs</span>
        </div>
        <div class="group-table-wrap">
          <table class="group-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Équipe</th>
                <th>J</th>
                <th>Pts</th>
                <th>Diff</th>
                <th>Qualif.</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r) => {
                const q = this.qualificationLabel(r.qualification_status);
                const flag = H.flagImgHtml({
                  flagUrl: r.flag_url,
                  countryCode: r.country_code,
                  shortName: r.short_name,
                  name: r.team_name
                });
                return `
                  <tr class="${r.group_rank <= 2 ? "qual-zone" : r.group_rank === 3 ? "third-zone" : ""}">
                    <td class="group-rank">${r.group_rank}</td>
                    <td class="team-cell">${flag}<span>${H.escapeHtml(r.team_name)}</span></td>
                    <td>${r.played || 0}</td>
                    <td><strong>${r.points || 0}</strong></td>
                    <td>${(r.goal_difference || 0) > 0 ? "+" : ""}${r.goal_difference || 0}</td>
                    <td><span class="pill ${q.className}">${q.text}</span></td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
        <div class="group-table-foot muted">
          BP ${rows.reduce((sum, r) => sum + (r.goals_for || 0), 0)} · BC ${rows.reduce((sum, r) => sum + (r.goals_against || 0), 0)}
        </div>
      </section>
    `;
  },

  async renderProfile() {
    const root = H.$("#viewRoot");
    const profile = this.state.profile;
    const team = this.state.officeTeams.find((t) => t.id === profile.office_team_id);
    const setupDone = this.profileSetupComplete();
    const startAt = this.competitionStartAt();
    const championLocked = this.championPickLocked();
    const selectedWinnerId = this.state.winnerPrediction?.predicted_team_id || "";
    const selectedWinner = this.state.footballTeams.find((team) => team.id === selectedWinnerId);
    const championTeams = this.championCandidateTeams();
    const competitionName = this.state.activeCompetition?.name || "la compétition";
    const currentAvatar = H.normalizeAvatarKey(profile.avatar_key);
    const currentShape = profile.badge_shape || "rounded";
    const currentColor = profile.badge_color || "#facc15";
    const teamColor = team?.color || currentColor || "#facc15";

    const avatarOptions = this.avatarChoices().map((avatar) => `
      <label class="avatar-choice ${currentAvatar === avatar.key ? "selected" : ""}">
        <input type="radio" name="avatar_key" value="${H.escapeHtml(avatar.key)}" ${currentAvatar === avatar.key ? "checked" : ""}>
        <img src="${H.escapeHtml(H.avatarUrl(avatar.key))}" alt="${H.escapeHtml(avatar.label)}" loading="lazy" onerror="this.onerror=null;this.src='assets/avatars/owl-01.png';">
        <span>${H.escapeHtml(avatar.label)}</span>
      </label>
    `).join("");

    const shapeOptions = this.badgeShapes().map((shape) => `
      <label class="shape-choice ${currentShape === shape.key ? "selected" : ""}">
        <input type="radio" name="badge_shape" value="${H.escapeHtml(shape.key)}" ${currentShape === shape.key ? "checked" : ""}>
        <span class="shape-demo badge-shape-${H.escapeHtml(shape.key)}"></span>
        <strong>${H.escapeHtml(shape.label)}</strong>
      </label>
    `).join("");

    const colorOptions = this.badgeColors().map((color) => `
      <label class="color-choice ${currentColor.toLowerCase() === color.toLowerCase() ? "selected" : ""}" style="--choice-color:${H.escapeHtml(color)}">
        <input type="radio" name="badge_color" value="${H.escapeHtml(color)}" ${currentColor.toLowerCase() === color.toLowerCase() ? "checked" : ""}>
        <span></span>
      </label>
    `).join("");

    root.innerHTML = `
      ${!setupDone ? `
        <section class="card onboarding-card">
          <div>
            <p class="eyebrow">Première connexion</p>
            <h2>Personnalise ta chouette avant d’entrer dans le nid.</h2>
            <p class="muted">Choisis ton pseudo, ton avatar, ton badge et ta team bureau. Tu pourras les modifier plus tard dans ton profil.</p>
          </div>
        </section>
      ` : ""}

      <section class="card profile-card profile-card-custom">
        <div class="profile-avatar-preview" id="profileAvatarPreview">
          ${H.profileBadgeHtml(profile, "profile-badge large")}
        </div>
        <div>
          <h2>${H.escapeHtml(profile.pseudo || "Joueur")}</h2>
          <p class="muted">${H.escapeHtml(profile.email || "")}</p>
          <div class="profile-pill-row">
            <span class="pill">${profile.role === "admin" ? "Admin" : "Joueur"}</span>
            <span class="pill neutral">${H.escapeHtml(team?.name || "Team à choisir")}</span>
            ${!setupDone ? `<span class="pill danger">Profil à compléter</span>` : `<span class="pill success">Profil prêt</span>`}
          </div>
        </div>
      </section>

      ${profile.role === "admin" ? `
        <section class="card admin-mobile-card">
          <div class="card-title-row">
            <div>
              <h3>Administration rapide</h3>
              <p class="muted">Accès mobile pour saisir les scores et mettre à jour les classements.</p>
            </div>
            <a class="primary-btn" href="admin.html">Ouvrir l’admin</a>
          </div>
        </section>
      ` : ""}

      <section class="card profile-account-card">
        <div class="card-title-row">
          <div>
            <h3>${H.icon("profile")} Compte</h3>
            <p class="muted">Déconnexion, crédits et historique des évolutions.</p>
          </div>
          <div class="profile-account-actions">
            <button class="ghost-btn" id="profileCreditsBtn" type="button">Crédits · v0.24.2</button>
            <button class="danger-btn" id="profileLogoutBtn" type="button">Déconnexion</button>
          </div>
        </div>
      </section>

      <section class="card profile-editor-card">
        <div class="card-title-row">
          <div>
            <h3>${setupDone ? "Modifier mon profil" : "Configuration du joueur"}</h3>
            <p class="muted">Avatar supporter, couleur, forme du badge et team bureau.</p>
          </div>
        </div>
        <form id="profileForm" class="form-stack profile-setup-form" style="--avatar-team-color:${H.escapeHtml(teamColor)}">
          <div class="grid two profile-form-main">
            <label>
              <span>Pseudo</span>
              <input name="pseudo" value="${H.escapeHtml(profile.pseudo || "")}" required maxlength="40" autocomplete="nickname">
            </label>
            <label>
              <span>Team bureau</span>
              <select name="office_team_id" required>
                <option value="">Choisir une team</option>
                ${this.state.officeTeams.map((team) => `
                  <option value="${team.id}" ${profile.office_team_id === team.id ? "selected" : ""}>${H.escapeHtml(team.name)}</option>
                `).join("")}
              </select>
            </label>
          </div>

          <div class="avatar-customizer-block">
            <div class="field-title-row">
              <div>
                <span class="field-title">Avatar chouette</span>
                <p class="muted small-note">90 chouettes disponibles. La galerie reste rangée tant que tu n’en as pas besoin.</p>
              </div>
              <button class="ghost-btn avatar-toggle-btn" id="toggleAvatarPanel" type="button" aria-expanded="false" aria-controls="avatarChoicePanel">Personnaliser l’avatar</button>
            </div>
            <div class="avatar-choice-panel" id="avatarChoicePanel" hidden>
              <div class="avatar-choice-grid">${avatarOptions}</div>
            </div>
          </div>

          <div class="grid two badge-settings-grid">
            <div>
              <span class="field-title">Forme du badge</span>
              <div class="shape-choice-grid">${shapeOptions}</div>
            </div>
            <div>
              <span class="field-title">Couleur du badge</span>
              <div class="color-choice-grid">${colorOptions}</div>
            </div>
          </div>

          <button class="primary-btn" type="submit">${setupDone ? "Enregistrer mon profil" : "Valider mon entrée dans le nid"}</button>
        </form>
      </section>

      <section class="card champion-pick-card ${championLocked ? "is-locked" : ""}">
        <div class="card-title-row">
          <div>
            <h3>${H.icon("trophy")} Mon champion du monde</h3>
            <p class="muted">Choisis l’équipe qui remportera ${H.escapeHtml(competitionName)}. Si elle gagne la finale : <strong>+100 points</strong>.</p>
          </div>
          <span class="pill ${championLocked ? "danger" : "success"}">${championLocked ? "Verrouillé" : "Ouvert"}</span>
        </div>

        <form id="championPickForm" class="winner-pick-form">
          <label class="winner-team-label">
            <span>Équipe championne</span>
            <div class="champion-picker ${championLocked ? "is-disabled" : ""}" id="championPicker">
              <input type="hidden" name="predicted_team_id" value="${H.escapeHtml(selectedWinnerId)}">
              <button class="champion-picker-toggle" type="button" ${championLocked ? "disabled" : ""} aria-expanded="false">
                <span class="champion-picker-current">
                  ${selectedWinner ? `
                    ${H.flagImgHtml({ flagUrl: selectedWinner.flag_url, countryCode: selectedWinner.country_code, shortName: selectedWinner.short_name, name: selectedWinner.name, className: "team-flag-img champion-option-flag" })}
                    <span class="champion-option-name">${H.escapeHtml(selectedWinner.name)}</span>
                    <small>${H.escapeHtml(selectedWinner.short_name || "")}</small>
                  ` : `<span class="champion-picker-empty">Choisir une équipe</span>`}
                </span>
                <span class="champion-picker-caret" aria-hidden="true">⌄</span>
              </button>
              <div class="champion-picker-menu" hidden>
                ${championTeams.map((team) => `
                  <button type="button" class="champion-option ${selectedWinnerId === team.id ? "is-selected" : ""}" data-team-id="${H.escapeHtml(team.id)}">
                    ${H.flagImgHtml({ flagUrl: team.flag_url, countryCode: team.country_code, shortName: team.short_name, name: team.name, className: "team-flag-img champion-option-flag" })}
                    <span class="champion-option-name">${H.escapeHtml(team.name)}</span>
                    <small>${H.escapeHtml(team.short_name || team.country_code || "")}</small>
                  </button>
                `).join("")}
              </div>
            </div>
          </label>
          <button class="primary-btn" type="submit" ${championLocked ? "disabled" : ""}>Enregistrer mon champion</button>
        </form>

        <div class="winner-pick-status">
          ${selectedWinner ? `
            <div class="winner-team-preview">
              ${H.flagImgHtml({ flagUrl: selectedWinner.flag_url, countryCode: selectedWinner.country_code, shortName: selectedWinner.short_name, name: selectedWinner.name })}
              <div>
                <strong>${H.escapeHtml(selectedWinner.name)}</strong>
                <small>${championLocked ? "Choix verrouillé" : "Tu peux encore changer avant le coup d’envoi du premier match."}</small>
              </div>
            </div>
          ` : `<p class="muted">Aucun champion choisi pour l’instant.</p>`}
          <p class="muted small-note">Début de verrouillage : ${startAt ? H.formatDateTime(startAt) : "à confirmer"}</p>
        </div>
      </section>
    `;

    const updatePreview = () => {
      const form = H.$("#profileForm");
      const preview = H.$("#profileAvatarPreview");
      if (!form || !preview) return;
      const formData = new FormData(form);
      const selectedTeamId = formData.get("office_team_id") || profile.office_team_id;
      const selectedTeam = this.state.officeTeams.find((t) => t.id === selectedTeamId);
      const nextTeamColor = selectedTeam?.color || teamColor || "#facc15";
      form.style.setProperty("--avatar-team-color", nextTeamColor);
      const next = {
        pseudo: formData.get("pseudo") || profile.pseudo,
        avatar_key: formData.get("avatar_key") || currentAvatar,
        badge_shape: formData.get("badge_shape") || currentShape,
        badge_color: formData.get("badge_color") || currentColor
      };
      preview.innerHTML = H.profileBadgeHtml(next, "profile-badge large");
      H.$$(".avatar-choice", form).forEach((label) => label.classList.toggle("selected", label.querySelector("input")?.checked));
      H.$$(".shape-choice", form).forEach((label) => label.classList.toggle("selected", label.querySelector("input")?.checked));
      H.$$(".color-choice", form).forEach((label) => label.classList.toggle("selected", label.querySelector("input")?.checked));
    };

    H.$$("#profileForm input, #profileForm select").forEach((input) => input.addEventListener("input", updatePreview));
    H.$$("#profileForm input[type=radio]").forEach((input) => input.addEventListener("change", updatePreview));

    const toggleAvatarPanel = H.$("#toggleAvatarPanel");
    const avatarChoicePanel = H.$("#avatarChoicePanel");
    if (toggleAvatarPanel && avatarChoicePanel) {
      toggleAvatarPanel.addEventListener("click", () => {
        const willOpen = avatarChoicePanel.hidden;
        avatarChoicePanel.hidden = !willOpen;
        toggleAvatarPanel.setAttribute("aria-expanded", String(willOpen));
        toggleAvatarPanel.textContent = willOpen ? "Masquer les avatars" : "Personnaliser l’avatar";
        if (willOpen) {
          const selected = H.$(".avatar-choice.selected", avatarChoicePanel);
          selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      });
    }

    const championForm = H.$("#championPickForm");
    if (championForm && !championLocked) {
      championForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        await this.saveChampionPick(formData.get("predicted_team_id"));
      });
    }

    const championPicker = H.$("#championPicker");
    if (championPicker && !championLocked) {
      const toggle = H.$(".champion-picker-toggle", championPicker);
      const menu = H.$(".champion-picker-menu", championPicker);
      const input = H.$('input[name="predicted_team_id"]', championPicker);
      const current = H.$(".champion-picker-current", championPicker);
      const closePicker = () => {
        if (!menu.hidden) {
          menu.hidden = true;
          toggle.setAttribute("aria-expanded", "false");
        }
      };

      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        menu.hidden = !menu.hidden;
        toggle.setAttribute("aria-expanded", String(!menu.hidden));
      });

      H.$$(".champion-option", championPicker).forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          input.value = button.dataset.teamId || "";
          H.$$(".champion-option", championPicker).forEach((option) => option.classList.remove("is-selected"));
          button.classList.add("is-selected");
          current.innerHTML = button.innerHTML;
          closePicker();
        });
      });

      document.addEventListener("click", (event) => {
        if (!championPicker.contains(event.target)) closePicker();
      });
    }

    H.$("#profileCreditsBtn")?.addEventListener("click", () => this.openCreditsModal());
    H.$("#profileLogoutBtn")?.addEventListener("click", () => Auth.logout());

    H.$("#profileForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const pseudo = String(formData.get("pseudo") || "").trim();
      const officeTeamId = formData.get("office_team_id") || null;
      if (!pseudo) return H.toast("Choisis un pseudo.", "error");
      if (!officeTeamId) return H.toast("Choisis une team bureau.", "error");

      const { error } = await window.sb
        .from("profiles")
        .update({
          pseudo,
          office_team_id: officeTeamId,
          avatar_key: formData.get("avatar_key") || "owl-01",
          badge_shape: formData.get("badge_shape") || "rounded",
          badge_color: formData.get("badge_color") || "#facc15",
          profile_setup_done: true
        })
        .eq("id", this.state.session.user.id);

      if (error) {
        H.toast(error.message, "error");
        return;
      }

      await this.loadProfile();
      this.renderShell();
      H.toast(setupDone ? "Profil mis à jour" : "Bienvenue dans le nid !", "success");
      await this.renderProfile();
    });
  },

  async refreshCurrentViewFromRealtime(reason = "realtime") {
    await Promise.all([
      this.loadMatches(),
      this.loadMyPredictions(),
      this.loadVisiblePredictions(),
      this.loadWinnerPrediction()
    ]);

    if (["home", "matches", "worldcup", "mypredictions", "leaderboard", "achievements", "profile"].includes(this.state.currentView)) {
      await this.loadView(this.state.currentView);
    }

    if (reason === "matches") {
      H.toast("Scores / matchs mis à jour", "info");
    }
  },

  setupRealtime() {
    window.sb
      .channel("app-realtime-v0-24-2")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, async () => {
        await this.refreshCurrentViewFromRealtime("matches");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "prediction_points" }, async () => {
        await this.refreshCurrentViewFromRealtime("points");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "predictions" }, async () => {
        await this.loadVisiblePredictions();
        if (["matches", "mypredictions"].includes(this.state.currentView)) await this.loadView(this.state.currentView);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "winner_predictions" }, async () => {
        await this.refreshCurrentViewFromRealtime("winner");
      })
      .subscribe((status) => {
        console.info("[Le Nid des Pronos] Realtime app:", status);
      });
  }};

window.addEventListener("DOMContentLoaded", () => {
  App.init().catch((error) => {
    console.error(error);
    H.toast(error.message || "Erreur au chargement", "error");
  });
});
