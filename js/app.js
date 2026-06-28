// ============================================================
// LE NID DES PRONOS — APP PRINCIPALE V1.9.4
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
    secondWinnerPrediction: null,
    matches: [],
    groupStandings: [],
    myPredictions: [],
    visiblePredictions: [],
    miniRecordPredictionCounts: [],
    manualBadges: [],
    familyInvites: [],
    blockedUserIds: new Set(),
    appSettings: {},
    owlMessages: [],
    owlPollVotes: {},
    owlPollResults: {},
    owlPollVoteDetails: {},
    publicProfiles: [],
    playerScoreRows: [],
    winnerPredictions: [],
    secondWinnerPredictions: [],
    winnerPredictionsError: null,
    teamSelectedPlayerId: null,
    teamChatMessages: [],
    teamChatScope: "global",
    activePrivateThreadId: null,
    teamChatLimit: 10,
    teamChatPageSize: 20,
    teamChatHasMore: false,
    teamChatError: null,
    teamChatRefreshTimer: null,
    unreadTeamChatScopes: new Set(),
    chatReactions: [
      // Les clés restent compatibles avec le patch SQL V1.2.0/V1.2.1.
      // Les labels et fichiers correspondent aux nouveaux stickers hibou.
      { key: "ball", label: "LOL", file: "assets/reactions/reaction-lol.png" },
      { key: "fire", label: "Chaud", file: "assets/reactions/reaction-chaud.png" },
      { key: "cry", label: "Oups...", file: "assets/reactions/reaction-oups.png" },
      { key: "eyes", label: "Coeur", file: "assets/reactions/reaction-coeur.png" },
      { key: "laugh", label: "Approuvé", file: "assets/reactions/reaction-approuve.png" },
      { key: "owl", label: "Casserole", file: "assets/reactions/reaction-casserole.png" }
    ],
    hasUnreadTeamMessages: false,
    currentView: "home",
    matchesTab: "upcoming",
    leaderboardTab: "players",
    playerLeaderboardMode: "overall",
    teamTab: "average",
    teamLeaderboardScope: "overall",
    familyLeaderboardTab: "players",
    familyPlayerLeaderboardMode: "overall",
    familyTeamTab: "average",
    familyTeamLeaderboardScope: "overall",
    familyLeaderboardPhaseIndex: 0,
    familyTeamLeaderboardPhaseIndex: 0,
    familyLeaderboardEvolutionMode: "day",
    achievementsTab: "mine",
    worldcupTab: "groups",
    finalBracketActiveRound: null,
    finalBracketExpandedMatchNumber: null,
    matchPhaseIndex: 0,
    myPredictionsPhaseIndex: 0,
    leaderboardPhaseIndex: 0,
    teamLeaderboardPhaseIndex: 0,
    leaderboardEvolutionMode: "day",
    evolutionZoomMap: {},
    evolutionWindowMap: {},
    evolutionFocusMap: {},
    rankSentinelQueue: [],
    rankSentinelModalOpen: false,
    rankSentinelLastSnapshot: null,
    rankSentinelPreviousSnapshot: null,
    rankSentinelMovementMaps: { official: {}, family: {} },
    achievementNotificationQueue: [],
    achievementModalOpen: false,
    achievementNotificationTimer: null,
    achievementResyncTimers: [],
    homeRecordCarouselTimer: null,
    homeCountdownTimer: null,
    lastAchievementIds: null,
    predictionAutoSaveTimers: new Map()
  },


  appStoragePrefix() {
    return `nid-pronos:${this.state.session?.user?.id || "anonymous"}`;
  },

  lastViewStorageKey() {
    return `${this.appStoragePrefix()}:last-view`;
  },

  readLastView() {
    try {
      return localStorage.getItem(this.lastViewStorageKey()) || "";
    } catch (error) {
      return "";
    }
  },

  rememberLastView(viewName) {
    try {
      if (viewName && viewName !== "mypredictions") localStorage.setItem(this.lastViewStorageKey(), viewName);
    } catch (error) {
      // LocalStorage peut être indisponible en navigation privée stricte.
    }
  },

  initialRequestedView() {
    const allowedViews = ["home", "matches", "worldcup", "leaderboard", "teams", "achievements", "profile"];
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("view");
    const raw = fromQuery || this.readLastView() || "home";
    const normalized = raw === "mypredictions" ? "matches" : raw;
    return allowedViews.includes(normalized) ? normalized : "home";
  },

  async init() {
    this.state.session = await Auth.requireSession();
    if (!this.state.session) return;

    this.bindNavigation();
    this.bindMobileMenu();
    this.bindGlobalActions();
    await this.loadBaseData();
    if (this.state.profile?.is_banned) {
      H.toast("Compte désactivé par l’administration.", "error");
      await Auth.logout();
      return;
    }
    const requestedView = this.initialRequestedView();
    const mustChangePassword = this.passwordChangeRequired();
    const mustCompleteProfile = !this.profileSetupComplete();
    this.syncAchievementNotifications({ silent: !this.hasAchievementNotificationStore() });
    await this.loadView((mustChangePassword || mustCompleteProfile) ? "profile" : requestedView);
    this.maybeShowLoginOwlMessage();
    await this.refreshTeamChatUnreadIndicator();
    if (mustChangePassword) {
      H.toast("Mot de passe temporaire : choisis ton nouveau mot de passe.", "info");
      setTimeout(() => this.openForcedPasswordChangeModal(), 80);
    } else if (mustCompleteProfile) {
      H.toast("Bienvenue ! Choisis ton pseudo, ta team et ton avatar pour entrer dans le nid.", "info");
      setTimeout(() => this.openFirstLoginModal(), 80);
    }
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

  teamChatSeenKey(scope = "global") {
    return `nid-team-chat-last-seen:${this.state.session?.user?.id || "anonymous"}:${scope || "global"}`;
  },

  getTeamChatLastSeenAt(scope = "global") {
    try {
      const raw = localStorage.getItem(this.teamChatSeenKey(scope));
      return raw ? new Date(raw) : null;
    } catch (error) {
      return null;
    }
  },

  setTeamChatLastSeenNow(scope = this.state.teamChatScope || "global") {
    try {
      localStorage.setItem(this.teamChatSeenKey(scope), new Date().toISOString());
    } catch (error) {
      console.warn("Impossible d’enregistrer la lecture du chat", error);
    }
  },

  markTeamChatAsSeen(scope = this.state.teamChatScope || "global") {
    const normalizedScope = this.normalizeChatScope(scope);
    this.setTeamChatLastSeenNow(normalizedScope);
    this.state.unreadTeamChatScopes?.delete(normalizedScope);
    this.state.hasUnreadTeamMessages = Boolean(this.state.unreadTeamChatScopes?.size);
    this.updateTeamUnreadIndicators();
  },

  updateTeamUnreadIndicators() {
    this.state.hasUnreadTeamMessages = Boolean(this.state.unreadTeamChatScopes?.size);
    const shouldShow = Boolean(this.state.hasUnreadTeamMessages && this.state.currentView !== "teams");
    H.$$('[data-view="teams"]').forEach((btn) => {
      btn.classList.toggle("has-unread", shouldShow);
      btn.setAttribute("aria-label", shouldShow ? "Les teams du nid — nouveau message non lu" : "Les teams du nid");
    });
    H.$$("[data-chat-scope]").forEach((btn) => {
      const hasUnread = this.state.unreadTeamChatScopes?.has(btn.dataset.chatScope);
      btn.classList.toggle("has-scope-unread", Boolean(hasUnread));
      btn.setAttribute("aria-label", hasUnread ? `${btn.textContent.trim()} — nouveau message non lu` : btn.textContent.trim());
    });
  },

  async refreshTeamChatUnreadIndicator() {
    if (!this.state.session?.user?.id) return;
    const ownUserId = this.state.session.user.id;
    const unreadScopes = new Set();

    const hasUnreadForScope = async (scope) => {
      const lastSeen = this.getTeamChatLastSeenAt(scope);
      if (!lastSeen || Number.isNaN(lastSeen.getTime())) {
        this.setTeamChatLastSeenNow(scope);
        return false;
      }

      let query = window.sb
        .from("v_team_chat_messages")
        .select("id,created_at,user_id,scope,office_team_id")
        .eq("scope", scope)
        .neq("user_id", ownUserId)
        .gt("created_at", lastSeen.toISOString())
        .order("created_at", { ascending: false })
        .limit(8);

      if (this.chatScopeNeedsTeam(scope) && this.state.profile?.office_team_id) {
        query = query.eq("office_team_id", this.state.profile.office_team_id);
      }

      const { data, error } = await query;
      if (error) {
        console.warn("Indicateur messages non lus indisponible", error);
        return false;
      }

      return Boolean(this.filterBlockedMessages(data || []).length);
    };

    const scopes = this.availableChatScopes();
    const results = await Promise.all(scopes.map(async (scope) => [scope.key, await hasUnreadForScope(scope.key)]));

    results.forEach(([scope, hasUnread]) => {
      if (hasUnread && scope !== this.state.teamChatScope) unreadScopes.add(scope);
      if (hasUnread && this.state.currentView !== "teams") unreadScopes.add(scope);
    });

    this.state.unreadTeamChatScopes = unreadScopes;
    this.state.hasUnreadTeamMessages = unreadScopes.size > 0;
    this.updateTeamUnreadIndicators();
  },

  teamChatRealtimeMessageIsVisible(message = {}) {
    if (!message || message.user_id === this.state.session?.user?.id) return false;
    if (message.deleted_at) return false;
    const isFamilyAuthor = message.author_player_scope === "family" || message.author_role === "family";
    if (message.scope === "private") return message.recipient_id === this.state.session?.user?.id;
    if ((isFamilyAuthor || this.isFamilyChatScope(message.scope)) && !this.canSeeFamily()) return false;
    if (this.isFamily(this.state.profile) && !this.isFamilyChatScope(message.scope)) return false;
    if (message.scope === "global" || message.scope === "family_global") return true;
    return (message.scope === "team" || message.scope === "family_team") && message.office_team_id === this.state.profile?.office_team_id;
  },

  async handleTeamChatRealtime(payload = {}) {
    const messageScope = payload.new?.scope;

    if (payload.eventType === "INSERT" && this.teamChatRealtimeMessageIsVisible(payload.new)) {
      if (this.state.currentView === "teams" && messageScope === this.state.teamChatScope) {
        await this.loadTeamChatMessages();
        await this.renderTeamsPage();
        return;
      }

      if (messageScope) {
        this.state.unreadTeamChatScopes?.add(messageScope);
        this.state.hasUnreadTeamMessages = true;
        this.updateTeamUnreadIndicators();
        return;
      }
    }

    if (this.state.currentView === "teams") {
      await this.loadTeamChatMessages();
      await this.renderTeamsPage();
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

  passwordChangeRequired(p = this.state.profile) {
    return Boolean(p?.force_password_change);
  },

  isSuperAdmin(profile = this.state.profile) {
    return profile?.role === "super_admin";
  },

  isScoreAdmin(profile = this.state.profile) {
    return profile?.role === "admin" || profile?.role === "super_admin";
  },

  isFamily(profile = this.state.profile) {
    return Boolean(
      profile?.role === "family"
      || profile?.player_scope === "family"
      || profile?.invited_by
      || profile?.family_invite_id
      || profile?.family_invite_code
    );
  },

  canSeeFamily() {
    // Le mode Famille doit rester transparent pour chaque joueur, y compris super_admin.
    // Si le joueur décoche l’option dans son profil, aucune zone Famille ne remonte
    // dans les écrans publics : classements, teams, chat, fiches joueurs, etc.
    if (this.isFamily()) return true;
    if (!this.familyModeEnabled()) return false;
    return Boolean(this.state.profile?.show_family_players);
  },

  roleLabel(role, scope) {
    if (role === "super_admin") return "Super admin";
    if (role === "admin") return "Admin matchs";
    if (role === "family" || scope === "family") return "Famille";
    return "Joueur";
  },

  officialProfiles(profiles = this.state.publicProfiles) {
    return (profiles || []).filter((player) => !this.isFamily(player));
  },

  visiblePublicProfiles(profiles = this.state.publicProfiles) {
    return this.canSeeFamily() ? profiles : this.officialProfiles(profiles);
  },

  familyProfiles(profiles = this.state.publicProfiles) {
    // Univers Famille = comptes Famille + comptes créés via coupon + joueurs UIS qui ont explicitement activé le mode Famille.
    // Le test invited_by/family_invite permet de récupérer les comptes Famille mal normalisés en base.
    return (profiles || []).filter((player) => {
      if (this.isFamily(player)) return true;
      return Boolean(player.show_family_players);
    });
  },

  familyProfileIds(profiles = this.state.publicProfiles) {
    return new Set(this.familyProfiles(profiles).map((player) => String(player.id || player.user_id)));
  },

  filterBlockedMessages(messages = []) {
    const blocked = this.state.blockedUserIds || new Set();
    return messages.filter((message) => {
      if (blocked.has(String(message.user_id))) return false;
      const isFamilyAuthor = message.author_player_scope === "family" || message.author_role === "family";
      if ((isFamilyAuthor || this.isFamilyChatScope(message.scope)) && !this.canSeeFamily()) return false;
      if (this.isFamily(this.state.profile) && !this.isFamilyChatScope(message.scope)) return false;
      return true;
    });
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
        <button class="modal-x-btn" id="closeCreditsBtn" type="button" aria-label="Fermer les crédits">×</button>
        <div class="card-title-row">
          <div>
            <p class="eyebrow">Crédits cachés</p>
            <h2 id="creditsTitle">Le Nid des Pronos</h2>
            <p class="muted">Version publique <strong>1.9.4</strong> · Teams du Nid réorganisées : onglets clairs, MP par destinataire et messages teintés par team.</p>
          </div>
        </div>
        <div class="credits-grid">
          <section>
            <h3>Version actuelle</h3>
            <p><strong>1.3.0</strong> — reset lancement complet, autosauvegarde immédiate des pronos sans bouton Valider, bilan PDF collector, diplôme paysage et journal plus lisible.</p>
            <p><strong>1.2.4</strong> — super admin : bouton pour masquer/réactiver le module préparation, règles et classements nettoyés, barre admin desktop améliorée.</p>
            <p><strong>1.2.3</strong> — super admin : coupons Famille bonus, réinitialisation des invitations et vue détaillée des invités.</p>
            <p><strong>1.2.0</strong> — nouveau tchat : salons Général / Team / Famille / Team Famille, chargement des anciens messages, réactions PNG, blocage individuel renforcé.</p>
            <p><strong>1.2.0</strong> — refonte des classements Famille et amélioration du bloc Mode Famille dans le profil.</p>
            <p><strong>1.0.18</strong> — mini-record “Greffier du grimoire” : date fournie par Supabase et égalités conservées par le premier détenteur.</p>
            <p><strong>1.0.15</strong> — les mini-records deviennent des trophées dynamiques : un seul détenteur actuel par record, calculé sur tous les joueurs.</p>
            <p><strong>1.0.13</strong> — ajout du badge “Descente du bus impossible” quand le champion pronostiqué reste bloqué en phase de groupes.</p>
            <p><strong>1.0.5</strong> — dashboard mobile/desktop stabilisé, sans chevauchement des cartes.</p>
          </section>
          <section>
            <h3>Évolutions V1.9.4</h3>
            <ul class="changelog-list">
              <li>Le super admin peut désactiver ou réactiver l’affichage du module préparation.</li>
              <li>Quand la préparation est désactivée, les matchs test disparaissent des matchs/pronos, classements par phase et règles.</li>
              <li>Les 2 badges de préparation restent visibles dans les exploits.</li>
              <li>La barre admin desktop affiche aussi les icônes Retour, Rafraîchir et Déconnexion.</li>
            </ul>
          </section>
          <section>
            <h3>Crédits</h3>
            <p>Application : Le Nid des Pronos · pronostics, chouettes, teams et mauvaise foi sportive assumée.</p>
            <p>Version publique couvée au chaud par Parkaf, testée au bec et approuvée par le Grand Hibou du Nid.</p>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    H.$("#closeCreditsBtn", modal).addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  },


  openPwaInstallGuide() {
    H.$("#pwaInstallGuideModal")?.remove();

    const modal = document.createElement("div");
    modal.id = "pwaInstallGuideModal";
    modal.className = "modal-backdrop pwa-install-modal";
    modal.innerHTML = `
      <div class="modal-card pwa-install-card" role="dialog" aria-modal="true" aria-labelledby="pwaInstallTitle">
        <button class="modal-x-btn" id="closePwaInstallGuideBtn" type="button" aria-label="Fermer le tutoriel">×</button>

        <div class="pwa-install-hero">
          <div>
            <p class="eyebrow">${H.icon("home")} Installer l’application</p>
            <h2 id="pwaInstallTitle">Mets le Nid sur ton écran d’accueil</h2>
            <p class="muted">Une fois installé, Le Nid s’ouvre comme une vraie petite appli : plus rapide à retrouver, plus propre, et le hibou reste à portée de pouce.</p>
          </div>
          <div class="pwa-phone-preview" aria-hidden="true">
            ${H.icon("profile")}
            <strong>Le Nid</strong>
            <small>Pronos</small>
          </div>
        </div>

        <div class="pwa-install-tabs" role="tablist" aria-label="Choisir son navigateur">
          <button class="active" type="button" data-pwa-tab="chrome">Chrome</button>
          <button type="button" data-pwa-tab="safari">Safari iPhone</button>
          <button type="button" data-pwa-tab="desktop">Ordinateur</button>
        </div>

        <div class="pwa-install-panels">
          <section class="pwa-install-panel active" data-pwa-panel="chrome">
            <h3>Chrome sur Android</h3>
            <ol class="pwa-steps">
              <li><span>1</span><p>Ouvre le site dans <strong>Chrome</strong>.</p></li>
              <li><span>2</span><p>Appuie sur les <strong>3 points ⋮</strong> à droite de la barre d’adresse.</p></li>
              <li><span>3</span><p>Choisis <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.</p></li>
              <li><span>4</span><p>Valide avec <strong>Installer</strong> ou <strong>Ajouter</strong>.</p></li>
              <li><span>5</span><p>L’icône du Nid apparaît sur ton téléphone. Touchdown hibou.</p></li>
            </ol>
            <p class="pwa-tip">Astuce : si Chrome affiche “Créer un raccourci” au lieu de “Installer”, tu peux quand même l’ajouter à l’écran d’accueil.</p>
          </section>

          <section class="pwa-install-panel" data-pwa-panel="safari">
            <h3>Safari sur iPhone / iPad</h3>
            <ol class="pwa-steps">
              <li><span>1</span><p>Ouvre le site dans <strong>Safari</strong>.</p></li>
              <li><span>2</span><p>Appuie sur le bouton <strong>Partager</strong> <em>□↑</em>.</p></li>
              <li><span>3</span><p>Descends dans la liste et choisis <strong>Sur l’écran d’accueil</strong>.</p></li>
              <li><span>4</span><p>Garde le nom <strong>Le Nid des Pronos</strong> ou raccourcis-le en <strong>Le Nid</strong>.</p></li>
              <li><span>5</span><p>Appuie sur <strong>Ajouter</strong>.</p></li>
            </ol>
            <p class="pwa-tip">Si l’option n’apparaît pas : ouvre bien le site avec Safari, pas depuis une prévisualisation de message.</p>
          </section>

          <section class="pwa-install-panel" data-pwa-panel="desktop">
            <h3>Chrome sur ordinateur</h3>
            <ol class="pwa-steps">
              <li><span>1</span><p>Ouvre le site dans <strong>Chrome</strong> sur PC/Mac.</p></li>
              <li><span>2</span><p>Regarde dans la barre d’adresse : une petite icône <strong>Installer</strong> peut apparaître.</p></li>
              <li><span>3</span><p>Sinon, ouvre les <strong>3 points ⋮</strong>, puis cherche <strong>Installer Le Nid des Pronos</strong>.</p></li>
              <li><span>4</span><p>Valide : l’application s’ouvre dans sa propre fenêtre.</p></li>
            </ol>
            <p class="pwa-tip">Sur ordinateur, si le bouton n’est pas proposé, le site reste utilisable normalement dans le navigateur.</p>
          </section>
        </div>

        <div class="pwa-install-footer">
          <button class="ghost-btn" type="button" id="closePwaInstallGuideBottomBtn">J’ai compris</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    H.$("#closePwaInstallGuideBtn", modal)?.addEventListener("click", close);
    H.$("#closePwaInstallGuideBottomBtn", modal)?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });

    H.$$("[data-pwa-tab]", modal).forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.pwaTab;
        H.$$("[data-pwa-tab]", modal).forEach((tab) => tab.classList.toggle("active", tab === button));
        H.$$("[data-pwa-panel]", modal).forEach((panel) => panel.classList.toggle("active", panel.dataset.pwaPanel === key));
      });
    });
  },

  openRulesModal() {
    H.$("#rulesModal")?.remove();
    const modal = document.createElement("div");
    modal.id = "rulesModal";
    modal.className = "modal-backdrop rules-modal";
    const preparationEnabled = this.preparationModuleEnabled();
    modal.innerHTML = `
      <div class="modal-card rules-card" role="dialog" aria-modal="true" aria-labelledby="rulesTitle">
        <button class="modal-x-btn" id="closeRulesBtn" type="button" aria-label="Fermer les règles">×</button>
        <div class="card-title-row">
          <div>
            <p class="eyebrow">${H.icon("list")} Règles du nid</p>
            <h2 id="rulesTitle">Comment les points tombent</h2>
            <p class="muted">Les matchs officiels comptent pour le classement Coupe du monde. Les pronos restent cachés jusqu’au coup d’envoi.</p>
          </div>
        </div>
        <div class="rules-grid">
          <article><strong>Score exact</strong><span>Tu poses le score pile comme au coup de sifflet final. Le hibou sort les confettis.</span><b>+5 pts</b></article>
          <article><strong>Bon résultat</strong><span>Tu trouves le bon sens du match : victoire, nul ou défaite, même si le score n’est pas exact.</span><b>+3 pts</b></article>
          <article><strong>Bon écart</strong><span>Tu ne trouves pas forcément le score, mais tu trouves le bon écart de buts. Exemple : tu pronostiques 2-0 et le match finit 3-1.</span><b>+1 pt</b></article>
          <article><strong>Phase finale</strong><span>Dans un match couperet, l’important est aussi de deviner quel oiseau reste perché. Si tu choisis la bonne équipe qualifiée, même après prolongation ou tirs au but, tu gagnes le bonus.</span><b>+2 pts</b></article>
          <article><strong>Champion du monde</strong><span>Ton grand favori, choisi avant le début de la Coupe du monde, soulève le trophée à la fin.</span><b>+${this.championFirstBonusPoints()} pts</b></article>
          <article><strong>2e choix champion</strong><span>Avant la phase finale, tu peux remettre une pièce sur le futur champion. Bonus plus petit, mais toujours piquant.</span><b>+${this.championSecondBonusPoints()} pts</b></article>
          ${preparationEnabled ? `<article><strong>Matchs test</strong><span>France–Côte d’Ivoire et France–Irlande du Nord servent uniquement à tester le nid avant le vrai envol.</span><b>0 pt classement</b></article>` : ""}
        </div>
        ${preparationEnabled ? `
          <div class="rules-note">
            <strong>Préparation du nid</strong>
            <p>Les 2 matchs de préparation sont bien des matchs test : ils ne comptent pas dans le classement Coupe du monde, ne comptent pas dans les graphiques et ne débloquent pas les exploits normaux. Ils servent à vérifier que les pronos, les scores et les popups fonctionnent avant le début officiel.</p>
            <p>Ils peuvent seulement débloquer les badges spéciaux de préparation : <strong>Préparation du nid</strong> si tu pronostiques les 2 matchs, et <strong>Test concluant</strong> si tu pronostiques bien au moins 1 match sur les 2.</p>
          </div>
        ` : ""}
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    H.$("#closeRulesBtn", modal)?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  },

  async loadBaseData() {
    await this.loadProfile();

    await Promise.all([
      this.loadOfficeTeams(),
      this.loadFootballTeams(),
      this.loadActiveCompetition(),
      this.loadMatches(),
      this.loadGroupStandings(),
      this.loadMyPredictions(),
      this.loadVisiblePredictions(),
      this.loadAppSettings(),
      this.loadOwlMessages(),
      this.loadBlockedUsers()
    ]);

    await Promise.all([
      this.loadPublicProfiles(),
      this.loadWinnerPrediction(),
      this.loadSecondWinnerPrediction(),
      this.loadMiniRecordPredictionCounts(),
      this.loadManualBadges(),
      this.loadPlayerScoreRows(),
      this.loadMyFamilyInvites()
    ]);
    this.renderShell();
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

  hasKnownMatchTeams(match = {}) {
    const bad = (value = "") => {
      const label = String(value || "").trim();
      return /^(tbd|à déterminer|a determiner|1st group|2nd group|3rd group|winner|runner-up|loser|vainqueur|perdant)/i.test(label)
        || /^(m|match)\s*(7[3-9]|8[0-9]|9[0-9]|10[0-4])\b/i.test(label)
        || /\b(à définir|a definir|to be decided|to be confirmed)\b/i.test(label);
    };
    return Boolean(match.home_team_id && match.away_team_id)
      && !bad(match.home_team_name)
      && !bad(match.away_team_name)
      && !bad(match.home_team_short_name)
      && !bad(match.away_team_short_name);
  },


  async selectAllRows(tableName, options = {}) {
    const pageSize = Math.max(100, Math.min(Number(options.pageSize || 1000), 1000));
    const orderColumn = options.orderColumn || "id";
    const ascending = options.ascending !== false;
    const rows = [];
    let from = 0;

    while (true) {
      let query = window.sb
        .from(tableName)
        .select(options.select || "*");

      if (orderColumn) {
        query = query.order(orderColumn, { ascending });
      }

      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error) return { data: rows, error };

      const page = data || [];
      rows.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    return { data: rows, error: null };
  },

  async loadProfile() {
    const userId = this.state.session.user.id;
    const { data, error } = await window.sb
      .from("profiles")
      .select("id,email,pseudo,role,player_scope,show_family_players,invited_by,force_password_change,is_banned,can_chat,can_predict,can_change_avatar,can_change_pseudo,office_team_id,is_active,avatar_key,badge_shape,badge_color,profile_setup_done,featured_badge_ids")
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
    this.state.footballTeams = (data || []).map((row) => this.normalizeTeamLabels(row));
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



  async loadSecondWinnerPrediction() {
    if (!this.state.activeCompetition) {
      this.state.secondWinnerPrediction = null;
      return;
    }

    const { data, error } = await window.sb
      .from("second_winner_predictions")
      .select("*")
      .eq("user_id", this.state.session.user.id)
      .eq("competition_id", this.state.activeCompetition.id)
      .maybeSingle();

    if (error) {
      console.warn("second_winner_predictions indisponible : lance le patch SQL V1.6.0", error);
      this.state.secondWinnerPrediction = null;
      return;
    }

    this.state.secondWinnerPrediction = data || null;
  },

  async loadPlayerScoreRows() {
    const { data, error } = await this.selectAllRows("v_leaderboard_overall", {
      orderColumn: "rank",
      pageSize: 1000
    });

    if (error) {
      console.warn("Classement indisponible pour les fiches joueurs", error);
      this.state.playerScoreRows = [];
      return;
    }

    this.state.playerScoreRows = data || [];
    this.observeRankSentinel("leaderboard-load");
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

  async loadAppSettings() {
    const { data, error } = await window.sb
      .from("app_settings")
      .select("key,value")
      .in("key", ["family_mode_enabled", "preparation_module_enabled", "graph_preview_test_matches_enabled", "graph_mock_preview_enabled", "home_progress_include_test_matches", "live_demo_match_enabled", "login_owl_message", "champion_bonus_initial_points", "champion_bonus_second_points"]);

    if (error) {
      console.warn("Paramètres app indisponibles", error);
      this.state.appSettings = {};
      return;
    }

    this.state.appSettings = Object.fromEntries((data || []).map((row) => [row.key, row.value]));
  },




  async loadOwlMessages() {
    const nowIso = new Date().toISOString();
    const { data, error } = await window.sb
      .from("owl_messages")
      .select("id,title,body,importance,start_at,end_at,duration_days,enabled,show_in_history,poll_enabled,poll_question,poll_options,poll_end_at,created_at,updated_at")
      .eq("enabled", true)
      .eq("show_in_history", true)
      .lte("start_at", nowIso)
      .order("start_at", { ascending: false })
      .limit(100);

    if (error) {
      console.warn("Messages Hibou indisponibles : lance le patch SQL V1.6.4", error);
      this.state.owlMessages = [];
      return;
    }

    this.state.owlMessages = data || [];
    await this.loadMyOwlPollVotes();
    await this.loadOwlPollResults();
    await this.loadOwlPollVoteDetails();
  },

  owlPollMessageIds() {
    return (this.state.owlMessages || [])
      .filter((message) => message.poll_enabled)
      .map((message) => message.id)
      .filter(Boolean);
  },

  async loadMyOwlPollVotes() {
    const ids = this.owlPollMessageIds();
    if (!ids.length || !this.state.session?.user?.id) {
      this.state.owlPollVotes = {};
      return;
    }

    const { data, error } = await window.sb
      .from("owl_message_votes")
      .select("message_id,option_key,created_at,updated_at")
      .eq("user_id", this.state.session.user.id)
      .in("message_id", ids);

    if (error) {
      console.warn("Votes de sondage Hibou indisponibles : lance le patch SQL V1.9.4", error);
      this.state.owlPollVotes = {};
      return;
    }

    this.state.owlPollVotes = Object.fromEntries((data || []).map((vote) => [String(vote.message_id), vote]));
  },

  async loadOwlPollResults(messageIds = null) {
    const ids = Array.isArray(messageIds) && messageIds.length ? messageIds.filter(Boolean) : this.owlPollMessageIds();
    if (!ids.length) {
      this.state.owlPollResults = {};
      return;
    }

    const { data, error } = await window.sb
      .from("v_admin_owl_poll_results")
      .select("message_id,option_key,option_label,votes_count")
      .in("message_id", ids);

    if (error) {
      console.warn("Résultats de sondage Hibou indisponibles : lance le patch SQL corrigé V1.8.30c", error);
      return;
    }

    const previous = messageIds ? { ...(this.state.owlPollResults || {}) } : {};
    ids.forEach((id) => { delete previous[String(id)]; });
    for (const row of data || []) {
      const key = String(row.message_id);
      if (!previous[key]) previous[key] = [];
      previous[key].push(row);
    }
    this.state.owlPollResults = previous;
  },

  async loadOwlPollVoteDetails(messageIds = null) {
    const ids = Array.isArray(messageIds) && messageIds.length ? messageIds.filter(Boolean) : this.owlPollMessageIds();
    if (!ids.length) {
      this.state.owlPollVoteDetails = {};
      return;
    }

    const { data, error } = await window.sb
      .from("v_owl_poll_vote_details")
      .select("message_id,option_key,option_label,user_id,pseudo,voted_at")
      .in("message_id", ids);

    if (error) {
      console.warn("Détail des votes Hibou indisponible : lance le patch SQL V1.9.4", error);
      return;
    }

    const previous = messageIds ? { ...(this.state.owlPollVoteDetails || {}) } : {};
    ids.forEach((id) => { delete previous[String(id)]; });
    for (const row of data || []) {
      const key = String(row.message_id);
      if (!previous[key]) previous[key] = [];
      previous[key].push(row);
    }
    this.state.owlPollVoteDetails = previous;
  },


  activeLoginOwlMessage() {
    const now = Date.now();
    const fromTable = (this.state.owlMessages || []).find((message) => {
      if (!message || message.enabled === false) return false;
      const start = message.start_at ? new Date(message.start_at).getTime() : 0;
      const end = message.end_at ? new Date(message.end_at).getTime() : 0;
      if (start && now < start) return false;
      if (end && now > end) return false;
      return Boolean(String(message.body || message.message || "").trim());
    });
    if (fromTable) return fromTable;

    const message = this.state.appSettings?.login_owl_message;
    if (!message || typeof message !== "object" || message.enabled === false) return null;
    const start = message.start_at ? new Date(message.start_at).getTime() : 0;
    const end = message.end_at ? new Date(message.end_at).getTime() : 0;
    if (start && now < start) return null;
    if (end && now > end) return null;
    if (!String(message.body || message.message || "").trim()) return null;
    return message;
  },

  loginOwlMessageDismissKey(message) {
    const signature = message.id || message.updated_at || `${message.start_at || ""}:${message.end_at || ""}:${message.body || message.message || ""}`;
    return `${this.appStoragePrefix()}:login-owl-message:${btoa(unescape(encodeURIComponent(signature))).slice(0, 40)}`;
  },

  maybeShowLoginOwlMessage() {
    const message = this.activeLoginOwlMessage();
    if (!message) return;
    const key = this.loginOwlMessageDismissKey(message);
    try {
      if (localStorage.getItem(key) === "dismissed") return;
    } catch (error) {}
    window.setTimeout(() => this.openLoginOwlMessageModal(message, key), 180);
  },

  owlPollOpen(message = {}) {
    if (!message.poll_enabled) return false;
    if (!Array.isArray(message.poll_options) || message.poll_options.length < 2) return false;
    const end = message.poll_end_at ? new Date(message.poll_end_at).getTime() : 0;
    return !end || Date.now() <= end;
  },

  owlPollResultsForMessage(message = {}) {
    const rows = this.state.owlPollResults?.[String(message.id)] || [];
    const mapped = new Map(rows.map((row) => [String(row.option_key), Number(row.votes_count || 0)]));
    return (Array.isArray(message.poll_options) ? message.poll_options : []).map((option) => ({
      key: String(option.key),
      label: option.label || option.key,
      votes: mapped.get(String(option.key)) || 0
    }));
  },

  owlPollVoteDetailsForMessage(message = {}) {
    return (this.state.owlPollVoteDetails?.[String(message.id)] || [])
      .slice()
      .sort((a, b) => String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr"));
  },

  owlPollVotersHtml(message = {}, showDetails = false, startOpen = false) {
    if (!showDetails) {
      return `<p class="muted tiny-note">Vote d’abord pour ouvrir le grimoire des plumes et voir qui a voté quoi.</p>`;
    }
    const details = this.owlPollVoteDetailsForMessage(message);
    const options = Array.isArray(message.poll_options) ? message.poll_options : [];
    const byOption = new Map();
    details.forEach((row) => {
      const key = String(row.option_key || "");
      if (!byOption.has(key)) byOption.set(key, []);
      byOption.get(key).push(row);
    });
    return `
      <details class="login-owl-poll-voters" ${startOpen ? "open" : ""}>
        <summary>Voir qui a voté quoi 🕵️‍♂️</summary>
        <div class="login-owl-poll-voters-list">
          ${options.map((option) => {
            const voters = byOption.get(String(option.key)) || [];
            return `<div class="login-owl-poll-voter-group">
              <strong>${H.escapeHtml(option.label || option.key)}</strong>
              ${voters.length ? `<ul>${voters.map((vote) => `<li>${H.escapeHtml(vote.pseudo || "Joueur mystère")}</li>`).join("")}</ul>` : `<small>Aucun hibou posé ici.</small>`}
            </div>`;
          }).join("")}
        </div>
      </details>
    `;
  },

  owlPollRootSelector(message = {}) {
    const id = String(message?.id || "");
    const safeId = window.CSS?.escape ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, "");
    return `.login-owl-poll[data-owl-poll-message-id="${safeId}"]`;
  },

  owlPollTotalVotes(message = {}) {
    return this.owlPollResultsForMessage(message).reduce((sum, row) => sum + Number(row.votes || 0), 0);
  },

  owlPollHtml(message = {}, options = {}) {
    if (!message.poll_enabled || !Array.isArray(message.poll_options) || message.poll_options.length < 2) return "";
    const vote = this.state.owlPollVotes?.[String(message.id)];
    const isOpen = this.owlPollOpen(message);
    const forceResults = Boolean(options.forceResults);
    const forceVoters = Boolean(options.forceVoters);
    const inHistory = options.context === "history";
    const status = vote ? "vote enregistré" : (isOpen ? "vote ouvert" : "sondage terminé");
    const resultRows = this.owlPollResultsForMessage(message);
    const totalVotes = resultRows.reduce((sum, row) => sum + Number(row.votes || 0), 0);
    const showResults = forceResults || Boolean(vote) || !isOpen;
    const showVoters = forceVoters || showResults;
    const resultMap = new Map(resultRows.map((row) => [String(row.key), row]));
    return `
      <section class="login-owl-poll ${inHistory ? "owl-poll-history-inline" : ""}" data-owl-poll-message-id="${H.escapeHtml(message.id || "")}">
        <div class="login-owl-poll-head">
          <strong>📊 ${H.escapeHtml(message.poll_question || "Sondage du Hibou")}</strong>
          <small>${H.escapeHtml(status)}${message.poll_end_at ? ` · fin ${H.formatDateTime(message.poll_end_at)}` : ""}${showResults ? ` · ${totalVotes} vote(s)` : ""}${inHistory ? " · visible dans l’historique" : ""}</small>
        </div>
        <div class="login-owl-poll-options ${showResults ? "has-results" : ""}">
          ${message.poll_options.map((option) => {
            const selected = vote && String(vote.option_key) === String(option.key);
            const row = resultMap.get(String(option.key)) || { votes: 0 };
            const votes = Number(row.votes || 0);
            const pct = totalVotes ? Math.round((votes / totalVotes) * 100) : 0;
            return `<button type="button" class="login-owl-poll-option ${selected ? "selected" : ""} ${showResults ? "with-result" : ""}" data-owl-poll-option="${H.escapeHtml(option.key)}" ${!isOpen ? "disabled" : ""} style="--poll-pct:${pct}%">
              <span>${H.escapeHtml(option.label || option.key)}</span>
              <b>${selected ? "✓ ton vote" : (showResults ? `${pct}%` : "choisir")}</b>
              ${showResults ? `<i class="login-owl-poll-result-bar" aria-hidden="true"></i><em>${votes} vote(s) · ${pct}%</em>` : ""}
            </button>`;
          }).join("")}
        </div>
        <p class="muted tiny-note">${inHistory ? "Sondage attaché à ce message : résultats, pourcentages et votes nominatifs restent lisibles ici." : (showResults ? "Résultats visibles après ton vote. Tu peux encore changer tant que le sondage est ouvert." : "Un seul vote par joueur, modifiable jusqu’à la fin du sondage.")}</p>
        ${this.owlPollVotersHtml(message, showVoters, inHistory)}
      </section>
    `;
  },

  async voteOwlPoll(message, optionKey, modal) {
    if (!message?.id || !optionKey) return;
    if (!this.owlPollOpen(message)) {
      H.toast("Le sondage est terminé, le Hibou a refermé l’urne.", "error");
      return;
    }

    const { error } = await window.sb
      .from("owl_message_votes")
      .upsert({ message_id: message.id, user_id: this.state.session?.user?.id, option_key: optionKey }, { onConflict: "message_id,user_id" });

    if (error) {
      H.toast(error.message || "Vote impossible. Lance le patch SQL V1.9.4.", "error");
      return;
    }

    this.state.owlPollVotes[String(message.id)] = { message_id: message.id, option_key: optionKey };
    await this.loadOwlPollResults([message.id]);
    await this.loadOwlPollVoteDetails([message.id]);
    const pollRoot = H.$(this.owlPollRootSelector(message), modal) || H.$(".login-owl-poll", modal);
    if (pollRoot) {
      const inHistory = pollRoot.classList.contains("owl-poll-history-inline") || Boolean(pollRoot.closest(".owl-messages-history-modal"));
      pollRoot.outerHTML = this.owlPollHtml(message, inHistory ? { forceResults: true, forceVoters: true, context: "history" } : {});
    }
    this.bindOwlPollButtons(modal, message);
    H.toast("Vote enregistré dans le nid 🦉", "success");
  },

  bindOwlPollButtons(modal, message) {
    const root = H.$(this.owlPollRootSelector(message), modal) || modal;
    H.$$('[data-owl-poll-option]', root).forEach((button) => {
      if (button.dataset.owlPollBound === "true") return;
      button.dataset.owlPollBound = "true";
      button.addEventListener("click", async () => this.voteOwlPoll(message, button.dataset.owlPollOption, modal));
    });
  },

  openLoginOwlMessageModal(message, storageKey) {
    if (document.querySelector(".login-owl-message-modal")) return;
    const importance = message.importance || "info";
    const title = message.title || "Message du Hibou masqué";
    const body = message.body || message.message || "";
    const modal = document.createElement("div");
    modal.className = `modal-backdrop login-owl-message-modal importance-${importance}`;
    modal.innerHTML = `
      <div class="modal-card login-owl-message-card" role="dialog" aria-modal="true" aria-labelledby="loginOwlTitle">
        <button class="modal-close" type="button" aria-label="Fermer">×</button>
        <div class="login-owl-message-head">
          <img src="assets/icons/owl-png/admin.png" alt="" class="login-owl-message-icon" loading="lazy" onerror="this.style.display='none'">
          <div>
            <p class="eyebrow">Le Hibou masqué passe une tête</p>
            <h2 id="loginOwlTitle">${H.escapeHtml(title)}</h2>
          </div>
        </div>
        <div class="login-owl-message-body">${H.escapeHtml(body).replace(/\n/g, "<br>")}</div>
        ${this.owlPollHtml(message)}
        <div class="login-owl-message-actions">
          <button class="primary-btn" type="button" id="closeLoginOwlMessageBtn">Bien reçu, chef Hibou</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.bindOwlPollButtons(modal, message);
    const close = () => {
      const mustVoteFirst = message.poll_enabled && this.owlPollOpen(message) && !this.state.owlPollVotes?.[String(message.id)];
      if (!mustVoteFirst) {
        try { localStorage.setItem(storageKey, "dismissed"); } catch (error) {}
      }
      modal.remove();
    };
    H.$("#closeLoginOwlMessageBtn", modal)?.addEventListener("click", close);
    H.$(".modal-close", modal)?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  },



  openOwlMessagesHistoryModal() {
    H.$("#owlMessagesHistoryModal")?.remove();
    const messages = [
      ...this.rankSentinelHistoryMessages(),
      ...(this.state.owlMessages || [])
    ]
      .slice()
      .sort((a, b) => new Date(b.start_at || b.created_at || 0) - new Date(a.start_at || a.created_at || 0));

    const modal = document.createElement("div");
    modal.id = "owlMessagesHistoryModal";
    modal.className = "modal-backdrop owl-messages-history-modal";
    modal.innerHTML = `
      <div class="modal-card owl-messages-history-card" role="dialog" aria-modal="true" aria-labelledby="owlMessagesHistoryTitle">
        <button class="modal-x-btn" id="closeOwlMessagesHistoryBtn" type="button" aria-label="Fermer">×</button>
        <div class="card-title-row">
          <div>
            <p class="eyebrow">${H.icon("diffusion")} Messages du Hibou masqué</p>
            <h2 id="owlMessagesHistoryTitle">Le grimoire des annonces</h2>
            <p class="muted">Tous les messages publiés par le Hibou, du plus récent au plus ancien. Les vieilles plumes restent lisibles.</p>
          </div>
        </div>
        <div class="owl-message-history-list">
          ${messages.length ? messages.map((message) => `
            <article class="owl-message-history-item importance-${H.escapeHtml(message.importance || "info")}">
              <div class="owl-message-history-head">
                <img src="assets/icons/owl-png/admin.png" alt="" loading="lazy" onerror="this.style.display='none'">
                <div>
                  <strong>${H.escapeHtml(message.title || "Message du Hibou masqué")}</strong>
                  <small>${H.formatDateTime(message.start_at || message.created_at)}${message.end_at ? ` · visible jusqu’au ${H.formatDateTime(message.end_at)}` : ""}</small>
                </div>
                <span class="pill">${H.escapeHtml(message.importance || "info")}</span>
              </div>
              <p>${H.escapeHtml(message.body || message.message || "").replace(/\\n/g, "<br>")}</p>
              ${this.owlPollHtml(message, { forceResults: true, forceVoters: true, context: "history" })}
            </article>
          `).join("") : `
            <div class="empty-state compact">
              <strong>Aucun message publié</strong>
              <p>Le Hibou masqué n’a pas encore déposé de parchemin public.</p>
            </div>
          `}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    H.$("#closeOwlMessagesHistoryBtn", modal)?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  },

  familyModeEnabled() {
    const value = this.state.appSettings?.family_mode_enabled;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value === "true";
    if (value && typeof value === "object" && "enabled" in value) return Boolean(value.enabled);
    return false;
  },

  preparationModuleEnabled() {
    const value = this.state.appSettings?.preparation_module_enabled;
    if (value === undefined || value === null) return true;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value === "true";
    if (value && typeof value === "object" && "enabled" in value) return Boolean(value.enabled);
    return Boolean(value);
  },

  graphPreviewTestMatchesEnabled() {
    const value = this.state.appSettings?.graph_preview_test_matches_enabled;
    if (value === undefined || value === null) return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value === "true";
    if (value && typeof value === "object" && "enabled" in value) return Boolean(value.enabled);
    return Boolean(value);
  },

  graphMockPreviewEnabled() {
    const value = this.state.appSettings?.graph_mock_preview_enabled;
    if (value === undefined || value === null) return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value === "true";
    if (value && typeof value === "object" && "enabled" in value) return Boolean(value.enabled);
    return Boolean(value);
  },

  homeProgressIncludeTestMatches() {
    const value = this.state.appSettings?.home_progress_include_test_matches;
    if (value === undefined || value === null) return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value === "true";
    if (value && typeof value === "object" && "enabled" in value) return Boolean(value.enabled);
    return Boolean(value);
  },

  liveDemoMatchEnabled() {
    const value = this.state.appSettings?.live_demo_match_enabled;
    if (value === undefined || value === null) return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value === "true";
    if (value && typeof value === "object" && "enabled" in value) return Boolean(value.enabled);
    return Boolean(value);
  },

  appSettingNumberFromValue(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },

  appSettingNumber(key, fallback = 0) {
    const value = this.state.appSettings?.[key];
    if (value === undefined || value === null) return fallback;
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    if (typeof value === "string") return this.appSettingNumberFromValue(value.replace(",", "."), fallback);
    if (value && typeof value === "object") return this.appSettingNumberFromValue(value.points ?? value.value ?? value.amount, fallback);
    return this.appSettingNumberFromValue(value, fallback);
  },

  championFirstBonusPoints() {
    return Math.max(0, Math.round(this.appSettingNumber("champion_bonus_initial_points", 100)));
  },

  championSecondBonusPoints() {
    return Math.max(0, Math.round(this.appSettingNumber("champion_bonus_second_points", 50)));
  },

  isLiveDemoMatch(match = null) {
    if (!match) return false;
    return Number(match.api_match_id) === -133000
      || String(match.test_match_label || "").toLowerCase().includes("labo live")
      || String(match.test_match_label || "").toLowerCase().includes("live demo")
      || String(match.group_name || "").toLowerCase().includes("labo live");
  },

  homeProgressMatches() {
    return this.state.matches.filter((m) =>
      !this.isLiveDemoMatch(m)
      && !["cancelled", "postponed"].includes(m.status)
      && (!m.is_test_match || this.homeProgressIncludeTestMatches())
    );
  },

  graphEvolutionCanUseMatch(match) {
    return Boolean(match && (!match.is_test_match || (this.graphPreviewTestMatchesEnabled() && match.is_test_match)));
  },

  displayMatches() {
    return this.state.matches.filter((match) => {
      if (this.isLiveDemoMatch(match)) return this.preparationModuleEnabled() && this.liveDemoMatchEnabled();
      if (!this.preparationModuleEnabled() && match.is_test_match) return false;
      return true;
    });
  },

  async loadMyFamilyInvites() {
    if (!this.state.session?.user?.id || this.isFamily()) {
      this.state.familyInvites = [];
      return;
    }

    const { data, error } = await window.sb
      .from("family_invites")
      .select("id,code,office_team_id,expires_at,used_at,used_by,created_at,revoked_at")
      .eq("inviter_id", this.state.session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Invitations Famille indisponibles", error);
      this.state.familyInvites = [];
      return;
    }

    this.state.familyInvites = data || [];
  },

  async loadBlockedUsers() {
    const { data, error } = await window.sb
      .from("user_blocks")
      .select("blocked_id");

    if (error) {
      console.warn("Blocages utilisateurs indisponibles", error);
      this.state.blockedUserIds = new Set();
      return;
    }

    this.state.blockedUserIds = new Set((data || []).map((row) => String(row.blocked_id)));
  },


  async loadSecondWinnerPredictionsForTeams() {
    const selectFields = "user_id,predicted_team_id,predicted_team_name,predicted_team_short_name,predicted_team_country_code,predicted_team_flag_url,points_total,competition_id,created_at,updated_at";
    let query = window.sb
      .from("v_second_winner_predictions")
      .select(selectFields)
      .order("predicted_team_name", { ascending: true });

    if (this.state.activeCompetition?.id) {
      query = query.eq("competition_id", this.state.activeCompetition.id);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("2e choix champion indisponible pour les fiches joueurs", error);
      this.state.secondWinnerPredictions = [];
      return;
    }

    this.state.secondWinnerPredictions = data || [];
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
    this.state.matches = (data || []).map((row) => this.normalizeTeamLabels(row));
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

    this.state.groupStandings = (data || []).map((row) => this.normalizeTeamLabels(row));
  },

  async loadMyPredictions() {
    const { data, error } = await window.sb
      .from("predictions")
      .select("*")
      .eq("user_id", this.state.session.user.id);

    if (error) throw error;
    this.state.myPredictions = data || [];
  },

  mergePredictionRows(baseRows = [], extraRows = []) {
    const byKey = new Map();
    [...(baseRows || []), ...(extraRows || [])].forEach((row) => {
      if (!row) return;
      const key = `${row.prediction_id || row.id || ""}:${row.user_id || ""}:${row.match_id || ""}`;
      if (!key.replace(/:/g, "")) return;
      byKey.set(key, { ...(byKey.get(key) || {}), ...row });
    });
    return [...byKey.values()];
  },


  async loadVisiblePredictions() {
    // V1.9.4 — IMPORTANT : Supabase REST renvoie 1000 lignes max par requête.
    // Le classement général est agrégé en base, mais les détails joueurs et le classement Famille
    // repartent des pronos visibles côté front. On pagine donc toute la vue, sinon les détails
    // s'arrêtent après les premiers paquets de matchs/joueurs.
    const { data, error } = await this.selectAllRows("v_visible_predictions", {
      orderColumn: "prediction_id",
      pageSize: 1000
    });

    if (error) {
      console.warn("v_visible_predictions indisponible pour le moment", error);
      this.state.visiblePredictions = [];
    } else {
      this.state.visiblePredictions = data || [];
    }

    // V1.8.12 — filet spécial live :
    // si la vue générale rate un prono sur un match en direct,
    // la vue dédiée v_live_visible_predictions le réinjecte.
    const liveResult = await this.selectAllRows("v_live_visible_predictions", {
      orderColumn: "prediction_id",
      pageSize: 1000
    });

    if (!liveResult.error && Array.isArray(liveResult.data) && liveResult.data.length) {
      this.state.visiblePredictions = this.mergePredictionRows(this.state.visiblePredictions, liveResult.data);
    } else if (liveResult.error && !/relation .*v_live_visible_predictions|does not exist|PGRST205/i.test(liveResult.error.message || "")) {
      console.warn("v_live_visible_predictions indisponible", liveResult.error);
    }
  },


  async loadManualBadges() {
    const { data, error } = await window.sb
      .from("manual_user_badges")
      .select("user_id,badge_id,granted_at,reason");

    if (error) {
      console.warn("manual_user_badges indisponible pour le moment", error);
      this.state.manualBadges = [];
      return;
    }

    this.state.manualBadges = data || [];
  },

  async loadPublicProfiles() {
    const { data, error } = await window.sb
      .from("v_public_profiles")
      .select("*")
      .eq("is_active", true)
      .order("office_team_name", { ascending: true, nullsFirst: false })
      .order("pseudo", { ascending: true });

    if (!error) {
      const rows = (data || []).map((profile) => ({
        ...profile,
        player_scope: profile.player_scope || profile.role || (profile.invited_by ? "family" : "uis"),
        role: profile.role || (profile.invited_by ? "family" : "user")
      }));
      this.state.publicProfiles = this.canSeeFamily() ? rows : this.officialProfiles(rows);
      return;
    }

    console.warn("v_public_profiles indisponible, fallback profiles", error);
    const { data: fallback, error: fallbackError } = await window.sb
      .from("profiles")
      .select("id,pseudo,role,player_scope,show_family_players,invited_by,office_team_id,is_active,avatar_key,badge_shape,badge_color,profile_setup_done,featured_badge_ids")
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
        office_team_color: team?.color || null,
        player_scope: profile.player_scope || profile.role || (profile.invited_by ? "family" : "uis"),
        role: profile.role || (profile.invited_by ? "family" : "user"),
        invited_by: profile.invited_by || null
      };
    });
    this.state.publicProfiles = this.canSeeFamily() ? this.state.publicProfiles : this.officialProfiles(this.state.publicProfiles);
  },

  async loadTeamChatMessages() {
    this.state.teamChatError = null;
    const scope = this.normalizeChatScope(this.state.teamChatScope || "global");
    this.state.teamChatScope = scope;
    const limit = scope === "private" ? Math.max(240, Number(this.state.teamChatLimit || 240)) : Math.max(10, Number(this.state.teamChatLimit || this.state.teamChatPageSize || 20));
    let query = window.sb
      .from("v_team_chat_messages")
      .select("*")
      .eq("scope", scope)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (this.chatScopeNeedsTeam(scope) && this.state.profile?.office_team_id) {
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

    const rows = this.filterBlockedMessages(data || []);
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

    const isAdmin = this.isScoreAdmin(profile);

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
    const passwordChangeRequired = this.passwordChangeRequired();
    const profileWasIncomplete = !this.profileSetupComplete();
    if (viewName !== "profile" && passwordChangeRequired) {
      viewName = "profile";
      H.toast("Change ton mot de passe avant de continuer.", "info");
      setTimeout(() => this.openForcedPasswordChangeModal(), 80);
    } else if (viewName !== "profile" && profileWasIncomplete) {
      viewName = "profile";
      H.toast("Complète d’abord ton profil pour accéder au nid.", "info");
      setTimeout(() => this.openFirstLoginModal(), 80);
    }
    this.clearHomeRecordCarousel();
    this.stopTeamChatAutoRefresh();
    this.state.currentView = viewName;
    document.body.dataset.currentView = viewName;
    this.rememberLastView(viewName);
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
    if (viewName === "worldcup") {
      this.state.worldcupTab = "finals";
      await this.renderWorldCup();
    }
    if (viewName === "leaderboard") await this.renderLeaderboard();
    if (viewName === "teams") await this.renderTeamsPage();
    if (viewName === "achievements") await this.renderAchievements();
    if (viewName === "profile") await this.renderProfile();
    if (passwordChangeRequired) setTimeout(() => this.openForcedPasswordChangeModal(), 80);
    else if (profileWasIncomplete) setTimeout(() => this.openFirstLoginModal(), 80);
  },

  getMyPrediction(matchId) {
    const targetId = String(matchId ?? "");
    return this.state.myPredictions.find((p) => String(p.match_id) === targetId);
  },

  predictionsForMatch(matchId) {
    const targetId = String(matchId ?? "");
    const rows = this.state.visiblePredictions.filter((p) => String(p.match_id) === targetId);
    const mine = this.state.myPredictions.find((p) => String(p.match_id) === targetId);
    if (mine && !rows.some((row) => String(row.user_id) === String(this.state.session?.user?.id))) {
      return this.mergePredictionRows(rows, [{ ...mine, user_id: this.state.session?.user?.id, pseudo: this.state.profile?.pseudo }]);
    }
    return rows;
  },

  upcomingMatches() {
    return this.displayMatches().filter((m) => new Date(m.kickoff_at).getTime() > Date.now());
  },

  missingPredictions() {
    return this.upcomingMatches().filter((m) => !this.getMyPrediction(m.id));
  },

  availablePredictionMatches() {
    return this.state.matches.filter((m) =>
      !this.isLiveDemoMatch(m)
      && !m.is_test_match
      && !["cancelled", "postponed"].includes(m.status)
      && this.hasKnownMatchTeams(m)
    );
  },

  preparationMatches() {
    return this.state.matches.filter((m) => m.is_test_match && !this.isLiveDemoMatch(m));
  },

  isPreparationMatch(matchOrId) {
    const match = typeof matchOrId === "string" || typeof matchOrId === "number"
      ? this.state.matches.find((m) => String(m.id) === String(matchOrId))
      : matchOrId;
    return Boolean(match?.is_test_match);
  },

  competitionMatches() {
    return this.state.matches.filter((m) => !this.isLiveDemoMatch(m) && !m.is_test_match);
  },

  phaseLeaderboardMatches() {
    return this.displayMatches().filter((m) => !["cancelled", "postponed"].includes(m.status));
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
    const includeLiveDemo = Boolean(options.includeLiveDemo);
    const keepPrediction = (p) => {
      const match = this.state.matches.find((m) => m.id === p.match_id);
      if (this.isLiveDemoMatch(match) && !includeLiveDemo) return false;
      return includeTest || !this.isPreparationMatch(p.match_id);
    };

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


  liveMatches() {
    return this.displayMatches()
      .filter((match) => match.status === "live")
      .sort((a, b) => new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0));
  },

  hasLiveScore(match) {
    return match && match.home_score !== null && match.home_score !== undefined && match.away_score !== null && match.away_score !== undefined;
  },

  outcomeFromScores(home, away) {
    if (home > away) return "home";
    if (away > home) return "away";
    return "draw";
  },

  projectedPredictionPoints(prediction, match) {
    if (!prediction || !match || !this.hasLiveScore(match)) return null;

    const predHome = Number(prediction.home_score_pred);
    const predAway = Number(prediction.away_score_pred);
    const realHome = Number(match.home_score);
    const realAway = Number(match.away_score);

    if (!Number.isFinite(predHome) || !Number.isFinite(predAway) || !Number.isFinite(realHome) || !Number.isFinite(realAway)) return null;

    const isExactScore = predHome === realHome && predAway === realAway;
    const isGoodResult = this.outcomeFromScores(predHome, predAway) === this.outcomeFromScores(realHome, realAway);
    const isGoodGoalDiff = (predHome - predAway) === (realHome - realAway);
    const isGoodQualified = Boolean(prediction.qualified_team_pred && match.winner_team_id && prediction.qualified_team_pred === match.winner_team_id);

    let total = 0;
    if (isExactScore) total += 5;
    else if (isGoodResult) total += 3;
    if (!isExactScore && isGoodGoalDiff) total += 1;
    if (isGoodQualified) total += 2;

    return {
      ...prediction,
      points_total: total,
      is_exact_score: isExactScore,
      is_good_result: isGoodResult,
      is_good_goal_diff: isGoodGoalDiff,
      is_good_qualified: isGoodQualified,
      is_live_projection: match.status === "live"
    };
  },

  predictionForDisplay(prediction, match) {
    if (!prediction) return null;
    if (match?.status === "live") return this.projectedPredictionPoints(prediction, match) || prediction;

    // V1.8.6 — filet de sécurité :
    // si prediction_points n'a pas encore été créé/recalculé en base,
    // on calcule quand même les points affichés à partir du résultat officiel.
    if (
      match?.status === "finished"
      && (prediction.points_total === null || prediction.points_total === undefined)
    ) {
      return this.projectedPredictionPoints(prediction, match) || prediction;
    }

    return prediction;
  },

  liveProjectionCountForMatchIds(matchIds = null, options = {}) {
    const normalizedOptions = options && typeof options === "object" && !Array.isArray(options) ? options : {};
    const includeTest = Boolean(normalizedOptions.includeTest);
    const userIds = normalizedOptions.userIds ?? null;
    const toArray = (value) => {
      if (!value) return null;
      if (Array.isArray(value)) return value;
      if (value instanceof Set) return [...value];
      if (typeof value?.values === "function") return [...value.values()];
      return [value];
    };
    const matchIdArray = toArray(matchIds);
    const userIdArray = toArray(userIds);
    const idSet = matchIdArray ? new Set(matchIdArray.map(String)) : null;
    const userSet = userIdArray ? new Set(userIdArray.map(String)) : null;

    return this.state.visiblePredictions
      .filter((prediction) => !userSet || userSet.has(String(prediction.user_id)))
      .map((prediction) => {
        const match = this.state.matches.find((item) => item.id === prediction.match_id);
        const display = this.predictionForDisplay(prediction, match);
        return { prediction: display, match };
      })
      .filter(({ prediction, match }) => match
        && match.status === "live"
        && prediction?.is_live_projection
        && (!idSet || idSet.has(String(match.id)))
        && (
          includeTest
          || !match.is_test_match
          || (this.isLiveDemoMatch(match) && this.liveDemoMatchEnabled())
        )
      ).length;
  },

  homeVisiblePredictionsMatch() {
    const live = this.liveMatches();
    if (live.length) return live[0];

    const visiblePast = this.displayMatches()
      .filter((match) => H.isKickoffPassed(match.kickoff_at))
      .sort((a, b) => new Date(b.kickoff_at || 0) - new Date(a.kickoff_at || 0));

    return visiblePast[0] || this.nextMatch();
  },

  liveOfficialProjectionRows() {
    const liveOfficialMatches = this.state.matches.filter((match) =>
      match.status === "live"
      && this.hasLiveScore(match)
      && (!match.is_test_match || (this.isLiveDemoMatch(match) && this.liveDemoMatchEnabled()))
    );

    if (!liveOfficialMatches.length) return [];
    const liveIds = new Set(liveOfficialMatches.map((match) => match.id));

    return this.state.visiblePredictions
      .filter((prediction) => liveIds.has(prediction.match_id))
      .map((prediction) => {
        const match = liveOfficialMatches.find((item) => item.id === prediction.match_id);
        const projected = this.projectedPredictionPoints(prediction, match);
        return projected ? { prediction: projected, match } : null;
      })
      .filter(Boolean);
  },


  rankedOfficialLeaderboardRows(rows = []) {
    const sortedRows = (rows || [])
      .filter((row) => {
        const profile = this.profileForUser(row.user_id || row.id, row);
        return profile?.player_scope !== "family" && profile?.role !== "family";
      })
      .map((row) => ({
        ...row,
        user_id: row.user_id || row.id,
        total_points: Number(row.total_points || 0),
        exact_scores: Number(row.exact_scores || 0),
        good_results: Number(row.good_results || 0),
        good_goal_diffs: Number(row.good_goal_diffs || 0),
        good_qualified: Number(row.good_qualified || 0),
        scored_matches: Number(row.scored_matches || 0),
        live_points: Number(row.live_points || 0),
        live_match_count: Number(row.live_match_count || 0)
      }))
      .sort((a, b) =>
        Number(b.total_points || 0) - Number(a.total_points || 0)
        || Number(b.exact_scores || 0) - Number(a.exact_scores || 0)
        || Number(b.good_results || 0) - Number(a.good_results || 0)
        || Number(b.good_goal_diffs || 0) - Number(a.good_goal_diffs || 0)
        || String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr")
      );

    return this.rankRowsWithTies(sortedRows, (row) => Number(row.total_points || 0))
      .map((row) => ({ ...row, has_live_projection: Number(row.live_match_count || 0) > 0 }));
  },

  liveAdjustedLeaderboardRows(rows = this.state.playerScoreRows) {
    const liveRows = this.liveOfficialProjectionRows();
    if (!liveRows.length) return this.rankedOfficialLeaderboardRows(rows);

    const byUser = new Map();

    this.officialProfiles(this.state.publicProfiles).forEach((profile) => {
      const userId = profile.id || profile.user_id;
      if (!userId) return;
      byUser.set(String(userId), {
        user_id: userId,
        pseudo: profile.pseudo || "Joueur",
        office_team_id: profile.office_team_id,
        office_team_name: profile.office_team_name,
        office_team_slug: profile.office_team_slug,
        office_team_color: profile.office_team_color,
        avatar_key: profile.avatar_key || "owl-01",
        badge_shape: profile.badge_shape || "rounded",
        badge_color: profile.badge_color || profile.office_team_color || "#facc15",
        total_points: 0,
        exact_scores: 0,
        good_results: 0,
        good_goal_diffs: 0,
        good_qualified: 0,
        scored_matches: 0,
        live_points: 0,
        live_match_count: 0
      });
    });

    rows.forEach((row) => {
      const userId = row.user_id || row.id;
      if (!userId) return;
      const existing = byUser.get(String(userId)) || {};
      byUser.set(String(userId), {
        ...existing,
        ...row,
        user_id: userId,
        total_points: Number(row.total_points || 0),
        exact_scores: Number(row.exact_scores || 0),
        good_results: Number(row.good_results || 0),
        good_goal_diffs: Number(row.good_goal_diffs || 0),
        good_qualified: Number(row.good_qualified || 0),
        scored_matches: Number(row.scored_matches || 0),
        live_points: 0,
        live_match_count: 0
      });
    });

    liveRows.forEach(({ prediction }) => {
      const userId = String(prediction.user_id);
      const row = byUser.get(userId) || { user_id: userId, pseudo: this.profileForUser(userId)?.pseudo || "Joueur" };
      row.total_points = Number(row.total_points || 0) + Number(prediction.points_total || 0);
      row.live_points = Number(row.live_points || 0) + Number(prediction.points_total || 0);
      row.live_match_count = Number(row.live_match_count || 0) + 1;
      row.exact_scores = Number(row.exact_scores || 0) + (prediction.is_exact_score ? 1 : 0);
      row.good_results = Number(row.good_results || 0) + (prediction.is_good_result ? 1 : 0);
      row.good_goal_diffs = Number(row.good_goal_diffs || 0) + (prediction.is_good_goal_diff ? 1 : 0);
      row.good_qualified = Number(row.good_qualified || 0) + (prediction.is_good_qualified ? 1 : 0);
      row.scored_matches = Number(row.scored_matches || 0) + 1;
      byUser.set(userId, row);
    });

    return this.rankedOfficialLeaderboardRows([...byUser.values()]);
  },

  officialCompetitionStartAt() {
    const dates = this.state.matches
      .filter((m) => !m.is_test_match && !["cancelled", "postponed"].includes(m.status))
      .map((m) => m.kickoff_at ? new Date(m.kickoff_at) : null)
      .filter((date) => date && Number.isFinite(date.getTime()))
      .sort((a, b) => a - b);
    return dates[0] || null;
  },

  competitionStartAt() {
    // Ancien nom conservé pour l’interface profil : ici, “début de compétition”
    // signifie bien premier match officiel, pas match de préparation.
    return this.officialCompetitionStartAt();
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
    this.competitionMatches()
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



  secondChampionCloseAt() {
    const knockout = this.competitionMatches()
      .filter((match) => !["cancelled", "postponed"].includes(match.status))
      .filter((match) => ["round_of_32", "round_of_16"].includes(match.stage))
      .sort((a, b) => new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0))[0];
    return knockout?.kickoff_at ? new Date(knockout.kickoff_at) : null;
  },

  secondChampionPickOpen() {
    const closeAt = this.secondChampionCloseAt();
    return !closeAt || closeAt.getTime() > Date.now();
  },


  groupStageFinishedForSecondChampion() {
    const groupMatches = this.competitionMatches()
      .filter((match) => match.stage === "group" && !["cancelled", "postponed"].includes(match.status));
    return Boolean(groupMatches.length) && groupMatches.every((match) => match.status === "finished");
  },

  secondChampionCandidateTeams() {
    const groupFinished = this.groupStageFinishedForSecondChampion();

    if (!groupFinished) {
      // Avant la fin des poules : tous les vrais pays de la compétition sont disponibles.
      // On se base uniquement sur les matchs de groupe pour éviter les placeholders M73A/M73B.
      return this.championCandidateTeams();
    }

    // Après les poules : seulement les qualifiés réels.
    const qualifiedStatuses = new Set(["qualified", "qualified_best_third"]);
    const qualifiedIds = new Set((this.state.groupStandings || [])
      .filter((row) => qualifiedStatuses.has(row.qualification_status))
      .map((row) => row.team_id)
      .filter(Boolean));

    return this.state.footballTeams
      .filter((team) => qualifiedIds.has(team.id))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "fr"));
  },

  secondChampionSelectedTeam() {
    const teamId = this.state.secondWinnerPrediction?.predicted_team_id || "";
    return this.state.footballTeams.find((team) => team.id === teamId) || null;
  },

  async saveSecondChampionPick(teamId) {
    if (this.state.profile?.can_predict === false || this.state.profile?.is_banned) {
      H.toast("Les pronostics sont désactivés sur ton compte.", "error");
      return;
    }
    if (!this.state.activeCompetition) {
      H.toast("Compétition active introuvable", "error");
      return;
    }
    if (!teamId) {
      H.toast("Choisis ton deuxième champion", "error");
      return;
    }
    if (!this.secondChampionPickOpen()) {
      H.toast("2e choix champion verrouillé : les 16èmes ont commencé.", "error");
      return;
    }
    const allowedIds = new Set(this.secondChampionCandidateTeams().map((team) => team.id));
    if (!allowedIds.has(teamId)) {
      H.toast("Cette équipe n’est pas disponible pour le 2e choix. Le hibou refuse le ticket.", "error");
      return;
    }

    const { error } = await window.sb.rpc("save_second_winner_prediction", {
      p_predicted_team_id: teamId,
      p_competition_id: this.state.activeCompetition.id
    });

    if (error) {
      H.toast(error.message || "Impossible d’enregistrer le 2e champion. Lance le patch SQL V1.6.0.", "error");
      return;
    }

    await this.loadSecondWinnerPrediction();
    await this.loadPlayerScoreRows().catch(() => {});
    this.syncAchievementNotifications();
    this.scheduleAchievementResync();
    H.toast(`2e champion enregistré : +${this.championSecondBonusPoints()} points si ça passe !`, "success");
    await this.renderProfile();
  },

  async saveChampionPick(teamId) {
    if (this.state.profile?.can_predict === false || this.state.profile?.is_banned) {
      H.toast("Les pronostics sont désactivés sur ton compte.", "error");
      return;
    }
    if (!this.state.activeCompetition) {
      H.toast("Compétition active introuvable", "error");
      return;
    }

    if (!teamId) {
      H.toast("Choisis une équipe championne", "error");
      return;
    }

    if (this.championPickLocked()) {
      H.toast("Choix champion verrouillé : le premier match officiel a commencé", "error");
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
      const message = String(error.message || "");
      if (message.includes("compétition a déjà commencé") || message.includes("champion verrouillé")) {
        H.toast("Verrou champion encore côté Supabase : lance le patch SQL V1.3.24.", "error");
      } else {
        H.toast(error.message, "error");
      }
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
    await Promise.all([this.loadPlayerScoreRows(), this.loadVisiblePredictions()]);
    const liveMatches = this.liveMatches();
    const next = this.nextMatch();
    const nextPrediction = next ? this.getMyPrediction(next.id) : null;
    const missing = this.missingPredictions();
    const homeProgressMatches = this.homeProgressMatches();
    const availablePredictionCount = homeProgressMatches.length;
    const donePredictionCount = homeProgressMatches.filter((match) => this.getMyPrediction(match.id)).length;
    const predictionProgress = availablePredictionCount ? Math.round((donePredictionCount / availablePredictionCount) * 100) : 0;
    const liveAdjustedRows = this.liveAdjustedLeaderboardRows(this.state.playerScoreRows);
    const myRank = (typeof this.myRankFromRows === "function" ? this.myRankFromRows(liveAdjustedRows) : null) || await this.fetchMyRank();
    const myRankTieCount = myRank ? this.tieCountForRank(liveAdjustedRows, myRank.rank) : 0;
    const teamAverageRows = this.overallTeamAverageRows(liveAdjustedRows);
    const familyRows = this.canSeeFamily() ? this.familyPlayerRows() : [];
    if (this.canSeeFamily()) this.observeRankSentinel("family-home", "family", familyRows);
    const myFamilyRank = familyRows.find((row) => String(row.user_id || row.id) === String(this.state.session.user.id));
    const myFamilyRankTieCount = myFamilyRank ? this.tieCountForRank(familyRows, myFamilyRank.rank) : 0;
    const familyTeamRows = this.canSeeFamily() ? this.familyTeamRows(null, "average") : [];

    root.innerHTML = `
      <section class="home-dashboard-screen" aria-label="Tableau de bord accueil">
        <section class="hero-card home-dashboard-hero home-dashboard-hero-split">
          <div class="home-hero-main">
            <p class="eyebrow">${H.icon("nest")} Bienvenue dans le nid</p>
            <h2>Fais tes scores avant le coup d’envoi.</h2>
            <p class="muted">Les pronos des autres restent cachés jusqu’au début du match. Pas de copie, que du flair.</p>
            <div class="home-prono-progress">
              <div>
                <strong>${donePredictionCount} / ${availablePredictionCount}</strong>
                <span>pronos posés</span>
              </div>
              <div class="home-prono-progress-bar" aria-label="${predictionProgress}% des pronos posés">
                <span style="width:${predictionProgress}%"></span>
              </div>
              <button class="primary-btn compact-continue-btn" type="button" data-action="continue-predictions">${missing.length ? "Continuer mes pronos" : "Voir le prochain match"}</button>
              <small class="home-prono-progress-note">${this.homeProgressIncludeTestMatches() ? "Matchs test inclus dans cette progression" : "Matchs officiels uniquement"}</small>
            </div>
            <div class="home-hero-actions">
              <button class="ghost-btn rules-home-btn home-hero-equal-btn" id="rulesHomeBtn" type="button">${H.icon("list")} Règles & points</button>
              <button class="ghost-btn owl-messages-home-btn home-hero-equal-btn" id="owlMessagesHomeBtn" type="button">${H.icon("diffusion")} Messages du Hibou</button>
            </div>
          </div>
          <aside class="home-hero-final-card">
            <p class="eyebrow">${H.icon("worldcup")} Phase finale</p>
            <strong>Le tableau est lancé</strong>
            <span>Accède directement aux 16èmes, 8èmes, quarts, demies et finale.</span>
            <button class="primary-btn" type="button" data-action="go-worldcup-finals">Voir la phase finale</button>
          </aside>
        </section>

        <section class="home-dashboard-grid">
          <section class="home-dashboard-left" aria-label="Match et mini-records">

            ${liveMatches.length ? `
              <section class="home-live-matches" aria-label="Matchs en direct">
                <div class="home-live-title-row">
                  <h3>En direct dans le Nid</h3>
                  <span class="pill danger">${liveMatches.length} live</span>
                </div>
                <div class="home-live-grid">
                  ${liveMatches.slice(0, 2).map((match) => this.safeHomeLiveMatchCardHtml(match)).join("")}
                </div>
              </section>
            ` : ""}

            <article class="card next-match-card home-clickable-card" ${next ? `data-home-next-match-id="${H.escapeHtml(next.id)}" role="button" tabindex="0"` : ""}>
              <div class="card-title-row compact-title-row home-next-title-row">
                <h3>Prochain match</h3>
                <div class="home-next-pills">
                  ${next ? `<span class="pill home-next-countdown-pill" data-countdown-at="${H.escapeHtml(next.kickoff_at || "")}">${this.matchCountdownLabel(next.kickoff_at)}</span>` : ""}
                  <span class="pill">${next ? H.statusLabel(next.status) : "Aucun"}</span>
                </div>
              </div>
              ${next ? `
                ${this.matchMiniHtml(next)}
                <div class="home-next-prono-state compact ${nextPrediction ? "done" : "missing"}">
                  <strong>${nextPrediction ? "Prono posé" : "Prono à faire"}</strong>
                  <span>${nextPrediction ? `${nextPrediction.home_score_pred} - ${nextPrediction.away_score_pred}` : "Clique pour pronostiquer"}</span>
                </div>
              ` : `<p class="muted">Aucun match à venir pour le moment.</p>`}
            </article>

            ${this.homeRecordCarouselHtml(liveAdjustedRows, teamAverageRows)}
          </section>

          <aside class="home-dashboard-right" aria-label="Classements rapides et pronos">
            <section class="home-standing-stack" aria-label="Classements rapides">
              ${this.homeRankCardHtml(myRank, myRankTieCount)}
              ${this.homeTeamAverageCardHtml(teamAverageRows)}
            </section>
            ${this.canSeeFamily() ? `
              <section class="home-standing-stack home-family-stack" aria-label="Classements Famille rapides">
                ${this.homeFamilyRankCardHtml(myFamilyRank, myFamilyRankTieCount)}
                ${this.homeFamilyTeamAverageCardHtml(familyTeamRows)}
              </section>
            ` : ""}
          </aside>
        </section>
      </section>
    `;

    H.$("#rulesHomeBtn")?.addEventListener("click", () => this.openRulesModal());
    H.$("#owlMessagesHomeBtn")?.addEventListener("click", async () => {
      await this.loadOwlMessages();
      this.openOwlMessagesHistoryModal();
    });
    H.$('[data-action="continue-predictions"]', root)?.addEventListener("click", async () => {
      if (missing.length) {
        await this.goToNearestMissingPrediction();
      } else if (next) {
        await this.goToMatchPrediction(next.id);
      } else {
        this.loadView("leaderboard");
      }
    });
    H.$('[data-action="go-worldcup-finals"]', root)?.addEventListener("click", async () => {
      this.state.worldcupTab = "finals";
      await this.loadView("worldcup");
    });
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
      this.state.teamLeaderboardScope = "overall";
      this.state.teamTab = "average";
      this.loadView("leaderboard");
    });
    H.$('[data-action="go-family-player-leaderboard"]', root)?.addEventListener("click", () => {
      this.state.leaderboardTab = "family";
      this.state.familyLeaderboardTab = "players";
      this.state.familyPlayerLeaderboardMode = "overall";
      this.loadView("leaderboard");
    });
    H.$('[data-action="go-family-team-average-leaderboard"]', root)?.addEventListener("click", () => {
      this.state.leaderboardTab = "family";
      this.state.familyLeaderboardTab = "team";
      this.state.familyTeamLeaderboardScope = "overall";
      this.state.familyTeamTab = "average";
      this.loadView("leaderboard");
    });
    this.bindHomeClickableCards(root);
    this.bindNavigation();
    this.bindGoToNearestMissingActions();
    this.bindHomeRecordCarousel(root);
    this.startHomeCountdowns(root);
  },


  homeRankCardHtml(myRank, tieCount = 0) {
    if (!myRank) {
      return `
        <article class="card home-rank-card home-clickable-card" data-home-leaderboard-action="go-overall-leaderboard" role="button" tabindex="0">
          <div class="card-title-row">
            <h3>Classement général</h3>
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
      <article class="card home-rank-card home-clickable-card" data-home-leaderboard-action="go-overall-leaderboard" role="button" tabindex="0">
        <div class="card-title-row">
          <h3>Classement général</h3>
        </div>
        <div class="home-rank-main">
          <span class="home-rank-number">#${myRank.rank}</span>${tieCount > 1 ? `<small class="rank-tie-label">ex æquo</small>` : ""}
          <div>
            <strong>${Number(myRank.total_points || 0)} pts</strong>
            <small>Ton rang joueur</small>
          </div>
        </div>
      </article>
    `;
  },

  overallTeamAverageRows(scoreRows = this.state.playerScoreRows) {
    const scoreByUser = new Map(
      scoreRows.map((row) => [String(row.user_id || row.id), row])
    );

    const rows = this.state.officeTeams
      .map((team) => {
        const players = this.teamPlayers(team.id, { officialOnly: true }).filter((player) => player.profile_setup_done !== false);
        const totals = players.reduce((acc, player) => {
          const score = scoreByUser.get(String(player.id || player.user_id)) || {};
          acc.total_points += Number(score?.total_points || 0);
          acc.scored_matches += Number(score?.scored_matches || 0);
          return acc;
        }, { total_points: 0, scored_matches: 0 });

        return {
          office_team_id: team.id,
          office_team_name: team.name,
          office_team_color: team.color,
          active_players: players.length,
          total_points: totals.total_points,
          scored_matches: totals.scored_matches,
          average_points: totals.scored_matches ? totals.total_points / totals.scored_matches : 0
        };
      })
      .filter((row) => row.active_players > 0);

    const sortedRows = rows.sort((a, b) =>
      (b.average_points || 0) - (a.average_points || 0)
      || (b.total_points || 0) - (a.total_points || 0)
      || String(a.office_team_name || "").localeCompare(String(b.office_team_name || ""), "fr")
    );

    return this.rankRowsWithTies(sortedRows, (row) => Number(row.average_points || 0));
  },

  homeTeamAverageCardHtml(rows = []) {
    const myTeam = this.officeTeamById(this.state.profile?.office_team_id);
    const myRow = rows.find((row) => row.office_team_id === myTeam?.id);
    const leader = rows[0];

    if (!myTeam) {
      return `
        <article class="card home-team-average-card home-clickable-card" data-home-leaderboard-action="go-team-average-leaderboard" role="button" tabindex="0">
          <div class="card-title-row">
            <h3>Moyenne team</h3>
          </div>
          <p class="muted">Choisis une team pour voir son classement moyen.</p>
        </article>
      `;
    }

    if (!myRow) {
      return `
        <article class="card home-team-average-card home-clickable-card" data-home-leaderboard-action="go-team-average-leaderboard" role="button" tabindex="0">
          <div class="card-title-row">
            <h3>Moyenne team</h3>
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
      <article class="card home-team-average-card home-clickable-card" data-home-leaderboard-action="go-team-average-leaderboard" role="button" tabindex="0" style="--team-color:${this.safeColor(myRow.office_team_color, "#facc15")}">
        <div class="card-title-row">
          <h3>Moyenne team</h3>
        </div>
        <div class="home-team-average-main">
          <span class="home-team-rank">#${myRow.rank}</span>${this.tieCountForRank(rows, myRow.rank) > 1 ? `<small class="rank-tie-label">ex æquo</small>` : ""}
          <div>
            <strong>${H.escapeHtml(myRow.office_team_name)}</strong>
            <small>${Number(myRow.average_points || 0).toFixed(2)} pts/match · ${myRow.scored_matches || 0} prono${Number(myRow.scored_matches || 0) > 1 ? "s" : ""} compté${Number(myRow.scored_matches || 0) > 1 ? "s" : ""}</small>
          </div>
        </div>
        ${leader && leader.office_team_id !== myRow.office_team_id && Number(leader.rank) !== Number(myRow.rank) ? `
          <p class="home-team-average-leader">Leader : <strong>${H.escapeHtml(leader.office_team_name)}</strong> · ${Number(leader.average_points || 0).toFixed(2)} pts/match</p>
        ` : Number(myRow.rank) === 1 && this.tieCountForRank(rows, myRow.rank) > 1 ? `<p class="home-team-average-leader is-first">Ta team est ex æquo en tête du nid 🦉</p>` : `<p class="home-team-average-leader is-first">Ta team mène le nid à la moyenne 🦉</p>`}
      </article>
    `;
  },

  homeFamilyRankCardHtml(myRank, tieCount = 0) {
    return `
      <article class="card home-rank-card home-family-rank-card home-clickable-card" data-home-leaderboard-action="go-family-player-leaderboard" role="button" tabindex="0">
        <div class="card-title-row">
          <h3>Classement Famille</h3>
        </div>
        <div class="home-rank-main ${myRank ? "" : "empty"}">
          <span class="home-rank-number">${myRank ? `#${myRank.rank}` : "—"}</span>${myRank && tieCount > 1 ? `<small class="rank-tie-label">ex æquo</small>` : ""}
          <div>
            <strong>${myRank ? `${Math.round(Number(myRank.total_points || 0) * 10) / 10} pts` : "Pas encore classé"}</strong>
            <small>Famille · hors classement officiel</small>
          </div>
        </div>
      </article>
    `;
  },

  homeFamilyTeamAverageCardHtml(rows = []) {
    const myTeamId = this.state.profile?.office_team_id;
    const myRow = rows.find((row) => row.office_team_id === myTeamId);
    return `
      <article class="card home-team-average-card home-family-team-card home-clickable-card" data-home-leaderboard-action="go-family-team-average-leaderboard" role="button" tabindex="0" style="--team-color:${this.safeColor(myRow?.office_team_color, "#facc15")}">
        <div class="card-title-row">
          <h3>Team Famille</h3>
        </div>
        <div class="home-team-average-main ${myRow ? "" : "empty"}">
          <span class="home-team-rank">${myRow ? `#${myRow.rank}` : "—"}</span>${myRow && this.tieCountForRank(rows, myRow.rank) > 1 ? `<small class="rank-tie-label">ex æquo</small>` : ""}
          <div>
            <strong>${myRow ? H.escapeHtml(myRow.office_team_name || "Team") : "Pas classée"}</strong>
            <small>${myRow ? `${Number(myRow.average_points || 0).toFixed(1)} pts/match · ${myRow.active_players || 0} joueur${(myRow.active_players || 0) > 1 ? "s" : ""}` : "Aucun joueur Famille actif"}</small>
          </div>
        </div>
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
        ${this.isLiveDemoMatch(match) ? `<p class="test-match-mini-label">LABO LIVE · test classement</p>` : match.is_test_match ? `<p class="test-match-mini-label">MATCH TEST · hors classement Coupe du monde</p>` : ""}
        <p class="muted mini-location-line">${H.matchLocationHtml(match, true)}</p>
        <p class="muted mini-tv-line">${H.formatDateTime(match.kickoff_at)} · ${H.tvChannelLogosHtml(this.matchTvChannel(match))}</p>
      </div>
    `;
  },


  myRankFromRows(rows = []) {
    return (rows || []).find((row) =>
      String(row.user_id || row.id) === String(this.state.session?.user?.id)
    ) || null;
  },



  rankSentinelContextKey(context = "official") {
    return context === "family" ? "family" : "official";
  },

  rankSentinelStorageKey(context = "official") {
    return `${this.appStoragePrefix()}:rank-sentinel-${this.rankSentinelContextKey(context)}-snapshot:v2`;
  },

  rankMovementStorageKey(context = "official") {
    return `${this.appStoragePrefix()}:rank-sentinel-${this.rankSentinelContextKey(context)}-movement:v2`;
  },

  rankSentinelLastMessagesKey() {
    return `${this.appStoragePrefix()}:rank-sentinel-last-messages:v1`;
  },

  rankSentinelHasLiveOfficialMatch() {
    return (this.state.matches || []).some((match) =>
      match.status === "live"
      && !match.is_test_match
    ) || this.liveOfficialProjectionRows().length > 0;
  },

  rankSentinelRows(rows = this.state.playerScoreRows, context = "official") {
    const key = this.rankSentinelContextKey(context);
    const officialOnlyRows = (rows || []).map((row) => ({
      ...row,
      // Sécurité anti-live : si une ligne arrive avec une projection,
      // on l'enlève du total et on recalcule le rang.
      total_points: Number(row.total_points || 0) - Number(row.live_points || 0),
      live_points: 0,
      live_match_count: 0,
      has_live_projection: false
    }));

    const ranked = key === "family"
      ? this.sortPlayerRows(officialOnlyRows, "points")
      : this.rankedOfficialLeaderboardRows(officialOnlyRows);

    return ranked
      .map((row, index) => ({
        userId: String(row.user_id || row.id || ""),
        pseudo: row.pseudo || row.display_name || "Joueur",
        rank: Number(row.rank || index + 1),
        total_points: Number(row.total_points || 0),
        exact_scores: Number(row.exact_scores || 0),
        good_results: Number(row.good_results || 0)
      }))
      .filter((row) => row.userId);
  },

  currentRankSentinelSnapshot(context = "official", sourceRows = this.state.playerScoreRows) {
    const key = this.rankSentinelContextKey(context);
    const rows = this.rankSentinelRows(sourceRows, key);
    const me = rows.find((row) => row.userId === String(this.state.session?.user?.id));
    if (!me) return null;
    return {
      context: key,
      userId: me.userId,
      rank: Number(me.rank || 0),
      total_points: Number(me.total_points || 0),
      pseudo: me.pseudo || this.state.profile?.pseudo || "Toi",
      rows,
      captured_at: new Date().toISOString()
    };
  },

  readRankSentinelSnapshot(context = "official") {
    try {
      const raw = window.localStorage.getItem(this.rankSentinelStorageKey(context));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.userId !== String(this.state.session?.user?.id)) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  },

  writeRankSentinelSnapshot(snapshot, context = "official") {
    if (!snapshot) return;
    const key = this.rankSentinelContextKey(context);
    try {
      window.localStorage.setItem(this.rankSentinelStorageKey(key), JSON.stringify(snapshot));
      this.state.rankSentinelLastSnapshot = snapshot;
    } catch (error) {
      console.warn("Hibou Sentinelle : snapshot impossible à sauvegarder", error);
    }
  },

  readRankMovementMap(context = "official") {
    const key = this.rankSentinelContextKey(context);
    if (this.state.rankSentinelMovementMaps?.[key]) return this.state.rankSentinelMovementMaps[key];

    try {
      const raw = window.localStorage.getItem(this.rankMovementStorageKey(key));
      const parsed = raw ? JSON.parse(raw) : {};
      this.state.rankSentinelMovementMaps[key] = parsed && typeof parsed === "object" ? parsed : {};
      return this.state.rankSentinelMovementMaps[key];
    } catch (error) {
      this.state.rankSentinelMovementMaps[key] = {};
      return {};
    }
  },

  writeRankMovementMap(map = {}, context = "official") {
    const key = this.rankSentinelContextKey(context);
    const safeMap = map && typeof map === "object" ? map : {};
    this.state.rankSentinelMovementMaps[key] = safeMap;
    try {
      window.localStorage.setItem(this.rankMovementStorageKey(key), JSON.stringify(safeMap));
    } catch (error) {
      console.warn("Hibou Sentinelle : mouvements impossibles à sauvegarder", error);
    }
  },

  rankSnapshotChanged(previous, current) {
    if (!previous || !current) return false;
    const previousRows = Array.isArray(previous.rows) ? previous.rows : [];
    const currentRows = Array.isArray(current.rows) ? current.rows : [];
    if (previousRows.length !== currentRows.length) return true;

    const previousById = new Map(previousRows.map((row) => [String(row.userId), row]));
    return currentRows.some((row) => {
      const old = previousById.get(String(row.userId));
      if (!old) return true;
      return Number(old.rank) !== Number(row.rank)
        || Number(old.total_points || 0) !== Number(row.total_points || 0)
        || Number(old.exact_scores || 0) !== Number(row.exact_scores || 0)
        || Number(old.good_results || 0) !== Number(row.good_results || 0);
    });
  },

  buildRankMovementMap(previous, current) {
    const previousRows = Array.isArray(previous?.rows) ? previous.rows : [];
    const currentRows = Array.isArray(current?.rows) ? current.rows : [];
    const previousById = new Map(previousRows.map((row) => [String(row.userId), row]));
    const map = {};

    currentRows.forEach((row) => {
      const old = previousById.get(String(row.userId));
      if (!old) return;
      const oldRank = Number(old.rank);
      const newRank = Number(row.rank);
      if (!Number.isFinite(oldRank) || !Number.isFinite(newRank) || oldRank === newRank) return;
      const delta = oldRank - newRank;
      map[String(row.userId)] = {
        delta,
        direction: delta > 0 ? "up" : "down",
        oldRank,
        newRank,
        total_points: Number(row.total_points || 0),
        updated_at: current.captured_at
      };
    });

    return map;
  },

  readRankSentinelLastMessages() {
    try {
      const raw = window.localStorage.getItem(this.rankSentinelLastMessagesKey());
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  },

  writeRankSentinelLastMessage(change) {
    if (!change) return;
    const key = this.rankSentinelContextKey(change.context);
    const messages = this.readRankSentinelLastMessages();
    const contextLabel = key === "family" ? "Famille" : "Général";
    const crossedNames = this.rankSentinelNames(change.crossed);
    const body = change.improved
      ? `Tu es passé de #${change.oldRank} à #${change.newRank}${crossedNames ? ` en dépassant ${crossedNames}` : ""}. Le Hibou a secoué ses plumes avec fierté.`
      : `Tu es passé de #${change.oldRank} à #${change.newRank}${crossedNames ? `, ${crossedNames} est passé devant` : ""}. Le Hibou garde ça pour la revanche.`;

    messages[key] = {
      id: `rank-sentinel-${key}-${change.id}`,
      title: key === "family" ? "Hibou Sentinelle · classement Famille" : "Hibou Sentinelle · classement général",
      body,
      importance: change.improved ? "fun" : "warning",
      start_at: change.created_at || new Date().toISOString(),
      created_at: change.created_at || new Date().toISOString(),
      show_in_history: true,
      enabled: true,
      is_local_rank_sentinel: true,
      context_label: contextLabel
    };

    try {
      window.localStorage.setItem(this.rankSentinelLastMessagesKey(), JSON.stringify(messages));
    } catch (error) {
      console.warn("Hibou Sentinelle : impossible de stocker le dernier message", error);
    }
  },

  rankSentinelHistoryMessages() {
    const messages = this.readRankSentinelLastMessages();
    const list = [];
    if (messages.official) list.push(messages.official);
    if (this.canSeeFamily() && messages.family) list.push(messages.family);
    return list;
  },

  rankSentinelBackfillStorageKey(context = "official") {
    return `${this.appStoragePrefix()}:rank-sentinel-${this.rankSentinelContextKey(context)}-backfill:v1`;
  },

  latestFinishedOfficialMatchBatch() {
    const finished = (this.state.matches || [])
      .filter((match) =>
        match.status === "finished"
        && !match.is_test_match
        && !this.isLiveDemoMatch(match)
        && !["cancelled", "postponed"].includes(match.status)
      )
      .sort((a, b) => new Date(b.kickoff_at || b.updated_at || 0) - new Date(a.kickoff_at || a.updated_at || 0));

    if (!finished.length) return [];
    const latestTime = new Date(finished[0].kickoff_at || finished[0].updated_at || 0).getTime();
    return finished.filter((match) => {
      const time = new Date(match.kickoff_at || match.updated_at || 0).getTime();
      return Number.isFinite(time) && Math.abs(time - latestTime) < 60 * 1000;
    });
  },

  rankSentinelBackfillSignature(matches = []) {
    return matches
      .map((match) => String(match.id || ""))
      .filter(Boolean)
      .sort()
      .join("|");
  },

  rankSentinelBackfillAlreadyDone(context = "official", signature = "") {
    if (!signature) return true;
    try {
      return window.localStorage.getItem(this.rankSentinelBackfillStorageKey(context)) === signature;
    } catch (error) {
      return false;
    }
  },

  writeRankSentinelBackfillDone(context = "official", signature = "") {
    if (!signature) return;
    try {
      window.localStorage.setItem(this.rankSentinelBackfillStorageKey(context), signature);
    } catch (error) {}
  },

  rankSentinelRowsBeforeMatches(sourceRows = [], matchIds = new Set()) {
    if (!matchIds || !matchIds.size) return sourceRows || [];
    const byUser = new Map();

    (this.state.visiblePredictions || [])
      .filter((prediction) => matchIds.has(String(prediction.match_id)))
      .forEach((prediction) => {
        const userId = String(prediction.user_id || "");
        if (!userId) return;
        const item = byUser.get(userId) || {
          points: 0,
          exact: 0,
          good: 0,
          diff: 0,
          qualified: 0,
          scored: 0
        };
        item.points += Number(prediction.points_total || 0);
        item.exact += prediction.is_exact_score ? 1 : 0;
        item.good += prediction.is_good_result ? 1 : 0;
        item.diff += prediction.is_good_goal_diff ? 1 : 0;
        item.qualified += prediction.is_good_qualified ? 1 : 0;
        item.scored += prediction.points_total !== null && prediction.points_total !== undefined ? 1 : 0;
        byUser.set(userId, item);
      });

    return (sourceRows || []).map((row) => {
      const userId = String(row.user_id || row.id || "");
      const minus = byUser.get(userId);
      if (!minus) return { ...row };

      return {
        ...row,
        total_points: Math.max(0, Number(row.total_points || 0) - minus.points),
        exact_scores: Math.max(0, Number(row.exact_scores || 0) - minus.exact),
        good_results: Math.max(0, Number(row.good_results || 0) - minus.good),
        good_goal_diffs: Math.max(0, Number(row.good_goal_diffs || 0) - minus.diff),
        good_qualified: Math.max(0, Number(row.good_qualified || 0) - minus.qualified),
        scored_matches: Math.max(0, Number(row.scored_matches || 0) - minus.scored),
        live_points: 0,
        live_match_count: 0,
        has_live_projection: false
      };
    });
  },

  rankSentinelBackfillPreviousSnapshot(context = "official", sourceRows = this.state.playerScoreRows) {
    const key = this.rankSentinelContextKey(context);
    const matches = this.latestFinishedOfficialMatchBatch();
    const signature = this.rankSentinelBackfillSignature(matches);
    if (!matches.length || !signature || this.rankSentinelBackfillAlreadyDone(key, signature)) return null;

    const matchIds = new Set(matches.map((match) => String(match.id)));
    const previousRows = this.rankSentinelRowsBeforeMatches(sourceRows, matchIds);
    const snapshot = this.currentRankSentinelSnapshot(key, previousRows);
    if (snapshot) {
      snapshot.backfill = true;
      snapshot.backfill_signature = signature;
      snapshot.backfill_match_ids = [...matchIds];
    }
    return snapshot;
  },

  emitRankSentinelChange(previous, current, reason = "leaderboard", context = "official", options = {}) {
    const key = this.rankSentinelContextKey(context);
    if (!previous || !current) return false;

    const movementMap = this.buildRankMovementMap(previous, current);
    this.writeRankMovementMap(movementMap, key);

    const oldRank = Number(previous.rank);
    const newRank = Number(current.rank);
    const oldPoints = Number(previous.total_points || 0);
    const newPoints = Number(current.total_points || 0);

    this.writeRankSentinelSnapshot(current, key);

    if (options.backfillSignature) {
      this.writeRankSentinelBackfillDone(key, options.backfillSignature);
    }

    if (oldRank === newRank) return false;

    const improved = newRank < oldRank;
    const crossed = this.rankSentinelCrossedPlayers(previous, current, improved)
      .filter((row) => row.userId !== String(this.state.session?.user?.id))
      .slice(0, 6);

    const change = {
      id: `${Date.now()}-${key}-${oldRank}-${newRank}`,
      context: key,
      reason,
      improved,
      oldRank,
      newRank,
      oldPoints,
      newPoints,
      crossed,
      created_at: new Date().toISOString(),
      playerPseudo: current.pseudo || this.state.profile?.pseudo || "Toi"
    };

    this.writeRankSentinelLastMessage(change);
    this.enqueueRankSentinelModal(change);
    return true;
  },


  observeRankSentinel(reason = "leaderboard", context = "official", sourceRows = this.state.playerScoreRows) {
    const key = this.rankSentinelContextKey(context);
    // Le Hibou Sentinelle ne regarde jamais les projections live.
    // Pendant un match live officiel, il ne sauvegarde pas non plus de nouveau snapshot,
    // pour éviter de polluer la référence avec un rang provisoire.
    if (this.rankSentinelHasLiveOfficialMatch()) return;

    if (key === "family" && !this.canSeeFamily()) return;

    const current = this.currentRankSentinelSnapshot(key, sourceRows);
    if (!current || !Number.isFinite(current.rank) || current.rank <= 0) return;

    const previous = this.readRankSentinelSnapshot(key);
    if (key === "official") this.state.rankSentinelPreviousSnapshot = previous || null;

    const existingMovementMap = this.readRankMovementMap(key);
    const hasStoredMovements = Object.keys(existingMovementMap || {}).length > 0;

    if (!previous || !Number.isFinite(Number(previous.rank))) {
      const backfill = this.rankSentinelBackfillPreviousSnapshot(key, sourceRows);
      if (backfill && this.rankSnapshotChanged(backfill, current)) {
        this.emitRankSentinelChange(backfill, current, `${reason}-backfill`, key, {
          backfillSignature: backfill.backfill_signature
        });
        return;
      }

      if (backfill?.backfill_signature) {
        this.writeRankSentinelBackfillDone(key, backfill.backfill_signature);
      }
      this.writeRankSentinelSnapshot(current, key);
      this.writeRankMovementMap({}, key);
      return;
    }

    if (!this.rankSnapshotChanged(previous, current)) {
      // Cas important : l'utilisateur installe la Sentinelle après les résultats.
      // Le snapshot local existe déjà avec le classement actuel, donc on reconstruit
      // une comparaison "avant dernier match terminé" une seule fois.
      if (!hasStoredMovements) {
        const backfill = this.rankSentinelBackfillPreviousSnapshot(key, sourceRows);
        if (backfill && this.rankSnapshotChanged(backfill, current)) {
          this.emitRankSentinelChange(backfill, current, `${reason}-late-backfill`, key, {
            backfillSignature: backfill.backfill_signature
          });
          return;
        }
        if (backfill?.backfill_signature) {
          this.writeRankSentinelBackfillDone(key, backfill.backfill_signature);
        }
      }

      this.writeRankSentinelSnapshot(current, key);
      return;
    }

    this.emitRankSentinelChange(previous, current, reason, key);
  },


  rankSentinelCrossedPlayers(previous, current, improved) {
    const oldRank = Number(previous.rank);
    const newRank = Number(current.rank);
    const previousRows = Array.isArray(previous.rows) ? previous.rows : [];
    const currentRows = Array.isArray(current.rows) ? current.rows : [];
    const currentById = new Map(currentRows.map((row) => [String(row.userId), row]));
    const previousById = new Map(previousRows.map((row) => [String(row.userId), row]));

    if (improved) {
      return previousRows
        .filter((row) => Number(row.rank) >= newRank && Number(row.rank) < oldRank)
        .map((row) => currentById.get(String(row.userId)) || row)
        .sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999));
    }

    return currentRows
      .filter((row) => Number(row.rank) >= oldRank && Number(row.rank) < newRank)
      .map((row) => previousById.get(String(row.userId)) ? { ...row, previousRank: previousById.get(String(row.userId)).rank } : row)
      .sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999));
  },

  enqueueRankSentinelModal(change) {
    if (!change) return;
    this.state.rankSentinelQueue.push(change);
    this.showNextRankSentinelModal();
  },

  rankSentinelNames(crossed = []) {
    const names = crossed.map((row) => row.pseudo || "un joueur").filter(Boolean);
    if (!names.length) return "";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} et ${names[1]}`;
    return `${names[0]}, ${names[1]} et ${names.length - 2} autre${names.length - 2 > 1 ? "s" : ""}`;
  },

  showNextRankSentinelModal() {
    if (this.state.rankSentinelModalOpen) return;
    const change = this.state.rankSentinelQueue.shift();
    if (!change) return;

    this.state.rankSentinelModalOpen = true;
    H.$("#rankSentinelModal")?.remove();

    const contextLabel = this.rankSentinelContextKey(change.context) === "family" ? "Famille" : "Général";
    const crossedNames = this.rankSentinelNames(change.crossed);
    const pointsDelta = Number(change.newPoints || 0) - Number(change.oldPoints || 0);
    const title = change.improved ? "Le Hibou sentinelle bat des ailes !" : "Alerte plume froissée sur le perchoir";
    const headline = change.improved
      ? `Tu grimpes de #${change.oldRank} à #${change.newRank}`
      : `Tu glisses de #${change.oldRank} à #${change.newRank}`;
    const story = change.improved
      ? (crossedNames ? `Tu viens de passer devant ${H.escapeHtml(crossedNames)}. Le Nid a entendu un petit “flap flap” de domination.` : "Tu viens de gagner une place. Le perchoir tremble légèrement.")
      : (crossedNames ? `${H.escapeHtml(crossedNames)} vient de te passer devant. Le Hibou note ça dans son carnet des revanches.` : "Quelqu’un vient de te passer devant. Rien de dramatique, sauf pour ton ego sportif.");

    const modal = document.createElement("div");
    modal.id = "rankSentinelModal";
    modal.className = `modal-backdrop rank-sentinel-modal ${change.improved ? "rank-up" : "rank-down"} context-${this.rankSentinelContextKey(change.context)}`;
    modal.innerHTML = `
      <div class="modal-card rank-sentinel-card" role="dialog" aria-modal="true" aria-labelledby="rankSentinelTitle">
        <button class="modal-x-btn" id="closeRankSentinelXBtn" type="button" aria-label="Fermer">×</button>
        <div class="rank-sentinel-glow" aria-hidden="true"></div>
        <div class="rank-sentinel-owl">
          <img src="assets/icons/owl-png/admin.png" alt="" loading="lazy" onerror="this.style.display='none'">
          <span>${change.improved ? "🦉⬆️" : "🦉⚠️"}</span>
        </div>
        <p class="eyebrow">${H.icon("diffusion")} Hibou Sentinelle · ${H.escapeHtml(contextLabel)}</p>
        <h2 id="rankSentinelTitle">${H.escapeHtml(title)}</h2>
        <p class="rank-sentinel-headline">${H.escapeHtml(headline)}</p>
        <p class="rank-sentinel-story">${story}</p>
        <div class="rank-sentinel-stats">
          <article><span>Avant</span><strong>#${H.escapeHtml(change.oldRank)}</strong><small>${H.escapeHtml(change.oldPoints)} pts</small></article>
          <article class="rank-sentinel-arrow">${change.improved ? "↗" : "↘"}</article>
          <article><span>Maintenant</span><strong>#${H.escapeHtml(change.newRank)}</strong><small>${H.escapeHtml(change.newPoints)} pts${pointsDelta ? ` · ${pointsDelta > 0 ? "+" : ""}${H.escapeHtml(pointsDelta)}` : ""}</small></article>
        </div>
        ${change.crossed?.length ? `<div class="rank-sentinel-crossed"><strong>${change.improved ? "Joueur(s) dépassé(s)" : "Joueur(s) passé(s) devant"}</strong>${change.crossed.map((row) => `<span>#${H.escapeHtml(row.rank || "—")} ${H.escapeHtml(row.pseudo || "Joueur")} · ${H.escapeHtml(row.total_points || 0)} pts</span>`).join("")}</div>` : ""}
        <div class="rank-sentinel-actions">
          <button class="primary-btn" id="rankSentinelLeaderboardBtn" type="button">${H.icon("trophy")} Voir le classement</button>
          <button class="ghost-btn" id="closeRankSentinelBtn" type="button">Bien reçu, vieux hibou</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => {
      modal.remove();
      this.state.rankSentinelModalOpen = false;
      this.showNextRankSentinelModal();
    };

    H.$("#closeRankSentinelXBtn", modal)?.addEventListener("click", close);
    H.$("#closeRankSentinelBtn", modal)?.addEventListener("click", close);
    H.$("#rankSentinelLeaderboardBtn", modal)?.addEventListener("click", async () => {
      close();
      await this.loadView("leaderboard");
      if (this.rankSentinelContextKey(change.context) === "family") {
        this.state.leaderboardTab = "family";
        await this.renderLeaderboardContent();
      }
    });
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
    H.$("#closeRankSentinelBtn", modal)?.focus();
  },

  rankMovementForUser(userId, currentRank, context = "official") {
    const map = this.readRankMovementMap(context);
    const movement = map?.[String(userId)];
    if (!movement) return null;

    const newRank = Number(currentRank);
    if (Number.isFinite(newRank) && Number(movement.newRank) !== newRank) return null;
    return movement;
  },

  rankMovementHtml(row, context = "official") {
    const userId = row?.user_id || row?.id;
    const movement = this.rankMovementForUser(userId, row?.rank, context);
    if (!movement) return "";
    const delta = Number(movement.delta || 0);
    if (!delta) return "";
    const title = movement.direction === "up"
      ? `${Math.abs(delta)} place${Math.abs(delta) > 1 ? "s" : ""} gagnée${Math.abs(delta) > 1 ? "s" : ""}`
      : `${Math.abs(delta)} place${Math.abs(delta) > 1 ? "s" : ""} perdue${Math.abs(delta) > 1 ? "s" : ""}`;
    const label = `${movement.direction === "up" ? "↑" : "↓"} ${delta > 0 ? "+" : ""}${delta}`;
    return `<span class="rank-movement-pill ${movement.direction}" title="${H.escapeHtml(title)}">${H.escapeHtml(label)}</span>`;
  },


  tieCountForRank(rows = [], rank) {
    const r = Number(rank);
    if (!Number.isFinite(r)) return 0;
    return (rows || []).filter((row) => Number(row.rank) === r).length;
  },

  rankSuffixHtml(rows = [], rank) {
    return this.tieCountForRank(rows, rank) > 1 ? `<small class="rank-tie-label">ex æquo</small>` : "";
  },

  safeHomeLiveMatchCardHtml(match) {
    try {
      return this.homeLiveMatchCardHtml(match);
    } catch (error) {
      console.warn("Carte live accueil impossible", error);
      return `
        <article class="card home-live-match-card home-clickable-card" data-home-live-match-id="${H.escapeHtml(match?.id || "")}" role="button" tabindex="0">
          <div class="home-live-card-head">
            <span class="pill danger">En direct</span>
            <span class="pill">${H.escapeHtml(H.shortPoolRoundLabel(match || {}))}</span>
          </div>
          ${this.matchMiniHtml(match)}
          <div class="home-live-score-strip">
            <strong>${H.scoreText(match?.home_score ?? 0, match?.away_score ?? 0)}</strong>
            <span>Match en cours</span>
          </div>
          <button class="ghost-btn home-live-predictions-btn" type="button" data-home-live-predictions-id="${H.escapeHtml(match?.id || "")}">
            ${H.icon("score")} Voir les pronos du Nid
          </button>
        </article>
      `;
    }
  },

  homeLiveMatchCardHtml(match) {
    if (!match) return "";
    const myPrediction = this.getMyPrediction(match.id);
    const displayPrediction = this.predictionForDisplay(myPrediction, match);
    const livePoints = displayPrediction?.is_live_projection ? Number(displayPrediction.points_total || 0) : null;

    return `
      <article class="card home-live-match-card home-clickable-card" data-home-live-match-id="${H.escapeHtml(match.id)}" role="button" tabindex="0">
        <div class="home-live-card-head">
          <span class="pill danger">En direct</span>
          <span class="pill">${H.escapeHtml(H.shortPoolRoundLabel(match))}</span>
          <small>${H.formatDateTime(match.kickoff_at)}</small>
        </div>
        ${this.matchMiniHtml(match)}
        <div class="home-live-score-strip">
          <strong>${H.scoreText(match.home_score ?? 0, match.away_score ?? 0)}</strong>
          <span>${myPrediction ? `Ton prono ${myPrediction.home_score_pred} - ${myPrediction.away_score_pred}` : "Prono non posé"}</span>
          ${livePoints !== null && !match.is_test_match ? `<b>${livePoints} pt${livePoints > 1 ? "s" : ""} live</b>` : ""}
          ${match.is_test_match ? `<b>Match test</b>` : ""}
        </div>
        <button class="ghost-btn home-live-predictions-btn" type="button" data-home-live-predictions-id="${H.escapeHtml(match.id)}">
          ${H.icon("score")} Voir les pronos du Nid
        </button>
      </article>
    `;
  },

  homePredictionRowHtml(prediction, match) {
    const display = this.predictionForDisplay(prediction, match) || prediction;
    const isMine = String(prediction.user_id || "") === String(this.state.session?.user?.id || "");
    const points = display.points_total ?? "—";
    const reason = this.predictionReasonLabel(display);
    return `
      <div class="home-prono-row ${isMine ? "me" : ""} ${display.is_live_projection ? "live" : ""}">
        <div class="home-prono-player">
          <strong>${H.escapeHtml(prediction.pseudo || (isMine ? "Moi" : "Joueur"))}</strong>
          <small>${isMine ? "Ton prono" : H.escapeHtml(prediction.office_team_name || "Le Nid")}</small>
        </div>
        <div class="home-prono-score">
          <strong>${Number(prediction.home_score_pred)} - ${Number(prediction.away_score_pred)}</strong>
          <small>${H.escapeHtml(reason)}</small>
        </div>
        <div class="home-prono-points">
          <strong>${H.escapeHtml(String(points))}</strong>
          <small>pt${Number(points || 0) > 1 ? "s" : ""}${display.is_live_projection ? " live" : ""}</small>
        </div>
      </div>
    `;
  },

  async openHomePredictionsModal(matchId) {
    const match = this.state.matches.find((item) => String(item.id) === String(matchId));
    if (!match) {
      H.toast("Match introuvable pour afficher les pronos.", "error");
      return;
    }

    await this.loadVisiblePredictions().catch((error) => console.warn("Rafraîchissement pronos live impossible", error));

    const rows = this.predictionsForMatch(match.id)
      .map((prediction) => this.predictionForDisplay(prediction, match) || prediction)
      .sort((a, b) =>
        Number(b.points_total ?? -1) - Number(a.points_total ?? -1)
        || String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr")
      );

    const myPrediction = this.getMyPrediction(match.id);
    const title = `${match.home_team_short_name || match.home_team_name} - ${match.away_team_short_name || match.away_team_name}`;

    document.querySelector("#homePredictionsModal")?.remove();

    const modal = document.createElement("div");
    modal.id = "homePredictionsModal";
    modal.className = "modal-backdrop home-predictions-modal";
    modal.innerHTML = `
      <div class="modal-card home-predictions-card" role="dialog" aria-modal="true" aria-labelledby="homePredictionsTitle">
        <button class="modal-x-btn" id="closeHomePredictionsXBtn" type="button" aria-label="Fermer">×</button>
        <div class="home-predictions-head">
          <span class="pill danger">${match.status === "live" ? "En direct" : H.statusLabel(match.status)}</span>
          <h2 id="homePredictionsTitle">${H.matchFlagHtml(match, "home")} ${H.escapeHtml(title)} ${H.matchFlagHtml(match, "away")}</h2>
          <p>${H.escapeHtml(H.shortPoolRoundLabel(match))} · Score actuel : <strong>${H.scoreText(match.home_score, match.away_score)}</strong></p>
        </div>

        ${myPrediction ? `
          <div class="home-prono-mine">
            <small>Ton prono</small>
            <strong>${Number(myPrediction.home_score_pred)} - ${Number(myPrediction.away_score_pred)}</strong>
          </div>
        ` : `<div class="home-prono-mine missing"><small>Ton prono</small><strong>Non posé</strong></div>`}

        <div class="home-prono-list">
          ${rows.length ? rows.map((row) => this.homePredictionRowHtml(row, match)).join("") : `<p class="muted">Aucun prono visible pour ce match pour le moment.</p>`}
        </div>

        <div class="modal-actions-row">
          <button class="primary-btn" id="closeHomePredictionsBtn" type="button">Fermer</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    H.$("#closeHomePredictionsXBtn", modal)?.addEventListener("click", close);
    H.$("#closeHomePredictionsBtn", modal)?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    H.$("#closeHomePredictionsBtn", modal)?.focus();
  },

  async fetchMyRank() {
    const { data, error } = await window.sb
      .from("v_leaderboard_overall")
      .select("rank,user_id,total_points")
      .eq("user_id", this.state.session.user.id)
      .maybeSingle();

    if (error) return null;
    const rankedRows = this.rankedOfficialLeaderboardRows(this.state.playerScoreRows || []);
    const localRank = this.myRankFromRows(rankedRows);
    return localRank || data;
  },


  upcomingPredictionMatches() {
    return this.displayMatches()
      .filter((match) => !["finished", "cancelled"].includes(match.status))
      .sort((a, b) => {
        const statusWeight = (match) => match.status === "live" ? 0 : match.status === "scheduled" ? 1 : 2;
        return statusWeight(a) - statusWeight(b)
          || new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0);
      });
  },

  async renderMatches() {
    await Promise.all([this.loadMatches(), this.loadGroupStandings(), this.loadMyPredictions(), this.loadVisiblePredictions()]);

    const root = H.$("#viewRoot");
    const matchesTab = ["upcoming", "played"].includes(this.state.matchesTab) ? this.state.matchesTab : "upcoming";
    this.state.matchesTab = matchesTab;

    const tabs = `
      <div class="segmented match-view-tabs">
        <button class="${matchesTab === "upcoming" ? "active" : ""}" type="button" data-matches-tab="upcoming">À venir & pronos</button>
        <button class="${matchesTab === "played" ? "active" : ""}" type="button" data-matches-tab="played">Matchs joués</button>
      </div>
    `;

    const playedMatches = this.displayMatches()
      .filter((match) => match.status === "finished")
      .sort((a, b) => new Date(b.kickoff_at || 0) - new Date(a.kickoff_at || 0));

    if (matchesTab === "played") {
      root.innerHTML = `
        <section class="toolbar-card">
          <div>
            <h2>Matchs joués</h2>
            <p class="muted">Retrouve tes anciens pronos, les scores officiels et les pronos du Nid.</p>
          </div>
          <button class="ghost-btn" id="refreshMatchesBtn">Rafraîchir</button>
        </section>
        ${tabs}
        <section class="played-matches-board">
          ${playedMatches.length ? playedMatches.map((match) => this.playedMatchCardHtml(match)).join("") : `<section class="card"><p class="muted">Aucun match joué pour le moment.</p></section>`}
        </section>
      `;

      H.$("#refreshMatchesBtn")?.addEventListener("click", async () => {
        await this.renderMatches();
        H.toast("Matchs rafraîchis", "success");
      });
      this.bindMatchViewTabs(root);
      return;
    }

    const upcomingMatches = this.upcomingPredictionMatches();
    const groups = this.groupMatchesByPouleRound(upcomingMatches);
    const activeIndex = this.clampPhaseIndex("matchPhaseIndex", groups);
    const group = groups[activeIndex];

    if (!groups.length || !group) {
      root.innerHTML = `
        <section class="toolbar-card">
          <div>
            <h2>Matchs & pronos</h2>
            <p class="muted">Aucun match à venir à afficher pour le moment. Les matchs terminés sont dans l’onglet Matchs joués.</p>
          </div>
          <button class="ghost-btn" id="refreshMatchesBtn">Rafraîchir</button>
        </section>
        ${tabs}
      `;
      H.$("#refreshMatchesBtn")?.addEventListener("click", async () => this.renderMatches());
      this.bindMatchViewTabs(root);
      return;
    }

    const matchIds = group.matches.map((match) => match.id);
    const finishedCount = group.matches.filter((m) => ["finished", "live"].includes(m.status)).length;
    const liveProjectionCount = this.liveProjectionCountForMatchIds(matchIds);
    const pager = this.phaseNavigatorHtml(groups, activeIndex, "matchPhaseIndex");

    root.innerHTML = `
      <section class="toolbar-card">
        <div>
          <h2>Matchs & pronos</h2>
          <p class="muted">Les prochains matchs et la saisie de tes scores sont ici. Les matchs terminés sont rangés dans Matchs joués.</p>
        </div>
        <button class="ghost-btn" id="refreshMatchesBtn">Rafraîchir</button>
      </section>

      ${tabs}

      <div class="live-ranking-note matches-upcoming-note">${H.icon("info")} Les matchs terminés ne sont plus affichés ici : retrouve-les dans l’onglet <strong>Matchs joués</strong>.</div>

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

    this.bindMatchViewTabs(root);
    this.bindPhaseNavigation("matchPhaseIndex", () => this.renderMatches());
    this.bindPredictionForms();
    this.bindGoToNearestMissingActions();
  },

  bindMatchViewTabs(root = document) {
    H.$$("[data-matches-tab]", root).forEach((button) => {
      button.addEventListener("click", async () => {
        this.state.matchesTab = button.dataset.matchesTab;
        await this.renderMatches();
      });
    });
  },

  predictionPhaseSummaryHtml(group) {
    const visibleMatches = this.displayMatches();
    const currentGroupMatches = group?.matches?.length ? group.matches : visibleMatches;
    const groupMissing = currentGroupMatches
      .filter((match) => new Date(match.kickoff_at).getTime() > Date.now())
      .filter((match) => !this.getMyPrediction(match.id));
    const allDone = visibleMatches.filter((match) => this.getMyPrediction(match.id));
    const locked = visibleMatches.filter((match) => H.isKickoffPassed(match.kickoff_at));

    return `
      <section class="grid three stats-grid combined-prono-stats">
        <article class="stat-card"><strong>${allDone.length}</strong><span>Pronos posés</span></article>
        ${groupMissing.length ? `
          <button class="stat-card stat-card-action" type="button" data-action="go-nearest-missing" title="Aller au prono manquant le plus proche de cette page">
            <strong>${groupMissing.length}</strong><span>À faire ici</span>
          </button>
        ` : `<article class="stat-card"><strong>0</strong><span>À faire ici</span></article>`}
        <article class="stat-card"><strong>${locked.length}</strong><span>Verrouillés</span></article>
      </section>
    `;
  },


  bindHomeClickableCards(root = document) {
    H.$$("[data-home-live-predictions-id]", root).forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        await this.openHomePredictionsModal(button.dataset.homeLivePredictionsId);
      });
    });

    H.$$("[data-home-live-match-id]", root).forEach((card) => {
      card.addEventListener("click", () => this.goToMatchPrediction(card.dataset.homeLiveMatchId));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.goToMatchPrediction(card.dataset.homeLiveMatchId);
        }
      });
    });

    H.$$("[data-home-next-match-id]", root).forEach((card) => {
      const open = async () => {
        const matchId = card.dataset.homeNextMatchId;
        if (matchId) await this.goToMatchPrediction(matchId);
      };

      card.addEventListener("click", async (event) => {
        if (event.target.closest("button,a,input,select,textarea,summary")) return;
        await open();
      });

      card.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        await open();
      });
    });

    H.$$("[data-home-leaderboard-action]", root).forEach((card) => {
      const open = async () => {
        const action = card.dataset.homeLeaderboardAction;
        if (action === "go-overall-leaderboard") {
          this.state.leaderboardTab = "players";
          this.state.playerLeaderboardMode = "overall";
        } else if (action === "go-team-average-leaderboard") {
          this.state.leaderboardTab = "team";
          this.state.teamLeaderboardScope = "overall";
          this.state.teamTab = "average";
        } else if (action === "go-family-player-leaderboard") {
          this.state.leaderboardTab = "family";
          this.state.familyLeaderboardTab = "players";
          this.state.familyPlayerLeaderboardMode = "overall";
        } else if (action === "go-family-team-average-leaderboard") {
          this.state.leaderboardTab = "family";
          this.state.familyLeaderboardTab = "team";
          this.state.familyTeamLeaderboardScope = "overall";
          this.state.familyTeamTab = "average";
        }
        await this.loadView("leaderboard");
      };

      card.addEventListener("click", async (event) => {
        if (event.target.closest("button,a,input,select,textarea,summary")) return;
        await open();
      });

      card.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        await open();
      });
    });
  },


  matchTvChannel(match) {
    if (match?.is_test_match) {
      const raw = String(match.tv_channel || "").trim();
      return raw.toLowerCase().includes("tf1") ? raw : "TF1";
    }
    return match?.tv_channel || "beIN Sports";
  },

  matchCountdownLabel(kickoffAt) {
    if (!kickoffAt) return "Date à confirmer";
    const target = new Date(kickoffAt).getTime();
    if (!Number.isFinite(target)) return "Date à confirmer";

    const diffMs = target - Date.now();
    if (diffMs <= 0) return "Coup d’envoi passé";

    const totalMinutes = Math.ceil(diffMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (days) parts.push(`${days} j`);
    if (hours || days) parts.push(`${hours} h`);
    parts.push(`${minutes} min`);

    return `Dans ${parts.join(" ")}`;
  },

  clearHomeCountdowns() {
    if (this.state.homeCountdownTimer) {
      window.clearInterval(this.state.homeCountdownTimer);
      this.state.homeCountdownTimer = null;
    }
  },

  startHomeCountdowns(root = document) {
    const nodes = H.$$("[data-countdown-at]", root);
    if (!nodes.length) return;

    const updateAll = () => {
      nodes.forEach((node) => {
        const target = node.dataset.countdownAt;
        const label = node.querySelector("strong") || node;
        if (!label || !target) return;
        label.textContent = this.matchCountdownLabel(target);
      });
    };

    updateAll();
    this.state.homeCountdownTimer = window.setInterval(updateAll, 30000);
  },

  openPredictionsForMatch(matchId) {
    if (!matchId) return false;

    const stringId = String(matchId);
    const matchCard = document.getElementById(`match-${stringId}`);
    const playedCard = document.getElementById(`played-match-${stringId}`);

    const formNode = [...document.querySelectorAll("[data-match-id]")]
      .find((node) => String(node.dataset.matchId) === stringId);

    const details = matchCard?.querySelector(".others-predictions")
      || formNode?.closest(".match-card")?.querySelector(".others-predictions")
      || playedCard;

    if (details) {
      if ("open" in details) details.open = true;
      details.hidden = false;
      details.scrollIntoView({ behavior: "smooth", block: "center" });
      const summary = details.querySelector?.("summary");
      if (summary) summary.focus?.({ preventScroll: true });
      return true;
    }

    const target = matchCard || playedCard || formNode?.closest(".match-card");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }

    return false;
  },


  setMatchPhaseIndexForMatch(match) {
    if (!match) return false;
    const groups = this.groupMatchesByPouleRound(this.upcomingPredictionMatches());
    const groupIndex = groups.findIndex((group) => group.matches.some((item) => String(item.id) === String(match.id)));
    if (groupIndex >= 0) {
      this.state.matchPhaseIndex = groupIndex;
      return true;
    }
    return false;
  },

  async goToMatchPrediction(matchId, options = {}) {
    const targetId = String(matchId ?? "");
    const match = this.state.matches.find((item) => String(item.id) === targetId);
    if (!match) {
      await this.loadView("matches");
      setTimeout(() => {
        this.scrollToMatch(targetId);
        if (options.openPredictions) this.openPredictionsForMatch(targetId);
      }, 150);
      return;
    }

    this.state.matchesTab = "upcoming";
    this.setMatchPhaseIndexForMatch(match);

    if (this.state.currentView !== "matches") {
      await this.loadView("matches");
    } else {
      await this.renderMatches();
    }

    setTimeout(() => {
      this.scrollToMatch(match.id);
      if (options.openPredictions) this.openPredictionsForMatch(match.id);
    }, 120);
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
    const firstInput = target.querySelector('input:not([disabled]), select:not([disabled])');
    if (firstInput) setTimeout(() => firstInput.focus({ preventScroll: true }), 450);
    setTimeout(() => target.classList.remove("match-card-highlight"), 1200);
  },

  predictionCandidateSortValue(match = {}) {
    const kickoff = match?.kickoff_at ? new Date(match.kickoff_at).getTime() : 9999999999999;
    if (match.stage !== "group") return kickoff;
    const pool = Number(match.pool_round || match.group_round || 99);
    return pool * 1000000000000 + kickoff;
  },

  sortPredictionCandidates(matches = []) {
    return [...matches].sort((a, b) => this.predictionCandidateSortValue(a) - this.predictionCandidateSortValue(b));
  },

  nearestMissingPredictionMatch() {
    const now = Date.now();
    const candidates = this.availablePredictionMatches()
      .filter((match) => !["finished", "cancelled", "postponed"].includes(match.status))
      .filter((match) => new Date(match.kickoff_at || 0).getTime() > now)
      .filter((match) => !this.getMyPrediction(match.id));

    const groupCandidates = this.sortPredictionCandidates(candidates.filter((match) => match.stage === "group"));

    // Tant qu'il reste un vrai match de poule à pronostiquer,
    // on ne saute jamais vers les 16e ni vers un placeholder de phase finale.
    return groupCandidates[0] || this.sortPredictionCandidates(candidates)[0] || null;
  },

  async goToNearestMissingPrediction() {
    const match = this.nearestMissingPredictionMatch();
    if (!match) {
      H.toast("Tous tes pronos à venir sont posés. La chouette est tranquille.", "success");
      return;
    }

    this.state.matchesTab = "upcoming";
    this.setMatchPhaseIndexForMatch(match);

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
        matches: group.matches.sort((a, b) => new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0)
          || (H.officialBracketSortValue?.(a) || this.finalBracketSortValue(a))
          - (H.officialBracketSortValue?.(b) || this.finalBracketSortValue(b)))
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
    if (!prediction || !["finished", "live"].includes(match.status)) return "";
    const storedPoints = this.myPointsForMatch(match.id);
    const points = match.status === "live"
      ? this.predictionForDisplay(prediction, match)
      : this.predictionForDisplay(storedPoints || prediction, match);
    const liveSuffix = match.status === "live" ? " live" : "";
    const pointsText = match.is_test_match
      ? (points?.is_live_projection ? `${Number(points.points_total ?? 0)} pt${Number(points.points_total ?? 0) > 1 ? "s" : ""} test live · ${H.escapeHtml(this.predictionReasonLabel(points))}` : "Match test · hors classement")
      : points
        ? `${Number(points.points_total ?? 0)} pt${Number(points.points_total ?? 0) > 1 ? "s" : ""}${liveSuffix} · ${H.escapeHtml(this.predictionReasonLabel(points))}`
        : "Points en attente";

    return `
      <div class="my-prono-result ${match.status === "live" ? "live" : "finished"}">
        <div>
          <small>${match.status === "live" ? "Projection actuelle" : match.is_test_match ? "Résultat test" : "Points gagnés"}</small>
          <strong>${pointsText}</strong>
        </div>
      </div>
    `;
  },

  playedMatchCardHtml(match) {
    const myPrediction = this.getMyPrediction(match.id);
    const visiblePreds = this.predictionsForMatch(match.id)
      .map((prediction) => this.predictionForDisplay(prediction, match) || prediction)
      .sort((a, b) =>
        Number(b.points_total ?? -1) - Number(a.points_total ?? -1)
        || String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr")
      );

    const myVisiblePrediction = visiblePreds.find((p) => String(p.user_id) === String(this.state.session?.user?.id));
    const myDisplay = myVisiblePrediction || (myPrediction ? (this.predictionForDisplay(myPrediction, match) || myPrediction) : null);
    const myPoints = myDisplay?.points_total ?? "—";
    const myPointsLabel = myPoints === "—"
      ? "— pt"
      : `${myPoints} pt${Number(myPoints || 0) > 1 ? "s" : ""}${myDisplay?.is_live_projection ? " live" : ""}`;
    const myPronoLabel = myDisplay ? `${myDisplay.home_score_pred} - ${myDisplay.away_score_pred}` : "—";
    const officialScore = ["finished", "live"].includes(match.status) ? H.scoreText(match.home_score, match.away_score) : "vs";
    const matchLabel = `${match.home_team_short_name || match.home_team_name} - ${match.away_team_short_name || match.away_team_name}`;

    return `
      <details class="played-match-card compact ${match.status === "live" ? "live" : "finished"}" id="played-match-${H.escapeHtml(match.id)}">
        <summary class="played-match-summary">
          <div class="played-summary-main">
            <span class="pill ${match.status}">${H.statusLabel(match.status)}</span>
            <strong>${H.matchFlagHtml(match, "home")} ${H.escapeHtml(match.home_team_short_name || match.home_team_name)} - ${H.matchFlagHtml(match, "away")} ${H.escapeHtml(match.away_team_short_name || match.away_team_name)}</strong>
            <small>${H.formatDateTime(match.kickoff_at)} · ${H.stageLabel(match.stage)}${match.stage === "group" && match.pool_round ? ` · J. poule ${match.pool_round}` : ""}</small>
          </div>

          <div class="played-summary-score">
            <span>Résultat</span>
            <strong>${officialScore}</strong>
          </div>

          <div class="played-summary-prono">
            <span>Mon prono</span>
            <strong>${H.escapeHtml(myPronoLabel)}</strong>
          </div>

          <div class="played-summary-points">
            <span>Points</span>
            <strong>${H.escapeHtml(String(myPointsLabel))}</strong>
          </div>

          <span class="played-summary-open">Voir les pronos</span>
        </summary>

        <div class="played-match-expanded">
          <section class="played-my-prono">
            <h4>Mon prono</h4>
            ${myDisplay ? `
              <div class="played-prono-big">
                <strong>${myDisplay.home_score_pred} - ${myDisplay.away_score_pred}</strong>
                <span>${myPointsLabel} · ${H.escapeHtml(this.predictionReasonLabel(myDisplay))}</span>
              </div>
            ` : `<p class="muted">Tu n’avais pas posé de prono sur ce match.</p>`}
          </section>

          <section class="played-others-pronos">
            <h4>Pronos du Nid · ${H.escapeHtml(matchLabel)}</h4>
            ${visiblePreds.length ? `
              <div class="played-pred-list">
                ${visiblePreds.map((p) => `
                  <div class="played-pred-row ${p.user_id === this.state.session.user.id ? "me" : ""}">
                    <span>${H.escapeHtml(p.pseudo || "Joueur")} ${H.resultIcon(p)}</span>
                    <strong>${p.home_score_pred} - ${p.away_score_pred}</strong>
                    <em>${p.points_total ?? "—"} pt${p.points_total === null || p.points_total === undefined ? " · recalcul requis" : ""}${Number(p.points_total || 0) > 1 ? "s" : ""}${p.is_live_projection ? " live" : ""}</em>
                  </div>
                `).join("")}
              </div>
            ` : `<p class="muted">Aucun prono visible pour ce match.</p>`}
          </section>
        </div>
      </details>
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
          <span class="match-tv-meta">${H.icon("tv")} ${H.tvChannelLogosHtml(this.matchTvChannel(match))}</span>
        </div>

        ${this.isLiveDemoMatch(match) ? `<div class="test-match-notice live-demo-notice">${H.icon("info")} Labo live fictif : il compte temporairement dans les classements pour tester les variations en direct. Quand tu le retires, le match et ses pronos disparaissent. À retirer avant validation Coupe du monde.</div>` : match.is_test_match ? `<div class="test-match-notice">${H.icon("info")} Match de préparation : il sert à tester le site. Il ne compte pas dans le classement Coupe du monde ni dans les exploits normaux.</div>` : ""}

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
            ${locked ? `<span class="locked-label">${H.icon("lock")} Prono verrouillé</span>` : ``}
            ${myPrediction ? this.myPredictionInlineHtml(myPrediction) : `<span class="muted">Aucun prono posé</span>`}
          </div>
          <div class="my-prono-result-slot">${this.myPredictionResultHtml(match, myPrediction)}</div>
        </form>

        <details class="others-predictions" ${canSeeOthers ? "" : "hidden"}>
          <summary>Voir les pronos du nid</summary>
          ${visiblePreds.length ? `
            <div class="pred-list">
              ${visiblePreds.map((p) => {
                const display = this.predictionForDisplay(p, match) || p;
                const isProjection = display.is_live_projection;
                return `
                <div class="pred-row ${isProjection ? "live-projection" : ""}">
                  <span>${H.escapeHtml(p.pseudo)} ${H.resultIcon(display)}</span>
                  <strong>${p.home_score_pred} - ${p.away_score_pred}</strong>
                  <small>${display.points_total ?? "—"} pt${(display.points_total || 0) > 1 ? "s" : ""}${isProjection ? " live" : ""}</small>
                </div>
              `}).join("")}
            </div>
          ` : `<p class="muted">Aucun prono visible pour l’instant.</p>`}
        </details>
      </article>
    `;
  },


  upsertLocalPrediction(savedPrediction = {}) {
    if (!savedPrediction?.match_id) return;
    const userId = savedPrediction.user_id || this.state.session?.user?.id;
    const normalized = {
      ...savedPrediction,
      user_id: userId,
      pseudo: this.state.profile?.pseudo,
      office_team_name: this.state.profile?.office_team_name
    };

    const mergeInto = (rows = []) => {
      const index = rows.findIndex((row) =>
        String(row.match_id) === String(normalized.match_id)
        && String(row.user_id) === String(userId)
      );
      if (index >= 0) {
        rows[index] = { ...rows[index], ...normalized };
        return rows;
      }
      return [...rows, normalized];
    };

    this.state.myPredictions = mergeInto(this.state.myPredictions);
    this.state.visiblePredictions = mergeInto(this.state.visiblePredictions);
  },

  refreshPredictionFormDisplay(form, savedPrediction = {}) {
    if (!form || !savedPrediction?.match_id) return;
    const match = this.state.matches.find((item) => String(item.id) === String(savedPrediction.match_id));
    const prediction = this.getMyPrediction(savedPrediction.match_id) || savedPrediction;
    const actions = form.querySelector(".prediction-actions");
    if (actions) {
      const locked = match ? H.isKickoffPassed(match.kickoff_at) : false;
      actions.innerHTML = `
        ${locked ? `<span class="locked-label">${H.icon("lock")} Prono verrouillé</span>` : ``}
        ${this.myPredictionInlineHtml(prediction)}
      `;
    }

    const resultSlot = form.querySelector(".my-prono-result-slot");
    if (resultSlot && match) {
      resultSlot.innerHTML = this.myPredictionResultHtml(match, prediction);
    }

    const article = form.closest(".match-card");
    if (article) article.classList.add("prediction-saved-pulse");
    window.setTimeout(() => article?.classList.remove("prediction-saved-pulse"), 900);
  },

  bindPredictionForms() {
    H.$$(".prediction-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        this.clearPredictionAutoSave(form);
        await this.savePrediction(form, { silent: false, reloadView: true, source: "manual" });
      });

      H.$$('input[name="home_score_pred"], input[name="away_score_pred"]', form).forEach((input) => {
        input.addEventListener("input", () => this.triggerPredictionAutoSave(form));
        input.addEventListener("change", () => this.triggerPredictionAutoSave(form));
        input.addEventListener("blur", () => this.triggerPredictionAutoSave(form));
      });

      H.$$('select[name="qualified_team_pred"]', form).forEach((select) => {
        select.addEventListener("change", () => this.triggerPredictionAutoSave(form));
      });
    });
  },

  predictionFormReadyForAutoSave(form) {
    if (!form) return false;
    if (this.state.profile?.can_predict === false || this.state.profile?.is_banned) return false;
    const homeInput = form.querySelector('input[name="home_score_pred"]');
    const awayInput = form.querySelector('input[name="away_score_pred"]');
    const homeRaw = homeInput?.value;
    const awayRaw = awayInput?.value;
    if (homeRaw === "" || awayRaw === "") return false;

    const home = Number(homeRaw);
    const away = Number(awayRaw);
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) return false;

    const isFinalPhase = form.dataset.finalPhase === "true";
    const qualifiedSelect = form.querySelector('select[name="qualified_team_pred"]');
    if (isFinalPhase && qualifiedSelect) {
      if (!qualifiedSelect.value && home !== away) {
        const options = [...qualifiedSelect.options].map((option) => option.value).filter(Boolean);
        qualifiedSelect.value = home > away ? options[0] || "" : options[1] || "";
      }
      if (!qualifiedSelect.value) return false;
    }

    return true;
  },

  setPredictionAutoSaveStatus(form, message = "", type = "info") {
    const status = form?.querySelector(".prediction-autosave-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.status = type;
  },

  clearPredictionAutoSave(form) {
    const matchId = form?.dataset?.matchId;
    if (!matchId) return;
    const timer = this.state.predictionAutoSaveTimers?.get(matchId);
    if (timer) window.clearTimeout(timer);
    this.state.predictionAutoSaveTimers?.delete(matchId);
  },

  schedulePredictionAutoSave(form, delay = 0) {
    if (!delay) {
      this.triggerPredictionAutoSave(form);
      return;
    }

    if (!form || form.querySelector('input:disabled, select:disabled')) return;
    this.clearPredictionAutoSave(form);

    const timer = window.setTimeout(() => this.triggerPredictionAutoSave(form), delay);
    this.state.predictionAutoSaveTimers?.set(form.dataset.matchId, timer);
  },

  async triggerPredictionAutoSave(form) {
    if (!form || form.querySelector('input:disabled, select:disabled')) return;
    this.clearPredictionAutoSave(form);

    if (!this.predictionFormReadyForAutoSave(form)) {
      this.setPredictionAutoSaveStatus(form, "", "info");
      return;
    }

    if (form.dataset.autoSaving === "true") {
      form.dataset.pendingAutoSave = "true";
      this.setPredictionAutoSaveStatus(form, "Modification en attente…", "saving");
      return;
    }

    this.setPredictionAutoSaveStatus(form, "Sauvegarde auto…", "saving");
    await this.savePrediction(form, { silent: true, reloadView: false, source: "auto" });
  },

  async savePrediction(form, options = {}) {
    const { silent = false, reloadView = true, source = "manual" } = options;
    if (this.state.profile?.can_predict === false || this.state.profile?.is_banned) {
      if (!silent) H.toast("Les pronostics sont désactivés sur ton compte.", "error");
      this.setPredictionAutoSaveStatus(form, "Pronos désactivés", "error");
      return;
    }
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
      if (!silent) H.toast("Entre deux scores valides.", "error");
      this.setPredictionAutoSaveStatus(form, "Scores incomplets", "error");
      return;
    }

    form.dataset.autoSaving = "true";

    const { error } = await window.sb
      .from("predictions")
      .upsert(payload, { onConflict: "user_id,match_id" });

    if (error) {
      form.dataset.autoSaving = "false";
      form.dataset.pendingAutoSave = "false";
      if (!silent) H.toast(error.message || "Impossible d’enregistrer le prono.", "error");
      this.setPredictionAutoSaveStatus(form, "Erreur sauvegarde", "error");
      return;
    }

    this.upsertLocalPrediction(payload);
    this.refreshPredictionFormDisplay(form, payload);

    await this.loadMyPredictions();
    this.upsertLocalPrediction(payload);
    this.refreshPredictionFormDisplay(form, payload);
    await this.loadMiniRecordPredictionCounts().catch((refreshError) => {
      console.warn("Impossible de rafraîchir les compteurs mini-records", refreshError);
    });
    await this.loadVisiblePredictions().catch((refreshError) => {
      console.warn("Impossible de rafraîchir les pronos visibles avant l’annonce d’exploit", refreshError);
    });
    this.upsertLocalPrediction(payload);
    this.refreshPredictionFormDisplay(form, payload);
    this.queueAchievementDiffFromSnapshot(achievementIdsBeforeSave);
    this.syncAchievementNotifications();
    this.scheduleAchievementResync([120, 700, 1800]);
    form.dataset.autoSaving = "false";
    const pendingAutoSave = form.dataset.pendingAutoSave === "true";
    form.dataset.pendingAutoSave = "false";

    if (source === "auto" && pendingAutoSave) {
      this.setPredictionAutoSaveStatus(form, "Sauvegarde de la dernière modification…", "saving");
      await this.triggerPredictionAutoSave(form);
      return;
    }

    this.setPredictionAutoSaveStatus(form, source === "auto" ? "Enregistré automatiquement" : "Enregistré", "success");
    this.refreshPredictionFormDisplay(form, payload);
    if (!silent) H.toast("Prono enregistré", "success");
    if (reloadView) {
      if (this.state.currentView === "matches") await this.renderMatches();
      else await this.loadView(this.state.currentView);
    }
    this.syncAchievementNotifications();
    this.scheduleAchievementResync([300, 1200, 3500]);
  },

  async renderMyPredictions() {
    await Promise.all([this.loadMatches(), this.loadMyPredictions(), this.loadVisiblePredictions()]);

    const root = H.$("#viewRoot");
    const visibleMatches = this.displayMatches();
    const missing = this.missingPredictions();
    const done = visibleMatches.filter((m) => this.getMyPrediction(m.id));
    const groups = this.groupMatchesByPouleRound(visibleMatches);
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
        <article class="stat-card"><strong>${visibleMatches.filter((m) => H.isKickoffPassed(m.kickoff_at)).length}</strong><span>Verrouillés</span></article>
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
    await Promise.all([this.loadMatches(), this.loadVisiblePredictions(), this.loadMiniRecordPredictionCounts(), this.loadWinnerPrediction(), this.loadSecondWinnerPrediction(), this.loadWinnerPredictionsForTeams(), this.loadSecondWinnerPredictionsForTeams(), this.loadPlayerScoreRows()]);

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


  computeHallBadgesForUser(userId) {
    const badges = [...this.computeBadgesForUser(userId)];
    const has = new Set(badges.map((badge) => badge.id));
    const unlock = (id, unlockedAt = null) => {
      if (has.has(id)) return;
      const badge = this.badgeById(id);
      if (!badge) return;
      badges.push({ ...badge, unlockedAt: this.safeDate(unlockedAt) });
      has.add(id);
    };

    const countRow = this.miniRecordPredictionCountRow(userId);
    const predictionCount = Number(countRow?.prediction_count || countRow?.count || 0);
    const firstPredictionAt = countRow?.first_prediction_at || countRow?.first_at || countRow?.created_at || null;
    const latestPredictionAt = countRow?.latest_prediction_at || countRow?.latest_at || null;
    const availableMatchCount = this.availablePredictionMatches().length;
    const champion = this.winnerPredictionForUser(userId);
    const secondChampion = String(userId) === String(this.state.session?.user?.id) ? this.state.secondWinnerPrediction : null;
    const final = this.finalMatch();

    if (predictionCount >= 1) unlock("egg-hatched", firstPredictionAt);
    if (predictionCount >= 10) unlock("young-feathers", latestPredictionAt || firstPredictionAt);
    if (availableMatchCount > 0 && predictionCount >= Math.ceil(availableMatchCount / 2)) unlock("half-nest", latestPredictionAt || firstPredictionAt);
    if (availableMatchCount > 0 && predictionCount >= Math.ceil(availableMatchCount * 0.75)) unlock("three-quarter-perch", latestPredictionAt || firstPredictionAt);
    if (availableMatchCount > 0 && predictionCount >= availableMatchCount) unlock("all-picks-in", latestPredictionAt || firstPredictionAt);
    if (champion?.predicted_team_id) unlock("champion-picked", champion.locked_at || champion.updated_at || champion.created_at || firstPredictionAt);
    if (secondChampion?.predicted_team_id) unlock("second-champion-picked", secondChampion.locked_at || secondChampion.updated_at || secondChampion.created_at || latestPredictionAt || firstPredictionAt);
    if (final?.status === "finished" && final?.winner_team_id && secondChampion?.predicted_team_id === final.winner_team_id) unlock("second-final-winner-oracle", this.matchResultDate(final));

    return badges.sort((a, b) => {
      const aDate = a.unlockedAt?.getTime?.() || 0;
      const bDate = b.unlockedAt?.getTime?.() || 0;
      return bDate - aDate || String(a.title).localeCompare(String(b.title), "fr");
    });
  },


  hallBadgesPreviewHtml(userId, badges = [], sourceProfile = null) {
    if (!badges.length) return `<span class="muted">Aucun exploit public détecté pour l’instant.</span>`;

    const selectedIds = this.featuredBadgeIdsForUser(userId, sourceProfile);
    const byId = new Map(badges.map((badge) => [badge.id, badge]));
    const selected = selectedIds.map((id) => byId.get(id)).filter(Boolean).slice(0, 3);
    const shown = selected.length ? selected : badges.slice(0, 3);
    const hiddenCount = Math.max(0, badges.length - shown.length);
    return `
      <div class="achievement-preview hall-closed-preview" title="${selected.length ? "Badges choisis par le joueur" : "Aperçu automatique"}">
        ${shown.map((badge) => this.badgeChipHtml(badge)).join("")}
        <span class="achievement-chip achievement-more">${badges.length} exploit${badges.length > 1 ? "s" : ""}</span>
        ${hiddenCount ? `<span class="achievement-chip achievement-more subtle">+${hiddenCount}</span>` : ""}
      </div>
    `;
  },

  async renderAchievementHall() {
    const root = H.$("#achievementsContent");

    await Promise.all([
      this.loadPublicProfiles().catch((error) => console.warn("Profils publics indisponibles pour le Hall", error)),
      this.loadPlayerScoreRows().catch((error) => console.warn("Classement indisponible pour le Hall", error)),
      this.loadVisiblePredictions().catch((error) => console.warn("Pronos visibles indisponibles pour le Hall", error)),
      this.loadMiniRecordPredictionCounts().catch((error) => console.warn("Compteurs publics indisponibles pour le Hall", error)),
      this.loadWinnerPrediction().catch(() => null),
      this.loadSecondWinnerPrediction().catch(() => null),
      this.loadWinnerPredictionsForTeams().catch((error) => console.warn("Choix champion indisponibles pour le Hall", error)),
      this.loadSecondWinnerPredictionsForTeams().catch((error) => console.warn("2e choix champion indisponibles pour le Hall", error))
    ]);

    const byUser = new Map();

    this.state.publicProfiles.forEach((profile) => {
      const userId = profile.id || profile.user_id;
      if (!userId) return;
      byUser.set(String(userId), {
        ...profile,
        user_id: userId,
        total_points: 0,
        rank: null
      });
    });

    this.state.playerScoreRows.forEach((row) => {
      const userId = row.user_id || row.id;
      if (!userId) return;
      byUser.set(String(userId), {
        ...(byUser.get(String(userId)) || {}),
        ...row,
        user_id: userId
      });
    });

    const rows = [...byUser.values()]
      .filter((row) => row.user_id)
      .map((row) => ({ row, badges: this.computeHallBadgesForUser(row.user_id) }))
      .sort((a, b) =>
        b.badges.length - a.badges.length
        || Number(a.row.rank || 9999) - Number(b.row.rank || 9999)
        || String(a.row.pseudo || "").localeCompare(String(b.row.pseudo || ""), "fr")
      );

    root.innerHTML = `
      <div class="badge-leaderboard-list">
        ${rows.length ? rows.map(({ row, badges }, index) => `
          <details class="badge-player-card ${row.user_id === this.state.session.user.id ? "me" : ""}">
            <summary>
              <div class="badge-player-summary-main">
                ${H.profileBadgeHtml(this.visualProfile(row), "profile-badge leaderboard-badge")}
                <div>
                  <strong>#${index + 1} exploits — ${H.escapeHtml(row.pseudo || "Joueur")}</strong>
                  <small>${H.escapeHtml(row.office_team_name || "Sans team")} · ${badges.length} exploit${badges.length > 1 ? "s" : ""}${row.rank ? ` · classement général #${row.rank}` : ""}</small>
                  ${this.hallBadgesPreviewHtml(row.user_id, badges, row)}
                </div>
              </div>
              <div class="points">${row.total_points || 0}<small>pts</small></div>
            </summary>
            ${this.badgesPanelHtml(row.user_id, { title: "Tous les exploits publics du joueur", badgesOverride: badges })}
          </details>
        `).join("") : `<section class="card"><p class="muted">Aucun joueur actif à afficher pour le moment.</p></section>`}
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
    const rows = this.scoreDetailRowsForUser(userId, { finishedOnly: true });
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

    const officialIds = this.officialUserIdSetForHome();

    return source
      .filter((row) => row.user_id || row.id)
      .filter((row) => {
        const userId = String(row.user_id || row.id);
        if (officialIds.size && !officialIds.has(userId)) return false;
        return (row.player_scope || row.role || "uis") !== "family" && row.role !== "family";
      })
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
    const rows = this.scoreDetailRowsForUser(userId, { finishedOnly: true });

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




  officialUserIdSetForHome() {
    return new Set(this.officialProfiles(this.state.publicProfiles)
      .map((profile) => String(profile.id || profile.user_id))
      .filter(Boolean));
  },

  filterOfficialRowsForHome(rows = []) {
    const officialIds = this.officialUserIdSetForHome();
    if (!officialIds.size) return [];
    return (rows || []).filter((row) => officialIds.has(String(row.user_id || row.id)));
  },


  homeStoryEligibleUserIds() {
    // Le perchoir d’accueil reste dans le classement normal : pas de joueurs Famille
    // tant que l’espace Famille n’est pas explicitement séparé dans sa propre vue.
    return this.officialUserIdSetForHome();
  },

  isOppositeResultPrediction(prediction, match) {
    const pred = this.outcomeFromScores(Number(prediction.home_score_pred), Number(prediction.away_score_pred));
    const real = this.outcomeFromScores(Number(match.home_score), Number(match.away_score));
    return (pred === "home" && real === "away") || (pred === "away" && real === "home");
  },

  scoreMissDistance(prediction, match) {
    return Math.abs(Number(prediction.home_score_pred) - Number(match.home_score))
      + Math.abs(Number(prediction.away_score_pred) - Number(match.away_score));
  },

  hasLeaderboardScoreActivity(leaderboardRows = this.state.playerScoreRows, teamRows = this.overallTeamAverageRows()) {
    const playerHasPoints = (leaderboardRows || []).some((row) =>
      Number(row.total_points || 0) > 0
      || Number(row.live_points || 0) > 0
      || Number(row.exact_scores || 0) > 0
      || Number(row.good_results || 0) > 0
      || Number(row.good_goal_diffs || 0) > 0
    );
    const teamHasPoints = (teamRows || []).some((row) =>
      Number(row.total_points || 0) > 0
      || Number(row.average_points || 0) > 0
      || Number(row.live_points || 0) > 0
    );
    return playerHasPoints || teamHasPoints;
  },

  homeStoryHighlights(recordHighlights = [], leaderboardRows = [], teamRows = []) {
    const slides = [];
    const eligibleIds = this.homeStoryEligibleUserIds();
    const officialRows = this.filterOfficialRowsForHome(leaderboardRows);
    const profileName = (profile) => profile?.pseudo || "";
    const teamName = (profile) => profile?.office_team_name || "Sans team";
    const profileIsUsable = (profile) => Boolean(profile?.pseudo && profile.pseudo !== "Joueur");

    const leaderboardHasActivity = this.hasLeaderboardScoreActivity(officialRows, teamRows);
    const leaderPlayerRow = (officialRows || [])[0];
    if (leaderboardHasActivity && leaderPlayerRow && (Number(leaderPlayerRow.total_points || 0) > 0 || Number(leaderPlayerRow.live_points || 0) > 0)) {
      const leaderProfile = this.profileForUser(leaderPlayerRow.user_id || leaderPlayerRow.id, leaderPlayerRow);
      if (profileIsUsable(leaderProfile)) {
        slides.push({
          kind: "story",
          theme: "leader",
          label: this.tieCountForRank(officialRows, leaderPlayerRow.rank || 1) > 1 ? "1er ex æquo du classement" : "1er du classement",
          title: profileName(leaderProfile),
          subtitle: teamName(leaderProfile),
          value: `${Number(leaderPlayerRow.total_points || 0)} pts`,
          detail: leaderPlayerRow.live_points ? `+${Number(leaderPlayerRow.live_points || 0)} pt${Number(leaderPlayerRow.live_points || 0) > 1 ? "s" : ""} live` : "Classement général",
          date: null,
          dateLabel: "Classement actuel",
          icon: "trophy",
          profile: leaderProfile,
          teamColor: this.teamColorForProfile(leaderProfile)
        });
      }
    }

    const leaderTeamRow = (teamRows || [])[0];
    if (leaderboardHasActivity && leaderTeamRow && (Number(leaderTeamRow.total_points || 0) > 0 || Number(leaderTeamRow.average_points || 0) > 0 || Number(leaderTeamRow.live_points || 0) > 0)) {
      slides.push({
        kind: "story",
        theme: "team-leader",
        label: "1re équipe",
        title: leaderTeamRow.office_team_name || "Team en tête",
        subtitle: `${leaderTeamRow.active_players || 0} joueur${Number(leaderTeamRow.active_players || 0) > 1 ? "s" : ""}`,
        value: `${Math.round(Number(leaderTeamRow.average_points || 0) * 10) / 10} pts/match`,
        detail: `${Math.round(Number(leaderTeamRow.total_points || 0) * 10) / 10} pts au total`,
        date: null,
        dateLabel: "Classement actuel",
        icon: "trophy",
        profile: null,
        teamColor: leaderTeamRow.office_team_color || "#facc15"
      });
    }

    const finishedMatches = this.state.matches
      .filter((match) => match.status === "finished" && !match.is_test_match)
      .sort((a, b) => new Date(b.kickoff_at || 0) - new Date(a.kickoff_at || 0));

    const predictionRows = this.state.visiblePredictions
      .map((prediction) => ({ prediction, match: this.state.matches.find((match) => match.id === prediction.match_id) }))
      .filter(({ prediction, match }) => match?.status === "finished"
        && !match.is_test_match
        && eligibleIds.has(String(prediction.user_id))
        && prediction.points_total !== null
        && prediction.points_total !== undefined
      );

    // Hibou en feu : meilleur joueur officiel sur les 5 derniers matchs terminés.
    const lastFiveMatchIds = new Set(finishedMatches.slice(0, 5).map((match) => match.id));
    if (lastFiveMatchIds.size) {
      const totals = new Map();
      predictionRows
        .filter(({ match }) => lastFiveMatchIds.has(match.id))
        .forEach(({ prediction }) => {
          const current = totals.get(prediction.user_id) || { points: 0, exact: 0, count: 0 };
          current.points += Number(prediction.points_total || 0);
          current.exact += prediction.is_exact_score ? 1 : 0;
          current.count += 1;
          totals.set(prediction.user_id, current);
        });

      const best = [...totals.entries()]
        .map(([userId, stats]) => ({ userId, ...stats, profile: this.profileForUser(userId) }))
        .filter((item) => item.points > 0 && profileIsUsable(item.profile))
        .sort((a, b) => b.points - a.points || b.exact - a.exact || profileName(a.profile).localeCompare(profileName(b.profile), "fr"))[0];

      if (best) {
        slides.push({
          kind: "story",
          theme: "hot",
          label: "Hibou en feu",
          title: profileName(best.profile),
          subtitle: teamName(best.profile),
          value: `${Math.round(best.points * 10) / 10} pts sur les 5 derniers matchs`,
          detail: `${best.exact} score${best.exact > 1 ? "s" : ""} exact${best.exact > 1 ? "s" : ""} dans la série`,
          date: finishedMatches[0]?.kickoff_at,
          icon: "fire",
          profile: best.profile
        });
      }
    }

    // Casserole du jour : score vraiment inversé sur le dernier match terminé.
    const latestFinished = finishedMatches[0];
    if (latestFinished) {
      const casserole = predictionRows
        .filter(({ match, prediction }) =>
          match.id === latestFinished.id
          && Number(prediction.points_total || 0) === 0
          && this.isOppositeResultPrediction(prediction, latestFinished)
        )
        .map(({ prediction, match }) => ({
          prediction,
          match,
          missDistance: this.scoreMissDistance(prediction, match),
          profile: this.profileForUser(prediction.user_id)
        }))
        .filter((item) => profileIsUsable(item.profile))
        .sort((a, b) => b.missDistance - a.missDistance || profileName(a.profile).localeCompare(profileName(b.profile), "fr"))[0];

      if (casserole) {
        slides.push({
          kind: "story",
          theme: "casserole",
          label: "Casserole du jour",
          title: profileName(casserole.profile),
          subtitle: teamName(casserole.profile),
          value: `${casserole.prediction.home_score_pred}-${casserole.prediction.away_score_pred} au lieu de ${H.scoreText(latestFinished.home_score, latestFinished.away_score)}`,
          detail: "Résultat inversé",
          date: latestFinished.kickoff_at,
          icon: "badges",
          profile: casserole.profile
        });
      }
    }

    // Dans le mille : dernier score exact officiel.
    const latestExact = predictionRows
      .filter(({ prediction }) => prediction.is_exact_score)
      .map((row) => ({ ...row, profile: this.profileForUser(row.prediction.user_id) }))
      .filter((row) => profileIsUsable(row.profile))
      .sort((a, b) => new Date(b.match.kickoff_at || 0) - new Date(a.match.kickoff_at || 0))[0];

    if (latestExact) {
      slides.push({
        kind: "story",
        theme: "perfect",
        label: "Dans le mille",
        title: profileName(latestExact.profile),
        subtitle: teamName(latestExact.profile),
        value: `Score exact ${latestExact.prediction.home_score_pred}-${latestExact.prediction.away_score_pred}`,
        detail: `${latestExact.match.home_team_short_name || latestExact.match.home_team_name} - ${latestExact.match.away_team_short_name || latestExact.match.away_team_name}`,
        date: latestExact.match.kickoff_at,
        icon: "target",
        profile: latestExact.profile
      });
    }

    // Match qui a gavé le Nid : uniquement sur pronos officiels visibles.
    const matchTotals = new Map();
    predictionRows.forEach(({ prediction, match }) => {
      const current = matchTotals.get(match.id) || { match, points: 0, count: 0 };
      current.points += Number(prediction.points_total || 0);
      current.count += 1;
      matchTotals.set(match.id, current);
    });

    const richMatch = [...matchTotals.values()]
      .filter((item) => item.points > 0)
      .sort((a, b) => b.points - a.points || new Date(b.match.kickoff_at || 0) - new Date(a.match.kickoff_at || 0))[0];

    if (richMatch) {
      slides.push({
        kind: "story",
        theme: "gold",
        label: "Match qui a gavé le Nid",
        title: "Tout le Nid",
        subtitle: `${richMatch.count} prono${richMatch.count > 1 ? "s" : ""} compté${richMatch.count > 1 ? "s" : ""}`,
        value: `${Math.round(richMatch.points * 10) / 10} pts distribués`,
        detail: `${richMatch.match.home_team_short_name || richMatch.match.home_team_name} - ${richMatch.match.away_team_short_name || richMatch.match.away_team_name}`,
        date: richMatch.match.kickoff_at,
        icon: "trophy",
        profile: null
      });
    }

    recordHighlights.forEach((item) => slides.push({ kind: "record", ...item }));
    return slides;
  },

  homeStorySlideHtml(item, index) {
    if (item.kind === "record") {
      const { record, best, bestProfile, detail, date } = item;
      const recordTeamColor = this.teamColorForProfile(bestProfile);
      return `
        <article class="home-record-slide home-record-slide-record team-tinted-perchoir ${index === 0 ? "active" : ""}" style="--perchoir-team-color:${H.escapeHtml(recordTeamColor)};--story-team-color:${H.escapeHtml(recordTeamColor)}" data-home-record-slide data-record-popup-id="${H.escapeHtml(record.id)}" role="button" tabindex="0" title="Voir le détail du mini-record">
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
    }

    const storyTeamColor = item.teamColor || this.teamColorForProfile(item.profile || {});
    return `
      <article class="home-record-slide home-story-slide team-tinted-perchoir story-${H.escapeHtml(item.theme || "default")} ${index === 0 ? "active" : ""}" style="--perchoir-team-color:${H.escapeHtml(storyTeamColor)};--story-team-color:${H.escapeHtml(storyTeamColor)}" data-home-record-slide>
        <div class="home-record-art story-art">${item.profile ? H.profileBadgeHtml(item.profile, "profile-badge leaderboard-badge") : H.icon(item.icon || "badges")}</div>
        <div class="home-record-main">
          <small class="home-record-label">${H.escapeHtml(item.label)}</small>
          <strong>${H.escapeHtml(item.title)}</strong>
          <span>${H.escapeHtml(item.subtitle || "")}</span>
          <p>${H.escapeHtml(item.value)}${item.detail ? ` · ${H.escapeHtml(item.detail)}` : ""}</p>
        </div>
        <div class="home-record-date">
          ${H.icon(item.icon || "time")}
          ${item.dateLabel || item.date ? `<span>${H.escapeHtml(item.dateLabel || this.formatRecordDateLabel(item.date))}</span>` : ""}
        </div>
      </article>
    `;
  },

  homeRecordCarouselHtml(leaderboardRows = this.state.playerScoreRows, teamRows = this.overallTeamAverageRows()) {
    const hasScoreActivity = this.hasLeaderboardScoreActivity(leaderboardRows, teamRows);
    const rows = this.achievementRecordRows();
    const availableRecords = this.achievementRecordDefinitions()
      .filter((record) => hasScoreActivity || record.id === "record-predictions");

    const recordHighlights = availableRecords
      .map((record) => this.recordWinner(record, rows))
      .filter((item) => item.best && item.bestProfile);

    const highlights = this.homeStoryHighlights(recordHighlights, this.filterOfficialRowsForHome(leaderboardRows), teamRows);

    if (!highlights.length) {
      return `
        <section class="card home-record-carousel-card empty-record-carousel">
          <div class="card-title-row">
            <div>
              <p class="eyebrow">${H.icon("badges")} Actus du nid</p>
              <h3>Le tableau des petits exploits arrive</h3>
              <p class="muted">Dès que les premiers pronos ou points seront comptabilisés, les records, casseroles et hiboux en feu défileront ici.</p>
            </div>
          </div>
        </section>
      `;
    }

    return `
      <section class="card home-record-carousel-card">
        <div class="card-title-row compact-title-row">
          <div>
            <p class="eyebrow">${H.icon("badges")} Actus du nid</p>
            <h3>Les chouettes qui font parler le perchoir</h3>
            <p class="muted">Records, coups chauds et casseroles cohérentes défilent ici toutes les 5 secondes.</p>
          </div>
          <button class="ghost-btn" id="homeRecordsBtn" type="button">Voir les records</button>
        </div>
        <div class="home-record-carousel" data-home-record-carousel aria-live="polite">
          ${highlights.map((item, index) => this.homeStorySlideHtml(item, index)).join("")}
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
      const recordId = slide.dataset.recordPopupId;
      if (!recordId) return;
      const open = () => this.showRecordPopup(recordId);
      slide.addEventListener("click", open);
      slide.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });

    if (slides.length > 1) {
      this.state.homeRecordCarouselTimer = window.setInterval(() => show(index + 1), 5000);
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
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    H.$("#closeRecordDetailXBtn", modal)?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    H.$("#closeRecordDetailXBtn", modal)?.focus();
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
          <p class="muted">Choisis un tour : ce tour s’ouvre en détail, les autres restent compacts pour garder la lecture du tableau.</p>
        </div>
        <div class="final-bracket-toolbar-actions">
          <span class="pill neutral">${totalFinalMatches} match${totalFinalMatches > 1 ? "s" : ""}</span>
        </div>
      </section>
      ${totalFinalMatches ? this.finalBracketHtml(byStage) : `<section class="card"><p class="muted">Aucune phase finale à afficher pour le moment.</p></section>`}
    `;
    this.bindFinalBracketRoundTabs();
    this.bindFinalBracketDrag();
    this.bindFinalBracketControls();
    this.bindPredictionForms();
    this.scrollFinalBracketToActiveRound();
  },

  bindFinalBracketRoundTabs() {
    H.$$('[data-final-round]').forEach((button) => {
      if (button.dataset.finalRoundBound === "true") return;
      button.dataset.finalRoundBound = "true";
      button.addEventListener("click", () => {
        this.setFinalBracketRound(button.dataset.finalRound || null);
      });
    });

    const scroller = H.$("#finalBracketScroll");
    if (scroller && scroller.dataset.finalDelegationBound !== "true") {
      scroller.dataset.finalDelegationBound = "true";
      scroller.addEventListener("click", (event) => {
        if (event.target.closest("button, a, input, select, textarea")) return;

        const matchCard = event.target.closest("[data-final-match-toggle]");
        if (matchCard) {
          event.preventDefault();
          event.stopPropagation();
          const round = matchCard.closest("[data-final-stage-round]")?.dataset?.finalStageRound || matchCard.dataset.finalRoundTarget;
          const currentRound = this.state.finalBracketActiveRound || scroller.querySelector(".final-focus-board")?.dataset?.activeRound;
          if (round && round !== currentRound) {
            this.setFinalBracketRound(round);
            return;
          }
          const number = Number(matchCard.dataset.finalMatchToggle || 0);
          if (number) {
            this.state.finalBracketExpandedMatchNumber = Number(this.state.finalBracketExpandedMatchNumber || 0) === number ? null : number;
            this.renderWorldCupFinals();
          }
          return;
        }

        const target = event.target.closest("[data-final-round-target], [data-final-stage-round]");
        const round = target?.dataset?.finalRoundTarget || target?.dataset?.finalStageRound;
        if (round) {
          event.preventDefault();
          event.stopPropagation();
          this.setFinalBracketRound(round);
        }
      }, true);
    }

    H.$$('[data-final-match-toggle]').forEach((card) => {
      if (card.dataset.finalMatchToggleBound === "true") return;
      card.dataset.finalMatchToggleBound = "true";
      const activateCard = (event) => {
        if (event?.target?.closest?.("a, button, input, select, textarea")) return;
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const scroller = H.$("#finalBracketScroll");
        const round = card.closest("[data-final-stage-round]")?.dataset?.finalStageRound || card.dataset.finalRoundTarget;
        const currentRound = this.state.finalBracketActiveRound || scroller?.querySelector?.(".final-focus-board")?.dataset?.activeRound;
        if (round && round !== currentRound) {
          this.setFinalBracketRound(round);
          return;
        }
        const number = Number(card.dataset.finalMatchToggle || 0);
        if (!number) return;
        this.state.finalBracketExpandedMatchNumber = Number(this.state.finalBracketExpandedMatchNumber || 0) === number ? null : number;
        this.renderWorldCupFinals();
      };
      card.addEventListener("click", activateCard);
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        activateCard(event);
      });
    });

    H.$$('[data-final-stage-round]').forEach((stage) => {
      if (stage.dataset.finalStageRoundBound === "true") return;
      stage.dataset.finalStageRoundBound = "true";
      const activateStage = () => this.setFinalBracketRound(stage.dataset.finalStageRound || null);
      stage.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const matchCard = event.target.closest?.("[data-final-match-toggle]");
        if (matchCard) {
          event.preventDefault();
          const round = matchCard.closest("[data-final-stage-round]")?.dataset?.finalStageRound || matchCard.dataset.finalRoundTarget;
          const currentRound = this.state.finalBracketActiveRound || H.$("#finalBracketScroll .final-focus-board")?.dataset?.activeRound;
          if (round && round !== currentRound) {
            this.setFinalBracketRound(round);
            return;
          }
          const number = Number(matchCard.dataset.finalMatchToggle || 0);
          if (number) {
            this.state.finalBracketExpandedMatchNumber = Number(this.state.finalBracketExpandedMatchNumber || 0) === number ? null : number;
            this.renderWorldCupFinals();
          }
          return;
        }
        event.preventDefault();
        activateStage();
      });
    });
  },

  bindFinalBracketDrag() {
    const scroller = H.$("#finalBracketScroll");
    if (!scroller || scroller.classList.contains("final-bracket-road-shell") || scroller.dataset.dragBound === "true") return;
    scroller.dataset.dragBound = "true";

    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartLeft = 0;
    let touchDragging = false;
    let touchLastDx = 0;

    const stop = () => {
      isDown = false;
      scroller.classList.remove("is-dragging");
    };

    scroller.addEventListener("pointerdown", (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      if (event.target.closest("button, a, input, select, textarea")) return;
      if (event.target.closest("[data-final-match-toggle], [data-final-stage-round], [data-final-round-target]")) return;
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

    scroller.addEventListener("touchstart", (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartLeft = scroller.scrollLeft;
      touchDragging = false;
      touchLastDx = 0;
    }, { passive: true });

    scroller.addEventListener("touchmove", (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      touchLastDx = dx;
      if (!touchDragging && Math.abs(dx) > Math.abs(dy) + 6) touchDragging = true;
      if (!touchDragging) return;
      event.preventDefault();
      scroller.scrollLeft = touchStartLeft - dx;
    }, { passive: false });

    scroller.addEventListener("touchend", () => {
      if (touchDragging && Math.abs(touchLastDx) > 56) {
        this.stepFinalBracket(touchLastDx < 0 ? 1 : -1);
      }
      touchDragging = false;
      touchLastDx = 0;
    }, { passive: true });
    scroller.addEventListener("touchcancel", () => { touchDragging = false; touchLastDx = 0; }, { passive: true });
    scroller.addEventListener("pointerup", stop);
    scroller.addEventListener("pointercancel", stop);
    scroller.addEventListener("mouseleave", stop);
  },

  scrollFinalBracketToActiveRound() {
    const scroller = H.$("#finalBracketScroll");
    const board = scroller?.querySelector?.(".final-focus-board");
    if (!scroller || !board) return;
    const activeRound = this.state.finalBracketActiveRound || board.dataset.activeRound;
    if (!activeRound) return;

    window.setTimeout(() => {
      const safeRound = window.CSS?.escape ? CSS.escape(activeRound) : String(activeRound).replace(/[^a-z0-9_-]/gi, "");
      const activeStage = scroller.querySelector(`.final-focus-stage.stage-${safeRound}`);
      if (!activeStage) return;
      const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      const desiredLeft = activeStage.offsetLeft - Math.max(0, (scroller.clientWidth - activeStage.offsetWidth) / 2);
      scroller.scrollTo({ left: Math.min(maxLeft, Math.max(0, desiredLeft)), behavior: "smooth" });
    }, 70);
  },

  setFinalBracketRound(roundKey = null) {
    const configs = this.finalBracketRoundConfigs();
    const targetIndex = configs.findIndex((config) => config.key === roundKey);
    if (targetIndex < 0) return;
    const currentRound = this.state.finalBracketActiveRound || H.$("#finalBracketScroll .final-focus-board")?.dataset?.activeRound || configs[0]?.key;
    const currentIndex = Math.max(0, configs.findIndex((config) => config.key === currentRound));
    if (configs[targetIndex]?.key === currentRound) return;
    this.state.finalBracketActiveRound = configs[targetIndex].key;
    this.state.finalBracketExpandedMatchNumber = null;
    this.state.finalBracketSlideDirection = targetIndex < currentIndex ? "left" : "right";
    this.renderWorldCupFinals();
  },

  stepFinalBracket(direction = 0) {
    const configs = this.finalBracketRoundConfigs();
    const currentRound = this.state.finalBracketActiveRound || H.$("#finalBracketScroll .final-focus-board")?.dataset?.activeRound || configs[0]?.key;
    const currentIndex = Math.max(0, configs.findIndex((config) => config.key === currentRound));
    const nextIndex = Math.min(configs.length - 1, Math.max(0, currentIndex + Number(direction || 0)));
    const nextKey = configs[nextIndex]?.key || currentRound;
    if (nextKey === currentRound) return;
    this.state.finalBracketActiveRound = nextKey;
    this.state.finalBracketExpandedMatchNumber = null;
    this.state.finalBracketSlideDirection = direction < 0 ? "left" : "right";
    this.renderWorldCupFinals();
  },

  bindFinalBracketControls() {
    const scroller = H.$("#finalBracketScroll");
    if (!scroller) return;

    H.$$('[data-final-step]').forEach((button) => {
      if (button.dataset.finalStepBound === "true") return;
      button.dataset.finalStepBound = "true";
      button.addEventListener("click", () => {
        const direction = Number(button.dataset.finalStep || 0);
        this.stepFinalBracket(direction);
      });
    });

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
    return H.officialBracketSortValue?.(match) || 999999999999999;
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
      stages[key] = stages[key].sort((a, b) => this.finalBracketSortValue(a) - this.finalBracketSortValue(b)
        || new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0));
    });

    return stages;
  },

  splitBracketSide(matches = []) {
    const midpoint = Math.ceil(matches.length / 2);
    return [matches.slice(0, midpoint), matches.slice(midpoint)];
  },

  finalBracketStageChronologicalNumbers(stage) {
    const map = {
      round_of_32: [73, 76, 74, 75, 78, 77, 79, 80, 82, 81, 84, 83, 85, 88, 86, 87],
      round_of_16: [90, 89, 91, 92, 93, 94, 95, 96],
      quarter_final: [97, 98, 99, 100],
      semi_final: [101, 102],
      third_place: [103],
      final: [104]
    };
    return map[stage] || [];
  },

  finalBracketStableMatchNumber(match, usedNumbers = new Set()) {
    const direct = H.officialBracketMatchNumber?.(match);
    if (direct && !usedNumbers.has(direct)) return direct;
    return null;
  },

  finalBracketMatchMap(byStage = {}) {
    const map = new Map();
    const usedMatchKeys = new Set();
    const matchKey = (match) => String(match?.id || `${match?.stage || ""}|${match?.kickoff_at || ""}|${match?.home_team_id || ""}|${match?.away_team_id || ""}`);

    // 1) Priorité aux numéros explicites ou visibles dans les placeholders (M76, Match 76...).
    Object.values(byStage).flat().forEach((match) => {
      const number = this.finalBracketStableMatchNumber(match, map);
      if (number && !map.has(number)) {
        map.set(number, match);
        usedMatchKeys.add(matchKey(match));
      }
    });

    // 2) Filet de sécurité : quand l'admin remplace les deux placeholders par deux vraies équipes,
    // le texte ne contient plus “M76 / Match 76”. On réattribue alors les trous par ordre chronologique
    // officiel du tour. Cela évite que M76, M78, etc. repassent en “À définir”.
    Object.entries(byStage).forEach(([stage, matches]) => {
      const officialNumbers = this.finalBracketStageChronologicalNumbers(stage);
      if (!officialNumbers.length) return;
      const freeNumbers = officialNumbers.filter((number) => !map.has(number));
      if (!freeNumbers.length) return;

      const unmatched = (matches || [])
        .filter((match) => !usedMatchKeys.has(matchKey(match)))
        .sort((a, b) => new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0)
          || String(a.id || "").localeCompare(String(b.id || "")));

      unmatched.forEach((match, index) => {
        const number = freeNumbers[index];
        if (number && !map.has(number)) {
          map.set(number, match);
          usedMatchKeys.add(matchKey(match));
        }
      });
    });

    return map;
  },

  finalBracketMatchByNumber(matchMap, number) {
    return matchMap.get(Number(number)) || null;
  },

  finalBracketMatchOrPlaceholder(matchMap, number, title, extraClass = "") {
    const match = this.finalBracketMatchByNumber(matchMap, number);
    return match
      ? this.finalBracketMatchHtml(match, `${extraClass} official-match-${number}`.trim(), `${title} · M${number}`)
      : this.finalBracketPlaceholderHtml(`${title} · M${number}`, extraClass);
  },

  finalBracketRoadLaneHtml(matchMap, lane, index = 0) {
    return `
      <div class="final-bracket-road-lane" data-r16="${H.escapeHtml(lane.r16)}">
        <div class="road-node road-r32 top">${this.finalBracketMatchOrPlaceholder(matchMap, lane.r32[0], "16e")}</div>
        <div class="road-flow-line" aria-hidden="true"><span></span></div>
        <div class="road-node road-r16">${this.finalBracketMatchOrPlaceholder(matchMap, lane.r16, "8e")}</div>
        <div class="road-flow-line" aria-hidden="true"><span></span></div>
        <div class="road-node road-r32 bottom">${this.finalBracketMatchOrPlaceholder(matchMap, lane.r32[1], "16e")}</div>
      </div>
    `;
  },

  finalBracketRoadQuarterHtml(matchMap, block) {
    const lanes = block.lanes || [];
    return `
      <article class="final-bracket-road-block">
        <header class="final-bracket-road-block-head">
          <strong>${H.escapeHtml(block.title)}</strong>
          <small>${H.escapeHtml(block.subtitle)}</small>
        </header>
        <div class="final-bracket-road-lanes">
          ${lanes.map((lane, index) => this.finalBracketRoadLaneHtml(matchMap, lane, index)).join("")}
        </div>
        <div class="road-quarter-join" aria-hidden="true"><span></span></div>
        <div class="final-bracket-road-quarter">
          ${this.finalBracketMatchOrPlaceholder(matchMap, block.qf, "Quart")}
        </div>
      </article>
    `;
  },

  finalBracketRoadBlocks() {
    const layout = H.finalBracketLayout?.() || { left: [], right: [] };
    return [
      { title: "Quart haut gauche", subtitle: "M73/M75 et M74/M77", lanes: layout.left.slice(0, 2), qf: 97, sf: 101 },
      { title: "Quart bas gauche", subtitle: "M83/M84 et M81/M82", lanes: layout.left.slice(2, 4), qf: 98, sf: 101 },
      { title: "Quart haut droit", subtitle: "M76/M78 et M79/M80", lanes: layout.right.slice(0, 2), qf: 99, sf: 102 },
      { title: "Quart bas droit", subtitle: "M86/M88 et M85/M87", lanes: layout.right.slice(2, 4), qf: 100, sf: 102 }
    ];
  },

  finalBracketLaneHtml(matchMap, lane) {
    return `
      <div class="final-bracket-lane" data-r16="${lane.r16}">
        <div class="final-bracket-lane-slot top">${this.finalBracketMatchOrPlaceholder(matchMap, lane.r32[0], "16e")}</div>
        <div class="final-bracket-lane-connector" aria-hidden="true"></div>
        <div class="final-bracket-lane-slot middle">${this.finalBracketMatchOrPlaceholder(matchMap, lane.r16, "8e")}</div>
        <div class="final-bracket-lane-connector" aria-hidden="true"></div>
        <div class="final-bracket-lane-slot bottom">${this.finalBracketMatchOrPlaceholder(matchMap, lane.r32[1], "16e")}</div>
      </div>
    `;
  },

  finalBracketSideTreeHtml(side, lanes, matchMap) {
    const quarterNumbers = [...new Set(lanes.map((lane) => lane.qf))];
    const semiNumber = lanes[0]?.sf;
    const lanesHtml = `
      <div class="final-bracket-tree-column lane-tree-column">
        <div class="final-bracket-stage-title">16èmes → 8èmes</div>
        <div class="final-bracket-lane-stack">
          ${lanes.map((lane) => this.finalBracketLaneHtml(matchMap, lane)).join("")}
        </div>
      </div>
    `;
    const quartersHtml = `
      <div class="final-bracket-tree-column quarter-tree-column">
        <div class="final-bracket-stage-title">Quarts</div>
        <div class="final-bracket-quarter-stack">
          ${quarterNumbers.map((number) => this.finalBracketMatchOrPlaceholder(matchMap, number, "Quart")).join("")}
        </div>
      </div>
    `;
    const semiHtml = `
      <div class="final-bracket-tree-column semi-tree-column">
        <div class="final-bracket-stage-title">Demi-finale</div>
        <div class="final-bracket-semi-stack">
          ${semiNumber ? this.finalBracketMatchOrPlaceholder(matchMap, semiNumber, "Demi") : this.finalBracketPlaceholderHtml("Demi-finale")}
        </div>
      </div>
    `;

    return `
      <div class="final-bracket-side final-bracket-tree-side final-bracket-tree-side-${side}">
        ${side === "left" ? `${lanesHtml}${quartersHtml}${semiHtml}` : `${semiHtml}${quartersHtml}${lanesHtml}`}
      </div>
    `;
  },

  legacyFinalBracketHtml(byStage) {
    const [r32Left, r32Right] = this.splitBracketSide(byStage.round_of_32);
    const [r16Left, r16Right] = this.splitBracketSide(byStage.round_of_16);
    const [qfLeft, qfRight] = this.splitBracketSide(byStage.quarter_final);
    const [sfLeft, sfRight] = this.splitBracketSide(byStage.semi_final);
    const finalMatch = byStage.final[0];
    const thirdPlaceMatch = byStage.third_place[0];

    return `
      <section class="final-bracket-shell draggable-bracket" id="finalBracketScroll" aria-label="Tableau de la phase finale" tabindex="0">
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

  finalBracketColumnHtmlFromNumbers(title, numbers = [], matchMap, sizeClass = "", cardClass = "") {
    return `
      <div class="final-bracket-column ${sizeClass}">
        <div class="final-bracket-stage-title">${H.escapeHtml(title)}</div>
        <div class="final-bracket-match-stack">
          ${numbers.map((number) => this.finalBracketMatchOrPlaceholder(matchMap, number, title, cardClass)).join("")}
        </div>
      </div>
    `;
  },

  officialFinalBracketDesktopHtml(matchMap) {
    const leftR32 = [73, 75, 74, 77, 83, 84, 81, 82];
    const rightR32 = [76, 78, 79, 80, 86, 88, 85, 87];
    const leftR16 = [90, 89, 93, 94];
    const rightR16 = [91, 92, 95, 96];
    const leftQf = [97, 98];
    const rightQf = [99, 100];
    const semiLeft = [101];
    const semiRight = [102];
    const finalMatch = this.finalBracketMatchByNumber(matchMap, 104);
    const thirdPlaceMatch = this.finalBracketMatchByNumber(matchMap, 103);

    return `
      <section class="final-bracket-official final-bracket-official-desktop" aria-label="Tableau officiel de la phase finale">
        <div class="final-bracket-official-head">
          <strong>Tableau phase finale</strong>
          <span>Lecture classique : 16èmes → 8èmes → quarts → demies → finale.</span>
        </div>
        <div class="final-bracket-official-body">
          <div class="final-bracket-official-side left">
            ${this.finalBracketColumnHtmlFromNumbers("16ᵉ", leftR32, matchMap, "round32", "desktop-compact")}
            ${this.finalBracketColumnHtmlFromNumbers("8ᵉ", leftR16, matchMap, "round16", "desktop-compact")}
            ${this.finalBracketColumnHtmlFromNumbers("Quarts", leftQf, matchMap, "quarter", "desktop-compact")}
            ${this.finalBracketColumnHtmlFromNumbers("Demi-finale", semiLeft, matchMap, "semi", "desktop-compact")}
          </div>
          <div class="final-bracket-official-center">
            <div class="final-bracket-cup-card official-center-cup">
              <span class="final-bracket-cup-emoji" aria-hidden="true">🏆</span>
              <strong>FINALE</strong>
              <small>19 juillet 2026</small>
            </div>
            ${finalMatch ? this.finalBracketMatchHtml(finalMatch, "final-main desktop-compact", "Grande finale · M104") : this.finalBracketPlaceholderHtml("Grande finale · M104", "desktop-compact")}
            ${thirdPlaceMatch ? this.finalBracketMatchHtml(thirdPlaceMatch, "third-place desktop-compact", "3ᵉ place · M103") : this.finalBracketPlaceholderHtml("3ᵉ place · M103", "desktop-compact")}
          </div>
          <div class="final-bracket-official-side right">
            ${this.finalBracketColumnHtmlFromNumbers("Demi-finale", semiRight, matchMap, "semi", "desktop-compact")}
            ${this.finalBracketColumnHtmlFromNumbers("Quarts", rightQf, matchMap, "quarter", "desktop-compact")}
            ${this.finalBracketColumnHtmlFromNumbers("8ᵉ", rightR16, matchMap, "round16", "desktop-compact")}
            ${this.finalBracketColumnHtmlFromNumbers("16ᵉ", rightR32, matchMap, "round32", "desktop-compact")}
          </div>
        </div>
      </section>
    `;
  },

  officialFinalBracketMobileHtml(matchMap) {
    const leftR32 = [73, 75, 74, 77, 83, 84, 81, 82];
    const rightR32 = [76, 78, 79, 80, 86, 88, 85, 87];
    const leftR16 = [90, 89, 93, 94];
    const rightR16 = [91, 92, 95, 96];
    const leftQf = [97, 98];
    const rightQf = [99, 100];
    const finalMatch = this.finalBracketMatchByNumber(matchMap, 104);
    const thirdPlaceMatch = this.finalBracketMatchByNumber(matchMap, 103);
    const semiLeft = this.finalBracketMatchByNumber(matchMap, 101);
    const semiRight = this.finalBracketMatchByNumber(matchMap, 102);

    return `
      <section class="final-bracket-official final-bracket-official-mobile" aria-label="Tableau mobile de la phase finale">
        <div class="final-bracket-official-head mobile-head">
          <strong>Tableau compact mobile</strong>
          <span>Deux chemins lisibles, puis le dernier carré.</span>
        </div>

        <div class="final-bracket-mobile-half">
          <div class="final-bracket-mobile-half-head">Partie gauche</div>
          <div class="final-bracket-mobile-grid">
            ${this.finalBracketColumnHtmlFromNumbers("16ᵉ", leftR32, matchMap, "round32", "mobile-compact")}
            ${this.finalBracketColumnHtmlFromNumbers("8ᵉ", leftR16, matchMap, "round16", "mobile-compact")}
            ${this.finalBracketColumnHtmlFromNumbers("Quarts", leftQf, matchMap, "quarter", "mobile-compact")}
            <div class="final-bracket-column semi">
              <div class="final-bracket-stage-title">Demi</div>
              <div class="final-bracket-match-stack">
                ${semiLeft ? this.finalBracketMatchHtml(semiLeft, "mobile-compact", "Demi · M101") : this.finalBracketPlaceholderHtml("Demi · M101", "mobile-compact")}
              </div>
            </div>
          </div>
        </div>

        <div class="final-bracket-mobile-finals">
          ${finalMatch ? this.finalBracketMatchHtml(finalMatch, "final-main mobile-compact", "Finale · M104") : this.finalBracketPlaceholderHtml("Finale · M104", "mobile-compact")}
          ${thirdPlaceMatch ? this.finalBracketMatchHtml(thirdPlaceMatch, "third-place mobile-compact", "3ᵉ place · M103") : this.finalBracketPlaceholderHtml("3ᵉ place · M103", "mobile-compact")}
        </div>

        <div class="final-bracket-mobile-half right-half">
          <div class="final-bracket-mobile-half-head">Partie droite</div>
          <div class="final-bracket-mobile-grid">
            <div class="final-bracket-column semi">
              <div class="final-bracket-stage-title">Demi</div>
              <div class="final-bracket-match-stack">
                ${semiRight ? this.finalBracketMatchHtml(semiRight, "mobile-compact", "Demi · M102") : this.finalBracketPlaceholderHtml("Demi · M102", "mobile-compact")}
              </div>
            </div>
            ${this.finalBracketColumnHtmlFromNumbers("Quarts", rightQf, matchMap, "quarter", "mobile-compact")}
            ${this.finalBracketColumnHtmlFromNumbers("8ᵉ", rightR16, matchMap, "round16", "mobile-compact")}
            ${this.finalBracketColumnHtmlFromNumbers("16ᵉ", rightR32, matchMap, "round32", "mobile-compact")}
          </div>
        </div>
      </section>
    `;
  },

  finalBracketVerticalLaneHtml(matchMap, lane) {
    return `
      <div class="final-bracket-vertical-lane" data-r16="${H.escapeHtml(lane.r16)}">
        <div class="final-bracket-vertical-r32">
          ${this.finalBracketMatchOrPlaceholder(matchMap, lane.r32[0], "16e", "vertical-compact")}
          ${this.finalBracketMatchOrPlaceholder(matchMap, lane.r32[1], "16e", "vertical-compact")}
        </div>
        <div class="final-bracket-vertical-link" aria-hidden="true"></div>
        <div class="final-bracket-vertical-r16">
          ${this.finalBracketMatchOrPlaceholder(matchMap, lane.r16, "8e", "vertical-compact")}
        </div>
      </div>
    `;
  },

  finalBracketVerticalQuarterHtml(matchMap, block) {
    const lanes = block.lanes || [];
    return `
      <article class="final-bracket-vertical-quarter">
        <header class="final-bracket-vertical-quarter-head">
          <strong>${H.escapeHtml(block.title)}</strong>
          <small>${H.escapeHtml(block.subtitle)}</small>
        </header>
        <div class="final-bracket-vertical-quarter-body">
          <div class="final-bracket-vertical-lanes">
            ${lanes.map((lane) => this.finalBracketVerticalLaneHtml(matchMap, lane)).join("")}
          </div>
          <div class="final-bracket-vertical-qf">
            ${this.finalBracketMatchOrPlaceholder(matchMap, block.qf, "Quart", "vertical-compact vertical-qf-card")}
          </div>
        </div>
      </article>
    `;
  },

  finalBracketVerticalSemiHtml(matchMap, title, blocks, semiNumber) {
    return `
      <section class="final-bracket-vertical-semi-block">
        <header class="final-bracket-vertical-semi-head">
          <strong>${H.escapeHtml(title)}</strong>
          <span>${H.escapeHtml(blocks.map((block) => `M${block.qf}`).join(" + "))} → M${H.escapeHtml(semiNumber)}</span>
        </header>
        <div class="final-bracket-vertical-semi-body">
          <div class="final-bracket-vertical-quarters">
            ${blocks.map((block) => this.finalBracketVerticalQuarterHtml(matchMap, block)).join("")}
          </div>
          <div class="final-bracket-vertical-sf">
            ${this.finalBracketMatchOrPlaceholder(matchMap, semiNumber, "Demi", "vertical-compact vertical-sf-card")}
          </div>
        </div>
      </section>
    `;
  },

  finalBracketVerticalBlocks() {
    const layout = H.finalBracketLayout?.() || { left: [], right: [] };
    return [
      { title: "Chemin 1", subtitle: "M73/M75 → M90 · M74/M77 → M89", lanes: layout.left.slice(0, 2), qf: 97, sf: 101 },
      { title: "Chemin 2", subtitle: "M83/M84 → M93 · M81/M82 → M94", lanes: layout.left.slice(2, 4), qf: 98, sf: 101 },
      { title: "Chemin 3", subtitle: "M76/M78 → M91 · M79/M80 → M92", lanes: layout.right.slice(0, 2), qf: 99, sf: 102 },
      { title: "Chemin 4", subtitle: "M86/M88 → M95 · M85/M87 → M96", lanes: layout.right.slice(2, 4), qf: 100, sf: 102 }
    ];
  },

  finalBracketVerticalHtml(matchMap) {
    const blocks = this.finalBracketVerticalBlocks();
    return `
      <section class="final-bracket-vertical-shell" id="finalBracketScroll" aria-label="Tableau vertical de la phase finale" tabindex="0">
        <header class="final-bracket-vertical-head">
          <div>
            <strong>Tableau phase finale</strong>
            <span>Lecture en hauteur : les 16èmes nourrissent les 8èmes, puis les quarts, les demies et la finale.</span>
          </div>
          <div class="final-bracket-vertical-pill">32 matchs</div>
        </header>
        <div class="final-bracket-vertical-labels" aria-hidden="true">
          <span>16èmes</span>
          <span>8èmes</span>
          <span>Quarts</span>
          <span>Demies</span>
          <span>Finale</span>
        </div>
        <div class="final-bracket-vertical-main">
          <div class="final-bracket-vertical-paths">
            ${this.finalBracketVerticalSemiHtml(matchMap, "Demi-finale haute", blocks.slice(0, 2), 101)}
            ${this.finalBracketVerticalSemiHtml(matchMap, "Demi-finale basse", blocks.slice(2, 4), 102)}
          </div>
          <aside class="final-bracket-vertical-finals" aria-label="Finales">
            <div class="final-bracket-cup-card final-bracket-vertical-cup">
              <span class="final-bracket-cup-emoji" aria-hidden="true">🏆</span>
              <strong>FINALE</strong>
              <small>19 juillet 2026</small>
            </div>
            ${this.finalBracketMatchOrPlaceholder(matchMap, 104, "Grande finale", "vertical-compact vertical-final-card")}
            ${this.finalBracketMatchOrPlaceholder(matchMap, 103, "3e place", "vertical-compact vertical-third-card")}
          </aside>
        </div>
      </section>
    `;
  },

  finalBracketRoundConfigs() {
    return [
      {
        key: "round_of_32",
        label: "16èmes",
        shortLabel: "16e",
        title: "Seizièmes de finale",
        numbers: [73, 75, 74, 77, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
        rowStart: (index) => index + 1,
        rowSpan: 1
      },
      {
        key: "round_of_16",
        label: "8èmes",
        shortLabel: "8e",
        title: "Huitièmes de finale",
        numbers: [90, 89, 93, 94, 91, 92, 95, 96],
        rowStart: (index) => index * 2 + 1,
        rowSpan: 2
      },
      {
        key: "quarter_final",
        label: "Quarts",
        shortLabel: "Quart",
        title: "Quarts de finale",
        numbers: [97, 98, 99, 100],
        rowStart: (index) => index * 4 + 1,
        rowSpan: 4
      },
      {
        key: "semi_final",
        label: "Demies",
        shortLabel: "Demi",
        title: "Demi-finales",
        numbers: [101, 102],
        rowStart: (index) => index * 8 + 1,
        rowSpan: 8
      },
      {
        key: "final",
        label: "Finale",
        shortLabel: "Finale",
        title: "Finale et 3e place",
        numbers: [104, 103],
        rowStart: (index) => index === 0 ? 5 : 12,
        rowSpan: 4
      }
    ];
  },

  isFinalRoundComplete(matchMap, config) {
    const requiredNumbers = (config?.numbers || []).filter((number) => !(config.key === "final" && Number(number) === 103));
    return Boolean(requiredNumbers.length)
      && requiredNumbers.every((number) => {
        const match = this.finalBracketMatchByNumber(matchMap, number);
        return match && match.status === "finished";
      });
  },

  defaultFinalBracketRound(matchMap) {
    const configs = this.finalBracketRoundConfigs();
    for (const config of configs) {
      if (!this.isFinalRoundComplete(matchMap, config)) return config.key;
    }
    return "final";
  },

  activeFinalBracketRound(matchMap) {
    const configs = this.finalBracketRoundConfigs();
    const validKeys = new Set(configs.map((config) => config.key));
    if (validKeys.has(this.state.finalBracketActiveRound)) return this.state.finalBracketActiveRound;
    return this.defaultFinalBracketRound(matchMap);
  },

  finalBracketRoundTabsHtml(matchMap, activeRound) {
    return `
      <div class="final-focus-tabs" role="tablist" aria-label="Tours de la phase finale">
        ${this.finalBracketRoundConfigs().map((config) => {
          const complete = this.isFinalRoundComplete(matchMap, config);
          return `<button type="button" class="${activeRound === config.key ? "active" : ""} ${complete ? "is-complete" : ""}" data-final-round="${H.escapeHtml(config.key)}" role="tab" aria-selected="${activeRound === config.key ? "true" : "false"}">
            <span>${H.escapeHtml(config.label)}</span>
            ${complete ? `<small>terminé</small>` : `<small>${H.escapeHtml(config.shortLabel)}</small>`}
          </button>`;
        }).join("")}
      </div>
    `;
  },

  finalFocusWindowWidth(activeKey) {
    const widths = {
      round_of_32: 980,
      round_of_16: 970,
      quarter_final: 950,
      semi_final: 930,
      final: 920
    };
    return widths[activeKey] || 960;
  },

  finalFocusBracketHtml(matchMap, activeRound) {
    const configs = this.finalBracketRoundConfigs();
    const activeConfig = configs.find((config) => config.key === activeRound) || configs[0];
    const activeIndex = Math.max(0, configs.findIndex((config) => config.key === activeConfig.key));
    const startIndex = Math.min(Math.max(0, activeIndex - 1), Math.max(0, configs.length - 3));
    const visibleConfigs = configs.slice(startIndex, startIndex + 3);
    const slideClass = this.state.finalBracketSlideDirection === "left" ? "slide-left" : this.state.finalBracketSlideDirection === "right" ? "slide-right" : "";
    const rowCount = this.finalFocusVisibleRowCount(startIndex);
    return `
      <section class="final-focus-shell final-tournament-shell ${slideClass}" aria-label="Tableau de la phase finale par tour">
        <header class="final-focus-head final-tournament-head">
          <div>
            <strong>${H.escapeHtml(activeConfig.title)}</strong>
            <span>Vue façon tableau final : trois colonnes maximum, la colonne active en détail, les autres en repère compact.</span>
          </div>
          <span class="pill neutral">Vue active : ${H.escapeHtml(activeConfig.label)}</span>
        </header>
        <div class="final-tournament-window" id="finalBracketScroll" tabindex="0">
          <div class="final-focus-board final-tournament-board" data-active-round="${H.escapeHtml(activeConfig.key)}" data-window-start="${startIndex}" style="--final-visible-rows:${rowCount};">
            ${visibleConfigs.map((config, localIndex) => this.finalFocusStageColumnHtml(matchMap, config, activeConfig.key, startIndex + localIndex, startIndex)).join("")}
          </div>
        </div>
      </section>
    `;
  },

  finalFocusStageColumnHtml(matchMap, config, activeRound, stageIndex = 0, windowStart = 0) {
    const isActive = config.key === activeRound;
    const complete = this.isFinalRoundComplete(matchMap, config);
    const expandedNumber = Number(this.state.finalBracketExpandedMatchNumber || 0);
    let expandedShift = 0;
    const rowsHtml = config.numbers.map((number, index) => {
      const placement = this.finalFocusVisiblePlacement(config.key, index, windowStart, number);
      const isExpanded = isActive && Number(number) === expandedNumber;
      const rowStart = Number(placement.rowStart || 1) + expandedShift;
      const rowSpan = isExpanded ? Math.max(Number(placement.rowSpan || 1), 2) : Number(placement.rowSpan || 1);
      if (isExpanded) expandedShift += 1;
      return `<div class="final-focus-slot slot-m${number} ${isExpanded ? "is-expanded-slot" : ""}" data-match-number="${number}" data-final-round-target="${H.escapeHtml(config.key)}" style="grid-row:${rowStart} / span ${rowSpan};">
        ${this.finalFocusMatchCardHtml(matchMap, number, config, { activeColumn: isActive, expanded: isExpanded })}
      </div>`;
    }).join("");

    return `
      <section class="final-focus-stage ${isActive ? "is-active" : "is-compact"} stage-${H.escapeHtml(config.key)}"
        data-stage-index="${stageIndex}"
        data-final-stage-round="${H.escapeHtml(config.key)}"
        data-final-round-target="${H.escapeHtml(config.key)}"
        tabindex="0"
        role="button"
        aria-label="${H.escapeHtml(config.title)}">
        <button type="button" class="final-focus-stage-title ${isActive ? "active" : ""}" data-final-round="${H.escapeHtml(config.key)}" aria-selected="${isActive ? "true" : "false"}">
          <span>${H.escapeHtml(config.label)}</span>
          <small>${complete ? "terminé" : H.escapeHtml(config.shortLabel)}</small>
        </button>
        <div class="final-focus-stage-grid" data-final-round-target="${H.escapeHtml(config.key)}">
          ${rowsHtml}
        </div>
      </section>
    `;
  },

  finalFocusVisibleRowCount(windowStart = 0) {
    if (windowStart <= 0) return 16;
    if (windowStart === 1) return 8;
    return 4;
  },

  finalFocusVisiblePlacement(stageKey, index, windowStart = 0, number = null) {
    if (windowStart <= 0) {
      const config = this.finalBracketRoundConfigs().find((item) => item.key === stageKey);
      return { rowStart: config?.rowStart?.(index) || 1, rowSpan: config?.rowSpan || 1 };
    }
    if (windowStart === 1) {
      if (stageKey === "round_of_16") return { rowStart: index + 1, rowSpan: 1 };
      if (stageKey === "quarter_final") return { rowStart: index * 2 + 1, rowSpan: 2 };
      if (stageKey === "semi_final") return { rowStart: index * 4 + 1, rowSpan: 4 };
    }
    if (stageKey === "quarter_final") return { rowStart: index + 1, rowSpan: 1 };
    if (stageKey === "semi_final") return { rowStart: index * 2 + 1, rowSpan: 2 };
    if (stageKey === "final") {
      // Finale vraiment centrée entre les deux demies, petite finale nettement plus bas.
      return Number(number) === 103
        ? { rowStart: 4, rowSpan: 1 }
        : { rowStart: 2, rowSpan: 2 };
    }
    return { rowStart: index + 1, rowSpan: 1 };
  },

  finalFocusMatchCardHtml(matchMap, number, config, view = {}) {
    const activeColumn = typeof view === "boolean" ? Boolean(view) : Boolean(view?.activeColumn);
    const expanded = typeof view === "boolean" ? false : Boolean(view?.expanded);
    const match = this.finalBracketMatchByNumber(matchMap, number);
    const title = Number(number) === 103 ? "Petite finale" : Number(number) === 104 ? "Finale" : `${config.shortLabel}`;
    if (!match) return this.finalFocusPlaceholderHtml(title, { activeColumn, expanded, number });

    const isScored = match.status === "finished" || match.status === "live";
    const score = isScored ? H.scoreText(match.home_score, match.away_score) : "vs";
    const home = this.finalFocusDisplayTeamName(match.home_team_name, number);
    const away = this.finalFocusDisplayTeamName(match.away_team_name, number);
    const date = H.formatDateTime(match.kickoff_at);
    const compactDate = this.finalFocusCompactDateTime(match.kickoff_at);
    const location = [match.city, match.venue].filter(Boolean).join(" · ");
    const tvHtml = H.tvChannelLogosHtml(this.matchTvChannel(match), "tv-logo-strip final-tv-strip");
    const pronoMeta = this.finalFocusPredictionMetaHtml(match, expanded, tvHtml);
    const cardClass = expanded ? "expanded detailed" : `compact ${activeColumn ? "active-compact" : "side-compact"}`;
    const cupHtml = Number(number) === 104
      ? `<div class="final-focus-cup-above" aria-hidden="true"><img src="assets/icons/coupe.png" alt=""></div>`
      : "";

    return `
      <article class="final-focus-match ${cardClass} ${match.status || "scheduled"}"
        data-final-match-toggle="${Number(number)}"
        data-final-round-target="${H.escapeHtml(config.key)}"
        role="button"
        tabindex="0"
        aria-expanded="${expanded ? "true" : "false"}">
        ${cupHtml}
        <header class="final-focus-card-head">
          <strong>${H.escapeHtml(title)}</strong>
          <small>${H.escapeHtml(expanded ? date : compactDate)}</small>
        </header>
        <div class="${expanded ? "final-focus-detailed-teams" : "final-focus-compact-teams"}">
          <span>${H.matchFlagHtml(match, "home")}<strong>${H.escapeHtml(home)}</strong></span>
          <b>${H.escapeHtml(score)}</b>
          <span>${H.matchFlagHtml(match, "away")}<strong>${H.escapeHtml(away)}</strong></span>
        </div>
        ${pronoMeta}
        ${expanded ? this.finalFocusExpandedInfoHtml(match, tvHtml) : ""}
        ${expanded ? this.finalFocusPredictionEditorHtml(match) : ""}
      </article>
    `;
  },

  finalFocusExpandedInfoHtml(match, tvHtml = "") {
    const country = match.country || match.country_name || match.host_country || match.location_country || "";
    const locationParts = [country, match.city, match.venue].filter(Boolean);
    const location = locationParts.join(" · ") || [match.city, match.venue].filter(Boolean).join(" · ") || "Lieu à confirmer";
    return `
      <footer class="final-focus-card-foot is-expanded final-focus-expanded-info">
        <span class="final-focus-location"><small>Lieu</small><strong>${H.escapeHtml(location)}</strong></span>
        <span class="final-focus-tv"><small>Diffusion</small><strong>${tvHtml || "À confirmer"}</strong></span>
      </footer>
    `;
  },

  finalFocusPredictionEditorHtml(match) {
    if (!match?.id) return "";
    const locked = H.isKickoffPassed(match.kickoff_at);
    const myPrediction = this.getMyPrediction(match.id);
    if (locked) {
      return `<div class="final-focus-prediction-editor is-locked">${H.icon("lock")} Pronostic verrouillé depuis le coup d’envoi.</div>`;
    }
    return `
      <form class="prediction-form final-focus-prediction-editor" data-match-id="${H.escapeHtml(match.id)}" data-final-phase="true">
        <div class="final-focus-prediction-editor-head">
          <strong>Poser mon prono</strong>
          <small>Auto-save dès que le score et le qualifié sont remplis.</small>
        </div>
        <div class="prediction-inputs final-focus-prediction-inputs">
          <label>
            <small>${H.escapeHtml(match.home_team_short_name || match.home_team_name || "Équipe A")}</small>
            <input type="number" min="0" step="1" name="home_score_pred" value="${myPrediction?.home_score_pred ?? ""}" required>
          </label>
          <span class="dash">-</span>
          <label>
            <small>${H.escapeHtml(match.away_team_short_name || match.away_team_name || "Équipe B")}</small>
            <input type="number" min="0" step="1" name="away_score_pred" value="${myPrediction?.away_score_pred ?? ""}" required>
          </label>
        </div>
        <label class="qualified-select final-focus-qualified-select">
          <small>Qualifié</small>
          <select name="qualified_team_pred" required>
            <option value="">Choisir</option>
            <option value="${H.escapeHtml(match.home_team_id || "")}" ${myPrediction?.qualified_team_pred === match.home_team_id ? "selected" : ""}>${H.escapeHtml(match.home_team_name || "Équipe A")}</option>
            <option value="${H.escapeHtml(match.away_team_id || "")}" ${myPrediction?.qualified_team_pred === match.away_team_id ? "selected" : ""}>${H.escapeHtml(match.away_team_name || "Équipe B")}</option>
          </select>
        </label>
        <div class="prediction-actions final-focus-prediction-actions">
          ${myPrediction ? this.myPredictionInlineHtml(myPrediction) : `<span class="muted">Aucun prono posé</span>`}
          <button class="ghost-btn small" type="submit">Enregistrer</button>
        </div>
        <div class="prediction-autosave-status" aria-live="polite"></div>
        <div class="my-prono-result-slot">${this.myPredictionResultHtml(match, myPrediction)}</div>
      </form>
    `;
  },

  finalFocusAdminScoreShortcutHtml(match) {
    return "";
  },

  finalFocusPredictionMetaHtml(match, detailed = false, tvHtml = "") {
    if (!match?.id) return "";
    const prediction = this.getMyPrediction(match.id);
    const predictionText = prediction
      ? `${Number(prediction.home_score_pred ?? 0)}-${Number(prediction.away_score_pred ?? 0)}`
      : "non posé";
    const resultText = ["finished", "live"].includes(match.status)
      ? H.scoreText(match.home_score, match.away_score)
      : "à venir";
    const pointsRow = prediction && ["finished", "live"].includes(match.status)
      ? (this.predictionForDisplay(this.myPointsForMatch(match.id) || prediction, match) || prediction)
      : null;
    const pointsText = pointsRow?.points_total !== undefined && pointsRow?.points_total !== null
      ? `${Number(pointsRow.points_total || 0)} pt${Number(pointsRow.points_total || 0) > 1 ? "s" : ""}`
      : "";

    if (!detailed) {
      return `<div class="final-focus-mini-meta"><span>Prono ${H.escapeHtml(predictionText)}</span><span>Rés. ${H.escapeHtml(resultText)}</span>${tvHtml ? `<span class="final-focus-mini-tv">${tvHtml}</span>` : ""}</div>`;
    }

    return `
      <div class="final-focus-prono-strip">
        <span><small>Ton prono</small><strong>${H.escapeHtml(predictionText)}</strong></span>
        <span><small>Résultat réel</small><strong>${H.escapeHtml(resultText)}</strong></span>
        ${pointsText ? `<span><small>Points</small><strong>${H.escapeHtml(pointsText)}</strong></span>` : ""}
      </div>
    `;
  },

  finalFocusDisplayTeamName(name, number = null) {
    const clean = String(name || "").trim();
    if (!clean) return "Équipe pas encore éclose";
    if (/^à\s*d[ée]finir$/i.test(clean)) return "Équipe pas encore éclose";
    if (/match\s*\d+\s*[—-]\s*[ée]quipe/i.test(clean)) return "Équipe pas encore éclose";
    if (number && new RegExp(`^M?${Number(number)}[AB]?$`, "i").test(clean)) return "Équipe pas encore éclose";
    return clean;
  },

  finalFocusPlaceholderHtml(title, view = {}) {
    const expanded = typeof view === "boolean" ? Boolean(view) : Boolean(view?.expanded);
    const activeColumn = typeof view === "boolean" ? Boolean(view) : Boolean(view?.activeColumn);
    const number = typeof view === "object" ? Number(view?.number || 0) : 0;
    const cardClass = expanded ? "expanded detailed" : `compact ${activeColumn ? "active-compact" : "side-compact"}`;
    return `
      <article class="final-focus-match ${cardClass} placeholder"
        ${number ? `data-final-match-toggle="${number}"` : ""}
        role="button"
        tabindex="0"
        aria-expanded="${expanded ? "true" : "false"}">
        <header class="final-focus-card-head">
          <strong>${H.escapeHtml(title)}</strong>
          <small>À confirmer</small>
        </header>
        <div class="${expanded ? "final-focus-detailed-teams" : "final-focus-compact-teams"}">
          <span><span class="flag-mini placeholder-flag"></span><strong>Équipe pas encore éclose</strong></span>
          <b>vs</b>
          <span><span class="flag-mini placeholder-flag"></span><strong>Équipe pas encore éclose</strong></span>
        </div>
        <div class="final-focus-mini-meta"><span>Prono non posé</span><span>Rés. à venir</span></div>
        ${expanded ? `<footer class="final-focus-card-foot is-expanded"><span>Lieu à confirmer</span></footer>` : ""}
      </article>
    `;
  },

  finalFocusCompactDate(value) {
    if (!value) return "à confirmer";
    const formatted = H.formatDateTime(value) || "";
    return formatted.split(",")[0] || formatted;
  },

  finalFocusCompactDateTime(value) {
    if (!value) return "à confirmer";
    return H.formatDateTime(value) || this.finalFocusCompactDate(value);
  },

  finalBracketHtml(byStage) {
    const matchMap = this.finalBracketMatchMap(byStage);
    const activeRound = this.activeFinalBracketRound(matchMap);
    return this.finalFocusBracketHtml(matchMap, activeRound);
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
    const bracketNumber = H.officialBracketMatchNumber?.(match);
    const home = this.finalFocusDisplayTeamName(match.home_team_name, bracketNumber);
    const away = this.finalFocusDisplayTeamName(match.away_team_name, bracketNumber);

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
          <span class="final-bracket-tv">${H.icon("tv")} ${H.tvChannelLogosHtml(this.matchTvChannel(match), "tv-logo-strip final-tv-strip")}</span>
        </div>
      </article>
    `;
  },

  finalBracketPlaceholderHtml(title = "Match", extraClass = "") {
    return `
      <article class="final-bracket-match placeholder ${extraClass}">
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
    const allowedTabs = this.canSeeFamily() ? ["players", "team", "family"] : ["players", "team"];
    const tab = allowedTabs.includes(this.state.leaderboardTab) ? this.state.leaderboardTab : "players";
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
        ${this.canSeeFamily() ? `<button class="${tab === "family" ? "active" : ""}" data-leaderboard-tab="family">Famille</button>` : ""}

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
    if (this.state.leaderboardTab === "family" && !this.canSeeFamily()) {
      this.state.leaderboardTab = "players";
      return this.renderPlayerLeaderboard();
    }
    if (this.state.leaderboardTab === "players") return this.renderPlayerLeaderboard();
    if (this.state.leaderboardTab === "team") return this.renderTeamLeaderboard();
    if (this.state.leaderboardTab === "family") return this.renderFamilyLeaderboard();

    return this.renderPlayerLeaderboard();
  },

  async renderPlayerLeaderboard() {
    const root = H.$("#leaderboardContent");
    if (!root) return;
    const mode = ["overall", "average", "phase", "evolution_points", "evolution_average"].includes(this.state.playerLeaderboardMode) ? this.state.playerLeaderboardMode : "overall";
    this.state.playerLeaderboardMode = mode;

    root.innerHTML = `
      <section class="card player-leaderboard-card">
        <div class="card-title-row leaderboard-compact-title">
          <div>
            <h3>${mode.startsWith("evolution") ? "Évolution joueurs" : mode === "average" ? "Classement joueurs · moyenne" : "Classement joueurs"}</h3>
          </div>
        </div>
        <div class="segmented small player-leaderboard-mode leaderboard-view-switch wide-switch">
          <button class="${mode === "overall" ? "active" : ""}" type="button" data-player-leaderboard-mode="overall">Général</button>
          <button class="${mode === "average" ? "active" : ""}" type="button" data-player-leaderboard-mode="average">Moyenne</button>
          <button class="${mode === "phase" ? "active" : ""}" type="button" data-player-leaderboard-mode="phase">Par phase</button>
          <button class="${mode === "evolution_points" ? "active" : ""}" type="button" data-player-leaderboard-mode="evolution_points">Évolution points</button>
          <button class="${mode === "evolution_average" ? "active" : ""}" type="button" data-player-leaderboard-mode="evolution_average">Évolution moyenne</button>
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

    const target = H.$("#playerLeaderboardRows", root);
    if (!target) return;
    if (mode.startsWith("evolution")) {
      const attrName = "data-player-evolution-mode";
      const evolutionMode = this.evolutionDataModeFor(attrName);
      const valueMode = mode === "evolution_average" ? "average" : "points";
      const useMockGraph = this.graphMockPreviewEnabled();
      const series = useMockGraph ? this.mockEvolutionSeries(evolutionMode, valueMode) : this.playerEvolutionSeries(evolutionMode, { valueMode });
      target.innerHTML = this.evolutionBlockHtml(series, {
        title: valueMode === "average" ? "Évolution · moyenne par match" : "Évolution · classement général",
        description: valueMode === "average" ? "Moyenne cumulée : points ÷ matchs pronostiqués." : "Points cumulés des meilleurs joueurs.",
        mode: evolutionMode,
        attrName,
        emptyText: "Pas encore assez de matchs terminés pour dessiner l’évolution générale."
      });
      this.bindEmbeddedEvolutionControls(target);
      return;
    }

    if (mode === "phase") {
      await this.renderPoolRoundLeaderboard("#playerLeaderboardRows");
    } else {
      await this.renderOverallLeaderboard("#playerLeaderboardRows", mode === "average" ? "average" : "points");
    }
  },

  scoreDetailRowsForUser(userId, filters = {}) {
    const includeTest = filters.includeTest === true;
    const includeLiveDemo = Boolean(filters.includeLiveDemo);
    const finishedOnly = Boolean(filters.finishedOnly);

    const source = [
      ...this.state.visiblePredictions.filter((p) => String(p.user_id) === String(userId)),
      ...(String(userId) === String(this.state.session?.user?.id) ? this.state.myPredictions : [])
    ];

    const byMatch = new Map();
    source.forEach((p) => {
      if (!p?.match_id) return;
      const current = byMatch.get(p.match_id) || {};
      byMatch.set(p.match_id, { ...current, ...p, user_id: p.user_id || userId });
    });

    return [...byMatch.values()]
      .map((p) => {
        const match = this.state.matches.find((m) => m.id === p.match_id);
        const prediction = this.predictionForDisplay(p, match) || p;
        return { prediction, match };
      })
      .filter(({ match, prediction }) => match
        && (finishedOnly ? match.status === "finished" : ["finished", "live"].includes(match.status))
        && prediction.points_total !== null
        && prediction.points_total !== undefined
        && (
          includeTest
          || !match.is_test_match
          || (this.isLiveDemoMatch(match) && this.liveDemoMatchEnabled())
        )
        && (!this.isLiveDemoMatch(match) || includeLiveDemo)
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

    const groupMatches = this.competitionMatches().filter((match) =>
      match.stage === "group"
      && (!competitionId || match.competition_id === competitionId)
      && (!standing.group_name || match.group_name === standing.group_name)
    );

    const allGroupMatches = this.competitionMatches().filter((match) =>
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

      { id: "champion-picked", title: "Champion choisi", description: "L’équipe championne a été désignée avant le grand envol. Le hibou assume son oracle.", type: "neutral", category: "progression" },
      { id: "second-champion-picked", title: "Deuxième plume posée", description: "Un 2e champion a été choisi après les poules. Le hibou sort son stylo de secours.", type: "neutral", category: "progression" },
      { id: "final-winner-oracle", title: "Oracle de la finale", description: "L’équipe choisie championne avant le départ gagne réellement la Coupe. Là, le nid sort les confettis.", type: "neutral" },
      { id: "second-final-winner-oracle", title: "Rattrapage royal", description: "Le 2e champion choisi après les poules gagne la compétition. Filet de sécurité validé par le Hibou.", type: "positive" },
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
  manualBadgesForUser(userId) {
    return (this.state.manualBadges || [])
      .filter((row) => String(row.user_id) === String(userId))
      .map((row) => {
        const badge = this.badgeById(row.badge_id);
        if (!badge) return null;
        return {
          ...badge,
          manual: true,
          unlockedAt: this.safeDate(row.granted_at),
          manualReason: row.reason || null
        };
      })
      .filter(Boolean);
  },

  preparationBadgeIds() {
    return ["preparation-two-picks", "prep-good-pick"];
  },



  achievementsFinishedOnlyGuard() {
    // Les classements peuvent bouger en live, mais les exploits de score restent figés aux matchs terminés.
    return true;
  },

  computeBadgesForUser(userId) {
    const rows = this.scoreDetailRowsForUser(userId, { finishedOnly: true });
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
    const secondWinnerPick = String(userId) === String(this.state.session?.user?.id) ? this.state.secondWinnerPrediction : null;
    const manualBadges = this.manualBadgesForUser(userId);

    if (!rows.length && !predictionRows.length && !prepPredictionRows.length && !earlyWinnerPick?.predicted_team_id && !secondWinnerPick?.predicted_team_id && !manualBadges.length) return [];

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
    if (secondWinnerPick?.predicted_team_id) unlock("second-champion-picked", secondWinnerPick.locked_at || secondWinnerPick.updated_at || secondWinnerPick.created_at || null);
    if (final?.status === "finished" && final?.winner_team_id && secondWinnerPick?.predicted_team_id === final.winner_team_id) unlock("second-final-winner-oracle", finalDate);
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

    const merged = [...badges, ...manualBadges];
    const seen = new Set();
    const uniqueBadges = merged.filter((badge) => {
      if (!badge?.id || seen.has(badge.id)) return false;
      seen.add(badge.id);
      return true;
    });

    return [...uniqueBadges, ...this.miniRecordBadgesForUser(userId)];
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
    const specialBadgeAssets = {
      "champion-picked": "assets/icons/owl-png/coupe-du-monde.png",
      "second-champion-picked": "assets/icons/owl-png/badges.png",
      "second-final-winner-oracle": "assets/icons/owl-png/coupe-du-monde.png"
    };
    const assetFolder = isMiniRecord ? "assets/records" : "assets/badges";
    const src = specialBadgeAssets[badge.id] || `${assetFolder}/${id}.png`;
    const altPrefix = isMiniRecord ? "Mini-record" : "Badge";
    return `
      <span class="achievement-art ${unlocked ? "unlocked" : "locked"} ${isMiniRecord ? "mini-record-art" : ""}">
        <img src="${src}" alt="${altPrefix} ${title}" loading="lazy" onerror="this.remove()">
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
            this.loadSecondWinnerPrediction().catch(() => null),
            this.loadWinnerPredictionsForTeams().catch(() => null),
            this.loadSecondWinnerPredictionsForTeams().catch(() => null)
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
    const badges = Array.isArray(options.badgesOverride) ? options.badgesOverride : this.computeBadgesForUser(userId);
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
    const rows = this.scoreDetailRowsForUser(userId, filters)
      .slice()
      .sort((a, b) => new Date(b.match.kickoff_at || 0) - new Date(a.match.kickoff_at || 0));

    if (!rows.length) {
      return `<p class="muted detail-empty">Aucun match terminé comptabilisé pour ce joueur.</p>`;
    }

    const rowHtml = ({ prediction: p, match }) => `
      <div class="score-detail-row">
        <div class="score-detail-match">
          <strong>${H.matchFlagHtml(match, "home")} ${H.escapeHtml(match.home_team_short_name || match.home_team_name)} - ${H.matchFlagHtml(match, "away")} ${H.escapeHtml(match.away_team_short_name || match.away_team_name)}</strong>
          <small>${H.formatDateTime(match.kickoff_at)} · ${H.shortPoolRoundLabel(match)} · Réel : ${H.scoreText(match.home_score, match.away_score)} · Prono : ${p.home_score_pred} - ${p.away_score_pred}${p.qualified_team_name ? ` · Qualifié : ${H.escapeHtml(p.qualified_team_name)}` : ""}</small>
        </div>
        <div class="score-detail-points">
          <strong>${p.points_total ?? 0}</strong>
          <small>${H.escapeHtml(this.predictionReasonLabel(p))}</small>
        </div>
      </div>
    `;

    const latestRows = rows.slice(0, 5);
    const olderRows = rows.slice(5);

    return `
      <div class="score-detail-list">
        ${latestRows.map(rowHtml).join("")}
      </div>
      ${olderRows.length ? `
        <details class="score-detail-more">
          <summary class="ghost-btn tiny-btn score-detail-more-btn">Voir les ${olderRows.length} autre${olderRows.length > 1 ? "s" : ""} match${olderRows.length > 1 ? "s" : ""}</summary>
          <div class="score-detail-list score-detail-list-extra">
            ${olderRows.map(rowHtml).join("")}
          </div>
        </details>
      ` : ""}
    `;
  },

  averagePoints(row = {}) {
    const played = Number(row.scored_matches || row.matches_played || 0);
    return played ? Number(row.total_points || 0) / played : 0;
  },

  withAveragePoints(row = {}) {
    return {
      ...row,
      average_points: Number.isFinite(Number(row.average_points)) && Number(row.average_points) > 0
        ? Number(row.average_points)
        : this.averagePoints(row)
    };
  },

  sortPlayerRows(rows = [], mode = "points") {
    const byAverage = mode === "average";
    const sortedRows = (rows || [])
      .map((row) => this.withAveragePoints(row))
      .sort((a, b) =>
        byAverage
          ? Number(b.average_points || 0) - Number(a.average_points || 0)
            || Number(b.total_points || 0) - Number(a.total_points || 0)
            || Number(b.scored_matches || 0) - Number(a.scored_matches || 0)
            || String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr")
          : Number(b.total_points || 0) - Number(a.total_points || 0)
            || Number(b.average_points || 0) - Number(a.average_points || 0)
            || Number(b.exact_scores || 0) - Number(a.exact_scores || 0)
            || Number(b.good_results || 0) - Number(a.good_results || 0)
            || String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr")
      );
    return this.rankRowsWithTies(sortedRows, (row) => byAverage ? Number(row.average_points || 0) : Number(row.total_points || 0));
  },


  rankRowsWithTies(rows = [], metricGetter = (row) => Number(row.total_points || 0)) {
    let currentRank = 0;
    let previousMetric = null;
    return (rows || []).map((row, index) => {
      const metric = Number(metricGetter(row) || 0);
      if (index === 0 || Math.abs(metric - previousMetric) > 0.000001) {
        currentRank = index + 1;
        previousMetric = metric;
      }
      return { ...row, rank: currentRank };
    });
  },

  async renderOverallLeaderboard(targetSelector = "#leaderboardContent", valueMode = "points") {
    await Promise.all([
      this.loadMatches(),
      this.loadVisiblePredictions(),
      this.loadPublicProfiles()
    ]);

    const { data, error } = await window.sb
      .from("v_leaderboard_overall")
      .select("*")
      .order("rank");

    const root = H.$(targetSelector);
    if (!root) return;
    if (error) {
      root.innerHTML = `<p class="error-text">${H.escapeHtml(error.message)}</p>`;
      return;
    }

    const officialIds = new Set(this.officialProfiles(this.state.publicProfiles).map((profile) => String(profile.id || profile.user_id)));
    const officialRows = this.liveAdjustedLeaderboardRows(data || [])
      .filter((row) => !officialIds.size || officialIds.has(String(row.user_id || row.id)));
    const rows = this.sortPlayerRows(officialRows, valueMode);
    const liveCount = this.liveOfficialProjectionRows().length;

    root.innerHTML = `
      <div class="leaderboard-inner-title">
        <strong>${valueMode === "average" ? "Moyenne par match pronostiqué" : "Général"}</strong>
        <small>${valueMode === "average" ? "Points ÷ matchs comptés" : "Classement Coupe du monde, hors matchs test"}${liveCount ? " · projections live incluses" : ""}</small>
      </div>
      ${liveCount ? `<div class="live-ranking-note">${H.icon("info")} Classement provisoire pendant le live : il suit le score actuel et se recalera au coup de sifflet final.</div>` : ""}
      ${this.leaderboardRowsHtml(rows, { valueMode })}
    `;
    this.bindAchievementReplay(root);
  },

  leaderboardRowsHtml(rows, options = {}) {
    if (!rows.length) return `<p class="muted">Pas encore de points.</p>`;
    const filters = options.filters || {};
    const valueMode = options.valueMode || "points";
    const movementContext = options.movementContext || "official";
    const showRankMovement = options.showRankMovement !== undefined
      ? Boolean(options.showRankMovement)
      : (!filters.matchIds && valueMode === "points");

    return `
      <div class="leaderboard-list">
        ${rows.map((rawRow) => {
          const r = this.withAveragePoints(rawRow);
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
          const averageValue = Number(r.average_points || 0);
          const movementHtml = showRankMovement ? this.rankMovementHtml(r, movementContext) : "";
          return `
          <details class="leader-details ${r.user_id === this.state.session.user.id ? "me" : ""}">
            <summary class="leader-row">
              <div class="rank">#${r.rank}${movementHtml}</div>
              <div class="leader-avatar" aria-hidden="true">
                ${H.profileBadgeHtml(playerProfile, "profile-badge leader")}
              </div>
              <div class="leader-main">
                <strong>${H.escapeHtml(r.pseudo)}</strong>
                <small>${H.escapeHtml(r.office_team_name || "Sans team")}</small>
                ${this.pointsBreakdownHtml(r)}
                <div class="score-breakdown average-breakdown">
                  <span title="Moyenne par match pronostiqué">${H.icon("trend")} ${averageValue.toFixed(2)} pts/match</span>
                </div>
              </div>
              <div class="points">${valueMode === "average" ? averageValue.toFixed(2) : (r.total_points || 0)}<small>${valueMode === "average" ? "pts/match" : `pts${r.live_points ? ` · +${r.live_points} live` : ""}`}</small></div>
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
    await Promise.all([this.loadMatches(), this.loadVisiblePredictions(), this.loadPublicProfiles()]);
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
    this.officialProfiles(this.state.publicProfiles).forEach((profile) => {
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
        featured_badge_ids: profile.featured_badge_ids,
        player_scope: profile.player_scope || profile.role || "uis",
        role: profile.role || "user"
      });
    });
    (data || []).forEach((row) => {
      if (!row.user_id) return;
      const profile = this.profileForUser(row.user_id, row);
      if (this.isFamily(profile)) return;
      byUser.set(row.user_id, { ...(byUser.get(row.user_id) || {}), ...row });
    });

    const matchIds = group.matches.map((m) => m.id);
    const finishedCount = group.matches.filter((m) => ["finished", "live"].includes(m.status)).length;
    const liveProjectionCount = this.liveProjectionCountForMatchIds(matchIds);
    const sortedRows = [...byUser.values()].map((player) => {
      const details = this.scoreDetailRowsForUser(player.user_id, { matchIds, includeTest: false });
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
      );
    const rows = this.rankRowsWithTies(sortedRows, (row) => Number(row.total_points || 0));

    const pager = this.phaseNavigatorHtml(groups, activeIndex, "leaderboardPhaseIndex");

    root.innerHTML = `
      ${pager}
      <div class="leaderboard-inner-title">
        <strong>${H.escapeHtml(group.key)}</strong>
        <small>${finishedCount}/${group.matches.length} match${group.matches.length > 1 ? "s" : ""} terminé/en direct · ${H.matchDateRangeLabel(group.matches)}</small>
      </div>
      ${liveProjectionCount ? `<div class="live-ranking-note">${H.icon("info")} Classement joueurs par phase provisoire : ${liveProjectionCount} projection${liveProjectionCount > 1 ? "s" : ""} live incluse${liveProjectionCount > 1 ? "s" : ""}.</div>` : ""}
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
    const teams = this.state.officeTeams.map((team) => {
      const players = this.teamPlayers(team.id, { officialOnly: true }).filter((player) => player.profile_setup_done !== false);
      const details = players.flatMap((player) => this.scoreDetailRowsForUser(player.id || player.user_id, { matchIds, includeTest: false }));

      const total = details.reduce((sum, { prediction }) => sum + Number(prediction.points_total || 0), 0);
      const exact = details.filter(({ prediction }) => prediction.is_exact_score).length;
      const goodResults = details.filter(({ prediction }) => prediction.is_good_result).length;
      return {
        office_team_id: team.id,
        office_team_name: team.name,
        office_team_color: team.color,
        active_players: players.length,
        total_points: total,
        average_points: details.length ? total / details.length : 0,
        exact_scores: exact,
        good_results: goodResults,
        scored_matches: details.length
      };
    }).filter((row) => row.active_players > 0);

    const byAverage = mode === "average";
    const sortedRows = teams
      .sort((a, b) =>
        byAverage
          ? (b.average_points || 0) - (a.average_points || 0)
            || (b.total_points || 0) - (a.total_points || 0)
            || String(a.office_team_name || "").localeCompare(String(b.office_team_name || ""), "fr")
          : (b.total_points || 0) - (a.total_points || 0)
            || (b.average_points || 0) - (a.average_points || 0)
            || String(a.office_team_name || "").localeCompare(String(b.office_team_name || ""), "fr")
      );
    return this.rankRowsWithTies(sortedRows, (row) => byAverage ? Number(row.average_points || 0) : Number(row.total_points || 0));
  },

  teamOverallRows(mode = "average", scoreRows = this.liveAdjustedLeaderboardRows(this.state.playerScoreRows)) {
    const scoreByUser = new Map(
      scoreRows.map((row) => [String(row.user_id || row.id), row])
    );

    const rows = this.state.officeTeams.map((team) => {
      const players = this.teamPlayers(team.id, { officialOnly: true }).filter((player) => player.profile_setup_done !== false);
      const totals = players.reduce((acc, player) => {
        const score = scoreByUser.get(String(player.id || player.user_id)) || {};
        acc.total_points += Number(score.total_points || 0);
        acc.exact_scores += Number(score.exact_scores || 0);
        acc.good_results += Number(score.good_results || 0);
        acc.good_goal_diffs += Number(score.good_goal_diffs || 0);
        acc.good_qualified += Number(score.good_qualified || 0);
        acc.scored_matches += Number(score.scored_matches || 0);
        return acc;
      }, {
        total_points: 0,
        exact_scores: 0,
        good_results: 0,
        good_goal_diffs: 0,
        good_qualified: 0,
        scored_matches: 0
      });

      return {
        office_team_id: team.id,
        office_team_name: team.name,
        office_team_color: team.color,
        active_players: players.length,
        average_points: totals.scored_matches ? totals.total_points / totals.scored_matches : 0,
        ...totals
      };
    }).filter((row) => row.active_players > 0);

    const byAverage = mode === "average";
    const sortedRows = rows
      .sort((a, b) =>
        byAverage
          ? (b.average_points || 0) - (a.average_points || 0)
            || (b.total_points || 0) - (a.total_points || 0)
            || String(a.office_team_name || "").localeCompare(String(b.office_team_name || ""), "fr")
          : (b.total_points || 0) - (a.total_points || 0)
            || (b.average_points || 0) - (a.average_points || 0)
            || String(a.office_team_name || "").localeCompare(String(b.office_team_name || ""), "fr")
      );
    return this.rankRowsWithTies(sortedRows, (row) => byAverage ? Number(row.average_points || 0) : Number(row.total_points || 0));
  },

  teamLeaderboardRowsHtml(rows = [], options = {}) {
    if (!rows.length) return `<p class="muted">Pas encore de team classée.</p>`;
    const mode = options.mode || this.state.teamTab;
    return `
      <div class="leaderboard-list team-leaderboard-list">
        ${rows.map((r) => {
          const color = this.safeColor(r.office_team_color || r.color, "#facc15");
          const mainValue = mode === "average" ? Number(r.average_points || 0).toFixed(2) : Number(r.total_points || 0);
          const mainLabel = mode === "average" ? "pts/match" : `pts${r.live_points ? ` · +${r.live_points} live` : ""}`;
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
                  ${mode !== "average" ? `<span title="Moyenne par match pronostiqué">${H.icon("trend")} ${Number(r.average_points || 0).toFixed(2)} pts/match</span>` : ""}
                </div>
              </div>
              <div class="points">${mainValue}<small>${mainLabel}</small></div>
            </div>`;
        }).join("")}
      </div>
    `;
  },

  bindTeamLeaderboardControls(root) {
    H.$$('[data-team-scope]', root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.teamLeaderboardScope = btn.dataset.teamScope;
        await this.renderTeamLeaderboard();
      });
    });

    H.$$('[data-team-tab]', root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.teamTab = btn.dataset.teamTab;
        await this.renderTeamLeaderboard();
      });
    });
  },

  async renderTeamLeaderboard() {
    await Promise.all([this.loadMatches(), this.loadVisiblePredictions(), this.loadPublicProfiles(), this.loadPlayerScoreRows()]);
    const root = H.$("#leaderboardContent");
    const teamTab = ["average", "points", "evolution_average", "evolution_points"].includes(this.state.teamTab) ? this.state.teamTab : "average";
    const scope = this.state.teamLeaderboardScope === "phase" ? "phase" : "overall";
    const isEvolution = teamTab.startsWith("evolution_");
    const evolutionValueMode = teamTab === "evolution_average" ? "average" : "points";
    this.state.teamTab = teamTab;
    this.state.teamLeaderboardScope = scope;

    const scopeControls = `
      <div class="segmented small team-leaderboard-scope">
        <button class="${scope === "overall" ? "active" : ""}" data-team-scope="overall">Général</button>
        <button class="${scope === "phase" ? "active" : ""}" data-team-scope="phase">Par phase</button>
      </div>
    `;
    const modeControls = `
      <div class="segmented small team-leaderboard-mode leaderboard-view-switch wide-switch">
        <button class="${teamTab === "average" ? "active" : ""}" data-team-tab="average">Moyenne</button>
        <button class="${teamTab === "points" ? "active" : ""}" data-team-tab="points">Par points</button>
        <button class="${teamTab === "evolution_average" ? "active" : ""}" data-team-tab="evolution_average">Évolution moyenne</button>
        <button class="${teamTab === "evolution_points" ? "active" : ""}" data-team-tab="evolution_points">Évolution points</button>
      </div>
    `;

    if (isEvolution) {
      const attrName = "data-team-evolution-mode";
      const evolutionMode = this.evolutionDataModeFor(attrName);
      const series = this.graphMockPreviewEnabled()
        ? this.mockTeamEvolutionSeries(evolutionMode, false, evolutionValueMode)
        : this.teamEvolutionSeries(evolutionMode, false, evolutionValueMode);
      root.innerHTML = `
        <section class="card team-leaderboard-card">
          <div class="card-title-row"><h3>${evolutionValueMode === "average" ? "Évolution moyenne · teams bureau" : "Évolution points · teams bureau"}</h3></div>
          <div class="team-leaderboard-control-stack">${scopeControls}${modeControls}</div>
          ${this.evolutionBlockHtml(series, {
            title: evolutionValueMode === "average" ? "Évolution moyenne · teams bureau" : "Évolution points · teams bureau",
            description: evolutionValueMode === "average" ? "Moyenne cumulée par match pronostiqué dans chaque team." : "Points cumulés par team.",
            mode: evolutionMode,
            attrName: "data-team-evolution-mode",
            emptyText: "Pas encore assez de matchs terminés pour dessiner l’évolution des teams."
          })}
        </section>
      `;
      this.bindTeamLeaderboardControls(root);
      this.bindEmbeddedEvolutionControls(root);
      return;
    }

    if (scope === "overall") {
      await Promise.all([this.loadPlayerScoreRows(), this.loadVisiblePredictions(), this.loadMatches(), this.loadPublicProfiles()]);
      const liveRows = this.liveAdjustedLeaderboardRows(this.state.playerScoreRows);
      const liveCount = this.liveOfficialProjectionRows().length;
      const rows = this.teamOverallRows(teamTab, liveRows);
      root.innerHTML = `
        <section class="card team-leaderboard-card">
          <div class="card-title-row"><h3>Teams bureau général</h3></div>
          <div class="team-leaderboard-control-stack">${scopeControls}${modeControls}</div>
          <div class="team-phase-head"><strong>Général</strong><small>Classement Coupe du monde, hors matchs test${liveCount ? " · projections live incluses" : ""}</small></div>
          ${liveCount ? `<div class="live-ranking-note">${H.icon("info")} Classement teams provisoire pendant le live : il suit le score actuel.</div>` : ""}
          ${this.teamLeaderboardRowsHtml(rows, { mode: teamTab })}
        </section>
      `;
      this.bindTeamLeaderboardControls(root);
      return;
    }

    const groups = this.groupMatchesByPouleRound(this.phaseLeaderboardMatches());
    const activeIndex = this.clampPhaseIndex("teamLeaderboardPhaseIndex", groups);
    const group = groups[activeIndex];

    if (!groups.length || !group) {
      root.innerHTML = `
        <section class="card team-leaderboard-card">
          <div class="card-title-row"><h3>Teams bureau par phase</h3></div>
          <div class="team-leaderboard-control-stack">${scopeControls}${modeControls}</div>
          <p class="muted">Aucune phase à afficher pour le moment.</p>
        </section>
      `;
      this.bindTeamLeaderboardControls(root);
      return;
    }

    const matchIds = group.matches.map((match) => match.id);
    const finishedCount = group.matches.filter((match) => ["finished", "live"].includes(match.status)).length;
    const pager = this.phaseNavigatorHtml(groups, activeIndex, "teamLeaderboardPhaseIndex");
    const rows = this.teamPhaseRows(matchIds, teamTab);
    const liveProjectionCount = this.liveProjectionCountForMatchIds(matchIds);

    root.innerHTML = `
      <section class="card team-leaderboard-card">
        <div class="card-title-row"><h3>Teams bureau par phase</h3></div>
        <div class="team-leaderboard-control-stack">${scopeControls}${modeControls}</div>
        ${pager}
        <div class="team-phase-head">
          <strong>${H.escapeHtml(group.key)}</strong>
          <small>${finishedCount}/${group.matches.length} match${group.matches.length > 1 ? "s" : ""} terminé/en direct · ${H.matchDateRangeLabel(group.matches)}</small>
        </div>
        ${liveProjectionCount ? `<div class="live-ranking-note">${H.icon("info")} Classement teams par phase provisoire : ${liveProjectionCount} projection${liveProjectionCount > 1 ? "s" : ""} live incluse${liveProjectionCount > 1 ? "s" : ""}.</div>` : ""}
        ${this.teamLeaderboardRowsHtml(rows, { mode: teamTab })}
        ${pager}
      </section>
    `;

    this.bindTeamLeaderboardControls(root);
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

  playerEvolutionSeries(mode = "day", options = {}) {
    const valueMode = options.valueMode || "points";
    const allowedOfficialIds = options.officialOnly === false
      ? null
      : new Set(this.officialProfiles(this.state.publicProfiles).map((profile) => String(profile.id || profile.user_id)));
    const finishedRows = this.state.visiblePredictions
      .map((prediction) => ({ prediction, match: this.state.matches.find((m) => m.id === prediction.match_id) }))
      .filter(({ prediction, match }) =>
        match?.status === "finished"
        && !this.isLiveDemoMatch(match)
        && (!allowedOfficialIds || allowedOfficialIds.has(String(prediction.user_id)))
        && this.graphEvolutionCanUseMatch(match)
        && prediction.points_total !== null
        && prediction.points_total !== undefined
      )
      .sort((a, b) => new Date(a.match.kickoff_at || 0) - new Date(b.match.kickoff_at || 0));

    const periodKey = (date, match = null) => {
      if (mode === "match") return `${match?.kickoff_at || date || ""}`;
      const d = new Date(date);
      return d.toISOString().slice(0, 10);
    };
    const periodLabel = (key, match = null) => mode === "match" ? this.evolutionMatchSnapshotLabel(match) : H.formatShortDate(key);
    const periodMeta = new Map();
    const periods = [...new Set(finishedRows.map(({ match }) => {
      const key = periodKey(match.kickoff_at, match);
      this.registerEvolutionPeriodMeta(periodMeta, key, match);
      return key;
    }))].sort();
    const totalsByUser = new Map();
    const countsByUser = new Map();
    const pointsByPeriod = new Map(periods.map((key) => [key, new Map()]));
    const countsByPeriod = new Map(periods.map((key) => [key, new Map()]));

    finishedRows.forEach(({ prediction, match }) => {
      const key = periodKey(match.kickoff_at, match);
      const map = pointsByPeriod.get(key);
      const countMap = countsByPeriod.get(key);
      map.set(prediction.user_id, (map.get(prediction.user_id) || 0) + Number(prediction.points_total || 0));
      countMap.set(prediction.user_id, (countMap.get(prediction.user_id) || 0) + 1);
    });

    periods.forEach((key) => {
      const map = pointsByPeriod.get(key);
      const countMap = countsByPeriod.get(key) || new Map();
      map.forEach((points, userId) => {
        totalsByUser.set(userId, (totalsByUser.get(userId) || 0) + points);
        countsByUser.set(userId, (countsByUser.get(userId) || 0) + (countMap.get(userId) || 0));
      });
    });

    const valueForUser = (userId, points, count = countsByUser.get(userId) || 0) =>
      valueMode === "average" ? Math.round((points / Math.max(1, count)) * 100) / 100 : points;

    const playerIds = [...totalsByUser.keys()]
      .sort((a, b) => valueForUser(b, totalsByUser.get(b) || 0) - valueForUser(a, totalsByUser.get(a) || 0))
      .slice(0, 8);

    const cumulative = new Map(playerIds.map((userId) => [userId, 0]));
    const cumulativeCounts = new Map(playerIds.map((userId) => [userId, 0]));
    const snapshots = periods.map((key) => {
      const periodPoints = pointsByPeriod.get(key) || new Map();
      const periodCounts = countsByPeriod.get(key) || new Map();
      playerIds.forEach((userId) => {
        cumulative.set(userId, (cumulative.get(userId) || 0) + (periodPoints.get(userId) || 0));
        cumulativeCounts.set(userId, (cumulativeCounts.get(userId) || 0) + (periodCounts.get(userId) || 0));
      });
      return {
        key,
        label: periodMeta.get(key)?.label || periodLabel(key, periodMeta.get(key)?.match),
        matchMeta: periodMeta.get(key),
        totals: new Map(playerIds.map((userId) => [userId, valueForUser(userId, cumulative.get(userId) || 0, cumulativeCounts.get(userId) || 0)]))
      };
    });

    const finalTotalsByUser = new Map(playerIds.map((userId) => [userId, snapshots[snapshots.length - 1]?.totals.get(userId) || 0]));
    return { playerIds, snapshots, totalsByUser: finalTotalsByUser, valueMode };
  },


  evolutionFocusKey(attrName = "data-evolution-mode") {
    return String(attrName || "data-evolution-mode").replace(/^data-/, "").replace(/-mode$/, "");
  },

  evolutionZoomLevelFor(attrName = "data-evolution-mode") {
    const key = this.evolutionFocusKey(attrName);
    const value = Number(this.state.evolutionZoomMap?.[key] ?? 0);
    return Math.min(3, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0));
  },

  evolutionZoomFor(attrName = "data-evolution-mode") {
    // Compat : on garde le nom de l'ancienne fonction, mais il renvoie maintenant un niveau 0 → 3.
    return this.evolutionZoomLevelFor(attrName);
  },

  evolutionZoomMeta(level = 0) {
    const metas = [
      { level: 0, label: "Vue générale", short: "Général", visible: Infinity, detail: "Toute l’évolution depuis le début." },
      { level: 1, label: "Vue rapprochée", short: "Zoom 1", visible: 14, detail: "Fenêtre plus lisible sur les derniers points." },
      { level: 2, label: "Vue précise", short: "Zoom 2", visible: 8, detail: "Encore moins de points, plus de relief." },
      { level: 3, label: "Détail match par match", short: "Matchs", visible: 5, detail: "Chaque point correspond à un match terminé." }
    ];
    return metas[Math.min(3, Math.max(0, Number(level || 0)))] || metas[0];
  },

  evolutionDataModeFor(attrName = "data-evolution-mode") {
    return this.evolutionZoomLevelFor(attrName) >= 3 ? "match" : "day";
  },

  evolutionWindowOffsetFor(attrName = "data-evolution-mode") {
    const key = this.evolutionFocusKey(attrName);
    const value = Number(this.state.evolutionWindowMap?.[key]);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  },

  setEvolutionWindowOffset(attrName = "data-evolution-mode", offset = 0) {
    const key = this.evolutionFocusKey(attrName);
    this.state.evolutionWindowMap ||= {};
    this.state.evolutionWindowMap[key] = Math.max(0, Math.round(Number(offset || 0)));
  },

  setEvolutionWindowStep(attrName = "data-evolution-mode", delta = 0, series = null) {
    const windowInfo = series ? this.evolutionVisibleWindow(series, attrName) : { maxStart: 0, start: this.evolutionWindowOffsetFor(attrName) || 0 };
    const next = Math.min(windowInfo.maxStart || 0, Math.max(0, (windowInfo.start || 0) + Number(delta || 0)));
    this.setEvolutionWindowOffset(attrName, next);
  },

  evolutionFocusFor(attrName = "data-evolution-mode") {
    const key = this.evolutionFocusKey(attrName);
    return this.state.evolutionFocusMap?.[key] || "";
  },

  setEvolutionZoom(attrName = "data-evolution-mode", delta = 0) {
    const key = this.evolutionFocusKey(attrName);
    this.state.evolutionZoomMap ||= {};
    this.state.evolutionWindowMap ||= {};
    const current = this.evolutionZoomLevelFor(attrName);
    this.state.evolutionZoomMap[key] = Math.min(3, Math.max(0, current + Math.sign(Number(delta || 0))));
    delete this.state.evolutionWindowMap[key];
  },

  setEvolutionFocus(attrName = "data-evolution-mode", id = "") {
    const key = this.evolutionFocusKey(attrName);
    this.state.evolutionFocusMap ||= {};
    this.state.evolutionFocusMap[key] = String(id || "");
  },

  evolutionVisibleWindow(series = {}, attrName = "data-evolution-mode") {
    const snapshots = series.snapshots || [];
    const level = this.evolutionZoomLevelFor(attrName);
    const meta = this.evolutionZoomMeta(level);
    const visibleCount = Number.isFinite(meta.visible) ? Math.min(meta.visible, snapshots.length) : snapshots.length;
    const maxStart = Math.max(0, snapshots.length - Math.max(1, visibleCount));
    const stored = this.evolutionWindowOffsetFor(attrName);
    const start = Math.min(maxStart, Math.max(0, stored === null ? maxStart : stored));
    const end = visibleCount >= snapshots.length ? snapshots.length : start + visibleCount;
    return { level, meta, start, end, maxStart, visibleCount, snapshots: snapshots.slice(start, end) };
  },

  evolutionMatchSnapshotLabel(match = null) {
    if (!match) return "Match";
    const number = H.officialBracketMatchNumber?.(match);
    if (number) return `M${number}`;
    const day = H.formatShortDate(match.kickoff_at) || "Match";
    const home = String(match.home_team_short_name || match.home_team_name || "").slice(0, 3);
    const away = String(match.away_team_short_name || match.away_team_name || "").slice(0, 3);
    return `${day}${home && away ? ` · ${home}-${away}` : ""}`;
  },

  evolutionMatchSnapshotMeta(match = null) {
    if (!match) return null;
    return {
      match_id: match.id,
      match,
      label: this.evolutionMatchSnapshotLabel(match),
      result: ["finished", "live"].includes(match.status) ? H.scoreText(match.home_score, match.away_score) : "à venir",
      date: H.formatShortDate(match.kickoff_at) || "",
      dateTime: H.formatDateTime(match.kickoff_at) || "",
      home: match.home_team_name || "Équipe A",
      away: match.away_team_name || "Équipe B"
    };
  },

  evolutionMatchGroupLabel(matches = [], fallback = "Match") {
    const list = (matches || []).filter(Boolean);
    if (list.length <= 1) return list[0] ? this.evolutionMatchSnapshotLabel(list[0]) : fallback;
    const first = list[0];
    const when = H.formatDateTime(first.kickoff_at) || H.formatShortDate(first.kickoff_at) || fallback;
    return `${when} · ${list.length} matchs`;
  },

  registerEvolutionPeriodMeta(periodMeta, key, match = null) {
    if (!periodMeta || !key || !match) return;
    const current = periodMeta.get(key) || { matches: [], _matchIds: new Set() };
    current.matches ||= [];
    current._matchIds ||= new Set(current.matches.map((item) => String(item?.id || `${item?.kickoff_at || ""}|${item?.home_team_name || ""}|${item?.away_team_name || ""}`)));
    const matchId = String(match.id || `${match.kickoff_at || ""}|${match.home_team_name || ""}|${match.away_team_name || ""}`);
    if (!current._matchIds.has(matchId)) {
      current.matches.push(match);
      current._matchIds.add(matchId);
    }
    const first = current.matches[0] || match;
    const base = this.evolutionMatchSnapshotMeta(first) || {};
    periodMeta.set(key, {
      ...base,
      matches: current.matches,
      _matchIds: current._matchIds,
      label: this.evolutionMatchGroupLabel(current.matches, base.label || "Match"),
      result: current.matches.length > 1 ? `${current.matches.length} matchs` : base.result,
      date: base.date,
      dateTime: base.dateTime
    });
  },

  evolutionMatchDetailsHtml(series = {}, attrName = "data-evolution-mode") {
    const windowInfo = this.evolutionVisibleWindow(series, attrName);
    if (windowInfo.level < 3 || !windowInfo.snapshots.length) return "";
    return `
      <div class="evolution-match-strip" aria-label="Détail des matchs affichés">
        ${windowInfo.snapshots.map((snapshot) => {
          const meta = snapshot.matchMeta || {};
          const matches = Array.isArray(meta.matches) && meta.matches.length ? meta.matches : (meta.match ? [meta.match] : []);
          return `
            <article class="evolution-match-chip ${matches.length > 1 ? "has-stacked-matches" : ""}">
              <strong>${H.escapeHtml(meta.label || snapshot.label || "Match")}</strong>
              <div class="evolution-match-chip-stack">
                ${matches.length ? matches.map((match) => `
                  <span>${H.matchFlagHtml(match, "home")} ${H.escapeHtml(match.home_team_name || "Équipe A")} <b>${H.escapeHtml(["finished", "live"].includes(match.status) ? H.scoreText(match.home_score, match.away_score) : "vs")}</b> ${H.matchFlagHtml(match, "away")} ${H.escapeHtml(match.away_team_name || "Équipe B")}</span>
                `).join("") : `<span>${H.escapeHtml(snapshot.label || "Match")}</span>`}
              </div>
              ${meta.dateTime || meta.date ? `<small>${H.escapeHtml(meta.dateTime || meta.date)}</small>` : ""}
            </article>
          `;
        }).join("")}
      </div>
    `;
  },

  evolutionColor(index = 0) {
    const palette = [
      "#facc15", "#38bdf8", "#a78bfa", "#fb7185",
      "#34d399", "#fb923c", "#f472b6", "#22c55e",
      "#60a5fa", "#e879f9", "#f87171", "#2dd4bf"
    ];
    return palette[Math.abs(Number(index || 0)) % palette.length];
  },

  evolutionChartSvg(series, { zoom = 0, focusId = "", attrName = "data-evolution-mode" } = {}) {
    const { playerIds } = series;
    const windowInfo = this.evolutionVisibleWindow(series, attrName);
    const snapshots = windowInfo.snapshots;
    if (!playerIds.length || !snapshots.length) return "";

    const level = windowInfo.level;
    const width = level === 0 ? 840 : level === 1 ? 900 : level === 2 ? 940 : 980;
    const height = level === 0 ? 310 : level === 1 ? 330 : level === 2 ? 350 : 370;
    const pad = { left: 58, right: 26, top: 26, bottom: level >= 3 ? 58 : 44 };
    const graphW = width - pad.left - pad.right;
    const graphH = height - pad.top - pad.bottom;
    const visibleValues = snapshots.flatMap((snapshot) => playerIds.map((userId) => Number(snapshot.totals.get(userId) || 0)));
    const maxPointsRaw = Math.max(1, ...visibleValues);
    const minPointsRaw = Math.min(...visibleValues, 0);
    const dynamicMin = level >= 2 && maxPointsRaw > 10 ? Math.max(0, Math.floor(Math.min(...visibleValues) * 0.92)) : 0;
    const minPoints = series.valueMode === "average" ? Math.max(0, Math.floor(dynamicMin * 10) / 10) : dynamicMin;
    const maxPoints = maxPointsRaw <= minPoints ? minPoints + 1 : Math.ceil(maxPointsRaw + Math.max(1, (maxPointsRaw - minPoints) * 0.08));
    const x = (index) => pad.left + (snapshots.length === 1 ? graphW / 2 : (index / (snapshots.length - 1)) * graphW);
    const y = (value) => pad.top + graphH - ((Number(value || 0) - minPoints) / Math.max(1, maxPoints - minPoints)) * graphH;
    const middleTick = series.valueMode === "average" ? Math.round(((minPoints + maxPoints) / 2) * 100) / 100 : Math.round((minPoints + maxPoints) / 2);
    const yTicks = [...new Set([minPoints, middleTick, maxPoints])];

    const renderIds = focusId
      ? [...playerIds.filter((id) => String(id) !== String(focusId)), ...playerIds.filter((id) => String(id) === String(focusId))]
      : playerIds;
    const lines = renderIds.map((userId) => {
      const index = Math.max(0, playerIds.findIndex((id) => String(id) === String(userId)));
      const color = this.evolutionColor(index);
      const isFocused = focusId && String(userId) === String(focusId);
      const points = snapshots.map((snapshot, i) => `${x(i).toFixed(1)},${y(snapshot.totals.get(userId) || 0).toFixed(1)}`).join(" ");
      const last = snapshots[snapshots.length - 1];
      const lastX = x(snapshots.length - 1);
      const lastY = y(last.totals.get(userId) || 0);
      return `
        <g class="evolution-series ${isFocused ? "is-focused" : focusId ? "is-dimmed" : ""}" data-evolution-series="${H.escapeHtml(String(userId))}">
          <polyline class="evolution-line" points="${points}" fill="none" stroke="${color}" style="stroke:${color}" stroke-width="${isFocused ? 6 : 4}" stroke-linecap="round" stroke-linejoin="round" />
          ${level >= 2 ? snapshots.map((snapshot, i) => `<circle class="evolution-dot ${i === snapshots.length - 1 ? "is-last" : ""}" cx="${x(i).toFixed(1)}" cy="${y(snapshot.totals.get(userId) || 0).toFixed(1)}" r="${isFocused ? 5.8 : 4.6}" fill="${color}" style="fill:${color}" />`).join("") : `<circle class="evolution-dot" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="${isFocused ? 6.5 : 5}" fill="${color}" style="fill:${color}" />`}
        </g>
      `;
    }).join("");

    const xLabels = snapshots.map((snapshot, index) => {
      const shouldShow = snapshots.length <= 8 || index === 0 || index === snapshots.length - 1 || index % Math.ceil(snapshots.length / 6) === 0;
      const label = level >= 3 && snapshot.matchMeta ? snapshot.matchMeta.label : snapshot.label;
      return shouldShow ? `<text class="evolution-axis-label" x="${x(index).toFixed(1)}" y="${height - 18}" text-anchor="middle">${H.escapeHtml(String(label || "").replace("Semaine du ", "S. "))}</text>` : "";
    }).join("");

    const yGrid = yTicks.map((tick) => `
      <line class="evolution-grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}" />
      <text class="evolution-axis-label" x="${pad.left - 10}" y="${(y(tick) + 4).toFixed(1)}" text-anchor="end">${series.valueMode === "average" ? Number(tick).toFixed(1) : tick}</text>
    `).join("");

    return `
      <svg class="evolution-svg evolution-svg-level-${level}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Évolution des points">
        ${yGrid}
        ${lines}
        ${xLabels}
      </svg>
    `;
  },

  officialOverallRowForUser(userId) {
    if (!userId) return null;
    return this.state.playerScoreRows.find((row) => String(row.user_id || row.id) === String(userId)) || null;
  },

  familyPlayerOverallRow(player) {
    const userId = player.id || player.user_id;
    const official = this.officialOverallRowForUser(userId);

    // En mode général Famille, un joueur doit avoir exactement les mêmes matchs comptés
    // que dans le classement général officiel. La famille sert à filtrer l'affichage,
    // pas à recalculer une source différente.
    if (official) {
      return this.withAveragePoints({
        ...player,
        ...official,
        id: userId,
        user_id: userId,
        pseudo: official.pseudo || player.pseudo,
        office_team_id: official.office_team_id || player.office_team_id,
        office_team_name: official.office_team_name || player.office_team_name,
        office_team_slug: official.office_team_slug || player.office_team_slug,
        office_team_color: official.office_team_color || player.office_team_color,
        avatar_key: official.avatar_key || player.avatar_key,
        badge_shape: official.badge_shape || player.badge_shape,
        badge_color: official.badge_color || player.badge_color
      });
    }

    const details = this.scoreDetailRowsForUser(userId, { includeTest: false });
    const total = details.reduce((sum, { prediction }) => sum + Number(prediction.points_total || 0), 0);
    const livePoints = details
      .filter(({ prediction }) => prediction.is_live_projection)
      .reduce((sum, { prediction }) => sum + Number(prediction.points_total || 0), 0);
    const liveMatchCount = details.filter(({ prediction }) => prediction.is_live_projection).length;
    const exact = details.filter(({ prediction }) => prediction.is_exact_score).length;
    const goodResults = details.filter(({ prediction }) => prediction.is_good_result).length;
    const goodDiffs = details.filter(({ prediction }) => prediction.is_good_goal_diff).length;

    return this.withAveragePoints({
      ...player,
      user_id: userId,
      total_points: total,
      exact_scores: exact,
      good_results: goodResults,
      good_goal_diffs: goodDiffs,
      scored_matches: details.length,
      live_points: livePoints,
      live_match_count: liveMatchCount,
      has_live_projection: liveMatchCount > 0
    });
  },


  familyPlayerRows(matchIds = null, mode = "points") {
    const participants = this.familyProfiles(this.state.publicProfiles)
      .filter((player) => this.isFamily(player) || player.profile_setup_done !== false);

    const rows = participants.map((player) => {
      const userId = player.id || player.user_id;

      if (!matchIds) {
        return this.familyPlayerOverallRow(player);
      }

      const details = this.scoreDetailRowsForUser(userId, { matchIds, includeTest: false });
      const total = details.reduce((sum, { prediction }) => sum + Number(prediction.points_total || 0), 0);
      const livePoints = details
        .filter(({ prediction }) => prediction.is_live_projection)
        .reduce((sum, { prediction }) => sum + Number(prediction.points_total || 0), 0);
      const liveMatchCount = details.filter(({ prediction }) => prediction.is_live_projection).length;
      const exact = details.filter(({ prediction }) => prediction.is_exact_score).length;
      const goodResults = details.filter(({ prediction }) => prediction.is_good_result).length;
      const goodDiffs = details.filter(({ prediction }) => prediction.is_good_goal_diff).length;

      return this.withAveragePoints({
        ...player,
        user_id: userId,
        total_points: total,
        exact_scores: exact,
        good_results: goodResults,
        good_goal_diffs: goodDiffs,
        scored_matches: details.length,
        live_points: livePoints,
        live_match_count: liveMatchCount,
        has_live_projection: liveMatchCount > 0
      });
    });

    return this.sortPlayerRows(rows, mode);
  },

  familyTeamRows(matchIds = null, mode = "average") {
    const participants = this.familyProfiles(this.state.publicProfiles)
      .filter((player) => this.isFamily(player) || player.profile_setup_done !== false);
    const byTeam = new Map();

    participants.forEach((player) => {
      if (!player.office_team_id) return;
      const team = this.state.officeTeams.find((item) => item.id === player.office_team_id) || {};
      const userId = player.id || player.user_id;
      const overallRow = !matchIds ? this.familyPlayerOverallRow(player) : null;
      const details = matchIds ? this.scoreDetailRowsForUser(userId, { matchIds, includeTest: false }) : [];
      const row = byTeam.get(player.office_team_id) || {
        office_team_id: player.office_team_id,
        office_team_name: player.office_team_name || team.name || "Team",
        office_team_color: player.office_team_color || team.color || "#facc15",
        active_players: 0,
        total_points: 0,
        exact_scores: 0,
        good_results: 0,
        good_goal_diffs: 0,
        scored_matches: 0,
        live_points: 0,
        live_match_count: 0
      };
      row.active_players += 1;

      if (overallRow) {
        row.total_points += Number(overallRow.total_points || 0);
        row.live_points += Number(overallRow.live_points || 0);
        row.live_match_count += Number(overallRow.live_match_count || 0);
        row.exact_scores += Number(overallRow.exact_scores || 0);
        row.good_results += Number(overallRow.good_results || 0);
        row.good_goal_diffs += Number(overallRow.good_goal_diffs || 0);
        row.scored_matches += Number(overallRow.scored_matches || overallRow.matches_played || 0);
      } else {
        details.forEach(({ prediction }) => {
          row.total_points += Number(prediction.points_total || 0);
          if (prediction.is_live_projection) {
            row.live_points += Number(prediction.points_total || 0);
            row.live_match_count += 1;
          }
          row.exact_scores += prediction.is_exact_score ? 1 : 0;
          row.good_results += prediction.is_good_result ? 1 : 0;
          row.good_goal_diffs += prediction.is_good_goal_diff ? 1 : 0;
          row.scored_matches += 1;
        });
      }
      byTeam.set(player.office_team_id, row);
    });

    const byAverage = mode === "average";
    const sortedRows = [...byTeam.values()]
      .map((row) => ({ ...row, average_points: row.scored_matches ? row.total_points / row.scored_matches : 0 }))
      .sort((a, b) =>
        byAverage
          ? (b.average_points || 0) - (a.average_points || 0)
            || (b.total_points || 0) - (a.total_points || 0)
            || String(a.office_team_name || "").localeCompare(String(b.office_team_name || ""), "fr")
          : (b.total_points || 0) - (a.total_points || 0)
            || (b.average_points || 0) - (a.average_points || 0)
            || String(a.office_team_name || "").localeCompare(String(b.office_team_name || ""), "fr")
      );
    return this.rankRowsWithTies(sortedRows, (row) => byAverage ? Number(row.average_points || 0) : Number(row.total_points || 0));
  },

  familyEvolutionSeries(mode = "day", valueMode = "points") {
    const allowedIds = this.familyProfileIds();
    const finishedRows = this.state.visiblePredictions
      .map((prediction) => ({ prediction, match: this.state.matches.find((m) => m.id === prediction.match_id) }))
      .filter(({ prediction, match }) => allowedIds.has(String(prediction.user_id)) && match?.status === "finished" && !this.isLiveDemoMatch(match) && this.graphEvolutionCanUseMatch(match) && prediction.points_total !== null && prediction.points_total !== undefined)
      .sort((a, b) => new Date(a.match.kickoff_at || 0) - new Date(b.match.kickoff_at || 0));

    const periodKey = (date, match = null) => {
      if (mode === "match") return `${match?.kickoff_at || date || ""}`;
      const d = new Date(date);
      return d.toISOString().slice(0, 10);
    };
    const periodLabel = (key, match = null) => mode === "match" ? this.evolutionMatchSnapshotLabel(match) : H.formatShortDate(key);
    const periodMeta = new Map();
    const periods = [...new Set(finishedRows.map(({ match }) => {
      const key = periodKey(match.kickoff_at, match);
      this.registerEvolutionPeriodMeta(periodMeta, key, match);
      return key;
    }))].sort();
    const totalsByUser = new Map();
    const countsByUser = new Map();
    const pointsByPeriod = new Map(periods.map((key) => [key, new Map()]));
    const countsByPeriod = new Map(periods.map((key) => [key, new Map()]));

    finishedRows.forEach(({ prediction, match }) => {
      const key = periodKey(match.kickoff_at, match);
      const map = pointsByPeriod.get(key);
      const countMap = countsByPeriod.get(key);
      map.set(prediction.user_id, (map.get(prediction.user_id) || 0) + Number(prediction.points_total || 0));
      countMap.set(prediction.user_id, (countMap.get(prediction.user_id) || 0) + 1);
    });

    periods.forEach((key) => {
      const map = pointsByPeriod.get(key);
      const countMap = countsByPeriod.get(key) || new Map();
      map.forEach((points, userId) => {
        totalsByUser.set(userId, (totalsByUser.get(userId) || 0) + points);
        countsByUser.set(userId, (countsByUser.get(userId) || 0) + (countMap.get(userId) || 0));
      });
    });

    const valueForUser = (userId, points, count = countsByUser.get(userId) || 0) =>
      valueMode === "average" ? Math.round((points / Math.max(1, count)) * 100) / 100 : points;

    const playerIds = [...totalsByUser.keys()]
      .sort((a, b) => valueForUser(b, totalsByUser.get(b) || 0) - valueForUser(a, totalsByUser.get(a) || 0))
      .slice(0, 8);
    const cumulative = new Map(playerIds.map((userId) => [userId, 0]));
    const cumulativeCounts = new Map(playerIds.map((userId) => [userId, 0]));
    const snapshots = periods.map((key) => {
      const periodPoints = pointsByPeriod.get(key) || new Map();
      const periodCounts = countsByPeriod.get(key) || new Map();
      playerIds.forEach((userId) => {
        cumulative.set(userId, (cumulative.get(userId) || 0) + (periodPoints.get(userId) || 0));
        cumulativeCounts.set(userId, (cumulativeCounts.get(userId) || 0) + (periodCounts.get(userId) || 0));
      });
      return { key, label: periodMeta.get(key)?.label || periodLabel(key, periodMeta.get(key)?.match), matchMeta: periodMeta.get(key), totals: new Map(playerIds.map((userId) => [userId, valueForUser(userId, cumulative.get(userId) || 0, cumulativeCounts.get(userId) || 0)])) };
    });
    const finalTotals = new Map(playerIds.map((userId) => [userId, snapshots[snapshots.length - 1]?.totals.get(userId) || 0]));
    return { playerIds, snapshots, totalsByUser: finalTotals, valueMode };
  },

  bindFamilyLeaderboardControls(root) {
    H.$$('[data-family-pane]', root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.familyLeaderboardTab = btn.dataset.familyPane;
        await this.renderFamilyLeaderboard();
      });
    });
    H.$$('[data-family-player-mode]', root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.familyPlayerLeaderboardMode = btn.dataset.familyPlayerMode;
        await this.renderFamilyLeaderboard();
      });
    });
    H.$$('[data-family-team-scope]', root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.familyTeamLeaderboardScope = btn.dataset.familyTeamScope;
        await this.renderFamilyLeaderboard();
      });
    });
    H.$$('[data-family-team-tab]', root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.familyTeamTab = btn.dataset.familyTeamTab;
        await this.renderFamilyLeaderboard();
      });
    });
    H.$$('[data-family-evolution-mode]', root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.familyLeaderboardEvolutionMode = btn.dataset.familyEvolutionMode;
        await this.renderFamilyLeaderboard();
      });
    });
  },

  async renderFamilyLeaderboard() {
    await Promise.all([this.loadMatches(), this.loadVisiblePredictions(), this.loadPublicProfiles(), this.loadPlayerScoreRows()]);
    const root = H.$("#leaderboardContent");
    const pane = ["players", "team"].includes(this.state.familyLeaderboardTab) ? this.state.familyLeaderboardTab : "players";
    this.state.familyLeaderboardTab = pane;

    const paneControls = `
      <div class="segmented small family-leaderboard-panes">
        <button class="${pane === "players" ? "active" : ""}" data-family-pane="players">Joueurs</button>
        <button class="${pane === "team" ? "active" : ""}" data-family-pane="team">Par équipe</button>
      </div>
    `;

    if (pane === "team") {
      const teamTab = ["average", "points", "evolution_average", "evolution_points"].includes(this.state.familyTeamTab) ? this.state.familyTeamTab : "average";
      const scope = this.state.familyTeamLeaderboardScope === "phase" ? "phase" : "overall";
      const isEvolution = teamTab.startsWith("evolution_");
      const evolutionValueMode = teamTab === "evolution_average" ? "average" : "points";
      this.state.familyTeamTab = teamTab;
      this.state.familyTeamLeaderboardScope = scope;

      const scopeControls = `
        <div class="segmented small team-leaderboard-scope">
          <button class="${scope === "overall" ? "active" : ""}" data-family-team-scope="overall">Général</button>
          <button class="${scope === "phase" ? "active" : ""}" data-family-team-scope="phase">Par phase</button>
        </div>`;
      const modeControls = `
        <div class="segmented small team-leaderboard-mode leaderboard-view-switch wide-switch">
          <button class="${teamTab === "average" ? "active" : ""}" data-family-team-tab="average">Moyenne</button>
          <button class="${teamTab === "points" ? "active" : ""}" data-family-team-tab="points">Par points</button>
          <button class="${teamTab === "evolution_average" ? "active" : ""}" data-family-team-tab="evolution_average">Évolution moyenne</button>
          <button class="${teamTab === "evolution_points" ? "active" : ""}" data-family-team-tab="evolution_points">Évolution points</button>
        </div>`;

      if (isEvolution) {
        const attrName = "data-family-team-evolution-mode";
        const evolutionMode = this.evolutionDataModeFor(attrName);
        const series = this.graphMockPreviewEnabled()
          ? this.mockTeamEvolutionSeries(evolutionMode, true, evolutionValueMode)
          : this.teamEvolutionSeries(evolutionMode, true, evolutionValueMode);
        root.innerHTML = `
          <section class="card team-leaderboard-card family-leaderboard-card">
            <div class="card-title-row leaderboard-compact-title"><h3>${evolutionValueMode === "average" ? "Évolution moyenne · team Famille" : "Évolution points · team Famille"}</h3></div>
            <div class="team-leaderboard-control-stack">${paneControls}${scopeControls}${modeControls}</div>
            ${this.evolutionBlockHtml(series, {
              title: evolutionValueMode === "average" ? "Évolution moyenne · team Famille" : "Évolution points · team Famille",
              description: evolutionValueMode === "average" ? "Moyenne cumulée par match pronostiqué dans chaque team Famille." : "Points cumulés par team dans le classement Famille.",
              mode: evolutionMode,
              attrName,
              emptyText: "Pas encore assez de matchs terminés pour dessiner l’évolution des teams Famille."
            })}
          </section>`;
        this.bindFamilyLeaderboardControls(root);
        this.bindEmbeddedEvolutionControls(root);
        return;
      }

      if (scope === "overall") {
        const rows = this.familyTeamRows(null, teamTab);
        root.innerHTML = `
          <section class="card team-leaderboard-card family-leaderboard-card">
            <div class="card-title-row leaderboard-compact-title"><h3>Famille · par équipe</h3></div>
            <div class="team-leaderboard-control-stack">${paneControls}${scopeControls}${modeControls}</div>
            <div class="team-phase-head"><strong>Général</strong><small>Joueurs Famille + joueurs UIS ayant activé le mode Famille</small></div>
            ${this.teamLeaderboardRowsHtml(rows, { mode: teamTab })}
          </section>`;
        this.bindFamilyLeaderboardControls(root);
        return;
      }

      const groups = this.groupMatchesByPouleRound(this.phaseLeaderboardMatches());
      const activeIndex = this.clampPhaseIndex("familyTeamLeaderboardPhaseIndex", groups);
      const group = groups[activeIndex];
      const matchIds = group ? group.matches.map((match) => match.id) : [];
      const rows = group ? this.familyTeamRows(matchIds, teamTab) : [];
      const finishedCount = group ? group.matches.filter((match) => ["finished", "live"].includes(match.status)).length : 0;
      const liveProjectionCount = group ? this.liveProjectionCountForMatchIds(matchIds, { userIds: this.familyProfileIds() }) : 0;
      const pager = group ? this.phaseNavigatorHtml(groups, activeIndex, "familyTeamLeaderboardPhaseIndex") : "";
      root.innerHTML = `
        <section class="card team-leaderboard-card family-leaderboard-card">
          <div class="card-title-row leaderboard-compact-title"><h3>Famille · par équipe · phase</h3></div>
          <div class="team-leaderboard-control-stack">${paneControls}${scopeControls}${modeControls}</div>
          ${pager}
          ${group ? `<div class="team-phase-head"><strong>${H.escapeHtml(group.key)}</strong><small>${finishedCount}/${group.matches.length} match${group.matches.length > 1 ? "s" : ""} terminé/en direct · ${H.matchDateRangeLabel(group.matches)}</small></div>` : `<p class="muted">Aucune phase à afficher pour le moment.</p>`}
          ${liveProjectionCount ? `<div class="live-ranking-note">${H.icon("info")} Classement Famille par équipe provisoire : ${liveProjectionCount} projection${liveProjectionCount > 1 ? "s" : ""} live incluse${liveProjectionCount > 1 ? "s" : ""}.</div>` : ""}
          ${this.teamLeaderboardRowsHtml(rows, { mode: teamTab })}
          ${pager}
        </section>`;
      this.bindFamilyLeaderboardControls(root);
      this.bindPhaseNavigation("familyTeamLeaderboardPhaseIndex", () => this.renderFamilyLeaderboard());
      return;
    }

    const mode = ["overall", "average", "phase", "evolution_points", "evolution_average"].includes(this.state.familyPlayerLeaderboardMode) ? this.state.familyPlayerLeaderboardMode : "overall";
    this.state.familyPlayerLeaderboardMode = mode;
    const modeControls = `
      <div class="segmented small player-leaderboard-mode leaderboard-view-switch">
        <button class="${mode === "overall" ? "active" : ""}" data-family-player-mode="overall">Général</button>
        <button class="${mode === "average" ? "active" : ""}" data-family-player-mode="average">Moyenne</button>
        <button class="${mode === "phase" ? "active" : ""}" data-family-player-mode="phase">Par phase</button>
        <button class="${mode === "evolution_points" ? "active" : ""}" data-family-player-mode="evolution_points">Évolution points</button>
        <button class="${mode === "evolution_average" ? "active" : ""}" data-family-player-mode="evolution_average">Évolution moyenne</button>
      </div>`;

    if (mode.startsWith("evolution")) {
      const attrName = "data-family-evolution-mode";
      const evolutionMode = this.evolutionDataModeFor(attrName);
      const valueMode = mode === "evolution_average" ? "average" : "points";
      const series = this.graphMockPreviewEnabled() ? this.mockEvolutionSeries(evolutionMode, valueMode) : this.familyEvolutionSeries(evolutionMode, valueMode);
      root.innerHTML = `
        <section class="card player-leaderboard-card family-leaderboard-card">
          <div class="card-title-row leaderboard-compact-title"><div><h3>${valueMode === "average" ? "Famille · évolution moyenne" : "Famille · évolution joueurs"}</h3><p class="muted">Joueurs Famille + joueurs UIS ayant activé le mode Famille.</p></div></div>
          <div class="team-leaderboard-control-stack">${paneControls}${modeControls}</div>
          ${this.evolutionBlockHtml(series, {
            title: valueMode === "average" ? "Évolution moyenne · Famille" : "Évolution général · Famille",
            description: valueMode === "average" ? "Moyenne cumulée : points ÷ matchs pronostiqués." : "Points cumulés des meilleurs joueurs Famille.",
            mode: evolutionMode,
            attrName,
            emptyText: "Pas encore assez de matchs terminés pour dessiner l’évolution Famille."
          })}
        </section>`;
      this.bindFamilyLeaderboardControls(root);
      this.bindEmbeddedEvolutionControls(root);
      return;
    }

    if (mode === "phase") {
      const groups = this.groupMatchesByPouleRound(this.phaseLeaderboardMatches());
      const activeIndex = this.clampPhaseIndex("familyLeaderboardPhaseIndex", groups);
      const group = groups[activeIndex];
      const matchIds = group ? group.matches.map((match) => match.id) : [];
      const rows = group ? this.familyPlayerRows(matchIds, "points") : [];
      const finishedCount = group ? group.matches.filter((match) => ["finished", "live"].includes(match.status)).length : 0;
      const liveProjectionCount = group ? this.liveProjectionCountForMatchIds(matchIds, { userIds: this.familyProfileIds() }) : 0;
      const pager = group ? this.phaseNavigatorHtml(groups, activeIndex, "familyLeaderboardPhaseIndex") : "";
      root.innerHTML = `
        <section class="card player-leaderboard-card family-leaderboard-card">
          <div class="card-title-row leaderboard-compact-title"><h3>Famille · joueurs · phase</h3></div>
          <div class="team-leaderboard-control-stack">${paneControls}${modeControls}</div>
          ${pager}
          ${group ? `<div class="team-phase-head"><strong>${H.escapeHtml(group.key)}</strong><small>${finishedCount}/${group.matches.length} match${group.matches.length > 1 ? "s" : ""} terminé/en direct · ${H.matchDateRangeLabel(group.matches)}</small></div>` : `<p class="muted">Aucune phase à afficher pour le moment.</p>`}
          ${liveProjectionCount ? `<div class="live-ranking-note">${H.icon("info")} Classement Famille joueurs provisoire : ${liveProjectionCount} projection${liveProjectionCount > 1 ? "s" : ""} live incluse${liveProjectionCount > 1 ? "s" : ""}.</div>` : ""}
          ${this.leaderboardRowsHtml(rows, { showRankMovement: false, movementContext: "family" })}
          ${pager}
        </section>`;
      this.bindFamilyLeaderboardControls(root);
      this.bindAchievementReplay(root);
      this.bindPhaseNavigation("familyLeaderboardPhaseIndex", () => this.renderFamilyLeaderboard());
      return;
    }

    const rows = this.familyPlayerRows(null, mode === "average" ? "average" : "points");
    if (mode === "overall") this.observeRankSentinel("family-leaderboard", "family", rows);
    root.innerHTML = `
      <section class="card player-leaderboard-card family-leaderboard-card">
        <div class="card-title-row leaderboard-compact-title">
          <div><h3>Famille · joueurs</h3><p class="muted">Joueurs Famille, invités via coupon + joueurs UIS ayant activé le mode Famille. Hors classement officiel et hors mini-records.</p></div>
        </div>
        <div class="team-leaderboard-control-stack">${paneControls}${modeControls}</div>
        ${this.liveProjectionCountForMatchIds(null, { userIds: this.familyProfileIds() }) ? `<div class="live-ranking-note">${H.icon("info")} Classement Famille joueurs provisoire : projections live incluses.</div>` : ""}
        ${this.leaderboardRowsHtml(rows, { valueMode: mode === "average" ? "average" : "points", movementContext: "family", showRankMovement: mode === "overall" })}
      </section>
    `;
    this.bindFamilyLeaderboardControls(root);
    this.bindAchievementReplay(root);
  },


  mockEvolutionSeries(mode = "day", valueMode = "points") {
    const names = ["Parkaf", "Sol141381", "Mimi du Nid", "Coach Hibou", "La Casserole", "Madame Exact", "Le Renard", "Grand Duc"];
    const teams = ["Les SNA", "Les Rapaces", "Les Chouettes", "Les Aiglons"];
    const colors = ["#facc15", "#38bdf8", "#a78bfa", "#fb7185", "#34d399", "#fb923c", "#f472b6", "#c4b5fd"];
    const playerIds = names.map((_, index) => `mock-player-${index + 1}`);
    const base = new Date();
    base.setHours(20, 0, 0, 0);

    const increments = [
      [5, 3, 0, 1, 2, 5, 0, 3],
      [3, 5, 2, 0, 0, 3, 1, 5],
      [1, 0, 5, 3, 0, 2, 5, 0],
      [5, 1, 3, 5, 2, 0, 1, 3],
      [0, 5, 3, 1, 5, 2, 0, 1],
      [3, 2, 1, 5, 0, 5, 3, 0]
    ];

    const cumulative = new Map(playerIds.map((id) => [id, 0]));
    const snapshots = increments.map((row, index) => {
      const d = new Date(base);
      d.setDate(base.getDate() + index);
      const label = mode === "match" ? `Match test ${index + 1}` : `Jour test ${index + 1}`;

      row.forEach((points, playerIndex) => {
        const id = playerIds[playerIndex];
        cumulative.set(id, (cumulative.get(id) || 0) + points);
      });

      return {
        key: `mock-${index + 1}`,
        label,
        totals: new Map(playerIds.map((id) => [id, cumulative.get(id) || 0]))
      };
    });

    const mockProfiles = new Map(playerIds.map((id, index) => [id, {
      id,
      user_id: id,
      pseudo: names[index],
      office_team_name: teams[index % teams.length],
      office_team_color: colors[index % colors.length],
      badge_color: colors[index % colors.length],
      avatar_key: `owl-${String((index % 18) + 1).padStart(2, "0")}`,
      badge_shape: "rounded"
    }]));

    if (valueMode === "average") {
      snapshots.forEach((snapshot, idx) => {
        snapshot.totals = new Map(playerIds.map((id) => [id, Math.round(((snapshot.totals.get(id) || 0) / (idx + 1)) * 100) / 100]));
      });
    }
    const totalsByUser = new Map(playerIds.map((id) => [id, snapshots[snapshots.length - 1].totals.get(id) || 0]));
    return { playerIds, snapshots, totalsByUser, mockProfiles, isMock: true, valueMode };
  },


  async refreshEvolutionOwner(attrName = "data-evolution-mode") {
    const key = this.evolutionFocusKey(attrName);
    if (key === "player-evolution") return this.renderPlayerLeaderboard();
    if (key === "team-evolution") return this.renderTeamLeaderboard();
    if (key === "family-evolution") return this.renderFamilyLeaderboard();
    if (key === "family-team-evolution") return this.renderFamilyLeaderboard();
    return this.renderLeaderboardEvolution();
  },

  bindEmbeddedEvolutionControls(root = document) {
    H.$$('[data-evolution-zoom]', root).forEach((btn) => {
      if (btn.dataset.evolutionZoomBound === "true") return;
      btn.dataset.evolutionZoomBound = "true";
      btn.addEventListener("click", async () => {
        this.setEvolutionZoom(btn.dataset.evolutionZoomTarget || "data-evolution-mode", Number(btn.dataset.evolutionZoom || 0));
        await this.refreshEvolutionOwner(btn.dataset.evolutionZoomTarget || "data-evolution-mode");
      });
    });

    H.$$('[data-evolution-pan]', root).forEach((btn) => {
      if (btn.dataset.evolutionPanBound === "true") return;
      btn.dataset.evolutionPanBound = "true";
      btn.addEventListener("click", async () => {
        const target = btn.dataset.evolutionPanTarget || "data-evolution-mode";
        const start = Number(btn.dataset.evolutionPanStart || 0);
        const max = Number(btn.dataset.evolutionPanMax || 0);
        const delta = Number(btn.dataset.evolutionPan || 0);
        this.setEvolutionWindowOffset(target, Math.min(Math.max(0, max), Math.max(0, start + delta)));
        await this.refreshEvolutionOwner(target);
      });
    });

    H.$$('[data-evolution-focus]', root).forEach((btn) => {
      if (btn.dataset.evolutionFocusBound === "true") return;
      btn.dataset.evolutionFocusBound = "true";
      btn.addEventListener("click", async () => {
        const target = btn.dataset.evolutionFocusTarget || "data-evolution-mode";
        const next = String(this.evolutionFocusFor(target)) === String(btn.dataset.evolutionFocus) ? "" : btn.dataset.evolutionFocus;
        this.setEvolutionFocus(target, next);
        await this.refreshEvolutionOwner(target);
      });
    });

    H.$$('[data-player-evolution-mode]', root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.leaderboardEvolutionMode = btn.dataset.playerEvolutionMode;
        await this.renderPlayerLeaderboard();
      });
    });

    H.$$('[data-team-evolution-mode]', root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.teamLeaderboardEvolutionMode = btn.dataset.teamEvolutionMode;
        await this.renderTeamLeaderboard();
      });
    });

    H.$$('[data-family-evolution-mode]', root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.familyLeaderboardEvolutionMode = btn.dataset.familyEvolutionMode;
        await this.renderFamilyLeaderboard();
      });
    });

    H.$$('[data-family-team-evolution-mode]', root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        this.state.familyTeamLeaderboardEvolutionMode = btn.dataset.familyTeamEvolutionMode;
        await this.renderFamilyLeaderboard();
      });
    });
  },


  evolutionModeControls(mode, attrName = "data-evolution-mode") {
    const level = this.evolutionZoomLevelFor(attrName);
    const meta = this.evolutionZoomMeta(level);
    return `
      <div class="evolution-level-pill" title="${H.escapeHtml(meta.detail)}">
        <strong>${H.escapeHtml(meta.short)}</strong>
        <small>${level + 1}/4</small>
      </div>
    `;
  },

  evolutionBlockHtml(series, {
    title = "Évolution du nid",
    description = "Courbe des meilleurs joueurs.",
    mode = "day",
    attrName = "data-evolution-mode",
    emptyText = "Pas assez de matchs terminés pour dessiner l’évolution.",
    compact = true
  } = {}) {
    const latestSnapshot = series.snapshots[series.snapshots.length - 1];
    const windowInfo = this.evolutionVisibleWindow(series, attrName);
    const level = this.evolutionZoomLevelFor(attrName);
    const meta = this.evolutionZoomMeta(level);
    const panStep = Math.max(1, Math.floor((windowInfo.visibleCount || 1) * 0.7));
    return `
      <section class="card evolution-card embedded-evolution-card ${compact ? "compact-evolution-card" : ""}" data-evolution-level="${level}">
        <div class="card-title-row">
          <div>
            <h3>${H.escapeHtml(title)}</h3>
            <p class="muted">${H.escapeHtml(description)} <strong class="evolution-level-inline">${H.escapeHtml(meta.label)}</strong></p>
            ${series.isMock ? `<p class="graph-preview-note">${H.icon("info")} Maquette graph active : données fictives, aucun impact sur Supabase.</p>` : ""}
            ${!series.isMock && this.graphPreviewTestMatchesEnabled() ? `<p class="graph-preview-note">${H.icon("info")} Prévisualisation admin active : les matchs test sont inclus dans ce graph.</p>` : ""}
          </div>
          <div class="evolution-toolbar">
            ${this.evolutionModeControls(mode, attrName)}
            <div class="evolution-zoom-controls evolution-step-controls" aria-label="Zoom du graphique">
              <button type="button" data-evolution-zoom="-1" data-evolution-zoom-target="${H.escapeHtml(attrName)}" aria-label="Niveau précédent">−</button>
              <span>${H.escapeHtml(meta.short)}</span>
              <button type="button" data-evolution-zoom="1" data-evolution-zoom-target="${H.escapeHtml(attrName)}" aria-label="Niveau suivant">+</button>
            </div>
            <div class="evolution-pan-controls" aria-label="Naviguer dans la période affichée">
              <button type="button" data-evolution-pan="-${panStep}" data-evolution-pan-target="${H.escapeHtml(attrName)}" data-evolution-pan-start="${windowInfo.start}" data-evolution-pan-max="${windowInfo.maxStart}" ${windowInfo.start <= 0 ? "disabled" : ""} aria-label="Voir plus ancien">←</button>
              <span>${windowInfo.snapshots.length ? `${windowInfo.start + 1}-${windowInfo.end}/${series.snapshots.length}` : "0/0"}</span>
              <button type="button" data-evolution-pan="${panStep}" data-evolution-pan-target="${H.escapeHtml(attrName)}" data-evolution-pan-start="${windowInfo.start}" data-evolution-pan-max="${windowInfo.maxStart}" ${windowInfo.start >= windowInfo.maxStart ? "disabled" : ""} aria-label="Voir plus récent">→</button>
            </div>
          </div>
        </div>
        ${series.playerIds.length ? `
          <div class="evolution-layout">
            <div class="evolution-chart-wrap">${this.evolutionChartSvg(series, { zoom: level, focusId: this.evolutionFocusFor(attrName), attrName })}${this.evolutionMatchDetailsHtml(series, attrName)}</div>
            <div class="evolution-legend">
              ${series.playerIds.map((userId, index) => {
                const source = series.mockProfiles?.get(userId) || this.state.playerScoreRows.find((row) => row.user_id === userId || row.id === userId);
                const profile = this.profileForUser(userId, source);
                const color = this.evolutionColor(index);
                const total = latestSnapshot?.totals.get(userId) || 0;
                return `
                  <button type="button" class="evolution-player ${String(this.evolutionFocusFor(attrName)) === String(userId) ? "active" : ""}" style="--player-color:${color}" data-evolution-focus="${H.escapeHtml(String(userId))}" data-evolution-focus-target="${H.escapeHtml(attrName)}">
                    ${H.profileBadgeHtml(profile, "profile-badge mini")}
                    <div><strong>${H.escapeHtml(profile.pseudo)}</strong><small>${H.escapeHtml(profile.office_team_name || "Sans team")}</small></div>
                    <span>${Number(total || 0).toFixed(series.valueMode === "average" ? 2 : 0)}${series.valueMode === "average" ? " pts/match" : " pts"}</span>
                  </button>`;
              }).join("")}
            </div>
          </div>
        ` : `<p class="muted">${H.escapeHtml(emptyText)}</p>`}
      </section>
    `;
  },

  teamEvolutionSeries(mode = "day", familyOnly = false, valueMode = "points") {
    const allowedFamilyIds = familyOnly ? this.familyProfileIds() : null;
    const eligibleProfiles = (familyOnly ? this.familyProfiles(this.state.publicProfiles) : this.officialProfiles(this.state.publicProfiles))
      .filter((profile) => profile.office_team_id)
      .filter((profile) => !familyOnly || allowedFamilyIds.has(String(profile.id || profile.user_id)));

    const teamSizes = new Map();
    eligibleProfiles.forEach((profile) => {
      const teamId = profile.office_team_id || profile.office_team_name || "sans-team";
      teamSizes.set(teamId, (teamSizes.get(teamId) || 0) + 1);
    });

    const rows = this.state.visiblePredictions
      .map((prediction) => ({ prediction, match: this.state.matches.find((m) => m.id === prediction.match_id), profile: this.profileForUser(prediction.user_id) }))
      .filter(({ prediction, match, profile }) =>
        match?.status === "finished"
        && !this.isLiveDemoMatch(match)
        && this.graphEvolutionCanUseMatch(match)
        && prediction.points_total !== null
        && prediction.points_total !== undefined
        && profile.office_team_name
        && (familyOnly ? allowedFamilyIds.has(String(prediction.user_id)) : !this.isFamily(profile))
      )
      .sort((a, b) => new Date(a.match.kickoff_at || 0) - new Date(b.match.kickoff_at || 0));

    const periodKey = (date, match = null) => {
      if (mode === "match") return `${match?.kickoff_at || date || ""}`;
      const d = new Date(date);
      return d.toISOString().slice(0, 10);
    };
    const periodLabel = (key, match = null) => mode === "match" ? this.evolutionMatchSnapshotLabel(match) : H.formatShortDate(key);
    const periodMeta = new Map();

    const periods = [...new Set(rows.map(({ match }) => {
      const key = periodKey(match.kickoff_at, match);
      this.registerEvolutionPeriodMeta(periodMeta, key, match);
      return key;
    }))].sort();
    const teamMeta = new Map();
    const totalsByTeamRaw = new Map();
    const countsByTeamRaw = new Map();
    const pointsByPeriod = new Map(periods.map((key) => [key, new Map()]));
    const countsByPeriod = new Map(periods.map((key) => [key, new Map()]));

    rows.forEach(({ prediction, match, profile }) => {
      const teamId = profile.office_team_id || profile.office_team_name || "sans-team";
      teamMeta.set(teamId, {
        id: teamId,
        user_id: teamId,
        pseudo: profile.office_team_name || "Sans team",
        office_team_name: familyOnly ? "Team Famille" : "Team bureau",
        office_team_color: profile.office_team_color || profile.badge_color || "#facc15",
        badge_color: profile.office_team_color || profile.badge_color || "#facc15",
        avatar_key: "owl-01",
        badge_shape: "rounded"
      });
      if (!teamSizes.has(teamId)) teamSizes.set(teamId, 1);
      const key = periodKey(match.kickoff_at, match);
      const map = pointsByPeriod.get(key);
      const countMap = countsByPeriod.get(key);
      const points = Number(prediction.points_total || 0);
      map.set(teamId, (map.get(teamId) || 0) + points);
      countMap.set(teamId, (countMap.get(teamId) || 0) + 1);
      totalsByTeamRaw.set(teamId, (totalsByTeamRaw.get(teamId) || 0) + points);
      countsByTeamRaw.set(teamId, (countsByTeamRaw.get(teamId) || 0) + 1);
    });

    const valueForTeam = (teamId, rawValue, count = countsByTeamRaw.get(teamId) || 0) => valueMode === "average"
      ? Math.round((rawValue / Math.max(1, count)) * 100) / 100
      : rawValue;

    const playerIds = [...totalsByTeamRaw.keys()]
      .sort((a, b) => valueForTeam(b, totalsByTeamRaw.get(b) || 0) - valueForTeam(a, totalsByTeamRaw.get(a) || 0))
      .slice(0, 8);

    const cumulative = new Map(playerIds.map((id) => [id, 0]));
    const cumulativeCounts = new Map(playerIds.map((id) => [id, 0]));
    const snapshots = periods.map((key) => {
      const periodPoints = pointsByPeriod.get(key) || new Map();
      const periodCounts = countsByPeriod.get(key) || new Map();
      playerIds.forEach((id) => {
        cumulative.set(id, (cumulative.get(id) || 0) + (periodPoints.get(id) || 0));
        cumulativeCounts.set(id, (cumulativeCounts.get(id) || 0) + (periodCounts.get(id) || 0));
      });
      return { key, label: periodMeta.get(key)?.label || periodLabel(key, periodMeta.get(key)?.match), matchMeta: periodMeta.get(key), totals: new Map(playerIds.map((id) => [id, valueForTeam(id, cumulative.get(id) || 0, cumulativeCounts.get(id) || 0)])) };
    });

    const totalsByUser = new Map(playerIds.map((id) => [id, snapshots[snapshots.length - 1]?.totals.get(id) || 0]));
    return { playerIds, snapshots, totalsByUser, mockProfiles: teamMeta, isTeamSeries: true, valueMode };
  },


  mockTeamEvolutionSeries(mode = "day", familyOnly = false, valueMode = "points") {
    const names = familyOnly ? ["Famille SNA", "Famille Rapaces", "Famille Chouettes", "Famille Aiglons"] : ["Les SNA", "Les Rapaces", "Les Chouettes", "Les Aiglons"];
    const colors = ["#facc15", "#38bdf8", "#a78bfa", "#fb7185"];
    const teamIds = names.map((_, index) => `mock-team-${familyOnly ? "family-" : ""}${index + 1}`);
    const base = new Date();
    base.setHours(20, 0, 0, 0);
    const increments = [
      [8, 5, 3, 1],
      [4, 9, 2, 5],
      [6, 2, 8, 3],
      [3, 7, 4, 9],
      [9, 4, 6, 2],
      [5, 8, 3, 6]
    ];

    const cumulative = new Map(teamIds.map((id) => [id, 0]));
    const snapshots = increments.map((row, index) => {
      const label = mode === "match" ? `Match test ${index + 1}` : `Jour test ${index + 1}`;
      row.forEach((points, teamIndex) => {
        const id = teamIds[teamIndex];
        cumulative.set(id, (cumulative.get(id) || 0) + points);
      });
      return {
        key: `mock-team-${index + 1}`,
        label,
        totals: new Map(teamIds.map((id) => [id, cumulative.get(id) || 0]))
      };
    });

    const mockProfiles = new Map(teamIds.map((id, index) => [id, {
      id,
      user_id: id,
      pseudo: names[index],
      office_team_name: familyOnly ? "Team Famille" : "Team bureau",
      office_team_color: colors[index % colors.length],
      badge_color: colors[index % colors.length],
      avatar_key: "owl-01",
      badge_shape: "rounded"
    }]));

    const totalsByUser = new Map(teamIds.map((id) => [id, snapshots[snapshots.length - 1].totals.get(id) || 0]));
    return { playerIds: teamIds, snapshots, totalsByUser, mockProfiles, isMock: true, isTeamSeries: true, valueMode };
  },

  async renderLeaderboardEvolution() {
    await this.loadPlayerScoreRows();
    const root = H.$("#leaderboardContent");
    const attrName = "data-evolution-mode";
    const mode = this.evolutionDataModeFor(attrName);
    const useMockGraph = this.graphMockPreviewEnabled();
    const series = useMockGraph ? this.mockEvolutionSeries(mode, "points") : this.playerEvolutionSeries(mode, { valueMode: "points" });
    root.innerHTML = this.evolutionBlockHtml(series, {
      title: "Évolution du nid",
      description: "Les courbes montrent les points cumulés des meilleurs joueurs au fil du tournoi.",
      mode,
      attrName,
      emptyText: "Pas assez de matchs terminés pour dessiner l’évolution du nid.",
      compact: false
    });
    this.bindEmbeddedEvolutionControls(root);
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

  teamPlayers(teamId = null, options = {}) {
    const source = options.officialOnly ? this.officialProfiles(this.state.publicProfiles) : this.visiblePublicProfiles(this.state.publicProfiles);
    return source
      .filter((player) => teamId ? player.office_team_id === teamId : !player.office_team_id)
      .sort((a, b) => String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr"));
  },

  scoreRowForPlayer(userId) {
    return this.state.playerScoreRows.find((row) => row.user_id === userId) || null;
  },

  winnerInfoForPlayer(userId) {
    const publicWinner = this.state.winnerPredictions.find((row) => String(row.user_id) === String(userId));
    if (publicWinner) return publicWinner;

    if (userId === this.state.session.user.id && this.state.winnerPrediction?.predicted_team_id) {
      const team = this.state.footballTeams.find((item) => item.id === this.state.winnerPrediction.predicted_team_id);
      return {
        user_id: userId,
        predicted_team_id: team?.id || this.state.winnerPrediction.predicted_team_id,
        predicted_team_name: team?.name || "Champion choisi",
        predicted_team_short_name: team?.short_name,
        predicted_team_country_code: team?.country_code,
        predicted_team_flag_url: team?.flag_url,
        points_total: this.state.winnerPrediction.points_total || 0
      };
    }

    return null;
  },

  secondWinnerInfoForPlayer(playerId) {
    const publicSecond = this.state.secondWinnerPredictions.find((row) => String(row.user_id) === String(playerId));
    if (publicSecond) return publicSecond;

    if (String(playerId) === String(this.state.session.user.id) && this.state.secondWinnerPrediction?.predicted_team_id) {
      const team = this.state.footballTeams.find((item) => item.id === this.state.secondWinnerPrediction.predicted_team_id);
      return {
        user_id: playerId,
        predicted_team_id: team?.id || this.state.secondWinnerPrediction.predicted_team_id,
        predicted_team_name: team?.name || "2e champion choisi",
        predicted_team_short_name: team?.short_name,
        predicted_team_country_code: team?.country_code,
        predicted_team_flag_url: team?.flag_url,
        points_total: this.state.secondWinnerPrediction.points_total || 0
      };
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
    const secondWinner = this.secondWinnerInfoForPlayer(playerId);

    const pickCard = (pick, label, emptyLabel) => {
      if (!pick) {
        return `<div class="player-winner-pick muted-box"><strong>${emptyLabel}</strong><small>Pas encore visible ou pas encore choisi.</small></div>`;
      }
      const flag = H.flagImgHtml({
        flagUrl: pick.predicted_team_flag_url,
        countryCode: pick.predicted_team_country_code,
        shortName: pick.predicted_team_short_name,
        name: pick.predicted_team_name,
        className: "team-flag-img champion-option-flag"
      });
      return `
        <div class="player-winner-pick picked">
          ${flag}
          <div>
            <strong>${H.escapeHtml(pick.predicted_team_name || "Équipe choisie")}</strong>
            <small>${label}${pick.points_total ? ` · +${pick.points_total} pts` : ""}</small>
          </div>
        </div>
      `;
    };

    if (winner || secondWinner) {
      return `
        <div class="player-winner-picks-duo">
          ${pickCard(winner, "Champion initial", "Champion initial non visible")}
          ${pickCard(secondWinner, "2e champion bonus", "2e champion non choisi")}
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
        <strong>Choix champions non visibles</strong>
        <small>Soit le joueur ne les a pas encore choisis, soit les choix restent masqués.</small>
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
          <button class="modal-x-btn team-player-modal-x" id="closeTeamPlayerModalBtn" type="button" aria-label="Fermer la fiche joueur">×</button>
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
                ${!isMe ? `<span class="team-player-mp-dot" data-direct-message-user-id="${H.escapeHtml(player.id)}" title="Envoyer un MP">MP</span>` : ""}
              </button>
            `;
          }).join("") : `<p class="muted team-empty-message">Aucun joueur dans cette team pour l’instant.</p>`}
        </div>
      </article>
    `;
  },

  normalizeChatScope(scope = "global") {
    const allowed = this.availableChatScopes().map((item) => item.key);
    return allowed.includes(scope) ? scope : allowed[0] || "global";
  },

  chatScopeNeedsTeam(scope = "global") {
    return scope === "team" || scope === "family_team";
  },

  isFamilyChatScope(scope = "global") {
    return scope === "family_global" || scope === "family_team";
  },

  availableChatScopes() {
    const profile = this.state.profile || {};
    const hasTeam = Boolean(profile.office_team_id);
    const scopes = [];
    if (!this.isFamily(profile)) {
      scopes.push({ key: "global", label: "Général", short: "Général", hint: "Tous les joueurs UIS" });
      if (hasTeam) scopes.push({ key: "team", label: "Ma team", short: "Team", hint: "Ta team bureau" });
    }
    scopes.push({ key: "private", label: "Messages privés", short: "MP", hint: "Tes messages privés du Nid" });
    if (this.canSeeFamily()) {
      scopes.push({ key: "family_global", label: "Famille", short: "Famille", hint: "Famille + UIS ayant activé le mode" });
      if (hasTeam) scopes.push({ key: "family_team", label: "Famille team", short: "Team famille", hint: "Ta team dans le mode Famille" });
    }
    return scopes.length ? scopes : [{ key: "private", label: "Messages privés", short: "MP", hint: "Tes messages privés du Nid" }];
  },

  chatScopeLabel(scope = "global") {
    return this.availableChatScopes().find((item) => item.key === scope)?.label || {
      global: "Général",
      team: "Ma team",
      family_global: "Famille",
      family_team: "Famille team",
      private: "Messages privés"
    }[scope] || "Messages";
  },

  chatScopeTabHtml(scopeKey, label, { small = false } = {}) {
    const scope = this.availableChatScopes().find((item) => item.key === scopeKey);
    if (!scope) return "";
    const active = this.state.teamChatScope === scopeKey;
    const unread = this.state.unreadTeamChatScopes?.has(scopeKey);
    return `
      <button type="button" class="chat-scope-tab ${small ? "small" : ""} ${active ? "active" : ""} ${unread ? "has-scope-unread" : ""}" data-chat-scope="${H.escapeHtml(scopeKey)}">
        <span>${H.escapeHtml(label || scope.short || scope.label)}</span>
        ${unread ? `<b class="chat-scope-dot" aria-hidden="true"></b>` : ""}
      </button>
    `;
  },

  chatScopeTabsHtml() {
    const scopes = this.availableChatScopes();
    const has = (key) => scopes.some((scope) => scope.key === key);
    const familyTabs = [
      has("family_global") ? this.chatScopeTabHtml("family_global", "Général famille", { small: true }) : "",
      has("family_team") ? this.chatScopeTabHtml("family_team", "Team famille", { small: true }) : ""
    ].filter(Boolean).join("");

    return `
      <nav class="chat-scope-tabs-v1311" aria-label="Choisir le salon du Nid">
        ${has("global") ? this.chatScopeTabHtml("global", "Général") : ""}
        ${has("team") ? this.chatScopeTabHtml("team", "Team") : ""}
        ${familyTabs ? `
          <div class="chat-scope-family-group ${this.isFamilyChatScope(this.state.teamChatScope) ? "active" : ""}">
            <span>Famille</span>
            <div>${familyTabs}</div>
          </div>
        ` : ""}
        ${has("private") ? this.chatScopeTabHtml("private", "MP") : ""}
      </nav>
    `;
  },


  reactionMessageBody(key) {
    return `::owl-reaction:${key}::`;
  },

  reactionMessageKey(body = "") {
    const match = String(body || "").trim().match(/^::owl-reaction:([a-z0-9_-]+)::$/i);
    return match ? match[1] : null;
  },

  chatMessageBodyHtml(message) {
    const reactionKey = this.reactionMessageKey(message?.body);
    const reaction = reactionKey ? this.reactionByKey(reactionKey) : null;
    if (reaction) {
      return `<p class="chat-sticker-message"><img src="${H.escapeHtml(reaction.file)}" alt="${H.escapeHtml(reaction.label)}" loading="lazy"><span>${H.escapeHtml(reaction.label)}</span></p>`;
    }
    return `<p>${H.escapeHtml(message.body)}</p>`;
  },

  quickOwlMessageButtonsHtml({ recipientId = "", compact = false } = {}) {
    return `
      <div class="quick-owl-message-row ${compact ? "compact" : ""}" data-quick-owl-row>
        <span>Envoyer juste un hibou :</span>
        ${(this.state.chatReactions || []).map((reaction) => `
          <button type="button" class="quick-owl-message-btn" data-quick-owl-key="${H.escapeHtml(reaction.key)}" ${recipientId ? `data-quick-owl-recipient-id="${H.escapeHtml(recipientId)}"` : ""} title="${H.escapeHtml(reaction.label)}">
            <img src="${H.escapeHtml(reaction.file)}" alt="${H.escapeHtml(reaction.label)}" loading="lazy">
          </button>
        `).join("")}
      </div>
    `;
  },

  async sendQuickOwlMessage(reactionKey, recipientId = null) {
    const reaction = this.reactionByKey(reactionKey);
    if (!reaction) return;

    const scope = recipientId ? "private" : this.normalizeChatScope(this.state.teamChatScope || "global");
    const targetRecipientId = recipientId || (scope === "private" ? this.state.activePrivateThreadId : null);
    if (scope === "private" && !targetRecipientId) {
      H.toast("Choisis un destinataire MP.", "error");
      return;
    }

    const officeTeamId = this.chatScopeNeedsTeam(scope) ? this.state.profile?.office_team_id : null;
    if (this.chatScopeNeedsTeam(scope) && !officeTeamId) {
      H.toast("Tu dois avoir une team pour écrire dans ce salon.", "error");
      return;
    }

    const { error } = await window.sb
      .from("team_chat_messages")
      .insert({
        user_id: this.state.session.user.id,
        scope,
        office_team_id: officeTeamId,
        recipient_id: targetRecipientId,
        body: this.reactionMessageBody(reaction.key)
      });

    if (error) {
      H.toast(error.message || "Impossible d’envoyer le hibou.", "error");
      return;
    }

    H.toast("Hibou envoyé", "success");
    if (scope === "private") {
      this.state.teamChatScope = "private";
      this.state.activePrivateThreadId = targetRecipientId;
      await this.renderTeamsPage();
      return;
    }

    await this.loadTeamChatMessages();
    const list = H.$("#teamChatList");
    if (list) {
      list.innerHTML = this.state.teamChatMessages.map((message) => this.chatMessageHtml(message)).join("") || `<p class="muted empty-chat">Aucun message ici pour l’instant. Ouvre le bal 🦉</p>`;
      this.bindChatMessageActions();
      list.scrollTop = list.scrollHeight;
    }
  },

  async openPrivateThread(userId, { focusInput = true } = {}) {
    if (!userId || String(userId) === String(this.state.session?.user?.id)) return;
    this.state.teamChatScope = "private";
    this.state.activePrivateThreadId = userId;
    this.state.teamChatLimit = Math.max(this.state.teamChatLimit, 240);
    if (this.state.currentView !== "teams") {
      await this.loadView("teams");
    } else {
      await this.renderTeamsPage();
    }
    if (focusInput) {
      setTimeout(() => H.$(`[data-private-thread-user-id="${CSS.escape(String(userId))}"] input[name="body"]`)?.focus(), 80);
    }
  },

  reactionByKey(key) {
    return (this.state.chatReactions || []).find((reaction) => reaction.key === key);
  },

  parseReactionCounts(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try { return JSON.parse(raw) || []; } catch (error) { return []; }
    }
    return [];
  },

  chatReactionCounts(message) {
    const counts = this.parseReactionCounts(message?.reaction_counts);
    const countsByKey = new Map(counts.map((row) => [row.reaction_key, Number(row.count || row.reaction_count || 0)]));
    return (this.state.chatReactions || [])
      .map((reaction) => ({ ...reaction, count: countsByKey.get(reaction.key) || 0 }))
      .filter((reaction) => reaction.count > 0);
  },

  reactionSummaryHtml(message) {
    const reactions = this.chatReactionCounts(message);
    if (!reactions.length) return "";
    return `
      <div class="chat-reaction-summary" data-message-id="${H.escapeHtml(message.id)}" aria-label="Réactions au message">
        ${reactions.map((reaction) => `
          <button class="chat-reaction-pill ${message.my_reaction === reaction.key ? "active" : ""}" type="button" data-reaction-detail-message-id="${H.escapeHtml(message.id)}" data-reaction-key="${H.escapeHtml(reaction.key)}" title="Voir qui a réagi avec ${H.escapeHtml(reaction.label)}">
            <span>${Number(reaction.count || 0)}</span>
            <img src="${H.escapeHtml(reaction.file)}" alt="${H.escapeHtml(reaction.label)}" loading="lazy">
          </button>
        `).join("")}
      </div>
    `;
  },

  closeChatReactionPicker() {
    H.$("#chatReactionPicker")?.remove();
  },


  openDirectMessageModal(userId, pseudo = "ce joueur") {
    if (!userId || userId === this.state.session?.user?.id) return;
    H.$("#directMessageModal")?.remove();

    const modal = document.createElement("div");
    modal.id = "directMessageModal";
    modal.className = "modal-backdrop direct-message-modal";
    modal.innerHTML = `
      <div class="modal-card direct-message-card" role="dialog" aria-modal="true" aria-labelledby="directMessageTitle">
        <button class="modal-x-btn" id="closeDirectMessageBtn" type="button" aria-label="Fermer">×</button>
        <p class="eyebrow">${H.icon("messages")} MP du Nid</p>
        <h2 id="directMessageTitle">Envoyer un hibou discret à ${H.escapeHtml(pseudo)}</h2>
        <p class="muted">Un message privé visible uniquement par vous deux. Le hibou promet de ne pas crier dans le salon général.</p>
        <form id="directMessageForm" class="direct-message-form">
          <textarea name="body" maxlength="600" rows="4" placeholder="Ton MP..." required></textarea>
          <button class="primary-btn" type="submit">Envoyer le hibou 🦉</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    H.$("#closeDirectMessageBtn", modal)?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    H.$("#directMessageForm", modal)?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = String(new FormData(event.currentTarget).get("body") || "").trim();
      if (!body) return;

      const { error } = await window.sb
        .from("team_chat_messages")
        .insert({
          user_id: this.state.session.user.id,
          recipient_id: userId,
          scope: "private",
          office_team_id: null,
          body
        });

      if (error) {
        H.toast(error.message || "Impossible d’envoyer le MP.", "error");
        return;
      }

      close();
      H.toast("MP envoyé par hibou discret", "success");
      this.state.teamChatScope = "private";
      this.state.teamChatLimit = Math.max(this.state.teamChatLimit, 10);
      if (this.state.currentView === "teams") await this.renderTeamsPage();
    });

    H.$("textarea", modal)?.focus();
  },

  openChatReactionPicker(messageId) {
    if (!messageId) return;
    const message = this.state.teamChatMessages.find((item) => String(item.id) === String(messageId));
    if (!message) return;

    this.closeChatReactionPicker();
    const modal = document.createElement("div");
    modal.id = "chatReactionPicker";
    modal.className = "chat-reaction-picker-backdrop";
    modal.innerHTML = `
      <div class="chat-reaction-picker-panel" role="dialog" aria-modal="true" aria-label="Choisir une réaction">
        <div class="chat-reaction-picker-head">
          <strong>Réagir au message</strong>
          <button class="chat-reaction-picker-close" type="button" aria-label="Fermer">×</button>
        </div>
        ${message.user_id !== this.state.session.user.id ? `<button class="chat-private-nudge" type="button" data-picker-private-user-id="${H.escapeHtml(message.user_id)}">🦉 Envoyer un MP de hibou discret</button>` : ""}
        <div class="chat-reaction-picker-grid">
          ${(this.state.chatReactions || []).map((reaction) => `
            <button class="chat-reaction-choice ${message.my_reaction === reaction.key ? "active" : ""}" type="button" data-picker-react-message-id="${H.escapeHtml(message.id)}" data-reaction-key="${H.escapeHtml(reaction.key)}" title="${H.escapeHtml(reaction.label)}">
              <img src="${H.escapeHtml(reaction.file)}" alt="${H.escapeHtml(reaction.label)}" loading="lazy">
              <span>${H.escapeHtml(reaction.label)}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const close = () => this.closeChatReactionPicker();
    H.$(".chat-reaction-picker-close", modal)?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    H.$$('[data-picker-private-user-id]', modal).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        close();
        this.openPrivateThread(button.dataset.pickerPrivateUserId);
      });
    });
    H.$$('[data-picker-react-message-id]', modal).forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        await this.toggleChatReaction(button.dataset.pickerReactMessageId, button.dataset.reactionKey);
        close();
      });
    });
  },

  async fetchChatReactionDetails(messageId) {
    if (!messageId) return [];

    const { data, error } = await window.sb.rpc("get_team_chat_reaction_details", {
      p_message_id: messageId
    });

    if (!error) return data || [];

    console.warn("Détail des réactions indisponible via RPC, fallback local", error);
    const { data: fallback, error: fallbackError } = await window.sb
      .from("team_chat_reactions")
      .select("reaction_key,user_id,created_at")
      .eq("message_id", messageId)
      .order("created_at", { ascending: true });

    if (fallbackError) throw fallbackError;

    return (fallback || [])
      .filter((row) => !(this.state.blockedUserIds || new Set()).has(row.user_id))
      .map((row) => {
        const player = this.state.publicProfiles.find((profile) => String(profile.id) === String(row.user_id)) || {};
        return {
          ...row,
          pseudo: player.pseudo || "Joueur",
          avatar_key: player.avatar_key || "owl-01",
          badge_shape: player.badge_shape || "rounded",
          badge_color: player.badge_color || player.office_team_color || "#facc15",
          office_team_id: player.office_team_id || null,
          office_team_name: player.office_team_name || "Sans team",
          office_team_slug: player.office_team_slug || null,
          office_team_color: player.office_team_color || player.badge_color || "#facc15"
        };
      });
  },

  reactionDetailGroupHtml(reaction, rows = []) {
    if (!rows.length) return "";
    return `
      <section class="chat-reaction-detail-group">
        <h3>
          <img src="${H.escapeHtml(reaction.file)}" alt="${H.escapeHtml(reaction.label)}" loading="lazy">
          <span>${H.escapeHtml(reaction.label)}</span>
          <b>${rows.length}</b>
        </h3>
        <div class="chat-reaction-detail-users">
          ${rows.map((row) => {
            const profile = this.playerPublicProfile({
              id: row.user_id,
              pseudo: row.pseudo || "Joueur",
              office_team_id: row.office_team_id,
              office_team_name: row.office_team_name,
              office_team_slug: row.office_team_slug,
              office_team_color: row.office_team_color,
              avatar_key: row.avatar_key || "owl-01",
              badge_shape: row.badge_shape || "rounded",
              badge_color: row.badge_color || row.office_team_color || "#facc15"
            });
            return `
              <article class="chat-reaction-detail-user">
                ${H.profileBadgeHtml(profile, "profile-badge mini")}
                <div>
                  <strong>${H.escapeHtml(row.pseudo || "Joueur")}</strong>
                  <span>${H.escapeHtml(row.office_team_name || "Sans team")}</span>
                </div>
                <time>${H.formatDateTime(row.created_at)}</time>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  },

  async openChatReactionDetailsModal(messageId, preferredReactionKey = "") {
    if (!messageId) return;
    H.$("#chatReactionDetailsModal")?.remove();

    const loadingModal = document.createElement("div");
    loadingModal.id = "chatReactionDetailsModal";
    loadingModal.className = "modal-backdrop chat-reaction-details-modal";
    loadingModal.innerHTML = `
      <div class="modal-card chat-reaction-details-card" role="dialog" aria-modal="true" aria-labelledby="chatReactionDetailsTitle">
        <button class="modal-close" type="button" aria-label="Fermer">×</button>
        <p class="eyebrow">Réactions</p>
        <h2 id="chatReactionDetailsTitle">Qui a réagi ?</h2>
        <p class="muted">Chargement des chouettes indiscrètes…</p>
      </div>
    `;
    document.body.appendChild(loadingModal);
    const close = () => loadingModal.remove();
    loadingModal.querySelector(".modal-close")?.addEventListener("click", close);
    loadingModal.addEventListener("click", (event) => { if (event.target === loadingModal) close(); });

    try {
      const details = await this.fetchChatReactionDetails(messageId);
      const orderedReactions = [...(this.state.chatReactions || [])].sort((a, b) => {
        if (a.key === preferredReactionKey) return -1;
        if (b.key === preferredReactionKey) return 1;
        return 0;
      });
      const groupsHtml = orderedReactions.map((reaction) => {
        const rows = details.filter((row) => row.reaction_key === reaction.key);
        return this.reactionDetailGroupHtml(reaction, rows);
      }).join("");

      loadingModal.innerHTML = `
        <div class="modal-card chat-reaction-details-card" role="dialog" aria-modal="true" aria-labelledby="chatReactionDetailsTitle">
          <button class="modal-close" type="button" aria-label="Fermer">×</button>
          <p class="eyebrow">Réactions du nid</p>
          <h2 id="chatReactionDetailsTitle">Qui a fait quoi ?</h2>
          ${details.length ? groupsHtml : `<p class="muted detail-empty">Aucune réaction visible pour le moment.</p>`}
        </div>
      `;
      loadingModal.querySelector(".modal-close")?.addEventListener("click", close);
    } catch (error) {
      console.warn("Impossible de charger le détail des réactions", error);
      loadingModal.innerHTML = `
        <div class="modal-card chat-reaction-details-card" role="dialog" aria-modal="true" aria-labelledby="chatReactionDetailsTitle">
          <button class="modal-close" type="button" aria-label="Fermer">×</button>
          <p class="eyebrow">Réactions</p>
          <h2 id="chatReactionDetailsTitle">Détail indisponible</h2>
          <p class="muted">Le détail des réactions nécessite le patch SQL V1.2.1.</p>
        </div>
      `;
      loadingModal.querySelector(".modal-close")?.addEventListener("click", close);
    }
  },

  stopTeamChatAutoRefresh() {
    if (this.state.teamChatRefreshTimer) {
      window.clearInterval(this.state.teamChatRefreshTimer);
      this.state.teamChatRefreshTimer = null;
    }
  },

  startTeamChatAutoRefresh() {
    this.stopTeamChatAutoRefresh();
    if (this.state.currentView !== "teams") return;
    this.state.teamChatRefreshTimer = window.setInterval(async () => {
      if (this.state.currentView !== "teams") return this.stopTeamChatAutoRefresh();
      const active = document.activeElement;
      const isTyping = active && active.closest && active.closest("#teamChatForm");
      if (isTyping) return;
      await this.loadTeamChatMessages();
      const list = H.$("#teamChatList");
      if (!list) return;
      const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      list.innerHTML = this.state.teamChatMessages.length
        ? this.state.teamChatMessages.map((message) => this.chatMessageHtml(message)).join("")
        : `<p class="muted empty-chat">Aucun message ici pour l’instant. Ouvre le bal 🦉</p>`;
      this.bindChatMessageActions();
      if (nearBottom) list.scrollTop = list.scrollHeight;
      this.markTeamChatAsSeen();
    }, 8000);
  },

  bindChatMessageActions() {
    const root = H.$("#viewRoot");
    if (!root) return;
    H.$$('[data-open-reaction-picker-message-id]', root).forEach((bubble) => {
      if (bubble.dataset.boundReactionPicker === "true") return;
      bubble.dataset.boundReactionPicker = "true";
      bubble.addEventListener("click", (event) => {
        if (event.target.closest("button,a,input,textarea,select,.chat-message-tools,.chat-reaction-summary")) return;
        this.openChatReactionPicker(bubble.dataset.openReactionPickerMessageId);
      });
      bubble.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest("button,a,input,textarea,select")) return;
        event.preventDefault();
        this.openChatReactionPicker(bubble.dataset.openReactionPickerMessageId);
      });
    });
    H.$$('[data-quick-owl-key]', root).forEach((button) => {
      if (button.dataset.boundQuickOwl === "true") return;
      button.dataset.boundQuickOwl = "true";
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        await this.sendQuickOwlMessage(button.dataset.quickOwlKey, button.dataset.quickOwlRecipientId || null);
      });
    });

    H.$$('[data-reaction-detail-message-id]', root).forEach((button) => {
      if (button.dataset.boundReactionDetail === "true") return;
      button.dataset.boundReactionDetail = "true";
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        await this.openChatReactionDetailsModal(button.dataset.reactionDetailMessageId, button.dataset.reactionKey || "");
      });
    });
    H.$$('[data-delete-message-id]', root).forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";
      button.addEventListener("click", async () => {
        if (!confirm("Masquer ce message ?")) return;
        const { error } = await window.sb.rpc("delete_own_or_moderate_chat_message", { p_message_id: button.dataset.deleteMessageId });
        if (error) return H.toast(error.message, "error");
        await this.renderTeamsPage();
      });
    });
    H.$$('[data-block-user-id]', root).forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";
      button.addEventListener("click", async () => {
        const name = button.closest(".team-chat-message")?.querySelector("strong")?.textContent || "ce joueur";
        if (!confirm(`Ne plus voir les messages et réactions de ${name} ? Tu pourras le débloquer depuis ton profil.`)) return;
        const { error } = await window.sb.rpc("block_user", { p_blocked_id: button.dataset.blockUserId });
        if (error) return H.toast(error.message, "error");
        await this.loadBlockedUsers();
        await this.renderTeamsPage();
      });
    });
  },

  async toggleChatReaction(messageId, reactionKey) {
    if (!messageId || !reactionKey) return;
    const { error } = await window.sb.rpc("toggle_team_chat_reaction", {
      p_message_id: messageId,
      p_reaction_key: reactionKey
    });
    if (error) return H.toast(error.message, "error");
    await this.loadTeamChatMessages();
    const list = H.$("#teamChatList");
    if (list) {
      const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      if (this.state.teamChatScope === "private") {
        await this.renderTeamsPage();
        return;
      }
      list.innerHTML = this.state.teamChatMessages.map((message) => this.chatMessageHtml(message)).join("") || `<p class="muted empty-chat">Aucun message ici pour l’instant. Ouvre le bal 🦉</p>`;
      this.bindChatMessageActions();
      if (nearBottom) list.scrollTop = list.scrollHeight;
    }
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
    const authorRole = String(message.author_role || "").toLowerCase();
    const canBlockAuthor = !isMe && !["admin", "super_admin"].includes(authorRole);
    const canDelete = isMe || this.isSuperAdmin();
    const scopeLabel = this.chatScopeLabel(message.scope);
    const messageColor = this.safeColor(profile.office_team_color || profile.badge_color, "#facc15");
    return `
      <article class="team-chat-message ${isMe ? "me" : ""} ${this.isFamilyChatScope(message.scope) ? "family-message" : ""} ${message.scope === "private" ? "private-message" : ""}" style="--message-team-color:${messageColor}">
        ${H.profileBadgeHtml(profile, "profile-badge mini")}
        <div class="team-chat-bubble" data-open-reaction-picker-message-id="${H.escapeHtml(message.id)}" role="button" tabindex="0" title="Cliquer pour réagir">
          <div class="team-chat-meta">
            <strong>${H.escapeHtml(message.author_pseudo || "Joueur")}</strong>
            <span>${H.escapeHtml(scopeLabel)}</span>
            <time>${H.formatDateTime(message.created_at)}</time>
          </div>
          ${this.chatMessageBodyHtml(message)}
          <div class="chat-message-actions">
            ${this.reactionSummaryHtml(message)}
            <div class="chat-message-tools">
              ${canBlockAuthor ? `<button class="ghost-btn tiny-btn block-user-btn" type="button" data-block-user-id="${H.escapeHtml(message.user_id)}">Bloquer</button>` : ""}
              ${canDelete ? `<button class="ghost-btn tiny-btn delete-message-btn" type="button" data-delete-message-id="${H.escapeHtml(message.id)}">Masquer</button>` : ""}
            </div>
          </div>
        </div>
      </article>
    `;
  },


  privateChatOtherId(message = {}) {
    return String(message.user_id) === String(this.state.session?.user?.id) ? message.recipient_id : message.user_id;
  },

  privateChatProfileForId(userId, messages = []) {
    const profile = this.state.publicProfiles.find((player) => String(player.id) === String(userId)) || this.state.publicProfiles.find((player) => String(player.user_id) === String(userId));
    if (profile) return this.playerPublicProfile(profile);
    const sample = messages.find((message) => String(this.privateChatOtherId(message)) === String(userId)) || {};
    if (String(sample.recipient_id) === String(userId)) {
      return this.visualProfile({
        id: userId,
        pseudo: sample.recipient_pseudo || "Joueur",
        avatar_key: sample.recipient_avatar_key || "owl-01",
        badge_shape: sample.recipient_badge_shape || "rounded",
        badge_color: sample.recipient_badge_color || "#facc15",
        office_team_name: "MP du Nid"
      });
    }
    return this.profileForUser(userId, sample);
  },


  privateThreadSeenKey(userId) {
    return `nid-private-thread-seen:${this.state.session?.user?.id || "anonymous"}:${userId || "unknown"}`;
  },

  getPrivateThreadLastSeenAt(userId) {
    try {
      const raw = localStorage.getItem(this.privateThreadSeenKey(userId));
      return raw ? new Date(raw) : null;
    } catch (error) {
      return null;
    }
  },

  setPrivateThreadSeenNow(userId) {
    if (!userId) return;
    try {
      localStorage.setItem(this.privateThreadSeenKey(userId), new Date().toISOString());
    } catch (error) {
      console.warn("Impossible d’enregistrer la lecture du MP", error);
    }
  },

  privateThreadHasUnread(thread) {
    if (!thread?.userId) return false;
    if (String(thread.userId) === String(this.state.activePrivateThreadId)) return false;
    const seenAt = this.getPrivateThreadLastSeenAt(thread.userId);
    if (!seenAt || Number.isNaN(seenAt.getTime())) {
      return thread.rows.some((message) => String(message.user_id) !== String(this.state.session.user.id));
    }
    return thread.rows.some((message) =>
      String(message.user_id) !== String(this.state.session.user.id)
      && new Date(message.created_at || 0).getTime() > seenAt.getTime()
    );
  },

  privateChatThreads(messages = []) {
    const grouped = new Map();
    messages.forEach((message) => {
      const otherId = this.privateChatOtherId(message);
      if (!otherId) return;
      if (!grouped.has(otherId)) grouped.set(otherId, []);
      grouped.get(otherId).push(message);
    });
    return [...grouped.entries()]
      .map(([userId, rows]) => ({
        userId,
        rows: rows.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)),
        latestAt: rows.reduce((latest, row) => Math.max(latest, new Date(row.created_at || 0).getTime()), 0),
        profile: this.privateChatProfileForId(userId, rows)
      }))
      .sort((a, b) => (b.rows.length - a.rows.length) || (b.latestAt - a.latestAt));
  },


  privatePlayerRankLabel(userId) {
    const row = this.state.playerScoreRows.find((item) => String(item.user_id || item.id) === String(userId));
    return row?.rank ? `#${row.rank}` : "non classé";
  },

  privateThreadMessageCountForUser(userId, threadByUser = new Map()) {
    return threadByUser.get(String(userId))?.rows?.length || 0;
  },

  privateChatThreadsHtml(activePlayers = []) {
    const threads = this.privateChatThreads(this.state.teamChatMessages || []);
    const threadByUser = new Map(threads.map((thread) => [String(thread.userId), thread]));
    const allPlayers = activePlayers
      .filter((player) => String(player.id || player.user_id) !== String(this.state.session.user.id))
      .map((player) => this.playerPublicProfile(player));

    threads.forEach((thread) => {
      if (!allPlayers.some((player) => String(player.id || player.user_id) === String(thread.userId))) {
        allPlayers.push(thread.profile);
      }
    });

    const sortedPlayers = [...allPlayers].sort((a, b) => {
      const aId = a.id || a.user_id;
      const bId = b.id || b.user_id;
      const aCount = this.privateThreadMessageCountForUser(aId, threadByUser);
      const bCount = this.privateThreadMessageCountForUser(bId, threadByUser);
      if (bCount !== aCount) return bCount - aCount;
      const aLatest = threadByUser.get(String(aId))?.latestAt || 0;
      const bLatest = threadByUser.get(String(bId))?.latestAt || 0;
      if (bLatest !== aLatest) return bLatest - aLatest;
      return String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr");
    });

    const topIds = new Set(threads.slice(0, 5).map((thread) => String(thread.userId)));
    let visiblePlayers = sortedPlayers.filter((player) => topIds.has(String(player.id || player.user_id))).slice(0, 5);

    if (this.state.activePrivateThreadId && !visiblePlayers.some((player) => String(player.id || player.user_id) === String(this.state.activePrivateThreadId))) {
      const activeFromAll = sortedPlayers.find((player) => String(player.id || player.user_id) === String(this.state.activePrivateThreadId));
      if (activeFromAll) visiblePlayers = [activeFromAll, ...visiblePlayers].slice(0, 5);
    }

    if (!this.state.activePrivateThreadId && threads.length) {
      this.state.activePrivateThreadId = threads[0].userId;
    }

    const visibleIds = new Set(visiblePlayers.map((player) => String(player.id || player.user_id)));
    const morePlayers = sortedPlayers.filter((player) => !visibleIds.has(String(player.id || player.user_id)));
    const activeProfile = sortedPlayers.find((player) => String(player.id || player.user_id) === String(this.state.activePrivateThreadId));
    const activeExistingThread = this.state.activePrivateThreadId ? threadByUser.get(String(this.state.activePrivateThreadId)) : null;
    const activeThread = this.state.activePrivateThreadId ? {
      userId: this.state.activePrivateThreadId,
      rows: activeExistingThread?.rows || [],
      latestAt: activeExistingThread?.latestAt || 0,
      profile: activeExistingThread?.profile || activeProfile || this.profileForUser(this.state.activePrivateThreadId)
    } : null;

    if (activeThread) this.setPrivateThreadSeenNow(activeThread.userId);

    const optionHtml = (player, isCompact = false) => {
      const playerId = player.id || player.user_id;
      const thread = threadByUser.get(String(playerId));
      const unread = thread ? this.privateThreadHasUnread(thread) : false;
      const count = thread?.rows?.length || 0;
      return `
        <button type="button" class="private-recipient-option ${isCompact ? "compact" : ""} ${String(playerId) === String(this.state.activePrivateThreadId) ? "active" : ""}" data-private-thread-select="${H.escapeHtml(playerId)}">
          ${H.profileBadgeHtml(player, "profile-badge mini")}
          <span>
            <strong>${H.escapeHtml(player.pseudo || "Joueur")}</strong>
            <small>${H.escapeHtml(player.office_team_name || "Sans team")} · ${count} MP · ${H.escapeHtml(this.privatePlayerRankLabel(playerId))}</small>
          </span>
          ${unread ? `<b class="private-thread-unread-dot" aria-label="Nouveau MP"></b>` : ""}
        </button>
      `;
    };

    return `
      <div class="private-chat-layout-v1312">
        <aside class="private-recipient-panel">
          <div class="private-recipient-head">
            <strong>MP du Nid</strong>
            <small>Top conversations</small>
          </div>
          <div class="private-recipient-list top-private-recipients">
            ${visiblePlayers.length ? visiblePlayers.map((player) => optionHtml(player)).join("") : `<p class="muted">Aucune conversation active. Ouvre un MP dans l’annuaire.</p>`}
          </div>
          <details class="private-recipient-more">
            <summary>Choisir un autre joueur <span>${morePlayers.length}</span></summary>
            <div class="private-recipient-more-list">
              ${morePlayers.length ? morePlayers.map((player) => optionHtml(player, true)).join("") : `<p class="muted">Tous les joueurs sont déjà dans le top affiché.</p>`}
            </div>
          </details>
        </aside>

        <section class="private-conversation-panel">
          ${activeThread ? this.privateChatThreadHtml(activeThread) : `<p class="muted empty-chat">Choisis un joueur dans la liste pour ouvrir un MP. Si aucun message n’existe, la conversation commence vide.</p>`}
        </section>
      </div>
    `;
  },

  privateChatThreadHtml(thread) {
    const hasRows = Boolean(thread.rows?.length);
    return `
      <article class="private-chat-thread-card active-thread-card" data-private-thread-user-id="${H.escapeHtml(thread.userId)}">
        <header>
          ${H.profileBadgeHtml(thread.profile, "profile-badge mini")}
          <div>
            <strong>${H.escapeHtml(thread.profile.pseudo || "Joueur")}</strong>
            <small>${H.escapeHtml(thread.profile.office_team_name || "Sans team")} · ${hasRows ? `${thread.rows.length} message${thread.rows.length > 1 ? "s" : ""}` : "conversation vide"}</small>
          </div>
        </header>
        <div class="private-chat-thread-messages team-chat-list private-message-list" id="teamChatList">
          ${hasRows ? thread.rows.map((message) => this.chatMessageHtml(message)).join("") : `<p class="muted empty-chat">Aucun MP avec ${H.escapeHtml(thread.profile.pseudo || "ce joueur")} pour l’instant. Tu peux ouvrir le bal 🦉</p>`}
        </div>
        <form class="private-thread-reply-form" data-private-thread-form data-recipient-id="${H.escapeHtml(thread.userId)}">
          <input type="text" name="body" maxlength="600" placeholder="Écrire à ${H.escapeHtml(thread.profile.pseudo || "ce joueur")}..." required ${this.state.profile?.can_chat === false ? "disabled" : ""}>
          <button class="ghost-btn" type="submit" ${this.state.profile?.can_chat === false ? "disabled" : ""}>Envoyer</button>
          ${this.quickOwlMessageButtonsHtml({ recipientId: thread.userId, compact: true })}
        </form>
      </article>
    `;
  },

  async sendPrivateThreadMessage(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const recipientId = form.dataset.recipientId;
    const body = String(new FormData(form).get("body") || "").trim();
    if (!recipientId || !body) return;
    const { error } = await window.sb.from("team_chat_messages").insert({
      user_id: this.state.session.user.id,
      scope: "private",
      office_team_id: null,
      recipient_id: recipientId,
      body
    });
    if (error) {
      H.toast(error.message || "Impossible d’envoyer le MP.", "error");
      return;
    }
    this.state.activePrivateThreadId = recipientId;
    this.setPrivateThreadSeenNow(recipientId);
    form.reset();
    await this.renderTeamsPage();
  },

  async renderTeamsPage() {
    await Promise.all([
      this.loadPublicProfiles(),
      this.loadPlayerScoreRows(),
      this.loadVisiblePredictions(),
      this.loadWinnerPrediction().catch(() => null),
      this.loadSecondWinnerPrediction().catch(() => null),
      this.loadWinnerPredictionsForTeams(),
      this.loadSecondWinnerPredictionsForTeams()
    ]);

    const scopes = this.availableChatScopes();
    if (!scopes.some((item) => item.key === this.state.teamChatScope)) {
      this.state.teamChatScope = scopes[0]?.key || "global";
    }
    this.state.teamChatScope = this.normalizeChatScope(this.state.teamChatScope);
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
    const chatTitle = this.chatScopeLabel(chatScope);

    root.innerHTML = `
      <section class="hero-card teams-hero compact-teams-hero">
        <div>
          <p class="eyebrow">${H.icon("profile")} Les teams du nid</p>
          <h2>Joueurs, teams et chambrage.</h2>
          <p class="muted">Le nid général reste officiel. Le nid Famille apparaît seulement pour ceux qui l’activent.</p>
        </div>
        <div class="teams-hero-stats">
          <div><strong>${activePlayers.length}</strong><small>joueurs</small></div>
          <div><strong>${visibleDirectoryTeamCount}</strong><small>teams actives</small></div>
          <div><strong>${H.escapeHtml(myTeam?.name || "—")}</strong><small>ma team</small></div>
        </div>
      </section>

      <section class="grid teams-page-grid teams-chat-first">
        <section class="card team-chat-card is-top chat-v120-card">
          <div class="card-title-row">
            <div>
              <h3>Messages · ${H.escapeHtml(chatTitle)}</h3>
              <p class="muted">10 derniers messages affichés. Recharge les anciens par paquets de 20. Actualisation automatique toutes les 8 secondes.</p>
            </div>
            <button class="ghost-btn" id="refreshTeamChatBtn" type="button">Rafraîchir</button>
          </div>

          <div class="chat-channel-picker-v1311">
            ${this.chatScopeTabsHtml()}
            <p class="muted">${H.escapeHtml(scopes.find((scope) => scope.key === chatScope)?.hint || "Choisis où écrire.")}</p>
          </div>

          ${chatUnavailable ? `
            <div class="chat-warning">
              <strong>Chat pas encore branché en base.</strong>
              <p>Lance le patch SQL <code>patch_v1_2_0_chat_du_nid.sql</code> dans Supabase, puis recharge l’app.</p>
              <small>${H.escapeHtml(this.state.teamChatError?.message || "Table ou vue manquante")}</small>
            </div>
          ` : `
            ${chatScope === "private" ? this.privateChatThreadsHtml(activePlayers) : `
              ${this.state.teamChatHasMore ? `<button class="ghost-btn load-more-chat-btn" id="loadMoreTeamChatBtn" type="button">Charger 20 messages précédents</button>` : ""}
              <div class="team-chat-list" id="teamChatList">
                ${this.state.teamChatMessages.length ? this.state.teamChatMessages.map((message) => this.chatMessageHtml(message)).join("") : `<p class="muted empty-chat">Aucun message ici pour l’instant. Ouvre le bal 🦉</p>`}
              </div>
              <form id="teamChatForm" class="team-chat-form chat-form-v120">
                <input type="text" name="body" maxlength="600" placeholder="Écris dans ${H.escapeHtml(chatTitle)}..." autocomplete="off" required ${this.state.profile?.can_chat === false ? "disabled" : ""}>
                <button class="primary-btn" type="submit" ${this.state.profile?.can_chat === false ? "disabled" : ""}>Envoyer</button>
              </form>
            `}
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

    H.$("#refreshTeamChatBtn")?.addEventListener("click", async () => {
      await this.renderTeamsPage();
      H.toast("Messages rafraîchis", "success");
    });

    H.$$("[data-chat-scope]", root).forEach((button) => {
      button.addEventListener("click", async () => {
        const nextScope = button.dataset.chatScope || "global";
        if (this.state.teamChatScope === nextScope) return;
        this.state.teamChatScope = nextScope;
        this.state.teamChatLimit = this.state.teamChatScope === "private" ? 240 : 10;
        if (this.state.teamChatScope !== "private") this.state.activePrivateThreadId = null;
        await this.renderTeamsPage();
      });
    });

    H.$$('[data-direct-message-user-id]', root).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.openPrivateThread(button.dataset.directMessageUserId);
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
    H.$$("[data-private-thread-select]", root).forEach((button) => {
      button.addEventListener("click", async () => {
        this.state.activePrivateThreadId = button.dataset.privateThreadSelect;
        this.setPrivateThreadSeenNow(this.state.activePrivateThreadId);
        await this.renderTeamsPage();
      });
    });
    H.$$(`[data-private-thread-form]`, root).forEach((form) => form.addEventListener("submit", (event) => this.sendPrivateThreadMessage(event)));
    this.bindChatMessageActions();

    const chatList = H.$("#teamChatList");
    if (chatList) chatList.scrollTop = chatList.scrollHeight;
    this.markTeamChatAsSeen();
    this.startTeamChatAutoRefresh();
  },

  async sendTeamChatMessage(event) {
    event.preventDefault();
    if (this.state.profile?.can_chat === false || this.state.profile?.is_banned) {
      H.toast("Les messages sont désactivés sur ton compte.", "error");
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = String(formData.get("body") || "").trim();
    if (!body) return;

    const scope = this.normalizeChatScope(this.state.teamChatScope || "global");
    const recipientId = scope === "private" ? String(formData.get("recipient_id") || "").trim() : null;
    if (scope === "private" && !recipientId) {
      H.toast("Choisis un destinataire pour le MP.", "error");
      return;
    }
    if (this.isFamily(this.state.profile) && scope !== "private" && !this.isFamilyChatScope(scope)) {
      H.toast("Les comptes Famille écrivent dans les salons Famille uniquement.", "error");
      return;
    }
    if (scope !== "private" && this.isFamilyChatScope(scope) && !this.canSeeFamily()) {
      H.toast("Active le mode Famille pour écrire ici.", "error");
      return;
    }
    const officeTeamId = this.chatScopeNeedsTeam(scope) ? this.state.profile?.office_team_id : null;
    if (this.chatScopeNeedsTeam(scope) && !officeTeamId) {
      H.toast("Tu dois avoir une team pour écrire dans ce salon.", "error");
      return;
    }

    const { error } = await window.sb
      .from("team_chat_messages")
      .insert({
        user_id: this.state.session.user.id,
        scope,
        office_team_id: officeTeamId,
        recipient_id: recipientId,
        body
      });

    if (error) {
      H.toast(error.message, "error");
      return;
    }

    if (scope === "private" && recipientId) {
      this.state.activePrivateThreadId = recipientId;
      this.setPrivateThreadSeenNow(recipientId);
    }
    form.reset();
    this.state.teamChatLimit = Math.max(this.state.teamChatLimit, scope === "private" ? 80 : 10);
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
                  <tr class="${r.qualification_status === "eliminated" ? "eliminated-zone" : r.group_rank <= 2 ? "qual-zone" : r.group_rank === 3 ? "third-zone" : ""}">
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

  openFamilyHelpModal() {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop family-help-modal";
    modal.innerHTML = `
      <div class="modal-card family-help-card" role="dialog" aria-modal="true" aria-labelledby="familyHelpTitle">
        <button class="modal-close family-help-close" type="button" aria-label="Fermer le mode Famille">×</button>
        <p class="eyebrow">Mode Famille</p>
        <h2 id="familyHelpTitle">Un nid parallèle, sans toucher au classement officiel.</h2>
        <div class="family-help-grid">
          <article><strong>Officiel préservé</strong><p>Les joueurs Famille ne comptent pas dans le classement UIS, les teams bureau ni les mini-records.</p></article>
          <article><strong>Classement Famille</strong><p>Les comptes Famille et les joueurs UIS qui activent ce mode jouent ensemble dans un classement séparé.</p></article>
          <article><strong>Chat séparé</strong><p>Le salon Général reste UIS. Les salons Famille permettent de chambrer avec les invités sans polluer ceux qui ne veulent rien voir.</p></article>
          <article><strong>Invitations</strong><p>Chaque joueur UIS peut générer jusqu’à 3 invitations, valables 7 jours, rattachées à sa team.</p></article>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector(".modal-close")?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  },

  blockedUsersSectionHtml() {
    const blocked = [...(this.state.blockedUserIds || new Set())];
    if (!blocked.length) return "";
    const rows = blocked.map((id) => this.state.publicProfiles.find((p) => String(p.id || p.user_id) === String(id)) || { id, pseudo: "Joueur bloqué" });
    return `
      <section class="card blocked-users-card">
        <div class="card-title-row">
          <div>
            <h3>Messages masqués</h3>
            <p class="muted">Tu as bloqué ces personnes dans le chat. Tu peux les réafficher quand tu veux.</p>
          </div>
        </div>
        <div class="blocked-user-list">
          ${rows.map((row) => `
            <article class="blocked-user-row">
              <strong>${H.escapeHtml(row.pseudo || "Joueur")}</strong>
              <button class="ghost-btn tiny-btn unblock-user-btn" type="button" data-unblock-user-id="${H.escapeHtml(row.id || row.user_id)}">Débloquer</button>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  },


  async copyTextToClipboard(text, successMessage = "Copié") {
    const value = String(text || "").trim();
    if (!value) {
      H.toast("Rien à copier.", "error");
      return false;
    }

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
      console.warn("Copie impossible", error);
      H.toast("Copie impossible. Sélectionne le coupon à la main.", "error");
      return false;
    }
  },

  familyProfileSectionHtml() {
    const profile = this.state.profile || {};
    const isFamily = this.isFamily(profile);
    const invites = this.state.familyInvites || [];
    const familyEnabled = this.familyModeEnabled();
    const usedCount = invites.filter((invite) => invite.used_at || invite.used_by).length;
    const createdCount = invites.filter((invite) => !invite.revoked_at).length;

    if (isFamily) {
      return `
        <section class="card family-profile-card">
          <div class="card-title-row">
            <div>
              <h3>Mode Famille</h3>
              <p class="muted">Tu participes dans la catégorie Famille. Tu vois le classement UIS, mais tes points ne comptent pas dans le classement officiel du bureau ni dans les mini-records.</p>
            </div>
            <span class="pill neutral">Famille</span>
          </div>
        </section>
      `;
    }

    if (!familyEnabled) {
      return "";
    }

    return `
      <section class="card family-profile-card">
        <div class="card-title-row family-header-row">
          <div>
            <h3>Mode Famille</h3>
            <p class="muted">Active le mode Famille pour voir les classements, messages et joueurs Famille. Ton classement officiel reste inchangé.</p>
          </div>
          <button class="ghost-btn family-help-btn" id="familyHelpBtn" type="button">Comprendre</button>
          <span class="pill ${familyEnabled ? "success" : "neutral"}">${familyEnabled ? "Inscriptions ouvertes" : "Inscriptions fermées"}</span>
        </div>

        <div class="family-toggle-card">
          <div class="family-toggle-copy">
            <strong>Afficher le mode Famille</strong>
            <p class="muted small-note">Classements Famille, joueurs Famille et messages associés deviennent visibles dans ton nid.</p>
          </div>
          <label class="family-switch" for="showFamilyPlayersToggle">
            <input id="showFamilyPlayersToggle" type="checkbox" ${profile.show_family_players ? "checked" : ""}>
            <span class="family-switch-track" aria-hidden="true"><span class="family-switch-thumb"></span></span>
            <span class="family-switch-state">${profile.show_family_players ? "Visible" : "Masqué"}</span>
          </label>
        </div>

        <div class="family-invite-box">
          <div>
            <strong>Invitations Famille</strong>
            <p class="muted small-note">Maximum 3 invitations par joueur UIS. Une invitation = une personne, valable 7 jours, rattachée à ta team actuelle.</p>
            <div class="family-invite-stats">
              <span class="stat-chip">Créées <strong>${createdCount}/3</strong></span>
              <span class="stat-chip">Utilisées <strong>${usedCount}</strong></span>
            </div>
          </div>
          <button class="primary-btn" id="createFamilyInviteBtn" type="button" ${(!familyEnabled || createdCount >= 3 || !profile.office_team_id) ? "disabled" : ""}>Créer une invitation</button>
        </div>
        <div class="family-invite-list">
          ${invites.length ? invites.map((invite) => `
            <article class="family-invite-row ${invite.used_at ? "used" : ""}">
              <div>
                <strong>${H.escapeHtml(invite.code)}</strong>
                <small>${invite.used_at ? `Utilisée le ${H.formatDateTime(invite.used_at)}` : `Expire le ${H.formatDateTime(invite.expires_at)}`}</small>
              </div>
              <div class="family-invite-actions">
                <span class="pill ${invite.used_at ? "success" : "neutral"}">${invite.used_at ? "Utilisée" : "Disponible"}</span>
                ${invite.used_at ? "" : `<button class="ghost-btn tiny-btn copy-family-invite-btn" type="button" data-copy-family-invite="${H.escapeHtml(invite.code)}">Copier</button>`}
              </div>
            </article>
          `).join("") : `<p class="muted small-note">Aucune invitation créée.</p>`}
        </div>
      </section>
    `;
  },


  firstLoginAvatarOptionsHtml(currentAvatar = "owl-01") {
    const choices = this.avatarChoices();
    const priority = [
      "owl-01", "owl-02", "owl-03", "owl-04", "owl-05", "owl-06",
      "owl-07", "owl-08", "owl-09", "owl-10", "owl-11", "owl-12"
    ];
    const prioritySet = new Set(priority);
    const firstChoices = choices
      .filter((avatar) => prioritySet.has(avatar.key))
      .sort((a, b) => priority.indexOf(a.key) - priority.indexOf(b.key));
    const otherChoices = choices.filter((avatar) => !prioritySet.has(avatar.key));
    const card = (avatar) => `
      <label class="first-login-avatar ${currentAvatar === avatar.key ? "selected" : ""}">
        <input type="radio" name="avatar_key" value="${H.escapeHtml(avatar.key)}" ${currentAvatar === avatar.key ? "checked" : ""}>
        <img src="${H.escapeHtml(H.avatarUrl(avatar.key))}" alt="${H.escapeHtml(avatar.label)}" loading="lazy" onerror="this.onerror=null;this.src='assets/avatars/nations-couleurs/owl-01-le-bleu-blanc-bougon.png';">
        <span>${H.escapeHtml(avatar.label)}</span>
      </label>
    `;

    return `
      <div class="first-login-avatar-grid first-login-avatar-grid-main">
        ${firstChoices.map(card).join("")}
      </div>
      ${otherChoices.length ? `
        <details class="first-login-more-avatars">
          <summary>Voir plus de chouettes <span>${otherChoices.length}</span></summary>
          <div class="first-login-avatar-grid">
            ${otherChoices.map(card).join("")}
          </div>
        </details>
      ` : ""}
    `;
  },

  async saveFirstLoginProfile(form) {
    const formData = new FormData(form);
    const pseudo = String(formData.get("pseudo") || "").trim();
    const officeTeamId = formData.get("office_team_id") || null;
    const avatarKey = H.normalizeAvatarKey(formData.get("avatar_key") || "owl-01");
    const selectedTeam = this.state.officeTeams.find((team) => team.id === officeTeamId);
    const profile = this.state.profile || {};

    if (!pseudo) {
      H.toast("Choisis ton surnom de chouette.", "error");
      form.querySelector('input[name="pseudo"]')?.focus();
      return;
    }

    if (pseudo.length < 2) {
      H.toast("Ton surnom doit avoir au moins 2 caractères.", "error");
      form.querySelector('input[name="pseudo"]')?.focus();
      return;
    }

    if (!officeTeamId) {
      H.toast("Choisis ta team pour entrer dans le nid.", "error");
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Entrée dans le nid...";
    }

    const { error } = await window.sb
      .from("profiles")
      .update({
        pseudo,
        office_team_id: officeTeamId,
        avatar_key: avatarKey,
        badge_shape: profile.badge_shape || "rounded",
        badge_color: selectedTeam?.color || this.teamColorForProfile({ office_team_id: officeTeamId }),
        profile_setup_done: true
      })
      .eq("id", this.state.session.user.id);

    if (error) {
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Rentrer dans le Nid";
      }
      H.toast(error.message || "Impossible d’enregistrer le profil.", "error");
      return;
    }

    await this.loadProfile();
    await this.loadPublicProfiles().catch(() => {});
    H.$("#firstLoginModal")?.remove();
    document.body.classList.remove("first-login-lock");
    this.renderShell();
    H.toast("Bienvenue dans le Nid 🦉", "success");
    await this.loadView("home");
  },

  openFirstLoginModal() {
    if (this.profileSetupComplete()) {
      H.$("#firstLoginModal")?.remove();
      document.body.classList.remove("first-login-lock");
      return;
    }

    if (H.$("#firstLoginModal")) return;

    const profile = this.state.profile || {};
    const team = this.officeTeamById(profile.office_team_id);
    const currentAvatar = H.normalizeAvatarKey(profile.avatar_key || "owl-01");
    const currentShape = profile.badge_shape || "rounded";
    const currentTeamColor = team?.color || this.teamColorForProfile(profile) || "#facc15";

    const teamCards = this.isFamily(profile)
      ? `
        <label class="first-login-team-card selected">
          <input type="radio" name="office_team_id" value="${H.escapeHtml(profile.office_team_id || "")}" checked required>
          <span style="--team-color:${H.escapeHtml(currentTeamColor)}"></span>
          <strong>${H.escapeHtml(team?.name || "Team Famille")}</strong>
          <small>Team fixée par invitation</small>
        </label>
      `
      : this.state.officeTeams.map((teamItem) => `
        <label class="first-login-team-card ${profile.office_team_id === teamItem.id ? "selected" : ""}">
          <input type="radio" name="office_team_id" value="${H.escapeHtml(teamItem.id)}" ${profile.office_team_id === teamItem.id ? "checked" : ""} required>
          <span style="--team-color:${H.escapeHtml(teamItem.color || "#facc15")}"></span>
          <strong>${H.escapeHtml(teamItem.name)}</strong>
          <small>Rejoindre cette team</small>
        </label>
      `).join("");

    const modal = document.createElement("div");
    modal.id = "firstLoginModal";
    modal.className = "first-login-backdrop";
    modal.innerHTML = `
      <div class="first-login-shell" role="dialog" aria-modal="true" aria-labelledby="firstLoginTitle">
        <aside class="first-login-preview">
          <p class="eyebrow">Première connexion</p>
          <h2 id="firstLoginTitle">Entre dans le Nid</h2>
          <p>Avant de jouer, choisis ton surnom, ta team et ton avatar. Après ça, ton profil devient prêt et tu peux voler dans l’appli.</p>
          <div class="first-login-badge-preview" id="firstLoginPreview" style="--avatar-team-color:${H.escapeHtml(currentTeamColor)}">
            ${H.profileBadgeHtml({
              ...profile,
              pseudo: profile.pseudo || "Nouvelle chouette",
              office_team_color: currentTeamColor,
              avatar_key: currentAvatar,
              badge_shape: currentShape,
              badge_color: currentTeamColor
            }, "profile-badge giant")}
          </div>
          <div class="first-login-steps">
            <span class="done">1 · Surnom</span>
            <span>2 · Team</span>
            <span>3 · Avatar</span>
          </div>
        </aside>

        <form id="firstLoginForm" class="first-login-form">
          <section class="first-login-panel">
            <h3>1. Ton surnom dans le Nid</h3>
            <label>
              <span>Surnom</span>
              <input name="pseudo" value="${H.escapeHtml(profile.pseudo || "")}" placeholder="Ex : Hibou du lundi" maxlength="40" autocomplete="nickname" required ${profile.can_change_pseudo === false && profile.pseudo ? "disabled" : ""}>
            </label>
          </section>

          <section class="first-login-panel">
            <h3>2. Ta team</h3>
            <div class="first-login-team-grid">
              ${teamCards || `<p class="muted">Aucune team disponible pour le moment. Demande à l’admin du Nid.</p>`}
            </div>
          </section>

          <section class="first-login-panel">
            <div class="first-login-title-row">
              <h3>3. Ton avatar</h3>
              <small>Tu pourras le changer plus tard</small>
            </div>
            ${this.firstLoginAvatarOptionsHtml(currentAvatar)}
          </section>

          <input type="hidden" name="badge_shape" value="${H.escapeHtml(currentShape)}">
          <input type="hidden" name="badge_color" value="${H.escapeHtml(currentTeamColor)}">

          <div class="first-login-actions">
            <button class="ghost-btn" type="button" id="firstLoginLogoutBtn">Déconnexion</button>
            <button class="ghost-btn" type="button" id="firstLoginInstallBtn">Installer l’app</button>
            <button class="primary-btn first-login-enter-btn" type="submit">Rentrer dans le Nid</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.classList.add("first-login-lock");

    const form = H.$("#firstLoginForm", modal);
    const preview = H.$("#firstLoginPreview", modal);

    const updatePreview = () => {
      if (!form || !preview) return;
      const formData = new FormData(form);
      const selectedTeam = this.state.officeTeams.find((item) => item.id === formData.get("office_team_id"));
      const teamColor = selectedTeam?.color || currentTeamColor || "#facc15";
      preview.style.setProperty("--avatar-team-color", teamColor);
      preview.innerHTML = H.profileBadgeHtml({
        pseudo: String(formData.get("pseudo") || "").trim() || "Nouvelle chouette",
        office_team_color: teamColor,
        badge_color: teamColor,
        badge_shape: formData.get("badge_shape") || currentShape,
        avatar_key: formData.get("avatar_key") || currentAvatar
      }, "profile-badge giant");

      H.$$(".first-login-team-card", form).forEach((card) => card.classList.toggle("selected", card.querySelector("input")?.checked));
      H.$$(".first-login-avatar", form).forEach((card) => card.classList.toggle("selected", card.querySelector("input")?.checked));
    };

    H.$$("input", form).forEach((input) => {
      input.addEventListener("input", updatePreview);
      input.addEventListener("change", updatePreview);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.saveFirstLoginProfile(form);
    });

    H.$("#firstLoginLogoutBtn", modal)?.addEventListener("click", () => Auth.logout());
    H.$("#firstLoginInstallBtn", modal)?.addEventListener("click", () => this.openPwaInstallGuide());
    setTimeout(() => form.querySelector('input[name="pseudo"]')?.focus(), 120);
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
    const secondChampionTeams = this.secondChampionCandidateTeams();
    const secondChampionAfterGroups = this.groupStageFinishedForSecondChampion();
    const secondChampionOpen = this.secondChampionPickOpen();
    const secondChampionCloseAt = this.secondChampionCloseAt();
    const selectedSecondWinnerId = this.state.secondWinnerPrediction?.predicted_team_id || "";
    const selectedSecondWinner = this.secondChampionSelectedTeam();
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
            <span class="pill">${H.escapeHtml(this.roleLabel(profile.role, profile.player_scope))}</span>
            <span class="pill neutral">${H.escapeHtml(team?.name || "Team à choisir")}</span>
            ${!setupDone ? `<span class="pill danger">Profil à compléter</span>` : `<span class="pill success">Profil prêt</span>`}
          </div>
        </div>
      </section>

      ${this.isScoreAdmin(profile) ? `
        <section class="card admin-mobile-card">
          <div class="card-title-row">
            <div>
              <h3>Administration rapide</h3>
              <p class="muted">Accès ${this.isSuperAdmin(profile) ? "super admin" : "admin matchs"} pour gérer les scores.</p>
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
            <button class="ghost-btn" id="profileInstallAppBtn" type="button">Installer l’app</button>
            <button class="ghost-btn" id="profileCreditsBtn" type="button">Crédits · v1.9.4</button>
            <button class="danger-btn" id="profileLogoutBtn" type="button">Déconnexion</button>
          </div>
        </div>
      </section>

      ${this.familyProfileSectionHtml()}
      ${this.blockedUsersSectionHtml()}

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
              <input name="pseudo" value="${H.escapeHtml(profile.pseudo || "")}" required maxlength="40" autocomplete="nickname" ${profile.can_change_pseudo === false ? "disabled" : ""}>
            </label>
            ${this.isFamily(profile) ? `
              <label>
                <span>Team de rattachement</span>
                <input type="hidden" name="office_team_id" value="${H.escapeHtml(profile.office_team_id || "")}">
                <input type="text" value="${H.escapeHtml(team?.name || "Team Famille")}" disabled>
                <small class="muted">La team Famille est fixée par l’invitation.</small>
              </label>
            ` : `
              <label>
                <span>Team bureau</span>
                <select name="office_team_id" required>
                  <option value="">Choisir une team</option>
                  ${this.state.officeTeams.map((team) => `
                    <option value="${team.id}" ${profile.office_team_id === team.id ? "selected" : ""}>${H.escapeHtml(team.name)}</option>
                  `).join("")}
                </select>
              </label>
            `}
          </div>

          <div class="avatar-customizer-block">
            <div class="field-title-row">
              <div>
                <span class="field-title">Avatar chouette</span>
                <p class="muted small-note">90 chouettes disponibles, renommées et rangées par type pour s’y retrouver sans fouiller le nid.</p>
              </div>
              <button class="ghost-btn avatar-toggle-btn" id="toggleAvatarPanel" type="button" aria-expanded="false" aria-controls="avatarChoicePanel" ${profile.can_change_avatar === false ? "disabled" : ""}>Personnaliser l’avatar</button>
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
            <p class="muted">Choisis l’équipe qui remportera ${H.escapeHtml(competitionName)}. Si elle gagne la finale : <strong>+${this.championFirstBonusPoints()} points</strong>.</p>
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
                <small>${championLocked ? "Choix verrouillé" : "Tu peux encore changer avant le coup d’envoi du premier match officiel."}</small>
              </div>
            </div>
          ` : `<p class="muted">Aucun champion choisi pour l’instant.</p>`}
          <p class="muted small-note">Verrouillage au premier match officiel : ${startAt ? H.formatDateTime(startAt) : "à confirmer"}</p>
        </div>
      </section>

      <section class="card champion-pick-card second-champion-card ${secondChampionOpen ? "" : "is-locked"}">
        <div class="card-title-row">
          <div>
            <h3>${H.icon("trophy")} Mon 2e champion après les poules</h3>
            <p class="muted">${secondChampionAfterGroups ? "Les poules sont terminées : seuls les qualifiés restent disponibles." : "Avant la fin des poules, toutes les équipes de la compétition restent disponibles. La liste sera resserrée aux qualifiés après mise à jour."} Ce choix vaut <strong>+${this.championSecondBonusPoints()} points</strong> et ne remplace pas ton champion initial.</p>
          </div>
          <span class="pill ${secondChampionOpen ? "success" : "danger"}">${secondChampionOpen ? "Ouvert" : "Verrouillé"}</span>
        </div>

        ${secondChampionTeams.length ? `
          <form id="secondChampionPickForm" class="winner-pick-form">
            <label class="winner-team-label">
              <span>2e équipe championne possible</span>
              <div class="champion-picker second-champion-picker ${secondChampionOpen ? "" : "is-disabled"}" id="secondChampionPicker">
                <input type="hidden" name="predicted_team_id" value="${H.escapeHtml(selectedSecondWinnerId)}">
                <button class="champion-picker-toggle" type="button" ${secondChampionOpen ? "" : "disabled"} aria-expanded="false">
                  <span class="champion-picker-current">
                    ${selectedSecondWinner ? `
                      ${H.flagImgHtml({ flagUrl: selectedSecondWinner.flag_url, countryCode: selectedSecondWinner.country_code, shortName: selectedSecondWinner.short_name, name: selectedSecondWinner.name, className: "team-flag-img champion-option-flag" })}
                      <span class="champion-option-name">${H.escapeHtml(selectedSecondWinner.name)}</span>
                      <small>${H.escapeHtml(selectedSecondWinner.short_name || selectedSecondWinner.country_code || "")}</small>
                    ` : `<span class="champion-picker-empty">${secondChampionAfterGroups ? "Choisir une équipe qualifiée" : "Choisir une équipe"}</span>`}
                  </span>
                  <span class="champion-picker-caret" aria-hidden="true">⌄</span>
                </button>
                <div class="champion-picker-menu" hidden>
                  ${secondChampionTeams.map((team) => `
                    <button type="button" class="champion-option ${selectedSecondWinnerId === team.id ? "is-selected" : ""}" data-team-id="${H.escapeHtml(team.id)}">
                      ${H.flagImgHtml({ flagUrl: team.flag_url, countryCode: team.country_code, shortName: team.short_name, name: team.name, className: "team-flag-img champion-option-flag" })}
                      <span class="champion-option-name">${H.escapeHtml(team.name)}</span>
                      <small>${H.escapeHtml(team.short_name || team.country_code || "")}</small>
                    </button>
                  `).join("")}
                </div>
              </div>
            </label>
            <button class="primary-btn" type="submit" ${secondChampionOpen ? "" : "disabled"}>Enregistrer mon 2e champion</button>
          </form>
        ` : `<div class="empty-state compact"><strong>Liste indisponible</strong><p>Le Hibou ne trouve aucune équipe réelle à proposer. Vérifie les matchs de poule et les équipes qualifiées.</p></div>`}

        <div class="winner-pick-status">
          ${selectedSecondWinner ? `
            <div class="winner-team-preview">
              ${H.flagImgHtml({ flagUrl: selectedSecondWinner.flag_url, countryCode: selectedSecondWinner.country_code, shortName: selectedSecondWinner.short_name, name: selectedSecondWinner.name })}
              <div>
                <strong>${H.escapeHtml(selectedSecondWinner.name)}</strong>
                <small>2e choix bonus enregistré · +${this.championSecondBonusPoints()} pts si cette équipe gagne.</small>
              </div>
            </div>
          ` : `<p class="muted">Aucun 2e champion choisi pour l’instant.</p>`}
          <p class="muted small-note">Fermeture au premier match des 16èmes : ${secondChampionCloseAt ? H.formatDateTime(secondChampionCloseAt) : "à confirmer"}</p>
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



    const secondChampionForm = H.$("#secondChampionPickForm");
    if (secondChampionForm && secondChampionOpen) {
      secondChampionForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        await this.saveSecondChampionPick(formData.get("predicted_team_id"));
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


    const secondChampionPicker = H.$("#secondChampionPicker");
    if (secondChampionPicker && secondChampionOpen) {
      const toggle = H.$(".champion-picker-toggle", secondChampionPicker);
      const menu = H.$(".champion-picker-menu", secondChampionPicker);
      const input = H.$('input[name="predicted_team_id"]', secondChampionPicker);
      const current = H.$(".champion-picker-current", secondChampionPicker);
      const closeSecondPicker = () => {
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

      H.$$(".champion-option", secondChampionPicker).forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          input.value = button.dataset.teamId || "";
          H.$$(".champion-option", secondChampionPicker).forEach((option) => option.classList.remove("is-selected"));
          button.classList.add("is-selected");
          current.innerHTML = button.innerHTML;
          closeSecondPicker();
        });
      });

      document.addEventListener("click", (event) => {
        if (!secondChampionPicker.contains(event.target)) closeSecondPicker();
      });
    }

    H.$("#profileInstallAppBtn")?.addEventListener("click", () => this.openPwaInstallGuide());
    H.$("#profileCreditsBtn")?.addEventListener("click", () => this.openCreditsModal());
    H.$("#profileLogoutBtn")?.addEventListener("click", () => Auth.logout());

    H.$("#familyHelpBtn")?.addEventListener("click", () => this.openFamilyHelpModal());

    H.$("#showFamilyPlayersToggle")?.addEventListener("change", async (event) => {
      const enabled = event.currentTarget?.checked === true;
      const { error } = await window.sb.rpc("set_show_family_players", { p_enabled: enabled });
      if (error) return H.toast(error.message, "error");
      await this.loadProfile();
      await this.loadPublicProfiles();
      H.toast(enabled ? "Mode Famille affiché" : "Mode Famille masqué", "success");
      await this.renderProfile();
    });

    H.$("#createFamilyInviteBtn")?.addEventListener("click", async () => {
      const { data, error } = await window.sb.rpc("create_family_invite");
      if (error) return H.toast(error.message, "error");
      await this.loadMyFamilyInvites();
      const code = Array.isArray(data) ? data[0]?.code : data?.code;
      H.toast(code ? `Invitation créée : ${code}` : "Invitation créée", "success");
      await this.renderProfile();
    });


    H.$$("[data-copy-family-invite]").forEach((button) => {
      button.addEventListener("click", async () => {
        await this.copyTextToClipboard(button.dataset.copyFamilyInvite, "Coupon Famille copié");
      });
    });

    H.$$("[data-unblock-user-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const { error } = await window.sb.rpc("unblock_user", { p_blocked_id: button.dataset.unblockUserId });
        if (error) return H.toast(error.message, "error");
        await this.loadBlockedUsers();
        await this.renderProfile();
      });
    });

    H.$("#profileForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const pseudo = String(formData.get("pseudo") || profile.pseudo || "").trim();
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
      this.loadWinnerPrediction(),
      this.loadPlayerScoreRows(),
      this.loadOwlMessages()
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
      .on("postgres_changes", { event: "*", schema: "public", table: "manual_user_badges" }, async () => {
        await this.loadManualBadges();
        if (["achievements", "teams", "leaderboard", "home"].includes(this.state.currentView)) await this.loadView(this.state.currentView);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "prediction_points" }, async () => {
        await this.refreshCurrentViewFromRealtime("points");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "predictions" }, async () => {
        await this.loadMyPredictions();
        await this.loadVisiblePredictions();
        this.syncAchievementNotifications();
        if (["home", "matches", "mypredictions", "leaderboard"].includes(this.state.currentView)) await this.loadView(this.state.currentView === "mypredictions" ? "matches" : this.state.currentView);
        this.syncAchievementNotifications();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "winner_predictions" }, async () => {
        await this.refreshCurrentViewFromRealtime("winner");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "second_winner_predictions" }, async () => {
        await this.loadSecondWinnerPrediction();
        await this.refreshCurrentViewFromRealtime("second-winner");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, async () => {
        await this.loadAppSettings();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "team_chat_messages" }, async (payload) => {
        await this.handleTeamChatRealtime(payload);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "team_chat_reactions" }, async () => {
        if (this.state.currentView === "teams") {
          await this.loadTeamChatMessages();
          const list = H.$("#teamChatList");
          if (list) {
            const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
            list.innerHTML = this.state.teamChatMessages.map((message) => this.chatMessageHtml(message)).join("") || `<p class="muted empty-chat">Aucun message ici pour l’instant. Ouvre le bal 🦉</p>`;
            this.bindChatMessageActions();
            if (nearBottom) list.scrollTop = list.scrollHeight;
          }
        } else {
          await this.refreshTeamChatUnreadIndicator();
        }
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
