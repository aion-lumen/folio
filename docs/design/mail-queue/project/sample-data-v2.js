// Folio Mail-Queue — Multi-Account synthetic dataset (Iter 2)
//
// Accounts:
//   gmail        ~3.600 mails  (long-standing private)
//   yahoo        ~  120 mails  (current tranche-1)
//   mirhamed.ch  ~   16 mails  (Behörden + Bewerbung, small custom domain)
//
// ~12 Disagreements verteilt:
//   yahoo: century21 ×2, info@immowelt ×2, rabbit.tech, immoscout24-DSGVO
//   gmail: linkedin-jobs (kept), amazon-survey (zu_pruefen), neue Immo-Privat-Anfrage,
//          newsletter-Konflikt, weitere
//
// Performance: generated programmatically via templates → ~3.736 rows in-memory.
// List uses windowing so 4k+ scrolls smooth.

(function () {
  const ACTIONS = ["keep", "move_immo_portal", "move_immo_privat",
    "move_paketzustellung", "move_zu_pruefen"];

  const NOW = new Date("2026-05-17T11:42:00+02:00");
  const dayMs = 24 * 3600 * 1000;

  // Accounts ───────────────────────────────────────────────────────────────
  const ACCOUNTS = [
    { id: "gmail", label: "gmail", addr: "you@example.com",
      hue: 8,  desc: "Personal · primary" },
    { id: "yahoo", label: "yahoo", addr: "you@example.net",
      hue: 280, desc: "Secondary" },
    { id: "mirhamed_ch", label: "mirhamed.ch", addr: "you@example.org",
      hue: 200, desc: "Custom domain" },
  ];

  const rows = [];
  let _id = 0;
  const push = (r) => {
    _id++;
    rows.push({ id: `m_${String(_id).padStart(4, "0")}`, ...r });
  };

  // Random helpers (deterministic with linear cycling — same seed each run)
  let _rng = 0;
  const rng = () => {
    _rng = (_rng * 9301 + 49297) % 233280;
    return _rng / 233280;
  };
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const intBetween = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const tsFor = (daysAgo) => {
    const d = new Date(NOW.getTime() - daysAgo * dayMs);
    d.setHours(intBetween(6, 22), intBetween(0, 59), 0, 0);
    return d.toISOString();
  };

  // ═══════════════════════════════════════════════════════════════════════
  // GMAIL — ~3.600 records over 8 years (private account)
  // ═══════════════════════════════════════════════════════════════════════
  // Action distribution target:
  //   2.500 keep · 600 immo_portal · 300 paketzustellung · 200 zu_pruefen
  //   = 3.600 records over ~2.920 days = ~1.2/day average (realistic)

  // -- gmail · KEEP corpus (2.500) ----------------------------------------
  const gmailKeepTemplates = [
    // Personal correspondence
    { addr: "lena.bachmann@protonmail.com", name: "Lena Bachmann",
      subjects: ["Re: Wochenende in Bern", "Foto vom Sonntag", "Ferienplanung Korsika",
        "Re: Konzert am Freitag?", "Wie war's bei deinen Eltern?",
        "Geburtstag — kommst du?", "Buchempfehlung", "Pilatus-Tour Bilder"],
      cls: "privat", weight: 80 },
    { addr: "m.huber@bluewin.ch", name: "Markus Huber",
      subjects: ["Stammtisch am Donnerstag?", "Re: Stammtisch", "Fussball-Turnier",
        "Re: Hütte gebucht", "Bring den Grill mit"],
      cls: "privat", weight: 60 },
    { addr: "sabine.weber@gmx.ch", name: "Sabine W.",
      subjects: ["Re: Wanderung", "Pilatus — wir nehmen den 8.04er", "Bilder vom Wochenende",
        "Re: Buch zurück", "Re: Familienfest"],
      cls: "privat", weight: 55 },
    { addr: "chr.lehmann@hispeed.ch", name: "Chris Lehmann",
      subjects: ["Tennis Mi 18:30?", "Re: Tennis", "Doppel am Samstag",
        "Re: Wochenende Engadin"],
      cls: "privat", weight: 50 },
    { addr: "papa@huber-thalwil.ch", name: "Papa",
      subjects: ["Geburtstag von Tante Rita", "Re: Auto-Service", "Sonntag-Brunch",
        "Hast du den Steuerbescheid bekommen?", "Re: Frohe Ostern"],
      cls: "privat", weight: 40 },
    { addr: "mama@huber-thalwil.ch", name: "Mama",
      subjects: ["Rezept Linsensuppe", "Re: Sonntag", "Foto Garten",
        "Re: Geschenk Tante Rita", "Trick für die Wäsche"],
      cls: "privat", weight: 40 },
    { addr: "nina.r@posteo.de", name: "Nina Reichlin",
      subjects: ["Fotos Hochzeit", "Re: Apero am Donnerstag", "Kinder-Bilder",
        "Re: Buchladen-Tipp"],
      cls: "privat", weight: 30 },
    { addr: "jonas@grueterstein.ch", name: "Jonas Grüter",
      subjects: ["Buch zurück", "Re: Klettern Sonntag?", "Hütten-WE im Juni"],
      cls: "privat", weight: 28 },

    // Bank / Insurance / Tax / Behörden
    { addr: "noreply@zkb.ch", name: "Zürcher Kantonalbank",
      subjects: ["eDokument: Kontoauszug", "TWINT-Bestätigung", "eDokument: Depotauszug",
        "Sicherheitshinweis", "Re: Kreditkarten-Anfrage", "Quartals-Reporting",
        "eDokument: Vermögensausweis"],
      cls: "geschaeftspost", weight: 120 },
    { addr: "service@swisslife.ch", name: "Swiss Life",
      subjects: ["Prämienrechnung Säule 3a", "Re: Anfrage Vertragsänderung",
        "Jahresübersicht", "Steuerbescheinigung"],
      cls: "geschaeftspost", weight: 40 },
    { addr: "versand@css.ch", name: "CSS Versicherung",
      subjects: ["Leistungsabrechnung", "Prämienanpassung 2027", "Re: Kostengutsprache",
        "Jahresübersicht", "Familien-Versicherungsdoku"],
      cls: "geschaeftspost", weight: 65 },
    { addr: "noreply@steueramt.zh.ch", name: "Steueramt Kt. Zürich",
      subjects: ["Eingang Steuererklärung", "Provisorische Rechnung",
        "Schlussrechnung", "Re: Korrektur Wertschriftenverz."],
      cls: "geschaeftspost", weight: 30 },
    { addr: "noreply@sbb.ch", name: "SBB",
      subjects: ["Reservation IC 723 → Bern", "GA Erneuerung", "Re: Ticket-Rückerstattung",
        "Sparbillett gebucht", "Re: Abo-Verlängerung"],
      cls: "geschaeftspost", weight: 70 },
    { addr: "info@swisscom.ch", name: "Swisscom",
      subjects: ["Rechnung", "Vertragsverlängerung", "Re: Service-Anfrage",
        "Outage-Information"],
      cls: "geschaeftspost", weight: 50 },

    // Work / SaaS / Bills
    { addr: "payslip@axoflux-engineering.ch", name: "Axoflux HR",
      subjects: ["Lohnabrechnung", "Bonus-Aviso Q4", "Re: Ferienkontingent",
        "Jahresübersicht Lohn"],
      cls: "geschaeftspost", weight: 95 },
    { addr: "billing@github.com", name: "GitHub",
      subjects: ["Receipt", "Subscription renewed", "Payment method updated"],
      cls: "geschaeftspost", weight: 60 },
    { addr: "billing@digitalocean.com", name: "DigitalOcean",
      subjects: ["Invoice", "Account credit applied", "Re: Support ticket"],
      cls: "geschaeftspost", weight: 60 },
    { addr: "noreply@stripe.com", name: "Stripe",
      subjects: ["Payout to account ****8421", "Receipt", "Verification required"],
      cls: "geschaeftspost", weight: 40 },
    { addr: "billing@fastmail.com", name: "Fastmail",
      subjects: ["Renewal confirmation", "Receipt for ramin"],
      cls: "geschaeftspost", weight: 14 },
    { addr: "billing@anthropic.com", name: "Anthropic",
      subjects: ["Receipt — Claude Pro", "Plan changed"],
      cls: "geschaeftspost", weight: 14 },

    // LinkedIn / Job alerts → kept newsletter-like
    { addr: "jobs-noreply@linkedin.com", name: "LinkedIn Jobs",
      subjects: ["3 neue Jobs für dich · Senior SWE Zürich",
        "12 neue Jobs für dich · Backend Engineer",
        "Empfohlen: Staff Engineer · ETH Zürich",
        "Neue Inserate aus deinem Netzwerk"],
      cls: "werbung", weight: 110 },
    { addr: "noreply@linkedin.com", name: "LinkedIn",
      subjects: ["Du hast 4 neue Verbindungen", "Re: Verbindungsanfrage",
        "Profil-Ansichten diese Woche"],
      cls: "werbung", weight: 70 },

    // Newsletter / Editorial kept
    { addr: "news@nzz.ch", name: "NZZ", subjects: ["Morgenbriefing"],
      cls: "werbung", weight: 220 },
    { addr: "digest@hackernews.com", name: "Hacker Newsletter",
      subjects: ["#697 — Issue", "#698 — Issue", "#699 — Issue"],
      cls: "werbung", weight: 90 },
    { addr: "newsletter@stratechery.com", name: "Stratechery",
      subjects: ["Monday Update", "Daily Update", "Weekly Article"],
      cls: "werbung", weight: 70 },
    { addr: "info@volkshaus-zuerich.ch", name: "Volkshaus",
      subjects: ["Programm Konzerte", "Re: Tickets"],
      cls: "werbung", weight: 24 },

    // Coop / Migros / Loyalty
    { addr: "service@migros.ch", name: "Migros Cumulus",
      subjects: ["Bonscheck", "Punkte-Auszug", "Aktion der Woche"],
      cls: "werbung", weight: 80 },
    { addr: "service@coop.ch", name: "Coop Supercard",
      subjects: ["Punkte-Auszug", "Aktion der Woche", "Re: Bon eingelöst"],
      cls: "werbung", weight: 65 },

    // Digitec / Galaxus orders (kept as geschäftspost not pakete — order confirmation,
    // not tracking)
    { addr: "info@digitec.ch", name: "Digitec",
      subjects: ["Bestellbestätigung", "Rückgabe bearbeitet", "Garantieverlängerung",
        "Re: Support-Anfrage"],
      cls: "geschaeftspost", weight: 95 },
    { addr: "service@galaxus.ch", name: "Galaxus",
      subjects: ["Bestellbestätigung", "Rückgabe bearbeitet"],
      cls: "geschaeftspost", weight: 60 },
  ];

  // -- gmail · IMMO_PORTAL (600) ------------------------------------------
  const gmailImmoPortal = [
    { addr: "suchen.immowelt.de", name: "Immowelt Suche", weight: 220,
      subjects: ["Neue Treffer: 3.5 Zi · 8002 Zürich",
        "Neue Treffer: 4 Zi · 8038 Wollishofen",
        "Wieder verfügbar: Albisstrasse 142",
        "Neue Treffer: 3.5 Zi · 8810 Horgen",
        "Neue Treffer: 2.5 Zi · 8810 Horgen",
        "Neue Treffer: 4.5 Zi · Letzipark",
        "Preissenkung: Albisstr. 142",
        "Neue Treffer: 3.5 Zi · 8002 Zürich"] },
    { addr: "notifications.homegate.ch", name: "Homegate", weight: 170,
      subjects: ["5 neue Inserate für deine Suche",
        "3 neue Inserate für deine Suche",
        "Preissenkung: Sihltal-Strasse 8",
        "7 neue Inserate für deine Suche",
        "Wieder online: 3.5 Zi · Adliswil",
        "Neuer Treffer in deiner Region"] },
    { addr: "alert@immoscout24.ch", name: "ImmoScout24", weight: 130,
      subjects: ["Neue Wohnungen — Region Zürich",
        "Neuer Treffer: 4 Zi Thalwil",
        "Such-Alert: Stadtkreis 2",
        "Preissenkung in deiner Suche"] },
    { addr: "noreply@newhome.ch", name: "Newhome", weight: 60,
      subjects: ["Suchabo Aktualisierung", "Neue Treffer in deiner Suche"] },
    { addr: "noreply@flatfox.ch", name: "Flatfox", weight: 20,
      subjects: ["3 neue Wohnungen", "Re: Bewerbung gespeichert"] },
  ];

  // -- gmail · PAKETZUSTELLUNG (300) --------------------------------------
  const gmailPakete = [
    { addr: "order-update@amazon.de", name: "Amazon.de", weight: 130,
      subjects: ["Bestellung versandt: UGREEN Revodok",
        "Geliefert: UGREEN Revodok",
        "Bestellung versandt: Sony WH-1000XM5",
        "Geliefert: Sony WH-1000XM5",
        "Bestellung versandt: 2x USB-C Kabel",
        "Geliefert: 2x USB-C Kabel",
        "Bestellung versandt: Anker PowerBank",
        "Bestellung versandt: Logitech MX Master",
        "Geliefert: Logitech MX Master",
        "Bestellung versandt: Kindle Paperwhite"] },
    { addr: "noreply@dhl.de", name: "DHL", weight: 60,
      subjects: ["Paket unterwegs — Tracking 00343 ...",
        "Paket zugestellt", "Paket im Zustellfahrzeug",
        "Zustellungs-Versuch — bitte abholen"] },
    { addr: "sendung@post.ch", name: "Die Post", weight: 50,
      subjects: ["Sendung ist bereit zur Abholung",
        "Sendung zugestellt", "Sendung in Zustellung"] },
    { addr: "info@mydpd.ch", name: "DPD CH", weight: 30,
      subjects: ["Ihre Sendung ist eingetroffen", "Sendung in Zustellung"] },
    { addr: "info@hermesworld.com", name: "Hermes", weight: 20,
      subjects: ["Sendung unterwegs", "Sendung zugestellt"] },
    { addr: "track@gls-pakete.de", name: "GLS", weight: 10,
      subjects: ["Sendung in Zustellung", "Sendung zugestellt"] },
  ];

  // -- gmail · ZU_PRUEFEN (200) -------------------------------------------
  const gmailZuPruefen = [
    { addr: "info@stadt-zuerich.ch", name: "Stadt Zürich", weight: 35,
      subjects: ["Information zum Bauvorhaben Albisstr.",
        "Re: Anfrage Velo-Abstellplätze", "Mitteilung Quartierversammlung"] },
    { addr: "mahnungen@kollektor-inkasso.ch", name: "Kollektor Inkasso", weight: 15,
      subjects: ["Mahnung Nr. 2", "Letztes Schreiben", "Re: Zahlungsplan"] },
    { addr: "wettbewerb@migros.ch", name: "Migros Wettbewerb", weight: 25,
      subjects: ["Sie haben gewonnen!", "Letzte Chance", "Re: Teilnahme"] },
    { addr: "info@reisetraum-aktion.de", name: "Reisetraum", weight: 30,
      subjects: ["Letzte Chance: Sommer-Aktion", "Exklusiv-Angebot",
        "Re: Newsletter"] },
    { addr: "redaktion@nachbar-blatt.ch", name: "Nachbar-Blatt", weight: 25,
      subjects: ["Ihr kostenloses Probe-Abo",
        "Erinnerung: Probe-Abo läuft", "Re: Kündigung"] },
    { addr: "security@unbekannt-cloud.io", name: "Unbekannt Cloud", weight: 40,
      subjects: ["Login-Versuch erkannt", "Verifizierung erforderlich",
        "Re: Passwort-Reset", "Sicherheitswarnung"] },
    { addr: "info@unbekannt-firma.de", name: "Unbekannt Firma", weight: 30,
      subjects: ["Ihre Anfrage von gestern", "Re: Bestellung",
        "Wichtige Mitteilung"] },
  ];

  // Generate gmail rows by weighted templates
  const generateFromTemplates = (templates, action, account, totalCount, daysBack) => {
    const totalWeight = templates.reduce((s, t) => s + t.weight, 0);
    let generated = 0;
    while (generated < totalCount) {
      // pick template proportional to weight
      let r = rng() * totalWeight;
      let tpl;
      for (const t of templates) {
        r -= t.weight;
        if (r <= 0) { tpl = t; break; }
      }
      if (!tpl) tpl = templates[0];

      const dayAgo = intBetween(0, daysBack);
      const cls = tpl.cls || (action === "keep" ? "geschaeftspost" : "werbung");
      const subject = pick(tpl.subjects);
      // Tier — synthetic: 1=hard match (regex/domain), 2=plugin classification, 3=user-only
      const tier = action === "move_zu_pruefen" ? 3 : (rng() < 0.7 ? 1 : 2);
      const conf = tier === 1 ? 0.85 + rng() * 0.13 :
                   tier === 2 ? 0.7 + rng() * 0.18 :
                   0.42 + rng() * 0.18;

      push({
        account: account.id,
        from_addr: tpl.addr, from_name: tpl.name,
        subject,
        received_at: tsFor(dayAgo),
        classification: cls,
        confidence: conf,
        evidence: action === "keep" ? "transactional · sender bekannt" :
                  action === "move_immo_portal" ? "Portal-Subdomain · standardisierter Betreff" :
                  action === "move_paketzustellung" ? "Tracking-Pattern · Logistik-Domain" :
                  "niedrige Konfidenz · Pattern unklar",
        suggested_action: action,
        reason: action === "keep" ? "transactional / persönlich" :
                action === "move_immo_portal" ? "Portal-Suchalert" :
                action === "move_paketzustellung" ? "Logistik-Sender" :
                "Heuristik unsicher",
        markers: tier === 1 ? ["domain_known", "regex_match"] :
                 tier === 2 ? ["plugin_classified"] : ["low_confidence"],
        tier,
        final_action: action,
        confirmed: true,
        response_ms: 400 + Math.floor(rng() * 2400),
      });
      generated++;
    }
  };

  generateFromTemplates(gmailKeepTemplates, "keep", ACCOUNTS[0], 2500, 2920);
  generateFromTemplates(gmailImmoPortal, "move_immo_portal", ACCOUNTS[0], 600, 800);
  generateFromTemplates(gmailPakete, "move_paketzustellung", ACCOUNTS[0], 300, 1100);
  generateFromTemplates(gmailZuPruefen, "move_zu_pruefen", ACCOUNTS[0], 200, 1800);

  // gmail Disagreements (overwrite a few rows of the right action)
  const gmailDisagreements = [
    // LinkedIn-Jobs: Heuristik schlug zu_pruefen vor (zu kommerziell), User keep
    { account: "gmail", from_addr: "jobs-noreply@linkedin.com", from_name: "LinkedIn Jobs",
      subject: "7 neue Jobs für dich · Staff Engineer Zürich",
      received_at: tsFor(intBetween(2, 30)),
      classification: "werbung", confidence: 0.54,
      evidence: "Bulk-Sender · viele Empfänger",
      suggested_action: "move_zu_pruefen", reason: "Job-Mail zwischen Werbung & relevant",
      markers: ["bulk_sender", "low_confidence"], tier: 2,
      final_action: "keep", confirmed: false, response_ms: 5200 },
    { account: "gmail", from_addr: "jobs-noreply@linkedin.com", from_name: "LinkedIn Jobs",
      subject: "Empfohlen: Staff Engineer · ETH Zürich",
      received_at: tsFor(intBetween(2, 30)),
      classification: "werbung", confidence: 0.51,
      evidence: "Bulk-Sender · viele Empfänger",
      suggested_action: "move_zu_pruefen", reason: "Job-Mail zwischen Werbung & relevant",
      markers: ["bulk_sender", "low_confidence"], tier: 2,
      final_action: "keep", confirmed: false, response_ms: 4800 },
    // Amazon Umfrage: Heuristik keep (Amazon-Domain), User zu_pruefen (Umfrage = nicht relevant)
    { account: "gmail", from_addr: "no-reply@amazon-feedback.de", from_name: "Amazon Feedback",
      subject: "Ihre Meinung zu Ihrer letzten Bestellung",
      received_at: tsFor(intBetween(2, 90)),
      classification: "werbung", confidence: 0.58,
      evidence: "Amazon-nahe Domain · Survey-Pattern",
      suggested_action: "keep", reason: "Amazon-Domain · vermutet transactional",
      markers: ["amazon_adjacent", "survey_pattern"], tier: 2,
      final_action: "move_zu_pruefen", confirmed: false, response_ms: 6400 },
    // Immo-Privat-Anfrage über gmail (Bewerbungs-Antwort)
    { account: "gmail", from_addr: "verwaltung@blattner-immo.ch", from_name: "Blattner Immo",
      subject: "Re: Ihre Bewerbung Sihlfeld 12 — Unterlagen erhalten",
      received_at: tsFor(intBetween(10, 40)),
      classification: "geschaeftspost", confidence: 0.62,
      evidence: "Makler-Domain · individueller Bezug",
      suggested_action: "move_immo_portal", reason: "Immo-Domain bekannt",
      markers: ["broker_domain", "application_ref"], tier: 2,
      final_action: "move_immo_privat", confirmed: false, response_ms: 4100 },
    // Migros-Wettbewerb: heuristik zu_pruefen, User keep (echte Aktion)
    { account: "gmail", from_addr: "wettbewerb@migros.ch", from_name: "Migros Wettbewerb",
      subject: "Ihr Gewinn — Reisegutschein CHF 500",
      received_at: tsFor(intBetween(3, 50)),
      classification: "werbung", confidence: 0.47,
      evidence: "Wettbewerbs-Domain · 'gewonnen' im Subject",
      suggested_action: "move_zu_pruefen", reason: "Phishing-Verdacht",
      markers: ["lottery_pattern", "low_confidence"], tier: 3,
      final_action: "keep", confirmed: false, response_ms: 8800 },
  ];
  gmailDisagreements.forEach(push);

  // ═══════════════════════════════════════════════════════════════════════
  // YAHOO — ~120 records (current tranche-1 from iteration 1)
  // ═══════════════════════════════════════════════════════════════════════
  const yahooTemplates = {
    keep: [
      { addr: "info@kammermusik-zh.ch", name: "Kammermusik ZH",
        subjects: ["Programm Mai/Juni 2026", "Re: Konzertkarten"], weight: 4 },
      { addr: "mitteilungen@gemeinde-thalwil.ch", name: "Gemeinde Thalwil",
        subjects: ["Abfallkalender Mai", "Information Quartierversammlung"], weight: 6 },
      { addr: "info@suva.ch", name: "Suva",
        subjects: ["Jahresbescheinigung", "Re: Prämienanpassung"], weight: 8 },
      { addr: "calendar@meetup.com", name: "Meetup",
        subjects: ["Zürich Rust — Save the date", "Reminder: Meetup heute"], weight: 10 },
      { addr: "newsletter@kulturhaus-helferei.ch", name: "Kulturhaus Helferei",
        subjects: ["Lesung Mai", "Programm Juni"], weight: 8 },
      // Generic mix to fill
      { addr: "noreply@zkb.ch", name: "ZKB", subjects: ["eDokument: Kontoauszug"], weight: 14 },
      { addr: "service@swisslife.ch", name: "Swiss Life",
        subjects: ["Re: Anfrage", "Prämienrechnung"], weight: 8 },
      { addr: "billing@github.com", name: "GitHub",
        subjects: ["Receipt", "Subscription renewed"], weight: 5 },
    ],
    move_immo_portal: [
      { addr: "suchen.immowelt.de", name: "Immowelt Suche", weight: 8,
        subjects: ["Neue Treffer: 3.5 Zi · 8002 Zürich",
          "Wieder verfügbar: Albisstr. 142",
          "Neue Treffer: 4 Zi · 8038 Wollishofen"] },
      { addr: "notifications.homegate.ch", name: "Homegate", weight: 5,
        subjects: ["5 neue Inserate für deine Suche",
          "Preissenkung: Sihltal-Strasse 8"] },
      { addr: "alert@immoscout24.ch", name: "ImmoScout24", weight: 3,
        subjects: ["Neue Wohnungen — Region Zürich",
          "Neuer Treffer: 4 Zi Thalwil"] },
      { addr: "noreply@newhome.ch", name: "Newhome", weight: 2,
        subjects: ["Suchabo Aktualisierung"] },
    ],
    move_paketzustellung: [
      { addr: "order-update@amazon.de", name: "Amazon.de", weight: 7,
        subjects: ["Bestellung versandt: UGREEN Revodok",
          "Geliefert: UGREEN Revodok",
          "Bestellung versandt: Sony WH-1000XM5"] },
      { addr: "noreply@dhl.de", name: "DHL", weight: 4,
        subjects: ["Paket unterwegs", "Paket zugestellt"] },
      { addr: "info@hermesworld.com", name: "Hermes", weight: 2,
        subjects: ["Sendung unterwegs", "Sendung zugestellt"] },
      { addr: "info@mydpd.ch", name: "DPD CH", weight: 2,
        subjects: ["Sendung in Zustellung"] },
      { addr: "track@gls-pakete.de", name: "GLS", weight: 1,
        subjects: ["Sendung in Zustellung"] },
      { addr: "sendung@post.ch", name: "Die Post", weight: 2,
        subjects: ["Sendung zugestellt", "Sendung ist bereit zur Abholung"] },
    ],
    move_zu_pruefen: [
      { addr: "info@stadt-zuerich.ch", name: "Stadt Zürich", weight: 1,
        subjects: ["Information zum Bauvorhaben Albisstr."] },
      { addr: "mahnungen@kollektor-inkasso.ch", name: "Kollektor Inkasso", weight: 1,
        subjects: ["Mahnung Nr. 2"] },
      { addr: "surveys@axoflux-engineering.ch", name: "Axoflux Surveys", weight: 1,
        subjects: ["Quartals-Umfrage"] },
      { addr: "wettbewerb@migros.ch", name: "Migros", weight: 1,
        subjects: ["Sie haben gewonnen!"] },
      { addr: "info@reisetraum-aktion.de", name: "Reisetraum", weight: 1,
        subjects: ["Letzte Chance: Sommer-Aktion"] },
      { addr: "redaktion@nachbar-blatt.ch", name: "Nachbar-Blatt", weight: 1,
        subjects: ["Ihr kostenloses Probe-Abo"] },
      { addr: "security@unbekannt-cloud.io", name: "Unbekannt Cloud", weight: 1,
        subjects: ["Login-Versuch erkannt"] },
      { addr: "m.frey@frey-anwalt.ch", name: "M. Frey", weight: 1,
        subjects: ["Vereinbarung — bitte um Rückruf"] },
      { addr: "info@neue-firma-xyz.de", name: "Neue Firma XYZ", weight: 1,
        subjects: ["Ihre Anfrage von gestern"] },
    ],
  };

  generateFromTemplates(yahooTemplates.keep, "keep", ACCOUNTS[1], 65, 90);
  generateFromTemplates(yahooTemplates.move_immo_portal, "move_immo_portal", ACCOUNTS[1], 18, 60);
  generateFromTemplates(yahooTemplates.move_paketzustellung, "move_paketzustellung", ACCOUNTS[1], 18, 75);
  generateFromTemplates(yahooTemplates.move_zu_pruefen, "move_zu_pruefen", ACCOUNTS[1], 9, 100);

  // yahoo · immo_privat (6, with 2 disagreements)
  push({ account: "yahoo", from_addr: "kontakt@raumgold-immobilien.de", from_name: "Raumgold Immobilien",
    subject: "Ihre Anfrage zu 4.5 Zi Wollishofen — Besichtigung",
    received_at: tsFor(2), classification: "geschaeftspost", confidence: 0.78,
    evidence: "Makler-Domain · individuelle Anrede",
    suggested_action: "move_immo_privat", reason: "Persönliche Maklerkommunikation",
    markers: ["broker_domain", "personalized"], tier: 2,
    final_action: "move_immo_privat", confirmed: true, response_ms: 1800 });
  push({ account: "yahoo", from_addr: "kontakt@raumgold-immobilien.de", from_name: "Raumgold Immobilien",
    subject: "Re: Besichtigung 4.5 Zi Wollishofen — Terminvorschlag",
    received_at: tsFor(1), classification: "geschaeftspost", confidence: 0.81,
    evidence: "Makler-Domain · individueller Termin",
    suggested_action: "move_immo_privat", reason: "Persönliche Korrespondenz",
    markers: ["broker_domain", "personalized", "in_reply_to"], tier: 2,
    final_action: "move_immo_privat", confirmed: true, response_ms: 1300 });
  push({ account: "yahoo", from_addr: "m.bichsel@direkt-makler.ch", from_name: "M. Bichsel",
    subject: "Wohnung Sihlfeldstr. — Unterlagen",
    received_at: tsFor(5), classification: "geschaeftspost", confidence: 0.72,
    evidence: "Individueller Sender · personalisiert",
    suggested_action: "move_immo_privat", reason: "Einzelner Makler",
    markers: ["personalized"], tier: 3, final_action: "move_immo_privat",
    confirmed: true, response_ms: 2400 });
  push({ account: "yahoo", from_addr: "info@gerstner-immo.ch", from_name: "Gerstner Immobilien",
    subject: "Ihre Bewerbung — Unterlagen vollständig",
    received_at: tsFor(7), classification: "geschaeftspost", confidence: 0.75,
    evidence: "Makler-Domain · Bewerbungsbezug",
    suggested_action: "move_immo_privat", reason: "Bewerbungs-Antwort",
    markers: ["broker_domain", "application_ref"], tier: 2,
    final_action: "move_immo_privat", confirmed: true, response_ms: 1500 });
  // century21 disagreements
  push({ account: "yahoo", from_addr: "newsletter@century21.de", from_name: "Century21",
    subject: "Exklusive Neuobjekte Region Zürichsee — KW 20",
    received_at: tsFor(3), classification: "werbung", confidence: 0.61,
    evidence: "Bulk-Mail · Liste neuer Objekte",
    suggested_action: "move_immo_portal", reason: "Sieht aus wie Portal-Alert",
    markers: ["bulk_sender", "object_list"], tier: 2,
    final_action: "move_immo_privat", confirmed: false, response_ms: 6800 });
  push({ account: "yahoo", from_addr: "kontakt@century21.de", from_name: "Century21 Region Zürichsee",
    subject: "Re: Ihre Anfrage — Objekt 4.5 Zi Horgen",
    received_at: tsFor(2), classification: "geschaeftspost", confidence: 0.58,
    evidence: "Antwort, aber gleicher Sender wie Newsletter",
    suggested_action: "move_immo_portal", reason: "Domain als Portal eingestuft",
    markers: ["domain_overlap"], tier: 2,
    final_action: "move_immo_privat", confirmed: false, response_ms: 7200 });

  // yahoo disagreements (info@immowelt Newsletter, rabbit.tech, immoscout24-DSGVO)
  push({ account: "yahoo", from_addr: "info@immowelt.de", from_name: "Immowelt",
    subject: "Marktbericht Q1 2026 — Mietpreise Zürich",
    received_at: tsFor(4), classification: "werbung", confidence: 0.64,
    evidence: "Immowelt-Domain · aber redaktioneller Newsletter",
    suggested_action: "move_immo_portal", reason: "Domain als Portal bekannt",
    markers: ["portal_domain", "editorial_newsletter"], tier: 2,
    final_action: "keep", confirmed: false, response_ms: 5400 });
  push({ account: "yahoo", from_addr: "info@immowelt.de", from_name: "Immowelt",
    subject: "Tipps: Bewerbungsdossier richtig zusammenstellen",
    received_at: tsFor(9), classification: "werbung", confidence: 0.60,
    evidence: "Newsletter-Pattern · keine Such-Treffer",
    suggested_action: "move_immo_portal", reason: "Domain als Portal bekannt",
    markers: ["portal_domain", "editorial_newsletter"], tier: 2,
    final_action: "keep", confirmed: false, response_ms: 4900 });
  push({ account: "yahoo", from_addr: "hello@rabbit.tech", from_name: "rabbit",
    subject: "r1 OS update 0.9.42 — what changed",
    received_at: tsFor(6), classification: "werbung", confidence: 0.51,
    evidence: "Ungewohnter Sender · transaktional-anmutender Betreff",
    suggested_action: "keep", reason: "Sieht wie geschäftliche Mitteilung aus",
    markers: ["product_update"], tier: 3,
    final_action: "move_zu_pruefen", confirmed: false, response_ms: 9100 });
  push({ account: "yahoo", from_addr: "alert@immoscout24.ch", from_name: "ImmoScout24",
    subject: "ImmoScout24 — Ihre Daten · Zusammenfassung",
    received_at: tsFor(8), classification: "geschaeftspost", confidence: 0.66,
    evidence: "Immoscout-Domain, aber DSGVO/Daten-Mail",
    suggested_action: "move_immo_portal", reason: "Domain bekannt",
    markers: ["portal_domain", "account_admin"], tier: 2,
    final_action: "keep", confirmed: false, response_ms: 6200 });

  // ═══════════════════════════════════════════════════════════════════════
  // MIRHAMED.CH — ~16 records (Behörden + Bewerbung, small custom domain)
  // ═══════════════════════════════════════════════════════════════════════
  const mirhamedRows = [
    { addr: "info@steueramt.zh.ch", name: "Steueramt Kt. Zürich",
      subject: "Veranlagungsverfügung 2024", action: "keep", cls: "geschaeftspost", tier: 1 },
    { addr: "noreply@steueramt.zh.ch", name: "Steueramt Kt. Zürich",
      subject: "Re: Einsprache 2023", action: "keep", cls: "geschaeftspost", tier: 1 },
    { addr: "info@migrationsamt.zh.ch", name: "Migrationsamt ZH",
      subject: "Niederlassungsbewilligung — Termin", action: "keep", cls: "geschaeftspost", tier: 1 },
    { addr: "kanzlei@gemeinde-thalwil.ch", name: "Gemeinde Thalwil",
      subject: "Anmeldebestätigung", action: "keep", cls: "geschaeftspost", tier: 1 },
    { addr: "akv@ahv-zh.ch", name: "AHV Ausgleichskasse",
      subject: "Beitragsverfügung 2025", action: "keep", cls: "geschaeftspost", tier: 1 },
    { addr: "notariat@notar-kueng.ch", name: "Notar Küng",
      subject: "Re: Beurkundungstermin", action: "keep", cls: "geschaeftspost", tier: 2 },
    { addr: "info@avk-zh.ch", name: "Amt für Verkehr",
      subject: "Führerausweis — Verlängerung", action: "keep", cls: "geschaeftspost", tier: 1 },
    { addr: "kanzlei@advokatur-spalt.ch", name: "Advokatur Spalt",
      subject: "Re: Vertragsentwurf", action: "keep", cls: "geschaeftspost", tier: 2 },
    { addr: "bewerbung@axoflux-engineering.ch", name: "Axoflux Recruiting",
      subject: "Re: Bewerbung Staff Engineer — Termin", action: "keep", cls: "privat", tier: 2 },
    { addr: "bewerbung@ginzburg-software.ch", name: "Ginzburg Software",
      subject: "Re: Ihre Bewerbung — Feedback", action: "keep", cls: "privat", tier: 2 },
    { addr: "info@swisspass.ch", name: "SwissPass",
      subject: "Re: Adresswechsel", action: "keep", cls: "geschaeftspost", tier: 2 },
    { addr: "noreply@strassenverkehrsamt.zh.ch", name: "Strassenverkehrsamt",
      subject: "Fahrzeugausweis — Anpassung Halter", action: "keep", cls: "geschaeftspost", tier: 1 },
    { addr: "info@swisslife.ch", name: "Swiss Life",
      subject: "Adressänderung bestätigt", action: "keep", cls: "geschaeftspost", tier: 1 },
    { addr: "kontakt@rechtsbeistand-mueller.ch", name: "RA Müller",
      subject: "Erinnerung Termin Donnerstag", action: "keep", cls: "geschaeftspost", tier: 2 },
    // 2 zu_pruefen
    { addr: "info@unbekannt-anwaltskanzlei.de", name: "Unbekannt Anwalt",
      subject: "Wichtige Mitteilung — Rückruf", action: "move_zu_pruefen", cls: "unklar", tier: 3 },
    { addr: "security@cloudverified.io", name: "Cloud Verified",
      subject: "Account-Verifizierung erforderlich", action: "move_zu_pruefen", cls: "unklar", tier: 3 },
  ];
  mirhamedRows.forEach((row) => {
    push({
      account: "mirhamed_ch",
      from_addr: row.addr, from_name: row.name, subject: row.subject,
      received_at: tsFor(intBetween(1, 180)),
      classification: row.cls, confidence: row.tier === 1 ? 0.92 : row.tier === 2 ? 0.78 : 0.46,
      evidence: row.tier === 1 ? "behördlich · vertrauenswürdig" :
                row.tier === 2 ? "individueller Sender" : "Pattern unklar",
      suggested_action: row.action, reason: row.action === "keep" ? "Behördenpost / Bewerbung" : "unklar",
      markers: row.tier === 1 ? ["domain_known", "regex_match"] :
               row.tier === 2 ? ["plugin_classified"] : ["low_confidence"],
      tier: row.tier,
      final_action: row.action, confirmed: true,
      response_ms: 500 + Math.floor(rng() * 2500),
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Post-process: derive disagreement, sort newest-first
  // ───────────────────────────────────────────────────────────────────────
  rows.forEach((r) => { r.disagreement = r.final_action !== r.suggested_action; });
  rows.sort((a, b) => (a.received_at < b.received_at ? 1 : -1));

  // Labels & shortcuts ────────────────────────────────────────────────────
  const ACTION_LABELS = {
    keep: "Behalten",
    move_immo_portal: "→ Immo · Portal",
    move_immo_privat: "→ Immo · Privat",
    move_paketzustellung: "→ Paketzustellung",
    move_zu_pruefen: "→ Zu prüfen",
  };
  const ACTION_SHORT = {
    keep: "keep", move_immo_portal: "immo_portal",
    move_immo_privat: "immo_privat", move_paketzustellung: "paketzustellung",
    move_zu_pruefen: "zu_pruefen",
  };

  // Stats per account
  const statsByAccount = {};
  ACCOUNTS.forEach((acc) => {
    const accRows = rows.filter((r) => r.account === acc.id);
    statsByAccount[acc.id] = {
      total: accRows.length,
      keep: accRows.filter((r) => r.final_action === "keep").length,
      disagreements: accRows.filter((r) => r.disagreement).length,
      counts: ACTIONS.reduce((acc2, a) => {
        acc2[a] = accRows.filter((r) => r.final_action === a).length; return acc2;
      }, {}),
    };
  });

  // Overall counts
  const counts = ACTIONS.reduce((acc, a) => {
    acc[a] = rows.filter((r) => r.final_action === a).length; return acc;
  }, {});

  // Sender aggregation across all accounts (and per-account splits)
  const senderMap = new Map();
  rows.forEach((r) => {
    const e = senderMap.get(r.from_addr) || {
      from_addr: r.from_addr, from_name: r.from_name, count: 0,
      actions: { keep: 0, move_immo_portal: 0, move_immo_privat: 0,
                 move_paketzustellung: 0, move_zu_pruefen: 0 },
      byAccount: {}, disagreements: 0,
    };
    e.count++;
    e.actions[r.final_action]++;
    if (r.disagreement) e.disagreements++;
    e.byAccount[r.account] = (e.byAccount[r.account] || 0) + 1;
    senderMap.set(r.from_addr, e);
  });
  const senders = [...senderMap.values()].sort((a, b) => b.count - a.count);

  const disagreements = rows.filter((r) => r.disagreement);

  window.MAIL_DATA = {
    rows, senders, counts, disagreements,
    ACCOUNTS, ACTIONS, ACTION_LABELS, ACTION_SHORT,
    statsByAccount, total: rows.length, NOW,
  };

  console.log("[mail-queue] data ready:",
    rows.length, "rows ·", senders.length, "senders ·",
    disagreements.length, "disagreements");
})();
