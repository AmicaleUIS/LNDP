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
  if (match.is_test_match) return "Match de préparation · TEST";
  if (match.stage === "group") {
    const round = match.pool_round || match.group_round;
    return round ? `Journée de poule ${round}` : "Poule";
  }
  return stageLabel(match.stage);
}

function shortPoolRoundLabel(match) {
  if (!match) return "";
  if (match.is_test_match) return "Prépa · TEST";
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

    if (match.is_test_match) {
      key = "Matchs de préparation · TEST";
      order = -10;
    } else if (match.stage === "group") {
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

  if (raw.includes("tf1") || raw.includes("t f 1")) channels.push("tf1");

  // Règle projet : les matchs officiels sont diffusés sur beIN Sports.
  // M6 ou W9 peut être ajouté en plus sur les matchs sélectionnés par l'admin.
  if (!channels.length || raw.includes("bein") || raw.includes("be in")) channels.push("bein");
  if (raw.includes("m6") || raw.includes("m 6")) channels.push("m6");
  if (raw.includes("w9") || raw.includes("w 9")) channels.push("w9");

  return [...new Set(channels)];
}

function tvChannelText(tvChannel = "") {
  const list = tvChannelList(tvChannel);
  const extra = [];
  if (list.includes("tf1") && !list.includes("bein")) return "TF1";
  if (list.includes("tf1")) extra.push("TF1");
  if (list.includes("m6")) extra.push("M6");
  if (list.includes("w9")) extra.push("W9");
  return extra.length ? `beIN Sports + ${extra.join(" / ")}` : "beIN Sports";
}

function tvChannelLogosHtml(tvChannel = "", className = "tv-logo-strip") {
  const channels = tvChannelList(tvChannel);
  const labels = {
    bein: "beIN Sports",
    m6: "M6",
    w9: "W9",
    tf1: "TF1"
  };
  const files = {
    bein: "assets/icons/bein.png",
    m6: "assets/icons/m6.png",
    w9: "assets/icons/w9.png",
    tf1: "assets/icons/tf1.png"
  };

  return `<span class="${escapeHtml(className)}" title="${escapeHtml(tvChannelText(tvChannel))}" aria-label="Diffusion : ${escapeHtml(tvChannelText(tvChannel))}">`
    + channels.map((channel) => `<img class="tv-logo tv-logo-${escapeHtml(channel)}" src="${escapeHtml(files[channel])}" alt="${escapeHtml(labels[channel])}" loading="lazy">`).join("")
    + `</span>`;
}



const AVATAR_META = Object.freeze({
  "owl-03": { label: "Le Stratège bras croisés", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-03-le-stratege-bras-croises.png" },
  "owl-04": { label: "Gardien aux serres sûres", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-04-gardien-aux-serres-sures.png" },
  "owl-10": { label: "Le commentateur perché", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-10-le-commentateur-perche.png" },
  "owl-11": { label: "Le vieux micro du dimanche", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-11-le-vieux-micro-du-dimanche.png" },
  "owl-17": { label: "Capitaine pas content", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-17-capitaine-pas-content.png" },
  "owl-18": { label: "Le coach au sifflet", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-18-le-coach-au-sifflet.png" },
  "owl-30": { label: "Le remplaçant invisible", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-30-le-remplacant-invisible.png" },
  "owl-51": { label: "Arbitre carton rouge", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-51-arbitre-carton-rouge.png" },
  "owl-52": { label: "Gardien vert tranquille", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-52-gardien-vert-tranquille.png" },
  "owl-53": { label: "Collectionneur de ballons", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-53-collectionneur-de-ballons.png" },
  "owl-54": { label: "Captain Hibou", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-54-captain-hibou.png" },
  "owl-55": { label: "Tacticien du tableau", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-55-tacticien-du-tableau.png" },
  "owl-65": { label: "Gardien vert vieux briscard", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-65-gardien-vert-vieux-briscard.png" },
  "owl-82": { label: "Gardien trèfle au ballon", type: "terrain", typeLabel: "Terrain · coachs, gardiens & arbitres", file: "assets/avatars/terrain/owl-82-gardien-trefle-au-ballon.png" },
  "owl-02": { label: "Casquette rouge du mercato", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-02-casquette-rouge-du-mercato.png" },
  "owl-06": { label: "Le Vert qui donne de la voix", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-06-le-vert-qui-donne-de-la-voix.png" },
  "owl-08": { label: "Ultra incognito", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-08-ultra-incognito.png" },
  "owl-13": { label: "Ninja du kop", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-13-ninja-du-kop.png" },
  "owl-26": { label: "Crête de hooli-hibou", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-26-crete-de-hooli-hibou.png" },
  "owl-27": { label: "Rockeur des tribunes", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-27-rockeur-des-tribunes.png" },
  "owl-28": { label: "Petit drapeau, grand cri", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-28-petit-drapeau-grand-cri.png" },
  "owl-29": { label: "Capuche du carton noir", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-29-capuche-du-carton-noir.png" },
  "owl-66": { label: "Mégaphone du kop noir", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-66-megaphone-du-kop-noir.png" },
  "owl-67": { label: "Crête bleu-rouge furieuse", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-67-crete-bleu-rouge-furieuse.png" },
  "owl-68": { label: "Lunettes rouges, sang-froid", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-68-lunettes-rouges-sang-froid.png" },
  "owl-70": { label: "Bouffon rouge et bleu", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-70-bouffon-rouge-et-bleu.png" },
  "owl-71": { label: "Perruque rouge à lunettes", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-71-perruque-rouge-a-lunettes.png" },
  "owl-79": { label: "Lunettes noires du virage", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-79-lunettes-noires-du-virage.png" },
  "owl-81": { label: "Bucket rouge et bleu", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-81-bucket-rouge-et-bleu.png" },
  "owl-85": { label: "Capuche du néant", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-85-capuche-du-neant.png" },
  "owl-88": { label: "Porte-fanion rouge et bleu", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-88-porte-fanion-rouge-et-bleu.png" },
  "owl-89": { label: "Casquette rouge au ballon", type: "kop-ultras", typeLabel: "Kop · ultras & tribunes", file: "assets/avatars/kop-ultras/owl-89-casquette-rouge-au-ballon.png" },
  "owl-07": { label: "Le Bouffon des tribunes", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-07-le-bouffon-des-tribunes.png" },
  "owl-09": { label: "Vuvuzela niveau 11", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-09-vuvuzela-niveau-11.png" },
  "owl-12": { label: "Perruque des prolongations", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-12-perruque-des-prolongations.png" },
  "owl-14": { label: "Doigt mousse numéro 1", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-14-doigt-mousse-numero-1.png" },
  "owl-16": { label: "Amoureux du ballon rond", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-16-amoureux-du-ballon-rond.png" },
  "owl-19": { label: "Trèfle de la chance", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-19-trefle-de-la-chance.png" },
  "owl-21": { label: "Tambour du virage", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-21-tambour-du-virage.png" },
  "owl-22": { label: "Écharpe-doudou du froid", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-22-echarpe-doudou-du-froid.png" },
  "owl-23": { label: "Le roi du ballon", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-23-le-roi-du-ballon.png" },
  "owl-25": { label: "Tête au ballon", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-25-tete-au-ballon.png" },
  "owl-58": { label: "Coup de foudre pour le ballon", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-58-coup-de-foudre-pour-le-ballon.png" },
  "owl-59": { label: "Vuvuzela tropicale", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-59-vuvuzela-tropicale.png" },
  "owl-69": { label: "Tambour ciel et blanc", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-69-tambour-ciel-et-blanc.png" },
  "owl-73": { label: "La pinte du troisième mi-temps", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-73-la-pinte-du-troisieme-mi-temps.png" },
  "owl-80": { label: "Mousse finger puissance 1", type: "ambiance", typeLabel: "Ambiance · accessoires & mascottes", file: "assets/avatars/ambiance/owl-80-mousse-finger-puissance-1.png" },
  "owl-01": { label: "Le Bleu-blanc-bougon", type: "nations-couleurs", typeLabel: "Nations & couleurs", file: "assets/avatars/nations-couleurs/owl-01-le-bleu-blanc-bougon.png" },
  "owl-05": { label: "La chouette Mannschaft", type: "nations-couleurs", typeLabel: "Nations & couleurs", file: "assets/avatars/nations-couleurs/owl-05-la-chouette-mannschaft.png" },
  "owl-15": { label: "Le drapeau jaune et bleu", type: "nations-couleurs", typeLabel: "Nations & couleurs", file: "assets/avatars/nations-couleurs/owl-15-le-drapeau-jaune-et-bleu.png" },
  "owl-20": { label: "Tifoso azzurro excité", type: "nations-couleurs", typeLabel: "Nations & couleurs", file: "assets/avatars/nations-couleurs/owl-20-tifoso-azzurro-excite.png" },
  "owl-24": { label: "Rouge et blanc en fusion", type: "nations-couleurs", typeLabel: "Nations & couleurs", file: "assets/avatars/nations-couleurs/owl-24-rouge-et-blanc-en-fusion.png" },
  "owl-56": { label: "Fou du stade tricolore", type: "nations-couleurs", typeLabel: "Nations & couleurs", file: "assets/avatars/nations-couleurs/owl-56-fou-du-stade-tricolore.png" },
  "owl-57": { label: "Supporter damier chic", type: "nations-couleurs", typeLabel: "Nations & couleurs", file: "assets/avatars/nations-couleurs/owl-57-supporter-damier-chic.png" },
  "owl-60": { label: "Le coq-hibou tricolore", type: "nations-couleurs", typeLabel: "Nations & couleurs", file: "assets/avatars/nations-couleurs/owl-60-le-coq-hibou-tricolore.png" },
  "owl-75": { label: "Klaxon bleu-blanc-rouge", type: "nations-couleurs", typeLabel: "Nations & couleurs", file: "assets/avatars/nations-couleurs/owl-75-klaxon-bleu-blanc-rouge.png" },
  "owl-83": { label: "Bleu-blanc-rouge énervé", type: "nations-couleurs", typeLabel: "Nations & couleurs", file: "assets/avatars/nations-couleurs/owl-83-bleu-blanc-rouge-enerve.png" },
  "owl-31": { label: "Brestois pur beurre", type: "club-brest", typeLabel: "Club · Brest / SB29", file: "assets/avatars/club-brest/owl-31-brestois-pur-beurre.png" },
  "owl-32": { label: "Rouge et blanc fermé", type: "club-brest", typeLabel: "Club · Brest / SB29", file: "assets/avatars/club-brest/owl-32-rouge-et-blanc-ferme.png" },
  "owl-33": { label: "SB29 en mode guerrier", type: "club-brest", typeLabel: "Club · Brest / SB29", file: "assets/avatars/club-brest/owl-33-sb29-en-mode-guerrier.png" },
  "owl-61": { label: "Brestois rouge tempête", type: "club-brest", typeLabel: "Club · Brest / SB29", file: "assets/avatars/club-brest/owl-61-brestois-rouge-tempete.png" },
  "owl-78": { label: "Chevalier du SB29", type: "club-brest", typeLabel: "Club · Brest / SB29", file: "assets/avatars/club-brest/owl-78-chevalier-du-sb29.png" },
  "owl-34": { label: "Minot de l’OM", type: "club-om", typeLabel: "Club · OM", file: "assets/avatars/club-om/owl-34-minot-de-lom.png" },
  "owl-35": { label: "Bob marseillais clignotant", type: "club-om", typeLabel: "Club · OM", file: "assets/avatars/club-om/owl-35-bob-marseillais-clignotant.png" },
  "owl-36": { label: "L’OM à lunettes", type: "club-om", typeLabel: "Club · OM", file: "assets/avatars/club-om/owl-36-lom-a-lunettes.png" },
  "owl-37": { label: "Mégaphone du Vélodrome", type: "club-om", typeLabel: "Club · OM", file: "assets/avatars/club-om/owl-37-megaphone-du-velodrome.png" },
  "owl-38": { label: "Marseillais bras croisés", type: "club-om", typeLabel: "Club · OM", file: "assets/avatars/club-om/owl-38-marseillais-bras-croises.png" },
  "owl-39": { label: "Perruque Allez l’OM", type: "club-om", typeLabel: "Club · OM", file: "assets/avatars/club-om/owl-39-perruque-allez-lom.png" },
  "owl-40": { label: "Écharpe ciel et blanc", type: "club-om", typeLabel: "Club · OM", file: "assets/avatars/club-om/owl-40-echarpe-ciel-et-blanc.png" },
  "owl-62": { label: "Marseillais les ailes en l’air", type: "club-om", typeLabel: "Club · OM", file: "assets/avatars/club-om/owl-62-marseillais-les-ailes-en-lair.png" },
  "owl-72": { label: "Minot bleu motivé", type: "club-om", typeLabel: "Club · OM", file: "assets/avatars/club-om/owl-72-minot-bleu-motive.png" },
  "owl-74": { label: "Supporter ciel et blanc sérieux", type: "club-om", typeLabel: "Club · OM", file: "assets/avatars/club-om/owl-74-supporter-ciel-et-blanc-serieux.png" },
  "owl-77": { label: "Olympien ballon collé", type: "club-om", typeLabel: "Club · OM", file: "assets/avatars/club-om/owl-77-olympien-ballon-colle.png" },
  "owl-84": { label: "Porte-drapeau de l’OM", type: "club-om", typeLabel: "Club · OM", file: "assets/avatars/club-om/owl-84-porte-drapeau-de-lom.png" },
  "owl-41": { label: "Gone en casquette rouge", type: "club-ol", typeLabel: "Club · OL", file: "assets/avatars/club-ol/owl-41-gone-en-casquette-rouge.png" },
  "owl-42": { label: "Petit gone motivé", type: "club-ol", typeLabel: "Club · OL", file: "assets/avatars/club-ol/owl-42-petit-gone-motive.png" },
  "owl-43": { label: "OL dans les plumes", type: "club-ol", typeLabel: "Club · OL", file: "assets/avatars/club-ol/owl-43-ol-dans-les-plumes.png" },
  "owl-44": { label: "Mamie du virage lyonnais", type: "club-ol", typeLabel: "Club · OL", file: "assets/avatars/club-ol/owl-44-mamie-du-virage-lyonnais.png" },
  "owl-45": { label: "Gone au ballon", type: "club-ol", typeLabel: "Club · OL", file: "assets/avatars/club-ol/owl-45-gone-au-ballon.png" },
  "owl-63": { label: "Lyonnais triple bande", type: "club-ol", typeLabel: "Club · OL", file: "assets/avatars/club-ol/owl-63-lyonnais-triple-bande.png" },
  "owl-87": { label: "Gone signe victoire", type: "club-ol", typeLabel: "Club · OL", file: "assets/avatars/club-ol/owl-87-gone-signe-victoire.png" },
  "owl-46": { label: "Parisien bonnet PSG", type: "club-psg", typeLabel: "Club · PSG / Paris", file: "assets/avatars/club-psg/owl-46-parisien-bonnet-psg.png" },
  "owl-47": { label: "PSG poings levés", type: "club-psg", typeLabel: "Club · PSG / Paris", file: "assets/avatars/club-psg/owl-47-psg-poings-leves.png" },
  "owl-48": { label: "Paris capuche sombre", type: "club-psg", typeLabel: "Club · PSG / Paris", file: "assets/avatars/club-psg/owl-48-paris-capuche-sombre.png" },
  "owl-49": { label: "Drapeau parisien VIP", type: "club-psg", typeLabel: "Club · PSG / Paris", file: "assets/avatars/club-psg/owl-49-drapeau-parisien-vip.png" },
  "owl-50": { label: "Perruque bleu-blanc-rouge", type: "club-psg", typeLabel: "Club · PSG / Paris", file: "assets/avatars/club-psg/owl-50-perruque-bleu-blanc-rouge.png" },
  "owl-64": { label: "Parisien poing fermé", type: "club-psg", typeLabel: "Club · PSG / Paris", file: "assets/avatars/club-psg/owl-64-parisien-poing-ferme.png" },
  "owl-76": { label: "Parisien clin d’œil", type: "club-psg", typeLabel: "Club · PSG / Paris", file: "assets/avatars/club-psg/owl-76-parisien-clin-dil.png" },
  "owl-86": { label: "Ultra sombre en lunettes", type: "club-psg", typeLabel: "Club · PSG / Paris", file: "assets/avatars/club-psg/owl-86-ultra-sombre-en-lunettes.png" },
  "owl-90": { label: "PSG cagoule du virage", type: "club-psg", typeLabel: "Club · PSG / Paris", file: "assets/avatars/club-psg/owl-90-psg-cagoule-du-virage.png" }
});

const AVATAR_LABELS = Object.freeze(Object.fromEntries(
  Object.entries(AVATAR_META).map(([key, avatar]) => [key, avatar.label])
));

function normalizeAvatarKey(key = "") {
  const value = String(key || "").trim();
  return AVATAR_META[value] ? value : "owl-01";
}

function avatarUrl(key = "owl-01") {
  const avatar = AVATAR_META[normalizeAvatarKey(key)] || AVATAR_META["owl-01"];
  return avatar.file;
}

function avatarLabel(key = "owl-01") {
  return AVATAR_META[normalizeAvatarKey(key)]?.label || "Chouette supporter";
}



function avatarType(key = "owl-01") {
  return AVATAR_META[normalizeAvatarKey(key)]?.typeLabel || "Avatars";
}

function avatarChoices() {
  return Object.entries(AVATAR_META).map(([key, avatar]) => ({ key, ...avatar }));
}

function profileBadgeHtml(profile = {}, className = "profile-badge") {
  const avatarKey = normalizeAvatarKey(profile.avatar_key);
  const shape = String(profile.badge_shape || "rounded").replace(/[^a-z0-9_-]/gi, "") || "rounded";
  // La couleur de fond du badge avatar vient de la team bureau.
  // badge_color reste en secours pour les anciens profils ou les tests.
  const color = String(profile.office_team_color || profile.team_color || profile.teamColor || profile.badge_color || "#facc15");
  const pseudo = profile.pseudo || avatarLabel(avatarKey);
  return `<span class="${escapeHtml(className)} badge-shape-${escapeHtml(shape)}" style="--badge-color:${escapeHtml(color)}" title="${escapeHtml(pseudo)}">
    <img src="${escapeHtml(avatarUrl(avatarKey))}" alt="Avatar ${escapeHtml(pseudo)}" loading="lazy" onerror="this.onerror=null;this.src='assets/avatars/nations-couleurs/owl-01-le-bleu-blanc-bougon.png';">
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
  family: "famille",
  famille: "famille",
  health: "sante",
  sante: "sante",
  santé: "sante",
  journal: "journal",
  audit: "journal",
  bilan: "bilan",
  report: "bilan",
  diplome: "diplome",
  diplôme: "diplome",
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
    MEXIQUE: { code: "MX", name: "Mexique", flagUrl: "assets/icons/flags/mx.png" },
    FR: { code: "FR", name: "France", flagUrl: "assets/icons/flags/fr.png" },
    FRA: { code: "FR", name: "France", flagUrl: "assets/icons/flags/fr.png" },
    FRANCE: { code: "FR", name: "France", flagUrl: "assets/icons/flags/fr.png" }
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
  const locationMatch = match?.is_test_match && !match?.venue_country_code
    ? { ...match, venue_country_code: "FR", venue_country_name: "France", venue_country_flag_url: "assets/icons/flags/fr.png" }
    : match;
  const countryFlag = hostCountryFlagHtml(locationMatch, "host-country-flag location-country-flag");

  // Format demandé : PAYS - VILLE - STADE.
  // Pour le pays, on affiche uniquement le drapeau image local (Canada / États-Unis / Mexique).
  const parts = [
    countryFlag || `<span class="location-country-placeholder">Pays ?</span>`,
    `<span>${escapeHtml(city)}</span>`,
    `<span>${escapeHtml(venue)}</span>`
  ];

  return `${icon("pin")} <span class="location-format ${compact ? "location-format-compact" : ""}">${parts.join(' <span class="location-separator">-</span> ')}</span>`;
}


// ============================================================
// FIFA 2026 — ORDRE OFFICIEL DE LA PHASE FINALE
// ============================================================
// Le calendrier FIFA n'est pas toujours chronologique dans le tableau :
// par exemple le match 75 peut se jouer après le 74, mais il doit rester
// sous le match 73 car les deux alimentent le même huitième.
function officialBracketLocalDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function officialBracketDateMap() {
  return {
    // 16èmes / Round of 32 — heures affichées en France (CEST) quand le site est consulté depuis la France.
    "round_of_32|2026-06-28 21:00": 73,
    "round_of_32|2026-06-29 19:00": 76,
    "round_of_32|2026-06-29 22:30": 74,
    "round_of_32|2026-06-30 03:00": 75,
    "round_of_32|2026-06-30 19:00": 78,
    "round_of_32|2026-06-30 23:00": 77,
    "round_of_32|2026-07-01 03:00": 79,
    "round_of_32|2026-07-01 18:00": 80,
    "round_of_32|2026-07-01 22:00": 82,
    "round_of_32|2026-07-02 02:00": 81,
    "round_of_32|2026-07-02 21:00": 84,
    "round_of_32|2026-07-03 01:00": 83,
    "round_of_32|2026-07-03 05:00": 85,
    "round_of_32|2026-07-03 20:00": 88,
    "round_of_32|2026-07-04 00:00": 86,
    "round_of_32|2026-07-04 03:30": 87,

    // 8èmes / Round of 16
    "round_of_16|2026-07-04 19:00": 90,
    "round_of_16|2026-07-04 23:00": 89,
    "round_of_16|2026-07-05 22:00": 91,
    "round_of_16|2026-07-06 03:00": 92,
    "round_of_16|2026-07-06 21:00": 93,
    "round_of_16|2026-07-07 02:00": 94,
    "round_of_16|2026-07-07 18:00": 95,
    "round_of_16|2026-07-07 22:00": 96,

    // Quarts, demies, petite finale, finale
    "quarter_final|2026-07-09 22:00": 97,
    "quarter_final|2026-07-10 21:00": 98,
    "quarter_final|2026-07-11 23:00": 99,
    "quarter_final|2026-07-12 03:00": 100,
    "semi_final|2026-07-14 21:00": 101,
    "semi_final|2026-07-15 21:00": 102,
    "third_place|2026-07-18 23:00": 103,
    "final|2026-07-19 21:00": 104
  };
}

function officialBracketExplicitNumber(match = {}) {
  const keys = [
    "bracket_match_number",
    "official_match_number",
    "fifa_match_number",
    "match_number",
    "fixture_number",
    "display_order",
    "match_order"
  ];
  for (const key of keys) {
    const value = Number(match?.[key]);
    if (Number.isInteger(value) && value >= 73 && value <= 104) return value;
  }

  const apiValue = Number(match?.api_match_id);
  if (Number.isInteger(apiValue) && apiValue >= 73 && apiValue <= 104) return apiValue;

  return null;
}

function officialBracketMatchNumber(match = {}) {
  if (!match || match.stage === "group" || match.is_test_match) return null;

  const explicit = officialBracketExplicitNumber(match);
  if (explicit) return explicit;

  const searchable = [
    match.home_team_name,
    match.away_team_name,
    match.home_team_short_name,
    match.away_team_short_name,
    match.name,
    match.label,
    match.round_label,
    match.fixture_label
  ].filter(Boolean).join(" ");

  const textMatch = searchable.match(/(?:\bmatch\s*|\bm\s*)(7[3-9]|8[0-9]|9[0-9]|10[0-4])\b/i);
  if (textMatch) return Number(textMatch[1]);

  const localKey = officialBracketLocalDateKey(match.kickoff_at);
  const mapped = officialBracketDateMap()[`${match.stage}|${localKey}`];
  return mapped || null;
}

function officialBracketFallbackStageOrder(stage) {
  const orders = {
    round_of_32: 73,
    round_of_16: 89,
    quarter_final: 97,
    semi_final: 101,
    third_place: 103,
    final: 104
  };
  return orders[stage] || 999;
}

function officialBracketDisplayOrder(number) {
  const order = [
    73, 75, 74, 77, 83, 84, 81, 82,
    76, 78, 79, 80, 86, 88, 85, 87,
    90, 89, 93, 94, 91, 92, 95, 96,
    97, 98, 99, 100, 101, 102, 103, 104
  ];
  const index = order.indexOf(Number(number));
  return index >= 0 ? index + 1 : Number(number) || 999;
}

function officialBracketSortValue(match = {}) {
  const number = officialBracketMatchNumber(match);
  if (number) return officialBracketDisplayOrder(number);
  const kickoff = match?.kickoff_at ? new Date(match.kickoff_at).getTime() : 9999999999999;
  return officialBracketFallbackStageOrder(match?.stage) * 10000000000000 + kickoff;
}

function finalBracketLayout() {
  return {
    left: [
      { r32: [73, 75], r16: 90, qf: 97, sf: 101 },
      { r32: [74, 77], r16: 89, qf: 97, sf: 101 },
      { r32: [83, 84], r16: 93, qf: 98, sf: 101 },
      { r32: [81, 82], r16: 94, qf: 98, sf: 101 }
    ],
    right: [
      { r32: [76, 78], r16: 91, qf: 99, sf: 102 },
      { r32: [79, 80], r16: 92, qf: 99, sf: 102 },
      { r32: [86, 88], r16: 95, qf: 100, sf: 102 },
      { r32: [85, 87], r16: 96, qf: 100, sf: 102 }
    ]
  };
}

function finalBracketProgressionMap() {
  return {
    90: { sources: [73, 75], use: "winner" },
    89: { sources: [74, 77], use: "winner" },
    93: { sources: [83, 84], use: "winner" },
    94: { sources: [81, 82], use: "winner" },
    91: { sources: [76, 78], use: "winner" },
    92: { sources: [79, 80], use: "winner" },
    95: { sources: [86, 88], use: "winner" },
    96: { sources: [85, 87], use: "winner" },
    97: { sources: [90, 89], use: "winner" },
    98: { sources: [93, 94], use: "winner" },
    99: { sources: [91, 92], use: "winner" },
    100: { sources: [95, 96], use: "winner" },
    101: { sources: [97, 98], use: "winner" },
    102: { sources: [99, 100], use: "winner" },
    103: { sources: [101, 102], use: "loser" },
    104: { sources: [101, 102], use: "winner" }
  };
}

function finalBracketProgressionOrder() {
  return [90, 89, 93, 94, 91, 92, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104];
}

function finalBracketProgressionRule(number) {
  return finalBracketProgressionMap()[Number(number)] || null;
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
  officialBracketMatchNumber,
  officialBracketSortValue,
  officialBracketDisplayOrder,
  finalBracketLayout,
  finalBracketProgressionMap,
  finalBracketProgressionOrder,
  finalBracketProgressionRule,
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
  AVATAR_META,
  AVATAR_LABELS,
  avatarChoices,
  avatarType,
  normalizeAvatarKey,
  avatarUrl,
  avatarLabel,
  profileBadgeHtml
};
