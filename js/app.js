// ============================================================
// LE NID DES PRONOS — APP PRINCIPALE V1.0.18
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
    groupStandings: [],
    myPredictions: [],
    visiblePredictions: [],
    miniRecordPredictionCounts: [],
    publicProfiles: [],
    playerScoreRows: [],
    winnerPredictions: [],
    winnerPredictionsError: null,
    teamSelectedPlayerId: null,
    teamChatMessages: [],
    teamChatScope: "global",
    teamChatLimit: 30,
    teamChatPageSize: 30,
    teamChatHasMore: false,
    teamChatError: null,
    hasUnreadTeamMessages: false,
    currentView: "home",
    leaderboardTab: "players",
    playerLeaderboardMode: "overall",
    teamTab: "average",
    achievementsTab: "mine",
    worldcupTab: "groups",
    matchPhaseIndex: 0,
    myPredictionsPhaseIndex: 0,
    leaderboardPhaseIndex: 0,
    teamLeaderboardPhaseIndex: 0,
    leaderboardEvolutionMode: "day",
    achievementNotificationQueue: [],
    achievementModalOpen: false,
    achievementNotificationTimer: null,
    achievementResyncTimers: [],
    homeRecordCarouselTimer: null,
    lastAchievementIds: null
  },

  async init() {
    this.state.session = await Auth.requireSession();
    if (!this.state.session) return;

    this.bindNavigation();
    this.bindMobileMenu();
    this.bindGlobalActions();
    await this.loadBaseData();
    const rawRequestedView = new URLSearchParams(window.location.search).get("view") || "home";
    const requestedView = rawRequestedView === "mypredictions" ? "matches" : rawRequestedView;
    const allowedViews = ["home", "matches", "worldcup", "leaderboard", "teams", "achievements", "profile"];
    const mustCompleteProfile = !this.profileSetupComplete();
    this.syncAchievementNotifications({ silent: !this.hasAchievementNotificationStore() });
    await this.loadView(mustCompleteProfile ? "profile" : (allowedViews.includes(requestedView) ? requestedView : "home"));
    await this.refreshTeamChatUnreadIndicator();
    if (mustCompleteProfile) H.toast("Bienvenue ! Choisis ton pseudo, ton avatar, ton badge et ta team pour entrer dans le nid.", "info");
    this.setupRealtime();
  },

  bindNavigation() {
    H.$$('[data-view]').forEach((btn) => {
      if (btn.dataset.navBound === 'true') return;
      btn.dataset.navBound = 'true';
      btn.addEventListener('click', () => {
        this.closeMobileMenu();
        this.loadView(btn.dataset.view);
      });
    });
  },

  bindMobileMenu() {
    const toggle = H.$('#mobileMenuToggle');
    const closeBtn = H.$('#mobileMenuClose');
    const backdrop = H.$('#mobileMenuBackdrop');
    const adminLink = H.$('#mobileAdminLink');

    toggle?.addEventListener('click', () => this.openMobileMenu());
    closeBtn?.addEventListener('click', () => this.closeMobileMenu());
    backdrop?.addEventListener('click', () => this.closeMobileMenu());
    adminLink?.addEventListener('click', () => this.closeMobileMenu());

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeMobileMenu();
    });
  },

  openMobileMenu() {
    const toggle = H.$('#mobileMenuToggle');
    const panel = H.$('#mobileMenuPanel');
    const backdrop = H.$('#mobileMenuBackdrop');
    if (!panel || !backdrop) return;

    panel.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add('mobile-menu-open');
    toggle?.setAttribute('aria-expanded', 'true');
  },

  closeMobileMenu() {
    const toggle = H.$('#mobileMenuToggle');
    const panel = H.$('#mobileMenuPanel');
    const backdrop = H.$('#mobileMenuBackdrop');

    document.body.classList.remove('mobile-menu-open');
    toggle?.setAttribute('aria-expanded', 'false');

    window.setTimeout(() => {
      if (!document.body.classList.contains('mobile-menu-open')) {
        if (panel) panel.hidden = true;
        if (backdrop) backdrop.hidden = true;
      }
    }, 160);
  },

  teamChatSeenKey() {
    return `nid-team-chat-last-seen:${this.state.session?.user?.id || "anonymous"}`;
  },

  getTeamChatLastSeenAt() {
    try {
      const raw = localStorage.getItem(this.teamChatSeenKey());
      return raw ? new Date(raw) : null;
    } catch (error) {
      return null;
    }
  },

  setTeamChatLastSeenNow() {
    try {
      localStorage.setItem(this.teamChatSeenKey(), new Date().toISOString());
    } catch (error) {
      console.warn("Impossible d’enregistrer la lecture du chat", error);
    }
  },

  markTeamChatAsSeen() {
    this.setTeamChatLastSeenNow();
    this.state.hasUnreadTeamMessages = false;
    this.updateTeamUnreadIndicators();
  },

  updateTeamUnreadIndicators() {
    const shouldShow = Boolean(this.state.hasUnreadTeamMessages && this.state.currentView !== "teams");
    H.$$('[data-view="teams"]').forEach((btn) => {
      btn.classList.toggle("has-unread", shouldShow);
      btn.setAttribute("aria-label", shouldShow ? "Les teams du nid — nouveau message non lu" : "Les teams du nid");
    });
  },

  async refreshTeamChatUnreadIndicator() {
    if (!this.state.session?.user?.id) return;
    const lastSeen = this.getTeamChatLastSeenAt();
    if (!lastSeen || Number.isNaN(lastSeen.getTime())) {
      this.setTeamChatLastSeenNow();
      this.state.hasUnreadTeamMessages = false;
      this.updateTeamUnreadIndicators();
      return;
    }

    const after = lastSeen.toISOString();
    const ownUserId = this.state.session.user.id;

    const hasUnreadInQuery = async (query) => {
      const { data, error } = await query;
      if (error) {
        console.warn("Indicateur messages non lus indisponible", error);
        return false;
      }
      return Boolean((data || []).length);
    };

    const checks = [
      hasUnreadInQuery(
        window.sb
          .from("v_team_chat_messages")
          .select("id,created_at,user_id")
          .eq("scope", "global")
          .neq("user_id", ownUserId)
          .gt("created_at", after)
          .order("created_at", { ascending: false })
          .limit(1)
      )
    ];

    if (this.state.profile?.office_team_id) {
      checks.push(hasUnreadInQuery(
        window.sb
          .from("v_team_chat_messages")
          .select("id,created_at,user_id")
          .eq("scope", "team")
          .eq("office_team_id", this.state.profile.office_team_id)
          .neq("user_id", ownUserId)
          .gt("created_at", after)
          .order("created_at", { ascending: false })
          .limit(1)
      ));
    }

    const results = await Promise.all(checks);
    this.state.hasUnreadTeamMessages = results.some(Boolean);
    this.updateTeamUnreadIndicators();
  },

  teamChatRealtimeMessageIsVisible(message = {}) {
    if (!message || message.user_id === this.state.session?.user?.id) return false;
    if (message.deleted_at) return false;
    if (message.scope === "global") return true;
    return message.scope === "team" && message.office_team_id === this.state.profile?.office_team_id;
  },

  async handleTeamChatRealtime(payload = {}) {
    if (this.state.currentView === "teams") {
      await this.loadTeamChatMessages();
      await this.renderTeamsPage();
      return;
    }

    if (payload.eventType === "INSERT" && this.teamChatRealtimeMessageIsVisible(payload.new)) {
      this.state.hasUnreadTeamMessages = true;
      this.updateTeamUnreadIndicators();
      return;
    }

    await this.refreshTeamChatUnreadIndicator();
  },

  bindGlobalActions() {
    const logoutBtn = H.$("#logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", () => Auth.logout());

    const creditsBtn = H.$("#creditsBtn");
    if (creditsBtn) creditsBtn.addEventListener("click", () => this.openCreditsModal());

    const scrollTopBtn = H.$("#mobileScrollTopOwl");
    if (scrollTopBtn && scrollTopBtn.dataset.bound !== "true") {
      scrollTopBtn.dataset.bound = "true";
      const updateScrollTopButton = () => {
        scrollTopBtn.classList.toggle("is-visible", window.scrollY > 360);
      };
      scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
      window.addEventListener("scroll", updateScrollTopButton, { passive: true });
      updateScrollTopButton();
    }
  },

  profileSetupComplete() {
    const p = this.state.profile;
    return Boolean(p?.profile_setup_done && p?.pseudo && p?.office_team_id && p?.avatar_key && p?.badge_shape && p?.badge_color);
  },

  teamColorForProfile(profile = {}) {
    const team = this.state.officeTeams.find((t) =>
      t.id === profile.office_team_id ||
      t.slug === profile.office_team_slug ||
      t.name === profile.office_team_name
    );
    return team?.color || profile.office_team_color || profile.team_color || profile.badge_color || "#facc15";
  },

  visualProfile(profile = {}) {
    return {
      ...profile,
      office_team_color: this.teamColorForProfile(profile)
    };
  },

  avatarChoices() {
    return typeof H.avatarChoices === "function"
      ? H.avatarChoices()
      : Object.entries(H.AVATAR_LABELS).map(([key, label]) => ({ key, label, typeLabel: "Avatars" }));
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
            <p class="muted">Version publique <strong>1.0.18</strong> · mini-records exclusifs pour leur détenteur actuel.</p>
          </div>
          <button class="ghost-btn" id="closeCreditsBtn" type="button">Fermer</button>
        </div>
        <div class="credits-grid">
          <section>
            <h3>Version actuelle</h3>
            <p><strong>1.0.18</strong> — mini-record “Greffier du grimoire” : date fournie par Supabase et égalités conservées par le premier détenteur.</p>
            <p><strong>1.0.18</strong> — les mini-records deviennent des trophées dynamiques : un seul détenteur actuel par record, calculé sur tous les joueurs.</p>
            <p><strong>1.0.13</strong> — ajout du badge “Descente du bus impossible” quand le champion pronostiqué reste bloqué en phase de groupes.</p>
            <p><strong>1.0.5</strong> — dashboard mobile/desktop stabilisé, sans chevauchement des cartes.</p>
          </section>
          <section>
            <h3>Évolutions V1.0.18</h3>
            <ul class="changelog-list">
              <li>Tableau de bord réorganisé sans grille forcée qui écrase les cartes.</li>
              <li>Carte “Prochain match” réduite pour laisser respirer les classements et les mini-records.</li>
              <li>Mobile rendu lisible : les cartes gardent une taille confortable et la page peut scroller si nécessaire.</li>
              <li>Desktop conservé en tableau de bord sans scroll, sans chevauchement.</li>
              <li>Annuaire “Teams du nid” : les équipes sans joueur ne sont plus affichées.</li>
              <li>Mini-records exclusifs : un seul joueur détient chaque trophée à la fois.</li>
              <li>Nouveau badge négatif : champion annoncé éliminé en phase de groupes.</li>
            </ul>
          </section>
          <section>
            <h3>Crédits</h3>
            <p>Application : Le Nid des Pronos · pronostics, chouettes, teams et mauvaise foi sportive assumée.</p>
            <p>Version publique préparée par Parkaf.</p>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    H.$("#closeCreditsBtn", modal).addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  },

  openRulesModal() {
    H.$("#rulesModal")?.remove();
    const modal = document.createElement("div");
    modal.id = "rulesModal";
    modal.className = "modal-backdrop rules-modal";
    modal.innerHTML = `
      <div class="modal-card rules-card" role="dialog" aria-modal="true" aria-labelledby="rulesTitle">
        <div class="card-title-row">
          <div>
            <p class="eyebrow">${H.icon("list")} Règles du nid</p>
            <h2 id="rulesTitle">Comment les points tombent</h2>
            <p class="muted">Les matchs de préparation sont des tests : ils ne comptent pas dans le classement Coupe du monde.</p>
          </div>
          <button class="ghost-btn" id="closeRulesBtn" type="button">Fermer</button>
        </div>
        <div class="rules-grid">
          <article><strong>Score exact</strong><span>Tu poses le score pile comme au coup de sifflet final. Le hibou sort les confettis.</span><b>+5 pts</b></article>
          <article><strong>Bon résultat</strong><span>Tu trouves le bon sens du match : victoire, nul ou défaite, même si le score n’est pas exact.</span><b>+3 pts</b></article>
          <article><strong>Bon écart</strong><span>Tu ne trouves pas forcément le score, mais tu trouves le bon écart de buts. Exemple : tu pronostiques 2-0 et le match finit 3-1.</span><b>+1 pt</b></article>
          <article><strong>Phase finale</strong><span>Dans un match couperet, l’important est aussi de deviner quel oiseau reste perché. Si tu choisis la bonne équipe qualifiée, même après prolongation ou tirs au but, tu gagnes le bonus.</span><b>+2 pts</b></article>
          <article><strong>Champion du monde</strong><span>Ton grand favori, choisi avant le début de la Coupe du monde, soulève le trophée à la fin.</span><b>+100 pts</b></article>
          <article><strong>Matchs test</strong><span>France–Côte d’Ivoire et France–Irlande du Nord servent uniquement à tester le nid avant le vrai envol.</span><b>0 pt classement</b></article>
        </div>
        <div class="rules-note">
          <strong>Préparation du nid</strong>
          <p>Les 2 matchs de préparation sont bien des matchs test : ils ne comptent pas dans le classement Coupe du monde, ne comptent pas dans les graphiques et ne débloquent pas les exploits normaux. Ils servent à vérifier que les pronos, les scores et les popups fonctionnent avant le début officiel.</p>
          <p>Ils peuvent seulement débloquer les badges spéciaux de préparation : <strong>Préparation du nid</strong> si tu pronostiques les 2 matchs, et <strong>Test concluant</strong> si tu pronostiques bien au moins 1 match sur les 2.</p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    H.$("#closeRulesBtn", modal)?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  },

  async loadBaseData() {
    await Promise.all([
      this.loadProfile(),
      this.loadOfficeTeams(),
      this.loadFootballTeams(),
      this.loadActiveCompetition(),
      this.loadMatches(),
      this.loadGroupStandings(),
      this.loadMyPredictions(),
      this.loadVisiblePredictions(),
      this.loadPublicProfiles()
    ]);

    await Promise.all([
      this.loadWinnerPrediction(),
      this.loadMiniRecordPredictionCounts()
    ]);
    this.renderShell();
  },

  async loadProfile() {
    const userId = this.state.session.user.id;
    const { data, error } = await window.sb
      .from("profiles")
      .select("id,email,pseudo,role,office_team_id,is_active,avatar_key,badge_shape,badge_color,profile_setup_done,featured_badge_ids")
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

  async loadPlayerScoreRows() {
    const { data, error } = await window.sb
      .from("v_leaderboard_overall")
      .select("*")
      .order("rank");

    if (error) {
      console.warn("Classement indisponible pour les fiches joueurs", error);
      this.state.playerScoreRows = [];
      return;
    }

    this.state.playerScoreRows = data || [];
  },

  async loadMiniRecordPredictionCounts() {
    const { data, error } = await window.sb
      .from("v_mini_record_prediction_counts")
      .select("*");

    if (error) {
      console.warn("Compteurs mini-records indisponibles", error);
      this.state.miniRecordPredictionCounts = [];
      return;
    }

    this.state.miniRecordPredictionCounts = data || [];
  },

  miniRecordPredictionCountRow(userId) {
    return this.state.miniRecordPredictionCounts.find((row) => String(row.user_id || row.id) === String(userId)) || null;
  },

  async loadWinnerPredictionsForTeams() {
    this.state.winnerPredictionsError = null;

    const selectFields = "user_id,predicted_team_id,predicted_team_name,predicted_team_short_name,predicted_team_country_code,predicted_team_flag_url,is_locked,points_total,competition_id";
    const runQuery = async (viewName) => {
      let query = window.sb
        .from(viewName)
        .select(selectFields)
        .order("pseudo", { ascending: true });

      if (this.state.activeCompetition?.id) {
        query = query.eq("competition_id", this.state.activeCompetition.id);
      }

      return query;
    };

    let { data, error } = await runQuery("v_team_public_winner_predictions");

    // Fallback si le patch V0.25.1 n'a pas encore été lancé :
    // l'ancienne vue respecte le masquage jusqu'au verrouillage.
    if (error) {
      ({ data, error } = await runQuery("v_winner_predictions"));
    }

    if (error) {
      console.warn("Choix champion indisponibles pour les fiches joueurs", error);
      this.state.winnerPredictions = [];
      this.state.winnerPredictionsError = error;
      return;
    }

    this.state.winnerPredictions = data || [];
  },

  async loadMatches() {
    const { data, error } = await window.sb
      .from("v_matches")
      .select("*")
      .order("kickoff_at", { ascending: true });

    if (error) throw error;
    this.state.matches = data || [];
  },

  async loadGroupStandings() {
    const { data, error } = await window.sb
      .from("v_group_standings")
      .select("competition_id,group_name,group_rank,team_id,team_name,points,goal_difference,qualification_status,total_group_matches,finished_group_matches,group_finished,all_groups_finished")
      .order("group_name")
      .order("group_rank");

    if (error) {
      console.warn("v_group_standings indisponible pour le rang des équipes", error);
      this.state.groupStandings = [];
      return;
    }

    this.state.groupStandings = data || [];
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

  async loadPublicProfiles() {
    const { data, error } = await window.sb
      .from("v_public_profiles")
      .select("*")
      .eq("is_active", true)
      .order("office_team_name", { ascending: true, nullsFirst: false })
      .order("pseudo", { ascending: true });

    if (!error) {
      this.state.publicProfiles = data || [];
      return;
    }

    console.warn("v_public_profiles indisponible, fallback profiles", error);
    const { data: fallback, error: fallbackError } = await window.sb
      .from("profiles")
      .select("id,pseudo,office_team_id,is_active,avatar_key,badge_shape,badge_color,profile_setup_done,featured_badge_ids")
      .eq("is_active", true)
      .order("pseudo", { ascending: true });

    if (fallbackError) {
      console.warn("profiles indisponible pour Les teams", fallbackError);
      this.state.publicProfiles = [];
      return;
    }

    this.state.publicProfiles = (fallback || []).map((profile) => {
      const team = this.state.officeTeams.find((t) => t.id === profile.office_team_id);
      return {
        ...profile,
        office_team_name: team?.name || null,
        office_team_slug: team?.slug || null,
        office_team_color: team?.color || null
      };
    });
  },

  async loadTeamChatMessages() {
    this.state.teamChatError = null;
    const scope = this.state.teamChatScope || "global";
    const limit = Math.max(10, Number(this.state.teamChatLimit || this.state.teamChatPageSize || 30));
    let query = window.sb
      .from("v_team_chat_messages")
      .select("*")
      .eq("scope", scope)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (scope === "team" && this.state.profile?.office_team_id) {
      query = query.eq("office_team_id", this.state.profile.office_team_id);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("Chat teams indisponible", error);
      this.state.teamChatMessages = [];
      this.state.teamChatHasMore = false;
      this.state.teamChatError = error;
      return;
    }

    const rows = data || [];
    this.state.teamChatHasMore = rows.length > limit;
    this.state.teamChatMessages = rows.slice(0, limit).reverse();
  },

  renderShell() {
    const profile = this.state.profile;
    const team = this.state.officeTeams.find((t) => t.id === profile.office_team_id);

    H.$("#userPseudo").textContent = profile.pseudo || "Joueur";
    H.$("#userTeam").textContent = team ? team.name : "Team à choisir";
    const userAvatar = H.$("#userAvatar");
    if (userAvatar) userAvatar.innerHTML = H.profileBadgeHtml(this.visualProfile(profile), "profile-badge small");

    const isAdmin = profile.role === "admin";

    const adminLink = H.$("#adminLink");
    if (adminLink) {
      adminLink.hidden = !isAdmin;
    }

    const mobileAdminLink = H.$("#mobileAdminLink");
    const mobileNav = H.$("#mobileMenuPanel");
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
    this.updateTeamUnreadIndicators();
  },

  async loadView(viewName) {
    if (viewName === "mypredictions") viewName = "matches";
    if (viewName !== "profile" && !this.profileSetupComplete()) {
      viewName = "profile";
      H.toast("Complète d’abord ton profil pour accéder au nid.", "info");
    }
    this.clearHomeRecordCarousel();
    this.state.currentView = viewName;
    document.body.dataset.currentView = viewName;
    this.setActiveNav(viewName);

    const titleMap = {
      home: "Tableau de bord",
      matches: "Matchs & pronos",
      worldcup: "Coupe du monde",
      leaderboard: "Classements",
      teams: "Les teams du nid",
      achievements: "Exploits",
      profile: "Profil"
    };

    const title = H.$("#pageTitle");
    if (title) title.textContent = titleMap[viewName] || "Le Nid des Pronos";

    if (viewName === "home") await this.renderHome();
    if (viewName === "matches") await this.renderMatches();
    if (viewName === "worldcup") await this.renderWorldCup();
    if (viewName === "leaderboard") await this.renderLeaderboard();
    if (viewName === "teams") await this.renderTeamsPage();
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

  availablePredictionMatches() {
    return this.state.matches.filter((m) => !m.is_test_match && !["cancelled", "postponed"].includes(m.status));
  },

  preparationMatches() {
    return this.state.matches.filter((m) => m.is_test_match);
  },

  isPreparationMatch(matchOrId) {
    const match = typeof matchOrId === "string"
      ? this.state.matches.find((m) => m.id === matchOrId)
      : matchOrId;
    return Boolean(match?.is_test_match);
  },

  competitionMatches() {
    return this.state.matches.filter((m) => !m.is_test_match);
  },

  phaseLeaderboardMatches() {
    return this.state.matches.filter((m) => !["cancelled", "postponed"].includes(m.status));
  },

  predictionRowsForUser(userId, options = {}) {
    const byMatch = new Map();
    const addRow = (row = {}) => {
      if (!row.match_id) return;
      const existing = byMatch.get(row.match_id) || {};
      byMatch.set(row.match_id, {
        ...existing,
        ...row,
        created_at: row.created_at || existing.created_at,
        updated_at: row.updated_at || existing.updated_at,
        locked_at: row.locked_at || existing.locked_at
      });
    };

    const includeTest = Boolean(options.includeTest);
    const keepPrediction = (p) => includeTest || !this.isPreparationMatch(p.match_id);

    this.state.visiblePredictions
      .filter((p) => p.user_id === userId && keepPrediction(p))
      .forEach(addRow);

    if (userId === this.state.session?.user?.id) {
      this.state.myPredictions.filter(keepPrediction).forEach(addRow);
    }

    return [...byMatch.values()].sort((a, b) => {
      const da = this.predictionActivityDate(a)?.getTime() || 0;
      const db = this.predictionActivityDate(b)?.getTime() || 0;
      return da - db;
    });
  },

  predictionActivityDate(row = {}) {
    const raw = row.updated_at || row.created_at || row.locked_at;
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  },

  localDayKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },

  maxConsecutiveDayStreak(dates = []) {
    const days = [...new Set(dates.map((date) => {
      const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      return midnight.getTime();
    }))].sort((a, b) => a - b);

    let current = 0;
    let best = 0;
    let previous = null;
    const oneDay = 24 * 60 * 60 * 1000;

    days.forEach((day) => {
      current = previous !== null && day - previous === oneDay ? current + 1 : 1;
      best = Math.max(best, current);
      previous = day;
    });

    return best;
  },

  nextMatch() {
    return this.upcomingMatches()[0] || null;
  },

  competitionStartAt() {
    const dates = this.competitionMatches()
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
    this.syncAchievementNotifications();
    this.scheduleAchievementResync();
    H.toast("Champion enregistré : 100 points si ça passe !", "success");
    await this.renderProfile();
  },

  async renderHome() {
    const root = H.$("#viewRoot");
    await this.loadPlayerScoreRows();
    const next = this.nextMatch();
    const missing = this.missingPredictions();
    const myRank = await this.fetchMyRank();
    const teamAverageRows = this.overallTeamAverageRows();

    root.innerHTML = `
      <section class="home-dashboard-screen" aria-label="Tableau de bord accueil">
        <section class="hero-card home-dashboard-hero">
          <div>
            <p class="eyebrow">${H.icon("nest")} Bienvenue dans le nid</p>
            <h2>Fais tes scores avant le coup d’envoi.</h2>
            <p class="muted">Les pronos des autres restent cachés jusqu’au début du match. Pas de copie, que du flair.</p>
            <button class="ghost-btn rules-home-btn" id="rulesHomeBtn" type="button">${H.icon("list")} Règles & points</button>
          </div>
        </section>

        <section class="home-dashboard-grid">
          <section class="home-dashboard-left" aria-label="Match et mini-records">
            <article class="card next-match-card">
              <div class="card-title-row compact-title-row">
                <h3>Prochain match</h3>
                <span class="pill">${next ? H.statusLabel(next.status) : "Aucun"}</span>
              </div>
              ${next ? this.matchMiniHtml(next) : `<p class="muted">Aucun match à venir pour le moment.</p>`}
            </article>

            ${this.homeRecordCarouselHtml()}
          </section>

          <aside class="home-dashboard-right" aria-label="Classements rapides et pronos">
            <section class="home-standing-stack" aria-label="Classements rapides">
              ${this.homeRankCardHtml(myRank)}
              ${this.homeTeamAverageCardHtml(teamAverageRows)}
            </section>

            <article class="card warning-soft home-missing-card">
              <div class="card-title-row">
                <h3>Pronos manquants</h3>
                <span class="count-badge">${missing.length}</span>
              </div>
              ${missing.length ? `
                <p class="muted">Encore ${missing.length} match${missing.length > 1 ? "s" : ""} à poser.</p>
                <button class="primary-btn" type="button" data-action="go-nearest-missing">Aller au plus proche</button>
              ` : `<p class="muted">Nickel, tous tes pronos à venir sont posés.</p>`}
            </article>
          </aside>
        </section>
      </section>
    `;

    H.$("#rulesHomeBtn")?.addEventListener("click", () => this.openRulesModal());
    H.$("#homeRecordsBtn", root)?.addEventListener("click", () => {
      this.state.achievementsTab = "records";
      this.loadView("achievements");
    });
    H.$('[data-action="go-overall-leaderboard"]', root)?.addEventListener("click", () => {
      this.state.leaderboardTab = "players";
      this.state.playerLeaderboardMode = "overall";
      this.loadView("leaderboard");
    });
    H.$('[data-action="go-team-average-leaderboard"]', root)?.addEventListener("click", () => {
      this.state.leaderboardTab = "team";
      this.state.teamTab = "average";
      this.loadView("leaderboard");
    });
    this.bindNavigation();
    this.bindGoToNearestMissingActions();
    this.bindHomeRecordCarousel(root);
  },


  homeRankCardHtml(myRank) {
    if (!myRank) {
      return `
        <article class="card home-rank-card">
          <div class="card-title-row">
            <h3>Classement général</h3>
            <button class="ghost-btn tiny-btn" type="button" data-action="go-overall-leaderboard">Voir</button>
          </div>
          <div class="home-rank-main empty">
            <span class="home-rank-number">—</span>
            <div>
              <strong>Pas encore classé</strong>
              <small>Pose tes premiers pronos pour entrer dans le nid.</small>
            </div>
          </div>
        </article>
      `;
    }

    return `
      <article class="card home-rank-card">
        <div class="card-title-row">
          <h3>Classement général</h3>
          <button class="ghost-btn tiny-btn" type="button" data-action="go-overall-leaderboard">Voir</button>
        </div>
        <div class="home-rank-main">
          <span class="home-rank-number">#${myRank.rank}</span>
          <div>
            <strong>${Number(myRank.total_points || 0)} pts</strong>
            <small>Ton rang joueur</small>
          </div>
        </div>
      </article>
    `;
  },

  overallTeamAverageRows() {
    const scoreByUser = new Map(
      this.state.playerScoreRows.map((row) => [row.user_id || row.id, row])
    );

    return this.state.officeTeams
      .map((team) => {
        const players = this.teamPlayers(team.id).filter((player) => player.profile_setup_done !== false);
        const total = players.reduce((sum, player) => {
          const score = scoreByUser.get(player.id) || scoreByUser.get(player.user_id);
          return sum + Number(score?.total_points || 0);
        }, 0);

        return {
          office_team_id: team.id,
          office_team_name: team.name,
          office_team_color: team.color,
          active_players: players.length,
          total_points: total,
          average_points: players.length ? total / players.length : 0
        };
      })
      .filter((row) => row.active_players > 0)
      .sort((a, b) =>
        (b.average_points || 0) - (a.average_points || 0)
        || (b.total_points || 0) - (a.total_points || 0)
        || String(a.office_team_name || "").localeCompare(String(b.office_team_name || ""), "fr")
      )
      .map((row, index) => ({ ...row, rank: index + 1 }));
  },

  homeTeamAverageCardHtml(rows = []) {
    const myTeam = this.officeTeamById(this.state.profile?.office_team_id);
    const myRow = rows.find((row) => row.office_team_id === myTeam?.id);
    const leader = rows[0];

    if (!myTeam) {
      return `
        <article class="card home-team-average-card">
          <div class="card-title-row">
            <h3>Moyenne team</h3>
          </div>
          <p class="muted">Choisis une team pour voir son classement moyen.</p>
        </article>
      `;
    }

    if (!myRow) {
      return `
        <article class="card home-team-average-card">
          <div class="card-title-row">
            <h3>Moyenne team</h3>
            <button class="ghost-btn tiny-btn" type="button" data-action="go-team-average-leaderboard">Voir</button>
          </div>
          <div class="home-team-average-main empty">
            <span class="home-team-rank">—</span>
            <div>
              <strong>${H.escapeHtml(myTeam.name)}</strong>
              <small>Aucun joueur actif classé pour l’instant.</small>
            </div>
          </div>
        </article>
      `;
    }

    return `
      <article class="card home-team-average-card" style="--team-color:${this.safeColor(myRow.office_team_color, "#facc15")}">
        <div class="card-title-row">
          <h3>Moyenne team</h3>
          <button class="ghost-btn tiny-btn" type="button" data-action="go-team-average-leaderboard">Voir</button>
        </div>
        <div class="home-team-average-main">
          <span class="home-team-rank">#${myRow.rank}</span>
          <div>
            <strong>${H.escapeHtml(myRow.office_team_name)}</strong>
            <small>${Number(myRow.average_points || 0).toFixed(1)} pts/joueur · ${myRow.active_players} joueur${myRow.active_players > 1 ? "s" : ""}</small>
          </div>
        </div>
        ${leader && leader.office_team_id !== myRow.office_team_id ? `
          <p class="home-team-average-leader">Leader : <strong>${H.escapeHtml(leader.office_team_name)}</strong> · ${Number(leader.average_points || 0).toFixed(1)} pts/j</p>
        ` : `<p class="home-team-average-leader is-first">Ta team mène le nid à la moyenne 🦉</p>`}
      </article>
    `;
  },

  clearHomeRecordCarousel() {
    if (this.state.homeRecordCarouselTimer) {
      window.clearInterval(this.state.homeRecordCarouselTimer);
      this.state.homeRecordCarouselTimer = null;
    }
  },

  matchMiniHtml(match) {
    return `
      <div class="mini-match">
        <div class="teams-row">
          <strong>${H.matchFlagHtml(match, "home")} ${H.escapeHtml(match.home_team_name)}</strong>
          <span>vs</span>
          <strong>${H.matchFlagHtml(match, "away")} ${H.escapeHtml(match.away_team_name)}</strong>
        </div>
        ${match.is_test_match ? `<p class="test-match-mini-label">MATCH TEST · hors classement Coupe du monde</p>` : ""}
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
    await Promise.all([this.loadMatches(), this.loadGroupStandings(), this.loadMyPredictions(), this.loadVisiblePredictions()]);

    const root = H.$("#viewRoot");
    const groups = this.groupMatchesByPouleRound(this.state.matches);
    const activeIndex = this.clampPhaseIndex("matchPhaseIndex", groups);
    const group = groups[activeIndex];

    if (!groups.length || !group) {
      root.innerHTML = `
        <section class="toolbar-card">
          <div>
            <h2>Matchs & pronos</h2>
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
          <h2>Matchs & pronos</h2>
          <p class="muted">Tous les matchs et la saisie de tes scores sont réunis ici.</p>
        </div>
        <button class="ghost-btn" id="refreshMatchesBtn">Rafraîchir</button>
      </section>

      ${this.predictionPhaseSummaryHtml(group)}

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
    this.bindGoToNearestMissingActions();
  },

  predictionPhaseSummaryHtml(group) {
    const allMissing = this.missingPredictions();
    const allDone = this.state.matches.filter((match) => this.getMyPrediction(match.id));
    const locked = this.state.matches.filter((match) => H.isKickoffPassed(match.kickoff_at));

    return `
      <section class="grid three stats-grid combined-prono-stats">
        <article class="stat-card"><strong>${allDone.length}</strong><span>Pronos posés</span></article>
        ${allMissing.length ? `
          <button class="stat-card stat-card-action" type="button" data-action="go-nearest-missing" title="Aller au prono manquant le plus proche">
            <strong>${allMissing.length}</strong><span>À faire</span>
          </button>
        ` : `<article class="stat-card"><strong>0</strong><span>À faire</span></article>`}
        <article class="stat-card"><strong>${locked.length}</strong><span>Verrouillés</span></article>
      </section>
    `;
  },

  bindCombinedPredictionSummaryActions() {
    H.$$("[data-jump-match]").forEach((button) => {
      button.addEventListener("click", () => {
        this.scrollToMatch(button.dataset.jumpMatch);
      });
    });
  },

  bindGoToNearestMissingActions() {
    H.$$('[data-action="go-nearest-missing"]').forEach((button) => {
      button.addEventListener("click", async () => this.goToNearestMissingPrediction());
    });
  },

  scrollToMatch(matchId) {
    const target = document.getElementById(`match-${matchId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("match-card-highlight");
    const firstInput = target.querySelector('input:not([disabled]), select:not([disabled]), button[type="submit"]');
    if (firstInput) setTimeout(() => firstInput.focus({ preventScroll: true }), 450);
    setTimeout(() => target.classList.remove("match-card-highlight"), 1200);
  },

  async goToNearestMissingPrediction() {
    const missing = this.missingPredictions();
    if (!missing.length) {
      H.toast("Tous tes pronos à venir sont posés. La chouette est tranquille.", "success");
      return;
    }

    const match = missing[0];
    const groups = this.groupMatchesByPouleRound(this.state.matches);
    const groupIndex = groups.findIndex((group) => group.matches.some((item) => item.id === match.id));
    if (groupIndex >= 0) this.state.matchPhaseIndex = groupIndex;

    if (this.state.currentView !== "matches") {
      await this.loadView("matches");
    } else {
      await this.renderMatches();
    }

    setTimeout(() => this.scrollToMatch(match.id), 120);
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

  groupRankLabel(rank) {
    const value = Number(rank);
    if (!value) return "—";
    return value === 1 ? "1er" : `${value}e`;
  },

  standingForTeam(match, side) {
    const teamId = match?.[`${side}_team_id`];
    if (!teamId) return null;
    return this.state.groupStandings.find((row) =>
      row.team_id === teamId &&
      (!match.competition_id || row.competition_id === match.competition_id) &&
      (!match.group_name || row.group_name === match.group_name)
    ) || null;
  },

  teamSideHtml(match, side) {
    const isRight = side === "away";
    const teamName = match[`${side}_team_name`];
    const standing = this.standingForTeam(match, side);
    const groupName = standing?.group_name || match.group_name;
    const rank = standing?.group_rank ? this.groupRankLabel(standing.group_rank) : null;
    const meta = match.is_test_match
      ? "Match test"
      : match.stage === "group" && groupName
        ? `${H.escapeHtml(groupName)}${rank ? ` · ${H.escapeHtml(rank)}` : ""}`
        : "";

    return `
      <div class="team-side ${isRight ? "right" : ""}">
        <span class="flag">${H.matchFlagHtml(match, side)}</span>
        <span class="team-name-stack ${isRight ? "right" : ""}">
          <strong>${H.escapeHtml(teamName)}</strong>
          ${meta ? `<small class="team-group-rank">${meta}</small>` : ""}
        </span>
      </div>
    `;
  },

  myPointsForMatch(matchId) {
    return this.state.visiblePredictions.find((row) => row.match_id === matchId && row.user_id === this.state.session.user.id) || null;
  },

  myPredictionInlineHtml(prediction) {
    if (!prediction) return "";
    return `
      <span class="my-prono-inline">
        <small>Ton prono</small>
        <strong>${prediction.home_score_pred} - ${prediction.away_score_pred}</strong>
      </span>
    `;
  },

  myPredictionResultHtml(match, prediction) {
    if (!prediction || match.status !== "finished") return "";
    const points = this.myPointsForMatch(match.id);
    const pointsText = match.is_test_match
      ? "Match test · hors classement"
      : points
        ? `${Number(points.points_total ?? 0)} pt${Number(points.points_total ?? 0) > 1 ? "s" : ""} · ${H.escapeHtml(this.predictionReasonLabel(points))}`
        : "Points en attente";

    return `
      <div class="my-prono-result finished">
        <div>
          <small>${match.is_test_match ? "Résultat test" : "Points gagnés"}</small>
          <strong>${pointsText}</strong>
        </div>
      </div>
    `;
  },

  matchCardHtml(match) {
    const myPrediction = this.getMyPrediction(match.id);
    const locked = H.isKickoffPassed(match.kickoff_at);
    const isFinalPhase = match.stage !== "group";
    const visiblePreds = this.predictionsForMatch(match.id);
    const canSeeOthers = locked;

    return `
      <article class="match-card ${match.status === "live" ? "live" : ""} ${match.is_test_match ? "test-match-card" : ""}" id="match-${H.escapeHtml(match.id)}">
        <div class="match-head">
          <div>
            <span class="pill ${match.status}">${H.statusLabel(match.status)}</span>
            ${match.is_test_match ? `<span class="pill warning test-match-pill">MATCH TEST</span>` : ""}
            ${match.stage !== "group" ? `<span class="pill neutral">${H.stageLabel(match.stage)}</span>` : ""}
          </div>
          <span class="match-time">${H.formatDateTime(match.kickoff_at)}</span>
        </div>

        <div class="score-board">
          ${this.teamSideHtml(match, "home")}
          <div class="official-score">${match.status === "finished" || match.status === "live" ? H.scoreText(match.home_score, match.away_score) : "vs"}</div>
          ${this.teamSideHtml(match, "away")}
        </div>

        <div class="match-meta">
          <span>${H.matchLocationHtml(match)}</span>
          <span class="match-tv-meta">${H.icon("tv")} ${H.tvChannelLogosHtml(match.tv_channel)}</span>
        </div>

        ${match.is_test_match ? `<div class="test-match-notice">${H.icon("info")} Match de préparation : il sert à tester le site. Il ne compte pas dans le classement Coupe du monde ni dans les exploits normaux.</div>` : ""}

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
            ${myPrediction ? this.myPredictionInlineHtml(myPrediction) : `<span class="muted">Aucun prono posé</span>`}
          </div>
          ${this.myPredictionResultHtml(match, myPrediction)}
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
    const achievementIdsBeforeSave = new Set(this.computeBadgesForUser(this.state.session.user.id).map((badge) => badge.id));

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
    await this.loadMiniRecordPredictionCounts().catch((refreshError) => {
      console.warn("Impossible de rafraîchir les compteurs mini-records", refreshError);
    });
    await this.loadVisiblePredictions().catch((refreshError) => {
      console.warn("Impossible de rafraîchir les pronos visibles avant l’annonce d’exploit", refreshError);
    });
    this.queueAchievementDiffFromSnapshot(achievementIdsBeforeSave);
    this.syncAchievementNotifications();
    this.scheduleAchievementResync([120, 700, 1800]);
    H.toast("Prono enregistré", "success");
    await this.loadView(this.state.currentView);
    this.syncAchievementNotifications();
    this.scheduleAchievementResync([300, 1200, 3500]);
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
    await Promise.all([this.loadMatches(), this.loadVisiblePredictions(), this.loadMiniRecordPredictionCounts(), this.loadWinnerPredictionsForTeams(), this.loadPlayerScoreRows()]);

    const root = H.$("#viewRoot");
    root.innerHTML = `
      <section class="achievement-hero-card">
        <div>
          <p class="eyebrow">${H.icon("star")} Le mur des exploits</p>
          <h2>Les belles chouetteries… et les casseroles du nid.</h2>
          <p class="muted">Débloque des exploits en pronostiquant, en revenant régulièrement et en marquant des points. Le nid garde l’œil ouvert.</p>
        </div>
      </section>

      <div class="segmented achievement-tabs">
        <button class="${this.state.achievementsTab === "mine" ? "active" : ""}" data-achievements-tab="mine">Mes exploits</button>
        <button class="${this.state.achievementsTab === "hall" ? "active" : ""}" data-achievements-tab="hall">Hall du nid</button>
        <button class="${this.state.achievementsTab === "records" ? "active" : ""}" data-achievements-tab="records">Mini-records</button>
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
    if (this.state.achievementsTab === "records") return this.renderAchievementRecords();
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
      <section class="card my-achievements-card">
        <div class="card-title-row">
          <div>
            <h3>Mes exploits</h3>
            <p class="muted">Neutres : ${neutral}. Les casseroles restent là pour chambrer gentiment.</p>
          </div>
        </div>
        ${badges.length ? `<div class="achievement-grid large">${badges.map((badge) => this.badgeCardHtml(badge, true)).join("")}</div>` : `<p class="muted">Aucun exploit pour l’instant. Premier prono validé, première coquille qui craque.</p>`}
      </section>
      ${this.featuredBadgePickerHtml(badges)}
    `;

    this.bindFeaturedBadgePicker(badges);
    this.bindAchievementReplay(root);
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
              <div class="badge-player-summary-main">
                ${H.profileBadgeHtml(this.visualProfile(row), "profile-badge leaderboard-badge")}
                <div>
                  <strong>#${index + 1} exploits — ${H.escapeHtml(row.pseudo)}</strong>
                  <small>${H.escapeHtml(row.office_team_name || "Sans team")} · ${badges.length} exploit${badges.length > 1 ? "s" : ""} · classement général #${row.rank}</small>
                  ${this.badgesPreviewHtml(row.user_id, 3, row)}
                </div>
              </div>
              <div class="points">${row.total_points || 0}<small>pts</small></div>
            </summary>
            ${this.badgesPanelHtml(row.user_id, { title: "Détail des exploits" })}
          </details>
        `).join("") : `<section class="card"><p class="muted">Aucun exploit pour le moment.</p></section>`}
      </div>
    `;
    this.bindAchievementReplay(root);
  },

  renderAchievementCatalog() {
    const root = H.$("#achievementsContent");
    const unlocked = new Set(this.computeBadgesForUser(this.state.session.user.id).map((badge) => badge.id));
    const catalog = this.badgeCatalog();
    const progression = catalog.filter((b) => b.category === "progression");
    const preparation = catalog.filter((b) => b.category === "preparation");
    const fidelity = catalog.filter((b) => b.category === "fidelity");
    const positives = catalog.filter((b) => b.type === "positive" && !["progression", "fidelity", "preparation"].includes(b.category));
    const negatives = catalog.filter((b) => b.type === "negative");
    const otherNeutral = catalog.filter((b) => b.type === "neutral" && !["progression", "fidelity", "preparation"].includes(b.category));

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
        </div>
      </section>
      ${block("Progression des pronos", progression)}
      ${preparation.length ? block("Matchs de préparation test", preparation) : ""}
      ${block("Fidélité au nid", fidelity)}
      ${otherNeutral.length ? block("Autres exploits", otherNeutral) : ""}
      ${block("Coups de maître", positives)}
      ${block("Casseroles du nid", negatives)}
    `;
    this.bindAchievementReplay(root);
  },

  playerRecordStats(userId) {
    const rows = this.scoreDetailRowsForUser(userId);
    const predictionRows = this.predictionRowsForUser(userId);
    const countRow = this.miniRecordPredictionCountRow(userId);
    const publicPredictionCount = Number(countRow?.prediction_count ?? NaN);
    const predictionCount = Number.isFinite(publicPredictionCount)
      ? Math.max(publicPredictionCount, predictionRows.length)
      : predictionRows.length;
    const totalPoints = rows.reduce((sum, { prediction }) => sum + Number(prediction.points_total || 0), 0);
    const exact = rows.filter(({ prediction }) => prediction.is_exact_score).length;
    const goodResults = rows.filter(({ prediction }) => prediction.is_good_result).length;
    const goodDiffs = rows.filter(({ prediction }) => prediction.is_good_goal_diff).length;
    const goodQualified = rows.filter(({ prediction }) => prediction.is_good_qualified).length;
    const zeros = rows.filter(({ prediction }) => Number(prediction.points_total || 0) === 0).length;
    const avg = rows.length ? totalPoints / rows.length : 0;
    const exactStreak = this.maxBooleanStreak(rows, ({ prediction }) => prediction.is_exact_score);
    const resultStreak = this.maxBooleanStreak(rows, ({ prediction }) => prediction.is_good_result);
    const zeroStreak = this.maxBooleanStreak(rows, ({ prediction }) => Number(prediction.points_total || 0) === 0);

    const dayMap = new Map();
    rows.forEach((row) => {
      const label = row.match?.stage === "group" && (row.match.pool_round || row.match.group_round)
        ? `Journée de poule ${row.match.pool_round || row.match.group_round}`
        : H.shortPoolRoundLabel(row.match) || "Phase";
      const current = dayMap.get(label) || { points: 0, exact: 0, rows: 0 };
      current.points += Number(row.prediction.points_total || 0);
      current.exact += row.prediction.is_exact_score ? 1 : 0;
      current.rows += 1;
      dayMap.set(label, current);
    });

    const bestDay = [...dayMap.entries()].reduce((best, [label, item]) => {
      if (!best || item.points > best.points) return { label, ...item };
      return best;
    }, null) || { label: "", points: 0, exact: 0, rows: 0 };

    return {
      totalPoints,
      average: avg,
      exact,
      goodResults,
      goodDiffs,
      goodQualified,
      zeros,
      predictionCount,
      scoredMatches: rows.length,
      exactStreak,
      resultStreak,
      zeroStreak,
      bestDayPoints: bestDay.points,
      bestDayLabel: bestDay.label,
      bestDayExact: bestDay.exact
    };
  },

  achievementRecordDefinitions() {
    return [
      { id: "record-points", title: "Grand-duc du classement", subtitle: "Plus gros total de points", icon: "trophy", value: (s) => s.totalPoints, unit: "pts" },
      { id: "record-average", title: "Moyenne de velours", subtitle: "Meilleure moyenne sur les matchs comptés", icon: "trend", value: (s) => s.average, unit: "pts/match", decimals: 2, minRows: 3 },
      { id: "record-exact", title: "Aimant à scores exacts", subtitle: "Plus grand nombre de scores exacts", icon: "target", value: (s) => s.exact, unit: "score(s) exact(s)" },
      { id: "record-results", title: "Collectionneur de victoires", subtitle: "Plus grand nombre de bons résultats", icon: "check", value: (s) => s.goodResults, unit: "bon(s) résultat(s)" },
      { id: "record-diffs", title: "Compas du nid", subtitle: "Plus grand nombre de bons écarts", icon: "trend", value: (s) => s.goodDiffs, unit: "bon(s) écart(s)" },
      { id: "record-qualified", title: "Gardien des qualifiés", subtitle: "Plus grand nombre de qualifiés trouvés", icon: "qualified", value: (s) => s.goodQualified, unit: "qualifié(s)" },
      { id: "record-day", title: "Journée stratosphérique", subtitle: "Plus gros score sur une journée ou phase", icon: "pool", value: (s) => s.bestDayPoints, unit: "pts", detail: (s) => s.bestDayLabel },
      { id: "record-exact-streak", title: "Série laser", subtitle: "Plus longue série de scores exacts", icon: "target", value: (s) => s.exactStreak, unit: "d’affilée" },
      { id: "record-result-streak", title: "Vol sans trou d’air", subtitle: "Plus longue série de bons résultats", icon: "check", value: (s) => s.resultStreak, unit: "d’affilée" },
      { id: "record-predictions", title: "Greffier du grimoire", subtitle: "Plus grand nombre de pronos validés", icon: "list", value: (s) => s.predictionCount, unit: "prono(s)" },
      { id: "record-zero", title: "Casserole dorée", subtitle: "Plus grand nombre de matchs à zéro point", icon: "badges", value: (s) => s.zeros, unit: "zéro(s)" },
      { id: "record-zero-streak", title: "Tunnel de brouillard", subtitle: "Plus longue série à zéro point", icon: "badges", value: (s) => s.zeroStreak, unit: "d’affilée" }
    ];
  },

  achievementRecordRows() {
    const source = this.state.playerScoreRows.length
      ? this.state.playerScoreRows
      : this.state.publicProfiles.map((profile) => ({ ...profile, user_id: profile.id }));

    return source
      .filter((row) => row.user_id || row.id)
      .map((row) => {
        const userId = row.user_id || row.id;
        return { row, userId, stats: this.playerRecordStats(userId) };
      });
  },

  formatRecordValue(value, record) {
    const num = Number(value || 0);
    const text = record.decimals ? num.toFixed(record.decimals) : String(Math.round(num * 10) / 10);
    return `${text} ${record.unit}`;
  },

  recordWinner(record, rows = this.achievementRecordRows()) {
    const eligible = rows
      .filter((item) => (record.minRows ? item.stats.scoredMatches >= record.minRows : true))
      .map((item) => ({ ...item, value: Number(record.value(item.stats) || 0) }))
      .filter((item) => item.value > 0)
      .map((item) => {
        const date = this.recordDateForUser(item.userId, record, item.stats, item.value);
        return {
          ...item,
          recordDate: date,
          recordTime: date ? date.getTime() : Number.POSITIVE_INFINITY
        };
      })
      .sort((a, b) =>
        b.value - a.value
        || a.recordTime - b.recordTime
        || String(a.row.pseudo || "").localeCompare(String(b.row.pseudo || ""), "fr")
      );

    const best = eligible[0] || null;
    const podium = eligible.slice(0, 3);
    const bestProfile = best ? this.profileForUser(best.userId, best.row) : null;
    const detail = best && record.detail ? record.detail(best.stats) : "";
    const date = best ? best.recordDate : null;

    return { record, eligible, best, podium, bestProfile, detail, date };
  },

  miniRecordBadgesForUser(userId) {
    const rows = this.achievementRecordRows();
    return this.achievementRecordDefinitions()
      .map((record) => this.recordWinner(record, rows))
      .filter((item) => item.best && String(item.best.userId) === String(userId))
      .map(({ record, best, detail, date }) => ({
        id: record.id,
        title: record.title,
        description: `${record.subtitle} · Détenteur actuel : ${this.formatRecordValue(best.value, record)}${detail ? ` · ${detail}` : ""}. Un seul joueur peut tenir ce mini-record à la fois.`,
        type: "neutral",
        category: "mini-record",
        icon: record.icon,
        isMiniRecord: true,
        unlockedAt: this.safeDate(date)
      }));
  },

  recordDateForUser(userId, record, stats = {}, value = 0) {
    const rows = this.scoreDetailRowsForUser(userId);

    // Greffier du grimoire : la date du trophée vient de Supabase.
    // Elle correspond au moment où le joueur a atteint son total actuel de pronos.
    // En cas d’égalité, le plus ancien record_unlocked_at conserve le trophée.
    if (record.id === "record-predictions") {
      const countRow = this.miniRecordPredictionCountRow(userId);
      const sqlRecordDate = this.safeDate(countRow?.record_unlocked_at || countRow?.latest_prediction_at || countRow?.first_prediction_at);
      if (sqlRecordDate) return sqlRecordDate;
      const predictions = this.predictionRowsForUser(userId);
      const prediction = predictions[Math.max(0, Math.ceil(value) - 1)] || predictions[predictions.length - 1];
      return prediction ? this.predictionActivityDate(prediction) : null;
    }

    const latestScoreDate = () => rows
      .map((row) => this.scoreRowResultDate(row))
      .filter(Boolean)
      .sort((a, b) => b - a)[0] || null;

    const dateWhenCountReached = (filteredRows = [], target = 1) => {
      const row = filteredRows[Math.max(0, Math.ceil(target) - 1)];
      return row ? this.scoreRowResultDate(row) : null;
    };

    if (!rows.length) {
      const predictions = this.predictionRowsForUser(userId);
      return predictions.map((row) => this.predictionActivityDate(row)).filter(Boolean).sort((a, b) => b - a)[0] || null;
    }

    if (record.id === "record-exact") return dateWhenCountReached(rows.filter(({ prediction }) => prediction.is_exact_score), value);
    if (record.id === "record-results") return dateWhenCountReached(rows.filter(({ prediction }) => prediction.is_good_result), value);
    if (record.id === "record-diffs") return dateWhenCountReached(rows.filter(({ prediction }) => prediction.is_good_goal_diff), value);
    if (record.id === "record-qualified") return dateWhenCountReached(rows.filter(({ prediction }) => prediction.is_good_qualified), value);
    if (record.id === "record-zero") return dateWhenCountReached(rows.filter(({ prediction }) => Number(prediction.points_total || 0) === 0), value);
    if (record.id === "record-exact-streak") return this.dateWhenBooleanStreakReached(rows, ({ prediction }) => prediction.is_exact_score, value);
    if (record.id === "record-result-streak") return this.dateWhenBooleanStreakReached(rows, ({ prediction }) => prediction.is_good_result, value);
    if (record.id === "record-zero-streak") return this.dateWhenBooleanStreakReached(rows, ({ prediction }) => Number(prediction.points_total || 0) === 0, value);
    if (record.id === "record-points") return this.dateWhenTotalPointsReached(rows, value) || latestScoreDate();
    if (record.id === "record-average") return this.dateWhenAverageReached(rows, record.minRows || 1, value) || latestScoreDate();
    if (record.id === "record-day" && stats.bestDayLabel) {
      const matchingRows = rows.filter((row) => {
        const label = row.match?.stage === "group" && (row.match.pool_round || row.match.group_round)
          ? `Journée de poule ${row.match.pool_round || row.match.group_round}`
          : H.shortPoolRoundLabel(row.match) || "Phase";
        return label === stats.bestDayLabel;
      });
      return matchingRows.map((row) => this.scoreRowResultDate(row)).filter(Boolean).sort((a, b) => b - a)[0] || latestScoreDate();
    }

    return latestScoreDate();
  },

  formatRecordDateLabel(date) {
    return date ? H.formatDateTime(date) : "Date à confirmer";
  },

  recordCardHtml(record, rows = []) {
    const { best, podium, bestProfile, detail, date } = this.recordWinner(record, rows);
    const popupAttrs = best ? `data-record-popup-id="${H.escapeHtml(record.id)}" role="button" tabindex="0" title="Voir le détail du mini-record"` : "";

    return `
      <article class="record-card ${best ? "has-record record-card-clickable" : "empty-record"}" ${popupAttrs}>
        <div class="record-card-head">
          ${this.recordArtHtml(record)}
          <div>
            <strong>${H.escapeHtml(record.title)}</strong>
            <small>${H.escapeHtml(record.subtitle)}</small>
          </div>
        </div>
        ${best ? `
          <div class="record-winner">
            ${H.profileBadgeHtml(bestProfile, "profile-badge leaderboard-badge")}
            <div>
              <span>${H.escapeHtml(bestProfile.pseudo)}</span>
              <strong>${H.escapeHtml(this.formatRecordValue(best.value, record))}</strong>
              <small>${H.escapeHtml(bestProfile.office_team_name || "Sans team")}</small>
              ${detail ? `<small>${H.escapeHtml(detail)}</small>` : ""}
              <small>${H.icon("time")} ${H.escapeHtml(this.formatRecordDateLabel(date))}</small>
            </div>
          </div>
          <div class="record-podium">
            ${podium.map((item, index) => {
              const profile = this.profileForUser(item.userId, item.row);
              return `<span><b>#${index + 1}</b> ${H.escapeHtml(profile.pseudo)} <em>${H.escapeHtml(this.formatRecordValue(item.value, record))}</em></span>`;
            }).join("")}
          </div>
        ` : `<p class="muted">Pas encore assez de données pour ce mini-record.</p>`}
      </article>
    `;
  },

  homeRecordCarouselHtml() {
    const rows = this.achievementRecordRows();
    const highlights = this.achievementRecordDefinitions()
      .map((record) => this.recordWinner(record, rows))
      .filter((item) => item.best && item.bestProfile);

    if (!highlights.length) {
      return `
        <section class="card home-record-carousel-card empty-record-carousel">
          <div class="card-title-row">
            <div>
              <p class="eyebrow">${H.icon("badges")} Mini-records du nid</p>
              <h3>Le tableau des petits exploits arrive</h3>
              <p class="muted">Dès que les premiers matchs seront comptabilisés, les détenteurs de mini-records défileront ici.</p>
            </div>
          </div>
        </section>
      `;
    }

    return `
      <section class="card home-record-carousel-card">
        <div class="card-title-row compact-title-row">
          <div>
            <p class="eyebrow">${H.icon("badges")} Mini-records du nid</p>
            <h3>Les chouettes qui tiennent un record</h3>
            <p class="muted">Un seul détenteur par mini-record : si quelqu’un passe devant, le trophée change de perchoir.</p>
          </div>
          <button class="ghost-btn" id="homeRecordsBtn" type="button">Voir tous</button>
        </div>
        <div class="home-record-carousel" data-home-record-carousel aria-live="polite">
          ${highlights.map((item, index) => {
            const { record, best, bestProfile, detail, date } = item;
            return `
              <article class="home-record-slide ${index === 0 ? "active" : ""}" data-home-record-slide data-record-popup-id="${H.escapeHtml(record.id)}" role="button" tabindex="0" title="Voir le détail du mini-record">
                <div class="home-record-art">${this.recordArtHtml(record)}</div>
                <div class="home-record-main">
                  <small class="home-record-label">${H.escapeHtml(record.title)}</small>
                  <strong>${H.escapeHtml(bestProfile.pseudo)}</strong>
                  <span>${H.escapeHtml(bestProfile.office_team_name || "Sans team")}</span>
                  <p>${H.escapeHtml(this.formatRecordValue(best.value, record))}${detail ? ` · ${H.escapeHtml(detail)}` : ""}</p>
                </div>
                <div class="home-record-date">
                  ${H.icon("time")}
                  <span>${H.escapeHtml(this.formatRecordDateLabel(date))}</span>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  },

  bindHomeRecordCarousel(root = document) {
    this.clearHomeRecordCarousel();
    const slides = H.$$('[data-home-record-slide]', root);
    if (!slides.length) return;

    let index = Math.max(0, slides.findIndex((slide) => slide.classList.contains("active")));
    const show = (nextIndex) => {
      index = (nextIndex + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => slide.classList.toggle("active", slideIndex === index));
    };

    slides.forEach((slide) => {
      const open = () => this.showRecordPopup(slide.dataset.recordPopupId);
      slide.addEventListener("click", open);
      slide.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });

    if (slides.length > 1) {
      this.state.homeRecordCarouselTimer = window.setInterval(() => show(index + 1), 10000);
    }
  },

  bindRecordPopups(root = document) {
    H.$$('[data-record-popup-id]', root).forEach((card) => {
      if (card.dataset.recordPopupBound === "true") return;
      card.dataset.recordPopupBound = "true";
      const open = () => this.showRecordPopup(card.dataset.recordPopupId);
      card.addEventListener("click", (event) => {
        if (event.target.closest("button, a, input, select, textarea")) return;
        open();
      });
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  },

  showRecordPopup(recordId) {
    const record = this.achievementRecordDefinitions().find((item) => item.id === recordId);
    if (!record) return;
    const item = this.recordWinner(record);
    if (!item.best || !item.bestProfile) return;

    H.$("#recordDetailModal")?.remove();
    const { best, bestProfile, detail, date, podium } = item;
    const modal = document.createElement("div");
    modal.id = "recordDetailModal";
    modal.className = "modal-backdrop achievement-unlock-modal record-detail-modal";
    modal.innerHTML = `
      <div class="modal-card achievement-unlock-card record-detail-card" role="dialog" aria-modal="true" aria-labelledby="recordDetailTitle">
        <button class="modal-x-btn" id="closeRecordDetailXBtn" type="button" aria-label="Fermer">×</button>
        <div class="magic-confetti" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>
        <div class="achievement-unlock-glow" aria-hidden="true"></div>
        <p class="eyebrow achievement-unlock-kicker">Mini-record du nid</p>
        <div class="achievement-unlock-art record-unlock-art">${this.recordArtHtml(record)}</div>
        <h2 id="recordDetailTitle">${H.escapeHtml(record.title)}</h2>
        <p class="achievement-unlock-headline">${H.escapeHtml(record.subtitle)} 🦉✨</p>
        <div class="record-detail-winner">
          ${H.profileBadgeHtml(bestProfile, "profile-badge leader")}
          <div>
            <strong>${H.escapeHtml(bestProfile.pseudo)}</strong>
            <span>${H.escapeHtml(bestProfile.office_team_name || "Sans team")}</span>
          </div>
        </div>
        <p class="record-detail-score"><strong>${H.escapeHtml(this.formatRecordValue(best.value, record))}</strong>${detail ? ` <span>· ${H.escapeHtml(detail)}</span>` : ""}</p>
        <p class="achievement-unlock-date">${H.icon("time")} Date : ${H.escapeHtml(this.formatRecordDateLabel(date))}</p>
        <div class="record-detail-podium">
          <strong class="record-detail-podium-title">Classement de ce mini-record · Top 3</strong>
          ${podium.map((row, index) => {
            const profile = this.profileForUser(row.userId, row.row);
            return `<span><b>#${index + 1}</b> ${H.escapeHtml(profile.pseudo)} <em>${H.escapeHtml(this.formatRecordValue(row.value, record))}</em></span>`;
          }).join("")}
        </div>
        <div class="achievement-unlock-actions">
          <small>Le grimoire des mini-records est à jour.</small>
          <button class="primary-btn" id="closeRecordDetailBtn" type="button">Fermer</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    H.$("#closeRecordDetailBtn", modal)?.addEventListener("click", close);
    H.$("#closeRecordDetailXBtn", modal)?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    H.$("#closeRecordDetailBtn", modal)?.focus();
  },

  renderAchievementRecords() {
    const root = H.$("#achievementsContent");
    const rows = this.achievementRecordRows();
    const records = this.achievementRecordDefinitions();

    root.innerHTML = `
      <section class="toolbar-card compact-toolbar records-hero-card">
        <div>
          <p class="eyebrow">${H.icon("badges")} Mini-records du nid</p>
          <h3>Les petites couronnes et les grosses casseroles</h3>
          <p class="muted">Des records vivants calculés sur tous les joueurs. Un seul détenteur par mini-record : si le record tombe, le trophée change de main.</p>
        </div>
      </section>
      <div class="record-grid">
        ${records.map((record) => this.recordCardHtml(record, rows)).join("")}
      </div>
    `;
    this.bindRecordPopups(root);
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

    const grouped = (data || [])
      .filter((row) => String(row.group_name || "").toLowerCase() !== "préparation")
      .reduce((acc, row) => {
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
    const finals = this.state.matches
      .filter((m) => m.stage !== "group")
      .sort((a, b) => this.finalBracketSortValue(a) - this.finalBracketSortValue(b));

    const byStage = this.finalBracketStages(finals);
    const totalFinalMatches = Object.values(byStage).reduce((sum, rows) => sum + rows.length, 0);

    root.innerHTML = `
      <section class="toolbar-card compact-toolbar worldcup-final-toolbar">
        <div>
          <h3>Phase finale</h3>
          <p class="muted">Un vrai tableau visuel : les seizièmes partent des ailes, puis le nid converge vers la grande finale.</p>
        </div>
        <div class="final-bracket-toolbar-actions">
          <button class="ghost-btn final-scroll-btn" type="button" data-final-scroll="left" aria-label="Voir la partie gauche">←</button>
          <span class="pill neutral">${totalFinalMatches} match${totalFinalMatches > 1 ? "s" : ""}</span>
          <button class="ghost-btn final-scroll-btn" type="button" data-final-scroll="right" aria-label="Voir la partie droite">→</button>
        </div>
      </section>
      ${totalFinalMatches ? this.finalBracketHtml(byStage) : `<section class="card"><p class="muted">Aucune phase finale à afficher pour le moment.</p></section>`}
    `;
    this.bindFinalBracketDrag();
    this.bindFinalBracketControls();
  },

  bindFinalBracketDrag() {
    const scroller = H.$("#finalBracketScroll");
    if (!scroller || scroller.dataset.dragBound === "true") return;
    scroller.dataset.dragBound = "true";

    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;

    const stop = () => {
      isDown = false;
      scroller.classList.remove("is-dragging");
    };

    scroller.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, a, input, select, textarea")) return;
      isDown = true;
      startX = event.clientX;
      startScrollLeft = scroller.scrollLeft;
      scroller.classList.add("is-dragging");
      scroller.setPointerCapture?.(event.pointerId);
    });

    scroller.addEventListener("pointermove", (event) => {
      if (!isDown) return;
      event.preventDefault();
      scroller.scrollLeft = startScrollLeft - (event.clientX - startX);
    });

    scroller.addEventListener("pointerup", stop);
    scroller.addEventListener("pointercancel", stop);
    scroller.addEventListener("mouseleave", stop);
  },

  bindFinalBracketControls() {
    const scroller = H.$("#finalBracketScroll");
    if (!scroller) return;
    H.$$('[data-final-scroll]').forEach((button) => {
      if (button.dataset.finalScrollBound === "true") return;
      button.dataset.finalScrollBound = "true";
      button.addEventListener("click", () => {
        const direction = button.dataset.finalScroll === "left" ? -1 : 1;
        const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        const target = direction < 0 ? 0 : maxLeft;
        scroller.scrollTo({ left: target, behavior: "smooth" });
      });
    });
  },

  finalBracketSortValue(match) {
    const stageOrder = {
      round_of_32: 1,
      round_of_16: 2,
      quarter_final: 3,
      semi_final: 4,
      third_place: 5,
      final: 6
    };
    const kickoff = match?.kickoff_at ? new Date(match.kickoff_at).getTime() : 0;
    return ((stageOrder[match?.stage] || 99) * 10000000000000) + kickoff;
  },

  finalBracketStages(finals = []) {
    const stages = {
      round_of_32: [],
      round_of_16: [],
      quarter_final: [],
      semi_final: [],
      third_place: [],
      final: []
    };

    finals.forEach((match) => {
      if (stages[match.stage]) stages[match.stage].push(match);
    });

    Object.keys(stages).forEach((key) => {
      stages[key] = stages[key].sort((a, b) => new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0));
    });

    return stages;
  },

  splitBracketSide(matches = []) {
    const midpoint = Math.ceil(matches.length / 2);
    return [matches.slice(0, midpoint), matches.slice(midpoint)];
  },

  finalBracketHtml(byStage) {
    const [r32Left, r32Right] = this.splitBracketSide(byStage.round_of_32);
    const [r16Left, r16Right] = this.splitBracketSide(byStage.round_of_16);
    const [qfLeft, qfRight] = this.splitBracketSide(byStage.quarter_final);
    const [sfLeft, sfRight] = this.splitBracketSide(byStage.semi_final);
    const finalMatch = byStage.final[0];
    const thirdPlaceMatch = byStage.third_place[0];

    return `
      <section class="final-bracket-shell draggable-bracket" id="finalBracketScroll" aria-label="Tableau de la phase finale" tabindex="0">
        <div class="final-bracket-ribbon ribbon-left-a"></div>
        <div class="final-bracket-ribbon ribbon-left-b"></div>
        <div class="final-bracket-ribbon ribbon-right-a"></div>
        <div class="final-bracket-ribbon ribbon-right-b"></div>

        <div class="final-bracket-side final-bracket-side-left">
          ${this.finalBracketColumnHtml("Seizièmes", r32Left, "round32")}
          ${this.finalBracketColumnHtml("Huitièmes", r16Left, "round16")}
          ${this.finalBracketColumnHtml("Quarts", qfLeft, "quarter")}
          ${this.finalBracketColumnHtml("Demi-finale", sfLeft, "semi")}
        </div>

        <div class="final-bracket-center">
          <div class="final-bracket-cup-card">
            <span class="final-bracket-cup-emoji" aria-hidden="true">🏆</span>
            <strong>Finale</strong>
            <small>Le sommet du nid</small>
          </div>
          ${finalMatch ? this.finalBracketMatchHtml(finalMatch, "final-main", "Grande finale") : this.finalBracketPlaceholderHtml("Grande finale")}
          ${thirdPlaceMatch ? this.finalBracketMatchHtml(thirdPlaceMatch, "third-place", "Petite finale") : this.finalBracketPlaceholderHtml("Petite finale")}
        </div>

        <div class="final-bracket-side final-bracket-side-right">
          ${this.finalBracketColumnHtml("Demi-finale", sfRight, "semi")}
          ${this.finalBracketColumnHtml("Quarts", qfRight, "quarter")}
          ${this.finalBracketColumnHtml("Huitièmes", r16Right, "round16")}
          ${this.finalBracketColumnHtml("Seizièmes", r32Right, "round32")}
        </div>
      </section>
    `;
  },

  finalBracketColumnHtml(title, matches = [], sizeClass = "") {
    const emptyCount = Math.max(0, this.expectedFinalStageCount(title, matches.length) - matches.length);
    return `
      <div class="final-bracket-column ${sizeClass}">
        <div class="final-bracket-stage-title">${H.escapeHtml(title)}</div>
        <div class="final-bracket-match-stack">
          ${matches.map((match) => this.finalBracketMatchHtml(match)).join("")}
          ${Array.from({ length: emptyCount }).map(() => this.finalBracketPlaceholderHtml(title)).join("")}
        </div>
      </div>
    `;
  },

  expectedFinalStageCount(title, currentCount = 0) {
    const labels = {
      "Seizièmes": 8,
      "Huitièmes": 4,
      "Quarts": 2,
      "Demi-finale": 1
    };
    return Math.min(labels[title] || currentCount, Math.max(labels[title] || currentCount, currentCount));
  },

  finalBracketMatchHtml(match, extraClass = "", customTitle = "") {
    const isScored = match.status === "finished" || match.status === "live";
    const score = isScored ? H.scoreText(match.home_score, match.away_score) : "vs";
    const title = customTitle || H.stageLabel(match.stage);
    const date = H.formatDateTime(match.kickoff_at);
    const location = [match.city, match.venue].filter(Boolean).join(" · ");
    const home = match.home_team_name || "À déterminer";
    const away = match.away_team_name || "À déterminer";

    return `
      <article class="final-bracket-match ${match.status || "scheduled"} ${extraClass}">
        <div class="final-bracket-match-head">
          <span>${H.escapeHtml(title)}</span>
          <small>${H.escapeHtml(date)}</small>
        </div>
        <div class="final-bracket-match-body">
          <div class="final-bracket-team">
            ${H.matchFlagHtml(match, "home")}
            <strong>${H.escapeHtml(home)}</strong>
          </div>
          <span class="final-bracket-score">${H.escapeHtml(score)}</span>
          <div class="final-bracket-team away">
            ${H.matchFlagHtml(match, "away")}
            <strong>${H.escapeHtml(away)}</strong>
          </div>
        </div>
        <div class="final-bracket-match-foot muted">
          ${location ? `<span>${H.escapeHtml(location)}</span>` : `<span>Lieu à confirmer</span>`}
          <span class="final-bracket-tv">${H.icon("tv")} ${H.tvChannelLogosHtml(match.tv_channel, "tv-logo-strip final-tv-strip")}</span>
        </div>
      </article>
    `;
  },

  finalBracketPlaceholderHtml(title = "Match") {
    return `
      <article class="final-bracket-match placeholder">
        <div class="final-bracket-match-head">
          <span>${H.escapeHtml(title)}</span>
          <small>À confirmer</small>
        </div>
        <div class="final-bracket-match-body">
          <div class="final-bracket-team"><span class="flag-mini placeholder-flag"></span><strong>À déterminer</strong></div>
          <span class="final-bracket-score">vs</span>
          <div class="final-bracket-team away"><span class="flag-mini placeholder-flag"></span><strong>À déterminer</strong></div>
        </div>
      </article>
    `;
  },

  async renderLeaderboard() {
    await Promise.all([this.loadMatches(), this.loadVisiblePredictions(), this.loadPublicProfiles()]);

    const root = H.$("#viewRoot");
    const tab = ["players", "team", "evolution"].includes(this.state.leaderboardTab) ? this.state.leaderboardTab : "players";
    this.state.leaderboardTab = tab;
    root.innerHTML = `
      <section class="toolbar-card leaderboard-hero-card">
        <div>
          <p class="eyebrow">${H.icon("trophy")} Le perchoir des scores</p>
          <h2>Classements</h2>
        </div>
      </section>

      <div class="segmented leaderboard-tabs leaderboard-main-tabs">
        <button class="${tab === "players" ? "active" : ""}" data-leaderboard-tab="players">Classement joueurs</button>
        <button class="${tab === "team" ? "active" : ""}" data-leaderboard-tab="team">Teams bureau</button>
        <button class="${tab === "evolution" ? "active" : ""}" data-leaderboard-tab="evolution">Évolution</button>
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
    if (this.state.leaderboardTab === "players") return this.renderPlayerLeaderboard();
    if (this.state.leaderboardTab === "team") return this.renderTeamLeaderboard();
    if (this.state.leaderboardTab === "evolution") return this.renderLeaderboardEvolution();
    return this.renderPlayerLeaderboard();
  },

  async renderPlayerLeaderboard() {
    const root = H.$("#leaderboardContent");
    const mode = this.state.playerLeaderboardMode === "phase" ? "phase" : "overall";
    this.state.playerLeaderboardMode = mode;

    root.innerHTML = `
      <section class="card player-leaderboard-card">
        <div class="card-title-row leaderboard-compact-title">
          <div>
            <h3>Classement joueurs</h3>
          </div>
        </div>
        <div class="segmented small player-leaderboard-mode">
          <button class="${mode === "overall" ? "active" : ""}" type="button" data-player-leaderboard-mode="overall">Général</button>
          <button class="${mode === "phase" ? "active" : ""}" type="button" data-player-leaderboard-mode="phase">Par phase</button>
        </div>
        <div id="playerLeaderboardRows"></div>
      </section>
    `;

    H.$$('[data-player-leaderboard-mode]', root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.playerLeaderboardMode = btn.dataset.playerLeaderboardMode;
        await this.renderPlayerLeaderboard();
      });
    });

    if (mode === "phase") {
      await this.renderPoolRoundLeaderboard("#playerLeaderboardRows");
    } else {
      await this.renderOverallLeaderboard("#playerLeaderboardRows");
    }
  },

  scoreDetailRowsForUser(userId, filters = {}) {
    const includeTest = Boolean(filters.includeTest || (filters.matchIds && filters.matchIds.length));
    return this.state.visiblePredictions
      .filter((p) => p.user_id === userId && p.points_total !== null && p.points_total !== undefined)
      .map((p) => {
        const match = this.state.matches.find((m) => m.id === p.match_id);
        return { prediction: p, match };
      })
      .filter(({ match }) => match
        && match.status === "finished"
        && (includeTest || !match.is_test_match)
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

  safeDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  },

  matchResultDate(match = {}) {
    return this.safeDate(match.finished_at || match.completed_at || match.updated_at || match.kickoff_at);
  },

  scoreRowResultDate(row = {}) {
    return this.matchResultDate(row.match) || this.predictionActivityDate(row.prediction);
  },

  firstScoreRowDate(rows = []) {
    for (const row of rows) {
      const date = this.scoreRowResultDate(row);
      if (date) return date;
    }
    return null;
  },

  nthScoreRowDate(rows = [], n = 1) {
    const row = rows[Math.max(0, n - 1)];
    return row ? this.scoreRowResultDate(row) : null;
  },

  predictionDateAt(predictions = [], n = 1) {
    const row = predictions[Math.max(0, n - 1)];
    return row ? this.predictionActivityDate(row) : null;
  },

  dateWhenBooleanStreakReached(items = [], predicate, target = 1, dateSelector = (item) => this.scoreRowResultDate(item)) {
    let current = 0;
    for (const item of items) {
      if (predicate(item)) {
        current += 1;
        if (current >= target) return dateSelector(item);
      } else {
        current = 0;
      }
    }
    return null;
  },

  dateWhenTotalPointsReached(rows = [], threshold = 0) {
    let total = 0;
    for (const row of rows) {
      total += Number(row.prediction?.points_total || 0);
      if (total >= threshold) return this.scoreRowResultDate(row);
    }
    return null;
  },

  dateWhenAverageReached(rows = [], minRows = 1, threshold = 0) {
    let total = 0;
    for (let index = 0; index < rows.length; index += 1) {
      total += Number(rows[index].prediction?.points_total || 0);
      const count = index + 1;
      if (count >= minRows && total / count >= threshold) return this.scoreRowResultDate(rows[index]);
    }
    return null;
  },

  dateWhenActiveDaysReached(dates = [], target = 1) {
    const byDay = new Map();
    dates.forEach((date) => {
      const key = this.localDayKey(date);
      const previous = byDay.get(key);
      if (!previous || date < previous) byDay.set(key, date);
    });
    const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
    return days[target - 1]?.[1] || null;
  },

  dateWhenConsecutiveDaysReached(dates = [], target = 1) {
    const byDay = new Map();
    dates.forEach((date) => {
      const key = this.localDayKey(date);
      const previous = byDay.get(key);
      if (!previous || date < previous) byDay.set(key, date);
    });

    const days = [...byDay.entries()]
      .map(([key, date]) => ({ key, date, midnight: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() }))
      .sort((a, b) => a.midnight - b.midnight);

    let current = 0;
    let previous = null;
    const oneDay = 24 * 60 * 60 * 1000;

    for (const day of days) {
      current = previous !== null && day.midnight - previous === oneDay ? current + 1 : 1;
      if (current >= target) return day.date;
      previous = day.midnight;
    }

    return null;
  },

  outcomeFromScores(home, away) {
    if (home > away) return "home";
    if (home < away) return "away";
    return "draw";
  },

  finalMatch() {
    return this.state.matches.find((match) => match.stage === "final" && match.status === "finished")
      || this.state.matches.find((match) => match.stage === "final")
      || null;
  },

  winnerPredictionForUser(userId) {
    const fromPublicView = this.state.winnerPredictions.find((row) =>
      row.user_id === userId
      && (!this.state.activeCompetition?.id || row.competition_id === this.state.activeCompetition.id)
    );

    if (fromPublicView) return fromPublicView;

    if (userId === this.state.session?.user?.id && this.state.winnerPrediction?.predicted_team_id) {
      const final = this.finalMatch();
      const predictedTeam = this.state.footballTeams.find((team) => team.id === this.state.winnerPrediction.predicted_team_id);
      return {
        ...this.state.winnerPrediction,
        predicted_team_name: predictedTeam?.name || this.state.winnerPrediction.predicted_team_name,
        competition_id: this.state.winnerPrediction.competition_id,
        points_total: final?.status === "finished" && final?.winner_team_id === this.state.winnerPrediction.predicted_team_id ? 100 : 0
      };
    }

    return null;
  },

  championGroupExitDate(winnerPick) {
    const predictedTeamId = winnerPick?.predicted_team_id;
    if (!predictedTeamId) return null;

    const competitionId = winnerPick.competition_id || this.state.activeCompetition?.id || null;
    const standing = this.state.groupStandings.find((row) =>
      row.team_id === predictedTeamId
      && (!competitionId || row.competition_id === competitionId)
    );

    if (!standing || standing.qualification_status !== "eliminated") return null;

    const groupMatches = this.state.matches.filter((match) =>
      match.stage === "group"
      && (!competitionId || match.competition_id === competitionId)
      && (!standing.group_name || match.group_name === standing.group_name)
    );

    const allGroupMatches = this.state.matches.filter((match) =>
      match.stage === "group"
      && (!competitionId || match.competition_id === competitionId)
    );

    const allGroupsFinished = allGroupMatches.length > 0
      && allGroupMatches.every((match) => match.status === "finished");

    if (!allGroupsFinished) return null;

    const dates = (groupMatches.length ? groupMatches : allGroupMatches)
      .map((match) => this.matchResultDate(match))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime());

    return dates[0] || null;
  },

  badgeCatalog() {
    return [
      { id: "egg-hatched", title: "Éclos de l’œuf", description: "Premier prono validé. La coquille craque, la mini-chouette débarque.", type: "neutral", category: "progression" },
      { id: "young-feathers", title: "Jeune plumage", description: "10 pronos validés. Ça commence à ressembler à une vraie couvée.", type: "neutral", category: "progression" },
      { id: "half-nest", title: "Mi-nid rempli", description: "La moitié des pronos sont rentrés. Le nid n’est plus vide, loin de là.", type: "neutral", category: "progression" },
      { id: "three-quarter-perch", title: "Perchoir presque plein", description: "75 % des pronos sont posés. Les branches commencent à craquer.", type: "neutral", category: "progression" },
      { id: "all-picks-in", title: "Couvée complète", description: "Tous les pronos disponibles sont validés. Le nid est verrouillé, rideau.", type: "neutral", category: "progression" },

      { id: "preparation-two-picks", title: "Préparation du nid", description: "Les 2 matchs de préparation test ont été pronostiqués. Le nid vérifie que tout fonctionne avant le grand envol.", type: "neutral", category: "preparation" },
      { id: "prep-good-pick", title: "Test concluant", description: "Au moins 1 match de préparation a été bien pronostiqué. Ce badge ne compte pas pour le vrai classement, il valide juste le radar.", type: "positive", category: "preparation" },

      { id: "night-owl", title: "Chouette de la nuit", description: "Un prono posé entre minuit et 6 h. Même les chauves-souris ont applaudi.", type: "neutral", category: "fidelity" },
      { id: "three-day-ritual", title: "Rituel du perchoir", description: "Des pronos posés 3 jours d’affilée. Petite routine, gros sérieux.", type: "neutral", category: "fidelity" },
      { id: "seven-day-streak", title: "Sept jours sur la branche", description: "7 jours d’affilée avec une activité de prono. Là, c’est de la fidélité de compétition.", type: "neutral", category: "fidelity" },
      { id: "many-active-days", title: "Toujours au nid", description: "14 jours différents avec au moins une activité de prono. Le nid a ton empreinte dans le bois.", type: "neutral", category: "fidelity" },
      { id: "last-wingbeat", title: "Dernier battement d’aile", description: "Un prono ajusté dans les 2 heures avant le coup d’envoi. Frisson, sueur, validation.", type: "neutral", category: "fidelity" },

      { id: "final-winner-oracle", title: "Oracle de la finale", description: "L’équipe choisie championne avant le départ gagne réellement la Coupe. Là, le nid sort les confettis.", type: "neutral" },
      { id: "bus-stuck", title: "Descente du bus impossible", description: "L’équipe désignée championne reste bloquée en phase de groupes. Le bus a calé avant la sortie des poules.", type: "negative" },
      { id: "final-perfect-score", title: "Finale millimétrée", description: "Score exact trouvé sur la finale. Une plume, une règle, zéro tremblement.", type: "neutral" },
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
    const predictionRows = this.predictionRowsForUser(userId);
    const prepMatches = this.preparationMatches();
    const prepPredictionRows = this.predictionRowsForUser(userId, { includeTest: true })
      .filter((prediction) => this.isPreparationMatch(prediction.match_id));
    const prepPredictionIds = new Set(prepPredictionRows.map((prediction) => prediction.match_id));
    const prepFinishedRows = prepMatches
      .filter((match) => match.status === "finished")
      .map((match) => ({
        match,
        prediction: prepPredictionRows.find((prediction) => prediction.match_id === match.id)
      }))
      .filter(({ prediction }) => prediction);
    const prepGoodRows = prepFinishedRows.filter(({ match, prediction }) => {
      const pred = this.outcomeFromScores(prediction.home_score_pred, prediction.away_score_pred);
      const real = this.outcomeFromScores(match.home_score, match.away_score);
      return pred === real;
    });
    const earlyWinnerPick = this.winnerPredictionForUser(userId);

    if (!rows.length && !predictionRows.length && !prepPredictionRows.length && !earlyWinnerPick?.predicted_team_id) return [];

    const exact = rows.filter(({ prediction }) => prediction.is_exact_score).length;
    const goodResults = rows.filter(({ prediction }) => prediction.is_good_result).length;
    const goodDiffs = rows.filter(({ prediction }) => prediction.is_good_goal_diff).length;
    const goodQualified = rows.filter(({ prediction }) => prediction.is_good_qualified).length;
    const zeros = rows.filter(({ prediction }) => Number(prediction.points_total || 0) === 0).length;
    const totalPoints = rows.reduce((sum, { prediction }) => sum + Number(prediction.points_total || 0), 0);
    const avg = rows.length ? totalPoints / rows.length : 0;

    const exactRows = rows.filter(({ prediction }) => prediction.is_exact_score);
    const goodResultRows = rows.filter(({ prediction }) => prediction.is_good_result);
    const goodDiffRows = rows.filter(({ prediction }) => prediction.is_good_goal_diff);
    const zeroRows = rows.filter(({ prediction }) => Number(prediction.points_total || 0) === 0);

    const exactStreak = this.maxBooleanStreak(rows, ({ prediction }) => prediction.is_exact_score);
    const zeroStreak = this.maxBooleanStreak(rows, ({ prediction }) => Number(prediction.points_total || 0) === 0);
    const resultStreak = this.maxBooleanStreak(rows, ({ prediction }) => prediction.is_good_result);

    const reversePickRows = rows.filter(({ prediction, match }) => {
      const pred = this.outcomeFromScores(prediction.home_score_pred, prediction.away_score_pred);
      const real = this.outcomeFromScores(match.home_score, match.away_score);
      return (pred === "home" && real === "away") || (pred === "away" && real === "home");
    });
    const reversePicks = reversePickRows.length;

    const bustedDrawRows = rows.filter(({ prediction, match }) => {
      const pred = this.outcomeFromScores(prediction.home_score_pred, prediction.away_score_pred);
      const real = this.outcomeFromScores(match.home_score, match.away_score);
      return pred === "draw" && real !== "draw";
    });
    const bustedDraws = bustedDrawRows.length;

    const correctDrawRows = rows.filter(({ prediction, match }) => {
      const pred = this.outcomeFromScores(prediction.home_score_pred, prediction.away_score_pred);
      const real = this.outcomeFromScores(match.home_score, match.away_score);
      return pred === "draw" && real === "draw";
    });
    const correctDraws = correctDrawRows.length;

    const perfectKnockoutRows = rows.filter(({ prediction, match }) =>
      match.stage !== "group" && prediction.is_exact_score && prediction.is_good_qualified
    );
    const perfectKnockouts = perfectKnockoutRows.length;

    const wrongQualifiedRows = rows.filter(({ prediction, match }) =>
      match.stage !== "group"
      && prediction.qualified_team_pred
      && match.winner_team_id
      && prediction.qualified_team_pred !== match.winner_team_id
    );
    const wrongQualified = wrongQualifiedRows.length;

    const smallExactScoreRows = rows.filter(({ prediction, match }) =>
      prediction.is_exact_score && Math.abs(Number(match.home_score) - Number(match.away_score)) === 1
    );
    const smallExactScores = smallExactScoreRows.length;

    const highExactScoreRows = rows.filter(({ prediction, match }) =>
      prediction.is_exact_score && Number(match.home_score || 0) + Number(match.away_score || 0) >= 5
    );
    const highExactScores = highExactScoreRows.length;

    const bigWrongWayRows = rows.filter(({ prediction, match }) => {
      const pred = this.outcomeFromScores(prediction.home_score_pred, prediction.away_score_pred);
      const real = this.outcomeFromScores(match.home_score, match.away_score);
      const predDiff = Number(prediction.home_score_pred) - Number(prediction.away_score_pred);
      const realDiff = Number(match.home_score) - Number(match.away_score);
      return pred !== real && Math.abs(predDiff) >= 3 && Math.sign(predDiff) !== Math.sign(realDiff);
    });
    const bigWrongWay = bigWrongWayRows.length;

    const round16GoodRows = rows.filter(({ prediction, match }) =>
      match.stage === "round_of_16" && Number(prediction.points_total || 0) >= 3
    );
    const round16Good = round16GoodRows.length;

    const knockoutQualifiedNoExactRows = rows.filter(({ prediction, match }) =>
      match.stage !== "group" && prediction.is_good_qualified && !prediction.is_exact_score
    );
    const knockoutQualifiedNoExact = knockoutQualifiedNoExactRows.length;

    const comebackDate = (() => {
      let zeroRun = 0;
      for (const row of rows) {
        if (Number(row.prediction.points_total || 0) === 0) {
          zeroRun += 1;
        } else {
          if (zeroRun >= 2 && row.prediction.is_exact_score) return this.scoreRowResultDate(row);
          zeroRun = 0;
        }
      }
      return null;
    })();
    const hasComeback = Boolean(comebackDate);

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
    let fullPoolRoundDate = null;
    let noCrumbRoundDate = null;
    let crystalRoundDate = null;
    let emptyPoolRoundDate = null;
    let featherHarvestDate = null;

    Object.entries(roundGroups).forEach(([round, roundRows]) => {
      const finishedInRound = this.state.matches.filter((match) =>
        match.stage === "group"
        && match.status === "finished"
        && Number(match.pool_round || 0) === Number(round)
      ).length;
      const roundPoints = roundRows.reduce((sum, { prediction }) => sum + Number(prediction.points_total || 0), 0);
      const roundDate = this.firstScoreRowDate([...roundRows].sort((a, b) =>
        (this.scoreRowResultDate(b)?.getTime() || 0) - (this.scoreRowResultDate(a)?.getTime() || 0)
      ));
      bestPoolRoundPoints = Math.max(bestPoolRoundPoints, roundPoints);
      if (roundPoints >= 30 && !featherHarvestDate) featherHarvestDate = roundDate;

      if (finishedInRound >= 3 && roundRows.length === finishedInRound) {
        fullPoolRounds += 1;
        if (!fullPoolRoundDate) fullPoolRoundDate = roundDate;
        if (roundRows.every(({ prediction }) => Number(prediction.points_total || 0) > 0)) {
          noCrumbRounds += 1;
          if (!noCrumbRoundDate) noCrumbRoundDate = roundDate;
        }
        if (roundRows.every(({ prediction }) => prediction.is_exact_score)) {
          crystalRounds += 1;
          if (!crystalRoundDate) crystalRoundDate = roundDate;
        }
        if (roundRows.every(({ prediction }) => Number(prediction.points_total || 0) === 0)) {
          emptyPoolRounds += 1;
          if (!emptyPoolRoundDate) emptyPoolRoundDate = roundDate;
        }
      }
    });

    const badges = [];
    const unlock = (id, unlockedAt = null) => {
      const badge = this.badgeById(id);
      if (badge && !badges.some((b) => b.id === id)) {
        badges.push({ ...badge, unlockedAt: this.safeDate(unlockedAt) });
      }
    };

    const dateWhenCountReached = (sourceRows, count) => this.nthScoreRowDate(sourceRows, count);
    const dateWhenPredictionCountReached = (count) => this.predictionDateAt(predictionRows, count);
    const firstDateFromRows = (sourceRows) => this.firstScoreRowDate(sourceRows);

    const predictionCount = predictionRows.length;
    const prepMatchCount = prepMatches.length;
    const availableMatchCount = this.availablePredictionMatches().length;
    const activityDates = predictionRows
      .map((prediction) => this.predictionActivityDate(prediction))
      .filter(Boolean);
    const activeDayCount = new Set(activityDates.map((date) => this.localDayKey(date))).size;
    const consecutiveDays = this.maxConsecutiveDayStreak(activityDates);
    const nightPredictionDate = activityDates.find((date) => date.getHours() >= 0 && date.getHours() < 6) || null;
    const hasNightPrediction = Boolean(nightPredictionDate);
    const lastWingbeatPrediction = predictionRows.find((prediction) => {
      const activityDate = this.predictionActivityDate(prediction);
      const match = this.state.matches.find((m) => m.id === prediction.match_id);
      if (!activityDate || !match?.kickoff_at) return false;
      const kickoff = new Date(match.kickoff_at);
      const diff = kickoff.getTime() - activityDate.getTime();
      return diff >= 0 && diff <= 2 * 60 * 60 * 1000;
    });
    const hasLastWingbeat = Boolean(lastWingbeatPrediction);

    const final = this.finalMatch();
    const finalWinnerPick = earlyWinnerPick || this.winnerPredictionForUser(userId);
    const finalDate = this.matchResultDate(final);
    const hasFinalWinnerPick = Boolean(
      final?.status === "finished"
      && final?.winner_team_id
      && finalWinnerPick?.predicted_team_id === final.winner_team_id
    );
    const finalPerfectRow = rows.find(({ prediction, match }) =>
      match.stage === "final" && prediction.is_exact_score
    );
    const hasPerfectFinalScore = Boolean(finalPerfectRow);

    if (predictionCount >= 1) unlock("egg-hatched", dateWhenPredictionCountReached(1));
    if (predictionCount >= 10) unlock("young-feathers", dateWhenPredictionCountReached(10));
    if (availableMatchCount > 0 && predictionCount >= Math.ceil(availableMatchCount / 2)) unlock("half-nest", dateWhenPredictionCountReached(Math.ceil(availableMatchCount / 2)));
    if (availableMatchCount > 0 && predictionCount >= Math.ceil(availableMatchCount * 0.75)) unlock("three-quarter-perch", dateWhenPredictionCountReached(Math.ceil(availableMatchCount * 0.75)));
    if (availableMatchCount > 0 && predictionCount >= availableMatchCount) unlock("all-picks-in", dateWhenPredictionCountReached(availableMatchCount));

    if (hasNightPrediction) unlock("night-owl", nightPredictionDate);
    if (consecutiveDays >= 3) unlock("three-day-ritual", this.dateWhenConsecutiveDaysReached(activityDates, 3));
    if (consecutiveDays >= 7) unlock("seven-day-streak", this.dateWhenConsecutiveDaysReached(activityDates, 7));
    if (activeDayCount >= 14) unlock("many-active-days", this.dateWhenActiveDaysReached(activityDates, 14));
    if (hasLastWingbeat) unlock("last-wingbeat", this.predictionActivityDate(lastWingbeatPrediction));

    if (hasFinalWinnerPick) unlock("final-winner-oracle", finalDate);
    const championGroupExitDate = this.championGroupExitDate(finalWinnerPick);
    if (championGroupExitDate) unlock("bus-stuck", championGroupExitDate);
    if (hasPerfectFinalScore) unlock("final-perfect-score", this.scoreRowResultDate(finalPerfectRow));

    if (prepMatchCount > 0 && prepPredictionIds.size >= prepMatchCount) unlock("preparation-two-picks", this.predictionDateAt(prepPredictionRows, prepMatchCount));
    if (prepGoodRows.length >= 1) unlock("prep-good-pick", this.matchResultDate(prepGoodRows[0].match) || this.predictionActivityDate(prepGoodRows[0].prediction));

    if (rows.length >= 1) unlock("first-flight", this.nthScoreRowDate(rows, 1));
    if (exact >= 1) unlock("first-perfect", dateWhenCountReached(exactRows, 1));
    if (exact >= 3) unlock("surgical-beak", dateWhenCountReached(exactRows, 3));
    if (exactStreak >= 3) unlock("streak-3-exact", this.dateWhenBooleanStreakReached(rows, ({ prediction }) => prediction.is_exact_score, 3));
    if (exactStreak >= 5) unlock("streak-5-exact", this.dateWhenBooleanStreakReached(rows, ({ prediction }) => prediction.is_exact_score, 5));
    if (exact >= 10) unlock("owl-sniper", dateWhenCountReached(exactRows, 10));
    if (goodResults >= 10) unlock("accountant", dateWhenCountReached(goodResultRows, 10));
    if (resultStreak >= 5) unlock("safe-flight", this.dateWhenBooleanStreakReached(rows, ({ prediction }) => prediction.is_good_result, 5));
    if (resultStreak >= 10) unlock("autopilot", this.dateWhenBooleanStreakReached(rows, ({ prediction }) => prediction.is_good_result, 10));
    if (goodDiffs >= 5) unlock("geometry", dateWhenCountReached(goodDiffRows, 5));
    if (goodDiffs >= 10) unlock("architect", dateWhenCountReached(goodDiffRows, 10));
    if (goodQualified >= 1) unlock("knife-edge", firstDateFromRows(rows.filter(({ prediction }) => prediction.is_good_qualified)));
    if (goodQualified >= 2) unlock("qualified-oracle", dateWhenCountReached(rows.filter(({ prediction }) => prediction.is_good_qualified), 2));
    if (perfectKnockouts >= 1) unlock("scenario", firstDateFromRows(perfectKnockoutRows));
    if (round16Good >= 1) unlock("round16-lord", firstDateFromRows(round16GoodRows));
    if (totalPoints >= 40) unlock("high-branch", this.dateWhenTotalPointsReached(rows, 40));
    if (knockoutQualifiedNoExact >= 1) unlock("no-net", firstDateFromRows(knockoutQualifiedNoExactRows));
    if (hasComeback) unlock("comeback", comebackDate);
    if (totalPoints >= 50) unlock("gold-nest", this.dateWhenTotalPointsReached(rows, 50));
    if (totalPoints >= 100) unlock("platinum-nest", this.dateWhenTotalPointsReached(rows, 100));
    if (rows.length >= 10 && avg >= 4) unlock("machine", this.dateWhenAverageReached(rows, 10, 4));
    if (rows.length >= 10 && avg >= 5) unlock("crystal-wing", this.dateWhenAverageReached(rows, 10, 5));
    if (fullPoolRounds >= 1) unlock("full-perch", fullPoolRoundDate);
    if (noCrumbRounds >= 1) unlock("no-crumbs", noCrumbRoundDate);
    if (crystalRounds >= 1) unlock("pool-crystal", crystalRoundDate);
    if (correctDraws >= 3) unlock("draw-master", dateWhenCountReached(correctDrawRows, 3));
    if (smallExactScores >= 3) unlock("small-score", dateWhenCountReached(smallExactScoreRows, 3));
    if (highExactScores >= 1) unlock("fireworks", firstDateFromRows(highExactScoreRows));
    if (bestPoolRoundPoints >= 30) unlock("feather-harvest", featherHarvestDate);

    if (zeros >= 5) unlock("zero-tunnel", dateWhenCountReached(zeroRows, 5));
    if (zeroStreak >= 3) unlock("myopic", this.dateWhenBooleanStreakReached(rows, ({ prediction }) => Number(prediction.points_total || 0) === 0, 3));
    if (zeroStreak >= 5) unlock("blackout", this.dateWhenBooleanStreakReached(rows, ({ prediction }) => Number(prediction.points_total || 0) === 0, 5));
    if (emptyPoolRounds >= 1) unlock("pool-disaster", emptyPoolRoundDate);
    if (reversePicks >= 3) unlock("broken-compass", dateWhenCountReached(reversePickRows, 3));
    if (bustedDraws >= 3) unlock("cracked-wall", dateWhenCountReached(bustedDrawRows, 3));
    if (rows.length >= 3 && totalPoints === 0) unlock("empty-nest", this.nthScoreRowDate(rows, 3));
    if (rows.length >= 10 && exact === 0) unlock("anti-sniper", this.nthScoreRowDate(rows, 10));
    if (rows.length >= 10 && avg < 1) unlock("cold-perch", this.nthScoreRowDate(rows, 10));
    if (bustedDraws >= 5) unlock("draw-trap", dateWhenCountReached(bustedDrawRows, 5));
    if (wrongQualified >= 2) unlock("wrong-exit", dateWhenCountReached(wrongQualifiedRows, 2));
    if (bigWrongWay >= 1) unlock("big-owch", firstDateFromRows(bigWrongWayRows));
    if (rows.length >= 5 && zeros >= 3) unlock("wet-feathers", dateWhenCountReached(zeroRows, 3));

    return [...badges, ...this.miniRecordBadgesForUser(userId)];
  },

  badgeIconName(badge) {
    if (badge.icon) return badge.icon;
    if (String(badge.id || "").startsWith("record-")) return "trophy";
    if (badge.type === "negative") return "lock";
    if (badge.type === "neutral") return "nest";
    return "star";
  },

  badgeArtHtml(badge, unlocked = true) {
    const id = H.escapeHtml(badge.id);
    const title = H.escapeHtml(badge.title);
    const isMiniRecord = badge.isMiniRecord || String(badge.id || "").startsWith("record-");
    const assetFolder = isMiniRecord ? "assets/records" : "assets/badges";
    const altPrefix = isMiniRecord ? "Mini-record" : "Badge";
    return `
      <span class="achievement-art ${unlocked ? "unlocked" : "locked"} ${isMiniRecord ? "mini-record-art" : ""}">
        <img src="${assetFolder}/${id}.png" alt="${altPrefix} ${title}" loading="lazy" onerror="this.remove()">
        <span class="achievement-fallback">${H.icon(this.badgeIconName(badge))}</span>
      </span>
    `;
  },

  recordArtHtml(record) {
    const id = H.escapeHtml(record.id);
    const title = H.escapeHtml(record.title);
    return `
      <span class="record-icon record-art">
        <img src="assets/records/${id}.png" alt="Mini-record ${title}" loading="lazy" onerror="this.remove()">
        <span class="record-fallback">${H.icon(record.icon)}</span>
      </span>
    `;
  },

  achievementDateLabel(badge) {
    if (!badge?.unlockedAt) return "";
    return H.formatDateTime(badge.unlockedAt);
  },

  badgeChipHtml(badge) {
    const dateLabel = this.achievementDateLabel(badge);
    const title = `${badge.description}${dateLabel ? ` · Obtenu le ${dateLabel}` : ""}`;
    return `
      <span class="achievement-chip ${H.escapeHtml(badge.type)}" title="${H.escapeHtml(title)}">
        ${this.badgeArtHtml(badge)}
        <span>${H.escapeHtml(badge.title)}</span>
      </span>
    `;
  },

  normalizeFeaturedBadgeIds(value) {
    if (Array.isArray(value)) {
      return [...new Set(value.map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 3);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return this.normalizeFeaturedBadgeIds(parsed);
      } catch (_) {
        // Supabase/Postgres peut renvoyer un tableau text[] sous forme {id-a,id-b} selon le contexte.
      }
      return trimmed
        .replace(/^\{|\}$/g, "")
        .split(",")
        .map((id) => id.replace(/^"|"$/g, "").trim())
        .filter(Boolean)
        .slice(0, 3);
    }
    return [];
  },

  profileLikeForUser(userId, sourceProfile = null) {
    const candidates = [
      sourceProfile,
      this.state.profile?.id === userId ? this.state.profile : null,
      this.state.publicProfiles.find((profile) => profile.id === userId || profile.user_id === userId),
      this.state.playerScoreRows.find((row) => row.user_id === userId || row.id === userId)
    ];
    return candidates.find((profile) => profile && Object.prototype.hasOwnProperty.call(profile, "featured_badge_ids")) || null;
  },

  featuredBadgeIdsForUser(userId, sourceProfile = null) {
    return this.normalizeFeaturedBadgeIds(this.profileLikeForUser(userId, sourceProfile)?.featured_badge_ids);
  },

  featuredBadgesForUser(userId, limit = 3, sourceProfile = null) {
    const badges = this.computeBadgesForUser(userId);
    const selectedIds = this.featuredBadgeIdsForUser(userId, sourceProfile);
    const byId = new Map(badges.map((badge) => [badge.id, badge]));
    const selected = selectedIds.map((id) => byId.get(id)).filter(Boolean).slice(0, limit);
    const shown = selected.length ? selected : badges.slice(0, limit);
    return { badges, shown, selectedIds };
  },

  badgesPreviewHtml(userId, limit = 3, sourceProfile = null) {
    const { badges, shown, selectedIds } = this.featuredBadgesForUser(userId, limit, sourceProfile);
    if (!badges.length) return "";
    const hiddenCount = Math.max(0, badges.length - shown.length);
    const customTitle = selectedIds.length ? "Badges choisis par le joueur" : "Aucun choix personnalisé : aperçu automatique";
    return `
      <div class="achievement-preview" aria-label="${H.escapeHtml(shown.length)} exploit${shown.length > 1 ? "s" : ""} affiché${shown.length > 1 ? "s" : ""} sur ${H.escapeHtml(badges.length)}" title="${H.escapeHtml(customTitle)}">
        ${shown.map((badge) => this.badgeChipHtml(badge)).join("")}
        ${hiddenCount ? `<span class="achievement-chip achievement-more" title="Les autres exploits sont visibles en ouvrant le détail">+${hiddenCount} autre${hiddenCount > 1 ? "s" : ""}</span>` : ""}
      </div>
    `;
  },

  featuredBadgePickerHtml(badges = []) {
    if (!badges.length) return `
      <section class="card featured-badges-card">
        <div class="card-title-row">
          <div>
            <h3>${H.icon("star")} Mes badges affichés</h3>
            <p class="muted">Tu pourras choisir jusqu’à 3 badges à afficher dans les classements dès que tu auras débloqué ton premier exploit.</p>
          </div>
        </div>
      </section>
    `;

    const selectedIds = this.featuredBadgeIdsForUser(this.state.session.user.id, this.state.profile)
      .filter((id) => badges.some((badge) => badge.id === id));
    const selected = selectedIds
      .map((id) => badges.find((badge) => badge.id === id))
      .filter(Boolean);
    const selectedLabel = selected.length
      ? selected.map((badge) => this.badgeChipHtml(badge)).join("")
      : `<span class="muted">Aucun choix personnalisé : le classement affiche automatiquement tes 3 premiers exploits.</span>`;

    return `
      <section class="card featured-badges-card">
        <div class="card-title-row">
          <div>
            <h3>${H.icon("star")} Mes badges affichés</h3>
            <p class="muted">Choisis les 3 exploits que tu veux montrer sur le classement général. Les autres restent visibles dans le détail.</p>
          </div>
          <span class="pill neutral">${selected.length}/3 choisis</span>
        </div>
        <div class="featured-badges-selected">
          ${selectedLabel}
        </div>
        <div class="achievement-grid large featured-badge-picker">
          ${badges.map((badge) => {
            const isSelected = selectedIds.includes(badge.id);
            return `
              <article class="achievement-card ${H.escapeHtml(badge.type)} featured-badge-option ${isSelected ? "is-featured" : ""}">
                ${this.badgeArtHtml(badge, true)}
                <div>
                  <strong>${H.escapeHtml(badge.title)}</strong>
                  <p>${H.escapeHtml(badge.description)}</p>
                  <button class="${isSelected ? "danger-btn" : "ghost-btn"} small featured-badge-toggle" type="button" data-featured-badge-id="${H.escapeHtml(badge.id)}">
                    ${isSelected ? "Retirer du classement" : "Afficher sur le classement"}
                  </button>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  },

  bindFeaturedBadgePicker(badges = []) {
    const unlockedIds = new Set(badges.map((badge) => badge.id));
    H.$$("[data-featured-badge-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const badgeId = button.dataset.featuredBadgeId;
        if (!badgeId || !unlockedIds.has(badgeId)) return;

        const current = this.featuredBadgeIdsForUser(this.state.session.user.id, this.state.profile)
          .filter((id) => unlockedIds.has(id));
        const alreadySelected = current.includes(badgeId);
        const next = alreadySelected
          ? current.filter((id) => id !== badgeId)
          : [...current, badgeId];

        if (next.length > 3) {
          H.toast("Tu peux afficher 3 badges maximum dans les classements.", "info");
          return;
        }

        button.disabled = true;
        try {
          await this.saveFeaturedBadgeIds(next);
          H.toast(alreadySelected ? "Badge retiré du classement" : "Badge mis en avant", "success");
          await this.renderAchievementsContent();
        } finally {
          button.disabled = false;
        }
      });
    });
  },

  async saveFeaturedBadgeIds(ids = []) {
    const cleanIds = this.normalizeFeaturedBadgeIds(ids);
    const { error } = await window.sb
      .from("profiles")
      .update({ featured_badge_ids: cleanIds })
      .eq("id", this.state.session.user.id);

    if (error) {
      H.toast(error.message, "error");
      throw error;
    }

    this.state.profile = { ...this.state.profile, featured_badge_ids: cleanIds };
    this.state.publicProfiles = this.state.publicProfiles.map((profile) =>
      profile.id === this.state.session.user.id ? { ...profile, featured_badge_ids: cleanIds } : profile
    );
    this.state.playerScoreRows = this.state.playerScoreRows.map((row) =>
      row.user_id === this.state.session.user.id ? { ...row, featured_badge_ids: cleanIds } : row
    );
  },

  bindAchievementReplay(root = document) {
    H.$$('[data-achievement-replay-id]', root).forEach((card) => {
      if (card.dataset.replayBound === "true") return;
      card.dataset.replayBound = "true";
      const replay = () => this.replayAchievementPopup(card.dataset.achievementReplayId);
      card.addEventListener("click", (event) => {
        if (event.target.closest("button, a, input, select, textarea")) return;
        replay();
      });
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          replay();
        }
      });
    });
  },

  replayAchievementPopup(badgeId) {
    const unlockedBadge = this.computeBadgesForUser(this.state.session?.user?.id).find((badge) => badge.id === badgeId);
    const badge = unlockedBadge || this.badgeById(badgeId);
    if (!badge) return;

    // Les mini-records sont des trophées dynamiques : un seul détenteur actuel.
    // Au clic, on affiche donc le classement du mini-record plutôt qu’un popup de badge classique.
    if (badge.isMiniRecord || String(badge.id || "").startsWith("record-")) {
      this.showRecordPopup(badge.id);
      return;
    }

    this.queueAchievementModals([{ ...badge, replayed: true }]);
  },

  queueAchievementDiffFromSnapshot(previousIds = new Set()) {
    if (!this.state.session?.user?.id) return false;
    const badges = this.computeBadgesForUser(this.state.session.user.id);
    const currentIds = new Set(badges.map((badge) => badge.id));
    const newBadges = badges.filter((badge) => !previousIds.has(badge.id));
    this.state.lastAchievementIds = currentIds;

    if (!newBadges.length) return false;

    const notifiedIds = this.getNotifiedAchievementIds();
    newBadges.forEach((badge) => notifiedIds.add(badge.id));
    this.setNotifiedAchievementIds(notifiedIds);
    this.queueAchievementModals(newBadges);
    return true;
  },

  scheduleAchievementResync(delays = [250, 1000, 2500]) {
    if (!this.state.session?.user?.id) return;
    delays.forEach((delay) => {
      const timer = window.setTimeout(async () => {
        this.state.achievementResyncTimers = this.state.achievementResyncTimers.filter((item) => item !== timer);
        try {
          await Promise.all([
            this.loadMyPredictions(),
            this.loadVisiblePredictions(),
            this.loadWinnerPrediction(),
            this.loadWinnerPredictionsForTeams().catch(() => null)
          ]);
          this.syncAchievementNotifications();
        } catch (error) {
          console.warn("Resynchronisation des exploits impossible", error);
        }
      }, delay);
      this.state.achievementResyncTimers.push(timer);
    });
  },

  badgeCardHtml(badge, unlocked = true, options = {}) {
    const showDate = options.showDate !== false;
    const replayable = Boolean(unlocked && options.replay !== false);
    const dateLabel = unlocked && showDate ? this.achievementDateLabel(badge) : "";
    return `
      <article class="achievement-card ${H.escapeHtml(badge.type)} ${unlocked ? "" : "locked"} ${replayable ? "replayable-achievement" : ""}" ${replayable ? `data-achievement-replay-id="${H.escapeHtml(badge.id)}" role="button" tabindex="0" title="Revoir le popup de cet exploit"` : ""}>
        ${this.badgeArtHtml(badge, unlocked)}
        <div>
          <strong>${H.escapeHtml(badge.title)}</strong>
          <p>${H.escapeHtml(badge.description)}</p>
          ${dateLabel ? `<small class="achievement-date">${H.icon("time")} Obtenu le ${H.escapeHtml(dateLabel)}</small>` : ""}
          ${unlocked ? "" : `<small class="achievement-state locked">À débloquer</small>`}
        </div>
      </article>
    `;
  },

  badgesPanelHtml(userId, options = {}) {
    const badges = this.computeBadgesForUser(userId);
    if (!badges.length) return `<p class="muted detail-empty">Aucun exploit pour le moment. Le nid observe en silence.</p>`;
    const title = options.title ? `<div class="achievement-panel-title"><strong>${H.escapeHtml(options.title)}</strong><small>${badges.length} exploit${badges.length > 1 ? "s" : ""} débloqué${badges.length > 1 ? "s" : ""}</small></div>` : "";
    return `${title}<div class="achievement-grid">${badges.map((badge) => this.badgeCardHtml(badge, true, { showDate: options.showDates !== false })).join("")}</div>`;
  },
  achievementStorageKey() {
    return `nid-achievements-notified:${this.state.session?.user?.id || "anonymous"}`;
  },

  hasAchievementNotificationStore() {
    try {
      return localStorage.getItem(this.achievementStorageKey()) !== null;
    } catch (error) {
      return true;
    }
  },

  getNotifiedAchievementIds() {
    try {
      const raw = localStorage.getItem(this.achievementStorageKey());
      const ids = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(ids) ? ids : []);
    } catch (error) {
      return new Set();
    }
  },

  setNotifiedAchievementIds(ids) {
    try {
      localStorage.setItem(this.achievementStorageKey(), JSON.stringify([...ids]));
    } catch (error) {
      console.warn("Impossible d’enregistrer les badges déjà annoncés", error);
    }
  },

  syncAchievementNotifications({ silent = false } = {}) {
    if (!this.state.session?.user?.id) return;
    const badges = this.computeBadgesForUser(this.state.session.user.id);
    const currentIds = new Set(badges.map((badge) => badge.id));

    if (silent) {
      this.setNotifiedAchievementIds(currentIds);
      this.state.lastAchievementIds = currentIds;
      return;
    }

    const notifiedIds = this.getNotifiedAchievementIds();
    const previousIds = this.state.lastAchievementIds;
    const reappearedAfterReset = (badge) => previousIds instanceof Set && !previousIds.has(badge.id);
    const newBadges = badges.filter((badge) => !notifiedIds.has(badge.id) || reappearedAfterReset(badge));

    this.state.lastAchievementIds = currentIds;

    if (!newBadges.length) return;

    newBadges.forEach((badge) => notifiedIds.add(badge.id));
    this.setNotifiedAchievementIds(notifiedIds);
    this.queueAchievementModals(newBadges);
  },

  queueAchievementModals(badges = []) {
    const freshBadges = badges.filter((badge) =>
      badge?.id
      && !this.state.achievementNotificationQueue.some((queued) => queued.id === badge.id)
    );
    if (!freshBadges.length) return;

    this.state.achievementNotificationQueue.push(...freshBadges);
    this.showNextAchievementModal();
  },

  scheduleAchievementModal() {
    if (this.state.achievementNotificationTimer) return;

    this.state.achievementNotificationTimer = window.setTimeout(() => {
      this.state.achievementNotificationTimer = null;
      this.showNextAchievementModal();
    }, 0);
  },

  achievementModalTone(badge) {
    if (badge.type === "negative") {
      return {
        kicker: "Exploit débloqué… avec panache douteux",
        headline: "Le nid te chambre, mais il applaudit quand même",
        emoji: "🦉💥"
      };
    }
    if (badge.type === "neutral") {
      return {
        kicker: "Nouvel exploit débloqué",
        headline: "La chouette inscrit ton nom dans le grimoire",
        emoji: "🦉✨"
      };
    }
    return {
      kicker: "Badge débloqué !",
      headline: "Pluie de confettis sur le perchoir",
      emoji: "🏆✨"
    };
  },

  showNextAchievementModal() {
    if (this.state.achievementNotificationTimer) {
      window.clearTimeout(this.state.achievementNotificationTimer);
      this.state.achievementNotificationTimer = null;
    }
    if (this.state.achievementModalOpen && !H.$("#achievementUnlockModal")) {
      this.state.achievementModalOpen = false;
    }
    if (this.state.achievementModalOpen) return;

    const badge = this.state.achievementNotificationQueue.shift();
    if (!badge) return;

    this.state.achievementModalOpen = true;
    H.$("#achievementUnlockModal")?.remove();

    const tone = this.achievementModalTone(badge);
    const remaining = this.state.achievementNotificationQueue.length;
    const unlockedDateLabel = this.achievementDateLabel(badge);
    const modal = document.createElement("div");
    modal.id = "achievementUnlockModal";
    modal.className = `modal-backdrop achievement-unlock-modal achievement-unlock-${H.escapeHtml(badge.type)}`;
    modal.innerHTML = `
      <div class="modal-card achievement-unlock-card" role="dialog" aria-modal="true" aria-labelledby="achievementUnlockTitle">
        <button class="modal-x-btn" id="closeAchievementUnlockXBtn" type="button" aria-label="Fermer">×</button>
        <div class="magic-confetti" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="achievement-unlock-glow" aria-hidden="true"></div>
        <p class="eyebrow achievement-unlock-kicker">${H.escapeHtml(tone.kicker)}</p>
        <div class="achievement-unlock-art">
          ${this.badgeArtHtml(badge, true)}
        </div>
        <h2 id="achievementUnlockTitle">${H.escapeHtml(badge.title)}</h2>
        <p class="achievement-unlock-headline">${H.escapeHtml(tone.headline)} ${tone.emoji}</p>
        ${unlockedDateLabel ? `<p class="achievement-unlock-date">${H.icon("time")} Obtenu le ${H.escapeHtml(unlockedDateLabel)}</p>` : ""}
        <p class="muted achievement-unlock-description">${H.escapeHtml(badge.description)}</p>
        <div class="achievement-unlock-actions">
          ${remaining ? `<small>${remaining} autre${remaining > 1 ? "s" : ""} exploit${remaining > 1 ? "s" : ""} en attente…</small>` : `<small>Le grimoire est à jour.</small>`}
          <button class="primary-btn" id="closeAchievementUnlockBtn" type="button">${remaining ? "Voir le suivant" : "Fermer"}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      modal.classList.add("is-leaving");
      window.setTimeout(() => {
        modal.remove();
        this.state.achievementModalOpen = false;
        this.scheduleAchievementModal();
      }, 120);
    };
    H.$("#closeAchievementUnlockBtn", modal)?.focus();
    H.$("#closeAchievementUnlockBtn", modal)?.addEventListener("click", close);
    H.$("#closeAchievementUnlockXBtn", modal)?.addEventListener("click", close);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
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

  async renderOverallLeaderboard(targetSelector = "#leaderboardContent") {
    const { data, error } = await window.sb
      .from("v_leaderboard_overall")
      .select("*")
      .order("rank");

    const root = H.$(targetSelector);
    if (error) {
      root.innerHTML = `<p class="error-text">${H.escapeHtml(error.message)}</p>`;
      return;
    }

    root.innerHTML = `
      <div class="leaderboard-inner-title">
        <strong>Général</strong>
        <small>Classement Coupe du monde, hors matchs test</small>
      </div>
      ${this.leaderboardRowsHtml(data || [])}
    `;
    this.bindAchievementReplay(root);
  },

  leaderboardRowsHtml(rows, options = {}) {
    if (!rows.length) return `<p class="muted">Pas encore de points.</p>`;
    const filters = options.filters || {};

    return `
      <div class="leaderboard-list">
        ${rows.map((r) => {
          const playerProfile = this.visualProfile({
            pseudo: r.pseudo,
            office_team_id: r.office_team_id,
            office_team_name: r.office_team_name,
            office_team_slug: r.office_team_slug,
            office_team_color: r.office_team_color,
            avatar_key: r.avatar_key || "owl-01",
            badge_shape: r.badge_shape || "rounded",
            badge_color: r.badge_color || "#facc15"
          });
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
              </div>
              <div class="points">${r.total_points || 0}<small>pts</small></div>
            </summary>
            <div class="leader-expanded">
              <h4>Détail des points</h4>
              ${this.playerScoreDetailsHtml(r.user_id, filters)}
              ${r.winner_points ? `<div class="winner-bonus-line">${H.icon("trophy")} Bonus champion du monde : <strong>+${r.winner_points} pts</strong></div>` : ""}
              <h4>Badges d’exploit</h4>
              ${this.badgesPanelHtml(r.user_id, { title: "Tous les exploits visibles" })}
            </div>
          </details>`;
        }).join("")}
      </div>
    `;
  },

  async renderPoolRoundLeaderboard(targetSelector = "#leaderboardContent") {
    const root = H.$(targetSelector);
    const groups = this.groupMatchesByPouleRound(this.phaseLeaderboardMatches());
    const activeIndex = this.clampPhaseIndex("leaderboardPhaseIndex", groups);
    const group = groups[activeIndex];

    if (!groups.length || !group) {
      root.innerHTML = `<section class="card"><p class="muted">Aucune phase à afficher pour le moment.</p></section>`;
      return;
    }

    const { data, error } = await window.sb
      .from("v_leaderboard_overall")
      .select("user_id,pseudo,office_team_id,office_team_name,office_team_slug,avatar_key,badge_shape,badge_color,featured_badge_ids")
      .order("pseudo");

    if (error) {
      root.innerHTML = `<section class="card"><p class="error-text">${H.escapeHtml(error.message)}</p></section>`;
      return;
    }

    const byUser = new Map();
    this.state.publicProfiles.forEach((profile) => {
      const userId = profile.id || profile.user_id;
      if (!userId) return;
      byUser.set(userId, {
        user_id: userId,
        pseudo: profile.pseudo || "Joueur",
        office_team_id: profile.office_team_id,
        office_team_name: profile.office_team_name,
        office_team_slug: profile.office_team_slug,
        office_team_color: profile.office_team_color,
        avatar_key: profile.avatar_key || "owl-01",
        badge_shape: profile.badge_shape || "rounded",
        badge_color: profile.badge_color || profile.office_team_color || "#facc15",
        featured_badge_ids: profile.featured_badge_ids
      });
    });
    (data || []).forEach((row) => {
      if (!row.user_id) return;
      byUser.set(row.user_id, { ...(byUser.get(row.user_id) || {}), ...row });
    });

    const matchIds = group.matches.map((m) => m.id);
    const finishedCount = group.matches.filter((m) => m.status === "finished").length;
    const rows = [...byUser.values()].map((player) => {
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
      <div class="leaderboard-inner-title">
        <strong>${H.escapeHtml(group.key)}</strong>
        <small>${finishedCount}/${group.matches.length} match${group.matches.length > 1 ? "s" : ""} terminé${finishedCount > 1 ? "s" : ""} · ${H.matchDateRangeLabel(group.matches)}</small>
      </div>
      ${this.leaderboardRowsHtml(rows, { filters: { matchIds } })}
      ${pager}
    `;

    this.bindPhaseNavigation("leaderboardPhaseIndex", () => this.renderPoolRoundLeaderboard(targetSelector));
    this.bindAchievementReplay(root);
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
                ${H.profileBadgeHtml(this.visualProfile(row), "profile-badge leaderboard-badge")}
                <div>
                  <strong>#${row.rank} — ${H.escapeHtml(row.pseudo)}</strong>
                  <small>${H.escapeHtml(row.office_team_name || "Sans team")} · ${badges.length} badge${badges.length > 1 ? "s" : ""}</small>
                  ${this.badgesPreviewHtml(row.user_id, 3, row)}
                </div>
              </div>
              <div class="points">${row.total_points || 0}<small>pts</small></div>
            </summary>
            ${this.badgesPanelHtml(row.user_id, { title: "Tous les exploits du joueur" })}
          </details>
        `).join("") : `<section class="card"><p class="muted">Aucun badge pour le moment.</p></section>`}
      </div>
    `;
    this.bindAchievementReplay(root);
  },

  safeColor(value, fallback = "#facc15") {
    const raw = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
  },

  teamPhaseRows(matchIds = [], mode = "average") {
    const matchIdSet = new Set(matchIds);
    const teams = this.state.officeTeams.map((team) => {
      const players = this.teamPlayers(team.id).filter((player) => player.profile_setup_done !== false);
      const playerIds = new Set(players.map((player) => player.id));
      const details = this.state.visiblePredictions
        .filter((prediction) => playerIds.has(prediction.user_id) && matchIdSet.has(prediction.match_id))
        .map((prediction) => ({ prediction, match: this.state.matches.find((m) => m.id === prediction.match_id) }))
        .filter(({ match, prediction }) => match?.status === "finished" && prediction.points_total !== null && prediction.points_total !== undefined);

      const total = details.reduce((sum, { prediction }) => sum + Number(prediction.points_total || 0), 0);
      const exact = details.filter(({ prediction }) => prediction.is_exact_score).length;
      const goodResults = details.filter(({ prediction }) => prediction.is_good_result).length;
      return {
        office_team_id: team.id,
        office_team_name: team.name,
        office_team_color: team.color,
        active_players: players.length,
        total_points: total,
        average_points: players.length ? total / players.length : 0,
        exact_scores: exact,
        good_results: goodResults,
        scored_matches: details.length
      };
    }).filter((row) => row.active_players > 0);

    const byAverage = mode === "average";
    return teams
      .sort((a, b) =>
        byAverage
          ? (b.average_points || 0) - (a.average_points || 0)
            || (b.total_points || 0) - (a.total_points || 0)
            || String(a.office_team_name || "").localeCompare(String(b.office_team_name || ""), "fr")
          : (b.total_points || 0) - (a.total_points || 0)
            || (b.average_points || 0) - (a.average_points || 0)
            || String(a.office_team_name || "").localeCompare(String(b.office_team_name || ""), "fr")
      )
      .map((row, index) => ({ ...row, rank: index + 1 }));
  },

  teamLeaderboardRowsHtml(rows = [], options = {}) {
    if (!rows.length) return `<p class="muted">Pas encore de team classée.</p>`;
    const mode = options.mode || this.state.teamTab;
    return `
      <div class="leaderboard-list team-leaderboard-list">
        ${rows.map((r) => {
          const color = this.safeColor(r.office_team_color || r.color, "#facc15");
          const mainValue = mode === "average" ? Number(r.average_points || 0).toFixed(1) : Number(r.total_points || 0);
          const mainLabel = mode === "average" ? "pts/j" : "pts";
          return `
            <div class="leader-row team-row nest-team-row" style="--team-color:${color}">
              <div class="rank">#${r.rank}</div>
              <div class="team-nest-mark" aria-hidden="true"></div>
              <div class="leader-main">
                <strong>${H.escapeHtml(r.office_team_name)}</strong>
                <small>${r.active_players || 0} joueur${(r.active_players || 0) > 1 ? "s" : ""} actif${(r.active_players || 0) > 1 ? "s" : ""} · total ${Math.round(Number(r.total_points || 0) * 10) / 10} pts</small>
                <div class="score-breakdown team-breakdown">
                  <span title="Scores exacts">${H.icon("target")} ${r.exact_scores || 0}</span>
                  <span title="Bons résultats">${H.icon("check")} ${r.good_results || 0}</span>
                  ${r.scored_matches !== undefined ? `<span title="Pronos comptabilisés">${H.icon("list")} ${r.scored_matches || 0}</span>` : ""}
                  ${mode !== "average" ? `<span title="Moyenne par joueur">${H.icon("trend")} ${Number(r.average_points || 0).toFixed(1)} pts/j</span>` : ""}
                </div>
              </div>
              <div class="points">${mainValue}<small>${mainLabel}</small></div>
            </div>`;
        }).join("")}
      </div>
    `;
  },

  async renderTeamLeaderboard() {
    const root = H.$("#leaderboardContent");
    const teamTab = ["average", "points"].includes(this.state.teamTab) ? this.state.teamTab : "average";
    this.state.teamTab = teamTab;
    const groups = this.groupMatchesByPouleRound(this.phaseLeaderboardMatches());
    const activeIndex = this.clampPhaseIndex("teamLeaderboardPhaseIndex", groups);
    const group = groups[activeIndex];

    if (!groups.length || !group) {
      root.innerHTML = `<section class="card"><p class="muted">Aucune phase à afficher pour le moment.</p></section>`;
      return;
    }

    const matchIds = group.matches.map((match) => match.id);
    const finishedCount = group.matches.filter((match) => match.status === "finished").length;
    const pager = this.phaseNavigatorHtml(groups, activeIndex, "teamLeaderboardPhaseIndex");
    const rows = this.teamPhaseRows(matchIds, teamTab);

    root.innerHTML = `
      <section class="card team-leaderboard-card">
        <div class="card-title-row">
          <div>
            <h3>Teams bureau par phase</h3>
          </div>
        </div>
        <div class="segmented small team-leaderboard-mode">
          <button class="${teamTab === "average" ? "active" : ""}" data-team-tab="average">Moyenne</button>
          <button class="${teamTab === "points" ? "active" : ""}" data-team-tab="points">Par points</button>
        </div>
        ${pager}
        <div class="team-phase-head">
          <strong>${H.escapeHtml(group.key)}</strong>
          <small>${finishedCount}/${group.matches.length} match${group.matches.length > 1 ? "s" : ""} terminé${finishedCount > 1 ? "s" : ""} · ${H.matchDateRangeLabel(group.matches)}</small>
        </div>
        ${this.teamLeaderboardRowsHtml(rows, { mode: teamTab })}
        ${pager}
      </section>
    `;

    H.$$('[data-team-tab]', root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.teamTab = btn.dataset.teamTab;
        await this.renderTeamLeaderboard();
      });
    });

    this.bindPhaseNavigation("teamLeaderboardPhaseIndex", () => this.renderTeamLeaderboard());
  },

  profileForUser(userId, source = null) {
    const row = source || this.state.playerScoreRows.find((item) => item.user_id === userId || item.id === userId)
      || this.state.publicProfiles.find((item) => item.id === userId || item.user_id === userId)
      || {};
    return this.visualProfile({
      pseudo: row.pseudo || row.author_pseudo || "Joueur",
      office_team_id: row.office_team_id,
      office_team_name: row.office_team_name,
      office_team_slug: row.office_team_slug,
      office_team_color: row.office_team_color,
      avatar_key: row.avatar_key || "owl-01",
      badge_shape: row.badge_shape || "rounded",
      badge_color: row.badge_color || row.office_team_color || "#facc15"
    });
  },

  playerEvolutionSeries(mode = "day") {
    const finishedRows = this.state.visiblePredictions
      .map((prediction) => ({ prediction, match: this.state.matches.find((m) => m.id === prediction.match_id) }))
      .filter(({ prediction, match }) => match?.status === "finished" && !match.is_test_match && prediction.points_total !== null && prediction.points_total !== undefined)
      .sort((a, b) => new Date(a.match.kickoff_at || 0) - new Date(b.match.kickoff_at || 0));

    const periodKey = (date) => {
      const d = new Date(date);
      if (mode === "week") {
        const monday = new Date(d);
        const day = monday.getDay() || 7;
        monday.setHours(0, 0, 0, 0);
        monday.setDate(monday.getDate() - day + 1);
        return monday.toISOString().slice(0, 10);
      }
      return d.toISOString().slice(0, 10);
    };
    const periodLabel = (key) => mode === "week" ? `Semaine du ${H.formatShortDate(key)}` : H.formatShortDate(key);

    const periods = [...new Set(finishedRows.map(({ match }) => periodKey(match.kickoff_at)))].sort();
    const totalsByUser = new Map();
    const pointsByPeriod = new Map(periods.map((key) => [key, new Map()]));

    finishedRows.forEach(({ prediction, match }) => {
      const key = periodKey(match.kickoff_at);
      const map = pointsByPeriod.get(key);
      map.set(prediction.user_id, (map.get(prediction.user_id) || 0) + Number(prediction.points_total || 0));
    });

    periods.forEach((key) => {
      const map = pointsByPeriod.get(key);
      map.forEach((points, userId) => {
        totalsByUser.set(userId, (totalsByUser.get(userId) || 0) + points);
      });
    });

    const playerIds = [...totalsByUser.keys()]
      .sort((a, b) => (totalsByUser.get(b) || 0) - (totalsByUser.get(a) || 0))
      .slice(0, 8);

    const cumulative = new Map(playerIds.map((userId) => [userId, 0]));
    const snapshots = periods.map((key) => {
      const periodPoints = pointsByPeriod.get(key) || new Map();
      playerIds.forEach((userId) => cumulative.set(userId, (cumulative.get(userId) || 0) + (periodPoints.get(userId) || 0)));
      return {
        key,
        label: periodLabel(key),
        totals: new Map(playerIds.map((userId) => [userId, cumulative.get(userId) || 0]))
      };
    });

    return { playerIds, snapshots, totalsByUser };
  },

  evolutionChartSvg(series) {
    const { playerIds, snapshots } = series;
    if (!playerIds.length || !snapshots.length) return "";
    const width = 760;
    const height = 300;
    const pad = { left: 46, right: 22, top: 24, bottom: 42 };
    const graphW = width - pad.left - pad.right;
    const graphH = height - pad.top - pad.bottom;
    const maxPoints = Math.max(1, ...snapshots.flatMap((snapshot) => playerIds.map((userId) => snapshot.totals.get(userId) || 0)));
    const x = (index) => pad.left + (snapshots.length === 1 ? graphW / 2 : (index / (snapshots.length - 1)) * graphW);
    const y = (value) => pad.top + graphH - (Number(value || 0) / maxPoints) * graphH;
    const yTicks = [0, Math.ceil(maxPoints / 2), maxPoints];

    const lines = playerIds.map((userId, index) => {
      const profile = this.profileForUser(userId);
      const color = this.safeColor(profile.badge_color || profile.office_team_color, ["#facc15", "#38bdf8", "#a78bfa", "#fb7185", "#34d399", "#fb923c", "#f472b6", "#c4b5fd"][index % 8]);
      const points = snapshots.map((snapshot, i) => `${x(i).toFixed(1)},${y(snapshot.totals.get(userId) || 0).toFixed(1)}`).join(" ");
      const last = snapshots[snapshots.length - 1];
      const lastX = x(snapshots.length - 1);
      const lastY = y(last.totals.get(userId) || 0);
      return `
        <polyline class="evolution-line" points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        <circle class="evolution-dot" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="5" fill="${color}" />
      `;
    }).join("");

    const xLabels = snapshots.map((snapshot, index) => {
      const shouldShow = snapshots.length <= 7 || index === 0 || index === snapshots.length - 1 || index % Math.ceil(snapshots.length / 5) === 0;
      return shouldShow ? `<text class="evolution-axis-label" x="${x(index).toFixed(1)}" y="${height - 14}" text-anchor="middle">${H.escapeHtml(snapshot.label.replace("Semaine du ", "S. "))}</text>` : "";
    }).join("");

    const yGrid = yTicks.map((tick) => `
      <line class="evolution-grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}" />
      <text class="evolution-axis-label" x="${pad.left - 10}" y="${(y(tick) + 4).toFixed(1)}" text-anchor="end">${tick}</text>
    `).join("");

    return `
      <svg class="evolution-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Évolution des points">
        ${yGrid}
        ${lines}
        ${xLabels}
      </svg>
    `;
  },

  async renderLeaderboardEvolution() {
    await this.loadPlayerScoreRows();
    const root = H.$("#leaderboardContent");
    const mode = this.state.leaderboardEvolutionMode === "week" ? "week" : "day";
    const series = this.playerEvolutionSeries(mode);
    const latestSnapshot = series.snapshots[series.snapshots.length - 1];

    root.innerHTML = `
      <section class="card evolution-card">
        <div class="card-title-row">
          <div>
            <h3>Évolution du nid</h3>
            <p class="muted">Les courbes montrent les points cumulés des 8 meilleurs joueurs au fil des matchs terminés.</p>
          </div>
          <div class="segmented small">
            <button class="${mode === "day" ? "active" : ""}" data-evolution-mode="day">Jour</button>
            <button class="${mode === "week" ? "active" : ""}" data-evolution-mode="week">Semaine</button>
          </div>
        </div>
        ${series.playerIds.length ? `
          <div class="evolution-layout">
            <div class="evolution-chart-wrap">${this.evolutionChartSvg(series)}</div>
            <div class="evolution-legend">
              ${series.playerIds.map((userId, index) => {
                const source = this.state.playerScoreRows.find((row) => row.user_id === userId);
                const profile = this.profileForUser(userId, source);
                const color = this.safeColor(profile.badge_color || profile.office_team_color, ["#facc15", "#38bdf8", "#a78bfa", "#fb7185", "#34d399", "#fb923c", "#f472b6", "#c4b5fd"][index % 8]);
                const total = latestSnapshot?.totals.get(userId) || 0;
                return `
                  <div class="evolution-player" style="--player-color:${color}">
                    ${H.profileBadgeHtml(profile, "profile-badge mini")}
                    <div><strong>${H.escapeHtml(profile.pseudo)}</strong><small>${H.escapeHtml(profile.office_team_name || "Sans team")}</small></div>
                    <span>${total} pts</span>
                  </div>`;
              }).join("")}
            </div>
          </div>
        ` : `<p class="muted">Pas assez de matchs terminés pour dessiner l’évolution du nid.</p>`}
      </section>
    `;

    H.$$('[data-evolution-mode]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.leaderboardEvolutionMode = btn.dataset.evolutionMode;
        await this.renderLeaderboardEvolution();
      });
    });
  },


  officeTeamById(teamId) {
    return this.state.officeTeams.find((team) => team.id === teamId) || null;
  },

  playerPublicProfile(profile = {}) {
    const team = this.officeTeamById(profile.office_team_id);
    return this.visualProfile({
      ...profile,
      office_team_name: profile.office_team_name || team?.name || "Sans team",
      office_team_slug: profile.office_team_slug || team?.slug || "",
      office_team_color: profile.office_team_color || team?.color || profile.badge_color || "#facc15",
      avatar_key: profile.avatar_key || "owl-01",
      badge_shape: profile.badge_shape || "rounded",
      badge_color: profile.badge_color || team?.color || "#facc15"
    });
  },

  teamPlayers(teamId = null) {
    return this.state.publicProfiles
      .filter((player) => teamId ? player.office_team_id === teamId : !player.office_team_id)
      .sort((a, b) => String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr"));
  },

  scoreRowForPlayer(userId) {
    return this.state.playerScoreRows.find((row) => row.user_id === userId) || null;
  },

  winnerInfoForPlayer(userId) {
    const publicWinner = this.state.winnerPredictions.find((row) => row.user_id === userId);
    if (publicWinner) return publicWinner;

    if (userId === this.state.session.user.id && this.state.winnerPrediction?.predicted_team_id) {
      const team = this.state.footballTeams.find((item) => item.id === this.state.winnerPrediction.predicted_team_id);
      if (team) {
        return {
          user_id: userId,
          predicted_team_id: team.id,
          predicted_team_name: team.name,
          predicted_team_short_name: team.short_name,
          predicted_team_country_code: team.country_code,
          predicted_team_flag_url: team.flag_url,
          points_total: 0
        };
      }
    }

    return null;
  },

  playerStatsCardsHtml(row, badges) {
    return `
      <div class="player-detail-stats">
        <article><strong>#${row?.rank || "—"}</strong><small>classement</small></article>
        <article><strong>${row?.total_points || 0}</strong><small>points</small></article>
        <article><strong>${row?.exact_scores || 0}</strong><small>scores exacts</small></article>
        <article><strong>${row?.good_results || 0}</strong><small>bons résultats</small></article>
        <article><strong>${badges.length}</strong><small>badges</small></article>
      </div>
    `;
  },

  playerChampionPickHtml(playerId) {
    const winner = this.winnerInfoForPlayer(playerId);

    if (winner) {
      const flag = H.flagImgHtml({
        flagUrl: winner.predicted_team_flag_url,
        countryCode: winner.predicted_team_country_code,
        shortName: winner.predicted_team_short_name,
        name: winner.predicted_team_name,
        className: "team-flag-img champion-option-flag"
      });
      return `
        <div class="player-winner-pick picked">
          ${flag}
          <div>
            <strong>${H.escapeHtml(winner.predicted_team_name || "Équipe choisie")}</strong>
            <small>Champion du monde choisi${winner.points_total ? ` · +${winner.points_total} pts` : ""}</small>
          </div>
        </div>
      `;
    }

    if (this.state.winnerPredictionsError) {
      return `
        <div class="player-winner-pick muted-box">
          <strong>Choix champion indisponible</strong>
          <small>${H.escapeHtml(this.state.winnerPredictionsError.message || "Vue Supabase à vérifier")}</small>
        </div>
      `;
    }

    return `
      <div class="player-winner-pick muted-box">
        <strong>Choix champion non visible</strong>
        <small>Soit le joueur ne l’a pas encore choisi, soit le choix reste masqué jusqu’au verrouillage.</small>
      </div>
    `;
  },

  openTeamPlayerModal(playerId) {
    const player = this.state.publicProfiles.find((item) => item.id === playerId);
    if (!player) return;

    this.state.teamSelectedPlayerId = playerId;
    const existing = H.$("#teamPlayerModal");
    if (existing) existing.remove();

    const profile = this.playerPublicProfile(player);
    const isMe = player.id === this.state.session.user.id;
    const scoreRow = this.scoreRowForPlayer(player.id);
    const badges = this.computeBadgesForUser(player.id);

    const modal = document.createElement("div");
    modal.id = "teamPlayerModal";
    modal.className = "modal-backdrop team-player-modal";
    modal.innerHTML = `
      <div class="modal-card team-player-modal-card" role="dialog" aria-modal="true" aria-labelledby="teamPlayerModalTitle">
        <div class="team-player-modal-head" style="--team-color:${H.escapeHtml(profile.office_team_color || profile.badge_color || "#facc15")}">
          <div class="team-player-identity">
            ${H.profileBadgeHtml(profile, "profile-badge large")}
            <div>
              <p class="eyebrow">Fiche joueur${isMe ? " · toi" : ""}</p>
              <h2 id="teamPlayerModalTitle">${H.escapeHtml(player.pseudo || "Joueur")}</h2>
              <p class="muted">${H.escapeHtml(profile.office_team_name || "Sans team")} · ${scoreRow?.scored_matches || 0} match${Number(scoreRow?.scored_matches || 0) > 1 ? "s" : ""} comptabilisé${Number(scoreRow?.scored_matches || 0) > 1 ? "s" : ""}</p>
            </div>
          </div>
          <button class="ghost-btn" id="closeTeamPlayerModalBtn" type="button">Fermer</button>
        </div>

        ${this.playerStatsCardsHtml(scoreRow, badges)}

        <section class="player-detail-section">
          <h3>Équipe choisie pour gagner</h3>
          ${this.playerChampionPickHtml(player.id)}
        </section>

        <section class="player-detail-section">
          <h3>Badges</h3>
          ${badges.length ? `<div class="achievement-grid compact-achievements">${badges.map((badge) => this.badgeCardHtml(badge, true)).join("")}</div>` : `<p class="muted detail-empty">Aucun badge pour l’instant.</p>`}
        </section>

        <section class="player-detail-section">
          <h3>Détail des scores</h3>
          ${this.playerScoreDetailsHtml(player.id)}
        </section>
      </div>
    `;

    document.body.appendChild(modal);
    const close = () => this.closeTeamPlayerModal();
    H.$("#closeTeamPlayerModalBtn", modal)?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    this.bindAchievementReplay(modal);
  },

  closeTeamPlayerModal() {
    H.$("#teamPlayerModal")?.remove();
  },

  teamCardHtml(team, players = []) {
    const color = team?.color || "#facc15";
    return `
      <article class="team-directory-card ${players.length ? "" : "is-empty"}" style="--team-color:${H.escapeHtml(color)}">
        <div class="team-directory-head">
          <span class="team-color-dot" aria-hidden="true"></span>
          <div>
            <h3>${H.escapeHtml(team?.name || "Sans team")}</h3>
            <p class="muted">${players.length} joueur${players.length > 1 ? "s" : ""}</p>
          </div>
        </div>
        <div class="team-player-list">
          ${players.length ? players.map((player) => {
            const profile = this.playerPublicProfile(player);
            const isMe = player.id === this.state.session.user.id;
            return `
              <button class="team-player-chip ${isMe ? "me" : ""}" type="button" data-player-id="${H.escapeHtml(player.id)}" aria-label="Voir la fiche de ${H.escapeHtml(player.pseudo || "ce joueur")}">
                ${H.profileBadgeHtml(profile, "profile-badge mini")}
                <div>
                  <strong>${H.escapeHtml(player.pseudo || "Joueur")}</strong>
                  <small>${isMe ? "Toi" : H.escapeHtml(profile.office_team_name || "Sans team")}</small>
                </div>
              </button>
            `;
          }).join("") : `<p class="muted team-empty-message">Aucun joueur dans cette team pour l’instant.</p>`}
        </div>
      </article>
    `;
  },

  chatMessageHtml(message) {
    const profile = this.playerPublicProfile({
      id: message.user_id,
      pseudo: message.author_pseudo || "Joueur",
      office_team_id: message.author_office_team_id || message.office_team_id,
      office_team_name: message.author_office_team_name || message.office_team_name,
      office_team_slug: message.author_office_team_slug,
      office_team_color: message.author_office_team_color || message.office_team_color,
      avatar_key: message.avatar_key || "owl-01",
      badge_shape: message.badge_shape || "rounded",
      badge_color: message.badge_color || message.author_office_team_color || message.office_team_color || "#facc15"
    });
    const isMe = message.user_id === this.state.session.user.id;
    return `
      <article class="team-chat-message ${isMe ? "me" : ""}">
        ${H.profileBadgeHtml(profile, "profile-badge mini")}
        <div class="team-chat-bubble">
          <div class="team-chat-meta">
            <strong>${H.escapeHtml(message.author_pseudo || "Joueur")}</strong>
            <span>${H.escapeHtml(message.scope === "team" ? (message.office_team_name || "Ma team") : "Tout le nid")}</span>
            <time>${H.formatDateTime(message.created_at)}</time>
          </div>
          <p>${H.escapeHtml(message.body)}</p>
        </div>
      </article>
    `;
  },

  async renderTeamsPage() {
    await Promise.all([
      this.loadPublicProfiles(),
      this.loadPlayerScoreRows(),
      this.loadWinnerPredictionsForTeams()
    ]);

    if (this.state.teamChatScope === "team" && !this.state.profile?.office_team_id) {
      this.state.teamChatScope = "global";
    }
    await this.loadTeamChatMessages();

    const root = H.$("#viewRoot");
    const myTeam = this.officeTeamById(this.state.profile?.office_team_id);
    const activePlayers = this.state.publicProfiles.filter((player) => player.profile_setup_done !== false);
    const teamDirectoryRows = this.state.officeTeams
      .map((team) => ({
        team,
        players: this.teamPlayers(team.id).filter((player) => player.profile_setup_done !== false)
      }))
      .filter(({ players }) => players.length > 0);
    const playersWithoutTeam = this.teamPlayers(null).filter((player) => player.profile_setup_done !== false);
    const visibleDirectoryTeamCount = teamDirectoryRows.length + (playersWithoutTeam.length ? 1 : 0);
    const chatScope = this.state.teamChatScope || "global";
    const chatUnavailable = Boolean(this.state.teamChatError);

    root.innerHTML = `
      <section class="hero-card teams-hero">
        <div>
          <p class="eyebrow">${H.icon("profile")} Les teams du nid</p>
          <h2>Les joueurs du nid, par équipe.</h2>
          <p class="muted">Retrouve tous les joueurs actifs, leur team bureau et le chat du tournoi.</p>
        </div>
        <div class="teams-hero-stats">
          <div><strong>${activePlayers.length}</strong><small>joueurs</small></div>
          <div><strong>${visibleDirectoryTeamCount}</strong><small>teams actives</small></div>
          <div><strong>${H.escapeHtml(myTeam?.name || "—")}</strong><small>ma team</small></div>
        </div>
      </section>

      <section class="grid teams-page-grid teams-chat-first">
        <section class="card team-chat-card is-top">
          <div class="card-title-row">
            <div>
              <h3>Messages</h3>
              <p class="muted">Le chat est placé en haut du nid. Écris à tout le monde ou seulement à ta team, par paquets de ${this.state.teamChatPageSize} messages.</p>
            </div>
          </div>

          <div class="segmented small team-chat-scope">
            <button class="${chatScope === "global" ? "active" : ""}" data-chat-scope="global" type="button">Tout le monde</button>
            <button class="${chatScope === "team" ? "active" : ""}" data-chat-scope="team" type="button" ${!myTeam ? "disabled" : ""}>Ma team</button>
          </div>

          ${chatUnavailable ? `
            <div class="chat-warning">
              <strong>Chat pas encore branché en base.</strong>
              <p>Lance les patchs SQL <code>patch_v0_25_0_les_teams_chat.sql</code> puis <code>patch_v0_25_1_teams_details_moderation.sql</code> dans Supabase, puis recharge l’app.</p>
              <small>${H.escapeHtml(this.state.teamChatError?.message || "Table ou vue manquante")}</small>
            </div>
          ` : `
            ${this.state.teamChatHasMore ? `<button class="ghost-btn load-more-chat-btn" id="loadMoreTeamChatBtn" type="button">Afficher plus de messages</button>` : ""}
            <div class="team-chat-list" id="teamChatList">
              ${this.state.teamChatMessages.length ? this.state.teamChatMessages.map((message) => this.chatMessageHtml(message)).join("") : `<p class="muted empty-chat">Aucun message ici pour l’instant. Ouvre le bal 🦉</p>`}
            </div>

            <form id="teamChatForm" class="team-chat-form">
              <input type="text" name="body" maxlength="600" placeholder="Ton message..." autocomplete="off" required>
              <button class="primary-btn" type="submit">Envoyer</button>
            </form>
          `}
        </section>

        <section class="card teams-directory-card">
          <div class="card-title-row">
            <div>
              <h3>Annuaire des teams du nid</h3>
              <p class="muted">Clique sur un joueur pour voir sa fiche : scores, badges et champion choisi.</p>
            </div>
            <button class="ghost-btn" id="refreshTeamsBtn" type="button">Rafraîchir</button>
          </div>
          <div class="teams-directory-grid">
            ${teamDirectoryRows.map(({ team, players }) => this.teamCardHtml(team, players)).join("")}
            ${playersWithoutTeam.length ? this.teamCardHtml({ name: "Sans team", color: "#94a3b8" }, playersWithoutTeam) : ""}
          </div>
        </section>
      </section>
    `;

    H.$("#refreshTeamsBtn")?.addEventListener("click", async () => {
      await this.renderTeamsPage();
      H.toast("Teams rafraîchies", "success");
    });

    H.$$('[data-chat-scope]').forEach((button) => {
      button.addEventListener("click", async () => {
        this.state.teamChatScope = button.dataset.chatScope || "global";
        this.state.teamChatLimit = this.state.teamChatPageSize;
        await this.renderTeamsPage();
      });
    });

    H.$$('[data-player-id]', root).forEach((button) => {
      button.addEventListener("click", () => this.openTeamPlayerModal(button.dataset.playerId));
    });

    H.$("#loadMoreTeamChatBtn")?.addEventListener("click", async () => {
      this.state.teamChatLimit += this.state.teamChatPageSize;
      await this.renderTeamsPage();
    });

    H.$("#teamChatForm")?.addEventListener("submit", (event) => this.sendTeamChatMessage(event));

    const chatList = H.$("#teamChatList");
    if (chatList) chatList.scrollTop = chatList.scrollHeight;
    this.markTeamChatAsSeen();
  },

  async sendTeamChatMessage(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = String(formData.get("body") || "").trim();
    if (!body) return;

    const scope = this.state.teamChatScope === "team" ? "team" : "global";
    const officeTeamId = scope === "team" ? this.state.profile?.office_team_id : null;
    if (scope === "team" && !officeTeamId) {
      H.toast("Tu dois avoir une team pour écrire dans le chat team.", "error");
      return;
    }

    const { error } = await window.sb
      .from("team_chat_messages")
      .insert({
        user_id: this.state.session.user.id,
        scope,
        office_team_id: officeTeamId,
        body
      });

    if (error) {
      H.toast(error.message, "error");
      return;
    }

    form.reset();
    this.state.teamChatLimit = Math.max(this.state.teamChatLimit, this.state.teamChatPageSize);
    await this.loadTeamChatMessages();
    await this.renderTeamsPage();
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
                    <td class="team-cell"><span class="group-team-inline">${flag}<span class="group-team-name">${H.escapeHtml(r.team_name)}</span></span></td>
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

    const avatarChoices = this.avatarChoices();
    const avatarGroups = avatarChoices.reduce((groups, avatar) => {
      const label = avatar.typeLabel || "Avatars";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(avatar);
      return groups;
    }, new Map());
    const avatarOptions = Array.from(avatarGroups.entries()).map(([typeLabel, avatars]) => `
      <section class="avatar-choice-section">
        <h4 class="avatar-type-title">${H.escapeHtml(typeLabel)}</h4>
        <div class="avatar-choice-grid">
          ${avatars.map((avatar) => `
            <label class="avatar-choice ${currentAvatar === avatar.key ? "selected" : ""}">
              <input type="radio" name="avatar_key" value="${H.escapeHtml(avatar.key)}" ${currentAvatar === avatar.key ? "checked" : ""}>
              <img src="${H.escapeHtml(H.avatarUrl(avatar.key))}" alt="${H.escapeHtml(avatar.label)}" loading="lazy" onerror="this.onerror=null;this.src='assets/avatars/nations-couleurs/owl-01-le-bleu-blanc-bougon.png';">
              <span>${H.escapeHtml(avatar.label)}</span>
            </label>
          `).join("")}
        </div>
      </section>
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
          ${H.profileBadgeHtml(this.visualProfile(profile), "profile-badge large")}
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
            <button class="ghost-btn" id="profileCreditsBtn" type="button">Crédits · v1.0.18</button>
            <button class="danger-btn" id="profileLogoutBtn" type="button">Déconnexion</button>
          </div>
        </div>
      </section>

      <section class="card profile-editor-card">
        <div class="card-title-row">
          <div>
            <h3>${setupDone ? "Modifier mon profil" : "Configuration du joueur"}</h3>
            <p class="muted">Avatar supporter, forme du badge et team bureau. La couleur du badge vient automatiquement de ta team.</p>
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
                <p class="muted small-note">90 chouettes disponibles, renommées et rangées par type pour s’y retrouver sans fouiller le nid.</p>
              </div>
              <button class="ghost-btn avatar-toggle-btn" id="toggleAvatarPanel" type="button" aria-expanded="false" aria-controls="avatarChoicePanel">Personnaliser l’avatar</button>
            </div>
            <div class="avatar-choice-panel" id="avatarChoicePanel" hidden>
              <div class="avatar-choice-grouped">${avatarOptions}</div>
            </div>
          </div>

          <div class="grid two badge-settings-grid">
            <div>
              <span class="field-title">Forme du badge</span>
              <div class="shape-choice-grid">${shapeOptions}</div>
            </div>
            <div>
              <span class="field-title">Couleur du badge</span>
              <input type="hidden" name="badge_color" value="${H.escapeHtml(teamColor)}">
              <div class="team-color-linked-card" id="teamColorLinkedCard" style="--choice-color:${H.escapeHtml(teamColor)}">
                <span class="team-color-dot"></span>
                <div>
                  <strong>${H.escapeHtml(team?.name || "Team à choisir")}</strong>
                  <small>Couleur héritée automatiquement de ta team.</small>
                </div>
              </div>
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
      const hiddenBadgeColor = form.querySelector('input[name="badge_color"]');
      if (hiddenBadgeColor) hiddenBadgeColor.value = nextTeamColor;
      const teamColorCard = H.$("#teamColorLinkedCard");
      if (teamColorCard) {
        teamColorCard.style.setProperty("--choice-color", nextTeamColor);
        const strong = teamColorCard.querySelector("strong");
        if (strong) strong.textContent = selectedTeam?.name || "Team à choisir";
      }
      const next = {
        pseudo: formData.get("pseudo") || profile.pseudo,
        office_team_id: selectedTeamId,
        office_team_name: selectedTeam?.name,
        office_team_slug: selectedTeam?.slug,
        office_team_color: nextTeamColor,
        avatar_key: formData.get("avatar_key") || currentAvatar,
        badge_shape: formData.get("badge_shape") || currentShape,
        badge_color: nextTeamColor
      };
      preview.innerHTML = H.profileBadgeHtml(next, "profile-badge large");
      H.$$(".avatar-choice", form).forEach((label) => label.classList.toggle("selected", label.querySelector("input")?.checked));
      H.$$(".shape-choice", form).forEach((label) => label.classList.toggle("selected", label.querySelector("input")?.checked));
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
          badge_color: formData.get("badge_color") || this.teamColorForProfile({ office_team_id: formData.get("office_team_id") }),
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
      this.loadGroupStandings(),
      this.loadMyPredictions(),
      this.loadVisiblePredictions(),
      this.loadWinnerPrediction()
    ]);

    this.syncAchievementNotifications();

    if (["home", "matches", "worldcup", "mypredictions", "leaderboard", "teams", "achievements", "profile"].includes(this.state.currentView)) {
      await this.loadView(this.state.currentView === "mypredictions" ? "matches" : this.state.currentView);
    }

    this.syncAchievementNotifications();

    if (reason === "matches") {
      H.toast("Scores / matchs mis à jour", "info");
    }
  },

  setupRealtime() {
    window.sb
      .channel("app-realtime-v0-26-1")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, async () => {
        await this.refreshCurrentViewFromRealtime("matches");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "prediction_points" }, async () => {
        await this.refreshCurrentViewFromRealtime("points");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "predictions" }, async () => {
        await this.loadMyPredictions();
        await this.loadVisiblePredictions();
        this.syncAchievementNotifications();
        if (["matches", "mypredictions"].includes(this.state.currentView)) await this.loadView(this.state.currentView === "mypredictions" ? "matches" : this.state.currentView);
        this.syncAchievementNotifications();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "winner_predictions" }, async () => {
        await this.refreshCurrentViewFromRealtime("winner");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "team_chat_messages" }, async (payload) => {
        await this.handleTeamChatRealtime(payload);
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
