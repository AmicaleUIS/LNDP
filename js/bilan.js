
// ============================================================
// LE NID DES PRONOS — BILAN PDF V1.2.6
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
      this.renderError("Bilan indisponible", `${error.message || "Erreur inconnue"}<br><br>Lance le patch SQL V1.2.6 si ce n’est pas encore fait.`);
      return;
    }

    this.state.report = data || {};
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

  unlockedBadges(stats) {
    const badges = [];
    const add = (condition, emoji, title, text) => { if (condition) badges.push({ emoji, title, text }); };
    add(stats.rows.length >= 1, "🥚", "Éclos de l’œuf", "Premier prono comptabilisé dans le grand nid.");
    add(stats.rows.length >= 10, "🪶", "Jeune plumage", "10 matchs comptabilisés, le bec commence à chauffer.");
    add(stats.exact >= 1, "🎯", "Œil de chouette", "Premier score exact trouvé.");
    add(stats.exact >= 3, "🔪", "Bec chirurgical", "3 scores exacts, précision suspecte mais acceptée.");
    add(stats.exact >= 10, "🦉", "Sniper à plumes", "10 scores exacts, le VAR demande une autopsie du marc de café.");
    add(stats.good >= 10, "📒", "Hibou comptable", "10 bons résultats : pas toujours flamboyant, mais rentable.");
    add(stats.diff >= 5, "📐", "Géomètre du nid", "5 bons écarts, compas dans les serres.");
    add(stats.qualified >= 1, "⚔️", "Match couperet maîtrisé", "Au moins un qualifié bien senti.");
    add(stats.total >= 50, "🏅", "Nid doré", "50 points ou plus, ça commence à briller.");
    add(stats.total >= 100, "🏆", "Nid platine", "100 points ou plus, la branche plie.");
    add(this.streak(stats.rows, (r) => r.is_exact_score) >= 3, "🔥", "Triplé du Grand-Duc", "3 scores exacts d’affilée. Là, ça sent la sorcellerie.");
    add(this.streak(stats.rows, (r) => this.n(r.points_total) === 0) >= 5, "🌫️", "Tunnel du néant", "5 matchs à zéro point. Le nid a éteint la lumière.");
    add(stats.rows.length && stats.zeros === stats.rows.length, "🪹", "Nid vide", "Une constance dans le brouillard que même les chouettes respectent.");
    return badges.slice(0, 15);
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
    const champion = report.champion_prediction || null;
    const stats = this.stats();
    const badges = this.unlockedBadges(stats);
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
          <div class="rank-row"><div><strong>Famille joueur</strong><small>classement parallèle</small></div><span class="big-rank">#${this.e(family.rank || "—")}</span></div>
          <div class="rank-row"><div><strong>Famille team</strong><small>moyenne équipe famille</small></div><span class="big-rank">#${this.e(familyTeam.rank || "—")}</span></div>
        </div></div>
        <div class="graph-card"><h3>Champion du monde</h3>${champion ? `<p>Choix : <strong>${this.e(champion.predicted_team_name)}</strong></p><p>Bonus : <strong>${this.e(champion.points_total || 0)} pts</strong></p><p class="muted">${champion.actual_winner_team_name ? `Vainqueur réel : ${this.e(champion.actual_winner_team_name)}` : "En attente du vainqueur final."}</p>` : `<p class="muted">Aucun champion choisi ou donnée indisponible.</p>`}</div>
      </div>
    </div></section>`;
  },

  pageBadges(badges, stats) {
    return `<section class="bilan-page badges"><div class="bilan-page-content">
      <div class="bilan-page-head"><div><h2>Mur des exploits</h2><p>${badges.length} badge(s) repéré(s) dans ce bilan. Le nid garde les preuves.</p></div><span class="page-number">03</span></div>
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
