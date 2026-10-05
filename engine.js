/* ═══════════════════════════════════════════
   ENGINE — Harga Saham Dinamis + Berita Otomatis
   ═══════════════════════════════════════════ */

(function(){
  const STORAGE_KEY = "investhub_engine_v1";
  const STOCKS_BASE = [
    {code:"BBCA", name:"Bank Central Asia", base:9875, sector:"Perbankan", vol:"45,2 M", logo:"BC", color:"#3b82f6"},
    {code:"BBRI", name:"Bank Rakyat Indonesia", base:4520, sector:"Perbankan", vol:"82,1 M", logo:"BR", color:"#1e40af"},
    {code:"BMRI", name:"Bank Mandiri", base:6325, sector:"Perbankan", vol:"38,7 M", logo:"BM", color:"#1d4ed8"},
    {code:"TLKM", name:"Telkom Indonesia", base:2890, sector:"Teknologi", vol:"120,5 M", logo:"TL", color:"#dc2626"},
    {code:"ASII", name:"Astra International", base:5150, sector:"Industri", vol:"56,3 M", logo:"AS", color:"#0ea5e9"},
    {code:"UNVR", name:"Unilever Indonesia", base:2340, sector:"Konsumer", vol:"18,9 M", logo:"UN", color:"#0369a1"},
    {code:"ICBP", name:"Indofood CBP", base:11250, sector:"Konsumer", vol:"12,4 M", logo:"IC", color:"#f59e0b"},
    {code:"GOTO", name:"GoTo Gojek Tokopedia", base:68, sector:"Teknologi", vol:"890,2 M", logo:"GT", color:"#16a34a"},
    {code:"ADRO", name:"Adaro Energy", base:2380, sector:"Energi", vol:"67,8 M", logo:"AD", color:"#78350f"},
    {code:"ANTM", name:"Aneka Tambang", base:1585, sector:"Tambang", vol:"145,6 M", logo:"AN", color:"#b45309"},
    {code:"INDF", name:"Indofood Sukses", base:7250, sector:"Konsumer", vol:"23,1 M", logo:"IN", color:"#dc2626"},
    {code:"SMGR", name:"Semen Indonesia", base:4180, sector:"Infrastruktur", vol:"34,5 M", logo:"SM", color:"#64748b"},
    {code:"KLBF", name:"Kalbe Farma", base:1520, sector:"Kesehatan", vol:"78,2 M", logo:"KL", color:"#0891b2"},
    {code:"PGAS", name:"Perusahaan Gas", base:1655, sector:"Energi", vol:"52,4 M", logo:"PG", color:"#7c3aed"}
  ];

  const SECTORS = ["Perbankan","Energi","Tambang","Teknologi","Konsumer","Properti","Infrastruktur","Kesehatan","Industri","Pertanian"];

  /* ═══ LOAD / SAVE STATE ═══ */
  function loadState(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch(e){}
    return null;
  }

  function saveState(state){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function initState(){
    const now = Date.now();
    return {
      stocks: STOCKS_BASE.map(s => ({
        ...s,
        price: s.base,
        prevPrice: s.base,
        chg: 0,
        history: [{t:now, p:s.base}],
        createdAt: now
      })),
      news: [],
      lastNewsAt: now,
      startedAt: now,
      event: null,
      eventEndsAt: 0
    };
  }

  let state = loadState() || initState();
  if (!state.news) state.news = [];
  if (!state.stocks) state.stocks = [];

  /* ═══ HARGA UPDATE ═══ */
  function updatePrices(){
    const now = Date.now();
    state.stocks.forEach(s => {
      s.prevPrice = s.price;
      let drift = (Math.random() - 0.5) * 0.008; // ±0.4% random

      // Kalau ada event global, tambahin efek
      if (state.event && now < state.eventEndsAt){
        drift += state.event.drift * (state.event.sectors.includes(s.sector) ? 1.5 : 0.3);
      }

      // Kalau ada berita recent tentang saham ini → efek
      const recentNews = state.news.filter(n => 
        n.stockCode === s.code && (now - n.createdAt) < 30 * 60 * 1000
      );
      recentNews.forEach(n => {
        const ageMinutes = (now - n.createdAt) / 60000;
        const decay = Math.max(0, 1 - ageMinutes / 30);
        drift += (n.impact / 100) * decay;
      });

      // Kalau ada berita recent tentang sektor ini → efek
      const sectorNews = state.news.filter(n => 
        n.sector === s.sector && !n.stockCode && (now - n.createdAt) < 30 * 60 * 1000
      );
      sectorNews.forEach(n => {
        const ageMinutes = (now - n.createdAt) / 60000;
        const decay = Math.max(0, 1 - ageMinutes / 30);
        drift += (n.impact / 100) * decay * 0.7;
      });

      const newPrice = Math.max(1, Math.round(s.price * (1 + drift)));
      s.price = newPrice;
      s.chg = ((s.price - s.prevPrice) / s.prevPrice) * 100;
      s.history.push({t:now, p:s.price});
      if (s.history.length > 200) s.history.shift();
    });

    // Cek event expired
    if (state.event && now >= state.eventEndsAt){
      state.event = null;
    }
  }

  /* ═══ NEWS TEMPLATES ═══ */
  const NEWS_POOL = [
    // BULLISH — per saham
    {cat:"Saham", icon:"💹", impact:+1.5, tpl:"{kode} Cetak Laba Bersih Rp {triliun} T di Kuartal {kuartal}, Naik {pct}% YoY", stockLinked:true},
    {cat:"Saham", icon:"💹", impact:+1.2, tpl:"{kode} Umumkan Dividen Rp {dividen} per Saham, Yield {rate}%", stockLinked:true},
    {cat:"Saham", icon:"📈", impact:+1.8, tpl:"Saham {kode} Melonjak Usai Rilis Laporan Keuangan Impresif", stockLinked:true},
    {cat:"Saham", icon:"💹", impact:+0.8, tpl:"Analis Naikkan Target Harga {kode} ke Rp {target}, Rekomendasi Buy", stockLinked:true},
    {cat:"Saham", icon:"💰", impact:+1.0, tpl:"Asing Net Buy Saham {kode} Rp {miliar} Miliar Hari Ini", stockLinked:true},

    // BEARISH — per saham
    {cat:"Saham", icon:"📉", impact:-1.5, tpl:"{kode} Catat Penurunan Laba {pct}% YoY, Pasar Kecewa", stockLinked:true},
    {cat:"Saham", icon:"⚠️", impact:-2.0, tpl:"Saham {kode} Terkoreksi Tajam Usai Rilis Kinerja Lemah", stockLinked:true},
    {cat:"Saham", icon:"🔻", impact:-1.2, tpl:"Asing Net Sell Saham {kode} Rp {miliar} Miliar, Tekan Harga", stockLinked:true},
    {cat:"Saham", icon:"📉", impact:-0.9, tpl:"Analis Turunkan Target Harga {kode} ke Rp {target}, Rekomendasi Hold", stockLinked:true},

    // SEKTOR
    {cat:"Market", icon:"📊", impact:+1.0, tpl:"Sektor {sektor} Pimpin Penguatan IHSG Hari Ini", sectorLinked:true},
    {cat:"Market", icon:"📊", impact:-1.0, tpl:"Sektor {sektor} Jadi Pemberat IHSG, Investor Cermati", sectorLinked:true},
    {cat:"Komoditas", icon:"⛏️", impact:+1.3, tpl:"Harga {komoditas} Global Menguat, Saham Tambang Kompak Naik", sectorLinked:true, sector:"Tambang"},
    {cat:"Komoditas", icon:"⛏️", impact:-1.3, tpl:"Harga {komoditas} Global Terkoreksi, Saham Tambang Tertekan", sectorLinked:true, sector:"Tambang"},

    // MAKRO
    {cat:"Inflasi", icon:"💵", impact:-0.8, tpl:"Inflasi Bulan Ini Tercatat {rate}%, Di Atas Ekspektasi Pasar"},
    {cat:"Inflasi", icon:"💵", impact:+0.6, tpl:"Inflasi Bulan Ini Tercatat {rate}%, Di Bawah Ekspektasi Pasar"},
    {cat:"Inflasi", icon:"💵", impact:-0.5, tpl:"Harga Pangan Naik, Inflasi Bulanan Capai {rate}%"},
    {cat:"Inflasi", icon:"💵", impact:+0.4, tpl:"Inflasi Inti Stabil di {rate}%, BI Sebut Terkendali"},

    {cat:"Ekonomi", icon:"🏦", impact:+0.5, tpl:"BI Pertahankan Suku Bunga Acuan di {rate}% untuk Jaga Stabilitas"},
    {cat:"Ekonomi", icon:"🏦", impact:+0.7, tpl:"Nilai Tukar Rupiah Menguat ke Rp {kurs} per Dolar AS"},
    {cat:"Ekonomi", icon:"🏦", impact:-0.6, tpl:"Rupiah Melemah ke Rp {kurs} per Dolar AS, Pasar Cermati"},
    {cat:"Ekonomi", icon:"🏦", impact:+0.4, tpl:"Surplus Neraca Dagang Capai US$ {miliar} Miliar di Bulan Ini"},

    {cat:"Global", icon:"🌏", impact:-0.7, tpl:"The Fed Sinyalkan Kenaikan Suku Bunga, Pasar Asia Merespons Negatif"},
    {cat:"Global", icon:"🌏", impact:+0.8, tpl:"The Fed Sinyalkan Pemangkasan Suku Bunga, Pasar Asia Merespons Positif"},
    {cat:"Global", icon:"🌏", impact:-0.9, tpl:"Ketegangan Geopolitik Meningkat, Investor Beralih ke Aset Safe Haven"},
    {cat:"Global", icon:"🌏", impact:+0.5, tpl:"Ekonomi China Tumbuh {rate}%, Lebih Baik dari Ekspektasi"},

    {cat:"Politik", icon:"🏛️", impact:+0.7, tpl:"Pemerintah Rilis Paket Stimulus Rp {triliun} T untuk Dorong Ekonomi"},
    {cat:"Politik", icon:"🏛️", impact:+0.5, tpl:"Kementerian {sektor} Targetkan Investasi Rp {triliun} T Tahun Ini"},

    {cat:"Teknologi", icon:"🚀", impact:+1.0, tpl:"Startup {sektor} Raih Pendanaan Seri {seri} Senilai US$ {miliar} Juta"},
    {cat:"Teknologi", icon:"🚀", impact:+0.8, tpl:"Adopsi AI di Sektor {sektor} Meningkat, Investor Melirik"}
  ];

  const FILLERS = {
    arah:["menguat","melemah","naik","turun","rebound","terkoreksi","stabil"],
    sektor:SECTORS,
    komoditas:["Batu Bara","Nikel","CPO","Emas","Tembaga","Timah","Karet","Kakao"],
    kuartal:["I","II","III","IV"],
    bulan:["3","6","9","12"],
    seri:["A","B","C","D"],
    aksi:["Pemangkasan","Kenaikan","Pertahankan","Sinyal"],
    posisi:["Di Bawah","Di Atas","Sesuai","Melebihi"],
    net:["Buy","Sell"],
    negara:["China","Jepang","Amerika Serikat","India","Korea Selatan","Australia","Singapura"]
  };

  function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
  function num(min, max, dec=0){ const n = Math.random()*(max-min)+min; return dec ? n.toFixed(dec).replace(".",",") : Math.floor(n); }

  function fillTemplate(tmpl){
    return tmpl
      .replace(/{arah}/g, () => pick(FILLERS.arah))
      .replace(/{sektor}/g, () => pick(FILLERS.sektor))
      .replace(/{komoditas}/g, () => pick(FILLERS.komoditas))
      .replace(/{kuartal}/g, () => pick(FILLERS.kuartal))
      .replace(/{bulan}/g, () => pick(FILLERS.bulan))
      .replace(/{seri}/g, () => pick(FILLERS.seri))
      .replace(/{aksi}/g, () => pick(FILLERS.aksi))
      .replace(/{posisi}/g, () => pick(FILLERS.posisi))
      .replace(/{net}/g, () => pick(FILLERS.net))
      .replace(/{negara}/g, () => pick(FILLERS.negara))
      .replace(/{pct}/g, () => num(0.3, 5, 2))
      .replace(/{rate}/g, () => num(1.5, 6, 2))
      .replace(/{level}/g, () => num(6800, 7400).toLocaleString("id-ID"))
      .replace(/{miliar}/g, () => num(50, 900))
      .replace(/{kurs}/g, () => num(14800, 15600).toLocaleString("id-ID"))
      .replace(/{triliun}/g, () => num(1, 60, 1))
      .replace(/{dividen}/g, () => num(20, 500))
      .replace(/{target}/g, () => num(1000, 12000).toLocaleString("id-ID"))
      .replace(/{harga}/g, () => num(100, 3000))
      .replace(/{kode}/g, () => {
        if (state.stocks.length === 0) return "BBCA";
        return pick(state.stocks).code;
      });
  }

  /* ═══ GENERATE NEWS ═══ */
  function generateNews(force){
    const now = Date.now();
    const intervalMs = 60 * 1000; // 1 menit
    if (!force && now - state.lastNewsAt < intervalMs) return null;

    const tmpl = pick(NEWS_POOL);
    const item = {
      id: "n_" + now + "_" + Math.floor(Math.random()*1000),
      tag: tmpl.cat,
      icon: tmpl.icon,
      impact: tmpl.impact,
      title: fillTemplate(tmpl.tpl),
      createdAt: now,
      time: "Baru saja",
      isEvent: false
    };

    // Kalau linked ke saham/sektor, tandain
    if (tmpl.stockLinked && state.stocks.length){
      const st = pick(state.stocks);
      item.stockCode = st.code;
      item.title = item.title.replace(st.code, st.code);
    }
    if (tmpl.sectorLinked) item.sector = tmpl.sector || pick(SECTORS);

    state.news.unshift(item);
    state.lastNewsAt = now;

    // Max 100 berita tersimpen
    if (state.news.length > 100) state.news = state.news.slice(0, 100);

    // Update waktu relatif
    updateRelativeTimes();
    return item;
  }

  function updateRelativeTimes(){
    const now = Date.now();
    state.news.forEach(n => {
      const mins = Math.floor((now - n.createdAt) / 60000);
      if (mins < 1) n.time = "Baru saja";
      else if (mins < 60) n.time = mins + " menit lalu";
      else if (mins < 1440) n.time = Math.floor(mins/60) + " jam lalu";
      else n.time = Math.floor(mins/1440) + " hari lalu";
    });
  }

  /* ═══ DEVELOPER EVENT ═══ */
  function triggerEvent(type, customName){
    const now = Date.now();
    const presets = {
      crash: {name:"MARKET CRASH", icon:"💥", drift:-0.035, duration:5*60*1000, sectors:SECTORS, newsTpl:"⚠️ MARKET CRASH: IHSG Anjlok Tajam, Panik Melanda Pasar"},
      boom: {name:"MARKET BOOM", icon:"🚀", drift:+0.030, duration:5*60*1000, sectors:SECTORS, newsTpl:"🚀 MARKET BOOM: IHSG Melonjak, Euforia Pasar Melanda"},
      bankRun: {name:"BANK RUN", icon:"🏦", drift:-0.045, duration:4*60*1000, sectors:["Perbankan"], newsTpl:"🏦 BANK RUN: Nasabah Tarik Dana Massal, Saham Perbankan Terjun Bebas"},
      techBubble: {name:"TECH BUBBLE", icon:"📉", drift:-0.040, duration:4*60*1000, sectors:["Teknologi"], newsTpl:"📉 TECH BUBBLE: Valuasi Startup Diragukan, Saham Teknologi Runtuh"},
      inflationShock: {name:"INFLATION SHOCK", icon:"💸", drift:-0.030, duration:4*60*1000, sectors:SECTORS, newsTpl:"💸 INFLATION SHOCK: Inflasi Meroket, Daya Beli Anjlok, Pasar Panik"},
      oilBoom: {name:"OIL BOOM", icon:"🛢️", drift:+0.040, duration:4*60*1000, sectors:["Energi","Tambang"], newsTpl:"🛢️ OIL BOOM: Harga Minyak Meroket, Saham Energi Meledak"},
      rateCut: {name:"RATE CUT", icon:"✂️", drift:+0.025, duration:4*60*1000, sectors:SECTORS, newsTpl:"✂️ RATE CUT: BI Pangkas Suku Bunga, Pasar Sambut Euforia"}
    };

    const preset = presets[type] || presets.crash;

    state.event = {
      type,
      name: customName || preset.name,
      icon: preset.icon,
      drift: preset.drift,
      sectors: preset.sectors,
      startedAt: now
    };
    state.eventEndsAt = now + preset.duration;

    // Tambahin berita event
    state.news.unshift({
      id: "evt_" + now,
      tag: "BREAKING",
      icon: preset.icon,
      impact: preset.drift * 10,
      title: preset.newsTpl,
      createdAt: now,
      time: "Baru saja",
      isEvent: true
    });

    saveState(state);
    return state.event;
  }

  function clearEvent(){
    state.event = null;
    state.eventEndsAt = 0;
    saveState(state);
  }

  /* ═══ TICK ═══ */
  function tick(){
    updatePrices();
    const newNews = generateNews(false);
    updateRelativeTimes();
    saveState(state);

    // Dispatch event biar UI bisa update
    window.dispatchEvent(new CustomEvent("engine-tick", {
      detail: { state, newNews }
    }));
  }

  /* ═══ API PUBLIK ═══ */
  window.Engine = {
    getState: () => state,
    getStocks: () => state.stocks,
    getNews: () => state.news,
    getEvent: () => state.event,
    triggerEvent,
    clearEvent,
    generateNews: () => generateNews(true),
    tick,
    reset: () => {
      state = initState();
      saveState(state);
      window.dispatchEvent(new CustomEvent("engine-tick", { detail: { state } }));
    }
  };

  /* ═══ AUTO-TICK SETIAP 5 DETIK ═══ */
  tick(); // initial
  setInterval(tick, 5000);

})();
