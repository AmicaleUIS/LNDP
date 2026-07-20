
// ============================================================
// LE NID DES PRONOS — BILAN PDF V1.9.17
// ============================================================

const H = window.Helpers;

const BilanPDF = {
  state: {
    session: null,
    adminProfile: null,
    report: null,
    competition: {
      leaderboard: [],
      predictions: [],
      profiles: [],
      matches: [],
      manualBadges: [],
      userBadges: [],
      winnerPicks: [],
      secondWinnerPicks: [],
      miniRecordCounts: [],
      settings: {}
    },
    playerId: null,
    allMode: false,
    refreshTimer: null,
    realtimeChannel: null
  },

  async init() {
    this.state.session = await Auth.requireSession();
    if (!this.state.session) return;

    const params = new URLSearchParams(window.location.search);
    this.state.allMode = params.get("all") === "1";
    this.state.playerId = params.get("player") || this.state.session.user.id;

    await this.loadAdminProfile();
    if (this.state.allMode && !this.isSuperAdmin()) {
      this.renderError("Accès réservé", "L’export groupé des bilans est réservé au super admin.");
      return;
    }
    if (!this.state.allMode && !this.isSuperAdmin() && this.state.playerId !== this.state.session.user.id) {
      this.renderError("Accès réservé", "Ce bilan est consultable par le super admin pour le moment.");
      return;
    }

    H.$("#refreshBilanBtn")?.addEventListener("click", () => this.state.allMode ? this.loadAllAndRender() : this.loadAndRender());
    H.$("#printBilanBtn")?.addEventListener("click", async () => {
      await this.waitForImages();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.print();
    });
    const allButton = H.$("#printAllBilansBtn");
    if (allButton && this.isSuperAdmin() && !this.state.allMode) {
      allButton.hidden = false;
      allButton.addEventListener("click", () => window.open("bilan.html?all=1&preview=admin", "_blank", "noopener"));
    }

    if (this.state.allMode) {
      document.body.classList.add("bilan-batch-body");
      const title = H.$(".bilan-toolbar h1");
      if (title) title.innerHTML = '<img class="owl-icon title-icon" src="assets/icons/owl-png/bilan.png" alt="" aria-hidden="true"> Tous les bilans PDF';
      const printButton = H.$("#printBilanBtn");
      if (printButton) printButton.textContent = "Imprimer le lot / PDF";
      await this.loadAllAndRender();
    } else {
      await this.loadAndRender();
      this.setupRealtime();
    }

    if (params.get("print") === "1") {
      await this.waitForImages();
      window.setTimeout(() => window.print(), 500);
    }
  },

  isSuperAdmin() {
    return this.state.adminProfile?.role === "super_admin";
  },

  async loadAdminProfile() {
    const { data, error } = await window.sb
      .from("profiles")
      .select("id,email,pseudo,role,player_scope,is_active,is_banned")
      .eq("id", this.state.session.user.id)
      .single();
    if (error) throw error;
    this.state.adminProfile = data;
  },

  async loadAndRender() {
    const root = H.$("#bilanRoot");
    if (root) {
      root.classList.remove("batch-mode");
      root.classList.add("is-loading");
    }

    await this.loadCompetitionSnapshot();
    const report = await this.fetchPlayerReport(this.state.playerId);
    if (!report) return;

    this.state.report = report;
    await this.enrichReportWithChampionFallback();
    this.render();
    await this.waitForImages();
    if (root) root.classList.remove("is-loading");
  },

  async fetchPlayerReport(playerId, { silent = false } = {}) {
    const { data, error } = await window.sb.rpc("admin_get_final_player_report", {
      p_user_id: playerId
    });

    if (error) {
      if (!silent) this.renderError("Bilan indisponible", `${error.message || "Erreur inconnue"}<br><br>Lance le patch SQL V1.9.17 si ce n’est pas encore fait.`);
      else console.warn(`Bilan ignoré pour ${playerId}`, error);
      return null;
    }
    return data || {};
  },

  async loadAllAndRender() {
    const root = H.$("#bilanRoot");
    if (!root) return;
    root.classList.add("is-loading", "batch-mode");
    root.innerHTML = `<section class="bilan-loading"><div class="loader-owl">🦉</div><h2>Le greffier rassemble tous les carnets...</h2><p class="muted" id="batchProgress">Préparation de la volière.</p></section>`;

    await this.loadCompetitionSnapshot();
    const competition = this.competitionSnapshot();
    const players = (competition.leaderboard || [])
      .map((row) => ({ ...this.profileForUser(row.user_id || row.id, row), ...row, id: row.user_id || row.id }))
      .filter((row) => row.id);

    if (!players.length) {
      this.renderError("Aucun joueur", "Aucun joueur officiel n’est disponible pour l’export groupé.");
      return;
    }

    const documents = [];
    const originalPlayerId = this.state.playerId;
    const originalReport = this.state.report;
    for (let index = 0; index < players.length; index += 1) {
      const player = players[index];
      const progress = H.$("#batchProgress");
      if (progress) progress.textContent = `Carnet ${index + 1}/${players.length} : ${player.pseudo || "Joueur"}`;
      const report = await this.fetchPlayerReport(player.id, { silent: true });
      if (!report) continue;
      this.state.playerId = player.id;
      this.state.report = report;
      await this.enrichReportWithChampionFallback();
      documents.push(this.buildDocumentHtml());
    }

    this.state.playerId = originalPlayerId;
    this.state.report = originalReport;
    root.innerHTML = `<div class="batch-print-note no-print"><strong>${documents.length} carnet(s) prêts.</strong><span>Utilise « Imprimer le lot / PDF » : un seul PDF contiendra tous les joueurs, sans avoir à les ouvrir un par un.</span></div>${documents.join("")}`;
    root.classList.remove("is-loading");
    await this.waitForImages();
  },

  async waitForImages() {
    const images = [...document.images];
    images.forEach((img) => {
      img.loading = "eager";
      img.removeAttribute("loading");
      if (img.getAttribute("src")) img.src = img.getAttribute("src");
    });
    if (!images.length) return;
    await Promise.all(images.map(async (img) => {
      if (img.complete && img.naturalWidth > 0) return;
      if (typeof img.decode === "function") {
        try { await img.decode(); return; } catch (error) { /* secours load/error */ }
      }
      await new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
        window.setTimeout(resolve, 5000);
      });
    }));
  },

  setupRealtime() {
    if (!this.isSuperAdmin()) return;
    if (this.state.realtimeChannel) window.sb.removeChannel(this.state.realtimeChannel);

    const refresh = () => {
      clearTimeout(this.state.refreshTimer);
      this.state.refreshTimer = setTimeout(() => this.loadAndRender(), 500);
    };

    this.state.realtimeChannel = window.sb
      .channel(`bilan-pdf-${this.state.playerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "predictions", filter: `user_id=eq.${this.state.playerId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "prediction_points", filter: `user_id=eq.${this.state.playerId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "winner_predictions", filter: `user_id=eq.${this.state.playerId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, refresh)
      .subscribe();
  },


  async enrichReportWithChampionFallback() {
    const report = this.state.report || {};
    const competition = this.competitionSnapshot();
    const dynamic = (competition.winnerPicks || []).find((row) => String(row.user_id) === String(this.state.playerId));
    const fromView = dynamic || await this.fetchChampionFromView().catch(() => null);
    const fromTable = fromView || await this.fetchChampionFromTable().catch(() => null);

    if (fromTable) {
      this.state.report = {
        ...report,
        champion_prediction: this.championPickCurrent(this.normalizeChampionPrediction(fromTable), this.championFirstBonusPoints())
      };
    }
  },

  normalizeChampionPrediction(row = null) {
    if (!row) return null;
    return {
      user_id: row.user_id,
      competition_id: row.competition_id,
      predicted_team_id: row.predicted_team_id,
      predicted_team_name: row.predicted_team_name || row.team_name || row.name || row.predicted_team?.name,
      predicted_team_short_name: row.predicted_team_short_name || row.predicted_team?.short_name,
      predicted_team_country_code: row.predicted_team_country_code || row.predicted_team?.country_code,
      predicted_team_flag_url: row.predicted_team_flag_url || row.predicted_team?.flag_url,
      actual_winner_team_id: row.actual_winner_team_id,
      actual_winner_team_name: row.actual_winner_team_name,
      points_total: this.n(row.points_total, 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
      locked_at: row.locked_at
    };
  },

  normalizeSecondChampionPrediction(row = null) {
    if (!row) return null;
    return {
      user_id: row.user_id,
      competition_id: row.competition_id,
      predicted_team_id: row.predicted_team_id,
      predicted_team_name: row.predicted_team_name || row.team_name || row.name || row.predicted_team?.name,
      predicted_team_short_name: row.predicted_team_short_name || row.predicted_team?.short_name,
      predicted_team_country_code: row.predicted_team_country_code || row.predicted_team?.country_code,
      predicted_team_flag_url: row.predicted_team_flag_url || row.predicted_team?.flag_url,
      actual_winner_team_id: row.actual_winner_team_id,
      actual_winner_team_name: row.actual_winner_team_name,
      points_total: this.n(row.points_total, 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
      locked_at: row.locked_at
    };
  },

  async fetchChampionFromView() {
    const { data, error } = await window.sb
      .from("v_winner_predictions")
      .select("*")
      .eq("user_id", this.state.playerId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return data || null;
  },

  async fetchChampionFromTable() {
    const { data, error } = await window.sb
      .from("winner_predictions")
      .select("user_id,competition_id,predicted_team_id,locked_at,created_at,updated_at")
      .eq("user_id", this.state.playerId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.predicted_team_id) return null;

    const { data: team } = await window.sb
      .from("football_teams")
      .select("id,name,short_name,country_code,flag_url")
      .eq("id", data.predicted_team_id)
      .maybeSingle();

    return {
      ...data,
      predicted_team_name: team?.name || "Équipe choisie",
      predicted_team_short_name: team?.short_name,
      predicted_team_country_code: team?.country_code,
      predicted_team_flag_url: team?.flag_url,
      points_total: 0
    };
  },

  hasPrediction(row) {
    return Boolean(row && (
      row.prediction_id
      || row.home_score_pred !== null && row.home_score_pred !== undefined
      || row.away_score_pred !== null && row.away_score_pred !== undefined
      || row.qualified_team_pred
    ));
  },

  allPredictionRows({ includeTest = true } = {}) {
    return (this.state.report.predictions || []).filter((row) =>
      (includeTest || !row.is_test_match) && this.hasPrediction(row)
    );
  },

  badgeCatalogLite() {
    return {
      "egg-hatched": { emoji: "🥚", title: "Éclos de l’œuf", text: "Premier prono validé. La coquille craque, la mini-chouette débarque." },
      "young-feathers": { emoji: "🪶", title: "Jeune plumage", text: "10 pronos validés. Ça commence à ressembler à une vraie couvée." },
      "half-nest": { emoji: "🪹", title: "Mi-nid rempli", text: "La moitié des pronos connus sont rentrés." },
      "three-quarter-perch": { emoji: "🌿", title: "Perchoir presque plein", text: "75 % des pronos connus sont posés." },
      "all-picks-in": { emoji: "🔒", title: "Couvée complète", text: "Tous les pronos connus sont posés." },
      "champion-picked": { emoji: "🏆", title: "Champion choisi", text: "Le hibou a désigné son futur champion avant le grand envol." },
      "second-champion-picked": { emoji: "🪶", title: "Deuxième plume posée", text: "2e champion choisi après les poules. Le Hibou a sorti le stylo de secours." },
      "second-final-winner-oracle": { emoji: "🦉", title: "Rattrapage royal", text: "Le 2e champion choisi après les poules remporte la compétition." },
      "preparation-two-picks": { emoji: "🧪", title: "Préparation du nid", text: "Les matchs de préparation test ont été pronostiqués." },
      "prep-good-pick": { emoji: "✅", title: "Test concluant", text: "Au moins un match test a rapporté des points." },
      "first-flight": { emoji: "🛫", title: "Premier envol", text: "Premier match comptabilisé." },
      "first-perfect": { emoji: "🎯", title: "Œil de chouette", text: "Premier score exact trouvé." },
      "surgical-beak": { emoji: "🔪", title: "Bec chirurgical", text: "3 scores exacts au total." },
      "owl-sniper": { emoji: "🦉", title: "Sniper à plumes", text: "10 scores exacts. Le nid demande une vérification VAR." },
      "accountant": { emoji: "📒", title: "Hibou comptable", text: "10 bons résultats. Pas flamboyant, mais rentable." },
      "geometry": { emoji: "📐", title: "Géomètre du nid", text: "5 bons écarts trouvés." },
      "knife-edge": { emoji: "⚔️", title: "Match couperet maîtrisé", text: "Premier bon qualifié en phase finale." },
      "gold-nest": { emoji: "🏅", title: "Nid doré", text: "50 points ou plus. Le nid commence à briller." },
      "platinum-nest": { emoji: "💎", title: "Nid platine", text: "100 points ou plus. La branche plie." },
      "streak-3-exact": { emoji: "🔥", title: "Triplé du Grand-Duc", text: "3 scores exacts d’affilée. Ça sent la sorcellerie." },
      "zero-tunnel": { emoji: "🌫️", title: "Tunnel du néant", text: "5 matchs à zéro point. Même la chouette cherche la lumière." },
      "empty-nest": { emoji: "🪹", title: "Nid vide", text: "Une constance dans le brouillard que le Nid respecte." }
    };
  },

  reportBadgeCandidates() {
    const report = this.state.report || {};
    const profile = report.profile || {};
    const raw = [
      report.badges,
      report.achievements,
      report.exploits,
      report.unlocked_badges,
      profile.badges,
      profile.achievements,
      profile.unlocked_badges,
      profile.featured_badge_ids
    ].filter(Boolean).flat();

    const catalog = this.badgeCatalogLite();
    return raw.map((item) => {
      if (typeof item === "string") {
        const found = catalog[item];
        return found ? { id: item, ...found, file: this.badgeAsset(item) } : { id: item, emoji: "🏅", title: item, text: "Exploit enregistré dans le Nid.", file: this.badgeAsset(item) };
      }
      if (item && typeof item === "object") {
        const id = item.id || item.badge_id || item.key || item.code || item.title;
        const found = catalog[id];
        return {
          id,
          emoji: item.emoji || found?.emoji || "🏅",
          title: item.title || item.name || found?.title || id || "Exploit",
          text: item.text || item.description || found?.text || "Exploit enregistré dans le Nid.",
          file: item.file || item.icon || item.asset || this.badgeAsset(id)
        };
      }
      return null;
    }).filter(Boolean);
  },


  badgeAsset(id) {
    if (!id) return "assets/icons/owl-png/badges.png";
    const known = new Set([
      "accountant","all-picks-in","anti-sniper","architect","autopilot","big-owch","blackout","broken-compass",
      "bus-stuck","cold-perch","comeback","cracked-wall","crystal-wing","draw-master","draw-trap","egg-hatched",
      "empty-nest","feather-harvest","final-perfect-score","final-winner-oracle","fireworks","first-flight",
      "first-perfect","full-perch","geometry","gold-nest","half-nest","high-branch","knife-edge","last-wingbeat",
      "machine","many-active-days","myopic","night-owl","no-crumbs","no-net","owl-sniper","platinum-nest",
      "pool-crystal","pool-disaster","prep-good-pick","preparation-two-picks","qualified-oracle","round16-lord",
      "safe-flight","scenario","seven-day-streak","small-score","streak-3-exact","streak-5-exact","surgical-beak",
      "three-day-ritual","three-quarter-perch","wet-feathers","wrong-exit","young-feathers","zero-tunnel"
    ]);
    if (known.has(id)) return `assets/badges/${id}.png`;
    if (id === "champion-picked" || id === "second-final-winner-oracle") return "assets/icons/owl-png/coupe-du-monde.png";
    if (id === "second-champion-picked") return "assets/icons/owl-png/badges.png";
    return "assets/icons/owl-png/badges.png";
  },

  matchFlag(row, side) {
    const flagUrl = row?.[`${side}_team_flag_url`] || row?.[`${side}_flag_url`];
    const countryCode = row?.[`${side}_team_country_code`] || row?.[`${side}_country_code`];
    const name = row?.[`${side}_team_short_name`] || row?.[`${side}_team_name`] || side;
    if (H.flagImgHtml) {
      return H.flagImgHtml({
        flagUrl,
        countryCode,
        shortName: name,
        name,
        className: "team-flag-img bilan-flag"
      });
    }
    return countryCode ? `<span class="bilan-flag-code">${this.e(countryCode)}</span>` : "";
  },

  phaseKey(row = {}) {
    const stage = row.stage || "group";
    if (stage === "group") return `Journée de poule ${row.pool_round || row.match_day || "?"}`;
    const labels = {
      round_of_32: "16èmes de finale",
      round_of_16: "8èmes de finale",
      quarter: "Quarts de finale",
      semi: "Demi-finales",
      third_place: "Petite finale",
      final: "Finale"
    };
    return labels[stage] || H.stageLabel?.(stage) || stage;
  },

  chunk(array = [], size = 24) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
    return chunks;
  },

  renderError(title, message) {
    const root = H.$("#bilanRoot");
    if (!root) return;
    root.innerHTML = `
      <section class="bilan-loading">
        <div class="loader-owl">🦉</div>
        <h2>${H.escapeHtml(title)}</h2>
        <p class="muted">${message}</p>
      </section>`;
  },

  e(value, fallback = "—") {
    return H.escapeHtml(value === null || value === undefined || value === "" ? fallback : String(value));
  },

  n(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },


  emptyCompetitionSnapshot() {
    return { leaderboard: [], predictions: [], profiles: [], matches: [], manualBadges: [], userBadges: [], winnerPicks: [], secondWinnerPicks: [], miniRecordCounts: [], settings: {} };
  },

  competitionSnapshot() {
    const competition = this.state.competition || this.emptyCompetitionSnapshot();
    return {
      leaderboard: Array.isArray(competition.leaderboard) ? competition.leaderboard : [],
      predictions: Array.isArray(competition.predictions) ? competition.predictions : [],
      profiles: Array.isArray(competition.profiles) ? competition.profiles : [],
      matches: Array.isArray(competition.matches) ? competition.matches : [],
      manualBadges: Array.isArray(competition.manualBadges) ? competition.manualBadges : [],
      userBadges: Array.isArray(competition.userBadges) ? competition.userBadges : [],
      winnerPicks: Array.isArray(competition.winnerPicks) ? competition.winnerPicks : [],
      secondWinnerPicks: Array.isArray(competition.secondWinnerPicks) ? competition.secondWinnerPicks : [],
      miniRecordCounts: Array.isArray(competition.miniRecordCounts) ? competition.miniRecordCounts : [],
      settings: competition.settings && typeof competition.settings === "object" ? competition.settings : {}
    };
  },

  async selectAllRows(table, configure = (query) => query, pageSize = 1000) {
    const rows = [];
    for (let from = 0; ; from += pageSize) {
      let query = window.sb.from(table).select("*");
      query = configure(query).range(from, from + pageSize - 1);
      const { data, error } = await query;
      if (error) throw error;
      const page = data || [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows;
  },

  settingNumber(key, fallback = 0) {
    const raw = this.competitionSnapshot().settings?.[key];
    const value = raw && typeof raw === "object" ? (raw.points ?? raw.value ?? raw.amount) : raw;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
  },

  championFirstBonusPoints() {
    return this.settingNumber("champion_bonus_initial_points", 30);
  },

  championSecondBonusPoints() {
    return this.settingNumber("champion_bonus_second_points", 15);
  },

  async loadCompetitionSnapshot() {
    const safe = async (promise, fallback = []) => {
      try {
        return await promise;
      } catch (error) {
        console.warn("Bilan collector · donnée compétition indisponible", error);
        return fallback;
      }
    };

    // La compétition est terminée : les joueurs doivent pouvoir construire leur
    // propre carnet depuis les vues publiques, sans dépendre du compte admin.
    const [leaderboard, predictions, profiles, matches, manualBadges, winnerPicks, secondWinnerPicks, miniRecordCounts, settingRows] = await Promise.all([
      safe(this.selectAllRows("v_leaderboard_overall", (query) => query.order("rank"))),
      safe(this.selectAllRows("v_visible_predictions")),
      safe(this.selectAllRows("v_public_profiles")),
      safe(this.selectAllRows("v_matches", (query) => query.order("kickoff_at", { ascending: true }))),
      this.isSuperAdmin() ? safe(this.selectAllRows("manual_user_badges")) : Promise.resolve([]),
      safe(this.selectAllRows("v_winner_predictions")),
      safe(this.selectAllRows("v_second_winner_predictions")),
      safe(this.selectAllRows("v_mini_record_prediction_counts")),
      safe(this.selectAllRows("app_settings", (query) => query.in("key", ["champion_bonus_initial_points", "champion_bonus_second_points"])))
    ]);

    const settings = Object.fromEntries((settingRows || []).map((row) => [row.key, row.value]));
    this.state.competition = { leaderboard, predictions, profiles, matches, manualBadges, userBadges: [], winnerPicks, secondWinnerPicks, miniRecordCounts, settings };
  },

  canonicalMatch(row = {}) {
    return this.competitionSnapshot().matches.find((match) => String(match.id) === String(row.match_id || row.id)) || {};
  },

  mergePredictionMatch(prediction = {}) {
    const match = this.canonicalMatch(prediction);
    return {
      ...prediction,
      ...match,
      match_id: prediction.match_id || match.id,
      prediction_id: prediction.prediction_id || prediction.id,
      home_score_pred: prediction.home_score_pred,
      away_score_pred: prediction.away_score_pred,
      qualified_team_pred: prediction.qualified_team_pred,
      qualified_team_name: prediction.qualified_team_name,
      points_total: prediction.points_total,
      is_exact_score: prediction.is_exact_score,
      is_good_result: prediction.is_good_result,
      is_good_goal_diff: prediction.is_good_goal_diff,
      is_good_qualified: prediction.is_good_qualified,
      prediction_created_at: prediction.prediction_created_at || prediction.created_at,
      prediction_updated_at: prediction.prediction_updated_at || prediction.updated_at,
      user_id: prediction.user_id,
      match
    };
  },

  officialPredictions() {
    return (this.state.report.predictions || [])
      .map((row) => this.mergePredictionMatch(row))
      .filter((row) => !row.is_test_match);
  },

  showFamilyContext() {
    const player = this.state.report.profile || {};
    return player.role === "family" || player.player_scope === "family" || player.show_family_players === true;
  },

  isFamilyProfile(profile = {}) {
    return Boolean(profile.role === "family" || profile.player_scope === "family" || profile.invited_by || profile.family_invite_id || profile.family_invite_code);
  },

  isFamilyUniverseProfile(profile = {}) {
    return this.isFamilyProfile(profile) || profile.show_family_players === true;
  },

  actualWinnerTeamId() {
    const finalMatch = this.competitionSnapshot().matches.find((match) => match.stage === "final" && match.status === "finished");
    if (finalMatch?.winner_team_id) return String(finalMatch.winner_team_id);
    if (finalMatch) {
      const home = Number(finalMatch.home_score);
      const away = Number(finalMatch.away_score);
      if (Number.isFinite(home) && Number.isFinite(away)) {
        if (home > away && finalMatch.home_team_id) return String(finalMatch.home_team_id);
        if (away > home && finalMatch.away_team_id) return String(finalMatch.away_team_id);
      }
    }
    const knownPick = [...this.competitionSnapshot().winnerPicks, ...this.competitionSnapshot().secondWinnerPicks]
      .find((pick) => pick.actual_winner_team_id);
    return knownPick?.actual_winner_team_id ? String(knownPick.actual_winner_team_id) : null;
  },

  championPickCurrent(row = null, bonus = 0) {
    if (!row) return null;
    const pick = row === null ? null : { ...row };
    const winnerId = this.actualWinnerTeamId();
    const predictedId = pick.predicted_team_id ? String(pick.predicted_team_id) : null;
    return {
      ...pick,
      actual_winner_team_id: pick.actual_winner_team_id || winnerId,
      points_total: winnerId && predictedId && winnerId === predictedId ? Number(bonus || 0) : 0
    };
  },

  currentWinnerPicks() {
    return this.competitionSnapshot().winnerPicks.map((pick) => this.championPickCurrent(this.normalizeChampionPrediction(pick), this.championFirstBonusPoints()));
  },

  currentSecondWinnerPicks() {
    return this.competitionSnapshot().secondWinnerPicks.map((pick) => this.championPickCurrent(this.normalizeSecondChampionPrediction(pick), this.championSecondBonusPoints()));
  },

  championPointsForUser(userId) {
    const first = this.currentWinnerPicks().find((pick) => String(pick.user_id) === String(userId));
    const second = this.currentSecondWinnerPicks().find((pick) => String(pick.user_id) === String(userId));
    return this.n(first?.points_total) + this.n(second?.points_total);
  },

  profileUniverseIds(family = false) {
    const competition = this.competitionSnapshot();
    const ids = new Set();
    (competition.profiles || []).forEach((profile) => {
      const id = profile.id || profile.user_id;
      if (!id) return;
      const eligible = family ? this.isFamilyUniverseProfile(profile) : !this.isFamilyProfile(profile);
      if (eligible) ids.add(String(id));
    });
    if (!family) (competition.leaderboard || []).forEach((row) => {
      const id = row.user_id || row.id;
      if (id && !this.isFamilyProfile(this.profileForUser(id, row))) ids.add(String(id));
    });
    return ids;
  },

  rankRows(rows = []) {
    let previousKey = null;
    let previousRank = 0;
    return rows.map((row, index) => {
      const key = `${row.total_points}|${row.exact_scores}|${row.good_results}|${row.good_goal_diffs}`;
      const rank = key === previousKey ? previousRank : index + 1;
      previousKey = key;
      previousRank = rank;
      return { ...row, rank };
    });
  },

  finalStandings({ family = false } = {}) {
    const ids = this.profileUniverseIds(family);
    const summaries = [...ids].map((id) => {
      const profile = this.profileForUser(id, (this.competitionSnapshot().leaderboard || []).find((row) => String(row.user_id || row.id) === id) || {});
      const stats = this.playerSummaryFromRows(id);
      const champion_points = this.championPointsForUser(id);
      return {
        user_id: id,
        ...profile,
        pseudo: profile.pseudo || "Joueur",
        match_points: stats.total,
        champion_points,
        total_points: stats.total + champion_points,
        exact_scores: stats.exact,
        good_results: stats.good,
        good_goal_diffs: stats.diff,
        good_qualified: stats.qualified,
        scored_matches: stats.scoredMatches,
        average_points: stats.scoredMatches ? stats.total / stats.scoredMatches : 0
      };
    }).sort((a, b) =>
      b.total_points - a.total_points
      || b.exact_scores - a.exact_scores
      || b.good_results - a.good_results
      || b.good_goal_diffs - a.good_goal_diffs
      || String(a.pseudo).localeCompare(String(b.pseudo), "fr")
    );
    return this.rankRows(summaries);
  },

  effectiveLeaderboard(player = this.state.report?.profile || {}) {
    const family = this.isFamilyProfile(player);
    const row = this.finalStandings({ family }).find((item) => String(item.user_id) === String(this.state.playerId));
    return row || this.state.report?.leaderboard || {};
  },

  scoredRows() {
    return this.officialPredictions().filter((row) => row.status === "finished" && row.points_total !== null && row.points_total !== undefined);
  },

  stats() {
    const rows = this.scoredRows();
    const total = rows.reduce((sum, row) => sum + this.n(row.points_total), 0);
    const exact = rows.filter((row) => row.is_exact_score).length;
    const good = rows.filter((row) => row.is_good_result).length;
    const diff = rows.filter((row) => row.is_good_goal_diff).length;
    const qualified = rows.filter((row) => row.is_good_qualified).length;
    const zeros = rows.filter((row) => this.n(row.points_total) === 0).length;
    const best = rows.slice().sort((a, b) => this.n(b.points_total) - this.n(a.points_total) || new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0))[0] || null;
    const worst = rows.slice().sort((a, b) => this.n(a.points_total) - this.n(b.points_total) || this.missDistance(b) - this.missDistance(a))[0] || null;
    const bestDay = this.dayDetails(rows, true);
    const worstDay = this.dayDetails(rows, false);
    const casseroleRows = this.casseroleRows(rows);
    const maximumPoints = rows.reduce((sum, row) => sum + this.maximumMatchPoints(row), 0);
    return { rows, total, exact, good, diff, qualified, zeros, best, worst, bestDay, worstDay, casseroleRows, maximumPoints, exactRate: rows.length ? exact / rows.length : 0, zeroRate: rows.length ? zeros / rows.length : 0, average: rows.length ? total / rows.length : 0, favoriteHour: this.favoriteHour(this.officialPredictions()), officialMatchCount: this.competitionSnapshot().matches.filter((match) => !match.is_test_match).length };
  },

  maximumMatchPoints(row = {}) {
    if (row.stage === "final") return 14;
    return row.stage && row.stage !== "group" ? 7 : 5;
  },

  radarMetrics(stats) {
    const count = Math.max(1, stats.rows.length);
    const goodOutcomes = stats.rows.filter((row) => row.is_good_result || row.is_exact_score).length;
    return {
      exact: Math.round((stats.exact / count) * 100),
      outcomes: Math.round((goodOutcomes / count) * 100),
      yield: stats.maximumPoints ? Math.round((stats.total / stats.maximumPoints) * 100) : 0,
      survival: Math.round(((stats.rows.length - stats.zeros) / count) * 100)
    };
  },

  missDistance(row = {}) {
    return Math.abs(this.n(row.home_score_pred) - this.n(row.home_score))
      + Math.abs(this.n(row.away_score_pred) - this.n(row.away_score));
  },

  outcomeFromScores(home, away) {
    const h = Number(home);
    const a = Number(away);
    if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
    if (h > a) return "home";
    if (a > h) return "away";
    return "draw";
  },

  isOppositeResult(row = {}) {
    const pred = this.outcomeFromScores(row.home_score_pred, row.away_score_pred);
    const real = this.outcomeFromScores(row.home_score, row.away_score);
    return (pred === "home" && real === "away") || (pred === "away" && real === "home");
  },

  casseroleRows(rows = []) {
    return rows
      .filter((row) => this.n(row.points_total) === 0)
      .map((row) => ({
        ...row,
        miss_distance: this.missDistance(row),
        opposite_result: this.isOppositeResult(row),
        casserole_score: this.missDistance(row) + (this.isOppositeResult(row) ? 4 : 0)
      }))
      .sort((a, b) => b.casserole_score - a.casserole_score || new Date(b.kickoff_at || 0) - new Date(a.kickoff_at || 0));
  },

  playerSignature(stats) {
    if (stats.rows.length >= 5 && stats.exactRate >= .35) return { title: "Oracle du score exact", subtitle: "Il ne prédit pas, il grave le score dans l’écorce.", tone: "gold" };
    if (stats.casseroleRows?.[0]?.opposite_result) return { title: "Grand inverseur de réalité", subtitle: "Quand le Nid attendait un sens, il a ouvert la porte opposée.", tone: "orange" };
    if (stats.zeroRate >= .45 && stats.rows.length >= 4) return { title: "Marcheur du brouillard", subtitle: "Beaucoup de zéro, mais une résistance morale admirable.", tone: "fog" };
    if (this.streak(stats.rows, (r) => this.n(r.points_total) > 0) >= 5) return { title: "Vol sans trou d’air", subtitle: "Toujours quelque chose dans le bec.", tone: "green" };
    if (stats.average >= 3) return { title: "Machine à points douce", subtitle: "Pas toujours spectaculaire, mais souvent rentable.", tone: "blue" };
    return { title: "Chouette imprévisible", subtitle: "Un mélange dangereux de flair, d’instinct et de casseroles.", tone: "purple" };
  },

  bestDay(rows) {
    const byDay = new Map();
    rows.forEach((row) => {
      const key = row.match_day || (row.kickoff_at || "").slice(0, 10) || "Sans date";
      const item = byDay.get(key) || { key, points: 0, matches: 0 };
      item.points += this.n(row.points_total);
      item.matches += 1;
      byDay.set(key, item);
    });
    return [...byDay.values()].sort((a,b) => b.points - a.points || b.matches - a.matches)[0] || null;
  },

  streak(rows, predicate) {
    let current = 0;
    let best = 0;
    rows.forEach((row) => {
      if (predicate(row)) {
        current += 1;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    });
    return best;
  },


  acquiredBadgeCandidates() {
    const competition = this.competitionSnapshot();
    const rows = [
      ...(competition.manualBadges || []),
      ...(competition.userBadges || [])
    ].filter((row) => !row.user_id || String(row.user_id) === String(this.state.playerId));
    const catalog = this.badgeCatalogLite();
    return rows.map((row) => {
      const id = row.badge_id || row.badge || row.achievement_id || row.id || row.key || row.code;
      if (!id) return null;
      const found = catalog[id] || {};
      return {
        id,
        emoji: row.emoji || found.emoji || "🏅",
        title: row.title || found.title || id,
        text: row.reason || row.description || found.text || "Badge acquis dans le Nid.",
        file: row.file || row.icon || row.asset || found.file || this.badgeAsset(id),
        acquired_at: row.granted_at || row.unlocked_at || row.created_at || row.updated_at || null
      };
    }).filter(Boolean);
  },

  unlockedBadges(stats, champion = null) {
    const badges = [];
    const used = new Set();
    const catalog = this.badgeCatalogLite();
    const push = (id, condition = true, override = {}) => {
      if (!condition || used.has(id)) return;
      const base = catalog[id] || {};
      badges.push({ id, emoji: override.emoji || base.emoji || "🏅", title: override.title || base.title || this.titleFromBadgeId(id), text: override.text || base.text || "Exploit enregistré dans le Nid.", file: override.file || base.file || this.badgeAsset(id), acquired_at: override.acquired_at || override.unlockedAt || null });
      used.add(id);
    };
    [...this.reportBadgeCandidates(), ...this.acquiredBadgeCandidates()].forEach((badge) => {
      const id = badge.id || badge.title;
      if (!id || used.has(id)) return;
      badges.push({ ...badge, title: badge.title || this.titleFromBadgeId(id), file: badge.file || this.badgeAsset(id), acquired_at: badge.acquired_at || badge.unlockedAt || badge.granted_at || badge.created_at || badge.updated_at || null });
      used.add(id);
    });
    const officialPredictions = this.allPredictionRows({ includeTest: false });
    const allPredictions = this.allPredictionRows({ includeTest: true });
    const testPredictions = allPredictions.filter((row) => row.is_test_match);
    const officialMatchCount = Math.max(stats.officialMatchCount || 0, (this.competitionSnapshot().matches || []).filter((m) => !m.is_test_match).length);
    const predictionCount = officialPredictions.length;
    const championPicked = Boolean(champion?.predicted_team_id || champion?.predicted_team_name);
    const secondWinner = (this.competitionSnapshot().secondWinnerPicks || []).find((row) => String(row.user_id) === String(this.state.playerId)) || null;
    const secondChampionPicked = Boolean(secondWinner?.predicted_team_id || secondWinner?.predicted_team_name);
    const nthPredictionDate = (n) => officialPredictions.map((row) => this.predictionActivityDate(row)).filter(Boolean).sort((a, b) => a - b)[Math.max(0, n - 1)]?.toISOString() || null;

    push("egg-hatched", predictionCount >= 1, { acquired_at: nthPredictionDate(1) });
    push("young-feathers", predictionCount >= 10, { acquired_at: nthPredictionDate(10) });
    push("half-nest", officialMatchCount > 0 && predictionCount >= Math.ceil(officialMatchCount / 2), { acquired_at: nthPredictionDate(Math.ceil(officialMatchCount / 2)) });
    push("three-quarter-perch", officialMatchCount > 0 && predictionCount >= Math.ceil(officialMatchCount * 0.75), { acquired_at: nthPredictionDate(Math.ceil(officialMatchCount * 0.75)) });
    push("all-picks-in", officialMatchCount > 0 && predictionCount >= officialMatchCount, { acquired_at: nthPredictionDate(officialMatchCount) });
    push("champion-picked", championPicked, { text: `Champion choisi : ${champion?.predicted_team_name || "équipe enregistrée"}.`, acquired_at: champion?.locked_at || champion?.updated_at || champion?.created_at });
    push("second-champion-picked", secondChampionPicked, { text: `2e champion : ${secondWinner?.predicted_team_name || "équipe enregistrée"}.`, acquired_at: secondWinner?.locked_at || secondWinner?.updated_at || secondWinner?.created_at });
    const secondBonusPoints = this.championSecondBonusPoints();
    push("second-final-winner-oracle", secondBonusPoints > 0 && this.n(secondWinner?.points_total) === secondBonusPoints, { text: `Le 2e choix rapporte +${secondBonusPoints} points : ${secondWinner?.predicted_team_name || "équipe gagnante"}.`, acquired_at: secondWinner?.updated_at || secondWinner?.created_at });
    push("preparation-two-picks", testPredictions.length >= 2, { acquired_at: testPredictions[1]?.created_at || testPredictions[1]?.updated_at });
    push("prep-good-pick", testPredictions.some((row) => this.n(row.points_total) > 0 || row.is_exact_score || row.is_good_result || row.is_good_goal_diff || row.is_good_qualified));
    push("first-flight", stats.rows.length >= 1, { acquired_at: stats.rows[0]?.kickoff_at });
    push("first-perfect", stats.exact >= 1, { acquired_at: stats.rows.find((r) => r.is_exact_score)?.kickoff_at });
    push("surgical-beak", stats.exact >= 3);
    push("owl-sniper", stats.exact >= 10);
    push("accountant", stats.good >= 10);
    push("geometry", stats.diff >= 5);
    push("knife-edge", stats.qualified >= 1);
    push("gold-nest", stats.total >= 50);
    push("platinum-nest", stats.total >= 100);
    push("streak-3-exact", this.streak(stats.rows, (r) => r.is_exact_score) >= 3);
    push("zero-tunnel", this.streak(stats.rows, (r) => this.n(r.points_total) === 0) >= 5);
    push("empty-nest", stats.rows.length >= 3 && stats.zeros === stats.rows.length);
    push("full-perch", Boolean(stats.bestDay && stats.bestDay.matches >= 4), { acquired_at: stats.bestDay?.key });
    push("big-owch", Boolean(stats.casseroleRows?.[0]?.opposite_result), { acquired_at: stats.casseroleRows?.[0]?.kickoff_at });

    return badges.map((badge, index) => ({ ...badge, orderIndex: index, acquiredDate: this.badgeDateValue(badge) })).sort((a, b) => {
      const ta = a.acquiredDate ? a.acquiredDate.getTime() : Number.POSITIVE_INFINITY;
      const tb = b.acquiredDate ? b.acquiredDate.getTime() : Number.POSITIVE_INFINITY;
      return ta - tb || a.orderIndex - b.orderIndex;
    });
  },

  funnyTitle(stats, leaderboard) {
    const rank = this.n(leaderboard?.rank, null);
    if (rank === 1) return "Grand-Duc suprême des pronos";
    if (rank && rank <= 3) return "Hibou d’or du perchoir";
    if (stats.exact >= 10) return "Bec chirurgical certifié";
    if (this.streak(stats.rows, (r) => this.n(r.points_total) === 0) >= 5) return "Chouette du brouillard";
    if (stats.average >= 3.5) return "Machine à points à plumes";
    return "Gardien courageux du Nid";
  },

  funnyQuote(stats, leaderboard) {
    const rank = this.n(leaderboard?.rank, null);
    if (rank === 1) return "Il a regardé le ballon, le ballon a obéi. Enfin presque.";
    if (stats.exact >= 10) return "Un hibou qui ne pronostique pas : il dissèque les cages au scalpel.";
    if (stats.zeros >= Math.max(5, stats.rows.length / 3)) return "Il a connu la brume, les poteaux, et la douce odeur de la casserole.";
    if (stats.average >= 3) return "Pas toujours discret, souvent dangereux, rarement loin du bon coup.";
    return "Un parcours fait de plumes, de sueur, et de quelques choix tactiquement discutables.";
  },

  scoreText(row) {
    if (row.home_score === null || row.home_score === undefined || row.away_score === null || row.away_score === undefined) return "—";
    return `${row.home_score}-${row.away_score}`;
  },

  predText(row) {
    if (row.home_score_pred === null || row.home_score_pred === undefined) return "—";
    return `${row.home_score_pred}-${row.away_score_pred}`;
  },

  resultLabel(row) {
    if (row.points_total === null || row.points_total === undefined) return { text: "Attente", cls: "mid" };
    if (row.is_exact_score) return { text: "Exact", cls: "good" };
    if (row.is_good_result || row.is_good_goal_diff || row.is_good_qualified) return { text: `+${row.points_total}`, cls: "mid" };
    return { text: "0", cls: "bad" };
  },

  cumulativeSeries(rows) {
    let total = 0;
    return rows.map((row, index) => {
      total += this.n(row.points_total);
      return { x: index + 1, y: total, label: row.match_day || String(index + 1) };
    });
  },


  competitionPredictionRows() {
    return this.competitionSnapshot().predictions
      .map((prediction) => this.mergePredictionMatch(prediction))
      .filter((row) => !row.is_test_match && row.status === "finished" && row.points_total !== null && row.points_total !== undefined);
  },

  profileForUser(userId, fallback = {}) {
    const competition = this.competitionSnapshot();
    const profile = competition.profiles.find((p) => String(p.id || p.user_id) === String(userId));
    return profile || fallback || {};
  },

  competitionMetrics() {
    const rows = this.competitionPredictionRows();
    const uniquePlayers = new Set(rows.map((row) => row.user_id).filter(Boolean));
    const competition = this.competitionSnapshot();
    const matches = competition.matches.filter((match) => !match.is_test_match);
    const finishedMatches = matches.filter((match) => match.status === "finished");
    const totalPoints = rows.reduce((sum, row) => sum + this.n(row.points_total), 0);
    const exacts = rows.filter((row) => row.is_exact_score).length;
    const zeros = rows.filter((row) => this.n(row.points_total) === 0).length;
    const bestMatch = this.competitionBestPointMatch(rows);
    const cursedMatch = this.competitionCursedMatch(rows);
    return { rows, uniquePlayers: uniquePlayers.size, matches, finishedMatches, totalPoints, exacts, zeros, bestMatch, cursedMatch };
  },

  competitionBestPointMatch(rows = this.competitionPredictionRows()) {
    const byMatch = new Map();
    rows.forEach((row) => {
      const item = byMatch.get(row.match_id) || { row, points: 0, count: 0, exacts: 0 };
      item.points += this.n(row.points_total);
      item.count += 1;
      if (row.is_exact_score) item.exacts += 1;
      byMatch.set(row.match_id, item);
    });
    return [...byMatch.values()].sort((a, b) => b.points - a.points || b.exacts - a.exacts)[0] || null;
  },

  competitionCursedMatch(rows = this.competitionPredictionRows()) {
    const byMatch = new Map();
    rows.forEach((row) => {
      const item = byMatch.get(row.match_id) || { row, zeros: 0, count: 0, points: 0 };
      item.count += 1;
      item.points += this.n(row.points_total);
      if (this.n(row.points_total) === 0) item.zeros += 1;
      byMatch.set(row.match_id, item);
    });
    return [...byMatch.values()].sort((a, b) => (b.zeros / Math.max(1, b.count)) - (a.zeros / Math.max(1, a.count)) || b.zeros - a.zeros)[0] || null;
  },

  playerRaceSeries(stats) {
    const rows = this.competitionPredictionRows();
    const competition = this.competitionSnapshot();
    const leaderboard = competition.leaderboard || [];
    const playerId = this.state.playerId;
    const topIds = leaderboard.slice(0, 8).map((row) => row.user_id || row.id).filter(Boolean);
    if (playerId && !topIds.map(String).includes(String(playerId))) topIds.push(playerId);
    const playerIds = topIds.slice(0, 9);
    if (!rows.length || !playerIds.length) {
      return {
        playerIds: [playerId],
        snapshots: stats.rows.map((row, index) => ({ label: H.formatShortDate?.(row.kickoff_at) || String(index + 1), totals: new Map([[playerId, this.cumulativeSeries(stats.rows)[index]?.y || 0]]) })),
        totalsByUser: new Map([[playerId, stats.total]])
      };
    }

    const matchDates = [...new Set(rows.map((row) => row.kickoff_at || row.match_day || row.match_id))]
      .sort((a, b) => new Date(a || 0) - new Date(b || 0));
    const totals = new Map(playerIds.map((id) => [String(id), 0]));
    const snapshots = matchDates.map((dateKey) => {
      rows.filter((row) => (row.kickoff_at || row.match_day || row.match_id) === dateKey).forEach((row) => {
        const id = String(row.user_id);
        if (totals.has(id)) totals.set(id, totals.get(id) + this.n(row.points_total));
      });
      return {
        label: H.formatShortDate?.(dateKey) || String(dateKey).slice(0, 10),
        totals: new Map([...totals.entries()])
      };
    });
    return { playerIds: playerIds.map(String), snapshots, totalsByUser: new Map([...totals.entries()]) };
  },

  raceChartSvg(series) {
    const playerIds = series.playerIds || [];
    const snapshots = series.snapshots || [];
    if (!playerIds.length || !snapshots.length) return `<p class="muted">Pas encore assez de données pour afficher la course aux points.</p>`;
    const colors = ["#facc15", "#38bdf8", "#a78bfa", "#fb7185", "#34d399", "#fb923c", "#f472b6", "#22c55e", "#60a5fa"];
    const width = 760, height = 300, pad = { left: 44, right: 22, top: 24, bottom: 42 };
    const max = Math.max(5, ...snapshots.flatMap((snapshot) => playerIds.map((id) => snapshot.totals.get(String(id)) || 0)));
    const x = (index) => pad.left + (snapshots.length === 1 ? 0 : (index / (snapshots.length - 1)) * (width - pad.left - pad.right));
    const y = (value) => pad.top + (height - pad.top - pad.bottom) - (Number(value || 0) / max) * (height - pad.top - pad.bottom);
    const grid = [0, .25, .5, .75, 1].map((t) => `<line class="chart-grid" x1="${pad.left}" x2="${width-pad.right}" y1="${(pad.top + t*(height-pad.top-pad.bottom)).toFixed(1)}" y2="${(pad.top + t*(height-pad.top-pad.bottom)).toFixed(1)}" />`).join("");
    const lines = playerIds.map((id, index) => {
      const points = snapshots.map((snapshot, i) => `${x(i).toFixed(1)},${y(snapshot.totals.get(String(id)) || 0).toFixed(1)}`).join(" ");
      const last = snapshots[snapshots.length - 1];
      const lastX = x(snapshots.length - 1);
      const lastY = y(last.totals.get(String(id)) || 0);
      const color = colors[index % colors.length];
      return `<polyline class="race-line" points="${points}" fill="none" stroke="${color}" stroke-width="${String(id) === String(this.state.playerId) ? 6 : 4}" stroke-linecap="round" stroke-linejoin="round" /><circle class="race-dot" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="5" fill="${color}" />`;
    }).join("");
    return `<svg class="chart-svg race-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Course aux points">${grid}${lines}<text class="chart-label" x="${pad.left}" y="${height-8}">Début</text><text class="chart-label" x="${width-pad.right}" y="${height-8}" text-anchor="end">Maintenant</text></svg>`;
  },

  raceLegendHtml(series) {
    const colors = ["#facc15", "#38bdf8", "#a78bfa", "#fb7185", "#34d399", "#fb923c", "#f472b6", "#22c55e", "#60a5fa"];
    return `<div class="race-legend">${(series.playerIds || []).map((id, index) => {
      const competition = this.competitionSnapshot();
      const profile = this.profileForUser(id, (competition.leaderboard || []).find((row) => String(row.user_id || row.id) === String(id)) || {});
      const total = series.totalsByUser?.get(String(id)) || 0;
      return `<div class="race-player ${String(id) === String(this.state.playerId) ? "is-player" : ""}" style="--race-color:${colors[index % colors.length]}"><span></span><strong>${this.e(profile.pseudo || "Joueur")}</strong><em>${total} pts</em></div>`;
    }).join("")}</div>`;
  },

  lineChartSvg(rows) {
    const points = this.cumulativeSeries(rows);
    if (!points.length) return `<p class="muted">Pas encore assez de matchs terminés pour tracer la courbe.</p>`;
    const width = 740, height = 285, pad = 36;
    const maxY = Math.max(5, ...points.map((p) => p.y));
    const x = (i) => pad + (points.length === 1 ? 0 : (i / (points.length - 1)) * (width - pad * 2));
    const y = (v) => height - pad - (v / maxY) * (height - pad * 2);
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)},${height-pad} L${pad},${height-pad} Z`;
    const dots = points.filter((_, i) => i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 8) === 0)
      .map((p, i) => `<circle class="chart-dot" cx="${x(points.indexOf(p)).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="5" />`).join("");
    const grid = [0, .25, .5, .75, 1].map((t) => `<line class="chart-grid" x1="${pad}" x2="${width-pad}" y1="${(pad + t*(height-pad*2)).toFixed(1)}" y2="${(pad + t*(height-pad*2)).toFixed(1)}" />`).join("");
    return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Courbe des points cumulés">${grid}<path class="chart-area" d="${area}"/><path class="chart-line" d="${line}"/>${dots}<text class="chart-label" x="${pad}" y="${height-8}">Début</text><text class="chart-label" x="${width-pad}" y="${height-8}" text-anchor="end">Fin</text></svg>`;
  },

  phaseAverages(rows) {
    const labels = { group: "Groupes", round_of_32: "16èmes", round_of_16: "8èmes", quarter: "Quarts", semi: "Demies", final: "Finale" };
    const by = new Map();
    rows.forEach((row) => {
      const key = row.stage || "autre";
      const item = by.get(key) || { key, label: labels[key] || H.stageLabel?.(key) || key, points: 0, count: 0 };
      item.points += this.n(row.points_total);
      item.count += 1;
      by.set(key, item);
    });
    return [...by.values()].map((item) => ({ ...item, avg: item.count ? item.points / item.count : 0 }));
  },

  barsHtml(rows) {
    const items = this.phaseAverages(rows);
    if (!items.length) return `<p class="muted">Les moyennes par phase apparaîtront après les premiers résultats.</p>`;
    const max = Math.max(1, ...items.map((i) => i.avg));
    return `<div class="bars">${items.map((item) => `
      <div class="bar-row">
        <strong>${this.e(item.label)}</strong>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (item.avg / max) * 100).toFixed(1)}%"></div></div>
        <span>${item.avg.toFixed(2)} pts/match</span>
      </div>`).join("")}</div>`;
  },

  predictionsTableHtml(rows, options = {}) {
    const showPhase = Boolean(options.showPhase);
    return `
      <div class="prediction-table-wrap">
        <table class="prediction-table collector-history-table">
          <thead><tr>${showPhase ? "<th>Phase</th>" : ""}<th>Match</th><th>Date</th><th>Prono</th><th>Réel</th><th>Pts</th><th>Verdict</th></tr></thead>
          <tbody>
            ${rows.map((row) => {
              const result = this.resultLabel(row);
              return `<tr>
                ${showPhase ? `<td><strong>${this.e(this.phaseKey(row))}</strong></td>` : ""}
                <td><strong>${this.matchFlag(row, "home")} ${this.e(row.home_team_short_name || row.home_team_name)}</strong><br><strong>${this.matchFlag(row, "away")} ${this.e(row.away_team_short_name || row.away_team_name)}</strong></td>
                <td><small>${this.e(H.formatDateTime?.(row.kickoff_at) || row.match_day || "")}</small></td>
                <td>${this.e(this.predText(row))}${row.qualified_team_name ? `<br><small>Qualifié : ${this.e(row.qualified_team_name)}</small>` : ""}</td>
                <td>${this.e(this.scoreText(row))}</td>
                <td><strong>${this.e(row.points_total ?? "—")}</strong></td>
                <td><span class="result-pill ${result.cls}">${this.e(result.text)}</span></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  },

  render() {
    const root = H.$("#bilanRoot");
    if (!root) return;
    root.innerHTML = this.buildDocumentHtml();
  },

  buildDocumentHtml() {
    const report = this.state.report || {};
    const player = report.profile || {};
    const leaderboard = this.effectiveLeaderboard(player);
    const team = report.team_leaderboard || {};
    const family = report.family_rank || {};
    const familyTeam = report.family_team_rank || {};
    const champion = this.championPickCurrent(this.normalizeChampionPrediction(report.champion_prediction || report.winner_prediction || report.winner || null), this.championFirstBonusPoints());
    const secondChampionRaw = this.currentSecondWinnerPicks().find((row) => String(row.user_id) === String(this.state.playerId)) || null;
    const secondChampion = secondChampionRaw ? this.normalizeSecondChampionPrediction(secondChampionRaw) : null;
    const stats = this.stats();
    const badges = this.unlockedBadges(stats, champion);
    const title = this.funnyTitle(stats, leaderboard);
    const quote = this.funnyQuote(stats, leaderboard);
    const avatarProfile = {
      pseudo: player.pseudo || "Joueur",
      avatar_key: player.avatar_key || "owl-01-le-bleu-blanc-bougon",
      badge_shape: player.badge_shape || "rounded",
      badge_color: player.badge_color || player.office_team_color || "#facc15",
      office_team_color: player.office_team_color || player.badge_color || "#facc15"
    };

    return `<article class="bilan-document collector" data-player-id="${this.e(this.state.playerId)}">
      ${this.pageCover(player, avatarProfile, leaderboard, stats, title, quote)}
      ${this.pageStats(player, leaderboard, team, family, familyTeam, champion, secondChampion, stats)}
      ${this.pageIdentity(player, avatarProfile, stats)}
      ${this.pageBadges(badges, stats)}
      ${this.pageRecords(stats)}
      ${this.pageCompetitionPulse(stats)}
      ${this.pageFinalStandings()}
      ${this.pageRace(stats)}
      ${this.pageCasseroles(stats)}
      ${this.pageGraphs(stats)}
      ${this.predictionHistoryPages(stats.rows)}
      ${this.pageDiploma(player, avatarProfile, leaderboard, stats, title)}
    </article>`;
  },

  pageCover(player, avatarProfile, leaderboard, stats, title, quote) {
    return `<section class="bilan-page cover"><div class="bilan-page-content cover-layout">
      <div class="cover-top">
        <div class="cover-brand"><img src="assets/icons/icon-192.png" alt=""><div><strong>Le Nid des Pronos</strong><span>Coupe du monde 2026</span></div></div>
        <span class="page-number">PDF COLLECTOR · 01</span>
      </div>
      <div class="cover-title"><h2>Carnet<br><span class="gold">de vol</span></h2><p class="cover-quote">“${this.e(quote)}”</p></div>
      <div class="cover-player">${H.profileBadgeHtml(avatarProfile, "profile-badge leader")}<div><h3>${this.e(player.pseudo || "Joueur")}</h3><p>${this.e(player.office_team_name || "Sans team")} · ${this.e(title)}</p></div></div>
      <div class="cover-stats">
        <div class="cover-stat"><strong>#${this.e(leaderboard.rank || "—")}</strong><span>classement officiel</span></div>
        <div class="cover-stat"><strong>${this.e(leaderboard.total_points ?? stats.total)}</strong><span>points</span></div>
        <div class="cover-stat"><strong>${stats.exact}</strong><span>scores exacts</span></div>
        <div class="cover-stat"><strong>${stats.average.toFixed(2)}</strong><span>moyenne/match</span></div>
      </div>
    </div></section>`;
  },


  dateLabel(value) {
    if (!value) return "—";
    try { return H.formatDateTime?.(value) || new Date(value).toLocaleString("fr-FR"); }
    catch (error) { return String(value); }
  },

  predictionActivityDate(row = {}) {
    const raw = row.predicted_at || row.submitted_at || row.prediction_created_at || row.prediction_updated_at || row.created_at || row.updated_at || row.locked_at;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
  },

  matchTitleHtml(row = {}) {
    return `${this.matchFlag(row, "home")} ${this.e(row.home_team_short_name || row.home_team_name)} <span class="vs-mini">-</span> ${this.matchFlag(row, "away")} ${this.e(row.away_team_short_name || row.away_team_name)}`;
  },

  matchMetaHtml(row = {}) {
    return `${this.e(this.phaseKey(row))} · ${this.e(H.formatDateTime?.(row.kickoff_at) || row.match_day || "date inconnue")}`;
  },

  scoreIconCard(id, value, label, extra = "") {
    return `<div class="stat-card icon-stat"><img src="${this.e(this.badgeAsset(id))}" alt=""><div><strong>${this.e(value)}</strong><span>${this.e(label)}</span>${extra ? `<small>${extra}</small>` : ""}</div></div>`;
  },

  dayDetails(rows = [], best = true) {
    const byDay = new Map();
    rows.forEach((row) => {
      const key = row.match_day || (row.kickoff_at || "").slice(0, 10) || "Sans date";
      const item = byDay.get(key) || { key, points: 0, matches: 0, exact: 0, zeros: 0, rows: [] };
      item.points += this.n(row.points_total);
      item.matches += 1;
      if (row.is_exact_score) item.exact += 1;
      if (this.n(row.points_total) === 0) item.zeros += 1;
      item.rows.push(row);
      byDay.set(key, item);
    });
    return [...byDay.values()].sort((a, b) => best ? b.points - a.points || b.exact - a.exact || b.matches - a.matches : b.zeros - a.zeros || a.points - b.points || b.matches - a.matches)[0] || null;
  },

  predictionHourBuckets(rows = []) {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    rows.forEach((row) => {
      const d = this.predictionActivityDate(row);
      if (d) buckets[d.getHours()].count += 1;
    });
    return buckets;
  },

  favoriteHour(rows = []) {
    const best = this.predictionHourBuckets(rows).sort((a, b) => b.count - a.count || a.hour - b.hour)[0];
    if (!best || !best.count) return "—";
    return `${String(best.hour).padStart(2, "0")}h-${String((best.hour + 1) % 24).padStart(2, "0")}h`;
  },

  hourRadarHtml(rows = []) {
    const buckets = this.predictionHourBuckets(rows);
    const groups = [
      { label: "Nuit", count: buckets.slice(0, 6).reduce((s, b) => s + b.count, 0) },
      { label: "Matin", count: buckets.slice(6, 12).reduce((s, b) => s + b.count, 0) },
      { label: "Aprèm", count: buckets.slice(12, 18).reduce((s, b) => s + b.count, 0) },
      { label: "Soir", count: buckets.slice(18, 24).reduce((s, b) => s + b.count, 0) }
    ];
    const max = Math.max(1, ...groups.map((g) => g.count));
    return `<div class="hour-radar">${groups.map((g) => `<div><span>${this.e(g.label)}</span><b style="height:${Math.max(8, (g.count/max)*76).toFixed(0)}%"></b><em>${g.count}</em></div>`).join("")}</div>`;
  },

  rowDetailCard(row, title) {
    if (!row) return `<article class="detail-match-card"><strong>${this.e(title)}</strong><p class="muted">Pas encore assez de données.</p></article>`;
    return `<article class="detail-match-card"><strong>${this.e(title)}</strong><h4>${this.matchTitleHtml(row)}</h4><small>${this.matchMetaHtml(row)}</small><p>Prono <b>${this.e(this.predText(row))}</b> · Réel <b>${this.e(this.scoreText(row))}</b> · <b>${this.e(row.points_total ?? 0)} pt(s)</b></p></article>`;
  },

  titleFromBadgeId(id = "") {
    return String(id || "badge").split("-").map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : "").join(" ");
  },

  badgeDateValue(badge = {}) {
    const raw = badge.acquired_at || badge.unlockedAt || badge.granted_at || badge.created_at || badge.updated_at || null;
    const d = raw ? new Date(raw) : null;
    return d && Number.isFinite(d.getTime()) ? d : null;
  },

  featuredBadgeIds() {
    const raw = this.state.report?.profile?.featured_badge_ids || [];
    return Array.isArray(raw) ? raw.map(String) : [];
  },

  miniRecordDefinitions() {
    return [
      { id: "record-points", title: "Grand-duc du classement", icon: "assets/records/record-points.png", unit: "pts", value: (s) => s.total },
      { id: "record-average", title: "Moyenne de velours", icon: "assets/records/record-average.png", unit: "pts/match", decimals: 2, minRows: 3, value: (s) => s.average },
      { id: "record-exact", title: "Aimant à scores exacts", icon: "assets/records/record-exact.png", unit: "score(s) exact(s)", value: (s) => s.exact },
      { id: "record-results", title: "Collectionneur de victoires", icon: "assets/records/record-results.png", unit: "bon(s) résultat(s)", value: (s) => s.good },
      { id: "record-diffs", title: "Compas du nid", icon: "assets/records/record-diffs.png", unit: "bon(s) écart(s)", value: (s) => s.diff },
      { id: "record-qualified", title: "Gardien des qualifiés", icon: "assets/records/record-qualified.png", unit: "qualifié(s)", value: (s) => s.qualified },
      { id: "record-day", title: "Journée stratosphérique", icon: "assets/records/record-day.png", unit: "pts", value: (s) => s.bestDayPoints, detail: (s) => s.bestDayLabel },
      { id: "record-exact-streak", title: "Série laser", icon: "assets/records/record-exact-streak.png", unit: "d’affilée", value: (s) => s.exactStreak },
      { id: "record-result-streak", title: "Vol sans trou d’air", icon: "assets/records/record-results.png", unit: "d’affilée", value: (s) => s.resultStreak },
      { id: "record-predictions", title: "Greffier du grimoire", icon: "assets/records/record-predictions.png", unit: "prono(s)", value: (s) => s.predictionCount },
      { id: "record-zero", title: "Casserole dorée", icon: "assets/records/record-zero.png", unit: "zéro(s)", value: (s) => s.zeros },
      { id: "record-zero-streak", title: "Tunnel de brouillard", icon: "assets/records/record-zero-streak.png", unit: "d’affilée", value: (s) => s.zeroStreak }
    ];
  },

  miniRecordCountRow(userId) {
    return this.competitionSnapshot().miniRecordCounts.find((row) => String(row.user_id) === String(userId)) || null;
  },

  playerSummaryFromRows(userId) {
    const rows = this.competitionPredictionRows()
      .filter((row) => String(row.user_id) === String(userId))
      .sort((a, b) => new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0));
    const total = rows.reduce((s, r) => s + this.n(r.points_total), 0);
    const exact = rows.filter((r) => r.is_exact_score).length;
    const good = rows.filter((r) => r.is_good_result).length;
    const diff = rows.filter((r) => r.is_good_goal_diff).length;
    const qualified = rows.filter((r) => r.is_good_qualified).length;
    const zeros = rows.filter((r) => this.n(r.points_total) === 0).length;
    const dayMap = new Map();
    rows.forEach((row) => {
      const label = row.stage === "group" && row.pool_round
        ? `Journée de poule ${row.pool_round}`
        : this.phaseKey(row);
      const item = dayMap.get(label) || { label, points: 0 };
      item.points += this.n(row.points_total);
      dayMap.set(label, item);
    });
    const bestDay = [...dayMap.values()].sort((a, b) => b.points - a.points || String(a.label).localeCompare(String(b.label), "fr"))[0] || { label: "", points: 0 };
    const countRow = this.miniRecordCountRow(userId);
    const predictionCount = Math.max(this.n(countRow?.prediction_count), rows.length);
    return {
      rows,
      total,
      exact,
      good,
      diff,
      qualified,
      zeros,
      average: rows.length ? total / rows.length : 0,
      scoredMatches: rows.length,
      predictionCount,
      bestDayPoints: bestDay.points,
      bestDayLabel: bestDay.label,
      exactStreak: this.streak(rows, (row) => row.is_exact_score),
      resultStreak: this.streak(rows, (row) => row.is_good_result || row.is_exact_score),
      zeroStreak: this.streak(rows, (row) => this.n(row.points_total) === 0)
    };
  },

  miniRecordReachedDate(userId, record, stats) {
    const countRow = this.miniRecordCountRow(userId);
    if (record.id === "record-predictions") {
      const raw = countRow?.record_unlocked_at || countRow?.latest_prediction_at || countRow?.first_prediction_at;
      const d = raw ? new Date(raw) : null;
      return d && Number.isFinite(d.getTime()) ? d.getTime() : Number.POSITIVE_INFINITY;
    }
    const rows = stats.rows || [];
    const last = rows[rows.length - 1];
    const raw = last?.kickoff_at || last?.prediction_updated_at || last?.prediction_created_at;
    const d = raw ? new Date(raw) : null;
    return d && Number.isFinite(d.getTime()) ? d.getTime() : Number.POSITIVE_INFINITY;
  },

  miniRecordStandings(record) {
    return this.competitionPlayerSummaries()
      .filter((item) => !record.minRows || item.stats.scoredMatches >= record.minRows)
      .map((item) => ({
        ...item,
        value: Number(record.value(item.stats) || 0),
        reachedAt: this.miniRecordReachedDate(item.id, record, item.stats)
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) =>
        b.value - a.value
        || a.reachedAt - b.reachedAt
        || String(a.profile.pseudo || "").localeCompare(String(b.profile.pseudo || ""), "fr")
      );
  },

  miniRecordPodiums() {
    return this.miniRecordDefinitions().map((record) => ({
      record,
      podium: this.miniRecordStandings(record).slice(0, 3)
    }));
  },

  formatRecordValue(value, record = {}) {
    const n = Number(value || 0);
    return `${record.decimals ? n.toFixed(record.decimals) : String(Math.round(n * 10) / 10)} ${record.unit || ""}`.trim();
  },

  competitionPlayerSummaries() {
    const competition = this.competitionSnapshot();
    const userIds = [...new Set([
      ...(competition.leaderboard || []).map((row) => row.user_id || row.id),
      ...this.competitionPredictionRows().map((row) => row.user_id),
      ...(competition.miniRecordCounts || []).map((row) => row.user_id)
    ].filter(Boolean))];
    return userIds.map((id) => ({
      id,
      profile: this.profileForUser(id, (competition.leaderboard || []).find((row) => String(row.user_id || row.id) === String(id)) || {}),
      stats: this.playerSummaryFromRows(id)
    }));
  },

  playerMiniRecords() {
    return this.miniRecordDefinitions().map((record) => {
      const winner = this.miniRecordStandings(record)[0];
      if (!winner || String(winner.id) !== String(this.state.playerId)) return null;
      return {
        record,
        value: winner.value,
        detail: record.detail ? record.detail(winner.stats) : ""
      };
    }).filter(Boolean);
  },

  rankHistory() {
    const competition = this.competitionSnapshot();
    const players = this.competitionPlayerSummaries();
    const finishedMatches = (competition.matches || []).filter((match) => !match.is_test_match && match.status === "finished").sort((a, b) => new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0));
    if (!players.length || !finishedMatches.length) return [];

    const rowsByMatch = new Map();
    this.competitionPredictionRows().forEach((row) => {
      const list = rowsByMatch.get(String(row.match_id)) || [];
      list.push(row);
      rowsByMatch.set(String(row.match_id), list);
    });
    const totals = new Map(players.map((p) => [String(p.id), { points: 0, exact: 0, good: 0 }]));
    const groups = [];
    finishedMatches.forEach((match) => {
      const key = match.kickoff_at || match.match_day || match.id;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.matches.push(match);
      else groups.push({ key, matches: [match] });
    });

    let matchCount = 0;
    const history = [];
    groups.forEach((group) => {
      group.matches.forEach((match) => {
        matchCount += 1;
        (rowsByMatch.get(String(match.id)) || []).forEach((row) => {
          const item = totals.get(String(row.user_id));
          if (!item) return;
          item.points += this.n(row.points_total);
          if (row.is_exact_score) item.exact += 1;
          if (row.is_good_result || row.is_exact_score) item.good += 1;
        });
      });
      if (group.matches.some((match) => match.stage === "final")) {
        [...this.currentWinnerPicks(), ...this.currentSecondWinnerPicks()].forEach((pick) => {
          const item = totals.get(String(pick.user_id));
          if (item) item.points += this.n(pick.points_total);
        });
      }
      const playerTotal = totals.get(String(this.state.playerId));
      if (playerTotal) {
        const ahead = players.filter((item) => {
          if (String(item.id) === String(this.state.playerId)) return false;
          const other = totals.get(String(item.id)) || {};
          return (other.points || 0) > (playerTotal.points || 0)
            || ((other.points || 0) === (playerTotal.points || 0) && (other.exact || 0) > (playerTotal.exact || 0))
            || ((other.points || 0) === (playerTotal.points || 0) && (other.exact || 0) === (playerTotal.exact || 0) && (other.good || 0) > (playerTotal.good || 0));
        }).length;
        history.push({ rank: ahead + 1, matchCount, date: group.key });
      }
    });
    return history;
  },

  rankMilestones() {
    const history = this.rankHistory();
    if (!history.length) return { best: null, worst: null };
    return {
      best: history.reduce((best, item) => item.rank < best.rank ? item : best, history[0]),
      worst: history.reduce((worst, item) => item.rank > worst.rank ? item : worst, history[0])
    };
  },

  leaderTimeStats() {
    const history = this.rankHistory();
    if (!history.length) return { totalDays: 0, longestDays: 0, periods: 0 };
    const endDate = new Date(history[history.length - 1].date || Date.now());
    let totalMs = 0;
    let longestMs = 0;
    let currentMs = 0;
    let periods = 0;
    history.forEach((item, index) => {
      const start = new Date(item.date || 0);
      const next = index + 1 < history.length ? new Date(history[index + 1].date || start) : endDate;
      const duration = Math.max(0, next - start);
      if (item.rank === 1) {
        if (index === 0 || history[index - 1].rank !== 1) periods += 1;
        totalMs += duration;
        currentMs += duration;
        longestMs = Math.max(longestMs, currentMs);
      } else {
        currentMs = 0;
      }
    });
    const toDays = (ms) => ms > 0 ? Math.max(1, Math.round(ms / 86400000)) : 0;
    return { totalDays: toDays(totalMs), longestDays: toDays(longestMs), periods };
  },

  pageStats(player, leaderboard, team, family, familyTeam, champion, secondChampion, stats) {
    const showFamily = this.showFamilyContext();
    const firstBonus = this.championFirstBonusPoints();
    const secondBonus = this.championSecondBonusPoints();
    const familyRows = showFamily ? `<div class="rank-row"><div><strong>Famille joueur</strong><small>classement parallèle</small></div><span class="big-rank">#${this.e(family.rank || "—")}</span></div><div class="rank-row"><div><strong>Famille team</strong><small>moyenne équipe famille</small></div><span class="big-rank">#${this.e(familyTeam.rank || "—")}</span></div>` : "";
    const championLine = (pick, title, pts) => pick ? `<div class="champion-pick-line">${pick.predicted_team_flag_url || pick.predicted_team_country_code ? H.flagImgHtml({ flagUrl: pick.predicted_team_flag_url, countryCode: pick.predicted_team_country_code, shortName: pick.predicted_team_short_name, name: pick.predicted_team_name, className: "team-flag-img champion-option-flag" }) : ""}<p><span>${this.e(title)}</span><strong>${this.e(pick.predicted_team_name)}</strong><small>${this.e(pts)} pts possibles · actuellement ${this.e(pick.points_total || 0)} pt(s)</small></p></div>` : "";
    const initialLine = champion ? championLine(champion, "Choix initial", firstBonus) : `<div class="champion-pick-line joke-champion"><span class="italy-joke-flag" aria-hidden="true">🇮🇹</span><p><span>Choix automatique du Hibou</span><strong>Italie</strong><small>Quitte à ne rien choisir, autant prendre une équipe qui n’était même pas qualifiée. Aucun impact sur le classement, évidemment.</small></p></div>`;
    const secondLine = secondChampion ? championLine(secondChampion, "2e choix bonus", secondBonus) : `<p class="muted champion-missing-line">2e choix bonus non posé : le Hibou a rangé son plan B avant de se blesser avec.</p>`;
    const sameTeam = champion && secondChampion && champion.predicted_team_id === secondChampion.predicted_team_id;
    return `<section class="bilan-page stats"><div class="bilan-page-content">
      <div class="bilan-page-head"><div><h2>Tableau de chasse</h2><p>Les chiffres froids, les plumes chaudes, et les casseroles assumées avec panache.</p></div><span class="page-number">02</span></div>
      <div class="stats-grid icon-stats-grid">
        <div class="stat-card feature"><strong>${this.e(leaderboard.total_points ?? stats.total)}</strong><span>points au total</span></div>
        <div class="stat-card"><strong>#${this.e(leaderboard.rank || "—")}</strong><span>rang joueur</span></div>
        ${this.scoreIconCard("first-perfect", stats.exact, "scores exacts")}
        ${this.scoreIconCard("accountant", stats.good, "bons résultats")}
        ${this.scoreIconCard("geometry", stats.diff, "bons écarts")}
        ${this.scoreIconCard("knife-edge", stats.qualified, "bons qualifiés")}
        ${this.scoreIconCard("zero-tunnel", stats.zeros, "zéros pointés")}
        ${this.scoreIconCard("all-picks-in", `${stats.rows.length}/${stats.officialMatchCount || "?"}`, "matchs comptés")}
      </div>
      <div class="two-col">
        <div class="graph-card"><h3>Classements</h3><div class="ranking-list"><div class="rank-row"><div><strong>Joueur officiel</strong><small>${this.e(player.pseudo)}</small></div><span class="big-rank">#${this.e(leaderboard.rank || "—")}</span></div><div class="rank-row"><div><strong>Team officielle</strong><small>${this.e(team.office_team_name || player.office_team_name || "Sans team")}</small></div><span class="big-rank">#${this.e(team.rank || "—")}</span></div>${familyRows}</div></div>
        <div class="graph-card champion-card"><h3>Champions choisis</h3>${initialLine}${secondLine}<p class="muted">${sameTeam ? `Même équipe choisie deux fois : jackpot potentiel à ${firstBonus + secondBonus} points.` : `Barème actuel : ${firstBonus} pts pour le choix initial et ${secondBonus} pts pour le 2e choix.`}</p></div>
      </div>
    </div></section>`;
  },

  pageIdentity(player, avatarProfile, stats) {
    const signature = stats.signature || this.playerSignature(stats);
    const radar = this.radarMetrics(stats);
    const registeredAt = player.created_at || player.inserted_at || this.state.report.profile?.created_at || null;
    const bestDay = stats.bestDay;
    const worstDay = stats.worstDay;
    return `<section class="bilan-page identity"><div class="bilan-page-content">
      <div class="bilan-page-head"><div><h2>Carte d’identité du pronostiqueur</h2><p>Rang collector, rythme de prono, match rentable et vraie casserole certifiée par le Nid.</p></div><span class="page-number">03</span></div>
      <div class="identity-layout">
        <div class="identity-rank-card ${this.e(signature.tone)}">${H.profileBadgeHtml(avatarProfile, "profile-badge leader")}<p class="eyebrow">Rang collector</p><h3>${this.e(signature.title)}</h3><p>${this.e(signature.subtitle)}</p><div class="identity-mini-facts"><span>Inscription : <b>${this.e(registeredAt ? this.dateLabel(registeredAt) : "non disponible")}</b></span><span>Créneau préféré : <b>${this.e(stats.favoriteHour)}</b></span></div></div>
        <div class="identity-meter-card"><h3>Radar de plumes</h3>${this.meterHtml("Scores exacts", radar.exact)}${this.meterHtml("Bons résultats", radar.outcomes)}${this.meterHtml("Rendement points", radar.yield)}${this.meterHtml("Anti-casserole", radar.survival)}<p class="radar-explain">Exacts = scores exacts / matchs · Résultats = bon sens du match · Rendement = points gagnés / maximum possible · Anti-casserole = matchs avec au moins 1 point.</p><h3 class="mini-title">Heures de vol</h3>${this.hourRadarHtml(this.officialPredictions())}</div>
      </div>
      <div class="identity-detail-grid">${this.rowDetailCard(stats.best, "Score officiel le plus rentable")}${this.rowDetailCard(stats.casseroleRows?.[0], "Casserole spectaculaire")}<article class="detail-match-card"><strong>Journée de grâce</strong><h4>${this.e(bestDay?.key || "—")} · ${this.e(bestDay?.points ?? "—")} pts</h4><p>${this.e(bestDay?.matches || 0)} match(s), ${this.e(bestDay?.exact || 0)} exact(s), ${this.e(bestDay?.zeros || 0)} zéro(s).</p></article><article class="detail-match-card"><strong>Journée du désespoir</strong><h4>${this.e(worstDay?.key || "—")} · ${this.e(worstDay?.zeros ?? "—")} zéro(s)</h4><p>${this.e(worstDay?.matches || 0)} match(s), ${this.e(worstDay?.points ?? 0)} point(s), une plume qui grince.</p></article></div>
    </div></section>`;
  },

  meterHtml(label, value) {
    const v = Math.max(0, Math.min(100, Number(value || 0)));
    return `<div class="meter-row"><span>${this.e(label)}</span><div class="meter-track"><div class="meter-fill" style="width:${v}%"></div></div><strong>${Math.round(v)}%</strong></div>`;
  },

  pageBadges(badges, stats) {
    const featuredIds = this.featuredBadgeIds();
    const featured = featuredIds.map((id) => badges.find((badge) => String(badge.id) === String(id))).filter(Boolean);
    const rest = badges.filter((badge) => !featuredIds.includes(String(badge.id)));
    const firstCount = featured.length ? 6 : 8;
    const firstChronology = rest.slice(0, firstCount);
    const followingChunks = this.chunk(rest.slice(firstCount), 8);
    const card = (badge, featured = false) => `<article class="badge-card ${featured ? "featured-badge-card" : ""}"><img class="badge-png" src="${this.e(badge.file || this.badgeAsset(badge.id))}" alt="" onerror="this.src='assets/icons/owl-png/badges.png'"><strong>${this.e(badge.title || this.titleFromBadgeId(badge.id))}</strong><small>${badge.acquiredDate ? this.e(this.dateLabel(badge.acquiredDate)) : "date non dispo"}</small><p>${this.e(badge.text || badge.description || "Exploit enregistré dans le Nid.")}</p></article>`;
    if (!badges.length) return `<section class="bilan-page badges"><div class="bilan-page-content"><div class="bilan-page-head"><div><h2>Mur des exploits</h2><p>Le nid attend ses premiers badges.</p></div><span class="page-number">04</span></div><div class="badge-grid collector-badges"><article class="badge-card"><img class="badge-png" src="assets/icons/owl-png/badges.png" alt=""><strong>Le nid attend</strong><p>Les badges apparaîtront avec les résultats comptabilisés.</p></article></div></div></section>`;
    const pages = [];
    pages.push(`<section class="bilan-page badges"><div class="bilan-page-content"><div class="bilan-page-head"><div><h2>Mur des exploits</h2><p>${badges.length} exploit(s), classés par date d’obtention. Les badges sont répartis pour qu’aucune plume ne soit coupée à l’impression.</p></div><span class="page-number">04</span></div>${featured.length ? `<h3 class="badge-section-title">Badges mis en avant</h3><div class="badge-grid featured-badges">${featured.map((badge) => card(badge, true)).join("")}</div>` : ""}<h3 class="badge-section-title">Chronologie des exploits</h3><div class="badge-grid collector-badges">${firstChronology.map((badge) => card(badge)).join("")}</div></div></section>`);
    followingChunks.forEach((chunk, index) => pages.push(`<section class="bilan-page badges"><div class="bilan-page-content"><div class="bilan-page-head"><div><h2>Mur des exploits</h2><p>Suite ${index + 2} · chronologie des badges.</p></div><span class="page-number">B-${index + 2}</span></div><div class="badge-grid collector-badges">${chunk.map((badge) => card(badge)).join("")}</div></div></section>`));
    return pages.join("");
  },

  pageRecords(stats) {
    const best = stats.best, worst = stats.casseroleRows?.[0] || stats.worst;
    const exactStreak = this.streak(stats.rows, (row) => row.is_exact_score);
    const goodStreak = this.streak(stats.rows, (row) => row.is_good_result || row.is_exact_score);
    const zeroStreak = this.streak(stats.rows, (row) => this.n(row.points_total) === 0);
    const ranks = this.rankMilestones();
    const leader = this.leaderTimeStats();
    const playerMiniRecords = this.playerMiniRecords();
    const leaderText = leader.longestDays ? `${leader.longestDays} jour${leader.longestDays > 1 ? "s" : ""}` : "0 jour";
    const card = ({ icon, value, title, detail, className = "" }) => `<article class="record-card record-card-final ${this.e(className)}"><div class="record-card-top"><img src="${this.e(icon)}" alt=""><span class="value">${value}</span><strong>${this.e(title)}</strong></div><div class="record-card-detail">${detail}</div></article>`;
    const rankCard = (item, bestRank = true) => card({
      icon: bestRank ? "assets/icons/owl-png/classements.png" : "assets/records/record-zero.png",
      value: item ? `#${this.e(item.rank)}` : "—",
      title: bestRank ? "Meilleur classement" : "Pire classement",
      detail: item ? `Atteint après ${this.e(item.matchCount)} match(s) du tournoi.` : "Historique indisponible."
    });
    const cards = [
      card({ icon: "assets/records/record-points.png", value: best ? this.e(best.points_total) : "—", title: "Meilleur match", detail: best ? `${this.matchTitleHtml(best)}<br><small>${this.matchMetaHtml(best)}</small>` : "En attente." }),
      card({ icon: "assets/records/record-day.png", value: stats.bestDay ? this.e(stats.bestDay.points) : "—", title: "Journée de grâce", detail: stats.bestDay ? `${this.e(stats.bestDay.key)}<br><small>${stats.bestDay.matches} match(s) · ${stats.bestDay.exact} exact(s)</small>` : "En attente." }),
      card({ icon: "assets/records/record-exact-streak.png", value: this.e(exactStreak), title: "Série scores exacts", detail: "Le pic de précision du tournoi." }),
      card({ icon: "assets/records/record-results.png", value: this.e(goodStreak), title: "Série bons résultats", detail: "Le mode pilote automatique." }),
      card({ icon: "assets/records/record-zero-streak.png", value: this.e(zeroStreak), title: "Traversée du brouillard", detail: "Le tunnel zéro, version plumes mouillées." }),
      card({ icon: "assets/records/record-zero.png", value: worst ? this.e(worst.points_total) : "—", title: "Casserole favorite", detail: worst ? `${this.matchTitleHtml(worst)}<br><small>Prono ${this.e(this.predText(worst))} · réel ${this.e(this.scoreText(worst))}</small>` : "Aucune casserole officielle." }),
      rankCard(ranks.best, true),
      rankCard(ranks.worst, false),
      card({ icon: "assets/icons/owl-png/classements.png", value: this.e(leaderText), title: "Resté en tête", detail: leader.longestDays ? `Plus longue série au sommet${leader.periods > 1 ? ` · ${leader.periods} passages en tête` : ""}.` : "Le fauteuil de leader est resté hors de portée.", className: "leader-duration-card" })
    ].join("");
    return `<section class="bilan-page records"><div class="bilan-page-content"><div class="bilan-page-head"><div><h2>Records & casseroles</h2><p>Les moments que le hibou racontera au coin du perchoir, avec drapeaux et dossiers.</p></div><span class="page-number">05</span></div><div class="record-grid rich-record-grid">${cards}</div><div class="graph-card mini-record-player-card"><h3>Mini-records détenus</h3>${playerMiniRecords.length ? playerMiniRecords.map(({ record, value, detail }) => `<p><img src="${this.e(record.icon)}" alt=""> <span><strong>${this.e(record.title)}</strong> · ${this.e(this.formatRecordValue(value, record))}${detail ? `<small>${this.e(detail)}</small>` : `<small>Détenteur actuel du trophée.</small>`}</span></p>`).join("") : `<p class="muted">Aucun mini-record détenu actuellement. Le perchoir reste ouvert.</p>`}</div></div></section>`;
  },

  pageCompetitionPulse(stats) {
    const metrics = this.competitionMetrics();
    const cursed = metrics.cursedMatch, best = metrics.bestMatch;
    const podiums = this.miniRecordPodiums();
    return `<section class="bilan-page competition"><div class="bilan-page-content"><div class="bilan-page-head"><div><h2>La compétition en chiffres</h2><p>Le Nid entier vu depuis le perchoir du super admin : pays, drapeaux, records et catastrophes.</p></div><span class="page-number">06</span></div><div class="stats-grid collector-stats"><div class="stat-card feature"><strong>${metrics.totalPoints}</strong><span>points distribués dans le Nid</span></div><div class="stat-card"><strong>${metrics.uniquePlayers}</strong><span>joueurs avec pronos comptés</span></div><div class="stat-card"><strong>${metrics.finishedMatches.length}</strong><span>matchs terminés</span></div><div class="stat-card"><strong>${metrics.exacts}</strong><span>scores exacts collectifs</span></div><div class="stat-card"><strong>${metrics.zeros}</strong><span>zéros récoltés</span></div><div class="stat-card"><strong>${metrics.rows.length}</strong><span>pronos analysés</span></div></div><div class="two-col"><article class="graph-card"><h3>Match jackpot</h3>${best ? `<p><strong>${this.matchTitleHtml(best.row)}</strong></p><p>${best.points} pts distribués · ${best.exacts} score(s) exact(s)</p>` : `<p class="muted">Pas encore de match jackpot.</p>`}</article><article class="graph-card"><h3>Match casserole</h3>${cursed ? `<p><strong>${this.matchTitleHtml(cursed.row)}</strong></p><p>${cursed.zeros}/${cursed.count} prono(s) à zéro. Le perchoir s’en souviendra.</p>` : `<p class="muted">Pas encore de grande catastrophe.</p>`}</article></div><div class="graph-card mini-records-podiums"><h3>Tous les mini-records · Top 3</h3><div class="mini-record-grid">${podiums.map(({ record, podium }) => `<article><img src="${this.e(record.icon)}" alt=""><strong>${this.e(record.title)}</strong>${podium.length ? podium.map((p, i) => `<span>#${i+1} ${this.e(p.profile.pseudo || "Joueur")} · ${this.e(this.formatRecordValue(p.value, record))}</span>`).join("") : `<span>Pas encore de détenteur</span>`}</article>`).join("")}</div></div></div></section>`;
  },

  rankingPhaseDefinitions() {
    return [
      { key: "group", label: "Poules", stages: ["group"] },
      { key: "round32", label: "16es", stages: ["round_of_32"] },
      { key: "round16", label: "8es", stages: ["round_of_16"] },
      { key: "quarter", label: "Quarts", stages: ["quarter"] },
      { key: "semi", label: "Demies", stages: ["semi"] },
      { key: "finals", label: "Finales", stages: ["third_place", "final"] }
    ];
  },

  phaseStandingRows(finalRows = [], definition = {}) {
    const mapped = finalRows.map((player) => {
      const rows = this.competitionPredictionRows().filter((row) => String(row.user_id) === String(player.user_id) && definition.stages.includes(row.stage));
      const points = rows.reduce((sum, row) => sum + this.n(row.points_total), 0);
      const exact = rows.filter((row) => row.is_exact_score).length;
      const good = rows.filter((row) => row.is_good_result || row.is_exact_score).length;
      return { ...player, phase_points: points, phase_matches: rows.length, phase_average: rows.length ? points / rows.length : 0, phase_exact: exact, phase_good: good };
    }).sort((a, b) => b.phase_points - a.phase_points || b.phase_exact - a.phase_exact || b.phase_good - a.phase_good || String(a.pseudo).localeCompare(String(b.pseudo), "fr"));
    let previous = null;
    let previousRank = 0;
    return mapped.map((row, index) => {
      const key = `${row.phase_points}|${row.phase_exact}|${row.phase_good}`;
      const phase_rank = key === previous ? previousRank : index + 1;
      previous = key;
      previousRank = phase_rank;
      return { ...row, phase_rank };
    });
  },

  standingsTableHtml(rows = [], title = "Classement officiel") {
    const defs = this.rankingPhaseDefinitions();
    const phaseMaps = Object.fromEntries(defs.map((def) => [def.key, new Map(this.phaseStandingRows(rows, def).map((row) => [String(row.user_id), row]))]));
    return `<div class="final-ranking-table-wrap"><table class="final-ranking-table"><thead><tr><th>Rang</th><th>Joueur</th><th>Team</th><th>Total</th><th>Moy.</th>${defs.map((def) => `<th>${this.e(def.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr class="${String(row.user_id) === String(this.state.playerId) ? "is-current-player" : ""}"><td><strong>#${this.e(row.rank)}</strong></td><td>${H.profileBadgeHtml({ ...row, office_team_color: row.office_team_color || row.badge_color }, "profile-badge mini")}<span><strong>${this.e(row.pseudo)}</strong><small>${row.champion_points ? `+${this.e(row.champion_points)} champion` : ""}</small></span></td><td>${this.e(row.office_team_name || "—")}</td><td><strong>${this.e(row.total_points)}</strong><small>${this.e(row.match_points)} + ${this.e(row.champion_points)}</small></td><td>${this.e(Number(row.average_points || 0).toFixed(2))}</td>${defs.map((def) => { const phase = phaseMaps[def.key].get(String(row.user_id)); return `<td><b>#${this.e(phase?.phase_rank || "—")}</b><small>${this.e(phase?.phase_points || 0)} pt · ${this.e(Number(phase?.phase_average || 0).toFixed(2))}</small></td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`;
  },

  pageFinalStandings() {
    const official = this.finalStandings({ family: false });
    const family = this.finalStandings({ family: true });
    const page = (rows, familyMode = false) => `<section class="bilan-page ranking-sheet landscape-page ${rows.length > 18 ? "ranking-many" : rows.length > 12 ? "ranking-medium" : ""}"><div class="bilan-page-content"><div class="bilan-page-head"><div><h2>${familyMode ? "Classement final · Famille" : "Classement final · tous les joueurs"}</h2><p>${familyMode ? "Univers Famille : classement général, classement et moyenne de chaque phase." : "Classement officiel complet, bonus champion inclus dans le total. Chaque phase affiche rang, points et moyenne."}</p></div><span class="page-number">${familyMode ? "CL-F" : "CL"}</span></div>${this.standingsTableHtml(rows, familyMode ? "Classement Famille" : "Classement officiel")}</div></section>`;
    return `${official.length ? page(official, false) : ""}${family.length ? page(family, true) : ""}`;
  },

  pageRace(stats) {
    const series = this.playerRaceSeries(stats);
    return `<section class="bilan-page race"><div class="bilan-page-content"><div class="bilan-page-head"><div><h2>Course aux points</h2><p>Trajectoire du joueur, comparaison aux meilleurs, et lectures en moyenne.</p></div><span class="page-number">07</span></div><div class="graph-card race-card"><h3>Évolution des points</h3>${this.raceChartSvg(series)}${this.raceLegendHtml(series)}</div><div class="two-col"><div class="graph-card"><h3>Évolution moyenne joueur</h3>${this.lineChartSvg(stats.rows.map((row, i) => ({ ...row, points_total: (this.cumulativeSeries(stats.rows)[i]?.y || 0) / (i + 1) })))}</div><div class="graph-card"><h3>Moyenne team</h3><p class="muted">Repère synthétique : ${this.e(this.state.report.team_leaderboard?.average_points?.toFixed?.(2) || this.state.report.team_leaderboard?.average_points || "—")} pts/match pour la team.</p>${this.barsHtml(stats.rows)}</div></div></div></section>`;
  },

  pageCasseroles(stats) {
    const casseroles = stats.casseroleRows || [];
    const top = casseroles.slice(0, 6);
    return `<section class="bilan-page casseroles"><div class="bilan-page-content">
      <div class="bilan-page-head"><div><h2>Poêles, casseroles et grands moments de solitude</h2><p>Les pronos les plus douloureux. Ici, on rit avec tendresse. Enfin presque.</p></div><span class="page-number">08</span></div>
      <div class="casserole-list">
        ${top.length ? top.map((row, index) => `<article class="casserole-card ${row.opposite_result ? "opposite" : ""}">
          <span class="casserole-rank">#${index + 1}</span>
          <div><strong>${this.matchFlag(row, "home")} ${this.e(row.home_team_short_name || row.home_team_name)} - ${this.matchFlag(row, "away")} ${this.e(row.away_team_short_name || row.away_team_name)}</strong><small>${this.e(H.formatDateTime?.(row.kickoff_at) || row.match_day || "")}</small></div>
          <div><span>Prono</span><strong>${this.e(this.predText(row))}</strong></div>
          <div><span>Réel</span><strong>${this.e(this.scoreText(row))}</strong></div>
          <p>${row.opposite_result ? "Résultat inversé : la boussole a quitté le nid." : "Gros écart de trajectoire."}</p>
        </article>`).join("") : `<p class="muted">Aucune casserole officielle. Suspect, mais respectable.</p>`}
      </div>
    </div></section>`;
  },

  pageGraphs(stats) {
    return `<section class="bilan-page graphs"><div class="bilan-page-content"><div class="bilan-page-head"><div><h2>Courbes du perchoir</h2><p>Évolution, phase, heures de prono et densité des casseroles.</p></div><span class="page-number">09</span></div><div class="two-col"><div class="graph-card"><h3>Progression cumulée</h3>${this.lineChartSvg(stats.rows)}</div><div class="graph-card"><h3>Moyennes par phase</h3>${this.barsHtml(stats.rows)}</div></div><div class="two-col"><div class="graph-card"><h3>Heures de prono</h3>${this.hourRadarHtml(this.officialPredictions())}<p class="muted">Calcul : on regarde l’heure d’enregistrement/modification des pronos, puis on groupe en nuit, matin, après-midi et soir.</p></div><div class="graph-card"><h3>Indice casserole</h3>${this.meterHtml("Taux de zéro", Math.round(stats.zeroRate * 100))}${this.meterHtml("Précision exacte", Math.round(stats.exactRate * 100))}${this.meterHtml("Rentabilité moyenne", Math.min(100, Math.round(stats.average * 22)))}</div></div></div></section>`;
  },

  predictionHistoryPages(rows) {
    const stageOrder = { group: 1, round_of_32: 2, round_of_16: 3, quarter: 4, semi: 5, third_place: 6, final: 6 };
    const canonicalRows = rows.map((row) => this.mergePredictionMatch(row));
    const sorted = canonicalRows.slice().sort((a, b) => (stageOrder[a.stage || "group"] || 99) - (stageOrder[b.stage || "group"] || 99) || Number(a.pool_round || 0) - Number(b.pool_round || 0) || new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0));
    const groups = new Map();
    sorted.forEach((row) => {
      const stage = row.stage || "group";
      const isFinals = stage === "third_place" || stage === "final";
      const key = stage === "group" ? `group-${row.pool_round || "?"}` : isFinals ? "finals" : stage;
      const label = stage === "group" ? `Phase de poules · journée ${row.pool_round || "?"}` : isFinals ? "Petite finale & finale" : this.phaseKey(row);
      if (!groups.has(key)) groups.set(key, { key, label, order: (stageOrder[stage] || 99) * 10 + Number(row.pool_round || 0), rows: [] });
      groups.get(key).rows.push(row);
    });
    const phaseGroups = [...groups.values()].sort((a, b) => a.order - b.order);
    if (!phaseGroups.length) return `<section class="bilan-page history"><div class="bilan-page-content"><div class="bilan-page-head"><div><h2>Historique des pronos</h2><p>Encore vierge.</p></div><span class="page-number">H-1</span></div><p class="muted">Aucun prono terminé à afficher.</p></div></section>`;

    const pages = [];
    phaseGroups.forEach((group) => {
      this.chunk(group.rows, 24).forEach((chunk, chunkIndex) => {
        const dense = chunk.length >= 13 ? "history-dense" : chunk.length >= 7 ? "history-medium" : "history-roomy";
        const suffix = group.rows.length > 24 ? ` · suite ${chunkIndex + 1}` : "";
        pages.push({ label: `${group.label}${suffix}`, rows: chunk, dense });
      });
    });
    return pages.map((page, index) => `<section class="bilan-page history ${page.dense}"><div class="bilan-page-content"><div class="bilan-page-head"><div><h2>Historique des pronos</h2><p>${this.e(page.label)} · ${page.rows.length} match(s) sur cette feuille.</p></div><span class="page-number">H-${index + 1}</span></div><div class="history-capsule-grid">${page.rows.map((row) => { const result = this.resultLabel(row); return `<article class="history-capsule ${result.cls}"><small>${this.e(H.formatDateTime?.(row.kickoff_at) || row.match_day || "")}</small><strong>${this.matchTitleHtml(row)}</strong><p><span>Prono <b>${this.e(this.predText(row))}</b></span><span>Réel <b>${this.e(this.scoreText(row))}</b></span></p><span class="result-pill ${result.cls}">${this.e(result.text)} · ${this.e(row.points_total ?? 0)} pt(s)</span></article>`; }).join("")}</div></div></section>`).join("");
  },

  pageDiploma(player, avatarProfile, leaderboard, stats, title) {
    const totalPlayers = this.finalStandings({ family: this.isFamilyProfile(player) }).length || "—";
    const championPoints = this.n(leaderboard.champion_points);
    return `<section class="bilan-page diploma landscape-page"><div class="bilan-page-content">
      <div class="diploma-card diploma-final-layout">
        <div class="diploma-awardee">
          ${H.profileBadgeHtml(avatarProfile, "profile-badge leader")}
          <div class="diploma-kicker">Diplôme officiel du Nid</div>
          <h2>Décerné à<br>${this.e(player.pseudo || "Joueur")}</h2>
          <div class="diploma-rank-seal"><span>Classement final</span><strong>#${this.e(leaderboard.rank || "—")}</strong><small>sur ${this.e(totalPlayers)} joueur(s)</small></div>
        </div>
        <div class="diploma-honours">
          <h3>${this.e(title)}</h3>
          <p>Pour avoir survécu à la Coupe du monde 2026 avec <strong>${this.e(leaderboard.total_points ?? stats.total)} points</strong>, dont <strong>${this.e(championPoints)} point(s) de champion</strong>, <strong>${stats.exact} score(s) exact(s)</strong> et assez de casseroles pour nourrir tout le perchoir.</p>
          <div class="diploma-key-stats"><span><b>${this.e(stats.good)}</b> bons résultats</span><span><b>${this.e(stats.diff)}</b> bons écarts</span><span><b>${this.e(stats.qualified)}</b> bons qualifiés</span><span><b>${this.e(stats.average.toFixed(2))}</b> pt/match</span></div>
          <div class="signature-row"><div class="signature-line">Le Grand Hibou du Nid</div><div class="signature-line">Cachet officiel anti-casserole</div></div>
        </div>
      </div>
    </div></section>`;
  }

};

window.addEventListener("DOMContentLoaded", () => {
  BilanPDF.init().catch((error) => {
    console.error(error);
    BilanPDF.renderError("Erreur de chargement", error.message || String(error));
  });
});
