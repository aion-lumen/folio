// Folio Mail-Queue — synthetic sample dataset
// Mirrors the distribution from the design prompt:
//   69 keep · 18 move_immo_portal · 18 move_paketzustellung
//   ·  9 move_zu_pruefen · 6 move_immo_privat
//   + ~6 disagreements (suggested ≠ final)

(function () {
  const ACTIONS = [
    "keep",
    "move_immo_portal",
    "move_immo_privat",
    "move_paketzustellung",
    "move_zu_pruefen",
  ];

  // Date helpers — last 14 days, ~120 mails
  const NOW = new Date("2026-05-17T11:42:00+02:00");
  const dayMs = 24 * 3600 * 1000;
  const ts = (daysAgo, h, m) => {
    const d = new Date(NOW.getTime() - daysAgo * dayMs);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  // Each "row" can be a template producing N records (subjects rotated)
  const rows = [];
  const push = (r) => rows.push({ id: `m_${String(rows.length + 1).padStart(3, "0")}`, ...r });

  // ─── KEEP (69) ───────────────────────────────────────────────────────────
  // Personal / Familie / Freunde
  const personal = [
    ["lena.bachmann@protonmail.com", "Lena Bachmann", "Re: Wochenende in Bern", "privat"],
    ["lena.bachmann@protonmail.com", "Lena Bachmann", "Foto vom Sonntag", "privat"],
    ["m.huber@bluewin.ch", "Markus Huber", "Stammtisch am Donnerstag?", "privat"],
    ["m.huber@bluewin.ch", "Markus Huber", "Re: Stammtisch am Donnerstag?", "privat"],
    ["papa@huber-thalwil.ch", "Papa", "Geburtstag von Tante Rita", "privat"],
    ["sabine.weber@gmx.ch", "Sabine W.", "Re: Wanderung Pilatus", "privat"],
    ["sabine.weber@gmx.ch", "Sabine W.", "Pilatus — wir nehmen den 8.04er", "privat"],
    ["jonas@grueterstein.ch", "Jonas Grüter", "Buch zurück", "privat"],
    ["mama@huber-thalwil.ch", "Mama", "Rezept Linsensuppe", "privat"],
    ["chr.lehmann@hispeed.ch", "Chris Lehmann", "Tennis Mi 18:30?", "privat"],
    ["chr.lehmann@hispeed.ch", "Chris Lehmann", "Re: Tennis Mi 18:30?", "privat"],
    ["nina.r@posteo.de", "Nina Reichlin", "Fotos Hochzeit Tobi", "privat"],
    ["info@kammermusik-zh.ch", "Kammermusik ZH", "Programm Mai/Juni 2026", "privat"],
  ];
  personal.forEach(([f, n, s, c], i) => {
    push({
      from_addr: f, from_name: n, subject: s,
      received_at: ts(i % 14, 8 + (i % 11), (i * 17) % 60),
      classification: c, confidence: 0.82 + (i % 7) * 0.02,
      evidence: "Bekannter Sender · persönlicher Ton",
      suggested_action: "keep", reason: "private correspondence",
      markers: ["known_contact"], final_action: "keep", confirmed: true,
      response_ms: 800 + (i * 90) % 2400,
    });
  });

  // Geschäftspost / Bank / Versicherung / Behörden
  const business = [
    ["noreply@zkb.ch", "Zürcher Kantonalbank", "eDokument: Kontoauszug April 2026", "geschaeftspost", "bank statement"],
    ["noreply@zkb.ch", "Zürcher Kantonalbank", "TWINT-Bestätigung CHF 42.00", "geschaeftspost", "twint receipt"],
    ["noreply@zkb.ch", "Zürcher Kantonalbank", "eDokument: Depotauszug Q1 2026", "geschaeftspost", "depot"],
    ["service@swisslife.ch", "Swiss Life", "Prämienrechnung 2026 Säule 3a", "geschaeftspost", "insurance bill"],
    ["service@swisslife.ch", "Swiss Life", "Re: Anfrage Vertragsänderung", "geschaeftspost", "insurance"],
    ["versand@css.ch", "CSS Versicherung", "Leistungsabrechnung", "geschaeftspost", "health"],
    ["versand@css.ch", "CSS Versicherung", "Prämienanpassung 2027", "geschaeftspost", "health"],
    ["info@swisscom.ch", "Swisscom", "Rechnung Mai 2026", "geschaeftspost", "telco"],
    ["info@swisscom.ch", "Swisscom", "Vertragsverlängerung", "geschaeftspost", "telco"],
    ["noreply@steueramt.zh.ch", "Steueramt Kt. Zürich", "Eingang Steuererklärung 2025", "geschaeftspost", "tax"],
    ["noreply@steueramt.zh.ch", "Steueramt Kt. Zürich", "Provisorische Rechnung 2026", "geschaeftspost", "tax"],
    ["mitteilungen@gemeinde-thalwil.ch", "Gemeinde Thalwil", "Abfallkalender Mai", "geschaeftspost", "kommune"],
    ["info@suva.ch", "Suva", "Jahresbescheinigung 2025", "geschaeftspost", "insurance"],
    ["payslip@axoflux-engineering.ch", "Axoflux Engineering HR", "Lohnabrechnung April 2026", "geschaeftspost", "payroll"],
    ["payslip@axoflux-engineering.ch", "Axoflux Engineering HR", "Lohnabrechnung Mai 2026", "geschaeftspost", "payroll"],
    ["it-support@axoflux-engineering.ch", "Axoflux IT", "Passwort läuft ab in 7 Tagen", "geschaeftspost", "internal"],
    ["hr@axoflux-engineering.ch", "Axoflux HR", "Ferienkontingent Q2", "geschaeftspost", "internal"],
    ["billing@digitalocean.com", "DigitalOcean", "Invoice May 2026", "geschaeftspost", "saas bill"],
    ["billing@github.com", "GitHub", "Receipt for May 2026", "geschaeftspost", "saas bill"],
    ["billing@anthropic.com", "Anthropic", "Receipt — Claude Pro", "geschaeftspost", "saas bill"],
    ["noreply@stripe.com", "Stripe", "Payout to account ****8421", "geschaeftspost", "payout"],
    ["billing@fastmail.com", "Fastmail", "Renewal confirmation", "geschaeftspost", "saas bill"],
    ["service@migros.ch", "Migros Cumulus", "Bonscheck April", "geschaeftspost", "loyalty"],
    ["service@coop.ch", "Coop Supercard", "Punkte-Auszug", "geschaeftspost", "loyalty"],
    ["noreply@sbb.ch", "SBB", "Reservation IC 723 → Bern", "geschaeftspost", "travel"],
    ["noreply@sbb.ch", "SBB", "GA Erneuerung 2026/27", "geschaeftspost", "travel"],
    ["info@buchhaltung-kohli.ch", "Kohli Treuhand", "Re: Belege Q1", "geschaeftspost", "accountant"],
  ];
  business.forEach(([f, n, s, c, ev], i) => {
    push({
      from_addr: f, from_name: n, subject: s,
      received_at: ts((i * 3) % 14, 9 + (i % 9), (i * 11) % 60),
      classification: c, confidence: 0.91 + (i % 5) * 0.012,
      evidence: ev,
      suggested_action: "keep", reason: "geschäftliche Korrespondenz",
      markers: ["transactional", "domain_known"],
      final_action: "keep", confirmed: true,
      response_ms: 600 + (i * 73) % 2000,
    });
  });

  // Newsletter & Kalender — die User behält (kein move)
  const keptNewsletters = [
    ["news@nzz.ch", "NZZ", "Morgenbriefing — Mittwoch", "werbung", "newsletter"],
    ["news@nzz.ch", "NZZ", "Morgenbriefing — Donnerstag", "werbung", "newsletter"],
    ["news@nzz.ch", "NZZ", "Morgenbriefing — Freitag", "werbung", "newsletter"],
    ["digest@hackernews.com", "Hacker Newsletter", "#697 — Issue", "werbung", "newsletter"],
    ["digest@hackernews.com", "Hacker Newsletter", "#698 — Issue", "werbung", "newsletter"],
    ["info@volkshaus-zuerich.ch", "Volkshaus", "Programm Konzerte Juni", "werbung", "events"],
    ["newsletter@kulturhaus-helferei.ch", "Kulturhaus Helferei", "Lesung Mai", "werbung", "events"],
    ["calendar@meetup.com", "Meetup", "Zürich Rust — Save the date", "werbung", "events"],
    // info@immowelt.de Newsletter — appears here in KEEP because user kept it
    // (disagreement: heuristik suggested move_immo_portal)
  ];
  keptNewsletters.forEach(([f, n, s, c, ev], i) => {
    push({
      from_addr: f, from_name: n, subject: s,
      received_at: ts((i * 2) % 12, 7 + (i % 4), (i * 31) % 60),
      classification: c, confidence: 0.68 + (i % 5) * 0.04,
      evidence: ev,
      suggested_action: "keep", reason: "Newsletter mit aktivem Abo",
      markers: ["bulk_sender", "unsub_link"],
      final_action: "keep", confirmed: true,
      response_ms: 400 + (i * 51) % 1200,
    });
  });

  // Fill remaining keep slots — 65 to leave headroom for the 4 extra
  // disagreement rows appended at the bottom (keeps total at exactly 120
  // with all 6 disagreements intact).
  while (rows.filter((r) => r.final_action === "keep").length < 65) {
    const i = rows.length;
    push({
      from_addr: "info@digitec.ch", from_name: "Digitec",
      subject: ["Bestellbestätigung","Versandbestätigung","Rückgabe bearbeitet","Garantieverlängerung"][i % 4],
      received_at: ts(i % 14, 10 + (i % 8), (i * 7) % 60),
      classification: "geschaeftspost", confidence: 0.88,
      evidence: "Bestellbezug · Kundennummer im Header",
      suggested_action: "keep", reason: "transactional",
      markers: ["order_ref"],
      final_action: "keep", confirmed: true, response_ms: 700 + (i * 80) % 2200,
    });
  }

  // ─── move_immo_portal (18) ───────────────────────────────────────────────
  const immoPortal = [
    // suchen.immowelt.de — saved-search alerts (8x)
    ["suchen.immowelt.de", "Immowelt Suche", "Neue Treffer: 3.5 Zi · 8002 Zürich", 0.94],
    ["suchen.immowelt.de", "Immowelt Suche", "Neue Treffer: 3.5 Zi · 8002 Zürich", 0.94],
    ["suchen.immowelt.de", "Immowelt Suche", "Neue Treffer: 4 Zi · 8038 Wollishofen", 0.94],
    ["suchen.immowelt.de", "Immowelt Suche", "Neue Treffer: 4 Zi · 8038 Wollishofen", 0.93],
    ["suchen.immowelt.de", "Immowelt Suche", "Wieder verfügbar: Albisstrasse 142", 0.91],
    ["suchen.immowelt.de", "Immowelt Suche", "Neue Treffer: 3.5 Zi · 8810 Horgen", 0.94],
    ["suchen.immowelt.de", "Immowelt Suche", "Neue Treffer: 4 Zi · 8038 Wollishofen", 0.94],
    ["suchen.immowelt.de", "Immowelt Suche", "Neue Treffer: Letzipark / Albisrieden", 0.93],
    // notifications.homegate.ch (5x)
    ["notifications.homegate.ch", "Homegate", "5 neue Inserate für deine Suche", 0.95],
    ["notifications.homegate.ch", "Homegate", "3 neue Inserate für deine Suche", 0.95],
    ["notifications.homegate.ch", "Homegate", "Preissenkung: Sihltal-Strasse 8", 0.92],
    ["notifications.homegate.ch", "Homegate", "7 neue Inserate für deine Suche", 0.95],
    ["notifications.homegate.ch", "Homegate", "Wieder online: 3.5 Zi · Adliswil", 0.93],
    // immoscout24 (3x)
    ["alert@immoscout24.ch", "ImmoScout24", "Neue Wohnungen — Region Zürich", 0.93],
    ["alert@immoscout24.ch", "ImmoScout24", "Neue Wohnungen — Region Zürich", 0.93],
    ["alert@immoscout24.ch", "ImmoScout24", "Neuer Treffer: 4 Zi Thalwil", 0.92],
    // newhome.ch (2x)
    ["noreply@newhome.ch", "Newhome", "Suchabo Aktualisierung", 0.89],
    ["noreply@newhome.ch", "Newhome", "Suchabo Aktualisierung", 0.89],
  ];
  immoPortal.forEach(([f, n, s, conf], i) => {
    push({
      from_addr: f, from_name: n, subject: s,
      received_at: ts(i % 14, 6 + (i % 14), (i * 13) % 60),
      classification: "werbung", confidence: conf,
      evidence: "Such-Alert-Domain · standardisierter Betreff",
      suggested_action: "move_immo_portal", reason: "Portal-Subdomain bekannt",
      markers: ["portal_subdomain", "search_alert"],
      final_action: "move_immo_portal", confirmed: true,
      response_ms: 350 + (i * 47) % 900,
    });
  });

  // ─── move_immo_privat (6) — but with 2 DISAGREEMENTS planted ─────────────
  // raumgold-immobilien.de (2x) — agreement
  push({
    from_addr: "kontakt@raumgold-immobilien.de", from_name: "Raumgold Immobilien",
    subject: "Ihre Anfrage zu 4.5 Zi Wollishofen — Besichtigung",
    received_at: ts(2, 14, 12),
    classification: "geschaeftspost", confidence: 0.78,
    evidence: "Makler-Domain · individuelle Anrede",
    suggested_action: "move_immo_privat", reason: "Persönliche Maklerkommunikation",
    markers: ["broker_domain", "personalized"], final_action: "move_immo_privat",
    confirmed: true, response_ms: 1800,
  });
  push({
    from_addr: "kontakt@raumgold-immobilien.de", from_name: "Raumgold Immobilien",
    subject: "Re: Besichtigung 4.5 Zi Wollishofen — Terminvorschlag",
    received_at: ts(1, 9, 33),
    classification: "geschaeftspost", confidence: 0.81,
    evidence: "Makler-Domain · individueller Termin",
    suggested_action: "move_immo_privat", reason: "Persönliche Korrespondenz",
    markers: ["broker_domain", "personalized", "in_reply_to"],
    final_action: "move_immo_privat", confirmed: true, response_ms: 1300,
  });
  // direct + gerstner — agreement
  push({
    from_addr: "m.bichsel@direkt-makler.ch", from_name: "M. Bichsel",
    subject: "Wohnung Sihlfeldstr. — Unterlagen",
    received_at: ts(5, 16, 4),
    classification: "geschaeftspost", confidence: 0.72,
    evidence: "Individueller Sender · personalisiert",
    suggested_action: "move_immo_privat", reason: "Einzelner Makler",
    markers: ["personalized"], final_action: "move_immo_privat",
    confirmed: true, response_ms: 2400,
  });
  push({
    from_addr: "info@gerstner-immo.ch", from_name: "Gerstner Immobilien",
    subject: "Ihre Bewerbung — Unterlagen vollständig",
    received_at: ts(7, 11, 27),
    classification: "geschaeftspost", confidence: 0.75,
    evidence: "Makler-Domain · Bewerbungsbezug",
    suggested_action: "move_immo_privat", reason: "Bewerbungs-Antwort",
    markers: ["broker_domain", "application_ref"], final_action: "move_immo_privat",
    confirmed: true, response_ms: 1500,
  });
  // DISAGREEMENT: century21.de — heuristik schlug move_immo_portal vor, user wählte move_immo_privat
  push({
    from_addr: "newsletter@century21.de", from_name: "Century21",
    subject: "Exklusive Neuobjekte Region Zürichsee — KW 20",
    received_at: ts(3, 8, 15),
    classification: "werbung", confidence: 0.61,
    evidence: "Bulk-Mail · Liste neuer Objekte",
    suggested_action: "move_immo_portal", reason: "Sieht aus wie Portal-Alert",
    markers: ["bulk_sender", "object_list"], final_action: "move_immo_privat",
    confirmed: false, response_ms: 6800,
  });
  push({
    from_addr: "kontakt@century21.de", from_name: "Century21 Region Zürichsee",
    subject: "Re: Ihre Anfrage — Objekt 4.5 Zi Horgen",
    received_at: ts(2, 13, 58),
    classification: "geschaeftspost", confidence: 0.58,
    evidence: "Antwort, aber gleicher Sender wie Newsletter",
    suggested_action: "move_immo_portal", reason: "Domain als Portal eingestuft",
    markers: ["domain_overlap"], final_action: "move_immo_privat",
    confirmed: false, response_ms: 7200,
  });

  // ─── move_paketzustellung (18) ───────────────────────────────────────────
  const pakete = [
    // Amazon (7x)
    ["order-update@amazon.de", "Amazon.de", "Bestellung versandt: UGREEN Revodok 105"],
    ["order-update@amazon.de", "Amazon.de", "Geliefert: UGREEN Revodok 105"],
    ["order-update@amazon.de", "Amazon.de", "Bestellung versandt: Sony WH-1000XM5"],
    ["order-update@amazon.de", "Amazon.de", "Geliefert: Sony WH-1000XM5"],
    ["order-update@amazon.de", "Amazon.de", "Bestellung versandt: 2x USB-C Kabel"],
    ["order-update@amazon.de", "Amazon.de", "Geliefert: 2x USB-C Kabel"],
    ["order-update@amazon.de", "Amazon.de", "Bestellung versandt: Anker PowerBank"],
    // DHL (4x)
    ["noreply@dhl.de", "DHL", "Paket unterwegs — Tracking 0034..."],
    ["noreply@dhl.de", "DHL", "Paket zugestellt"],
    ["noreply@dhl.de", "DHL", "Paket unterwegs — Tracking 0034..."],
    ["noreply@dhl.de", "DHL", "Paket im Zustellfahrzeug"],
    // Hermes (2x)
    ["info@hermesworld.com", "Hermes", "Sendung 4419... ist unterwegs"],
    ["info@hermesworld.com", "Hermes", "Sendung 4419... zugestellt"],
    // DPD (2x)
    ["info@mydpd.ch", "DPD CH", "Ihre Sendung ist eingetroffen"],
    ["info@mydpd.ch", "DPD CH", "Sendung in Zustellung"],
    // GLS (1x)
    ["track@gls-pakete.de", "GLS", "Sendung in Zustellung"],
    // Post (2x)
    ["sendung@post.ch", "Die Post", "Sendung ist bereit zur Abholung"],
    ["sendung@post.ch", "Die Post", "Sendung zugestellt"],
  ];
  pakete.forEach(([f, n, s], i) => {
    push({
      from_addr: f, from_name: n, subject: s,
      received_at: ts(i % 12, 7 + (i % 13), (i * 19) % 60),
      classification: "geschaeftspost", confidence: 0.93 - (i % 3) * 0.02,
      evidence: "Tracking-Pattern im Betreff",
      suggested_action: "move_paketzustellung", reason: "Logistik-Sender + Tracking-Hint",
      markers: ["tracking_id", "logistics_domain"],
      final_action: "move_paketzustellung", confirmed: true,
      response_ms: 280 + (i * 33) % 700,
    });
  });

  // ─── move_zu_pruefen (9) ─────────────────────────────────────────────────
  const zuPruefen = [
    ["info@stadt-zuerich.ch", "Stadt Zürich", "Information zum Bauvorhaben Albisstr."],
    ["mahnungen@kollektor-inkasso.ch", "Kollektor Inkasso", "Mahnung Nr. 2"],
    ["unbekannt@neue-firma-xyz.de", "Neue Firma XYZ", "Ihre Anfrage von gestern"],
    ["surveys@axoflux-engineering.ch", "Axoflux Surveys", "Quartals-Umfrage"],
    ["wettbewerb@migros.ch", "Migros", "Sie haben gewonnen!"],
    ["info@reisetraum-aktion.de", "Reisetraum", "Letzte Chance: Sommer-Aktion"],
    ["redaktion@nachbar-blatt.ch", "Nachbar-Blatt", "Ihr kostenloses Probe-Abo"],
    ["security@unbekannt-cloud.io", "Unbekannt Cloud", "Login-Versuch erkannt"],
    ["m.frey@frey-anwalt.ch", "M. Frey", "Vereinbarung — bitte um Rückruf"],
  ];
  zuPruefen.forEach(([f, n, s], i) => {
    push({
      from_addr: f, from_name: n, subject: s,
      received_at: ts(i % 10, 9 + (i % 9), (i * 23) % 60),
      classification: "unklar", confidence: 0.42 + (i % 4) * 0.05,
      evidence: "Mehrdeutiges Pattern · niedrige Konfidenz",
      suggested_action: "move_zu_pruefen", reason: "Heuristik unsicher",
      markers: ["low_confidence"], final_action: "move_zu_pruefen",
      confirmed: true, response_ms: 4200 + (i * 410) % 4000,
    });
  });

  // ─── ZUSÄTZLICHE DISAGREEMENTS ───────────────────────────────────────────
  // info@immowelt.de Newsletter — heuristik: move_immo_portal, user: keep
  push({
    from_addr: "info@immowelt.de", from_name: "Immowelt",
    subject: "Marktbericht Q1 2026 — Mietpreise Zürich",
    received_at: ts(4, 7, 50),
    classification: "werbung", confidence: 0.64,
    evidence: "Immowelt-Domain · aber redaktioneller Newsletter",
    suggested_action: "move_immo_portal", reason: "Domain als Portal bekannt",
    markers: ["portal_domain", "editorial_newsletter"],
    final_action: "keep", confirmed: false, response_ms: 5400,
  });
  push({
    from_addr: "info@immowelt.de", from_name: "Immowelt",
    subject: "Tipps: Bewerbungsdossier richtig zusammenstellen",
    received_at: ts(9, 6, 22),
    classification: "werbung", confidence: 0.60,
    evidence: "Newsletter-Pattern · keine Such-Treffer",
    suggested_action: "move_immo_portal", reason: "Domain als Portal bekannt",
    markers: ["portal_domain", "editorial_newsletter"],
    final_action: "keep", confirmed: false, response_ms: 4900,
  });
  // rabbit.tech hello-mail — heuristik: keep, user: move_zu_pruefen
  push({
    from_addr: "hello@rabbit.tech", from_name: "rabbit",
    subject: "r1 OS update 0.9.42 — what changed",
    received_at: ts(6, 18, 7),
    classification: "werbung", confidence: 0.51,
    evidence: "Ungewohnter Sender · transaktional-anmutender Betreff",
    suggested_action: "keep", reason: "Sieht wie geschäftliche Mitteilung aus",
    markers: ["product_update"], final_action: "move_zu_pruefen",
    confirmed: false, response_ms: 9100,
  });
  // alert@immoscout24 — eine spezielle Mail die user als keep markiert hat
  push({
    from_addr: "alert@immoscout24.ch", from_name: "ImmoScout24",
    subject: "ImmoScout24 — Ihre Daten · Zusammenfassung",
    received_at: ts(8, 14, 11),
    classification: "geschaeftspost", confidence: 0.66,
    evidence: "Immoscout-Domain, aber DSGVO/Daten-Mail",
    suggested_action: "move_immo_portal", reason: "Domain bekannt",
    markers: ["portal_domain", "account_admin"],
    final_action: "keep", confirmed: false, response_ms: 6200,
  });

  // Cap to 120 (in case we overshot)
  if (rows.length > 120) rows.length = 120;

  // Sort newest first
  rows.sort((a, b) => (a.received_at < b.received_at ? 1 : -1));

  // Disagreement helper
  rows.forEach((r) => {
    r.disagreement = r.final_action !== r.suggested_action;
  });

  // Action labels (used everywhere)
  const ACTION_LABELS = {
    keep: "Behalten",
    move_immo_portal: "→ Immo · Portal",
    move_immo_privat: "→ Immo · Privat",
    move_paketzustellung: "→ Paketzustellung",
    move_zu_pruefen: "→ Zu prüfen",
  };
  const ACTION_SHORT = {
    keep: "keep",
    move_immo_portal: "immo_portal",
    move_immo_privat: "immo_privat",
    move_paketzustellung: "paketzustellung",
    move_zu_pruefen: "zu_pruefen",
  };

  // Top-sender aggregation
  const senderMap = new Map();
  rows.forEach((r) => {
    const e = senderMap.get(r.from_addr) || {
      from_addr: r.from_addr, from_name: r.from_name, count: 0,
      actions: { keep: 0, move_immo_portal: 0, move_immo_privat: 0,
                 move_paketzustellung: 0, move_zu_pruefen: 0 },
      disagreements: 0,
    };
    e.count++;
    e.actions[r.final_action]++;
    if (r.disagreement) e.disagreements++;
    senderMap.set(r.from_addr, e);
  });
  const senders = [...senderMap.values()].sort((a, b) => b.count - a.count);

  // Counts per action
  const counts = ACTIONS.reduce((acc, a) => {
    acc[a] = rows.filter((r) => r.final_action === a).length;
    return acc;
  }, {});
  const disagreements = rows.filter((r) => r.disagreement);

  // Expose
  window.MAIL_DATA = {
    rows,
    senders,
    counts,
    disagreements,
    ACTIONS,
    ACTION_LABELS,
    ACTION_SHORT,
    total: rows.length,
    NOW,
  };
})();
