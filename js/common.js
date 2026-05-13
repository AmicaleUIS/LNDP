// ============================================================
// COMMON HELPERS
// ============================================================

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  if (!value) return "Date à confirmer";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateOnly(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(new Date(value));
}

function isKickoffPassed(kickoffAt) {
  return new Date(kickoffAt).getTime() <= Date.now();
}

function statusLabel(status) {
  const labels = {
    scheduled: "À venir",
    live: "En direct",
    finished: "Terminé",
    postponed: "Reporté",
    cancelled: "Annulé"
  };
  return labels[status] || status;
}

function stageLabel(stage) {
  const labels = {
    group: "Groupe",
    round_of_32: "16èmes",
    round_of_16: "8èmes",
    quarter_final: "Quarts",
    semi_final: "Demies",
    third_place: "3e place",
    final: "Finale"
  };
  return labels[stage] || stage;
}



function poolRoundLabel(match) {
  if (!match) return "";
  if (match.stage === "group") {
    const round = match.pool_round || match.group_round;
    return round ? `Journée de poule ${round}` : "Poule";
  }
  return stageLabel(match.stage);
}

function shortPoolRoundLabel(match) {
  if (!match) return "";
  if (match.stage === "group") {
    const round = match.pool_round || match.group_round;
    return round ? `J. poule ${round}` : "Poule";
  }
  return stageLabel(match.stage);
}

function formatShortDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short"
  }).format(new Date(value));
}

function matchDateRangeLabel(matches = []) {
  const dates = matches
    .map((m) => m?.kickoff_at ? new Date(m.kickoff_at) : null)
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!dates.length) return "Dates à confirmer";
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first.toDateString() === last.toDateString()) return formatDateOnly(first);
  return `${formatShortDate(first)} → ${formatShortDate(last)}`;
}

function groupMatchesByPouleRound(matches = []) {
  return matches.reduce((acc, match) => {
    let key = "";
    let order = 0;
    if (match.stage === "group") {
      const round = Number(match.pool_round || match.group_round || 0);
      key = round ? `Journée de poule ${round}` : "Poules — non classé";
      order = round || 99;
    } else {
      key = `Phase finale — ${stageLabel(match.stage)}`;
      const stageOrder = {
        round_of_32: 10,
        round_of_16: 11,
        quarter_final: 12,
        semi_final: 13,
        third_place: 14,
        final: 15
      };
      order = stageOrder[match.stage] || 20;
    }

    acc[key] ||= { key, order, matches: [] };
    acc[key].matches.push(match);
    return acc;
  }, {});
}

function flagUrlFromCountryCode(countryCode, shortName = "") {
  const code = String(countryCode || "").trim().toLowerCase();
  const short = String(shortName || "").trim().toUpperCase();

  const special = {
    ENG: "https://flagcdn.com/w80/gb-eng.png",
    SCO: "https://flagcdn.com/w80/gb-sct.png",
    WAL: "https://flagcdn.com/w80/gb-wls.png",
    NIR: "https://flagcdn.com/w80/gb-nir.png"
  };

  if (special[short]) return special[short];
  if (/^[a-z]{2}$/.test(code)) return `https://flagcdn.com/w80/${code}.png`;
  return "";
}

function flagImgHtml({ flagUrl = "", countryCode = "", shortName = "", name = "", className = "team-flag-img" } = {}) {
  const src = flagUrl || flagUrlFromCountryCode(countryCode, shortName);
  const label = name || shortName || countryCode || "équipe";
  if (!src) {
    const fallback = String(shortName || name || "?").slice(0, 3).toUpperCase();
    return `<span class="flag-placeholder" aria-hidden="true">${escapeHtml(fallback)}</span>`;
  }
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(src)}" alt="Drapeau ${escapeHtml(label)}" loading="lazy" referrerpolicy="no-referrer">`;
}

function matchFlagHtml(match, side = "home", className = "team-flag-img") {
  return flagImgHtml({
    flagUrl: match?.[`${side}_team_flag_url`],
    countryCode: match?.[`${side}_team_country_code`],
    shortName: match?.[`${side}_team_short_name`],
    name: match?.[`${side}_team_name`],
    className
  });
}


function tvChannelList(tvChannel = "") {
  const raw = String(tvChannel || "").toLowerCase();
  const channels = [];

  // Règle projet : tous les matchs sont diffusés sur beIN Sports.
  // M6 ou W9 peut être ajouté en plus sur les matchs sélectionnés par l'admin.
  channels.push("bein");
  if (raw.includes("m6") || raw.includes("m 6")) channels.push("m6");
  if (raw.includes("w9") || raw.includes("w 9")) channels.push("w9");

  return [...new Set(channels)];
}

function tvChannelText(tvChannel = "") {
  const list = tvChannelList(tvChannel);
  const extra = [];
  if (list.includes("m6")) extra.push("M6");
  if (list.includes("w9")) extra.push("W9");
  return extra.length ? `beIN Sports + ${extra.join(" / ")}` : "beIN Sports";
}

function tvChannelLogosHtml(tvChannel = "", className = "tv-logo-strip") {
  const channels = tvChannelList(tvChannel);
  const labels = {
    bein: "beIN Sports",
    m6: "M6",
    w9: "W9"
  };
  const files = {
    bein: "assets/icons/bein.png",
    m6: "assets/icons/m6.png",
    w9: "assets/icons/w9.png"
  };

  return `<span class="${escapeHtml(className)}" title="${escapeHtml(tvChannelText(tvChannel))}" aria-label="Diffusion : ${escapeHtml(tvChannelText(tvChannel))}">`
    + channels.map((channel) => `<img class="tv-logo tv-logo-${escapeHtml(channel)}" src="${escapeHtml(files[channel])}" alt="${escapeHtml(labels[channel])}" loading="lazy">`).join("")
    + `</span>`;
}



const AVATAR_LABELS = {
  "owl-01": "Capitaine Nid", "owl-02": "Chouette Ultra", "owl-03": "Gardien du Perchoir", "owl-04": "Écharpe Or", "owl-05": "Buteur Nocturne",
  "owl-06": "Sifflet magique", "owl-07": "Casquette SNA", "owl-08": "Vuvuzela Bleu", "owl-09": "Kop du Nid", "owl-10": "Supporter Or",
  "owl-11": "Chouette Tactique", "owl-12": "Plume Chanceuse", "owl-13": "Hibou 12e Homme", "owl-14": "Maillot Bleu", "owl-15": "Maillot Or",
  "owl-16": "Drapeau Haut", "owl-17": "Coach Hibou", "owl-18": "Chouette VAR", "owl-19": "Tambour du Nid", "owl-20": "Mascotte Folle",
  "owl-21": "Lunettes de Stade", "owl-22": "Chouette Chantante", "owl-23": "Hibou Casqué", "owl-24": "Étoile du Nid", "owl-25": "Globe Trotter",
  "owl-26": "Pluie de Confettis", "owl-27": "Chouette Fair-play", "owl-28": "Stratège Or", "owl-29": "Petit Hibou Fou", "owl-30": "Grand-Duc Fan"
};

function normalizeAvatarKey(key = "") {
  const value = String(key || "").trim();
  return AVATAR_LABELS[value] ? value : "owl-01";
}

function avatarUrl(key = "owl-01") {
  return `assets/avatars/${normalizeAvatarKey(key)}.png`;
}

function avatarLabel(key = "owl-01") {
  return AVATAR_LABELS[normalizeAvatarKey(key)] || "Chouette supporter";
}

function profileBadgeHtml(profile = {}, className = "profile-badge") {
  const avatarKey = normalizeAvatarKey(profile.avatar_key);
  const shape = String(profile.badge_shape || "rounded").replace(/[^a-z0-9_-]/gi, "") || "rounded";
  const color = String(profile.badge_color || "#facc15");
  const pseudo = profile.pseudo || avatarLabel(avatarKey);
  return `<span class="${escapeHtml(className)} badge-shape-${escapeHtml(shape)}" style="--badge-color:${escapeHtml(color)}" title="${escapeHtml(pseudo)}">
    <img src="${escapeHtml(avatarUrl(avatarKey))}" alt="Avatar ${escapeHtml(pseudo)}" loading="lazy">
  </span>`;
}

const OWL_PNG_ICON_MAP = {
  home: "accueil",
  nest: "accueil",
  accueil: "accueil",
  match: "matchs",
  matchs: "matchs",
  prono: "mes-pronos",
  pronos: "mes-pronos",
  "mes-pronos": "mes-pronos",
  trophy: "classements",
  leaderboard: "classements",
  classements: "classements",
  star: "exploits",
  exploits: "exploits",
  profile: "profil",
  profil: "profil",
  admin: "admin",
  mobile: "admin",
  pin: "lieu",
  lieu: "lieu",
  time: "horaire",
  horaire: "horaire",
  tv: "tv",
  lock: "verrouille",
  verrouille: "verrouille",
  live: "en-direct",
  "en-direct": "en-direct",
  upcoming: "a-venir",
  "a-venir": "a-venir",
  finished: "termine",
  termine: "termine",
  broadcast: "diffusion",
  diffusion: "diffusion",
  target: "score-exact",
  "score-exact": "score-exact",
  check: "bon-resultat",
  "bon-resultat": "bon-resultat",
  trend: "bon-ecart",
  "bon-ecart": "bon-ecart",
  qualified: "bon-qualifie",
  "bon-qualifie": "bon-qualifie",
  list: "matchs-comptes",
  "matchs-comptes": "matchs-comptes",
  pool: "journee-poule",
  "journee-poule": "journee-poule",
  bracket: "phase-finale",
  "phase-finale": "phase-finale",
  badges: "badges",
  worldcup: "coupe-du-monde",
  "coupe-du-monde": "coupe-du-monde",
  coupe: "coupe-du-monde"
};

function icon(name, label = "") {
  const safeName = escapeHtml(name);
  const safeLabel = escapeHtml(label || name);
  const fileName = OWL_PNG_ICON_MAP[name] || OWL_PNG_ICON_MAP[String(name).toLowerCase()] || "accueil";
  const aria = label ? `role="img" aria-label="${safeLabel}"` : 'aria-hidden="true"';
  return `<img class="owl-icon owl-icon-${safeName}" src="assets/icons/owl-png/${escapeHtml(fileName)}.png" alt="${label ? safeLabel : ""}" ${aria} loading="lazy">`;
}

function iconText(name, text, label = "") {
  return `${icon(name, label || text)}<span>${escapeHtml(text)}</span>`;
}

function toast(message, type = "info") {
  let box = $("#toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast";
    document.body.appendChild(box);
  }
  box.className = `toast toast-${type} show`;
  box.textContent = message;
  setTimeout(() => box.classList.remove("show"), 3500);
}

function scoreText(home, away) {
  if (home === null || home === undefined || away === null || away === undefined) return "-";
  return `${home} - ${away}`;
}


function hostCountryInfo(codeOrName = "") {
  const raw = String(codeOrName || "").trim().toUpperCase();
  const map = {
    CA: { code: "CA", name: "Canada", flagUrl: "assets/icons/flags/ca.png" },
    CANADA: { code: "CA", name: "Canada", flagUrl: "assets/icons/flags/ca.png" },
    US: { code: "US", name: "États-Unis", flagUrl: "assets/icons/flags/us.png" },
    USA: { code: "US", name: "États-Unis", flagUrl: "assets/icons/flags/us.png" },
    UNITED_STATES: { code: "US", name: "États-Unis", flagUrl: "assets/icons/flags/us.png" },
    "ÉTATS-UNIS": { code: "US", name: "États-Unis", flagUrl: "assets/icons/flags/us.png" },
    "ETATS-UNIS": { code: "US", name: "États-Unis", flagUrl: "assets/icons/flags/us.png" },
    MX: { code: "MX", name: "Mexique", flagUrl: "assets/icons/flags/mx.png" },
    MEXICO: { code: "MX", name: "Mexique", flagUrl: "assets/icons/flags/mx.png" },
    MEXIQUE: { code: "MX", name: "Mexique", flagUrl: "assets/icons/flags/mx.png" }
  };
  return map[raw] || null;
}

function hostCountryFlagHtml(matchOrCode, className = "host-country-flag") {
  const code = typeof matchOrCode === "string" ? matchOrCode : (matchOrCode?.venue_country_code || "");
  const explicitUrl = typeof matchOrCode === "object" ? matchOrCode?.venue_country_flag_url : "";
  const info = hostCountryInfo(code);
  const src = explicitUrl || info?.flagUrl || "";
  if (!src) return "";
  const name = typeof matchOrCode === "object" ? (matchOrCode?.venue_country_name || info?.name || code) : (info?.name || code);
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(src)}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}" loading="lazy">`;
}

function matchLocationHtml(match, compact = false) {
  const venue = match?.venue || "Stade à confirmer";
  const city = match?.city || "Ville à confirmer";
  const countryFlag = hostCountryFlagHtml(match, "host-country-flag location-country-flag");

  // Format demandé : PAYS - VILLE - STADE.
  // Pour le pays, on affiche uniquement le drapeau image local (Canada / États-Unis / Mexique).
  const parts = [
    countryFlag || `<span class="location-country-placeholder">Pays ?</span>`,
    `<span>${escapeHtml(city)}</span>`,
    `<span>${escapeHtml(venue)}</span>`
  ];

  return `${icon("pin")} <span class="location-format ${compact ? "location-format-compact" : ""}">${parts.join(' <span class="location-separator">-</span> ')}</span>`;
}

function resultIcon(row) {
  if (!row || row.points_total === null || row.points_total === undefined) return "";
  if (row.is_exact_score) return icon("target", "Score exact");
  if (row.is_good_result) return icon("check", "Bon résultat");
  if (row.is_good_goal_diff) return icon("trend", "Bon écart");
  return "";
}

window.Helpers = {
  $,
  $$,
  escapeHtml,
  formatDateTime,
  formatDateOnly,
  formatShortDate,
  matchDateRangeLabel,
  poolRoundLabel,
  shortPoolRoundLabel,
  groupMatchesByPouleRound,
  isKickoffPassed,
  statusLabel,
  stageLabel,
  toast,
  scoreText,
  resultIcon,
  icon,
  iconText,
  flagUrlFromCountryCode,
  flagImgHtml,
  matchFlagHtml,
  hostCountryInfo,
  hostCountryFlagHtml,
  matchLocationHtml,
  tvChannelList,
  tvChannelText,
  tvChannelLogosHtml,
  AVATAR_LABELS,
  normalizeAvatarKey,
  avatarUrl,
  avatarLabel,
  profileBadgeHtml
};
