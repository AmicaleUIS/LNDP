
// ============================================================
// LE NID DES PRONOS — BILAN PDF V1.3.10
// ============================================================

const H = window.Helpers;

const BilanPDF = {
  state: {
    session: null,
    adminProfile: null,
    report: null,
    playerId: null,
    refreshTimer: null,
    realtimeChannel: null
  },

  async init() {
    this.state.session = await Auth.requireSession();
    if (!this.state.session) return;

    const params = new URLSearchParams(window.location.search);
    this.state.playerId = params.get("player") || this.state.session.user.id;

    await this.loadAdminProfile();
    if (!this.isSuperAdmin() && this.state.playerId !== this.state.session.user.id) {
      this.renderError("Accès réservé", "Ce bilan est consultable par le super admin pour le moment.");
      return;
    }

    H.$("#refreshBilanBtn")?.addEventListener("click", () => this.loadAndRender());
    H.$("#printBilanBtn")?.addEventListener("click", () => window.print());

    await this.loadAndRender();
    if (params.get("print") === "1") {
      window.setTimeout(() => window.print(), 700);
    }
    this.setupRealtime();
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
    if (root) root.classList.add("is-loading");

    const { data, error } = await window.sb.rpc("admin_get_final_player_report", {
      p_user_id: this.state.playerId
    });

    if (error) {
      this.renderError("Bilan indisponible", `${error.message || "Erreur inconnue"}<br><br>Lance le patch SQL V1.3.0 si ce n’est pas encore fait.`);
      return;
    }

    this.state.report = data || {};
    await this.enrichReportWithChampionFallback();
    this.render();
    if (root) root.classList.remove("is-loading");
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
    if (report.champion_prediction || report.winner_prediction || report.winner) return;

    const fromView = await this.fetchChampionFromView().catch(() => null);
    const fromTable = fromView || await this.fetchChampionFromTable().catch(() => null);
    if (fromTable) {
      this.state.report = {
        ...report,
        champion_prediction: this.normalizeChampionPrediction(fromTable)
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
        return found ? { id: item, ...found } : { id: item, emoji: "🏅", title: item, text: "Exploit enregistré dans le Nid." };
      }
      if (item && typeof item === "object") {
        const id = item.id || item.badge_id || item.key || item.code || item.title;
        const found = catalog[id];
        return {
          id,
          emoji: item.emoji || found?.emoji || "🏅",
          title: item.title || item.name || found?.title || id || "Exploit",
          text: item.text || item.description || found?.text || "Exploit enregistré dans le Nid."
        };
      }
      return null;
    }).filter(Boolean);
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

  officialPredictions() {
    return (this.state.report.predictions || []).filter((row) => !row.is_test_match);
  },

  showFamilyContext() {
    const player = this.state.report.profile || {};
    return player.role === "family" || player.player_scope === "family" || player.show_family_players === true;
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
    const average = rows.length ? total / rows.length : 0;
    const best = [...rows].sort((a,b) => this.n(b.points_total) - this.n(a.points_total))[0] || null;
    const worst = [...rows].sort((a,b) => this.n(a.points_total) - this.n(b.points_total))[0] || null;
    const bestDay = this.bestDay(rows);
    return { rows, total, exact, good, diff, qualified, zeros, average, best, worst, bestDay };
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

  unlockedBadges(stats, champion = null) {
    const badges = [];
    const used = new Set();
    const catalog = this.badgeCatalogLite();

    const push = (id, condition = true, override = {}) => {
      if (!condition || used.has(id)) return;
      const base = catalog[id] || {};
      badges.push({
        id,
        emoji: override.emoji || base.emoji || "🏅",
        title: override.title || base.title || id,
        text: override.text || base.text || "Exploit enregistré dans le Nid."
      });
      used.add(id);
    };

    this.reportBadgeCandidates().forEach((badge) => {
      const id = badge.id || badge.title;
      if (!id || used.has(id)) return;
      badges.push(badge);
      used.add(id);
    });

    const officialPredictions = this.allPredictionRows({ includeTest: false });
    const allPredictions = this.allPredictionRows({ includeTest: true });
    const testPredictions = allPredictions.filter((row) => row.is_test_match);
    const knownOfficialMatches = (this.state.report.predictions || []).filter((row) => !row.is_test_match);
    const knownOfficialCount = knownOfficialMatches.length;
    const predictionCount = officialPredictions.length;
    const championPicked = Boolean(champion?.predicted_team_id || champion?.predicted_team_name);

    push("egg-hatched", predictionCount >= 1);
    push("young-feathers", predictionCount >= 10);
    push("half-nest", knownOfficialCount > 0 && predictionCount >= Math.ceil(knownOfficialCount / 2));
    push("three-quarter-perch", knownOfficialCount > 0 && predictionCount >= Math.ceil(knownOfficialCount * 0.75));
    push("all-picks-in", knownOfficialCount > 0 && predictionCount >= knownOfficialCount);
    push("champion-picked", championPicked, championPicked ? { text: `Champion choisi : ${champion.predicted_team_name || "équipe enregistrée"}.` } : {});
    push("preparation-two-picks", testPredictions.length >= 2);
    push("prep-good-pick", testPredictions.some((row) => this.n(row.points_total) > 0 || row.is_exact_score || row.is_good_result || row.is_good_goal_diff || row.is_good_qualified));

    push("first-flight", stats.rows.length >= 1);
    push("first-perfect", stats.exact >= 1);
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

    return badges.slice(0, 24);
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

  predictionsTableHtml(rows) {
    const shown = rows.slice(0, 36);
    return `
      <div class="prediction-table-wrap">
        <table class="prediction-table">
          <thead><tr><th>Match</th><th>Prono</th><th>Réel</th><th>Pts</th><th>Verdict</th></tr></thead>
          <tbody>
            ${shown.map((row) => {
              const result = this.resultLabel(row);
              return `<tr>
                <td><strong>${this.e(row.home_team_short_name || row.home_team_name)}</strong> - <strong>${this.e(row.away_team_short_name || row.away_team_name)}</strong><br><small>${this.e(H.formatShortDate ? H.formatShortDate(row.kickoff_at) : (row.match_day || ""))}</small></td>
                <td>${this.e(this.predText(row))}${row.qualified_team_name ? `<br><small>Qualifié : ${this.e(row.qualified_team_name)}</small>` : ""}</td>
                <td>${this.e(this.scoreText(row))}</td>
                <td><strong>${this.e(row.points_total ?? "—")}</strong></td>
                <td><span class="result-pill ${result.cls}">${this.e(result.text)}</span></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
        ${rows.length > shown.length ? `<p class="bilan-note">${rows.length - shown.length} prono(s) supplémentaire(s) non affiché(s) dans cette page de synthèse.</p>` : ""}
      </div>`;
  },

  render() {
    const root = H.$("#bilanRoot");
    if (!root) return;
    const report = this.state.report || {};
    const player = report.profile || {};
    const leaderboard = report.leaderboard || {};
    const team = report.team_leaderboard || {};
    const family = report.family_rank || {};
    const familyTeam = report.family_team_rank || {};
    const champion = this.normalizeChampionPrediction(report.champion_prediction || report.winner_prediction || report.winner || null);
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

    root.innerHTML = `
      <article class="bilan-document">
        ${this.pageCover(player, avatarProfile, leaderboard, stats, title, quote)}
        ${this.pageStats(player, leaderboard, team, family, familyTeam, champion, stats)}
        ${this.pageBadges(badges, stats)}
        ${this.pageRecords(stats)}
        ${this.pageGraphs(stats)}
        ${this.pageDiploma(player, avatarProfile, leaderboard, stats, title)}
      </article>`;
  },

  pageCover(player, avatarProfile, leaderboard, stats, title, quote) {
    return `<section class="bilan-page cover"><div class="bilan-page-content cover-layout">
      <div class="cover-top">
        <div class="cover-brand"><img src="assets/icons/icon-192.png" alt=""><div><strong>Le Nid des Pronos</strong><span>Coupe du monde 2026</span></div></div>
        <span class="page-number">PDF FINAL · 01</span>
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

  pageStats(player, leaderboard, team, family, familyTeam, champion, stats) {
    const showFamily = this.showFamilyContext();
    const familyRows = showFamily ? `
          <div class="rank-row"><div><strong>Famille joueur</strong><small>classement parallèle</small></div><span class="big-rank">#${this.e(family.rank || "—")}</span></div>
          <div class="rank-row"><div><strong>Famille team</strong><small>moyenne équipe famille</small></div><span class="big-rank">#${this.e(familyTeam.rank || "—")}</span></div>
    ` : "";
    return `<section class="bilan-page stats"><div class="bilan-page-content">
      <div class="bilan-page-head"><div><h2>Tableau de chasse</h2><p>Les chiffres froids, les plumes chaudes, et les quelques casseroles assumées.</p></div><span class="page-number">02</span></div>
      <div class="stats-grid">
        <div class="stat-card feature"><strong>${this.e(leaderboard.total_points ?? stats.total)}</strong><span>points au total</span></div>
        <div class="stat-card"><strong>#${this.e(leaderboard.rank || "—")}</strong><span>rang joueur</span></div>
        <div class="stat-card"><strong>${stats.exact}</strong><span>scores exacts</span></div>
        <div class="stat-card"><strong>${stats.good}</strong><span>bons résultats</span></div>
        <div class="stat-card"><strong>${stats.diff}</strong><span>bons écarts</span></div>
        <div class="stat-card"><strong>${stats.qualified}</strong><span>bons qualifiés</span></div>
        <div class="stat-card"><strong>${stats.zeros}</strong><span>zéros pointés</span></div>
        <div class="stat-card"><strong>${stats.rows.length}</strong><span>matchs comptés</span></div>
      </div>
      <div class="two-col">
        <div class="graph-card"><h3>Classements</h3><div class="ranking-list">
          <div class="rank-row"><div><strong>Joueur officiel</strong><small>${this.e(player.pseudo)}</small></div><span class="big-rank">#${this.e(leaderboard.rank || "—")}</span></div>
          <div class="rank-row"><div><strong>Team officielle</strong><small>${this.e(team.office_team_name || player.office_team_name || "Sans team")}</small></div><span class="big-rank">#${this.e(team.rank || "—")}</span></div>
          ${familyRows}
        </div></div>
        <div class="graph-card champion-card"><h3>Champion du monde</h3>${champion ? `<div class="champion-pick-line">${champion.predicted_team_flag_url || champion.predicted_team_country_code ? H.flagImgHtml({ flagUrl: champion.predicted_team_flag_url, countryCode: champion.predicted_team_country_code, shortName: champion.predicted_team_short_name, name: champion.predicted_team_name, className: "team-flag-img champion-option-flag" }) : ""}<p>Choix : <strong>${this.e(champion.predicted_team_name)}</strong></p></div><p>Bonus actuel : <strong>${this.e(champion.points_total || 0)} pts</strong></p><p class="muted">${champion.actual_winner_team_name ? `Vainqueur réel : ${this.e(champion.actual_winner_team_name)}` : "En attente du vainqueur final."}</p>` : `<p class="muted">Aucun champion choisi ou donnée indisponible.</p>`}</div>
      </div>
    </div></section>`;
  },

  pageBadges(badges, stats) {
    return `<section class="bilan-page badges"><div class="bilan-page-content">
      <div class="bilan-page-head"><div><h2>Mur des exploits</h2><p>${badges.length} exploit(s) repéré(s) : pronos posés, champion choisi, préparation et résultats déjà comptabilisés.</p></div><span class="page-number">03</span></div>
      <div class="badge-grid">
        ${badges.length ? badges.map((badge) => `<article class="badge-card"><span class="badge-emoji">${badge.emoji}</span><strong>${this.e(badge.title)}</strong><p>${this.e(badge.text)}</p></article>`).join("") : `<article class="badge-card"><span class="badge-emoji">🪹</span><strong>Le nid attend</strong><p>Les badges apparaîtront avec les résultats comptabilisés.</p></article>`}
      </div>
    </div></section>`;
  },

  pageRecords(stats) {
    const best = stats.best;
    const worst = stats.worst;
    const exactStreak = this.streak(stats.rows, (row) => row.is_exact_score);
    const goodStreak = this.streak(stats.rows, (row) => row.is_good_result);
    const zeroStreak = this.streak(stats.rows, (row) => this.n(row.points_total) === 0);
    return `<section class="bilan-page records"><div class="bilan-page-content">
      <div class="bilan-page-head"><div><h2>Records & casseroles</h2><p>Les moments que le hibou racontera au coin du perchoir.</p></div><span class="page-number">04</span></div>
      <div class="record-grid">
        <article class="record-card"><span class="value">${best ? this.e(best.points_total) : "—"}</span><strong>Meilleur match</strong><small>${best ? `${this.e(best.home_team_name)} - ${this.e(best.away_team_name)}` : "En attente"}</small></article>
        <article class="record-card"><span class="value">${stats.bestDay ? this.e(stats.bestDay.points) : "—"}</span><strong>Meilleure journée</strong><small>${stats.bestDay ? `${this.e(stats.bestDay.key)} · ${stats.bestDay.matches} match(s)` : "En attente"}</small></article>
        <article class="record-card"><span class="value">${exactStreak}</span><strong>Série scores exacts</strong><small>Le pic de précision du tournoi.</small></article>
        <article class="record-card"><span class="value">${goodStreak}</span><strong>Série bons résultats</strong><small>Le mode pilote automatique.</small></article>
        <article class="record-card"><span class="value">${zeroStreak}</span><strong>Traversée du brouillard</strong><small>Le tunnel zéro, version plumes mouillées.</small></article>
        <article class="record-card"><span class="value">${worst ? this.e(worst.points_total) : "—"}</span><strong>Casserole favorite</strong><small>${worst ? `${this.e(worst.home_team_name)} - ${this.e(worst.away_team_name)} · prono ${this.e(this.predText(worst))}` : "Aucune casserole officielle"}</small></article>
      </div>
    </div></section>`;
  },

  pageGraphs(stats) {
    return `<section class="bilan-page graphs"><div class="bilan-page-content">
      <div class="bilan-page-head"><div><h2>Courbes du perchoir</h2><p>Évolution des points et moyennes par phase.</p></div><span class="page-number">05</span></div>
      <div class="two-col">
        <div class="graph-card"><h3>Progression cumulée</h3>${this.lineChartSvg(stats.rows)}</div>
        <div class="graph-card"><h3>Moyennes par phase</h3>${this.barsHtml(stats.rows)}</div>
      </div>
      <div class="graph-card" style="margin-top:18px"><h3>Historique des pronos</h3>${this.predictionsTableHtml(stats.rows)}</div>
    </div></section>`;
  },

  pageDiploma(player, avatarProfile, leaderboard, stats, title) {
    return `<section class="bilan-page diploma"><div class="bilan-page-content">
      <div class="diploma-card">
        ${H.profileBadgeHtml(avatarProfile, "profile-badge leader")}
        <div class="diploma-kicker">Diplôme officiel du Nid</div>
        <h2>Décerné à<br>${this.e(player.pseudo || "Joueur")}</h2>
        <h3>${this.e(title)}</h3>
        <p>Pour avoir survécu à la Coupe du monde 2026 avec <strong>${this.e(leaderboard.total_points ?? stats.total)} points</strong>, <strong>${stats.exact} score(s) exact(s)</strong>, et une capacité remarquable à transformer les pronostics en grand spectacle de plumes.</p>
        <div class="signature-row"><div class="signature-line">Le Grand Hibou du Nid</div><div class="signature-line">Cachet officiel anti-casserole</div></div>
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
