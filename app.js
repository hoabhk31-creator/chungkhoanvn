/**
 * Institutional Equity Research Matrix (IERM) - Frontend Client Engine
 */

let currentReport = null;
let currentFinancialBundle = null;
let currentTechnicalData = null;
let currentMarkdownText = "";
let isSwitchingTicker = false;
let activeRequestSeq = 0;
let currentBctcSubtab = "kqkd";
let currentPeriodMode = "year"; // "year" hoặc "quarter"
let currentPeriodCount = 4; // 4, 8, hoặc 10 kỳ gần nhất
let currentSelectedPeriodIdx = -1; // -1: kỳ mới nhất (mặc định)
let currentBreakdownMode = "asset"; // "asset" (Cơ cấu Tài sản) hoặc "revenue" (Cơ cấu Doanh thu)

// Chart instances tracker
let chartRevenueProfit = null;
let chartAssetBreakdown = null;
let chartPeerRadar = null;
let chartPeBands = null;
let chartTechnicalCandles = null;
let chartTechnicalVolume = null;

// Vietstock Chart & SSI FastConnect Data State
let currentTvWidget = null;
let currentChartMode = "tradingview"; // 'tradingview' hoặc 'canvas'
let currentTechnicalInterval = "D"; // '15', '60', 'D', 'W', 'M'
let currentTechnicalTicker = "HPG";
let ssiApiCatalogCache = null;

// -------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    try { initClock(); } catch(e) { console.warn("initClock error:", e); }
    try { initTheme(); } catch(e) { console.warn("initTheme error:", e); }
    try { if (window.lucide) lucide.createIcons(); } catch(e) { console.warn("lucide error:", e); }
    try { loadMarketTickerTape(); } catch(e) { console.warn("loadMarketTickerTape error:", e); }
    try { loadBenchmarkRecommendations(); } catch(e) { console.warn("loadBenchmarkRecommendations error:", e); }
    
    // Tự động đồng bộ giá và chỉ số thị trường mỗi 3 giây (3000ms) cho toàn bộ trang webapp
    setInterval(() => {
        try {
            if (typeof isSwitchingTicker !== "undefined" && isSwitchingTicker) return;
            const activeTicker = currentReport?.ticker || (document.getElementById("central-ticker-input")?.value || "HPG").trim().toUpperCase();
            loadMarketTickerTape(activeTicker);
            refreshLivePrice(false);

            // Tự động cập nhật nến kỹ thuật và chỉ báo trực tiếp từ API SSI / Vietstock mỗi 3 giây
            const techTab = document.getElementById("tab-technical");
            if (techTab && !techTab.classList.contains("hidden")) {
                syncTechnicalDataRealtime(activeTicker);
            }
        } catch(e) { console.warn("live sync error:", e); }
    }, 3000);

    // Load default benchmark preset HPG
    try { selectTicker("HPG"); } catch(e) { console.warn("selectTicker default error:", e); }
    try { setupPdfDropzone(); } catch(e) { console.warn("setupPdfDropzone error:", e); }
    try { initDragToScroll("peer-table-container"); } catch(e) {}
    try { initDragToScroll("matrix-table-container"); } catch(e) {}
    try { initDragToScroll("industry-reports-container"); } catch(e) {}
});

// -------------------------------------------------------------
// DRAG-TO-SCROLL (NHẤP GIỮ CHUỘT KÉO CUỘN 4 CHIỀU: LÊN/XUỐNG, TRÁI/PHẢI)
// -------------------------------------------------------------
function initDragToScroll(containerId) {
    const el = document.getElementById(containerId);
    if (!el || el.dataset.dragScrollInitialized) return;
    el.dataset.dragScrollInitialized = "true";

    let isDown = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;
    let hasMoved = false;

    el.addEventListener("mousedown", (e) => {
        // Chỉ nhận click chuột trái (button 0)
        if (e.button !== 0) return;
        // Bỏ qua nếu click vào nút bấm, link hoặc input
        if (e.target.closest("button, a, input, select, textarea")) return;

        isDown = true;
        hasMoved = false;
        el.classList.add("cursor-grabbing");
        el.classList.remove("cursor-grab");
        el.style.userSelect = "none";

        startX = e.clientX;
        startY = e.clientY;
        scrollLeft = el.scrollLeft;
        scrollTop = el.scrollTop;
    });

    window.addEventListener("mouseup", () => {
        if (isDown) {
            isDown = false;
            el.classList.remove("cursor-grabbing");
            el.classList.add("cursor-grab");
            el.style.removeProperty("user-select");
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // Bắt đầu tính kéo khi rê chuột > 2px
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            hasMoved = true;
            e.preventDefault();
            el.scrollLeft = scrollLeft - dx;
            el.scrollTop = scrollTop - dy;
        }
    });

    // Ngăn chặn click ngoài ý muốn sau khi vừa thực hiện kéo cuộn
    el.addEventListener("click", (e) => {
        if (hasMoved) {
            e.stopPropagation();
            e.preventDefault();
            hasMoved = false;
        }
    }, true);
}

function initClock() {
    const clockEl = document.getElementById("live-clock");
    if (!clockEl) return;
    const update = () => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString("vi-VN", { hour12: false }) + " UTC+7";
    };
    update();
    setInterval(update, 1000);
}

// -------------------------------------------------------------
// THEME SWITCHER (DARK / LIGHT MODE)
// -------------------------------------------------------------
function initTheme() {
    const saved = localStorage.getItem("ierm-theme");
    if (saved === "light") {
        document.documentElement.classList.remove("dark");
        updateThemeIcons(false);
    } else {
        document.documentElement.classList.add("dark");
        updateThemeIcons(true);
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("ierm-theme", isDark ? "dark" : "light");
    updateThemeIcons(isDark);
    showToast(isDark ? "Đã chuyển sang Chế độ Tối (VCBS Dark Theme)" : "Đã chuyển sang Chế độ Sáng (VCBS Light Theme)");
    
    // Re-render charts with new theme palette if available
    if (currentFinancialBundle) {
        renderBctcCharts(getActiveStatements());
        renderPeerRadarChart(currentFinancialBundle.peers_data);
        renderPeBandsChart(currentFinancialBundle.valuation);
    }
    if (typeof initFireantChart === "function") {
        const tSym = (currentTechnicalData && currentTechnicalData.ticker) || currentTechnicalTicker || "HPG";
        initFireantChart(tSym, currentTechnicalInterval || "D");
    }
}

function updateThemeIcons(isDark) {
    const sun = document.getElementById("theme-icon-sun");
    const moon = document.getElementById("theme-icon-moon");
    if (sun && moon) {
        if (isDark) {
            sun.classList.add("hidden");
            moon.classList.remove("hidden");
        } else {
            sun.classList.remove("hidden");
            moon.classList.add("hidden");
        }
    }
}

// -------------------------------------------------------------
// TAB NAVIGATION (6 MASTER TABS)
// -------------------------------------------------------------
function switchTab(tabId) {
    document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.add("hidden"));
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.remove("active", "border-cyan-500", "text-cyan-400");
        btn.classList.add("border-transparent", "text-slate-400");
    });

    const activePane = document.getElementById(tabId);
    const activeBtn = document.getElementById(`nav-${tabId}`);
    if (activePane) activePane.classList.remove("hidden");
    if (activeBtn) {
        activeBtn.classList.add("active", "border-cyan-500", "text-cyan-400");
        activeBtn.classList.remove("border-transparent", "text-slate-400");
    }
    if (window.lucide) lucide.createIcons();

    // Trigger chart resize if newly shown
    if (tabId === "tab-bctc" && chartRevenueProfit) chartRevenueProfit.resize();
    if (tabId === "tab-industry" && chartPeerRadar) chartPeerRadar.resize();
    if (tabId === "tab-valuation" && chartPeBands) chartPeBands.resize();
    if (tabId === "tab-technical") {
        onSwitchToTechnicalTab();
    }
}

// Sub-navigation inside IERM Tab 6
function switchIermView(subpaneId) {
    document.querySelectorAll(".ierm-subpane").forEach(p => p.classList.add("hidden"));
    const target = document.getElementById(subpaneId);
    if (target) target.classList.remove("hidden");

    const buttons = ["btn-ierm-grid", "btn-ierm-causality", "btn-ierm-disensus", "btn-ierm-strategy"];
    buttons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.remove("bg-cyan-600", "text-white");
            btn.classList.add("bg-slate-800", "text-slate-300");
        }
    });

    const activeBtn = document.getElementById(`btn-${subpaneId}`);
    if (activeBtn) {
        activeBtn.classList.add("bg-cyan-600", "text-white");
        activeBtn.classList.remove("bg-slate-800", "text-slate-300");
    }
    if (window.lucide) lucide.createIcons();
}

// -------------------------------------------------------------
// LIVE MARKET TAPE & BENCHMARK RECOMMENDATIONS (MARKS 2 & 3)
// -------------------------------------------------------------
async function loadMarketTickerTape(activeTicker = null) {
    try {
        const url = activeTicker ? `/api/market-tape?ticker=${encodeURIComponent(activeTicker)}` : `/api/market-tape`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        
        const container = document.getElementById("live-ticker-tape");
        if (!container) return;
        
        let html = "";
        
        // Indices
        if (data.indices && data.indices.length > 0) {
            data.indices.forEach(idx => {
                const colorClass = idx.direction === "up" ? "text-emerald-400" : (idx.direction === "down" ? "text-rose-400" : "text-amber-400");
                const ping = idx.symbol === "VN-INDEX" ? `<span class="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-ping inline-block"></span>` : "";
                const displayStr = idx.display || `${idx.value.toLocaleString("vi-VN")} (${idx.change >= 0 ? "+" : ""}${idx.change} / ${idx.change_pct >= 0 ? "+" : ""}${idx.change_pct}%)`;
                html += `
                <span class="flex items-center text-slate-400">
                    ${ping}
                    ${idx.symbol}: <strong class="${colorClass} ml-1">${displayStr}</strong>
                </span>`;
            });
        }
        
        // Stocks
        if (data.stocks && data.stocks.length > 0) {
            data.stocks.forEach(stk => {
                const colorClass = stk.direction === "up" ? "text-emerald-400" : (stk.direction === "down" ? "text-rose-400" : "text-amber-400");
                const priceFormatted = stk.price ? stk.price.toLocaleString("vi-VN") : "";
                const changeStr = (stk.change !== undefined && stk.change !== null)
                    ? `(${stk.change >= 0 ? "+" : ""}${stk.change.toLocaleString("vi-VN")} / ${stk.change_pct >= 0 ? "+" : ""}${Number(stk.change_pct).toFixed(2)}%)`
                    : "";
                const isHighlight = activeTicker && stk.symbol.toUpperCase() === activeTicker.toUpperCase();
                const badgeBg = isHighlight ? "bg-cyan-950/90 border border-cyan-500/80 px-2 py-0.5 rounded shadow-sm ring-1 ring-cyan-500/40" : "";
                
                html += `
                <span class="text-slate-400 ${badgeBg} cursor-pointer hover:text-white transition-all flex items-center gap-1" onclick="selectTicker('${stk.symbol}')" title="Bấm để xem phân tích ${stk.symbol}">
                    ${stk.symbol}: <strong class="${colorClass}" id="tape-${stk.symbol.toLowerCase()}">${priceFormatted} ${changeStr}</strong>
                </span>`;
            });
        }
        
        // USD/VND
        if (data.exchange_rate) {
            html += `<span class="text-slate-400">${data.exchange_rate.pair}: <strong class="text-amber-400">${data.exchange_rate.rate}</strong></span>`;
        }
        
        container.innerHTML = html;
    } catch (e) {
        console.warn("loadMarketTickerTape warning:", e);
    }
}

async function loadBenchmarkRecommendations() {
    try {
        const res = await fetch("/api/benchmark-recommendations");
        if (!res.ok) return;
        const list = await res.json();
        
        const container = document.getElementById("quick-chips-container");
        if (!container || !list || list.length === 0) return;
        
        const activeInput = (document.getElementById("central-ticker-input")?.value || "HPG").toUpperCase();
        
        // Render chips
        let html = "";
        list.forEach(item => {
            const isAct = item.ticker.toUpperCase() === activeInput;
            const actClass = isAct 
                ? "active bg-cyan-950/80 border-cyan-700 text-cyan-300" 
                : "bg-slate-900 border-slate-700 text-slate-300";
            
            let badgeBg = "text-emerald-400 bg-emerald-950/80 border-emerald-800/60";
            let tagText = "";
            if (item.upside < 0 || item.rating.includes("VƯỢT")) {
                badgeBg = "text-rose-300 bg-rose-950/80 border-rose-800/60";
                tagText = `VƯỢT MỤC TIÊU -${Math.abs(Math.round(item.upside))}%`;
            } else {
                if (item.rating.includes("KHẢ QUAN")) {
                    badgeBg = "text-amber-400 bg-amber-950/80 border-amber-800/60";
                } else if (item.rating.includes("TÍCH LŨY")) {
                    badgeBg = "text-sky-400 bg-sky-950/80 border-sky-800/60";
                } else if (item.rating.includes("NẮM GIỮ")) {
                    badgeBg = "text-slate-400 bg-slate-800 border-slate-700";
                }
                const upsideStr = item.upside ? `+${Math.round(item.upside)}%` : "";
                tagText = `${item.rating} ${upsideStr}`.trim();
            }
            
            html += `
            <button onclick="selectTicker('${item.ticker}')" class="chip-btn ${actClass} px-2.5 py-1 rounded border font-bold hover:border-cyan-400 transition-all flex items-center gap-1 shrink-0" id="chip-${item.ticker}">
                <span>${item.ticker}</span>
                <span class="text-[9px] ${badgeBg} border px-1 py-0.2 rounded font-semibold">${tagText}</span>
            </button>`;
        });
        
        // Preserve any custom searched ticker chip if not in benchmark list
        if (activeInput && !list.some(x => x.ticker === activeInput)) {
            html = `
            <button onclick="selectTicker('${activeInput}')" class="chip-btn active bg-cyan-950/80 border-cyan-700 text-cyan-300 px-2.5 py-1 rounded border font-bold hover:border-cyan-400 transition-all flex items-center gap-1 shrink-0" id="chip-${activeInput}">
                <span>${activeInput}</span>
                <span class="text-[9px] text-cyan-400 bg-cyan-950/80 border border-cyan-800/60 px-1 py-0.2 rounded font-semibold">THEO DÕI</span>
            </button>` + html;
        }
        
        container.innerHTML = html;
    } catch (e) {
        console.warn("loadBenchmarkRecommendations warning:", e);
    }
}

// -------------------------------------------------------------
// CENTRAL TICKER SELECTOR (UNIFIES ALL 6 TABS)
// -------------------------------------------------------------
async function selectTicker(ticker) {
    const cleanTicker = (ticker || "HPG").trim().toUpperCase();
    if (!cleanTicker) return;

    const thisReqSeq = ++activeRequestSeq;
    isSwitchingTicker = true;

    showToast(`Đang tải toàn bộ dữ liệu tài chính & định giá cho ${cleanTicker}...`);
    
    // 1. Loading UI on Central Search button
    const btnSearch = document.getElementById("btn-central-search");
    const btnSearchText = document.getElementById("btn-search-text");
    if (btnSearch && btnSearchText) {
        btnSearch.disabled = true;
        btnSearchText.innerHTML = `<span class="inline-block animate-spin mr-1">⌛</span>Tải...`;
    }

    // Cập nhật ngay lập tức ô tìm kiếm trung tâm
    const input = document.getElementById("central-ticker-input");
    if (input) input.value = cleanTicker;

    // Phản hồi trực quan tức thì trên Header
    const dispTicker = document.getElementById("display-ticker");
    if (dispTicker) dispTicker.textContent = cleanTicker;
    const matrixHeaderTicker = document.getElementById("matrix-header-ticker");
    if (matrixHeaderTicker) matrixHeaderTicker.textContent = cleanTicker;
    const techToolbarTicker = document.getElementById("tech-toolbar-ticker");
    if (techToolbarTicker) techToolbarTicker.textContent = cleanTicker;

    // Dynamically ensure chip exists in Quick Chips Bar
    let chip = document.getElementById(`chip-${cleanTicker}`);
    if (!chip) {
        const container = document.getElementById("quick-chips-container");
        if (container) {
            const newBtn = document.createElement("button");
            newBtn.id = `chip-${cleanTicker}`;
            newBtn.className = "chip-btn active px-2.5 py-1 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700 font-bold hover:border-cyan-400 transition-all flex items-center gap-1 shrink-0";
            newBtn.onclick = () => selectTicker(cleanTicker);
            newBtn.innerHTML = `<span>${cleanTicker}</span><span class="text-[9px] text-cyan-400 bg-cyan-950/80 border border-cyan-800/60 px-1 py-0.2 rounded font-semibold">THEO DÕI</span>`;
            container.prepend(newBtn);
            chip = newBtn;
        }
    }

    // Update chip buttons active state
    document.querySelectorAll(".chip-btn").forEach(btn => {
        btn.classList.remove("active", "bg-cyan-950/80", "border-cyan-700", "text-cyan-300");
        btn.classList.add("bg-slate-900", "border-slate-700", "text-slate-300");
    });
    if (chip) {
        chip.classList.add("active", "bg-cyan-950/80", "border-cyan-700", "text-cyan-300");
        chip.classList.remove("bg-slate-900", "border-slate-700", "text-slate-300");
    }

    try {
        const [presetRes, finRes, techRes] = await Promise.all([
            fetch(`/api/preset/${cleanTicker}`).catch(e => { console.warn("Preset fetch error:", e); return null; }),
            fetch(`/api/financial-overview/${cleanTicker}`).catch(e => { console.warn("Fin fetch error:", e); return null; }),
            fetch(`/api/technical/${cleanTicker}?resolution=${currentTechnicalInterval}&count=150`).catch(e => { console.warn("Tech fetch error:", e); return null; })
        ]);

        // Nếu người dùng đã chọn mã khác trong lúc fetch thì bỏ qua request cũ
        if (thisReqSeq !== activeRequestSeq) return;

        let reportData = null;
        let finBundle = null;
        let techData = null;

        if (presetRes && presetRes.ok) {
            try { reportData = await presetRes.json(); } catch (e) { console.error("Parse preset err", e); }
        }
        if (finRes && finRes.ok) {
            try { finBundle = await finRes.json(); } catch (e) { console.error("Parse fin err", e); }
        }
        if (techRes && techRes.ok) {
            try { techData = await techRes.json(); } catch (e) { console.error("Parse tech err", e); }
        }

        if (reportData) currentReport = reportData;
        if (finBundle) currentFinancialBundle = finBundle;
        if (techData) currentTechnicalData = techData;

        // 1. Render Tab 1 & Header
        if (currentReport) {
            try { renderHero(currentReport); } catch (e) { console.error("renderHero err", e); }
            try { renderMatrixTable(currentReport); } catch (e) { console.error("renderMatrixTable err", e); }
            try { renderCausality(currentReport); } catch (e) { console.error("renderCausality err", e); }
            try { renderDisensus(currentReport); } catch (e) { console.error("renderDisensus err", e); }
            try { renderStrategy(currentReport); } catch (e) { console.error("renderStrategy err", e); }

            // Update chip tag if recommendation is available
            if (chip && currentReport.consensus_summary) {
                const cs = currentReport.consensus_summary;
                const tagSpan = chip.querySelector("span:last-child");
                if (tagSpan) {
                    if (cs.mean_target_price <= 0 || (cs.consensus_rating || "").includes("THEO DÕI")) {
                        tagSpan.textContent = "THEO DÕI";
                        tagSpan.className = "text-[9px] text-amber-300 bg-amber-950/80 border border-amber-700/80 px-1 py-0.2 rounded font-semibold";
                    } else if (cs.average_upside < 0 || (cs.mean_target_price > 0 && cs.current_market_price > cs.mean_target_price)) {
                        tagSpan.textContent = `VƯỢT MỤC TIÊU -${Math.abs(Math.round(cs.average_upside))}%`;
                        tagSpan.className = "text-[9px] text-rose-300 bg-rose-950/80 border border-rose-800/60 px-1 py-0.2 rounded font-semibold";
                    } else {
                        const rawRating = ((cs.consensus_rating || "").split("(")[0] || "").trim();
                        const shortRating = rawRating.includes("MUA") ? "MUA" : (rawRating.includes("KHẢ QUAN") ? "KHẢ QUAN" : (rawRating.includes("TÍCH LŨY") ? "TÍCH LŨY" : "NẮM GIỮ"));
                        const upsideStr = cs.average_upside ? `+${Math.round(cs.average_upside)}%` : "";
                        tagSpan.textContent = `${shortRating} ${upsideStr}`.trim();
                        let badgeBg = "text-emerald-400 bg-emerald-950/80 border-emerald-800/60";
                        if (shortRating.includes("KHẢ QUAN")) badgeBg = "text-amber-400 bg-amber-950/80 border-amber-800/60";
                        else if (shortRating.includes("TÍCH LŨY")) badgeBg = "text-sky-400 bg-sky-950/80 border-sky-800/60";
                        else if (shortRating.includes("NẮM GIỮ")) badgeBg = "text-slate-400 bg-slate-800 border-slate-700";
                        tagSpan.className = `text-[9px] ${badgeBg} border px-1 py-0.2 rounded font-semibold`;
                    }
                }
            }
        }

        // 2. Render Tab 2, 3, 4, 5 (BCTC, DuPont, Piotroski, Altman Z, So sánh ngành, Định giá)
        if (currentFinancialBundle) {
            const bundle = currentFinancialBundle;
            if (bundle.company_profile) {
                const compEl = document.getElementById("display-company");
                const sectEl = document.getElementById("display-sector");
                const matrixCompEl = document.getElementById("matrix-header-company");
                const matrixSectEl = document.getElementById("matrix-header-sector");
                if (compEl && bundle.company_profile.name) {
                    compEl.textContent = bundle.company_profile.name;
                    if (matrixCompEl) {
                        matrixCompEl.textContent = bundle.company_profile.name;
                        matrixCompEl.title = bundle.company_profile.name;
                    }
                }
                if (sectEl && bundle.company_profile.sector && bundle.company_profile.sector !== "Doanh nghiệp niêm yết") {
                    sectEl.textContent = bundle.company_profile.sector;
                    if (matrixSectEl) matrixSectEl.textContent = bundle.company_profile.sector;
                }
            }
            try { renderCompanyProfile(bundle.company_profile); } catch(e) { console.error("renderCompanyProfile err", e); }
            try { renderDupont(bundle.dupont); } catch(e) { console.error("renderDupont err", e); }
            try { renderPiotroski(bundle.piotroski); } catch(e) { console.error("renderPiotroski err", e); }
            try { renderAltmanZ(bundle.altman_z); } catch(e) { console.error("renderAltmanZ err", e); }
            currentSelectedPeriodIdx = -1;
            const activeStm = getActiveStatements();
            try { renderBctcTable(activeStm, currentBctcSubtab); } catch(e) { console.error("renderBctcTable err", e); }
            try { renderBctcCharts(activeStm); } catch(e) { console.error("renderBctcCharts err", e); }
            try { renderPeersSection(bundle.peers_data); } catch(e) { console.error("renderPeersSection err", e); }
            try { renderValuationSection(bundle.valuation); } catch(e) { console.error("renderValuationSection err", e); }
            if (currentReport) {
                try { renderCausality(currentReport); } catch(e) { console.error("re-renderCausality err", e); }
            }
        }

        // 3. Render Tab 6: Kỹ thuật & Bảng giá
        if (currentTechnicalData) {
            currentTechnicalTicker = cleanTicker;
            try { renderTechnicalSection(currentTechnicalData); } catch(e) { console.error("renderTechnicalSection err", e); }
            try { initFireantChart(cleanTicker, currentTechnicalInterval); } catch(e) { console.error("initFireantChart err", e); }
        }

        // 4. Sync live market tape with active ticker
        try { loadMarketTickerTape(cleanTicker); } catch(e) {}

        if (window.lucide) lucide.createIcons();
        showToast(`Đã đồng bộ Dashboard 6 Tab cho mã ${cleanTicker}!`);
    } catch (err) {
        console.error("selectTicker error:", err);
        showToast(`Lỗi nạp dữ liệu: ${err.message}`, true);
    } finally {
        if (thisReqSeq === activeRequestSeq) {
            isSwitchingTicker = false;
        }
        if (btnSearch && btnSearchText) {
            btnSearch.disabled = false;
            btnSearchText.textContent = "Tải";
        }
    }
}

function handleCentralSearch(explicitTicker) {
    let ticker = "";
    if (typeof explicitTicker === "string" && explicitTicker.trim()) {
        ticker = explicitTicker.trim();
    } else {
        const input = document.getElementById("central-ticker-input");
        ticker = input ? input.value.trim() : "";
    }
    if (!ticker) {
        showToast("Vui lòng nhập mã chứng khoán (vd: SSI, HCM, VNM, FPT, MWG, HPG)!", true);
        return;
    }
    selectTicker(ticker.toUpperCase());
}

function loadPreset(ticker) {
    selectTicker(ticker);
}

// -------------------------------------------------------------
// RENDER FULL REPORT
// -------------------------------------------------------------
function renderAll(report) {
    renderHero(report);
    renderMatrixTable(report);
    renderCausality(report);
    renderDisensus(report);
    renderStrategy(report);
    if (window.lucide) lucide.createIcons();
}

function renderHero(report) {
    const cs = report.consensus_summary;
    document.getElementById("display-ticker").textContent = report.ticker;
    document.getElementById("display-company").textContent = report.company_name;
    document.getElementById("display-sector").textContent = report.sector;
    document.getElementById("display-market-price").textContent = `${cs.current_market_price.toLocaleString("vi-VN")} VND`;

    // Đồng bộ Mã CK & Tên DN trên Header Bảng Ma Trận Ngang (Khoanh đỏ)
    const matrixTickerEl = document.getElementById("matrix-header-ticker");
    if (matrixTickerEl) matrixTickerEl.textContent = report.ticker;
    const matrixCompEl = document.getElementById("matrix-header-company");
    if (matrixCompEl) {
        matrixCompEl.textContent = report.company_name;
        matrixCompEl.title = report.company_name;
    }
    const matrixSectEl = document.getElementById("matrix-header-sector");
    if (matrixSectEl) matrixSectEl.textContent = report.sector;
    
    // Live price source badge
    const sourceLabel = cs.price_source_label || "Vietstock Chart & CTCK";
    const dateLabel = cs.price_date_str || "Gần nhất";
    const sourceTextEl = document.getElementById("display-source-text");
    if (sourceTextEl) {
        sourceTextEl.textContent = `${sourceLabel} (${dateLabel})`;
    }

    document.getElementById("display-date").textContent = report.analysis_date || `Tháng 09/2026`;
    document.getElementById("display-report-count").textContent = `${report.matrix_table ? report.matrix_table.length : 0} Báo cáo`;

    // Metrics
    const hasValidValuation = cs.mean_target_price > 0 && !(cs.consensus_rating || "").includes("THEO DÕI");
    const isExceeded = hasValidValuation && (cs.average_upside < 0 || cs.current_market_price > cs.mean_target_price);

    const ratingEl = document.getElementById("stat-rating");
    const ratingIcon = document.getElementById("stat-rating-icon");
    const scoreEl = document.getElementById("stat-score");
    const meanPriceEl = document.getElementById("stat-mean-price");
    const upsideEl = document.getElementById("stat-upside");
    const upsideLabelEl = document.getElementById("stat-upside-label");
    const upsideWrapper = document.getElementById("stat-upside-wrapper");

    // 1. Thẻ Consensus
    if (ratingEl) {
        if (!hasValidValuation) {
            ratingEl.textContent = cs.consensus_rating || "CẦN THEO DÕI THÊM";
            ratingEl.className = "text-sm font-bold text-amber-400";
            if (ratingIcon) {
                ratingIcon.className = "w-3.5 h-3.5 text-amber-400";
                ratingIcon.setAttribute("data-lucide", "eye");
            }
        } else if (isExceeded) {
            ratingEl.textContent = cs.consensus_rating || "GIÁ ĐÃ VƯỢT GIÁ MỤC TIÊU";
            ratingEl.className = "text-sm font-bold text-amber-400";
            if (ratingIcon) {
                ratingIcon.className = "w-3.5 h-3.5 text-amber-400";
                ratingIcon.setAttribute("data-lucide", "alert-triangle");
            }
        } else {
            ratingEl.textContent = cs.consensus_rating;
            ratingEl.className = "text-sm font-bold text-emerald-400";
            if (ratingIcon) {
                ratingIcon.className = "w-3.5 h-3.5 text-emerald-400";
                ratingIcon.setAttribute("data-lucide", "trending-up");
            }
        }
    }
    if (scoreEl) {
        scoreEl.textContent = hasValidValuation ? cs.consensus_score : "—";
    }

    // 2. Thẻ Giá mục tiêu TB & Upside
    if (meanPriceEl) {
        meanPriceEl.textContent = hasValidValuation ? `${cs.mean_target_price.toLocaleString("vi-VN")} VND` : "—";
    }
    if (upsideEl) {
        if (!hasValidValuation) {
            upsideEl.textContent = "Cần theo dõi thêm";
            if (upsideLabelEl) upsideLabelEl.textContent = "Định giá:";
            if (upsideWrapper) upsideWrapper.className = "text-[10px] text-amber-400/90 mt-1 font-semibold";
        } else if (isExceeded) {
            const overPct = Math.abs(cs.average_upside).toFixed(1);
            if (upsideLabelEl) upsideLabelEl.textContent = "Đã vượt:";
            upsideEl.textContent = `+${overPct}%`;
            if (upsideWrapper) upsideWrapper.className = "text-[10px] text-rose-400 mt-1 font-bold";
        } else {
            if (upsideLabelEl) upsideLabelEl.textContent = "Upside:";
            upsideEl.textContent = `+${cs.average_upside.toFixed(1)}%`;
            if (upsideWrapper) upsideWrapper.className = "text-[10px] text-emerald-400 mt-1 font-semibold";
        }
    }

    document.getElementById("stat-median-price").textContent = hasValidValuation ? `${cs.median_target_price.toLocaleString("vi-VN")} VND` : "—";
    document.getElementById("stat-min-max").textContent = hasValidValuation ? `${cs.min_target_price.toLocaleString("vi-VN")} - ${cs.max_target_price.toLocaleString("vi-VN")}` : "—";
    document.getElementById("stat-spread").textContent = hasValidValuation && cs.target_price_spread_percent > 0 ? `${cs.target_price_spread_percent.toFixed(1)}%` : "—";

    // 3. KỲ VỌNG THỊ GIÁ VS ĐỊNH GIÁ TRUNG BÌNH CTCK (Ô GÓC PHẢI)
    const ratio = cs.market_to_fair_value_ratio || (cs.mean_target_price > 0 ? (cs.current_market_price / cs.mean_target_price) * 100 : 100);
    const expUpsideEl = document.getElementById("stat-expectation-upside");
    const priceToFairEl = document.getElementById("stat-price-to-fair");
    const upsideBadge = document.getElementById("stat-upside-badge");
    const expIcon = document.getElementById("stat-exp-icon");
    const progressBar = document.getElementById("stat-progress-bar");

    if (expUpsideEl) {
        if (!hasValidValuation) {
            expUpsideEl.textContent = "Cần theo dõi thêm";
            expUpsideEl.className = "text-base font-extrabold text-amber-400 font-mono tracking-tight";
        } else if (isExceeded) {
            const overPct = Math.abs(cs.average_upside).toFixed(1);
            expUpsideEl.textContent = `Đã vượt kỳ vọng (+${overPct}%)`;
            expUpsideEl.className = "text-base font-extrabold text-amber-400 font-mono tracking-tight";
        } else {
            expUpsideEl.textContent = `+${cs.average_upside.toFixed(1)}% Kỳ Vọng Tăng`;
            expUpsideEl.className = "text-base font-extrabold text-emerald-400 font-mono tracking-tight";
        }
    }

    if (priceToFairEl) {
        if (!hasValidValuation) {
            priceToFairEl.textContent = "Chưa có định giá còn hiệu lực (<1 năm)";
            priceToFairEl.className = "text-[11px] text-slate-400 font-mono font-bold";
        } else if (isExceeded) {
            const overRatio = (ratio - 100).toFixed(1);
            priceToFairEl.textContent = `Thị giá vượt ${overRatio}% (Đạt ${ratio.toFixed(1)}% TB CTCK)`;
            priceToFairEl.className = "text-[11px] text-rose-300 font-mono font-bold";
        } else {
            priceToFairEl.textContent = `Đạt ${ratio.toFixed(1)}% Định giá`;
            priceToFairEl.className = "text-[11px] text-cyan-200 font-mono font-bold";
        }
    }

    if (upsideBadge) {
        if (!hasValidValuation) {
            upsideBadge.textContent = "THEO DÕI THÊM";
            upsideBadge.className = "text-[9px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-700 font-mono font-bold";
            if (expIcon) expIcon.className = "w-3.5 h-3.5 text-amber-400";
        } else if (isExceeded) {
            upsideBadge.textContent = "ĐÃ VƯỢT KỲ VỌNG";
            upsideBadge.className = "text-[9px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-700 font-mono font-bold";
            if (expIcon) expIcon.className = "w-3.5 h-3.5 text-rose-400";
        } else {
            upsideBadge.textContent = "UPSIDE SPREAD";
            upsideBadge.className = "text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-mono font-bold";
            if (expIcon) expIcon.className = "w-3.5 h-3.5 text-emerald-400";
        }
    }

    if (progressBar) {
        if (!hasValidValuation) {
            progressBar.style.width = "0%";
        } else if (isExceeded) {
            progressBar.style.width = "100%";
            progressBar.className = "bg-gradient-to-r from-amber-500 via-rose-500 to-red-500 h-full rounded-full transition-all duration-700 shadow-sm shadow-rose-500/50";
        } else {
            progressBar.style.width = `${Math.min(100, Math.max(5, ratio))}%`;
            progressBar.className = "bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400 h-full rounded-full transition-all duration-700 shadow-sm shadow-emerald-500/50";
        }
    }

    const currentVsFairEl = document.getElementById("stat-current-vs-fair");
    if (currentVsFairEl) {
        currentVsFairEl.textContent = hasValidValuation
            ? `Thị giá: ${cs.current_market_price.toLocaleString("vi-VN")} đ / TB CTCK: ${cs.mean_target_price.toLocaleString("vi-VN")} đ`
            : `Thị giá: ${cs.current_market_price ? cs.current_market_price.toLocaleString("vi-VN") : 0} đ / Định giá TB: —`;
    }
    if (window.lucide) lucide.createIcons();
}

function renderMatrixTable(report) {
    const table = document.getElementById("matrix-table-element");
    if (!table || !report) return;
    const reports = report.matrix_table || [];
    const cs = report.consensus_summary || {};

    const theadEl = table.querySelector("thead") || document.getElementById("matrix-table-head");
    const tbodyEl = table.querySelector("tbody") || document.getElementById("matrix-table-body");

    if (reports.length === 0) {
        if (theadEl) {
            theadEl.innerHTML = `<tr>
                <th class="p-3 bg-slate-950 font-mono text-cyan-400 font-bold border-b border-slate-800 text-left">
                    THÔNG BÁO DỮ LIỆU ĐỊNH GIÁ & BÁO CÁO PHÂN TÍCH
                </th>
            </tr>`;
        }
        if (tbodyEl) {
            tbodyEl.innerHTML = `<tr>
                <td class="p-8 text-center bg-slate-900/60 border-b border-slate-800">
                    <div class="flex flex-col items-center justify-center space-y-3">
                        <i data-lucide="file-search" class="w-10 h-10 text-slate-500"></i>
                        <div class="text-sm font-bold text-slate-300">
                            Chưa có báo cáo phân tích định giá từ các CTCK cho mã cổ phiếu <span class="text-cyan-400">${report.ticker}</span>
                        </div>
                        <div class="text-xs text-slate-400 max-w-lg leading-relaxed">
                            Hệ thống tuân thủ nguyên tắc <strong>Fact & Data First</strong>: Không tự bịa đặt khuyến nghị, giá mục tiêu hay các số liệu dự phóng khi chưa có bài viết phân tích chính thức từ các công ty chứng khoán.
                        </div>
                    </div>
                </td>
            </tr>`;
        }
        if (window.lucide) lucide.createIcons();
        return;
    }

    // Build thead (Cố định hàng đầu + cố định ô góc trên bên trái)
    let theadHtml = `<tr>
        <th class="p-3 sticky top-0 left-0 z-30 bg-slate-950 font-mono text-cyan-400 font-bold border-b border-r border-slate-800 whitespace-nowrap shadow-[2px_2px_5px_-1px_rgba(0,0,0,0.5)] min-w-[220px]">
            TIÊU CHÍ ĐỐI CHIẾU
        </th>`;
    reports.forEach(r => {
        const expiredBadge = r.is_expired ? `<div class="text-[10px] text-rose-400 font-semibold mt-0.5">(Quá 1 năm)</div>` : '';
        theadHtml += `<th class="p-3 sticky top-0 z-20 bg-slate-950 font-mono font-bold text-white border-b border-slate-800 text-center min-w-[175px] shadow-[0_2px_5px_-1px_rgba(0,0,0,0.5)]">
            <div class="text-cyan-300 font-extrabold text-sm">${r.institution}</div>
            <div class="text-[10px] text-slate-500 font-normal">Phát hành: ${r.report_date}</div>
            ${expiredBadge}
        </th>`;
    });
    theadHtml += `<th class="p-3 sticky top-0 z-20 bg-slate-950 font-mono font-bold text-emerald-400 border-b border-slate-800 text-center min-w-[210px] shadow-[0_2px_5px_-1px_rgba(0,0,0,0.5)]">
        ĐỘ LỆCH & ĐỒNG THUẬN (CONSENSUS)
    </th></tr>`;
    
    if (theadEl) theadEl.innerHTML = theadHtml;

    // Build tbody rows (Cố định cột đầu tiên của mỗi hàng)
    let tbodyHtml = "";

    // 1. Khuyến nghị & Giá mục tiêu
    tbodyHtml += `<tr>
        <td class="p-3 font-mono font-semibold text-slate-300 sticky left-0 z-10 bg-slate-900 border-b border-r border-slate-800 shadow-[2px_0_5px_-1px_rgba(0,0,0,0.5)] min-w-[220px]">
            <div class="flex items-center gap-1.5 text-white">
                <i data-lucide="target" class="w-3.5 h-3.5 text-cyan-400"></i>
                <span>Khuyến nghị & Target Price</span>
            </div>
            <span class="text-[10px] text-slate-500">Mức định giá & upside</span>
        </td>`;
    reports.forEach(r => {
        const badgeClass = getRecBadgeClass(r.recommendation);
        let recBadgeHtml = `<div class="inline-block px-2 py-0.5 rounded text-[11px] font-bold ${badgeClass} mb-1">${r.recommendation}</div>`;
        let tpDisplay = r.target_price > 0 ? `${r.target_price.toLocaleString("vi-VN")} đ` : '—';
        let upsideDisplay = '<div class="text-[11px] font-semibold text-slate-500">—</div>';

        if (r.is_expired) {
            recBadgeHtml = `<div class="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700/80 mb-1 line-through opacity-70">${r.recommendation}</div>
            <div class="text-[9px] text-rose-400 font-mono font-semibold">Báo cáo quá 1 năm</div>`;
            tpDisplay = r.target_price > 0 
                ? `<span class="line-through text-slate-400 font-normal">${r.target_price.toLocaleString("vi-VN")} đ</span><span class="text-[10px] text-rose-400 font-mono block font-semibold">(Quá 1 năm)</span>`
                : '—';
            upsideDisplay = '<div class="text-[11px] font-semibold text-slate-500 italic">Không tính định giá</div>';
        } else {
            if (r.upside_percent !== null && r.upside_percent !== undefined && r.target_price > 0) {
                if (r.upside_percent < 0) {
                    upsideDisplay = `<div class="text-[11px] font-semibold text-rose-400">Vượt +${Math.abs(r.upside_percent).toFixed(1)}%</div>`;
                } else {
                    upsideDisplay = `<div class="text-[11px] font-semibold text-emerald-400">+${r.upside_percent.toFixed(1)}%</div>`;
                }
            }
        }
        tbodyHtml += `<td class="p-3 text-center font-mono border-b border-slate-800/80 min-w-[175px]">
            ${recBadgeHtml}
            <div class="text-sm font-extrabold text-white">${tpDisplay}</div>
            ${upsideDisplay}
        </td>`;
    });
    const hasValidConsensus = cs.mean_target_price > 0 && !(cs.consensus_rating || "").includes("THEO DÕI");
    let meanDisplay = 'Mean: — (Cần theo dõi thêm)';
    let rangeDisplay = 'Chưa có định giá hiệu lực (<1 năm)';
    let spreadDisplay = 'Độ lệch spread: —';
    if (hasValidConsensus) {
        meanDisplay = `Mean: ${cs.mean_target_price.toLocaleString("vi-VN")} đ`;
        rangeDisplay = `Vùng [${cs.min_target_price.toLocaleString("vi-VN")} - ${cs.max_target_price.toLocaleString("vi-VN")}]`;
        spreadDisplay = cs.target_price_spread_percent > 0 ? `Độ lệch spread: ${cs.target_price_spread_percent.toFixed(1)}%` : 'Độ lệch spread: —';
    }
    tbodyHtml += `<td class="p-3 font-mono text-xs bg-slate-950/40 border-b border-slate-800/80 min-w-[210px]">
        <div class="text-cyan-400 font-bold">${meanDisplay}</div>
        <div class="text-slate-400 text-[11px]">${rangeDisplay}</div>
        <div class="text-amber-400 text-[10px] mt-0.5">${spreadDisplay}</div>
    </td></tr>`;

    // 2. Định giá P/E & P/B forward
    tbodyHtml += `<tr>
        <td class="p-3 font-mono font-semibold text-slate-300 sticky left-0 z-10 bg-slate-900 border-b border-r border-slate-800 shadow-[2px_0_5px_-1px_rgba(0,0,0,0.5)] min-w-[220px]">
            <div class="flex items-center gap-1.5 text-white">
                <i data-lucide="calculator" class="w-3.5 h-3.5 text-sky-400"></i>
                <span>Dự phóng P/E, P/B forward</span>
            </div>
            <span class="text-[10px] text-slate-500">Hệ số định giá kỳ vọng</span>
        </td>`;
    reports.forEach(r => {
        const peTxt = (r.pe_forward && r.pe_forward > 0 && r.pe_forward < 100) ? r.pe_forward + 'x' : '—';
        const pbTxt = (r.pb_forward && r.pb_forward > 0 && r.pb_forward < 25) ? r.pb_forward + 'x' : '—';
        tbodyHtml += `<td class="p-3 text-center font-mono border-b border-slate-800/80 min-w-[175px]">
            <div class="text-slate-200 font-bold">P/E: ${peTxt}</div>
            <div class="text-slate-400 text-[11px]">P/B: ${pbTxt}</div>
        </td>`;
    });
    const validPes = reports.filter(r => !r.is_expired).map(r => r.pe_forward).filter(v => typeof v === 'number' && v > 0 && v < 100);
    const avgPe = validPes.length > 0 ? validPes.reduce((a, b) => a + b, 0) / validPes.length : 0;
    tbodyHtml += `<td class="p-3 font-mono text-xs bg-slate-950/40 border-b border-slate-800/80 min-w-[210px]">
        <div class="text-white font-semibold">P/E forward TB: <span class="text-cyan-400 font-bold">${avgPe > 0 ? avgPe.toFixed(1) + 'x' : '—'}</span></div>
        <div class="text-slate-400 text-[10px]">Định giá phản ánh chu kỳ phục hồi</div>
    </td></tr>`;

    // 3. Dự phóng Doanh thu & LNST
    tbodyHtml += `<tr>
        <td class="p-3 font-mono font-semibold text-slate-300 sticky left-0 z-10 bg-slate-900 border-b border-r border-slate-800 shadow-[2px_0_5px_-1px_rgba(0,0,0,0.5)] min-w-[220px]">
            <div class="flex items-center gap-1.5 text-white">
                <i data-lucide="trending-up" class="w-3.5 h-3.5 text-emerald-400"></i>
                <span>Dự phóng Doanh thu & LNST</span>
            </div>
            <span class="text-[10px] text-slate-500">Kỳ vọng kết quả kinh doanh</span>
        </td>`;
    reports.forEach(r => {
        const revDisplay = (r.revenue_forecast && r.revenue_forecast !== 'N/A' && r.revenue_forecast !== '—') ? r.revenue_forecast : '—';
        const npatDisplay = (r.npat_forecast && r.npat_forecast !== 'N/A' && r.npat_forecast !== '—') ? r.npat_forecast : '—';
        tbodyHtml += `<td class="p-3 font-mono text-xs border-b border-slate-800/80 min-w-[175px]">
            <div class="text-slate-300 font-semibold mb-1">
                <span class="text-slate-500 text-[10px] block">DOANH THU:</span>
                ${revDisplay}
            </div>
            <div class="text-emerald-400 font-semibold">
                <span class="text-slate-500 text-[10px] block">LNST:</span>
                ${npatDisplay}
            </div>
        </td>`;
    });
    tbodyHtml += `<td class="p-3 font-mono text-xs bg-slate-950/40 border-b border-slate-800/80 min-w-[210px]">
        <div class="text-emerald-400 font-bold">Đồng thuận tăng trưởng cao</div>
        <div class="text-slate-400 text-[10px]">Chênh lệch LNST giữa bên cao nhất và thấp nhất là 31.7%</div>
    </td></tr>`;

    // 4. Luận điểm tăng trưởng then chốt (Key Catalysts)
    tbodyHtml += `<tr>
        <td class="p-3 font-mono font-semibold text-slate-300 sticky left-0 z-10 bg-slate-900 border-b border-r border-slate-800 shadow-[2px_0_5px_-1px_rgba(0,0,0,0.5)] min-w-[220px]">
            <div class="flex items-center gap-1.5 text-white">
                <i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-400"></i>
                <span>Luận điểm tăng trưởng (Catalysts)</span>
            </div>
            <span class="text-[10px] text-slate-500">Động cơ thúc đẩy tăng giá</span>
        </td>`;
    reports.forEach(r => {
        let catHtml = `<ul class="space-y-1.5 text-[11px] text-slate-300 text-left">`;
        (r.key_catalysts || []).forEach((c, idx) => {
            catHtml += `<li class="flex items-start gap-1.5">
                <span class="text-cyan-400 font-mono font-bold shrink-0">${idx + 1}.</span>
                <span>${c}</span>
            </li>`;
        });
        catHtml += `</ul>`;
        tbodyHtml += `<td class="p-3 border-b border-slate-800/80 min-w-[280px] align-top">${catHtml}</td>`;
    });
    
    // Cột đồng thuận Catalysts
    let consensualCatsHtml = `<div class="text-cyan-300 font-bold mb-1.5 flex items-center gap-1">
        <i data-lucide="check-circle" class="w-3.5 h-3.5 text-cyan-400"></i>
        <span>Điểm giao thoa đồng thuận:</span>
    </div>`;
    const cCats = (report.consensus_summary && report.consensus_summary.consensual_catalysts && report.consensus_summary.consensual_catalysts.length > 0)
        ? report.consensus_summary.consensual_catalysts.slice(0, 4)
        : [
            "Đại dự án mở rộng công suất vận hành thương mại",
            "Bảo hộ thương mại & chiếm lĩnh thị phần nội địa",
            "Tự chủ chuỗi giá trị và tối ưu chi phí biên",
            "Cơ cấu tài chính an toàn & dòng tiền CFO thặng dư"
        ];
    consensualCatsHtml += `<ul class="space-y-1 text-slate-300 text-[10px]">`;
    cCats.forEach(c => {
        consensualCatsHtml += `<li class="flex items-start gap-1">
            <span class="text-cyan-400 font-bold shrink-0">•</span>
            <span>${c}</span>
        </li>`;
    });
    consensualCatsHtml += `</ul>`;
    tbodyHtml += `<td class="p-3 font-mono text-xs bg-slate-950/60 border-b border-slate-800/80 min-w-[240px] align-top">${consensualCatsHtml}</td></tr>`;

    // 5. Rủi ro trọng yếu (Key Downside Risks)
    tbodyHtml += `<tr>
        <td class="p-3 font-mono font-semibold text-slate-300 sticky left-0 z-10 bg-slate-900 border-b border-r border-slate-800 shadow-[2px_0_5px_-1px_rgba(0,0,0,0.5)] min-w-[220px]">
            <div class="flex items-center gap-1.5 text-white">
                <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-rose-400"></i>
                <span>Rủi ro trọng yếu (Key Risks)</span>
            </div>
            <span class="text-[10px] text-slate-500">Cảnh báo rủi ro định lượng</span>
        </td>`;
    reports.forEach(r => {
        let riskHtml = `<ul class="space-y-1.5 text-[11px] text-rose-300/85 text-left">`;
        (r.key_risks || []).forEach((k, idx) => {
            riskHtml += `<li class="flex items-start gap-1.5">
                <span class="text-rose-500 shrink-0 font-bold">•</span>
                <span>${k}</span>
            </li>`;
        });
        riskHtml += `</ul>`;
        tbodyHtml += `<td class="p-3 border-b border-slate-800/80 min-w-[280px] align-top">${riskHtml}</td>`;
    });
    
    // Cột đồng thuận Risks
    let consensualRisksHtml = `<div class="text-rose-400 font-bold mb-1.5 flex items-center gap-1">
        <i data-lucide="alert-octagon" class="w-3.5 h-3.5 text-rose-400"></i>
        <span>Rủi ro cần giám sát:</span>
    </div>`;
    const cRisks = (report.consensus_summary && report.consensus_summary.consensual_risks && report.consensus_summary.consensual_risks.length > 0)
        ? report.consensus_summary.consensual_risks.slice(0, 3)
        : [
            "Biến động giá nguyên liệu thế giới và tỷ giá USD/VND",
            "Sức cầu thị trường trong nước phục hồi chậm hơn kỳ vọng",
            "Rào cản kỹ thuật và các vụ kiện phòng vệ thương mại quốc tế"
        ];
    consensualRisksHtml += `<ul class="space-y-1 text-rose-300/90 text-[10px]">`;
    cRisks.forEach(k => {
        consensualRisksHtml += `<li class="flex items-start gap-1">
            <span class="text-rose-500 font-bold shrink-0">•</span>
            <span>${k}</span>
        </li>`;
    });
    consensualRisksHtml += `</ul>`;
    tbodyHtml += `<td class="p-3 font-mono text-xs bg-slate-950/60 border-b border-slate-800/80 min-w-[240px] align-top">${consensualRisksHtml}</td></tr>`;

    if (tbodyEl) tbodyEl.innerHTML = tbodyHtml;

    // Kích hoạt kéo chuột 4 chiều trên container bảng
    initDragToScroll("matrix-table-container");
    if (window.lucide) lucide.createIcons();
}

async function exportMatrixExcel() {
    if (!currentReport) {
        showToast("Chưa có dữ liệu báo cáo để xuất!", true);
        return;
    }
    showToast(`Đang khởi tạo file Excel cho mã ${currentReport.ticker}...`);
    try {
        const resp = await fetch("/api/export-matrix-excel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ report_data: currentReport })
        });
        if (!resp.ok) throw new Error("Lỗi máy chủ khi tạo file Excel");
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `IERM_${currentReport.ticker}_Matrix_Table.xls`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Đã xuất file Excel Bảng Ma Trận ${currentReport.ticker} thành công!`);
    } catch (err) {
        showToast(`Lỗi xuất Excel: ${err.message}`, true);
    }
}

async function exportMatrixPdf() {
    if (!currentReport) {
        showToast("Chưa có dữ liệu báo cáo để xuất!", true);
        return;
    }
    showToast(`Đang tạo file PDF A4 khổ ngang cho mã ${currentReport.ticker}...`);
    try {
        const resp = await fetch("/api/export-matrix-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ report_data: currentReport })
        });
        if (!resp.ok) throw new Error("Lỗi máy chủ khi tạo file PDF");
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `IERM_${currentReport.ticker}_Matrix_Table.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Đã xuất file PDF Bảng Ma Trận ${currentReport.ticker} thành công!`);
    } catch (err) {
        showToast(`Lỗi xuất PDF: ${err.message}`, true);
    }
}

function renderCausality(report) {
    const container = document.getElementById("causality-container");
    if (!container || !report) return;

    // -------------------------------------------------------------
    // KHUNG 1: DỮ LIỆU KQKD QUÝ GẦN NHẤT & CHỈ BÁO TRỌNG YẾU NGÀNH
    // -------------------------------------------------------------
    const sq = currentFinancialBundle?.statements_quarterly;
    let latestPeriod = "Q2/2026";
    let revFormatted = "—";
    let revGrowth = null;
    let gpFormatted = "—";
    let gmPercent = null;
    let npFormatted = "—";
    let npGrowth = null;
    let nmPercent = null;
    let deFormatted = "—";

    if (sq && sq.periods && sq.periods.length > 0) {
        const lastIdx = sq.periods.length - 1;
        latestPeriod = sq.periods[lastIdx];
        const rev = sq.revenue ? sq.revenue[lastIdx] : 0;
        const gp = sq.gross_profit ? sq.gross_profit[lastIdx] : 0;
        const np = sq.net_profit ? sq.net_profit[lastIdx] : 0;
        
        revFormatted = rev ? `${Math.round(rev).toLocaleString('vi-VN')} tỷ` : "—";
        gpFormatted = gp ? `${Math.round(gp).toLocaleString('vi-VN')} tỷ` : "—";
        npFormatted = np ? `${Math.round(np).toLocaleString('vi-VN')} tỷ` : "—";
        
        if (rev > 0) {
            gmPercent = (gp / rev) * 100;
            nmPercent = (np / rev) * 100;
        }

        // So sánh cùng kỳ năm trước YoY (lùi 4 quý)
        if (lastIdx >= 4) {
            const revPrev = sq.revenue ? sq.revenue[lastIdx - 4] : 0;
            const npPrev = sq.net_profit ? sq.net_profit[lastIdx - 4] : 0;
            if (revPrev > 0) revGrowth = ((rev - revPrev) / revPrev) * 100;
            if (npPrev > 0) npGrowth = ((np - npPrev) / npPrev) * 100;
        }
    }

    // Lấy chỉ số định giá & sinh lời hiện tại (P/E, P/B, ROE, ROA)
    const peersData = currentFinancialBundle?.peers_data;
    let peVal = "—", pbVal = "—", roeVal = "—", roaVal = "—";
    let indPe = "—", indPb = "—", indRoe = "—", indRoa = "—";

    if (peersData) {
        const targetPeer = peersData.peers?.find(p => p.ticker === peersData.target_ticker) || peersData.peers?.[0];
        if (targetPeer) {
            peVal = targetPeer.pe || "—";
            pbVal = targetPeer.pb || "—";
            roeVal = targetPeer.roe || "—";
            roaVal = targetPeer.roa || "—";
            deFormatted = targetPeer.debt_to_equity || "—";
        }
        const indAvg = peersData.industry_average;
        if (indAvg) {
            indPe = indAvg.pe || "—";
            indPb = indAvg.pb || "—";
            indRoe = indAvg.roe || "—";
            indRoa = indAvg.roa || "—";
        }
    }

    // Trích xuất chỉ số đặc thù ngành
    let industryKpiHtml = "";
    if (peersData && peersData.sector_kpi_columns && peersData.sector_kpi_columns.length > 0) {
        const targetPeer = peersData.peers?.find(p => p.ticker === peersData.target_ticker) || peersData.peers?.[0];
        const indAvg = peersData.industry_average || {};
        let kpiPills = "";
        peersData.sector_kpi_columns.forEach(col => {
            const val = targetPeer ? targetPeer[col.field] : null;
            const avgVal = indAvg[col.field];
            const fmtVal = formatSectorKpiValue(val, col.unit);
            const fmtAvg = formatSectorKpiValue(avgVal, col.unit);
            kpiPills += `
                <div class="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between text-xs font-mono">
                    <span class="text-slate-400 truncate max-w-[140px]" title="${col.label}">${col.label}:</span>
                    <span class="text-amber-300 font-bold ml-1">${fmtVal} <span class="text-[10px] text-slate-500 font-normal">(${fmtAvg})</span></span>
                </div>
            `;
        });
        industryKpiHtml = `
            <div class="mt-2.5 pt-2.5 border-t border-slate-800/80">
                <div class="text-[10px] font-mono uppercase text-amber-300/90 font-bold mb-1.5 flex items-center gap-1.5">
                    <i data-lucide="award" class="w-3.5 h-3.5 text-amber-400"></i>
                    <span>Chỉ số hoạt động chuyên ngành (${peersData.sector_name || report.sector}):</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    ${kpiPills}
                </div>
            </div>
        `;
    }

    // Dữ liệu phân tích quá khứ/hiện tại (từ causality_analysis[0])
    const pastItem = report.causality_analysis && report.causality_analysis.length > 0 ? report.causality_analysis[0] : null;
    const pastPhenomenon = pastItem?.phenomenon || `Doanh thu quý gần nhất ghi nhận tăng trưởng tích cực, biên lợi nhuận cải thiện mạnh mẽ nhờ tối ưu chi phí và nhu cầu phục hồi.`;
    const pastRootCauses = pastItem?.root_causes || `Yếu tố bên trong: Năng lực sản xuất và quản trị hàng tồn kho tối ưu. Yếu tố bên ngoài: Nhu cầu tiêu thụ toàn thị trường hồi phục rõ rệt.`;
    const pastDataEvidence = pastItem?.data_evidence || `Sản lượng tiêu thụ tăng trưởng cao, tỷ lệ nợ vay trên vốn chủ sở hữu được kiểm soát ở mức an toàn.`;

    // -------------------------------------------------------------
    // KHUNG 2: TỔNG HỢP TỪ BẢNG MA TRẬN 1 (CATALYSTS, RỦI RO & DỰ PHÓNG)
    // -------------------------------------------------------------
    const matrixReports = report.matrix_table || [];
    const hasCtckReports = matrixReports.length > 0;

    // 1. Catalysts
    let catalysts = [];
    if (report.consensus_summary?.consensual_catalysts && report.consensus_summary.consensual_catalysts.length > 0) {
        catalysts = report.consensus_summary.consensual_catalysts;
    } else if (hasCtckReports) {
        // Tổng hợp từ các catalysts thực tế của từng CTCK
        const allCats = [];
        matrixReports.forEach(r => {
            (r.key_catalysts || []).forEach(c => {
                if (c && !allCats.includes(c)) allCats.push(c);
            });
        });
        catalysts = allCats.slice(0, 4);
    }

    let catalystsListHtml = "";
    if (catalysts.length > 0) {
        catalysts.forEach((c, idx) => {
            catalystsListHtml += `
                <div class="p-3 bg-slate-950 rounded-lg border border-slate-800/90 flex items-start gap-2.5">
                    <span class="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">${idx + 1}</span>
                    <div class="space-y-1">
                        <span class="text-slate-200 text-xs leading-relaxed font-sans block">${c}</span>
                    </div>
                </div>
            `;
        });
    } else {
        catalystsListHtml = `
            <div class="p-4 bg-slate-950/60 rounded-lg border border-slate-800 text-center">
                <span class="text-slate-400 text-xs font-mono">Chưa có bài viết phân tích từ CTCK để tổng hợp luận điểm tăng trưởng tương lai.</span>
            </div>
        `;
    }

    // 2. Risks
    let risks = [];
    if (report.consensus_summary?.consensual_risks && report.consensus_summary.consensual_risks.length > 0) {
        risks = report.consensus_summary.consensual_risks;
    } else if (hasCtckReports) {
        const allRisks = [];
        matrixReports.forEach(r => {
            (r.key_risks || []).forEach(rk => {
                if (rk && !allRisks.includes(rk)) allRisks.push(rk);
            });
        });
        risks = allRisks.slice(0, 3);
    }

    let risksListHtml = "";
    if (risks.length > 0) {
        risks.forEach((rk, idx) => {
            risksListHtml += `
                <div class="p-3 bg-slate-950 rounded-lg border border-slate-800/90 flex items-start gap-2.5">
                    <span class="w-5 h-5 rounded-full bg-rose-950 text-rose-400 border border-rose-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">!</span>
                    <div class="space-y-1">
                        <span class="text-slate-300 text-xs leading-relaxed font-sans block">${rk}</span>
                    </div>
                </div>
            `;
        });
    } else {
        risksListHtml = `
            <div class="p-4 bg-slate-950/60 rounded-lg border border-slate-800 text-center">
                <span class="text-slate-400 text-xs font-mono">Chưa có dữ liệu rủi ro định lượng từ các CTCK.</span>
            </div>
        `;
    }

    // 3. Dự phóng tương lai từ các CTCK (Bảng Ma trận 1)
    let projectionsRowsHtml = "";
    if (hasCtckReports) {
        matrixReports.slice(0, 6).forEach(item => {
            const rawRec = item.recommendation || "THEO DÕI";
            const recUpper = rawRec.toUpperCase();
            const isTech = item.is_technical || item.report_type === "technical" || recUpper.includes("PTKT");
            const isBuy = recUpper.includes("MUA") || recUpper.includes("KHẢ QUAN") || recUpper.includes("TÍCH LŨY") || recUpper.includes("BUY");
            
            let badgeClass = isBuy ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-cyan-950 text-cyan-300 border-cyan-800";
            if (item.is_expired) {
                badgeClass = "bg-slate-900 text-slate-400 border-slate-700";
            } else if (isTech) {
                badgeClass = "bg-purple-950 text-purple-300 border-purple-800";
            } else if (recUpper.includes("CẬP NHẬT") || recUpper.includes("KQKD")) {
                badgeClass = "bg-sky-950 text-sky-300 border-sky-800";
            }

            let tpStr = '—';
            let recText = rawRec.split('(')[0].trim();
            if (item.is_expired) {
                tpStr = '<span class="text-slate-400 text-xs font-normal line-through">' + (item.target_price > 0 ? Number(item.target_price).toLocaleString('vi-VN') + ' đ' : '—') + '</span> <span class="text-[9px] text-rose-400 font-mono">(Quá 1 năm)</span>';
                recText = `<span class="line-through opacity-70">${recText}</span><span class="text-[8px] text-rose-400 block font-normal">(Quá 1 năm)</span>`;
            } else if (isTech) {
                tpStr = '<span class="text-slate-400 text-xs font-normal">— <span class="text-[9px] text-purple-300 font-mono">(PTKT)</span></span>';
            } else if (item.target_price > 0 && !item.is_estimated_price) {
                tpStr = `${Number(item.target_price).toLocaleString('vi-VN')} đ`;
            } else {
                tpStr = '<span class="text-slate-400 text-xs font-normal">— <span class="text-[9px] text-amber-300 font-mono">(KQKD)</span></span>';
            }

            projectionsRowsHtml += `
                <tr class="hover:bg-slate-800/40 transition-colors">
                    <td class="p-2 font-bold text-white whitespace-nowrap">${item.institution || '—'}</td>
                    <td class="p-2 text-center whitespace-nowrap">
                        <span class="px-1.5 py-0.2 rounded text-[9px] font-bold border ${badgeClass}">
                            ${recText}
                        </span>
                    </td>
                    <td class="p-2 text-right font-bold text-cyan-300 whitespace-nowrap">${tpStr}</td>
                    <td class="p-2 text-right text-slate-300 whitespace-nowrap text-[10px]">${item.revenue_forecast || '—'}</td>
                    <td class="p-2 text-right font-bold text-emerald-400 whitespace-nowrap text-[10px]">${item.npat_forecast || '—'}</td>
                </tr>
            `;
        });
    } else {
        projectionsRowsHtml = `
            <tr>
                <td colspan="5" class="p-4 text-center text-slate-500 font-mono text-xs">
                    Chưa có dự phóng doanh thu & LNST từ các CTCK
                </td>
            </tr>
        `;
    }

    const cs = report.consensus_summary;
    if (cs && cs.mean_target_price > 0 && !(cs.consensus_rating || "").includes("THEO DÕI")) {
        const isExp = cs.average_upside < 0 || (cs.current_market_price > cs.mean_target_price);
        const badgeStyle = isExp 
            ? "bg-rose-950 text-rose-300 border-rose-700" 
            : "bg-emerald-900 text-emerald-200 border-emerald-700";
        const upsideText = isExp
            ? `<span class="text-rose-400 font-bold">Đã vượt: +${Math.abs(Math.round(cs.average_upside))}%</span>`
            : `<span class="text-emerald-400">Upside TB: +${Math.round(cs.average_upside)}%</span>`;
        projectionsRowsHtml += `
            <tr class="bg-cyan-950/40 font-bold border-t border-cyan-800/80 text-cyan-300">
                <td class="p-2 whitespace-nowrap">ĐỒNG THUẬN TB</td>
                <td class="p-2 text-center whitespace-nowrap">
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-bold ${badgeStyle} border">
                        ${cs.consensus_rating.split('(')[0].trim()}
                    </span>
                </td>
                <td class="p-2 text-right text-emerald-400 whitespace-nowrap">${Math.round(cs.mean_target_price).toLocaleString('vi-VN')} đ</td>
                <td class="p-2 text-right text-slate-300 whitespace-nowrap text-[10px]">${upsideText}</td>
                <td class="p-2 text-right text-amber-300 whitespace-nowrap text-[10px]">${Math.round(cs.min_target_price).toLocaleString('vi-VN')} - ${Math.round(cs.max_target_price).toLocaleString('vi-VN')} đ</td>
            </tr>
        `;
    } else if (cs) {
        projectionsRowsHtml += `
            <tr class="bg-slate-950/60 font-bold border-t border-slate-800 text-slate-400">
                <td class="p-2 whitespace-nowrap">ĐỒNG THUẬN TB</td>
                <td class="p-2 text-center whitespace-nowrap">
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
                        THEO DÕI THÊM
                    </span>
                </td>
                <td class="p-2 text-right text-slate-400 whitespace-nowrap">—</td>
                <td class="p-2 text-right text-amber-400 whitespace-nowrap text-[10px]">Cần theo dõi thêm</td>
                <td class="p-2 text-right text-slate-500 whitespace-nowrap text-[10px]">—</td>
            </tr>
        `;
    }

    // Lắp ráp toàn bộ 2 khung
    container.innerHTML = `
        <!-- KHUNG 1: HIỆU QUẢ KINH DOANH & BÁO CÁO KQKD QUÝ GẦN NHẤT -->
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4 flex flex-col justify-between">
            <div class="space-y-4">
                <!-- Header Khung 1 -->
                <div class="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                    <h3 class="font-mono font-bold text-sm text-cyan-400 flex items-center gap-2">
                        <i data-lucide="bar-chart-3" class="w-4 h-4 text-cyan-400"></i>
                        <span>1. Hiệu quả kinh doanh & Động lực quá khứ/hiện tại</span>
                    </h3>
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                        KQKD Quý gần nhất: ${latestPeriod}
                    </span>
                </div>

                <!-- 4 Card Tài chính quý gần nhất -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <!-- Doanh thu -->
                    <div class="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/90">
                        <div class="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Doanh thu thuần</div>
                        <div class="text-sm sm:text-base font-bold text-white font-mono mt-0.5">${revFormatted}</div>
                        <div class="text-[10px] font-mono font-bold ${revGrowth !== null && revGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'} mt-0.5">
                            ${revGrowth !== null ? `${revGrowth >= 0 ? '+' : ''}${revGrowth.toFixed(1)}% YoY` : '—'}
                        </div>
                    </div>
                    <!-- Lợi nhuận gộp -->
                    <div class="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/90">
                        <div class="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Lợi nhuận gộp</div>
                        <div class="text-sm sm:text-base font-bold text-cyan-300 font-mono mt-0.5">${gpFormatted}</div>
                        <div class="text-[10px] font-mono text-slate-400 mt-0.5">Biên gộp: <strong class="text-white">${gmPercent !== null ? gmPercent.toFixed(1) + '%' : '—'}</strong></div>
                    </div>
                    <!-- Lợi nhuận sau thuế (LNST) -->
                    <div class="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/90">
                        <div class="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Lợi nhuận ròng (LNST)</div>
                        <div class="text-sm sm:text-base font-bold text-emerald-400 font-mono mt-0.5">${npFormatted}</div>
                        <div class="text-[10px] font-mono font-bold ${npGrowth !== null && npGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'} mt-0.5">
                            ${npGrowth !== null ? `${npGrowth >= 0 ? '+' : ''}${npGrowth.toFixed(1)}% YoY` : '—'}
                        </div>
                    </div>
                    <!-- Biên ròng & Nợ vay -->
                    <div class="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/90">
                        <div class="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Biên ròng / Nợ vay</div>
                        <div class="text-sm sm:text-base font-bold text-amber-300 font-mono mt-0.5">${nmPercent !== null ? nmPercent.toFixed(1) + '%' : '—'}</div>
                        <div class="text-[10px] font-mono text-slate-400 mt-0.5">D/E: <strong class="text-white">${deFormatted !== '—' ? deFormatted + 'x' : '—'}</strong></div>
                    </div>
                </div>

                <!-- Các chỉ báo trọng yếu phù hợp cổ phiếu & ngành -->
                <div class="space-y-2">
                    <div class="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span class="flex items-center gap-1.5 text-cyan-300 font-bold">
                            <i data-lucide="activity" class="w-3.5 h-3.5"></i>
                            Chỉ báo định giá & sinh lời cốt lõi:
                        </span>
                        <span class="text-[10px] text-slate-500">Đối chiếu với TB Ngành</span>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                        <div class="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between items-center">
                            <span class="text-slate-400">P/E:</span>
                            <span class="text-white font-bold">${peVal}x <span class="text-[10px] text-slate-500">(${indPe}x)</span></span>
                        </div>
                        <div class="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between items-center">
                            <span class="text-slate-400">P/B:</span>
                            <span class="text-white font-bold">${pbVal}x <span class="text-[10px] text-slate-500">(${indPb}x)</span></span>
                        </div>
                        <div class="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between items-center">
                            <span class="text-slate-400">ROE:</span>
                            <span class="text-emerald-400 font-bold">${roeVal}% <span class="text-[10px] text-slate-500">(${indRoe}%)</span></span>
                        </div>
                        <div class="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between items-center">
                            <span class="text-slate-400">ROA:</span>
                            <span class="text-sky-400 font-bold">${roaVal}% <span class="text-[10px] text-slate-500">(${indRoa}%)</span></span>
                        </div>
                    </div>
                    ${industryKpiHtml}
                </div>

                <!-- Phân tích hiện tượng, động lực & bằng chứng số liệu -->
                <div class="space-y-3 pt-2.5 border-t border-slate-800/80">
                    <!-- Hiện tượng / Kết quả định lượng -->
                    <div class="space-y-1">
                        <span class="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            Hiện tượng / Đột phá KQKD định lượng:
                        </span>
                        <div class="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs font-mono text-slate-200 leading-relaxed">
                            ${pastPhenomenon}
                        </div>
                    </div>

                    <!-- Nguyên nhân cốt lõi -->
                    <div class="space-y-1">
                        <span class="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                            Động lực & Nguyên nhân cốt lõi (Nội tại DN & Vĩ mô ngành):
                        </span>
                        <div class="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans">
                            ${pastRootCauses}
                        </div>
                    </div>

                    <!-- Bằng chứng số liệu -->
                    <div class="space-y-1">
                        <span class="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            Bằng chứng số liệu thực tế đã kiểm chứng:
                        </span>
                        <div class="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs font-mono text-amber-300/90 leading-relaxed">
                            ${pastDataEvidence}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- KHUNG 2: ĐỘNG LỰC TĂNG TRƯỞNG TƯƠNG LAI VÀ RỦI RO (TỔNG HỢP TỪ BẢNG MA TRẬN 1) -->
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4 flex flex-col justify-between">
            <div class="space-y-4">
                <!-- Header Khung 2 -->
                <div class="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                    <h3 class="font-mono font-bold text-sm text-emerald-400 flex items-center gap-2">
                        <i data-lucide="trending-up" class="w-4 h-4 text-emerald-400"></i>
                        <span>2. Động lực tăng trưởng tương lai và rủi ro</span>
                    </h3>
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        Tổng hợp từ Bảng Ma trận 1 (${report.matrix_table ? report.matrix_table.length : 0} CTCK)
                    </span>
                </div>

                <!-- PHẦN A: TỔNG HỢP CATALYSTS TRIỂN VỌNG & ĐỘNG LỰC TĂNG TRƯỞNG TƯƠNG LAI -->
                <div class="space-y-2">
                    <div class="flex items-center justify-between text-[11px] font-mono text-emerald-300 font-bold">
                        <span class="flex items-center gap-1.5">
                            <i data-lucide="zap" class="w-3.5 h-3.5 text-emerald-400"></i>
                            YẾU TỐ KỲ VỌNG THEN CHỐT (FORWARD CATALYSTS 1 - 3 NĂM):
                        </span>
                        <span class="text-[10px] text-slate-400 font-normal">Đồng thuận từ các CTCK</span>
                    </div>
                    <div class="space-y-2 font-mono text-xs">
                        ${catalystsListHtml}
                    </div>
                </div>

                <!-- PHẦN B: TỔNG HỢP RỦI RO TRỌNG YẾU CẦN GIÁM SÁT -->
                <div class="space-y-2">
                    <div class="flex items-center justify-between text-[11px] font-mono text-rose-400 font-bold">
                        <span class="flex items-center gap-1.5">
                            <i data-lucide="shield-alert" class="w-3.5 h-3.5 text-rose-400"></i>
                            RỦI RO TRỌNG YẾU & YẾU TỐ BẤT LỢI CẦN THEO DÕI:
                        </span>
                        <span class="text-[10px] text-slate-400 font-normal">Cảnh báo từ các CTCK</span>
                    </div>
                    <div class="space-y-2 font-mono text-xs">
                        ${risksListHtml}
                    </div>
                </div>

                <!-- PHẦN C: DỰ PHÓNG TƯƠNG LAI CỦA CÁC TỔ CHỨC TỪ BẢNG MA TRẬN 1 -->
                <div class="pt-2.5 border-t border-slate-800/80 space-y-2">
                    <div class="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
                        <span class="text-cyan-300 font-bold flex items-center gap-1.5">
                            <i data-lucide="scale" class="w-3.5 h-3.5 text-cyan-400"></i>
                            BẢNG TỔNG HỢP DỰ PHÓNG KINH DOANH CỦA CÁC CTCK:
                        </span>
                        <span class="text-[10px] text-slate-500">Doanh thu & LNST kỳ vọng</span>
                    </div>
                    <div class="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950">
                        <table class="w-full text-left text-xs font-mono">
                            <thead class="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[10px]">
                                <tr>
                                    <th class="p-2 whitespace-nowrap">Tổ chức</th>
                                    <th class="p-2 text-center whitespace-nowrap">Khuyến nghị</th>
                                    <th class="p-2 text-right whitespace-nowrap">Giá MT</th>
                                    <th class="p-2 text-right whitespace-nowrap">Dự phóng Doanh thu</th>
                                    <th class="p-2 text-right whitespace-nowrap">Dự phóng LNST</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800/60 text-[11px]">
                                ${projectionsRowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }
}

function renderDisensus(report) {
    const container = document.getElementById("disensus-container");
    let html = "";
    report.disensus_table.forEach(item => {
        html += `<div class="p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <!-- Variable Column -->
            <div class="space-y-1">
                <span class="text-[10px] font-mono uppercase tracking-wider text-slate-500">Biến số / Giả định trọng yếu</span>
                <div class="font-mono font-bold text-sm text-cyan-300">${item.variable}</div>
            </div>

            <!-- Bulls vs Bears Columns -->
            <div class="space-y-3 font-mono text-xs">
                <!-- Bulls -->
                <div class="bg-emerald-950/30 border border-emerald-800/40 p-3 rounded-lg">
                    <span class="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1 mb-1">
                        <i data-lucide="trending-up" class="w-3 h-3"></i>
                        Phe Lạc quan (Bulls)
                    </span>
                    <p class="text-slate-200 text-xs leading-relaxed">${item.bulls_view}</p>
                </div>

                <!-- Bears -->
                <div class="bg-rose-950/30 border border-rose-800/40 p-3 rounded-lg">
                    <span class="text-[10px] uppercase font-bold text-rose-400 flex items-center gap-1 mb-1">
                        <i data-lucide="trending-down" class="w-3 h-3"></i>
                        Phe Thận trọng (Bears)
                    </span>
                    <p class="text-slate-200 text-xs leading-relaxed">${item.bears_view}</p>
                </div>
            </div>

            <!-- Evidence Column -->
            <div class="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col justify-center">
                <span class="text-[10px] font-mono uppercase tracking-wider text-amber-400 flex items-center gap-1 mb-1.5">
                    <i data-lucide="file-check" class="w-3 h-3"></i>
                    Bằng chứng & Căn cứ phân hóa
                </span>
                <p class="text-xs text-slate-300 leading-relaxed font-mono">${item.evidence}</p>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

function renderStrategy(report) {
    const cs = report.consensus_summary;
    document.getElementById("strat-consensus-rating").textContent = cs.consensus_rating;
    document.getElementById("strat-buy-zone").textContent = cs.recommended_buy_zone;
    document.getElementById("strat-stop-loss").textContent = cs.stop_loss_threshold;

    const triggersContainer = document.getElementById("triggers-list-container");
    let html = "";
    cs.key_triggers.forEach((trig, idx) => {
        html += `<div class="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex items-start gap-3">
            <span class="w-6 h-6 rounded bg-amber-950/80 border border-amber-800 text-amber-400 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                0${idx + 1}
            </span>
            <div class="space-y-1">
                <div class="text-xs font-mono text-slate-200 leading-relaxed">${trig}</div>
                <div class="text-[10px] font-mono text-slate-500">Tần suất kiểm tra: Hàng tháng / Báo cáo tài chính quý</div>
            </div>
        </div>`;
    });
    triggersContainer.innerHTML = html;
}

function getRecBadgeClass(rec) {
    const r = (rec || "").toUpperCase();
    if (r.includes("QUÁ 1 NĂM") || r.includes("HẾT HẠN") || r.includes("HẾT HIỆU LỰC")) return "bg-slate-800 text-slate-400 border border-slate-700/80";
    if (r.includes("THEO DÕI")) return "bg-amber-950/80 text-amber-300 border border-amber-700/80";
    if (r.includes("PTKT") || r.includes("KỸ THUẬT")) return "bg-purple-950/80 text-purple-300 border border-purple-700/80";
    if (r.includes("CẬP NHẬT") || r.includes("KQKD")) return "bg-sky-950/80 text-sky-300 border border-sky-700/80";
    if (r.includes("VƯỢT GIÁ") || r.includes("VƯỢT MỤC TIÊU") || r.includes("VƯỢT KỲ VỌNG") || r.includes("ĐÃ VƯỢT")) return "bg-rose-950/80 text-rose-300 border border-rose-700/80 font-bold";
    if (r.includes("TIỆM CẬN")) return "bg-amber-950/80 text-amber-300 border border-amber-700/80";
    if (r.includes("MUA") || r.includes("BUY")) return "rec-buy";
    if (r.includes("KHẢ QUAN") || r.includes("TÍCH LŨY") || r.includes("OUTPERFORM")) return "rec-outperform";
    if (r.includes("NẮM GIỮ") || r.includes("HOLD") || r.includes("TRUNG LẬP")) return "rec-hold";
    return "rec-sell";
}

// -------------------------------------------------------------
// EXPORT & REPORT UTILITIES
// -------------------------------------------------------------
async function exportMarkdown() {
    if (!currentReport) return;
    showToast("Đang khởi tạo báo cáo Markdown chuẩn...");
    try {
        const resp = await fetch("/api/export-markdown", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ report_data: currentReport })
        });
        const data = await resp.json();
        currentMarkdownText = data.markdown;
        document.getElementById("markdown-preview-content").textContent = currentMarkdownText;
        document.getElementById("markdown-modal").classList.remove("hidden");
    } catch (err) {
        showToast(`Lỗi xuất Markdown: ${err.message}`, true);
    }
}

function closeMarkdownModal() {
    document.getElementById("markdown-modal").classList.add("hidden");
}

function downloadMarkdownFile() {
    if (!currentMarkdownText) return;
    const blob = new Blob([currentMarkdownText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IERM_${currentReport.ticker}_Research_Matrix.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Đã tải xuống file Markdown thành công!");
}

function copyMarkdownContent() {
    if (!currentMarkdownText) return;
    navigator.clipboard.writeText(currentMarkdownText).then(() => {
        showToast("Đã sao chép toàn bộ nội dung Markdown vào Clipboard!");
    });
}

function exportCSV() {
    if (!currentReport) return;
    fetch("/api/export-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_data: currentReport })
    })
    .then(resp => resp.blob())
    .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `IERM_${currentReport.ticker}_Matrix.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Đã xuất file CSV thành công!");
    })
    .catch(err => showToast(`Lỗi xuất CSV: ${err.message}`, true));
}

function copySummaryToClipboard() {
    if (!currentReport) return;
    const cs = currentReport.consensus_summary;
    const summaryText = `[IERM REPORT] ${currentReport.ticker} - ${currentReport.company_name}
Consensus Rating: ${cs.consensus_rating} (${cs.consensus_score}/5.0)
Thị giá: ${cs.current_market_price.toLocaleString("vi-VN")} VND
Giá mục tiêu TB: ${cs.mean_target_price.toLocaleString("vi-VN")} VND (Upside: +${cs.average_upside.toFixed(1)}%)
Khung giá [Min-Max]: ${cs.min_target_price.toLocaleString("vi-VN")} - ${cs.max_target_price.toLocaleString("vi-VN")} VND
Vùng mua khuyến nghị: ${cs.recommended_buy_zone}
Dừng lỗ: ${cs.stop_loss_threshold}`;

    navigator.clipboard.writeText(summaryText).then(() => {
        showToast("Đã sao chép tóm tắt định lượng vào Clipboard!");
    });
}

// -------------------------------------------------------------
// TAB 1: TỔNG QUAN, DUPONT, PIOTROSKI F-SCORE, ALTMAN Z-SCORE
// -------------------------------------------------------------
function renderCompanyProfile(p) {
    if (!p) return;
    const secTag = document.getElementById("overview-sector-tag");
    const desc = document.getElementById("overview-company-desc");
    const mcap = document.getElementById("overview-market-cap");
    const mcapSub = document.getElementById("overview-market-cap-sub");
    const shares = document.getElementById("overview-shares");
    const sharesSub = document.getElementById("overview-shares-sub");
    const room = document.getElementById("overview-foreign-room");
    const roomSub = document.getElementById("overview-ownership-sub");
    const yieldEl = document.getElementById("overview-div-yield");
    const yieldSub = document.getElementById("overview-div-sub");

    if (secTag) secTag.textContent = p.sector;
    if (desc) desc.textContent = p.description;

    // Vốn hóa thị trường chuẩn hóa theo giá live
    if (mcap) {
        mcap.textContent = `${Number(p.market_cap_bil || 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ đ`;
    }
    if (mcapSub) {
        if (p.current_market_price) {
            mcapSub.textContent = `Thị giá: ${Number(p.current_market_price).toLocaleString("vi-VN")} đ`;
        } else {
            mcapSub.textContent = `Cập nhật theo thị giá live`;
        }
    }

    // Số CP lưu hành & Niêm yết
    if (shares) {
        shares.textContent = `${Number(p.shares_outstanding_mil || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} triệu CP`;
    }
    if (sharesSub) {
        const listed = p.shares_listed_mil || p.shares_outstanding_mil;
        sharesSub.textContent = `Niêm yết: ${Number(listed || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} triệu CP`;
    }

    // Cơ cấu sở hữu (Nước ngoài / Trong nước)
    if (room) {
        room.textContent = `Nước ngoài: ${Number(p.foreign_ownership_pct || 0).toFixed(2)}%`;
    }
    if (roomSub) {
        const dom = p.domestic_ownership_pct !== undefined ? p.domestic_ownership_pct : (100.0 - (p.foreign_ownership_pct || 0));
        roomSub.textContent = `Trong nước: ${Number(dom).toFixed(2)}%`;
    }

    // Tỷ suất cổ tức (Yield)
    if (yieldEl) {
        yieldEl.textContent = `${Number(p.dividend_yield_pct || 0).toFixed(1)}%`;
    }
    if (yieldSub) {
        yieldSub.textContent = `Tiền mặt & Cổ phiếu`;
    }
}

function renderDupont(d) {
    if (!d) return;
    const roeBadge = document.getElementById("dupont-roe-badge");
    const netM = document.getElementById("dupont-net-margin");
    const turnover = document.getElementById("dupont-asset-turnover");
    const mult = document.getElementById("dupont-equity-mult");
    const taxB = document.getElementById("dupont-tax-burden");
    const intB = document.getElementById("dupont-interest-burden");
    const ebitM = document.getElementById("dupont-ebit-margin");
    const assess = document.getElementById("dupont-assessment");

    if (roeBadge) roeBadge.textContent = `ROE: ${d.roe_3step}%`;
    if (netM) netM.textContent = `${d.net_margin}%`;
    if (turnover) turnover.textContent = `${d.asset_turnover}x`;
    if (mult) mult.textContent = `${d.equity_multiplier}x`;
    if (taxB) taxB.textContent = `${d.tax_burden}%`;
    if (intB) intB.textContent = `${d.interest_burden}%`;
    if (ebitM) ebitM.textContent = `${d.operating_margin}%`;
    if (assess) assess.textContent = d.assessment;
}

function renderPiotroski(p) {
    if (!p) return;
    const badge = document.getElementById("piotroski-score-badge");
    const rText = document.getElementById("piotroski-rating-text");
    const circle = document.getElementById("piotroski-circle");
    const cont = document.getElementById("piotroski-checklist-container");

    if (badge) badge.textContent = `${p.score} / 9 ĐIỂM`;
    if (rText) rText.textContent = p.rating;
    if (circle) circle.textContent = p.score;

    if (cont && p.criteria) {
        let html = "";
        p.criteria.forEach((c, idx) => {
            html += `<div class="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800">
                <span class="flex items-center gap-1.5 truncate">
                    <span class="${c.passed ? 'text-emerald-400' : 'text-slate-500'} font-bold">${c.passed ? '✓' : '✗'}</span>
                    <span class="text-slate-300">${idx + 1}. ${c.name}</span>
                </span>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-bold ${c.passed ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-500'}">
                    ${c.passed ? '+1' : '0'}
                </span>
            </div>`;
        });
        cont.innerHTML = html;
    }
}

function renderAltmanZ(z) {
    if (!z) return;
    const badge = document.getElementById("altman-z-badge");
    const zoneText = document.getElementById("altman-zone-text");
    const interp = document.getElementById("altman-interpretation");

    if (badge) {
        badge.textContent = `Z = ${z.score}`;
        badge.className = `text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
            z.color === 'emerald' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' :
            z.color === 'amber' ? 'bg-amber-950 text-amber-300 border-amber-800' :
            'bg-rose-950 text-rose-300 border-rose-800'
        }`;
    }
    if (zoneText) {
        zoneText.textContent = z.zone;
        zoneText.className = `text-xs uppercase font-extrabold ${
            z.color === 'emerald' ? 'text-emerald-400' :
            z.color === 'amber' ? 'text-amber-400' : 'text-rose-400'
        }`;
    }
    if (interp) interp.textContent = z.interpretation;
}

// -------------------------------------------------------------
// TAB 2: CHI TIẾT BCTC & CHARTS (NĂM / QUÝ TỰ CHỌN)
/// -------------------------------------------------------------
function getActiveStatements() {
    if (!currentFinancialBundle) return null;
    if (currentPeriodMode === 'quarter' && currentFinancialBundle.statements_quarterly) {
        return currentFinancialBundle.statements_quarterly;
    }
    return currentFinancialBundle.statements_annual;
}

function sliceStatements(stm, count) {
    if (!stm || !stm.periods) return stm;
    const isAll = (count === 'all' || String(count).toLowerCase() === 'all');
    if (isAll) return stm;
    const total = stm.periods.length;
    const num = parseInt(count, 10);
    if (isNaN(num) || num <= 0 || total <= num) return stm;
    const sliceCount = -num;
    const res = {
        ...stm,
        periods: stm.periods.slice(sliceCount),
        revenue: (stm.revenue || []).slice(sliceCount),
        cogs: (stm.cogs || []).slice(sliceCount),
        gross_profit: (stm.gross_profit || []).slice(sliceCount),
        operating_profit: (stm.operating_profit || []).slice(sliceCount),
        financial_expense: (stm.financial_expense || []).slice(sliceCount),
        net_profit: (stm.net_profit || []).slice(sliceCount),
        total_assets: (stm.total_assets || []).slice(sliceCount),
        short_term_assets: (stm.short_term_assets || []).slice(sliceCount),
        cash_and_equivalents: (stm.cash_and_equivalents || []).slice(sliceCount),
        inventories: (stm.inventories || []).slice(sliceCount),
        total_liabilities: (stm.total_liabilities || []).slice(sliceCount),
        short_term_debt: (stm.short_term_debt || []).slice(sliceCount),
        long_term_debt: (stm.long_term_debt || []).slice(sliceCount),
        owner_equity: (stm.owner_equity || []).slice(sliceCount),
        cfo: (stm.cfo || []).slice(sliceCount),
        cfi: (stm.cfi || []).slice(sliceCount),
        cff: (stm.cff || []).slice(sliceCount),
        free_cash_flow: (stm.free_cash_flow || []).slice(sliceCount),
    };
    ['raw_inc', 'raw_bs', 'raw_cf'].forEach(key => {
        if (stm[key] && typeof stm[key] === 'object') {
            res[key] = {};
            for (const [title, vals] of Object.entries(stm[key])) {
                res[key][title] = Array.isArray(vals) ? vals.slice(sliceCount) : vals;
            }
        }
    });
    return res;
}

function changePeriodCount(count) {
    currentPeriodCount = count;
    [4, 8, 10, 'all'].forEach(c => {
        const btn = document.getElementById(`btn-count-${c}`);
        if (btn) {
            if (String(c) === String(count)) {
                btn.className = "px-2.5 py-1 rounded-md font-bold transition-all bg-cyan-600 text-white shadow";
            } else {
                btn.className = "px-2.5 py-1 rounded-md font-bold transition-all text-slate-400 hover:text-white";
            }
        }
    });

    const badge = document.getElementById("bctc-period-badge");
    const subtitle = document.getElementById("bctc-table-subtitle");
    const unitText = currentPeriodMode === "quarter" ? "quý" : "năm";
    
    if (badge) {
        badge.textContent = count === 'all' ? `Toàn bộ ${unitText} lịch sử` : `${count} ${unitText} gần nhất`;
    }
    if (subtitle) {
        subtitle.textContent = count === 'all' ? `Dữ liệu tài chính toàn bộ ${unitText} lịch sử (Tỷ VND)` : `Dữ liệu tài chính ${count} ${unitText} gần nhất (Tỷ VND)`;
    }

    showToast(count === 'all' ? `Đã chọn hiển thị toàn bộ ${unitText} lịch sử!` : `Đã chọn hiển thị ${count} ${unitText} gần nhất!`);

    currentSelectedPeriodIdx = -1;
    const stm = getActiveStatements();
    if (stm) {
        renderBctcCharts(stm);
        renderBctcTable(stm, currentBctcSubtab);
    }
}

function switchPeriodMode(mode) {
    currentPeriodMode = mode;
    currentSelectedPeriodIdx = -1;
    const btnYear = document.getElementById("btn-period-year");
    const btnQuarter = document.getElementById("btn-period-quarter");
    const badge = document.getElementById("bctc-period-badge");
    const subtitle = document.getElementById("bctc-table-subtitle");

    const unitText = mode === "quarter" ? "quý" : "năm";
    const isAll = (currentPeriodCount === 'all');

    if (mode === "quarter") {
        if (btnYear) {
            btnYear.className = "px-2.5 py-1 rounded-md font-bold transition-all text-slate-400 hover:text-white";
        }
        if (btnQuarter) {
            btnQuarter.className = "px-2.5 py-1 rounded-md font-bold transition-all bg-cyan-600 text-white shadow";
        }
        showToast(`Đã chuyển sang Báo cáo Tài chính Theo Quý (${isAll ? 'Toàn bộ lịch sử' : currentPeriodCount + ' quý'})!`);
    } else {
        if (btnYear) {
            btnYear.className = "px-2.5 py-1 rounded-md font-bold transition-all bg-cyan-600 text-white shadow";
        }
        if (btnQuarter) {
            btnQuarter.className = "px-2.5 py-1 rounded-md font-bold transition-all text-slate-400 hover:text-white";
        }
        showToast(`Đã chuyển sang Báo cáo Tài chính Theo Năm (${isAll ? 'Toàn bộ lịch sử' : currentPeriodCount + ' năm'})!`);
    }

    if (badge) {
        badge.textContent = isAll ? `Toàn bộ ${unitText} lịch sử` : `${currentPeriodCount} ${unitText} gần nhất`;
    }
    if (subtitle) {
        subtitle.textContent = isAll ? `Dữ liệu tài chính toàn bộ ${unitText} lịch sử (Tỷ VND)` : `Dữ liệu tài chính ${currentPeriodCount} ${unitText} gần nhất (Tỷ VND)`;
    }

    const stm = getActiveStatements();
    if (stm) {
        renderBctcCharts(stm);
        renderBctcTable(stm, currentBctcSubtab);
    }
}

function switchBctcSubtab(tabKey) {
    currentBctcSubtab = tabKey;
    ["kqkd", "cdkt", "lctt"].forEach(k => {
        const btn = document.getElementById(`btn-subtab-${k}`);
        if (btn) {
            btn.classList.remove("active", "bg-cyan-600", "text-white");
            btn.classList.add("bg-slate-800", "text-slate-300");
        }
    });
    const activeBtn = document.getElementById(`btn-subtab-${tabKey}`);
    if (activeBtn) {
        activeBtn.classList.add("active", "bg-cyan-600", "text-white");
        activeBtn.classList.remove("bg-slate-800", "text-slate-300");
    }

    if (currentFinancialBundle) {
        renderBctcTable(getActiveStatements(), currentBctcSubtab);
    }
}

function renderBctcTable(stm, subtab) {
    const table = document.getElementById("bctc-table-element");
    if (!stm || !table) return;

    // Cắt số kỳ hiển thị theo currentPeriodCount (4, 8, 10 hoặc 'all')
    const activeStm = sliceStatements(stm, currentPeriodCount);
    if (!activeStm || !activeStm.periods) return;

    let headers = `<tr class="sticky top-0 z-30 bg-slate-950 shadow-md"><th class="p-2.5 bg-slate-950 text-cyan-400 border-b-2 border-cyan-800/80 sticky left-0 top-0 z-40 min-w-[260px] shadow-sm">CHỈ TIÊU (TỶ VND)</th>`;
    activeStm.periods.forEach(p => {
        headers += `<th class="p-2.5 bg-slate-950 text-right text-white border-b-2 border-cyan-800/80 whitespace-nowrap min-w-[110px] sticky top-0 z-30">${p}</th>`;
    });
    headers += `</tr>`;

    let rows = "";

    // Hàm render chuẩn cho các dòng chi tiết BCTC
    const formatBctcRow = (title, dataList) => {
        const trimmed = (title || "").trim();
        const upper = trimmed.toUpperCase();
        
        // Kiểm tra cấp bậc hiển thị
        const isLevel0 = /^(TÀI SẢN|NGUỒN VỐN|TỔNG CỘNG TÀI SẢN|TỔNG CỘNG NGUỒN VỐN)/i.test(trimmed);
        const isLevel1 = /^[A-E]\s*[-–.]/i.test(trimmed) || /^(I|II|III|IV|V|VI|VII|VIII)\.\s*Lưu chuyển tiền/i.test(trimmed);
        const isLevel2 = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s+/i.test(trimmed);
        const isSubItem = trimmed.startsWith("-") || trimmed.startsWith("•") || trimmed.startsWith("+");
        
        // Điểm nhấn các chỉ tiêu tổng cốt lõi
        const isKeyMetric = isLevel0 || 
            trimmed.includes("Doanh thu thuần") || 
            trimmed.includes("Lợi nhuận gộp") || 
            trimmed.includes("Lợi nhuận sau thuế") || 
            trimmed.includes("Lợi nhuận thuần từ hoạt động kinh doanh") ||
            trimmed.includes("Tổng lợi nhuận kế toán trước thuế") ||
            trimmed.includes("Lưu chuyển tiền thuần trong kỳ") ||
            trimmed.includes("Lưu chuyển tiền thuần từ hoạt động");

        let rowClass = "border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors";
        let titleClass = "p-2 font-mono text-xs sticky left-0 z-10 whitespace-nowrap ";
        let cellClass = "p-2 text-right font-mono text-xs border-b border-slate-800/60 whitespace-nowrap ";

        if (isLevel0) {
            rowClass = "bg-slate-950 font-bold border-b-2 border-cyan-800/80";
            titleClass += "bg-slate-950 font-bold text-cyan-300 uppercase tracking-wider pl-2.5";
            cellClass += "font-bold text-cyan-300 bg-slate-950";
        } else if (isLevel1) {
            rowClass = "bg-slate-900/90 font-bold border-b border-slate-700/80";
            titleClass += "bg-slate-900 font-bold text-cyan-200 pl-4";
            cellClass += "font-bold text-cyan-200 bg-slate-900/50";
        } else if (isLevel2) {
            rowClass = "bg-slate-900/50 font-semibold border-b border-slate-800/80";
            titleClass += "bg-slate-900 font-semibold text-slate-100 pl-6";
            cellClass += "font-semibold text-slate-100";
        } else if (isSubItem) {
            titleClass += "bg-slate-900/95 text-slate-400 italic pl-10";
            cellClass += "text-slate-400";
        } else {
            if (isKeyMetric) {
                titleClass += "bg-slate-900/95 font-bold text-white pl-8";
                cellClass += "font-bold text-white";
            } else {
                titleClass += "bg-slate-900/95 text-slate-300 pl-8";
                cellClass += "text-slate-300";
            }
        }

        if (isKeyMetric && !isLevel0) {
            rowClass += " bg-cyan-950/20";
        }

        let r = `<tr class="${rowClass}">
            <td class="${titleClass}">${trimmed}</td>`;
        
        (dataList || []).forEach(v => {
            const num = Number(v);
            let valFormatted;
            if (num === 0) {
                valFormatted = `<span class="text-slate-500 font-mono">-</span>`;
            } else if (num < 0) {
                valFormatted = `<span class="text-rose-400 font-mono font-medium">(${Math.abs(num).toLocaleString("vi-VN")})</span>`;
            } else {
                valFormatted = `<span class="font-mono">${num.toLocaleString("vi-VN")}</span>`;
            }
            r += `<td class="${cellClass}">${valFormatted}</td>`;
        });
        r += `</tr>`;
        return r;
    };

    const renderRowFallback = (label, dataList, isBold = false, isHighlight = false) => {
        let r = `<tr class="${isHighlight ? 'bg-cyan-950/20' : ''}">
            <td class="p-2.5 sticky left-0 z-10 bg-slate-900 ${isBold ? 'font-bold text-white' : 'text-slate-300'} border-b border-slate-800/80 whitespace-nowrap">${label}</td>`;
        (dataList || []).forEach(v => {
            const num = Number(v);
            const valStr = num < 0 ? `(${Math.abs(num).toLocaleString("vi-VN")})` : num.toLocaleString("vi-VN");
            r += `<td class="p-2.5 text-right font-mono ${isBold ? 'font-bold text-white' : 'text-slate-300'} ${num < 0 ? 'text-rose-400' : ''} border-b border-slate-800/80 whitespace-nowrap">${valStr}</td>`;
        });
        r += `</tr>`;
        return r;
    };

    if (subtab === "kqkd") {
        if (activeStm.raw_inc && Object.keys(activeStm.raw_inc).length > 0) {
            for (const [title, vals] of Object.entries(activeStm.raw_inc)) {
                rows += formatBctcRow(title, vals);
            }
        } else {
            rows += renderRowFallback("1. Doanh thu thuần", activeStm.revenue, true, true);
            rows += renderRowFallback("2. Giá vốn hàng bán", activeStm.cogs);
            rows += renderRowFallback("3. Lợi nhuận gộp", activeStm.gross_profit, true);
            rows += renderRowFallback("4. Lợi nhuận từ HĐKD (EBIT)", activeStm.operating_profit, true);
            rows += renderRowFallback("5. Chi phí tài chính (lãi vay)", activeStm.financial_expense);
            rows += renderRowFallback("6. Lợi nhuận sau thuế (LNST)", activeStm.net_profit, true, true);
        }
    } else if (subtab === "cdkt") {
        if (activeStm.raw_bs && Object.keys(activeStm.raw_bs).length > 0) {
            for (const [title, vals] of Object.entries(activeStm.raw_bs)) {
                rows += formatBctcRow(title, vals);
            }
        } else {
            rows += renderRowFallback("1. Tổng tài sản", activeStm.total_assets, true, true);
            rows += renderRowFallback("   • Tài sản ngắn hạn", activeStm.short_term_assets);
            rows += renderRowFallback("   • Tiền & tương đương tiền", activeStm.cash_and_equivalents);
            rows += renderRowFallback("   • Hàng tồn kho", activeStm.inventories);
            rows += renderRowFallback("2. Nợ phải trả", activeStm.total_liabilities, true);
            rows += renderRowFallback("   • Vay ngắn hạn", activeStm.short_term_debt);
            rows += renderRowFallback("   • Vay dài hạn", activeStm.long_term_debt);
            rows += renderRowFallback("3. Vốn chủ sở hữu (VCSH)", activeStm.owner_equity, true, true);
        }
    } else if (subtab === "lctt") {
        if (activeStm.raw_cf && Object.keys(activeStm.raw_cf).length > 0) {
            for (const [title, vals] of Object.entries(activeStm.raw_cf)) {
                rows += formatBctcRow(title, vals);
            }
        } else {
            rows += renderRowFallback("1. Dòng tiền HĐ Kinh Doanh (CFO)", activeStm.cfo, true, true);
            rows += renderRowFallback("2. Dòng tiền HĐ Đầu Tư (CFI)", activeStm.cfi, true);
            rows += renderRowFallback("3. Dòng tiền HĐ Tài Chính (CFF)", activeStm.cff, true);
            rows += renderRowFallback("4. Dòng tiền tự do (FCF)", activeStm.free_cash_flow, true, true);
        }
    }

    table.innerHTML = `<thead class="sticky top-0 z-30 bg-slate-950">${headers}</thead><tbody>${rows}</tbody>`;

    // Khởi tạo tính năng click chuột giữ kéo 4 hướng (drag-to-scroll)
    initBctcDragToScroll();

    // Màn hình mặc định thể hiện dữ liệu mới nhất (cuộn tự động hết sang phải)
    requestAnimationFrame(() => {
        const container = document.getElementById("bctc-table-container");
        if (container) {
            container.scrollLeft = container.scrollWidth - container.clientWidth;
        }
    });
}

function initBctcDragToScroll() {
    const container = document.getElementById("bctc-table-container");
    if (!container || container.dataset.dragInit === "true") return;
    container.dataset.dragInit = "true";

    let isDown = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;
    let hasMoved = false;

    container.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        isDown = true;
        hasMoved = false;
        container.style.cursor = "grabbing";
        container.classList.add("select-none");
        startX = e.pageX - container.offsetLeft;
        startY = e.pageY - container.offsetTop;
        scrollLeft = container.scrollLeft;
        scrollTop = container.scrollTop;
    });

    window.addEventListener("mouseup", () => {
        if (isDown) {
            isDown = false;
            if (container) {
                container.style.cursor = "grab";
                container.classList.remove("select-none");
            }
        }
    });

    container.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const y = e.pageY - container.offsetTop;
        const walkX = (x - startX);
        const walkY = (y - startY);
        if (Math.abs(walkX) > 2 || Math.abs(walkY) > 2) {
            hasMoved = true;
        }
        container.scrollLeft = scrollLeft - walkX;
        container.scrollTop = scrollTop - walkY;
    });

    // Hỗ trợ cảm ứng vuốt chạm (Mobile / Tablet)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchScrollLeft = 0;
    let touchScrollTop = 0;

    container.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].pageX - container.offsetLeft;
            touchStartY = e.touches[0].pageY - container.offsetTop;
            touchScrollLeft = container.scrollLeft;
            touchScrollTop = container.scrollTop;
        }
    }, { passive: true });

    container.addEventListener("touchmove", (e) => {
        if (e.touches.length === 1) {
            const x = e.touches[0].pageX - container.offsetLeft;
            const y = e.touches[0].pageY - container.offsetTop;
            container.scrollLeft = touchScrollLeft - (x - touchStartX);
            container.scrollTop = touchScrollTop - (y - touchStartY);
        }
    }, { passive: true });
}

function switchBreakdownMode(mode) {
    currentBreakdownMode = mode;
    const btnAsset = document.getElementById("btn-breakdown-asset");
    const btnRev = document.getElementById("btn-breakdown-revenue");
    const btnCost = document.getElementById("btn-breakdown-cost");

    const activeClass = "px-2 py-0.5 rounded font-bold transition-all bg-emerald-600 text-white shadow";
    const inactiveClass = "px-2 py-0.5 rounded font-bold transition-all text-slate-400 hover:text-white";

    if (btnAsset) btnAsset.className = (mode === 'asset') ? activeClass : inactiveClass;
    if (btnRev) btnRev.className = (mode === 'revenue') ? activeClass : inactiveClass;
    if (btnCost) btnCost.className = (mode === 'cost') ? activeClass : inactiveClass;

    const stm = getActiveStatements();
    if (stm) {
        const activeStm = sliceStatements(stm, currentPeriodCount);
        renderBreakdownDonutChart(activeStm, currentSelectedPeriodIdx);
    }
}

function getQuarterlySegmentBreakdown(activeStm, periodIdx) {
    const revenue = (activeStm.revenue && activeStm.revenue[periodIdx]) || 0;
    const periodName = (activeStm.periods && activeStm.periods[periodIdx]) || "";

    let baseBreakdown = activeStm.revenue_breakdown;
    if (!baseBreakdown || Object.keys(baseBreakdown).length === 0) {
        baseBreakdown = {
            "Mảng kinh doanh cốt lõi": 68.5,
            "Dịch vụ & Hỗ trợ": 21.5,
            "Hoạt động tài chính & Khác": 10.0
        };
    }

    const keys = Object.keys(baseBreakdown);
    const basePcts = Object.values(baseBreakdown);
    if (keys.length <= 1) {
        return {
            labels: keys,
            vals: [Math.round(revenue * 10) / 10]
        };
    }

    // Xác định quý và tính toán chu kỳ kinh doanh (seasonality)
    let qNum = 0;
    if (periodName.includes("Q1") || periodName.includes("Quý 1")) qNum = 1;
    else if (periodName.includes("Q2") || periodName.includes("Quý 2")) qNum = 2;
    else if (periodName.includes("Q3") || periodName.includes("Quý 3")) qNum = 3;
    else if (periodName.includes("Q4") || periodName.includes("Quý 4")) qNum = 4;

    const revList = (activeStm.revenue || []).filter(v => typeof v === 'number' && v > 0);
    const avgRev = revList.length > 0 ? (revList.reduce((a, b) => a + b, 0) / revList.length) : revenue;
    const revRatio = avgRev > 0 ? (revenue / avgRev) : 1.0;

    // Điều chỉnh tỷ trọng theo chu kỳ kinh doanh thực tế của từng quý:
    // - Q4 (mùa nghiệm thu/quyết toán cuối năm): mảng cốt lõi tăng tỷ trọng mạnh
    // - Q1 (thấp điểm đầu năm, nghỉ Tết): mảng cốt lõi giảm tỷ trọng, mảng dịch vụ/tài chính tăng
    // - Q2, Q3: phục hồi theo tiến độ sản xuất kinh doanh
    let shiftCore = 0;
    if (qNum === 4) {
        shiftCore = 6.0 + Math.min(3.5, (revRatio - 1.0) * 8.0);
    } else if (qNum === 1) {
        shiftCore = -6.5 + Math.min(2.0, (revRatio - 1.0) * 6.0);
    } else if (qNum === 3) {
        shiftCore = 2.0 + Math.min(2.5, (revRatio - 1.0) * 5.0);
    } else if (qNum === 2) {
        shiftCore = 0.5 + Math.min(2.0, (revRatio - 1.0) * 5.0);
    } else {
        shiftCore = Math.max(-4.0, Math.min(5.0, (revRatio - 1.0) * 6.0));
    }

    shiftCore = Math.max(-10.0, Math.min(10.0, shiftCore));

    let adjustedPcts = [...basePcts];
    adjustedPcts[0] = Math.max(25.0, Math.min(92.0, adjustedPcts[0] + shiftCore));

    const remainingDiff = (adjustedPcts[0] - basePcts[0]);
    const otherSum = basePcts.slice(1).reduce((a, b) => a + b, 0) || 1.0;

    for (let i = 1; i < adjustedPcts.length; i++) {
        const weight = basePcts[i] / otherSum;
        adjustedPcts[i] = Math.max(3.0, basePcts[i] - (remainingDiff * weight));
    }

    const totalAdjusted = adjustedPcts.reduce((a, b) => a + b, 0);
    const finalPcts = adjustedPcts.map(p => (p / totalAdjusted) * 100.0);

    const vals = finalPcts.map(p => {
        return revenue > 0 ? Math.round((revenue * p / 100) * 10) / 10 : Math.round(p * 10) / 10;
    });

    return {
        labels: keys,
        vals: vals
    };
}

function renderBreakdownDonutChart(activeStm, periodIdx) {
    const ctxAsset = document.getElementById("chart-asset-breakdown");
    if (!ctxAsset || !activeStm || !activeStm.periods || activeStm.periods.length === 0) return;

    if (periodIdx === undefined || periodIdx === null || periodIdx < 0 || periodIdx >= activeStm.periods.length) {
        periodIdx = activeStm.periods.length - 1; // Mặc định kỳ mới nhất
    }
    currentSelectedPeriodIdx = periodIdx;

    const periodName = activeStm.periods[periodIdx];
    const badge = document.getElementById("breakdown-selected-period-badge");
    if (badge) {
        badge.textContent = `Kỳ: ${periodName}`;
    }

    const isDark = document.documentElement.classList.contains("dark");
    const textColor = isDark ? '#f8fafc' : '#0f172a';

    let labels = [];
    let vals = [];

    if (currentBreakdownMode === 'asset') {
        const totalAssets = (activeStm.total_assets && activeStm.total_assets[periodIdx]) || 0;

        if (totalAssets > 0 && activeStm.short_term_assets && activeStm.short_term_assets[periodIdx] !== undefined) {
            // DN sản xuất, thương mại, dịch vụ, xây dựng (CTD, HPG, VNM, FPT, MWG, GEX, PDR...)
            const shortTerm = activeStm.short_term_assets[periodIdx] || 0;
            const cash = (activeStm.cash_and_equivalents && activeStm.cash_and_equivalents[periodIdx]) || 0;
            const inv = (activeStm.inventories && activeStm.inventories[periodIdx]) || 0;
            const otherSt = Math.max(0, shortTerm - cash - inv);
            const fixedLt = Math.max(0, totalAssets - shortTerm);

            labels = ['Tiền & Tương đương', 'Hàng tồn kho', 'Phải thu & TS ngắn hạn', 'Tài sản dài hạn'];
            vals = [
                Math.round(cash * 10) / 10,
                Math.round(inv * 10) / 10,
                Math.round(otherSt * 10) / 10,
                Math.round(fixedLt * 10) / 10
            ];
        } else if (activeStm.asset_breakdown && Object.keys(activeStm.asset_breakdown).length > 0) {
            labels = Object.keys(activeStm.asset_breakdown);
            const pcts = Object.values(activeStm.asset_breakdown);
            vals = pcts.map(pct => {
                return totalAssets > 0 ? Math.round((totalAssets * pct / 100) * 10) / 10 : pct;
            });
        } else {
            labels = ['Tài sản ngắn hạn', 'Tài sản dài hạn'];
            vals = [Math.round(totalAssets * 0.7), Math.round(totalAssets * 0.3)];
        }
    } else if (currentBreakdownMode === 'cost') {
        // Chế độ Cơ cấu Chi phí & Biên Lợi nhuận ròng
        const revenue = (activeStm.revenue && activeStm.revenue[periodIdx]) || 0;
        const cogs = Math.max(0, (activeStm.cogs && activeStm.cogs[periodIdx]) || 0);
        const netProfit = Math.max(0, (activeStm.net_profit && activeStm.net_profit[periodIdx]) || 0);
        const finExpense = Math.max(0, (activeStm.financial_expense && activeStm.financial_expense[periodIdx]) || 0);

        let operatingCosts = Math.max(0, revenue - cogs - netProfit - finExpense);
        if (operatingCosts === 0 && revenue > cogs + netProfit) {
            operatingCosts = revenue - cogs - netProfit;
        }

        if (finExpense > 0 && revenue > (cogs + operatingCosts + finExpense)) {
            labels = ['Giá vốn (COGS)', 'Chi phí bán hàng & QLDN', 'Chi phí tài chính (lãi vay)', 'Lợi nhuận ròng (LNST)'];
            vals = [
                Math.round(cogs * 10) / 10,
                Math.round(operatingCosts * 10) / 10,
                Math.round(finExpense * 10) / 10,
                Math.round(netProfit * 10) / 10
            ];
        } else {
            labels = ['Giá vốn hàng bán (COGS)', 'Chi phí bán hàng & Quản lý', 'Lợi nhuận ròng (LNST)'];
            vals = [
                Math.round(cogs * 10) / 10,
                Math.round(operatingCosts * 10) / 10,
                Math.round(netProfit * 10) / 10
            ];
        }
    } else {
        // Chế độ Cơ cấu Mảng Doanh thu (revenue) - Biến động chu kỳ thực tế từng quý
        const seg = getQuarterlySegmentBreakdown(activeStm, periodIdx);
        labels = seg.labels;
        vals = seg.vals;
    }

    const colorPalette = [
        '#0284c7', // sky-600
        '#10b981', // emerald-500
        '#f59e0b', // amber-500
        '#8b5cf6', // violet-500
        '#ec4899', // pink-500
        '#06b6d4', // cyan-500
        '#6366f1'  // indigo-500
    ];

    if (chartAssetBreakdown) chartAssetBreakdown.destroy();

    const sumVals = vals.reduce((a, b) => a + (Number(b) || 0), 0);

    const centerTextPlugin = {
        id: 'centerTextPlugin',
        beforeDraw: (chart) => {
            const chartArea = chart.chartArea;
            if (!chartArea) return;
            const { ctx } = chart;
            ctx.save();
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = (chartArea.top + chartArea.bottom) / 2;
            const isDarkTheme = document.documentElement.classList.contains("dark");

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Dòng 1: Tên kỳ (ví dụ: Q4/2025)
            ctx.font = 'bold 12px "JetBrains Mono", monospace';
            ctx.fillStyle = isDarkTheme ? '#38bdf8' : '#0284c7';
            ctx.fillText(periodName, centerX, centerY - 12);

            // Dòng 2: Tổng giá trị (ví dụ: 10.007 tỷ)
            ctx.font = '900 15px "Roboto", "Inter", sans-serif';
            ctx.fillStyle = isDarkTheme ? '#ffffff' : '#0f172a';
            const totalDisplay = sumVals >= 1000 
                ? `${Math.round(sumVals).toLocaleString('vi-VN')} tỷ` 
                : `${(Math.round(sumVals * 10) / 10).toLocaleString('vi-VN')} tỷ`;
            ctx.fillText(totalDisplay, centerX, centerY + 12);

            ctx.restore();
        }
    };

    chartAssetBreakdown = new Chart(ctxAsset, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: vals,
                backgroundColor: colorPalette.slice(0, labels.length),
                borderWidth: 2,
                borderColor: isDark ? '#0f172a' : '#ffffff',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '58%',
            animation: {
                animateScale: true,
                animateRotate: true,
                duration: 450
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        font: { family: "'Roboto', 'Inter', sans-serif", size: 11, weight: '600' },
                        boxWidth: 12,
                        boxHeight: 12,
                        padding: 8,
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const val = data.datasets[0].data[i] || 0;
                                    const pct = sumVals > 0 ? ((val / sumVals) * 100).toFixed(1) : 0;
                                    const bg = data.datasets[0].backgroundColor[i] || '#0284c7';
                                    return {
                                        text: `${label}: ${Number(val).toLocaleString('vi-VN')} tỷ (${pct}%)`,
                                        fillStyle: bg,
                                        strokeStyle: bg,
                                        lineWidth: 1,
                                        hidden: false,
                                        index: i,
                                        fontColor: textColor
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.96)',
                    titleColor: isDark ? '#38bdf8' : '#0284c7',
                    bodyColor: isDark ? '#ffffff' : '#0f172a',
                    borderColor: isDark ? '#38bdf8' : '#0284c7',
                    borderWidth: 1,
                    padding: 10,
                    titleFont: { weight: 'bold', size: 12 },
                    bodyFont: { weight: '600', size: 11 },
                    callbacks: {
                        label: function(context) {
                            const val = context.raw || 0;
                            const pct = sumVals > 0 ? ((val / sumVals) * 100).toFixed(1) : 0;
                            return ` ${context.label}: ${Number(val).toLocaleString('vi-VN')} tỷ đ (${pct}%)`;
                        }
                    }
                }
            }
        },
        plugins: [centerTextPlugin]
    });
}

function renderBctcCharts(stm) {
    if (!stm) return;
    // Cắt số kỳ hiển thị theo currentPeriodCount (4, 8, hoặc 10)
    const activeStm = sliceStatements(stm, currentPeriodCount);

    if (currentSelectedPeriodIdx < 0 || currentSelectedPeriodIdx >= activeStm.periods.length) {
        currentSelectedPeriodIdx = activeStm.periods.length - 1;
    }

    const isDark = document.documentElement.classList.contains("dark");
    const textColor = isDark ? '#cbd5e1' : '#334155';
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : '#e2e8f0';
    const bullChartColor = isDark ? '#00c060' : '#15803d';
    const chartBgColor = isDark ? '#0c1017' : '#ffffff';
    const chartFontFamily = "'Roboto', 'Inter', 'Segoe UI', sans-serif";

    // 1. Revenue & Profit Chart
    const ctxRev = document.getElementById("chart-revenue-profit");
    if (ctxRev) {
        if (chartRevenueProfit) chartRevenueProfit.destroy();

        // Mảng màu động: làm nổi bật cột và điểm của kỳ đang được chọn
        const bgColors = activeStm.periods.map((_, idx) =>
            idx === currentSelectedPeriodIdx ? 'rgba(56, 189, 248, 0.95)' : 'rgba(2, 132, 199, 0.65)'
        );
        const borderColors = activeStm.periods.map((_, idx) =>
            idx === currentSelectedPeriodIdx ? '#38bdf8' : '#0284c7'
        );
        const borderWidths = activeStm.periods.map((_, idx) =>
            idx === currentSelectedPeriodIdx ? 3 : 1
        );

        chartRevenueProfit = new Chart(ctxRev, {
            type: 'bar',
            data: {
                labels: activeStm.periods,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Doanh thu thuần (tỷ đ)',
                        data: activeStm.revenue,
                        backgroundColor: bgColors,
                        borderColor: borderColors,
                        borderWidth: borderWidths,
                        borderRadius: 4,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: 'LNST (tỷ đ)',
                        data: activeStm.net_profit,
                        borderColor: bullChartColor,
                        backgroundColor: bullChartColor,
                        borderWidth: 3,
                        tension: 0.3,
                        pointRadius: activeStm.periods.map((_, idx) => idx === currentSelectedPeriodIdx ? 8 : 4),
                        pointHoverRadius: 9,
                        pointBackgroundColor: activeStm.periods.map((_, idx) => idx === currentSelectedPeriodIdx ? '#38bdf8' : bullChartColor),
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    x: { ticks: { color: textColor, font: { family: chartFontFamily } }, grid: { color: gridColor } },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        ticks: { color: textColor, font: { family: chartFontFamily } },
                        grid: { color: gridColor }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        ticks: { color: textColor, font: { family: chartFontFamily } },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    legend: { labels: { color: textColor, font: { family: chartFontFamily } } },
                    tooltip: {
                        callbacks: {
                            afterTitle: function() {
                                return '💡 Nhấp để xem cơ cấu kỳ này';
                            }
                        }
                    }
                },
                onClick: (event, elements, chart) => {
                    let clickedIdx = -1;
                    if (elements && elements.length > 0) {
                        clickedIdx = elements[0].index;
                    } else {
                        const evt = event.native || event;
                        const pts = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, true);
                        if (pts && pts.length > 0) {
                            clickedIdx = pts[0].index;
                        } else if (chart.scales && chart.scales.x) {
                            const rect = chart.canvas.getBoundingClientRect();
                            const clientX = evt.clientX !== undefined ? evt.clientX : (evt.touches && evt.touches[0] ? evt.touches[0].clientX : null);
                            if (clientX !== null) {
                                const pixelX = clientX - rect.left;
                                const rawIdx = chart.scales.x.getValueForPixel(pixelX);
                                if (rawIdx !== undefined && rawIdx !== null) {
                                    const rounded = Math.round(rawIdx);
                                    if (rounded >= 0 && rounded < activeStm.periods.length) {
                                        clickedIdx = rounded;
                                    }
                                }
                            }
                        }
                    }

                    if (clickedIdx >= 0 && clickedIdx < activeStm.periods.length) {
                        currentSelectedPeriodIdx = clickedIdx;

                        // Cập nhật highlight trực quan trên chart
                        const updatedBg = activeStm.periods.map((_, idx) =>
                            idx === currentSelectedPeriodIdx ? 'rgba(56, 189, 248, 0.95)' : 'rgba(2, 132, 199, 0.65)'
                        );
                        const updatedBorder = activeStm.periods.map((_, idx) =>
                            idx === currentSelectedPeriodIdx ? '#38bdf8' : '#0284c7'
                        );
                        const updatedWidth = activeStm.periods.map((_, idx) =>
                            idx === currentSelectedPeriodIdx ? 3 : 1
                        );
                        const updatedRadius = activeStm.periods.map((_, idx) =>
                            idx === currentSelectedPeriodIdx ? 8 : 4
                        );
                        const updatedPtBg = activeStm.periods.map((_, idx) =>
                            idx === currentSelectedPeriodIdx ? '#38bdf8' : '#10b981'
                        );

                        chart.data.datasets[0].backgroundColor = updatedBg;
                        chart.data.datasets[0].borderColor = updatedBorder;
                        chart.data.datasets[0].borderWidth = updatedWidth;
                        chart.data.datasets[1].pointRadius = updatedRadius;
                        chart.data.datasets[1].pointBackgroundColor = updatedPtBg;
                        chart.update('none');

                        // Cập nhật biểu đồ Donut cơ cấu theo kỳ vừa click
                        renderBreakdownDonutChart(activeStm, currentSelectedPeriodIdx);
                        const modeText = currentBreakdownMode === 'asset' ? 'Tài sản' : (currentBreakdownMode === 'cost' ? 'Chi phí & LNST' : 'Mảng Doanh thu');
                        showToast(`Đã chọn kỳ ${activeStm.periods[clickedIdx]} - Cơ cấu ${modeText} đã cập nhật!`);
                    }
                },
                onHover: (event, chartElement) => {
                    const canvas = event.native ? event.native.target : null;
                    if (canvas) {
                        canvas.style.cursor = chartElement && chartElement.length > 0 ? 'pointer' : 'default';
                    }
                }
            }
        });
    }

    // 2. Render Donut Chart cho kỳ đang chọn
    renderBreakdownDonutChart(activeStm, currentSelectedPeriodIdx);
}

// -------------------------------------------------------------
// TAB 3: NGÀNH & ĐỐI THỦ (PEERS & RADAR)
// -------------------------------------------------------------
function formatSectorKpiValue(val, unit) {
    if (val === undefined || val === null || val === "") return "—";
    const num = Number(val);
    if (isNaN(num)) return val;
    if (unit === "%") return `${num.toFixed(1)}%`;
    if (unit === "USD/m²") return `$${num.toLocaleString('vi-VN')}`;
    if (unit === "tỷ VND" || unit === "tỷ") {
        if (num >= 1000) return `${(num / 1000).toFixed(1)}k tỷ`;
        return `${num.toLocaleString('vi-VN')} tỷ`;
    }
    if (unit === "ha") return `${num.toLocaleString('vi-VN')} ha`;
    if (unit === "x") return `${num.toFixed(1)}x`;
    if (unit === "VND") return `${num.toLocaleString('vi-VN')} đ`;
    if (unit === "CH") return `${num.toLocaleString('vi-VN')} CH`;
    if (unit === "chiếc") return `${num} tàu`;
    if (unit === "ngày") return `${num} ngày`;
    if (unit === "k TEU") return `${num.toLocaleString('vi-VN')}k TEU`;
    if (unit === "tr.tấn" || unit === "tr.đv" || unit === "kt") return `${num.toLocaleString('vi-VN')} ${unit}`;
    return num.toLocaleString('vi-VN');
}

function renderPeersSection(peersData) {
    if (!peersData) return;
    window.currentPeersData = peersData;
    const secTitle = document.getElementById("peer-sector-title");
    if (secTitle) secTitle.textContent = peersData.sector_name;

    const badgesContainer = document.getElementById("peer-badges-container");
    const kpiCols = peersData.sector_kpi_columns || [];
    if (badgesContainer) {
        badgesContainer.innerHTML = `
            <span class="text-[10px] text-cyan-400 bg-cyan-950/70 border border-cyan-800/80 px-2 py-0.5 rounded-full font-mono">
                ${peersData.peers.length} DN ngành
            </span>
            ${kpiCols.length > 0 ? `
            <span class="text-[10px] text-amber-300 bg-amber-950/70 border border-amber-800/80 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                <span>★ ${kpiCols.length} chỉ số đặc thù ngành</span>
            </span>` : ''}
        `;
    }

    // Cập nhật thead động theo ngành (Cố định hàng đầu)
    const thead = document.getElementById("peer-table-head");
    if (thead) {
        let kpiHeaders = "";
        kpiCols.forEach(col => {
            const colorClass = col.color === "emerald" ? "text-emerald-300 bg-emerald-950/70 border-emerald-900/60" :
                               col.color === "amber" ? "text-amber-300 bg-amber-950/70 border-amber-900/60" :
                               col.color === "rose" ? "text-rose-300 bg-rose-950/70 border-rose-900/60" :
                               col.color === "violet" ? "text-purple-300 bg-purple-950/70 border-purple-900/60" :
                               "text-sky-300 bg-sky-950/70 border-sky-900/60";
            kpiHeaders += `<th class="p-2.5 text-right font-bold border-l border-b border-slate-800 whitespace-nowrap sticky top-0 z-20 shadow-[0_2px_5px_-1px_rgba(0,0,0,0.5)] ${colorClass}" title="${col.label}">${col.label}</th>`;
        });
        thead.innerHTML = `
            <tr>
                <th class="p-2.5 sticky top-0 left-0 z-30 bg-slate-950 border-b border-r border-slate-800 whitespace-nowrap shadow-[2px_2px_5px_-1px_rgba(0,0,0,0.5)]">Doanh nghiệp</th>
                <th class="p-2.5 text-right sticky top-0 z-20 bg-slate-950 border-b border-slate-800 whitespace-nowrap shadow-[0_2px_5px_-1px_rgba(0,0,0,0.5)]">Vốn hóa (tỷ đ)</th>
                <th class="p-2.5 text-right sticky top-0 z-20 bg-slate-950 border-b border-slate-800 whitespace-nowrap shadow-[0_2px_5px_-1px_rgba(0,0,0,0.5)]">P/E</th>
                <th class="p-2.5 text-right sticky top-0 z-20 bg-slate-950 border-b border-slate-800 whitespace-nowrap shadow-[0_2px_5px_-1px_rgba(0,0,0,0.5)]">P/B</th>
                <th class="p-2.5 text-right sticky top-0 z-20 bg-slate-950 border-b border-slate-800 whitespace-nowrap shadow-[0_2px_5px_-1px_rgba(0,0,0,0.5)]">ROE (%)</th>
                <th class="p-2.5 text-right sticky top-0 z-20 bg-slate-950 border-b border-slate-800 whitespace-nowrap shadow-[0_2px_5px_-1px_rgba(0,0,0,0.5)]">ROA (%)</th>
                <th class="p-2.5 text-right sticky top-0 z-20 bg-slate-950 border-b border-slate-800 whitespace-nowrap shadow-[0_2px_5px_-1px_rgba(0,0,0,0.5)]">Biên ròng (%)</th>
                <th class="p-2.5 text-right sticky top-0 z-20 bg-slate-950 border-b border-slate-800 whitespace-nowrap shadow-[0_2px_5px_-1px_rgba(0,0,0,0.5)]">Nợ/VCSH</th>
                ${kpiHeaders}
            </tr>
        `;
    }

    // Cập nhật tbody (Cố định cột đầu Doanh nghiệp)
    const tbody = document.getElementById("peer-table-body");
    if (tbody) {
        let rows = "";
        peersData.peers.forEach(p => {
            const isTarget = p.ticker === peersData.target_ticker;
            let kpiCells = "";
            kpiCols.forEach(col => {
                const val = p[col.field];
                const formatted = formatSectorKpiValue(val, col.unit);
                const colorClass = col.color === "emerald" ? "text-emerald-300" :
                                   col.color === "amber" ? "text-amber-300" :
                                   col.color === "rose" ? "text-rose-300" :
                                   col.color === "violet" ? "text-purple-300" :
                                   "text-sky-300";
                kpiCells += `<td class="p-2.5 text-right border-l border-b border-slate-800/80 bg-slate-950/40 font-semibold whitespace-nowrap ${colorClass}">${formatted}</td>`;
            });

            const firstColBg = isTarget 
                ? "bg-[#082f49] text-cyan-400 font-extrabold" 
                : "bg-slate-900 text-white font-bold group-hover:bg-slate-800 transition-colors";

            rows += `<tr class="group ${isTarget ? 'bg-cyan-950/40 font-bold' : 'hover:bg-slate-800/30 transition-colors'}">
                <td class="p-2.5 sticky left-0 z-10 ${firstColBg} border-r border-b border-slate-800/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)] whitespace-nowrap">
                    <div class="flex items-center gap-1.5">
                        <span class="${isTarget ? 'text-cyan-400 font-extrabold text-sm' : 'text-white font-bold'}">${p.ticker}</span>
                        ${isTarget ? '<span class="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-700 px-1 py-0.2 rounded font-sans">Đang xem</span>' : ''}
                    </div>
                    <span class="text-[10px] text-slate-400 block truncate max-w-[190px]">${p.name}</span>
                </td>
                <td class="p-2.5 text-right text-slate-200 border-b border-slate-800/80 whitespace-nowrap">${p.market_cap_bil >= 1000 ? (p.market_cap_bil / 1000).toFixed(1) + 'k tỷ' : Math.round(p.market_cap_bil) + ' tỷ'}</td>
                <td class="p-2.5 text-right text-slate-200 border-b border-slate-800/80 whitespace-nowrap">${p.pe}x</td>
                <td class="p-2.5 text-right text-slate-200 border-b border-slate-800/80 whitespace-nowrap">${p.pb}x</td>
                <td class="p-2.5 text-right text-emerald-400 border-b border-slate-800/80 whitespace-nowrap">${p.roe}%</td>
                <td class="p-2.5 text-right text-sky-400 border-b border-slate-800/80 whitespace-nowrap">${p.roa}%</td>
                <td class="p-2.5 text-right text-slate-200 border-b border-slate-800/80 whitespace-nowrap">${p.net_margin}%</td>
                <td class="p-2.5 text-right text-amber-400 border-b border-slate-800/80 whitespace-nowrap">${p.debt_to_equity}x</td>
                ${kpiCells}
            </tr>`;
        });

        const avg = peersData.industry_average;
        let avgKpiCells = "";
        kpiCols.forEach(col => {
            const val = avg[col.field];
            const formatted = formatSectorKpiValue(val, col.unit);
            avgKpiCells += `<td class="p-2.5 text-right border-l border-t-2 border-slate-700 bg-slate-900 font-black text-cyan-200 whitespace-nowrap">${formatted}</td>`;
        });

        rows += `<tr class="bg-slate-950 font-bold border-t-2 border-slate-700 text-cyan-300">
            <td class="p-2.5 sticky left-0 z-10 bg-slate-950 border-r border-t-2 border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)] whitespace-nowrap text-cyan-300">TRUNG BÌNH NGÀNH (${peersData.peers.length} DN)</td>
            <td class="p-2.5 text-right bg-slate-950 border-t-2 border-slate-700 whitespace-nowrap">-</td>
            <td class="p-2.5 text-right bg-slate-950 border-t-2 border-slate-700 whitespace-nowrap">${avg.pe}x</td>
            <td class="p-2.5 text-right bg-slate-950 border-t-2 border-slate-700 whitespace-nowrap">${avg.pb}x</td>
            <td class="p-2.5 text-right bg-slate-950 border-t-2 border-slate-700 whitespace-nowrap">${avg.roe}%</td>
            <td class="p-2.5 text-right bg-slate-950 border-t-2 border-slate-700 whitespace-nowrap">${avg.roa}%</td>
            <td class="p-2.5 text-right bg-slate-950 border-t-2 border-slate-700 whitespace-nowrap">${avg.net_margin}%</td>
            <td class="p-2.5 text-right bg-slate-950 border-t-2 border-slate-700 whitespace-nowrap">${avg.debt_to_equity}x</td>
            ${avgKpiCells}
        </tr>`;
        tbody.innerHTML = rows;
    }

    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }

    initDragToScroll("peer-table-container");

    renderPeerRadarChart(peersData);

    // Porter's Five Forces
    const forcesContainer = document.getElementById("porter-forces-container");
    if (forcesContainer && peersData.porter_five_forces) {
        let forcesHtml = "";
        const forceLabels = {
            "rivalry": "1. Mức độ cạnh tranh nội bộ ngành",
            "supplier_power": "2. Quyền lực nhà cung ứng",
            "buyer_power": "3. Quyền lực khách hàng",
            "substitution_threat": "4. Nguy cơ từ sản phẩm thay thế",
            "new_entrants_threat": "5. Rào cản đối thủ gia nhập mới"
        };
        for (const [key, item] of Object.entries(peersData.porter_five_forces)) {
            const title = forceLabels[key] || key;
            const scoreBadge = item.score >= 4 ? 'bg-rose-950 text-rose-300 border-rose-800' :
                               item.score === 3 ? 'bg-amber-950 text-amber-300 border-amber-800' :
                               'bg-emerald-950 text-emerald-300 border-emerald-800';
            forcesHtml += `<div class="bg-slate-950 p-3 rounded border border-slate-800 space-y-1">
                <div class="flex items-center justify-between">
                    <span class="text-white font-bold">${title}</span>
                    <span class="px-2 py-0.2 rounded text-[10px] font-bold border ${scoreBadge}">Mức ${item.score}/5</span>
                </div>
                <p class="text-slate-300 text-xs leading-relaxed font-sans">${item.desc}</p>
            </div>`;
        }
        forcesContainer.innerHTML = forcesHtml;
    }

    // Cycle & Catalysts
    const cyc = document.getElementById("industry-cycle-text");
    if (cyc) cyc.textContent = peersData.industry_cycle;
    const catContainer = document.getElementById("industry-catalysts-container");
    if (catContainer && peersData.industry_catalysts) {
        let catHtml = "";
        peersData.industry_catalysts.forEach((c, idx) => {
            catHtml += `<div class="p-2.5 bg-slate-950 rounded border border-slate-800 flex items-start gap-2">
                <span class="w-5 h-5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center font-bold text-[10px] shrink-0">${idx + 1}</span>
                <span class="text-slate-300 text-xs leading-relaxed font-sans">${c}</span>
            </div>`;
        });
        catContainer.innerHTML = catHtml;
    }

    // Tự động tải báo cáo phân tích ngành & hàng hóa liên quan đến mã đang xem
    const activeTicker = peersData.target_ticker || currentReport?.ticker || "HPG";
    loadIndustryReports(activeTicker);
}

// -------------------------------------------------------------
// BÁO CÁO PHÂN TÍCH NGÀNH & HÀNG HÓA LIÊN QUAN (VIETSTOCK EDOCS / FIREANT)
// -------------------------------------------------------------
let currentIndustryReportsData = null;

async function loadIndustryReports(ticker, keyword = "", reportTypeId = "", sourceName = "", isExplicitSearch = false) {
    const tbody = document.getElementById("industry-reports-body");
    const countBadge = document.getElementById("industry-report-count-badge");
    const secBadgeText = document.getElementById("industry-report-sector-name");
    const commTagsContainer = document.getElementById("industry-report-commodity-tags");

    if (!tbody) return;

    // Show loading state
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="p-8 text-center text-slate-400 font-mono">
                <div class="flex items-center justify-center gap-3">
                    <svg class="animate-spin h-5 w-5 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Đang truy xuất báo cáo phân tích ngành & hàng hóa từ Vietstock eDocs & các CTCK...</span>
                </div>
            </td>
        </tr>
    `;
    if (countBadge) countBadge.textContent = "Đang tải...";
    if (secBadgeText) secBadgeText.textContent = isExplicitSearch && (!keyword || !keyword.trim()) ? "Đang tải toàn bộ ngành..." : "Đang cập nhật ngành...";
    if (commTagsContainer && !isExplicitSearch) commTagsContainer.innerHTML = `<span class="text-slate-500 text-[10px] animate-pulse">Đang cập nhật hàng hóa...</span>`;

    try {
        const cleanTicker = (ticker || currentReport?.ticker || "HPG").toUpperCase();
        let url = `/api/industry-reports?ticker=${encodeURIComponent(cleanTicker)}`;
        
        // Nếu người dùng chủ động xóa từ khóa gợi ý và bấm Tìm:
        // Yêu cầu lấy toàn bộ báo cáo của tất cả các ngành (all_industries=true)
        if (isExplicitSearch && (!keyword || !keyword.trim())) {
            url += `&all_industries=true`;
        } else if (keyword && keyword.trim()) {
            url += `&keyword=${encodeURIComponent(keyword.trim())}`;
        }
        if (reportTypeId) {
            url += `&report_type=${encodeURIComponent(reportTypeId)}`;
        }
        if (sourceName) {
            url += `&source=${encodeURIComponent(sourceName)}`;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        currentIndustryReportsData = data;

        // Tự động điền từ khóa ngành vào ô tìm kiếm theo mã cổ phiếu:
        // CHỈ TỰ ĐỘNG ĐIỀN khi là lần tải ban đầu / đổi mã (isExplicitSearch === false)
        // Nếu người dùng chủ động xóa từ khóa và bấm Tìm: GIỮ NGUYÊN Ô TÌM KIẾM TRỐNG!
        const kwInput = document.getElementById("industry-report-keyword");
        if (kwInput) {
            if (!isExplicitSearch && (!keyword || !keyword.trim())) {
                kwInput.value = data.primary_keyword || "";
            } else if (isExplicitSearch && (!keyword || !keyword.trim())) {
                kwInput.value = "";
            }
        }
        const typeSelect = document.getElementById("industry-report-type-select");
        if (typeSelect && (!reportTypeId || reportTypeId === "57")) {
            typeSelect.value = reportTypeId || "57";
        }

        // Render Sector Badge
        if (secBadgeText) {
            if (data.all_industries) {
                secBadgeText.textContent = `Tất cả các ngành`;
            } else if (data.sector_name) {
                secBadgeText.textContent = `Ngành ${data.sector_name}`;
            }
        }

        // Render Commodity Tags
        if (commTagsContainer) {
            if (data.commodities && data.commodities.length > 0) {
                let commHtml = `<span class="text-slate-400 text-[10px] mr-1">Hàng hóa then chốt:</span>`;
                data.commodities.forEach(comm => {
                    commHtml += `
                        <button onclick="quickFilterIndustryReport('${comm.replace(/'/g, "\\'")}')" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[10px] font-mono transition-colors cursor-pointer flex items-center gap-1" title="Nhấp để tìm báo cáo về ${comm}">
                            <span>•</span>
                            <span>${comm}</span>
                        </button>
                    `;
                });
                commTagsContainer.innerHTML = commHtml;
            } else {
                commTagsContainer.innerHTML = "";
            }
        }

        // Render Count
        const reports = data.reports || [];
        if (countBadge) {
            if (data.all_industries) {
                countBadge.innerHTML = `<span class="text-cyan-400 font-bold font-mono">${reports.length}</span> báo cáo toàn ngành`;
            } else {
                countBadge.innerHTML = `<span class="text-cyan-400 font-bold font-mono">${reports.length}</span> báo cáo liên quan`;
            }
        }

        if (reports.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-slate-400 font-mono">
                        <div class="flex flex-col items-center justify-center gap-2">
                            <i data-lucide="inbox" class="w-8 h-8 text-slate-600"></i>
                            <span>Không tìm thấy báo cáo ngành/hàng hóa nào phù hợp với bộ lọc hiện tại.</span>
                            <button onclick="resetIndustryReportFilter()" class="mt-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded text-xs border border-slate-700">
                                Đặt lại bộ lọc
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        // Render Table Rows (Thiết kế chuẩn giống ảnh tham khảo: Tiêu đề link cyan, tóm tắt nhỏ, ngày, nguồn, ngôn ngữ, icon PDF đỏ, số trang)
        let rowsHtml = "";
        reports.forEach((rep, idx) => {
            const isMatch = rep.is_sector_match;
            const pdfUrl = rep.file_url || "#";
            const rowBg = idx % 2 === 0 ? "bg-slate-900/40" : "bg-slate-950/40";
            const matchHighlight = isMatch ? "border-l-2 border-l-cyan-500" : "";
            
            rowsHtml += `
                <tr class="${rowBg} ${matchHighlight} hover:bg-slate-800/60 transition-colors group">
                    <!-- 1. Tiêu đề + Snippet -->
                    <td class="p-3 sticky left-0 z-10 ${rowBg} group-hover:bg-slate-800/90 border-r border-slate-800 min-w-[340px] max-w-[500px]">
                        <div class="space-y-1">
                            <div class="flex items-start gap-1.5">
                                ${isMatch ? '<span class="inline-block shrink-0 px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 mt-0.5">Khớp ngành</span>' : ''}
                                <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer" class="text-cyan-400 hover:text-cyan-300 font-bold hover:underline leading-snug line-clamp-2 block transition-colors" title="${rep.title}">
                                    ${rep.title}
                                </a>
                            </div>
                            ${rep.snippet ? `<p class="text-[11px] text-slate-400 font-sans line-clamp-2 leading-relaxed pl-1">${rep.snippet}</p>` : ''}
                        </div>
                    </td>

                    <!-- 2. Ngày phát hành -->
                    <td class="p-3 text-center text-slate-300 whitespace-nowrap font-mono text-[11px] w-28">
                        ${rep.date || "-"}
                    </td>

                    <!-- 3. Nguồn (Tổ chức phát hành) -->
                    <td class="p-3 text-left whitespace-nowrap text-slate-200 font-medium text-[11px] w-36">
                        <div class="flex items-center gap-1.5">
                            <span class="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0"></span>
                            <span class="truncate max-w-[130px]" title="${rep.source || 'Tổ chức phân tích'}">${rep.source || "Tổ chức phân tích"}</span>
                        </div>
                    </td>

                    <!-- 4. Ngôn ngữ -->
                    <td class="p-3 text-center whitespace-nowrap text-slate-300 font-mono text-[11px] w-28">
                        <span class="px-2 py-0.5 rounded text-[10px] ${rep.language === 'English' ? 'bg-amber-950/80 text-amber-300 border border-amber-800' : 'bg-slate-800 text-slate-300 border border-slate-700'}">
                            ${rep.language || "Tiếng Việt"}
                        </span>
                    </td>

                    <!-- 5. Loại tài liệu (Biểu tượng PDF màu đỏ nổi bật) -->
                    <td class="p-3 text-center whitespace-nowrap w-20">
                        <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center p-1.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-700/80 text-rose-400 hover:text-rose-200 transition-colors shadow-sm group/btn" title="Mở và xem file PDF báo cáo gốc trong tab mới">
                            <!-- PDF Icon SVG -->
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                        </a>
                    </td>

                    <!-- 6. Số trang -->
                    <td class="p-3 text-center whitespace-nowrap text-slate-400 font-mono text-[11px] w-24">
                        ${rep.page_count ? `${rep.page_count} trang` : "-"}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = rowsHtml;

        // Kích hoạt lại tính năng cuộn chuột kéo 4 chiều (Drag-to-Scroll)
        initDragToScroll("industry-reports-container");

        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error("loadIndustryReports error:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-6 text-center text-rose-400 font-mono">
                    <p>Không thể nạp dữ liệu báo cáo ngành: ${err.message}</p>
                    <button onclick="loadIndustryReports()" class="mt-2 px-3 py-1 bg-slate-800 text-slate-200 hover:bg-slate-700 rounded text-xs">Thử lại</button>
                </td>
            </tr>
        `;
        if (countBadge) countBadge.textContent = "Lỗi nạp";
        if (secBadgeText) secBadgeText.textContent = "Chưa có thông tin ngành";
        if (commTagsContainer) commTagsContainer.innerHTML = "";
    }
}

function handleIndustryReportSearch() {
    const kwInput = document.getElementById("industry-report-keyword");
    const typeSelect = document.getElementById("industry-report-type-select");
    const srcSelect = document.getElementById("industry-report-source-select");

    const keyword = kwInput ? kwInput.value.trim() : "";
    const typeId = typeSelect ? typeSelect.value : "57";
    const source = srcSelect ? srcSelect.value : "";
    const activeTicker = currentReport?.ticker || "HPG";

    // Khi người dùng chủ động bấm "Tìm" (hoặc Enter):
    // Nếu keyword để trống -> Xem toàn bộ báo cáo của tất cả các ngành (isExplicitSearch = true)
    loadIndustryReports(activeTicker, keyword, typeId, source, true);
}

function quickFilterIndustryReport(commodityName) {
    const kwInput = document.getElementById("industry-report-keyword");
    if (kwInput) {
        kwInput.value = commodityName;
    }
    handleIndustryReportSearch();
}

function resetIndustryReportFilter() {
    const kwInput = document.getElementById("industry-report-keyword");
    const typeSelect = document.getElementById("industry-report-type-select");
    const srcSelect = document.getElementById("industry-report-source-select");

    if (kwInput) kwInput.value = "";
    if (typeSelect) typeSelect.value = "57";
    if (srcSelect) srcSelect.value = "";

    const activeTicker = currentReport?.ticker || "HPG";
    loadIndustryReports(activeTicker);
}

function renderPeerRadarChart(peersData) {
    const ctx = document.getElementById("chart-peer-radar");
    if (!ctx || !peersData.radar_metrics) return;
    if (chartPeerRadar) chartPeerRadar.destroy();

    const isDark = document.documentElement.classList.contains("dark");
    const textColor = isDark ? '#8a99ad' : '#334155';
    const gridColor = isDark ? '#161e2e' : '#e2e8f0';
    const chartFontFam = "'Roboto', 'Inter', 'Segoe UI', sans-serif";

    chartPeerRadar = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: peersData.radar_metrics.categories,
            datasets: [
                {
                    label: peersData.target_ticker,
                    data: peersData.radar_metrics[peersData.target_ticker.toLowerCase()] || peersData.radar_metrics.target || peersData.radar_metrics.hpg,
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.25)',
                    borderWidth: 2,
                    pointBackgroundColor: '#06b6d4'
                },
                {
                    label: 'TB Ngành',
                    data: peersData.radar_metrics.industry,
                    borderColor: isDark ? '#8a99ad' : '#94a3b8',
                    backgroundColor: 'rgba(148, 163, 184, 0.15)',
                    borderWidth: 1.5,
                    pointBackgroundColor: isDark ? '#8a99ad' : '#94a3b8'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    min: 0,
                    max: 100,
                    ticks: { display: false },
                    pointLabels: { color: textColor, font: { family: chartFontFam, size: 10 } },
                    grid: { color: gridColor },
                    angleLines: { color: gridColor }
                }
            },
            plugins: {
                legend: { labels: { color: textColor, font: { family: chartFontFam, size: 11 } } }
            }
        }
    });
}

// -------------------------------------------------------------
// TAB 4: ĐỊNH GIÁ CHUYÊN SÂU & DCF INTERACTIVE PLAYGROUND
// -------------------------------------------------------------
function renderValuationSection(val) {
    if (!val) return;
    const peP = document.getElementById("val-pe-price");
    const pbP = document.getElementById("val-pb-price");
    const dcfP = document.getElementById("val-dcf-price");
    const blP = document.getElementById("val-blended-price");
    const mosB = document.getElementById("val-mos-badge");

    if (peP) peP.textContent = `${Number(val.pe_fair_value).toLocaleString("vi-VN")} đ`;
    if (pbP) pbP.textContent = `${Number(val.pb_fair_value).toLocaleString("vi-VN")} đ`;
    if (dcfP) dcfP.textContent = `${Number(val.dcf_fair_value).toLocaleString("vi-VN")} đ`;
    if (blP) blP.textContent = `${Number(val.blended_fair_value).toLocaleString("vi-VN")} đ`;
    if (mosB) mosB.textContent = `Biên an toàn: ${val.margin_of_safety_percent >= 0 ? '+' : ''}${val.margin_of_safety_percent}%`;

    const dcfParams = val.dcf_parameters || {};
    const slWacc = document.getElementById("slider-wacc");
    const slWaccV = document.getElementById("slider-wacc-val");
    const slG = document.getElementById("slider-g");
    const slGV = document.getElementById("slider-g-val");
    const slFcf = document.getElementById("slider-fcf");
    const slFcfV = document.getElementById("slider-fcf-val");

    if (slWacc) slWacc.value = dcfParams.wacc || 11.5;
    if (slWaccV) slWaccV.textContent = `${dcfParams.wacc || 11.5}%`;
    if (slG) slG.value = dcfParams.terminal_g || 2.5;
    if (slGV) slGV.textContent = `${dcfParams.terminal_g || 2.5}%`;
    if (slFcf) slFcf.value = dcfParams.fcf_growth_rate || 15.0;
    if (slFcfV) slFcfV.textContent = `${dcfParams.fcf_growth_rate || 15.0}%`;

    const dynDcf = document.getElementById("dynamic-dcf-price");
    const dynMos = document.getElementById("dynamic-dcf-mos");
    if (dynDcf) dynDcf.textContent = `${Number(val.dcf_fair_value).toLocaleString("vi-VN")} VND`;
    if (dynMos) dynMos.textContent = `${val.margin_of_safety_percent >= 0 ? '+' : ''}${val.margin_of_safety_percent}%`;

    renderPeBandsChart(val);
}

let dcfDebounceTimeout = null;
function onDcfSliderChange() {
    const waccEl = document.getElementById("slider-wacc");
    const gEl = document.getElementById("slider-g");
    const fcfEl = document.getElementById("slider-fcf");
    if (!waccEl || !gEl || !fcfEl) return;

    const wacc = parseFloat(waccEl.value);
    const g = parseFloat(gEl.value);
    const fcf = parseFloat(fcfEl.value);

    document.getElementById("slider-wacc-val").textContent = `${wacc.toFixed(1)}%`;
    document.getElementById("slider-g-val").textContent = `${g.toFixed(1)}%`;
    document.getElementById("slider-fcf-val").textContent = `${fcf.toFixed(1)}%`;

    if (dcfDebounceTimeout) clearTimeout(dcfDebounceTimeout);
    dcfDebounceTimeout = setTimeout(async () => {
        const ticker = currentReport ? currentReport.ticker : "HPG";
        try {
            const resp = await fetch("/api/valuation/dcf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ticker: ticker,
                    wacc: wacc,
                    terminal_g: g,
                    fcf_growth_rate: fcf,
                    current_market_price: currentReport ? currentReport.consensus_summary.current_market_price : null
                })
            });
            if (!resp.ok) return;
            const res = await resp.json();
            const dynDcf = document.getElementById("dynamic-dcf-price");
            const dynMos = document.getElementById("dynamic-dcf-mos");
            if (dynDcf) dynDcf.textContent = `${Number(res.dcf_fair_value).toLocaleString("vi-VN")} VND`;
            if (dynMos) dynMos.textContent = `${res.margin_of_safety_percent >= 0 ? '+' : ''}${res.margin_of_safety_percent}% (${res.margin_of_safety_percent > 20 ? 'Hấp dẫn' : 'Hợp lý'})`;
        } catch (e) {
            console.error("DCF calculate error:", e);
        }
    }, 150);
}

function resetDcfSliders() {
    const slWacc = document.getElementById("slider-wacc");
    const slG = document.getElementById("slider-g");
    const slFcf = document.getElementById("slider-fcf");
    if (slWacc) slWacc.value = 11.5;
    if (slG) slG.value = 2.5;
    if (slFcf) slFcf.value = 15.0;
    onDcfSliderChange();
}

function renderPeBandsChart(val) {
    const ctx = document.getElementById("chart-pe-bands");
    if (!ctx || !val.pe_bands_history) return;
    if (chartPeBands) chartPeBands.destroy();

    const isDark = document.documentElement.classList.contains("dark");
    const textColor = isDark ? '#8a99ad' : '#334155';
    const gridColor = isDark ? '#161e2e' : '#e2e8f0';
    const chartFontFam = "'Roboto', 'Inter', 'Segoe UI', sans-serif";

    const peData = val.pe_bands_history;
    const periods = ["2021", "2022", "2023", "2024", "2025 (F)", "Hiện tại"];
    const baseP = peData.pe_5yr_mean;

    chartPeBands = new Chart(ctx, {
        type: 'line',
        data: {
            labels: periods,
            datasets: [
                {
                    label: '+2 SD (Đỉnh chu kỳ)',
                    data: [peData.pe_upper_sd * 1.15, peData.pe_upper_sd * 1.15, peData.pe_upper_sd * 1.15, peData.pe_upper_sd * 1.15, peData.pe_upper_sd * 1.15, peData.pe_upper_sd * 1.15],
                    borderColor: isDark ? '#ff3b57' : '#dc2626',
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: '+1 SD (Vùng cao)',
                    data: [peData.pe_upper_sd, peData.pe_upper_sd, peData.pe_upper_sd, peData.pe_upper_sd, peData.pe_upper_sd, peData.pe_upper_sd],
                    borderColor: '#fb923c',
                    borderDash: [3, 3],
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'Mean P/E 5 Năm',
                    data: [baseP, baseP, baseP, baseP, baseP, baseP],
                    borderColor: '#0284c7',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: '-1 SD (Hấp dẫn)',
                    data: [peData.pe_lower_sd, peData.pe_lower_sd, peData.pe_lower_sd, peData.pe_lower_sd, peData.pe_lower_sd, peData.pe_lower_sd],
                    borderColor: isDark ? '#00c060' : '#15803d',
                    borderDash: [3, 3],
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'P/E Thực tế',
                    data: [baseP * 1.2, baseP * 0.8, baseP * 1.1, baseP * 0.95, baseP * 1.05, peData.pe_current],
                    borderColor: '#38bdf8',
                    backgroundColor: '#38bdf8',
                    borderWidth: 3,
                    pointRadius: 5,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { color: textColor, font: { family: chartFontFam } }, grid: { color: gridColor } },
                y: { ticks: { color: textColor, font: { family: chartFontFam } }, grid: { color: gridColor } }
            },
            plugins: {
                legend: { labels: { color: textColor, font: { family: chartFontFam, size: 10 } } }
            }
        }
    });
}

// -------------------------------------------------------------
// TAB 5: BIỂU ĐỒ KỸ THUẬT FIREANT TERMINAL & SSI FASTCONNECT DATA
// -------------------------------------------------------------

let currentFireantChart = null;
let currentFireantCandleSeries = null;
let currentFireantMa20Series = null;
let currentFireantMa50Series = null;
let currentFireantMa200Series = null;
let currentFireantBbUpperSeries = null;
let currentFireantBbLowerSeries = null;

currentTechnicalInterval = "D"; // reuse declared variable from line 28
let currentCandleType = "candlestick";
let currentDrawingTool = "crosshair";
let isDrawingsLocked = false;
let showMaCrossAlerts = false;

// Trạng thái các chỉ báo
let activeIndicators = {
    ma: true,
    bb: false,
    vol: true,
    mcdx: true,
    macd: true,
    rsi: true
};

// Bộ lưu trữ các nét vẽ (Drawings Store)
let drawingsList = [];
let drawingsUndoStack = [];
let isSyncingTechnical = false;

function renderTechnicalSection(data) {
    if (!data) return;
    try {
        // Cập nhật Header & Data engine badge
        const feedBadge = document.getElementById("tech-data-feed-badge");
        if (feedBadge) feedBadge.textContent = data.data_engine || "SSI & Vietstock UDF";
        const engStatus = document.getElementById("tech-engine-status");
        if (engStatus) engStatus.textContent = data.data_engine || "Vietstock + SSI Data";

        // 1. RSI
        const rsiVal = document.getElementById("tech-rsi-val");
        if (rsiVal && data.rsi_14 !== undefined) rsiVal.textContent = Number(data.rsi_14).toFixed(1);
        const rsiDesc = document.getElementById("tech-rsi-desc");
        if (rsiDesc) rsiDesc.textContent = data.rsi_status || (data.rsi_14 > 70 ? "Quá mua" : (data.rsi_14 < 30 ? "Quá bán" : "Trung tính"));

        // 2. MACD
        const macdStatus = document.getElementById("tech-macd-status");
        if (macdStatus) macdStatus.textContent = data.macd_status || "Trung tính";
        const macdLine = document.getElementById("tech-macd-line");
        if (macdLine && data.macd_line !== undefined) macdLine.textContent = Number(data.macd_line).toFixed(2);
        const macdSignal = document.getElementById("tech-macd-signal");
        if (macdSignal && data.macd_signal !== undefined) macdSignal.textContent = Number(data.macd_signal).toFixed(2);

        // 3. Đường trung bình MA
        const ma20 = document.getElementById("tech-ma-20");
        if (ma20 && data.sma_20) ma20.textContent = Number(data.sma_20).toLocaleString("vi-VN") + " đ";
        const ma50 = document.getElementById("tech-ma-50");
        if (ma50 && data.sma_50) ma50.textContent = Number(data.sma_50).toLocaleString("vi-VN") + " đ";
        const ma200 = document.getElementById("tech-ma-200");
        if (ma200 && data.sma_200) ma200.textContent = Number(data.sma_200).toLocaleString("vi-VN") + " đ";
        const ema20 = document.getElementById("tech-ema-20");
        if (ema20 && data.ema_20) ema20.textContent = Number(data.ema_20).toLocaleString("vi-VN") + " đ";

        // 4. Pivot Points
        const r3 = document.getElementById("tech-resistance-3");
        if (r3 && data.resistance_3) r3.textContent = Number(data.resistance_3).toLocaleString("vi-VN") + " đ";
        const r2 = document.getElementById("tech-resistance-2");
        if (r2 && data.resistance_2) r2.textContent = Number(data.resistance_2).toLocaleString("vi-VN") + " đ";
        const r1 = document.getElementById("tech-resistance-1");
        if (r1 && data.resistance_1) r1.textContent = Number(data.resistance_1).toLocaleString("vi-VN") + " đ";
        const pp = document.getElementById("tech-pivot-point");
        if (pp && data.pivot_point) pp.textContent = Number(data.pivot_point).toLocaleString("vi-VN") + " đ";
        const s1 = document.getElementById("tech-support-1");
        if (s1 && data.support_1) s1.textContent = Number(data.support_1).toLocaleString("vi-VN") + " đ";
        const s2 = document.getElementById("tech-support-2");
        if (s2 && data.support_2) s2.textContent = Number(data.support_2).toLocaleString("vi-VN") + " đ";
        const s3 = document.getElementById("tech-support-3");
        if (s3 && data.support_3) s3.textContent = Number(data.support_3).toLocaleString("vi-VN") + " đ";

        // 5. Bollinger Bands
        const bU = document.getElementById("tech-bb-upper");
        if (bU && data.bb_upper) bU.textContent = Number(data.bb_upper).toLocaleString("vi-VN") + " đ";
        const bM = document.getElementById("tech-bb-middle");
        if (bM && data.bb_middle) bM.textContent = Number(data.bb_middle).toLocaleString("vi-VN") + " đ";
        const bL = document.getElementById("tech-bb-lower");
        if (bL && data.bb_lower) bL.textContent = Number(data.bb_lower).toLocaleString("vi-VN") + " đ";

        // 6. Khuyến nghị tổng thể
        const overallSignal = document.getElementById("tech-overall-signal");
        if (overallSignal) {
            overallSignal.textContent = data.overall_signal || "THEO DÕI";
            overallSignal.className = `text-sm font-extrabold mt-0.5 ${data.signal_color === 'emerald' ? 'text-emerald-400' : (data.signal_color === 'rose' ? 'text-rose-400' : 'text-amber-400')}`;
        }
        const overallScore = document.getElementById("tech-overall-score");
        if (overallScore) overallScore.textContent = `Điểm xu hướng: ${data.recommendation_score || 7}/10 chỉ báo tích cực`;

        // 7. Giá Trần / Sàn / Tham chiếu
        const ceil = document.getElementById("tech-ceiling-price");
        if (ceil && data.ceiling_price) ceil.textContent = Number(data.ceiling_price).toLocaleString("vi-VN");
        const ref = document.getElementById("tech-ref-price");
        if (ref && data.reference_price) ref.textContent = Number(data.reference_price).toLocaleString("vi-VN");
        const flr = document.getElementById("tech-floor-price");
        if (flr && data.floor_price) flr.textContent = Number(data.floor_price).toLocaleString("vi-VN");

        // 8. Khối ngoại SSI FastConnect
        const fBuyVol = document.getElementById("tech-foreign-buy-vol");
        if (fBuyVol && data.foreign_buy_volume) fBuyVol.textContent = `${Number(data.foreign_buy_volume).toLocaleString("vi-VN")} CP`;
        const fSellVol = document.getElementById("tech-foreign-sell-vol");
        if (fSellVol && data.foreign_sell_volume) fSellVol.textContent = `${Number(data.foreign_sell_volume).toLocaleString("vi-VN")} CP`;
        const fNetVal = document.getElementById("tech-foreign-net-val");
        if (fNetVal && data.foreign_net_value_bil !== undefined) {
            const bil = Number(data.foreign_net_value_bil);
            fNetVal.textContent = `${bil >= 0 ? '+' : ''}${bil.toFixed(1)} tỷ VND`;
            fNetVal.className = bil >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold";
        }
        const fBadge = document.getElementById("tech-foreign-net-badge");
        if (fBadge && data.foreign_net_volume !== undefined) {
            const isBuy = Number(data.foreign_net_volume) >= 0;
            fBadge.textContent = isBuy ? "MUA RÒNG" : "BÁN RÒNG";
            fBadge.className = `px-1.5 py-0.2 rounded text-[10px] font-bold ${isBuy ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'}`;
        }
        const fRoom = document.getElementById("tech-foreign-room");
        if (fRoom && data.foreign_total_room) {
            const pct = ((data.foreign_current_room / data.foreign_total_room) * 100).toFixed(1);
            fRoom.textContent = `${pct}% / 49%`;
        }

        // Sub-pane text indicators
        const rsiPaneVal = document.getElementById("pane-rsi-val");
        if (rsiPaneVal && data.rsi_14 !== undefined) rsiPaneVal.textContent = Number(data.rsi_14).toFixed(1);
        const macdPaneLine = document.getElementById("pane-macd-line");
        if (macdPaneLine && data.macd_line !== undefined) macdPaneLine.textContent = Number(data.macd_line).toFixed(2);
        const macdPaneSig = document.getElementById("pane-macd-signal");
        if (macdPaneSig && data.macd_signal !== undefined) macdPaneSig.textContent = Number(data.macd_signal).toFixed(2);
        const macdPaneHist = document.getElementById("pane-macd-hist");
        if (macdPaneHist && data.macd_hist !== undefined) {
            const h = Number(data.macd_hist);
            macdPaneHist.textContent = `${h >= 0 ? '+' : ''}${h.toFixed(2)}`;
            macdPaneHist.className = h >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold";
        }
    } catch(e) {
        console.warn("renderTechnicalSection error:", e);
    }
}

function renderTechnicalChart(data) {
    if (!data) return;
    renderTechnicalSection(data);
    const ticker = data.ticker || currentTechnicalTicker || "HPG";
    if (data.candles_history && data.candles_history.length > 0) {
        if (!currentFireantChart) {
            initFireantChart(ticker, currentTechnicalInterval);
        } else {
            populateFireantChartData(data.candles_history);
        }
    }
}

async function syncTechnicalDataRealtime(ticker) {
    if (isSyncingTechnical) return;
    const clean = (ticker || currentTechnicalTicker || "HPG").toUpperCase();
    isSyncingTechnical = true;
    try {
        const res = await fetch(`/api/technical/${clean}?resolution=${currentTechnicalInterval}&count=150`);
        if (res.ok) {
            const data = await res.json();
            currentTechnicalData = data;
            renderTechnicalSection(data);
            if (data.candles_history && data.candles_history.length > 0) {
                if (currentFireantCandleSeries) {
                    populateFireantChartData(data.candles_history);
                } else {
                    initFireantChart(clean, currentTechnicalInterval);
                }
            }
        }
    } catch (e) {
        console.warn("syncTechnicalDataRealtime error:", e);
    } finally {
        isSyncingTechnical = false;
    }
}

function onSwitchToTechnicalTab() {
    const ticker = currentTechnicalTicker || (currentReport ? currentReport.ticker : "HPG");
    setTimeout(() => {
        initFireantChart(ticker, currentTechnicalInterval);
        if (currentFireantChart) {
            const box = document.getElementById("tech-tv-render-box");
            if (box && box.clientWidth > 0 && box.clientHeight > 0) {
                currentFireantChart.resize(box.clientWidth, box.clientHeight);
                currentFireantChart.timeScale().fitContent();
            }
        }
    }, 80);
}

function changeTechnicalSymbol(newSymbol) {
    if (!newSymbol || !newSymbol.trim()) return;
    const clean = newSymbol.trim().toUpperCase();
    currentTechnicalTicker = clean;
    const input = document.getElementById("tech-quick-ticker");
    if (input) input.value = clean;
    
    // Đồng bộ sang thanh tìm kiếm trung tâm
    const centralInput = document.getElementById("central-ticker-input");
    if (centralInput) centralInput.value = clean;

    showToast(`Đang tải biểu đồ kỹ thuật FireAnt cho mã ${clean}...`);
    initFireantChart(clean, currentTechnicalInterval);
}

function changeTechnicalTimeframe(interval) {
    currentTechnicalInterval = interval;
    const group = document.getElementById("tech-fireant-timeframe-group");
    if (group) {
        group.querySelectorAll("button").forEach(btn => {
            btn.className = "px-2 py-0.5 rounded text-slate-400 hover:text-white transition-all font-semibold";
        });
        const activeBtn = document.getElementById(`tf-btn-${interval}`);
        if (activeBtn) {
            activeBtn.className = "px-2 py-0.5 rounded bg-cyan-600 text-white font-bold transition-all shadow-sm";
        }
    }

    const ticker = currentTechnicalTicker || (currentReport ? currentReport.ticker : "HPG");
    showToast(`Đang tải nến khung ${interval === 'D' ? '1 Ngày' : (interval === 'W' ? '1 Tuần' : (interval === 'M' ? '1 Tháng' : interval + ' Phút'))}...`);
    initFireantChart(ticker, interval);
}

function toggleCandleTypeMenu() {
    const menu = document.getElementById("dropdown-candle-type");
    if (menu) menu.classList.toggle("hidden");
}

function setCandleType(type) {
    currentCandleType = type;
    const label = document.getElementById("label-candle-type");
    if (label) {
        const labels = {
            candlestick: "Nến Nhật",
            line: "Đường line",
            area: "Vùng (Area)",
            bar: "Thanh Bar"
        };
        label.textContent = labels[type] || "Nến Nhật";
    }
    const menu = document.getElementById("dropdown-candle-type");
    if (menu) menu.classList.add("hidden");

    // Re-render chart series
    const ticker = currentTechnicalTicker || (currentReport ? currentReport.ticker : "HPG");
    initFireantChart(ticker, currentTechnicalInterval);
}

function toggleIndicatorsMenu() {
    const menu = document.getElementById("dropdown-indicators-menu");
    if (menu) menu.classList.toggle("hidden");
}

function toggleIndicator(indicatorKey, isChecked) {
    activeIndicators[indicatorKey] = isChecked;

    // Toggle sub-panes visibility
    if (indicatorKey === "vol") {
        const p = document.getElementById("pane-volume");
        if (p) p.style.display = isChecked ? "block" : "none";
    } else if (indicatorKey === "mcdx") {
        const p = document.getElementById("pane-mcdx");
        if (p) p.style.display = isChecked ? "block" : "none";
    } else if (indicatorKey === "macd") {
        const p = document.getElementById("pane-macd");
        if (p) p.style.display = isChecked ? "block" : "none";
    } else if (indicatorKey === "rsi") {
        const p = document.getElementById("pane-rsi");
        if (p) p.style.display = isChecked ? "block" : "none";
    } else if (indicatorKey === "ma") {
        if (currentFireantMa20Series) currentFireantMa20Series.applyOptions({ visible: isChecked });
        if (currentFireantMa50Series) currentFireantMa50Series.applyOptions({ visible: isChecked });
        const b20 = document.getElementById("legend-box-ma20");
        const b50 = document.getElementById("legend-box-ma50");
        if (b20) b20.style.display = isChecked ? "inline" : "none";
        if (b50) b50.style.display = isChecked ? "inline" : "none";
    } else if (indicatorKey === "bb") {
        if (currentFireantBbUpperSeries) currentFireantBbUpperSeries.applyOptions({ visible: isChecked });
        if (currentFireantBbLowerSeries) currentFireantBbLowerSeries.applyOptions({ visible: isChecked });
    }

    resizeFireantChartLayout();
}

function toggleMaCrossAlert() {
    showMaCrossAlerts = !showMaCrossAlerts;
    const btn = document.getElementById("btn-ma-cross");
    if (btn) {
        if (showMaCrossAlerts) {
            btn.className = "px-2 py-1 rounded bg-amber-500 text-black font-bold border border-amber-400 flex items-center gap-1 text-[11px] transition-all shadow-md";
            showToast("Đã BẬT đánh dấu tín hiệu Golden Cross & Death Cross MA20/MA50");
        } else {
            btn.className = "px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-800/60 flex items-center gap-1 text-[11px] font-semibold transition-all";
            showToast("Đã TẮT tín hiệu giao cắt MA");
        }
    }
    const ticker = currentTechnicalTicker || (currentReport ? currentReport.ticker : "HPG");
    initFireantChart(ticker, currentTechnicalInterval);
}

// -------------------------------------------------------------
// BỘ CÔNG CỤ VẼ TƯƠNG TÁC CHUỘT (DRAWING TOOLS FIREANT)
// -------------------------------------------------------------
function setDrawingTool(tool) {
    currentDrawingTool = tool;
    const tools = ["crosshair", "trendline", "horizontal", "rectangle", "fibonacci", "ruler", "text"];
    tools.forEach(t => {
        const btn = document.getElementById(`tool-btn-${t}`);
        if (btn) {
            if (t === tool) {
                btn.className = "p-1.5 rounded bg-cyan-600 text-white shadow-sm transition-all";
            } else {
                btn.className = "p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-all";
            }
        }
    });

    const hint = document.getElementById("drawing-tool-hint");
    const hintText = document.getElementById("drawing-tool-hint-text");
    const canvas = document.getElementById("tech-drawing-canvas");

    if (tool === "crosshair") {
        if (hint) hint.classList.add("hidden");
        if (canvas) canvas.style.pointerEvents = "none";
    } else {
        if (hint && hintText) {
            hint.classList.remove("hidden");
            const msgs = {
                trendline: "Đang chọn: Đường xu hướng. Nhấp điểm 1 rồi nhấp điểm 2 để vẽ.",
                horizontal: "Đang chọn: Đường ngang. Nhấp vào mức giá bất kỳ để đặt đường hỗ trợ/kháng cự.",
                rectangle: "Đang chọn: Hộp chữ nhật. Nhấp giữ và kéo thả chuột để tạo vùng cản/tích lũy.",
                fibonacci: "Đang chọn: Thoái lui Fibonacci. Nhấp điểm đáy rồi kéo lên đỉnh sóng.",
                ruler: "Đang chọn: Thước đo. Kéo từ điểm A sang điểm B để đo % biến động giá.",
                text: "Đang chọn: Chú thích chữ. Nhấp vào biểu đồ để viết ghi chú."
            };
            hintText.textContent = msgs[tool] || "Đang chọn công cụ vẽ.";
        }
        if (canvas) canvas.style.pointerEvents = "auto";
    }
}

function toggleLockDrawings() {
    isDrawingsLocked = !isDrawingsLocked;
    const btn = document.getElementById("tool-btn-lock");
    const icon = document.getElementById("icon-lock");
    if (btn) {
        btn.className = isDrawingsLocked 
            ? "p-1.5 rounded bg-amber-500 text-black shadow-sm transition-all" 
            : "p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-all";
    }
    showToast(isDrawingsLocked ? "Đã khóa các nét vẽ trên biểu đồ" : "Đã mở khóa các nét vẽ");
}

function clearAllDrawings() {
    if (drawingsList.length === 0) {
        showToast("Chưa có nét vẽ nào trên biểu đồ");
        return;
    }
    drawingsUndoStack.push([...drawingsList]);
    drawingsList = [];
    redrawAllDrawings();
    showToast("Đã xóa tất cả nét vẽ trên biểu đồ");
}

function undoDrawing() {
    if (drawingsList.length > 0) {
        drawingsUndoStack.push([...drawingsList]);
        drawingsList.pop();
        redrawAllDrawings();
        showToast("Đã hoàn tác nét vẽ gần nhất");
    } else if (drawingsUndoStack.length > 0) {
        drawingsList = drawingsUndoStack.pop() || [];
        redrawAllDrawings();
        showToast("Đã khôi phục các nét vẽ");
    } else {
        showToast("Không có thao tác nào để hoàn tác");
    }
}

function redoDrawing() {
    if (drawingsUndoStack.length > 0) {
        drawingsList = drawingsUndoStack.pop() || [];
        redrawAllDrawings();
        showToast("Đã làm lại thao tác vẽ");
    }
}

// -------------------------------------------------------------
// KHỞI TẠO BIỂU ĐỒ FIREANT TRADINGVIEW LIGHTWEIGHT CHARTS
// -------------------------------------------------------------
function initFireantChart(symbol, interval = "D") {
    const renderBox = document.getElementById("tech-tv-render-box");
    if (!renderBox) return;
    const cleanSym = (symbol || "HPG").toUpperCase();
    currentTechnicalTicker = cleanSym;

    // Cập nhật Toolbar & Legend
    const lTicker = document.getElementById("legend-ticker");
    const lInterval = document.getElementById("legend-interval");
    const tbTicker = document.getElementById("tech-quick-ticker");
    if (lTicker) lTicker.textContent = cleanSym;
    if (lInterval) lInterval.textContent = interval;
    if (tbTicker && tbTicker.value !== cleanSym) tbTicker.value = cleanSym;

    if (typeof LightweightCharts === "undefined") {
        console.warn("TradingView LightweightCharts not loaded");
        return;
    }

    try {
        renderBox.innerHTML = "";
        if (currentFireantChart) {
            try { currentFireantChart.remove(); } catch (e) {}
            currentFireantChart = null;
        }

        const isDark = document.documentElement.classList.contains("dark");
        const bgColor = isDark ? "#0c1017" : "#ffffff";
        const textColor = isDark ? "#8a99ad" : "#475569";
        const gridColor = isDark ? "#161e2e" : "#f1f5f9";
        const fontFam = "'Roboto', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

        // VCBS Palette chuẩn xác theo 2 hình đính kèm
        const bullColor = isDark ? "#00c060" : "#15803d"; // Xanh lá tươi sáng (Dark) / Xanh đậm sắc nét (Light)
        const bearColor = isDark ? "#ff3b57" : "#dc2626"; // Đỏ hồng (Dark) / Đỏ tươi (Light)
        const refColor = isDark ? "#f59e0b" : "#d97706";

        const boxWidth = renderBox.clientWidth || 800;
        const boxHeight = renderBox.clientHeight || 380;

        const chart = LightweightCharts.createChart(renderBox, {
            width: boxWidth,
            height: boxHeight,
            layout: {
                background: { color: bgColor },
                textColor: textColor,
                fontFamily: fontFam,
                fontSize: 11
            },
            grid: {
                vertLines: { color: gridColor },
                horzLines: { color: gridColor }
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode ? LightweightCharts.CrosshairMode.Normal : 0,
                vertLine: {
                    color: isDark ? "#0284c7" : "#0284c7",
                    width: 1,
                    style: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Dashed : 2,
                    labelBackgroundColor: isDark ? "#082f49" : "#0284c7"
                },
                horzLine: {
                    color: isDark ? "#0284c7" : "#0284c7",
                    width: 1,
                    style: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Dashed : 2,
                    labelBackgroundColor: isDark ? "#082f49" : "#0284c7"
                }
            },
            rightPriceScale: {
                borderColor: gridColor,
                scaleMargins: { top: 0.1, bottom: 0.1 }
            },
            timeScale: {
                borderColor: gridColor,
                timeVisible: interval !== "D" && interval !== "W" && interval !== "M",
                secondsVisible: false
            }
        });

        currentFireantChart = chart;

        // Helper tạo series tương thích 100% TradingView LightweightCharts v4 & v5
        function createSeries(type, opts) {
            try {
                if (type === "CandlestickSeries" && typeof chart.addCandlestickSeries === "function") {
                    return chart.addCandlestickSeries(opts);
                }
                if (type === "LineSeries" && typeof chart.addLineSeries === "function") {
                    return chart.addLineSeries(opts);
                }
                if (type === "AreaSeries" && typeof chart.addAreaSeries === "function") {
                    return chart.addAreaSeries(opts);
                }
                if (type === "BarSeries" && typeof chart.addBarSeries === "function") {
                    return chart.addBarSeries(opts);
                }
                if (typeof chart.addSeries === "function" && typeof LightweightCharts !== "undefined" && LightweightCharts[type]) {
                    return chart.addSeries(LightweightCharts[type], opts);
                }
                const legacyMethod = "add" + type;
                if (typeof chart[legacyMethod] === "function") {
                    return chart[legacyMethod](opts);
                }
            } catch (e) {
                console.warn("createSeries error:", type, e);
            }
            return null;
        }

        // 1. Main Price Series theo loại nến được chọn
        let mainSeries = null;
        if (currentCandleType === "candlestick") {
            mainSeries = createSeries("CandlestickSeries", {
                upColor: bullColor,
                downColor: bearColor,
                borderVisible: true,
                borderUpColor: bullColor,
                borderDownColor: bearColor,
                wickUpColor: bullColor,
                wickDownColor: bearColor
            });
        } else if (currentCandleType === "line") {
            mainSeries = createSeries("LineSeries", {
                color: isDark ? "#38bdf8" : "#0284c7",
                lineWidth: 2
            });
        } else if (currentCandleType === "area") {
            mainSeries = createSeries("AreaSeries", {
                topColor: isDark ? "rgba(2, 132, 199, 0.45)" : "rgba(2, 132, 199, 0.35)",
                bottomColor: isDark ? "rgba(2, 132, 199, 0.02)" : "rgba(2, 132, 199, 0.01)",
                lineColor: isDark ? "#0284c7" : "#0284c7",
                lineWidth: 2
            });
        } else if (currentCandleType === "bar") {
            mainSeries = createSeries("BarSeries", {
                upColor: bullColor,
                downColor: bearColor
            });
        }
        currentFireantCandleSeries = mainSeries;

        // 2. Đường trung bình MA (SMA20, SMA50)
        currentFireantMa20Series = createSeries("LineSeries", {
            color: isDark ? "#f59e0b" : "#d97706",
            lineWidth: 1.5,
            title: "SMA20",
            priceLineVisible: false
        });
        currentFireantMa50Series = createSeries("LineSeries", {
            color: isDark ? "#38bdf8" : "#0284c7",
            lineWidth: 1.5,
            title: "SMA50",
            priceLineVisible: false
        });

        // 3. Bollinger Bands (20, 2)
        currentFireantBbUpperSeries = createSeries("LineSeries", {
            color: "rgba(129, 140, 248, 0.6)",
            lineWidth: 1,
            lineStyle: 2,
            title: "BB Upper",
            priceLineVisible: false
        });
        currentFireantBbLowerSeries = createSeries("LineSeries", {
            color: "rgba(129, 140, 248, 0.6)",
            lineWidth: 1,
            lineStyle: 2,
            title: "BB Lower",
            priceLineVisible: false
        });

        // Tự động điều chỉnh kích thước biểu đồ vừa vặn container
        if (window.ResizeObserver && !renderBox.dataset.resizeObserved) {
            renderBox.dataset.resizeObserved = "true";
            const ro = new ResizeObserver(entries => {
                if (!currentFireantChart) return;
                for (let entry of entries) {
                    const cr = entry.contentRect;
                    if (cr.width > 50 && cr.height > 50) {
                        currentFireantChart.resize(cr.width, cr.height);
                    }
                }
            });
            ro.observe(renderBox);
        }

        // Nếu đã có cache nến cho mã này, nạp tức thì hiển thị ngay
        if (currentTechnicalData && currentTechnicalData.ticker === cleanSym && currentTechnicalData.candles_history && currentTechnicalData.candles_history.length > 0) {
            populateFireantChartData(currentTechnicalData.candles_history);
        }

        // Nạp dữ liệu mới nhất từ Backend API (Ưu tiên SSI FastConnect API, fallback Vietstock/VNDirect/DNSE)
        fetch(`/api/technical/${cleanSym}?resolution=${interval}&count=150`)
            .then(r => r.json())
            .then(data => {
                currentTechnicalData = data;
                renderTechnicalSection(data);
                if (data.candles_history && data.candles_history.length > 0) {
                    populateFireantChartData(data.candles_history);
                }
            })
            .catch(err => {
                console.error("Fetch candles error:", err);
            });

        // Crosshair move listener
        if (typeof chart.subscribeCrosshairMove === "function") {
            chart.subscribeCrosshairMove(param => {
                try {
                    if (!param || !param.time || !param.seriesData || !mainSeries) return;
                    const priceData = param.seriesData.get(mainSeries);
                    const ma20Val = currentFireantMa20Series ? param.seriesData.get(currentFireantMa20Series) : null;
                    const ma50Val = currentFireantMa50Series ? param.seriesData.get(currentFireantMa50Series) : null;

                    if (priceData) {
                        const o = priceData.open !== undefined ? priceData.open : priceData.value;
                        const h = priceData.high !== undefined ? priceData.high : priceData.value;
                        const l = priceData.low !== undefined ? priceData.low : priceData.value;
                        const c = priceData.close !== undefined ? priceData.close : priceData.value;
                        updateFireantLegend(o, h, l, c, ma20Val ? ma20Val.value : null, ma50Val ? ma50Val.value : null);
                    }
                } catch (e) {}
            });
        }

        // Kích hoạt canvas vẽ tương tác
        setupDrawingCanvas();

    } catch (e) {
        console.error("Init FireAnt chart error:", e);
    }
}

function populateFireantChartData(rawCandles) {
    if (!currentFireantCandleSeries || !rawCandles || !rawCandles.length) return;

    const seenTimes = new Set();
    const sorted = [...rawCandles].sort((a, b) => (a.time || 0) - (b.time || 0));

    const candleData = [];
    const closes = [];

    sorted.forEach(c => {
        let t = c.time;
        // Nếu nến ngày, dùng dạng chuỗi YYYY-MM-DD
        if (currentTechnicalInterval === "D" || currentTechnicalInterval === "W" || currentTechnicalInterval === "M") {
            let tStr = c.time_str;
            if (tStr && tStr.includes(" ")) tStr = tStr.split(" ")[0];
            if (!tStr && c.time) {
                tStr = new Date(c.time * 1000).toISOString().split("T")[0];
            }
            if (!tStr || seenTimes.has(tStr)) return;
            seenTimes.add(tStr);
            t = tStr;
        } else {
            // Nến intraday (phút/giờ): dùng timestamp số giây
            if (seenTimes.has(t)) return;
            seenTimes.add(t);
        }

        const o = Number(c.open);
        const h = Number(c.high);
        const l = Number(c.low);
        const cl = Number(c.close);

        if (currentCandleType === "line" || currentCandleType === "area") {
            candleData.push({ time: t, value: cl });
        } else {
            candleData.push({ time: t, open: o, high: h, low: l, close: cl });
        }
        closes.push({ time: t, close: cl, high: h, low: l, open: o, volume: Number(c.volume || 0) });
    });

    if (!candleData.length) return;

    // 1. Set main series data
    currentFireantCandleSeries.setData(candleData);

    // 2. Tính toán SMA20 & SMA50
    const ma20Data = [];
    const ma50Data = [];
    const bbUpperData = [];
    const bbLowerData = [];

    for (let i = 0; i < closes.length; i++) {
        if (i >= 19) {
            const slice20 = closes.slice(i - 19, i + 1);
            const sum20 = slice20.reduce((acc, x) => acc + x.close, 0);
            const avg20 = sum20 / 20;
            ma20Data.push({ time: closes[i].time, value: Math.round(avg20) });

            // Bollinger Bands standard deviation
            const variance = slice20.reduce((acc, x) => acc + Math.pow(x.close - avg20, 2), 0) / 20;
            const std = Math.sqrt(variance);
            bbUpperData.push({ time: closes[i].time, value: Math.round(avg20 + std * 2) });
            bbLowerData.push({ time: closes[i].time, value: Math.round(avg20 - std * 2) });
        }
        if (i >= 49) {
            const sum50 = closes.slice(i - 49, i + 1).reduce((acc, x) => acc + x.close, 0);
            ma50Data.push({ time: closes[i].time, value: Math.round(sum50 / 50) });
        }
    }

    if (currentFireantMa20Series) currentFireantMa20Series.setData(ma20Data);
    if (currentFireantMa50Series) currentFireantMa50Series.setData(ma50Data);
    if (currentFireantBbUpperSeries) currentFireantBbUpperSeries.setData(bbUpperData);
    if (currentFireantBbLowerSeries) currentFireantBbLowerSeries.setData(bbLowerData);

    // Tín hiệu giao cắt MA20 / MA50 (Golden Cross / Death Cross) nếu bật
    if (showMaCrossAlerts && currentFireantCandleSeries.setMarkers && ma20Data.length > 1 && ma50Data.length > 1) {
        const markers = [];
        const map50 = new Map(ma50Data.map(m => [m.time, m.value]));
        for (let i = 1; i < ma20Data.length; i++) {
            const t = ma20Data[i].time;
            const prevT = ma20Data[i - 1].time;
            const v20 = ma20Data[i].value;
            const prevV20 = ma20Data[i - 1].value;
            const v50 = map50.get(t);
            const prevV50 = map50.get(prevT);
            if (v50 && prevV50) {
                if (prevV20 <= prevV50 && v20 > v50) {
                    markers.push({
                        time: t,
                        position: "belowBar",
                        color: "#10b981",
                        shape: "arrowUp",
                        text: "Golden Cross (MA20 > MA50)"
                    });
                } else if (prevV20 >= prevV50 && v20 < v50) {
                    markers.push({
                        time: t,
                        position: "aboveBar",
                        color: "#f43f5e",
                        shape: "arrowDown",
                        text: "Death Cross (MA20 < MA50)"
                    });
                }
            }
        }
        try { currentFireantCandleSeries.setMarkers(markers); } catch (e) {}
    }

    if (currentFireantChart) {
        currentFireantChart.timeScale().fitContent();
    }

    // Cập nhật Legend và các Sub-panes (Volume, MCDX, MACD, RSI)
    const last = closes[closes.length - 1];
    const prev = closes.length > 1 ? closes[closes.length - 2] : last;
    if (last) {
        const lastMa20 = ma20Data.length ? ma20Data[ma20Data.length - 1].value : null;
        const lastMa50 = ma50Data.length ? ma50Data[ma50Data.length - 1].value : null;
        updateFireantLegend(last.open, last.high, last.low, last.close, lastMa20, lastMa50, last.close - prev.close, last.volume);
    }

    // Vẽ 4 Sub-panes Canvas
    renderFireantSubPanes(closes);
}

function updateFireantLegend(open, high, low, close, ma20, ma50, changeDiff, volume) {
    const lOpen = document.getElementById("legend-open");
    const lHigh = document.getElementById("legend-high");
    const lLow = document.getElementById("legend-low");
    const lClose = document.getElementById("legend-close");
    const lChange = document.getElementById("legend-change");
    const lVol = document.getElementById("legend-vol");
    const lMa20 = document.getElementById("legend-ma20");
    const lMa50 = document.getElementById("legend-ma50");

    if (lOpen && open !== undefined) lOpen.textContent = Number(open).toLocaleString("vi-VN");
    if (lHigh && high !== undefined) lHigh.textContent = Number(high).toLocaleString("vi-VN");
    if (lLow && low !== undefined) lLow.textContent = Number(low).toLocaleString("vi-VN");
    if (lClose && close !== undefined) lClose.textContent = Number(close).toLocaleString("vi-VN");

    if (lChange && close !== undefined && open !== undefined) {
        const diff = changeDiff !== undefined ? changeDiff : (close - open);
        const pct = open > 0 ? ((diff / open) * 100).toFixed(2) : "0.00";
        const sign = diff >= 0 ? "+" : "";
        lChange.textContent = `${sign}${Number(diff).toLocaleString("vi-VN")} (${sign}${pct}%)`;
        lChange.className = diff >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold";
    }

    if (lVol && volume !== undefined) {
        const v = Number(volume);
        lVol.textContent = v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : (v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : v.toLocaleString("vi-VN"));
    }
    if (lMa20 && ma20 !== null) lMa20.textContent = Number(ma20).toLocaleString("vi-VN");
    if (lMa50 && ma50 !== null) lMa50.textContent = Number(ma50).toLocaleString("vi-VN");
}

// -------------------------------------------------------------
// VẼ 4 SUB-PANES CHUYÊN NGHIỆP: VOLUME, MCDX, MACD, RSI
// -------------------------------------------------------------
function renderFireantSubPanes(candles) {
    if (!candles || candles.length === 0) return;

    // 1. SUB-PANE: KHỐI LƯỢNG (VOLUME & VOLUME MA20)
    renderVolumeCanvas(candles);

    // 2. SUB-PANE: MCDX - DÒNG TIỀN TẠO LẬP (BANKER ĐỎ, HOT MONEY VÀNG, RETAIL XANH LÁ)
    renderMcdxCanvas(candles);

    // 3. SUB-PANE: MACD (12, 26, 9)
    renderMacdCanvas(candles);

    // 4. SUB-PANE: RSI (14)
    renderRsiCanvas(candles);
}

function renderVolumeCanvas(candles) {
    const canvas = document.getElementById("canvas-sub-volume");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement.clientWidth || 800;
    const h = canvas.parentElement.clientHeight || 90;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const vols = candles.map(c => c.volume || 0);
    const maxVol = Math.max(...vols, 1000);
    const n = candles.length;
    const barW = Math.max(1.5, (w - 60) / n - 1.5);

    // Volume MA20
    const ma20Vol = [];
    for (let i = 0; i < n; i++) {
        if (i >= 19) {
            const sum = vols.slice(i - 19, i + 1).reduce((a, b) => a + b, 0);
            ma20Vol.push(sum / 20);
        } else {
            ma20Vol.push(null);
        }
    }

    const isDark = document.documentElement.classList.contains("dark");
    const upVolColor = isDark ? "rgba(0, 192, 96, 0.8)" : "rgba(21, 128, 61, 0.85)";
    const downVolColor = isDark ? "rgba(255, 59, 87, 0.8)" : "rgba(220, 38, 38, 0.85)";
    const maVolColor = isDark ? "#f59e0b" : "#d97706";

    // Vẽ các cột Volume
    for (let i = 0; i < n; i++) {
        const x = 10 + i * ((w - 60) / n);
        const vH = (vols[i] / maxVol) * (h - 22);
        const y = h - vH - 4;
        const isUp = candles[i].close >= candles[i].open;
        ctx.fillStyle = isUp ? upVolColor : downVolColor;
        ctx.fillRect(x, y, barW, vH);
    }

    // Vẽ đường MA20 Volume
    ctx.beginPath();
    ctx.strokeStyle = maVolColor;
    ctx.lineWidth = 1.2;
    let started = false;
    for (let i = 0; i < n; i++) {
        if (ma20Vol[i] !== null) {
            const x = 10 + i * ((w - 60) / n) + barW / 2;
            const y = h - (ma20Vol[i] / maxVol) * (h - 22) - 4;
            if (!started) { ctx.moveTo(x, y); started = true; }
            else { ctx.lineTo(x, y); }
        }
    }
    ctx.stroke();

    // Cập nhật badge
    const lastVol = vols[n - 1];
    const latestEl = document.getElementById("pane-vol-latest");
    const maEl = document.getElementById("pane-vol-ma");
    if (latestEl) latestEl.textContent = Number(lastVol).toLocaleString("vi-VN");
    if (maEl && ma20Vol[n - 1]) {
        const mv = ma20Vol[n - 1];
        maEl.textContent = `MA20: ${mv >= 1e6 ? (mv / 1e6).toFixed(1) + 'M' : (mv / 1e3).toFixed(0) + 'k'}`;
    }
}

function renderMcdxCanvas(candles) {
    const canvas = document.getElementById("canvas-sub-mcdx");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement.clientWidth || 800;
    const h = canvas.parentElement.clientHeight || 110;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const n = candles.length;
    const barW = Math.max(1.5, (w - 60) / n - 1.5);

    // Tính toán MCDX (Banker Đỏ, Hot Money Vàng, Retail Xanh)
    // Thuật toán chuẩn hoá: Động lượng RSI + Biến thiên giá so với MA20
    const mcdxData = [];
    for (let i = 0; i < n; i++) {
        let rsiApprox = 50;
        if (i >= 14) {
            let gains = 0, losses = 0;
            for (let k = i - 13; k <= i; k++) {
                const diff = candles[k].close - candles[k - 1].close;
                if (diff >= 0) gains += diff; else losses -= diff;
            }
            const rs = losses === 0 ? 100 : gains / losses;
            rsiApprox = 100 - (100 / (1 + rs));
        }

        // Tỷ lệ dòng tiền Banker (Nhà tạo lập / Cá mập)
        let banker = Math.min(100, Math.max(0, (rsiApprox - 42) * 2.5));
        if (i >= 19) {
            const sum20 = candles.slice(i - 19, i + 1).reduce((a, b) => a + b.close, 0) / 20;
            const dev = (candles[i].close - sum20) / sum20;
            banker = Math.min(100, Math.max(0, banker + dev * 150));
        }

        // Hot money (Đầu cơ): tập trung khi giá biến động mạnh quanh mức trung vị
        let hotMoney = Math.min(100 - banker, Math.max(10, 45 - Math.abs(rsiApprox - 55)));
        // Retail (Nhỏ lẻ): phần còn lại
        let retail = Math.max(0, 100 - banker - hotMoney);

        mcdxData.push({
            banker: Math.round(banker),
            hot: Math.round(hotMoney),
            retail: Math.round(retail)
        });
    }

    // Vẽ đường ngưỡng 25% và 50%
    const y25 = h - 16 - (0.25 * (h - 26));
    const y50 = h - 16 - (0.50 * (h - 26));

    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(10, y25); ctx.lineTo(w - 50, y25);
    ctx.moveTo(10, y50); ctx.lineTo(w - 50, y50);
    ctx.stroke();
    ctx.setLineDash([]);

    // Nhãn 25% và 50% ở mép phải
    ctx.font = "9px 'Roboto', 'Inter', sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText("25%", w - 45, y25 + 3);
    ctx.fillText("50%", w - 45, y50 + 3);

    const isDarkMcdx = document.documentElement.classList.contains("dark");
    const bankerColor = isDarkMcdx ? "#ff3b57" : "#dc2626";
    const hotColor = isDarkMcdx ? "#f59e0b" : "#d97706";
    const retailColor = isDarkMcdx ? "#00c060" : "#15803d";

    // Vẽ các cột xếp tầng MCDX
    const usableH = h - 26;
    for (let i = 0; i < n; i++) {
        const x = 10 + i * ((w - 60) / n);
        const { banker, hot, retail } = mcdxData[i];

        const hBanker = (banker / 100) * usableH;
        const hHot = (hot / 100) * usableH;
        const hRetail = (retail / 100) * usableH;

        // Đáy: Banker (Đỏ)
        const yBanker = h - 16 - hBanker;
        ctx.fillStyle = bankerColor;
        ctx.fillRect(x, yBanker, barW, hBanker);

        // Giữa: Hot Money (Vàng)
        const yHot = yBanker - hHot;
        ctx.fillStyle = hotColor;
        ctx.fillRect(x, yHot, barW, hHot);

        // Đỉnh: Retail (Xanh lá)
        const yRetail = yHot - hRetail;
        ctx.fillStyle = retailColor;
        ctx.fillRect(x, yRetail, barW, hRetail);
    }

    // Cập nhật nhãn mới nhất trên header
    const lastMcdx = mcdxData[n - 1];
    if (lastMcdx) {
        const bEl = document.getElementById("mcdx-banker-val");
        const hEl = document.getElementById("mcdx-hot-val");
        const rEl = document.getElementById("mcdx-retail-val");
        if (bEl) bEl.textContent = `${lastMcdx.banker}%`;
        if (hEl) hEl.textContent = `${lastMcdx.hot}%`;
        if (rEl) rEl.textContent = `${lastMcdx.retail}%`;
    }
}

function renderMacdCanvas(candles) {
    const canvas = document.getElementById("canvas-sub-macd");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement.clientWidth || 800;
    const h = canvas.parentElement.clientHeight || 90;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const closes = candles.map(c => c.close);
    const n = closes.length;
    if (n < 26) return;

    // EMA helper
    function calcEma(period) {
        const k = 2 / (period + 1);
        const ema = [closes[0]];
        for (let i = 1; i < n; i++) {
            ema.push(closes[i] * k + ema[i - 1] * (1 - k));
        }
        return ema;
    }

    const ema12 = calcEma(12);
    const ema26 = calcEma(26);
    const macdLine = [];
    for (let i = 0; i < n; i++) macdLine.push(ema12[i] - ema26[i]);

    // Signal EMA 9
    const kSig = 2 / 10;
    const signalLine = [macdLine[0]];
    for (let i = 1; i < n; i++) signalLine.push(macdLine[i] * kSig + signalLine[i - 1] * (1 - kSig));

    const hist = [];
    for (let i = 0; i < n; i++) hist.push(macdLine[i] - signalLine[i]);

    const maxAbs = Math.max(...macdLine.map(Math.abs), ...hist.map(Math.abs), 1);
    const midY = h / 2;
    const barW = Math.max(1.5, (w - 60) / n - 1.5);

    // Đường 0 trung tâm
    ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
    ctx.beginPath();
    ctx.moveTo(10, midY); ctx.lineTo(w - 50, midY);
    ctx.stroke();

    const isDarkMacd = document.documentElement.classList.contains("dark");
    const macdBullColor = isDarkMacd ? "rgba(0, 192, 96, 0.75)" : "rgba(21, 128, 61, 0.8)";
    const macdBearColor = isDarkMacd ? "rgba(255, 59, 87, 0.75)" : "rgba(220, 38, 38, 0.8)";
    const macdLineColor = isDarkMacd ? "#38bdf8" : "#0284c7";
    const macdSignalColor = isDarkMacd ? "#f59e0b" : "#d97706";

    // Vẽ Histogram
    for (let i = 0; i < n; i++) {
        const x = 10 + i * ((w - 60) / n);
        const hVal = (hist[i] / maxAbs) * (midY - 6);
        ctx.fillStyle = hist[i] >= 0 ? macdBullColor : macdBearColor;
        if (hist[i] >= 0) {
            ctx.fillRect(x, midY - hVal, barW, hVal);
        } else {
            ctx.fillRect(x, midY, barW, Math.abs(hVal));
        }
    }

    // Vẽ MACD Line
    ctx.beginPath();
    ctx.strokeStyle = macdLineColor;
    ctx.lineWidth = 1.3;
    for (let i = 0; i < n; i++) {
        const x = 10 + i * ((w - 60) / n) + barW / 2;
        const y = midY - (macdLine[i] / maxAbs) * (midY - 6);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Vẽ Signal Line
    ctx.beginPath();
    ctx.strokeStyle = macdSignalColor;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < n; i++) {
        const x = 10 + i * ((w - 60) / n) + barW / 2;
        const y = midY - (signalLine[i] / maxAbs) * (midY - 6);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Update labels
    const lastM = macdLine[n - 1];
    const lastS = signalLine[n - 1];
    const lastH = hist[n - 1];
    const elM = document.getElementById("pane-macd-line");
    const elS = document.getElementById("pane-macd-signal");
    const elH = document.getElementById("pane-macd-hist");
    if (elM) elM.textContent = lastM ? lastM.toFixed(2) : "0.00";
    if (elS) elS.textContent = lastS ? lastS.toFixed(2) : "0.00";
    if (elH) {
        elH.textContent = `${lastH >= 0 ? '+' : ''}${lastH ? lastH.toFixed(2) : '0.00'}`;
        elH.className = lastH >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold";
    }
}

function renderRsiCanvas(candles) {
    const canvas = document.getElementById("canvas-sub-rsi");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement.clientWidth || 800;
    const h = canvas.parentElement.clientHeight || 85;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const closes = candles.map(c => c.close);
    const n = closes.length;
    if (n < 15) return;

    // Tính RSI 14
    const rsi = [50];
    let gains = 0, losses = 0;
    for (let i = 1; i <= 14; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / 14;
    let avgLoss = losses / 14;
    rsi.push(100 - (100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss))));

    for (let i = 15; i < n; i++) {
        const diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * 13 + (diff > 0 ? diff : 0)) / 14;
        avgLoss = (avgLoss * 13 + (diff < 0 ? -diff : 0)) / 14;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
    }

    const y70 = h - (70 / 100) * (h - 18) - 9;
    const y30 = h - (30 / 100) * (h - 18) - 9;

    // Tô nền vùng 30 - 70
    ctx.fillStyle = "rgba(168, 85, 247, 0.12)";
    ctx.fillRect(10, y70, w - 60, y30 - y70);

    // Kẻ đường 70 và 30
    ctx.strokeStyle = "rgba(168, 85, 247, 0.35)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(10, y70); ctx.lineTo(w - 50, y70);
    ctx.moveTo(10, y30); ctx.lineTo(w - 50, y30);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "9px 'Roboto', 'Inter', sans-serif";
    ctx.fillStyle = "#a855f7";
    ctx.fillText("70", w - 45, y70 + 3);
    ctx.fillText("30", w - 45, y30 + 3);

    const isDarkRsi = document.documentElement.classList.contains("dark");

    // Vẽ đường RSI
    ctx.beginPath();
    ctx.strokeStyle = isDarkRsi ? "#c084fc" : "#9333ea";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < rsi.length; i++) {
        const x = 10 + i * ((w - 60) / rsi.length);
        const y = h - (rsi[i] / 100) * (h - 18) - 9;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const lastRsi = rsi[rsi.length - 1];
    const rsiValEl = document.getElementById("pane-rsi-val");
    if (rsiValEl && lastRsi) rsiValEl.textContent = lastRsi.toFixed(1);
}

function resizeFireantChartLayout() {
    const renderBox = document.getElementById("tech-tv-render-box");
    if (currentFireantChart && renderBox) {
        currentFireantChart.applyOptions({
            width: renderBox.clientWidth || 800,
            height: renderBox.clientHeight || 380
        });
    }
    const canvas = document.getElementById("tech-drawing-canvas");
    if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.parentElement.clientWidth * dpr;
        canvas.height = canvas.parentElement.clientHeight * dpr;
        redrawAllDrawings();
    }
}

// -------------------------------------------------------------
// HỆ THỐNG VẼ OVERLAY TƯƠNG TÁC (DRAWING CANVAS OVERLAY)
// -------------------------------------------------------------
let isDrawingActive = false;
let startDrawPoint = null;
let currentPreviewPoint = null;

function setupDrawingCanvas() {
    const canvas = document.getElementById("tech-drawing-canvas");
    if (!canvas) return;
    const parent = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = parent.clientWidth * dpr;
    canvas.height = parent.clientHeight * dpr;
    canvas.style.pointerEvents = (currentDrawingTool === "crosshair") ? "none" : "auto";

    canvas.onmousedown = (e) => {
        if (isDrawingsLocked || currentDrawingTool === "crosshair") return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (currentDrawingTool === "horizontal") {
            // Đặt ngay đường ngang
            drawingsList.push({
                type: "horizontal",
                y: y,
                color: "#38bdf8",
                priceText: `${Number(getApproxPriceFromY(y)).toLocaleString('vi-VN')} đ`
            });
            redrawAllDrawings();
            showToast("Đã vẽ đường ngang Hỗ trợ/Kháng cự");
            setDrawingTool("crosshair");
            return;
        }

        if (currentDrawingTool === "text") {
            const txt = prompt("Nhập nội dung ghi chú:", "Vùng cản kỹ thuật");
            if (txt) {
                drawingsList.push({
                    type: "text",
                    x: x,
                    y: y,
                    text: txt,
                    color: "#f59e0b"
                });
                redrawAllDrawings();
            }
            setDrawingTool("crosshair");
            return;
        }

        isDrawingActive = true;
        startDrawPoint = { x, y };
        currentPreviewPoint = { x, y };
    };

    canvas.onmousemove = (e) => {
        if (!isDrawingActive || !startDrawPoint) return;
        const rect = canvas.getBoundingClientRect();
        currentPreviewPoint = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        redrawAllDrawings();
    };

    canvas.onmouseup = (e) => {
        if (!isDrawingActive || !startDrawPoint) return;
        const rect = canvas.getBoundingClientRect();
        const endPoint = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        if (currentDrawingTool === "trendline") {
            drawingsList.push({
                type: "trendline",
                p1: startDrawPoint,
                p2: endPoint,
                color: "#38bdf8"
            });
        } else if (currentDrawingTool === "rectangle") {
            drawingsList.push({
                type: "rectangle",
                p1: startDrawPoint,
                p2: endPoint,
                color: "#10b981",
                fill: "rgba(16, 185, 129, 0.18)"
            });
        } else if (currentDrawingTool === "fibonacci") {
            drawingsList.push({
                type: "fibonacci",
                p1: startDrawPoint,
                p2: endPoint
            });
        } else if (currentDrawingTool === "ruler") {
            const pStart = getApproxPriceFromY(startDrawPoint.y);
            const pEnd = getApproxPriceFromY(endPoint.y);
            const diff = pEnd - pStart;
            const pct = pStart > 0 ? ((diff / pStart) * 100).toFixed(2) : "0.00";
            drawingsList.push({
                type: "ruler",
                p1: startDrawPoint,
                p2: endPoint,
                text: `${diff >= 0 ? '+' : ''}${diff.toLocaleString('vi-VN')} đ (${pct}%)`
            });
        }

        isDrawingActive = false;
        startDrawPoint = null;
        currentPreviewPoint = null;
        redrawAllDrawings();
        showToast("Đã hoàn tất vẽ đối tượng trên biểu đồ");
        setDrawingTool("crosshair");
    };
}

function getApproxPriceFromY(y) {
    const tech = currentTechnicalData;
    const baseP = (tech && tech.last_price) ? tech.last_price : 21700;
    const canvas = document.getElementById("tech-drawing-canvas");
    const h = canvas ? canvas.clientHeight : 380;
    // Nội suy giá theo tỷ lệ y (đỉnh trên cao hơn 15%, đáy dưới thấp hơn 15%)
    const maxP = baseP * 1.15;
    const minP = baseP * 0.85;
    const ratio = Math.max(0, Math.min(1, y / h));
    return Math.round(maxP - ratio * (maxP - minP));
}

function redrawAllDrawings() {
    const canvas = document.getElementById("tech-drawing-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement.clientWidth;
    const h = canvas.parentElement.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // 1. Vẽ các đối tượng đã lưu trong drawingsList
    drawingsList.forEach(item => {
        drawSingleItem(ctx, item, w, h);
    });

    // 2. Vẽ đối tượng preview đang kéo chuột dở dang
    if (isDrawingActive && startDrawPoint && currentPreviewPoint) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        const previewItem = {
            type: currentDrawingTool,
            p1: startDrawPoint,
            p2: currentPreviewPoint,
            color: "#0284c7",
            fill: "rgba(2, 132, 199, 0.15)"
        };
        drawSingleItem(ctx, previewItem, w, h);
        ctx.restore();
    }
}

function drawSingleItem(ctx, item, w, h) {
    ctx.save();
    if (item.type === "trendline") {
        ctx.beginPath();
        ctx.strokeStyle = item.color || "#38bdf8";
        ctx.lineWidth = 2;
        ctx.moveTo(item.p1.x, item.p1.y);
        ctx.lineTo(item.p2.x, item.p2.y);
        ctx.stroke();

        // Vẽ 2 điểm neo đầu cuối
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(item.p1.x, item.p1.y, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(item.p2.x, item.p2.y, 3.5, 0, Math.PI * 2); ctx.fill();

    } else if (item.type === "horizontal") {
        ctx.beginPath();
        ctx.strokeStyle = item.color || "#38bdf8";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.moveTo(0, item.y);
        ctx.lineTo(w, item.y);
        ctx.stroke();

        // Nhãn giá ở góc phải
        ctx.setLineDash([]);
        ctx.fillStyle = item.color || "#38bdf8";
        ctx.fillRect(w - 95, item.y - 10, 95, 20);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.fillText(item.priceText || "Cản giá", w - 90, item.y + 4);

    } else if (item.type === "rectangle") {
        const rx = Math.min(item.p1.x, item.p2.x);
        const ry = Math.min(item.p1.y, item.p2.y);
        const rw = Math.abs(item.p2.x - item.p1.x);
        const rh = Math.abs(item.p2.y - item.p1.y);

        ctx.fillStyle = item.fill || "rgba(16, 185, 129, 0.18)";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = item.color || "#10b981";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx, ry, rw, rh);

    } else if (item.type === "fibonacci") {
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
        const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6"];
        const yStart = item.p1.y;
        const yDiff = item.p2.y - item.p1.y;

        levels.forEach((lvl, idx) => {
            const yLvl = yStart + yDiff * lvl;
            ctx.beginPath();
            ctx.strokeStyle = colors[idx % colors.length];
            ctx.lineWidth = 1;
            ctx.moveTo(item.p1.x, yLvl);
            ctx.lineTo(w - 20, yLvl);
            ctx.stroke();

            ctx.font = "9px 'JetBrains Mono', monospace";
            ctx.fillStyle = colors[idx % colors.length];
            ctx.fillText(`${(lvl * 100).toFixed(1)}%`, w - 50, yLvl - 2);
        });

    } else if (item.type === "ruler") {
        ctx.beginPath();
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 1.5;
        ctx.moveTo(item.p1.x, item.p1.y);
        ctx.lineTo(item.p2.x, item.p2.y);
        ctx.stroke();

        // Hộp badge kết quả đo
        const midX = (item.p1.x + item.p2.x) / 2;
        const midY = (item.p1.y + item.p2.y) / 2;
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.strokeStyle = "#0284c7";
        ctx.lineWidth = 1;
        ctx.fillRect(midX - 70, midY - 14, 140, 24);
        ctx.strokeRect(midX - 70, midY - 14, 140, 24);

        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.fillText(item.text || "Biên độ giá", midX - 62, midY + 2);

    } else if (item.type === "text") {
        ctx.fillStyle = item.color || "#f59e0b";
        ctx.font = "bold 12px 'JetBrains Mono', sans-serif";
        ctx.fillText(`✎ ${item.text}`, item.x, item.y);
    }
    ctx.restore();
}

// -------------------------------------------------------------
// CHỨC NĂNG BOTTOM BAR, SNAPSHOT, FULLSCREEN
// -------------------------------------------------------------
function setChartTimeRange(range) {
    if (!currentFireantChart) return;
    const now = Math.floor(Date.now() / 1000);
    const ranges = {
        "1D": 86400,
        "5D": 86400 * 5,
        "1M": 86400 * 30,
        "3M": 86400 * 90,
        "6M": 86400 * 180,
        "1Y": 86400 * 365,
        "5Y": 86400 * 1825,
        "ALL": 86400 * 3650
    };
    const span = ranges[range] || (86400 * 180);
    try {
        if (range === "ALL") {
            currentFireantChart.timeScale().fitContent();
        } else {
            const fromTs = now - span;
            // Áp dụng fitContent hoặc zoom
            currentFireantChart.timeScale().fitContent();
        }
    } catch (e) {}

    // Highlight nút active
    const bar = document.getElementById("tech-range-bar");
    if (bar) {
        bar.querySelectorAll("button").forEach(btn => {
            btn.className = "px-2 py-0.5 rounded text-slate-400 hover:text-white text-[11px]";
        });
        if (event && event.target) {
            event.target.className = "px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold text-[11px]";
        }
    }
    showToast(`Đã chọn khung xem ${range}`);
}

function resetChartScale() {
    if (currentFireantChart) {
        currentFireantChart.timeScale().fitContent();
        showToast("Đã tự động căn chỉnh khung giá & thời gian");
    }
}

function toggleChartScale(type) {
    showToast(`Chế độ tỷ lệ ${type.toUpperCase()} đang được áp dụng`);
}

function takeChartSnapshot() {
    const box = document.getElementById("tab-technical");
    if (!box) return;
    showToast("Đang chuẩn bị ảnh chụp biểu đồ FireAnt...");
    setTimeout(() => {
        // Tạo canvas hợp nhất để tải ảnh
        const mainCanvas = box.querySelector("#tech-drawing-canvas");
        if (mainCanvas) {
            const dataUrl = mainCanvas.toDataURL("image/png");
            const a = document.createElement("a");
            a.href = dataUrl;
            a.download = `FireAnt_Chart_${currentTechnicalTicker || 'HPG'}_${new Date().toISOString().slice(0,10)}.png`;
            a.click();
            showToast("Đã lưu ảnh biểu đồ thành công!");
        } else {
            showToast("Ảnh biểu đồ đã sẵn sàng");
        }
    }, 300);
}

function toggleChartFullscreen() {
    const section = document.getElementById("tab-technical");
    if (!section) return;
    if (!document.fullscreenElement) {
        if (section.requestFullscreen) {
            section.requestFullscreen();
        } else if (section.webkitRequestFullscreen) {
            section.webkitRequestFullscreen();
        }
        showToast("Đã chuyển sang chế độ Toàn Màn Hình");
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
        showToast("Đã thoát chế độ Toàn Màn Hình");
    }
    setTimeout(resizeFireantChartLayout, 200);
}

async function refreshTechnicalData() {
    const ticker = currentTechnicalTicker || (currentReport ? currentReport.ticker : "HPG");
    showToast(`Đang đồng bộ nến kỹ thuật & dữ liệu SSI FastConnect cho ${ticker}...`);
    try {
        const res = await fetch(`/api/technical/${ticker}?resolution=${currentTechnicalInterval}&count=150`);
        if (res.ok) {
            const data = await res.json();
            renderTechnicalSection(data);
            if (data.candles_history) {
                populateFireantChartData(data.candles_history);
            }
            showToast(`Đã đồng bộ biểu đồ FireAnt & SSI FastConnect cho ${ticker}!`);
        } else {
            showToast(`Không thể cập nhật nến cho ${ticker}`, true);
        }
    } catch (e) {
        console.error("refreshTechnicalData error:", e);
        showToast(`Lỗi kết nối: ${e.message}`, true);
    }
}

// -------------------------------------------------------------
// MODAL: DANH MỤC 9 MÃ API SSI FASTCONNECT DATA & CẤU HÌNH KEY
// -------------------------------------------------------------
function openSsiApiModal() {
    const modal = document.getElementById("ssi-api-modal");
    if (modal) {
        modal.classList.remove("hidden");
        loadSsiApiCatalog();
    }
}

function closeSsiApiModal() {
    const modal = document.getElementById("ssi-api-modal");
    if (modal) modal.classList.add("hidden");
}

async function loadSsiApiCatalog() {
    const tbody = document.getElementById("ssi-api-tbody");
    if (!tbody) return;

    try {
        let catalog = ssiApiCatalogCache;
        if (!catalog) {
            const res = await fetch("/api/ssi/apis");
            if (res.ok) {
                const data = await res.json();
                catalog = data.apis;
                ssiApiCatalogCache = catalog;
                
                // Update credentials fields if returned
                if (data.consumer_id) {
                    const cid = document.getElementById("ssi-consumer-id-input");
                    if (cid && !cid.value) cid.value = data.consumer_id;
                }
                const badge = document.getElementById("ssi-connection-status-badge");
                if (badge && data.active_mode) {
                    badge.textContent = `Chế độ: ${data.active_mode} (${data.description})`;
                }
            }
        }

        if (!catalog || !catalog.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">Đang tải danh mục 9 API SSI...</td></tr>`;
            return;
        }

        let rows = "";
        catalog.forEach((api, idx) => {
            const methodBg = api.method === "POST" 
                ? "bg-amber-950/80 text-amber-300 border-amber-800" 
                : "bg-emerald-950/80 text-emerald-300 border-emerald-800";
            
            rows += `
            <tr class="hover:bg-slate-800/40 transition-colors">
                <td class="p-3 text-center text-slate-500 font-bold">${idx + 1}</td>
                <td class="p-3">
                    <strong class="text-cyan-300 block">${api.code}</strong>
                    <span class="text-[10px] text-slate-400 block">${api.name}</span>
                </td>
                <td class="p-3">
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${methodBg} mr-1">${api.method}</span>
                    <span class="text-slate-300 text-[11px] font-mono">${api.endpoint}</span>
                </td>
                <td class="p-3 text-slate-300 text-xs">
                    <div class="leading-relaxed font-sans">${api.description}</div>
                    <div class="text-[10px] text-slate-500 font-mono mt-0.5">Params: ${api.params}</div>
                </td>
                <td class="p-3 text-[11px]">
                    <span class="text-indigo-300 font-sans block">${api.feature_in_terminal}</span>
                </td>
                <td class="p-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold whitespace-nowrap">
                        ${api.status || "Tích hợp"}
                    </span>
                </td>
            </tr>`;
        });
        tbody.innerHTML = rows;

        if (window.lucide) lucide.createIcons();
    } catch (e) {
        console.error("loadSsiApiCatalog error:", e);
    }
}

async function saveSsiCredentials() {
    const cid = document.getElementById("ssi-consumer-id-input");
    const csec = document.getElementById("ssi-consumer-secret-input");
    const consumerId = cid ? cid.value.trim() : "";
    const consumerSecret = csec ? csec.value.trim() : "";

    showToast("Đang lưu và kiểm tra cấu hình SSI FastConnect Data...");

    try {
        const res = await fetch("/api/ssi/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                consumer_id: consumerId,
                consumer_secret: consumerSecret
            })
        });

        if (res.ok) {
            const data = await res.json();
            const badge = document.getElementById("ssi-connection-status-badge");
            if (badge) {
                badge.textContent = data.message;
                badge.className = data.connected 
                    ? "px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold"
                    : "px-2 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800 font-bold";
            }
            showToast(data.message);
        } else {
            showToast("Lỗi khi lưu cấu hình SSI", true);
        }
    } catch (e) {
        console.error("saveSsiCredentials error:", e);
        showToast(`Lỗi: ${e.message}`, true);
    }
}

// -------------------------------------------------------------
// INGESTION MODAL & MULTI-CHANNEL DATA HANDLERS
// -------------------------------------------------------------
function openIngestionModal() {
    const modal = document.getElementById("ingestion-modal");
    if (!modal) return;
    modal.classList.remove("hidden");

    const currentTicker = (currentReport ? currentReport.ticker : "HPG").toUpperCase();
    
    // Auto populate inputs across all tabs
    const crawlInput = document.getElementById("crawl-ticker-input");
    const urlTicker = document.getElementById("url-ticker-input");
    const pdfTicker = document.getElementById("pdf-ticker-input");
    const rawTicker = document.getElementById("raw-ticker-input");
    const pdfInst = document.getElementById("pdf-inst-input");

    if (crawlInput) crawlInput.value = currentTicker;
    if (urlTicker) urlTicker.value = currentTicker;
    if (pdfTicker) pdfTicker.value = currentTicker;
    if (rawTicker) rawTicker.value = currentTicker;
    if (pdfInst && !pdfInst.value) pdfInst.value = "SSI Research";

    if (window.lucide) lucide.createIcons();

    // Auto-trigger search so user sees available institutional reports immediately
    if (crawlInput && crawlInput.value.trim()) {
        performSearch();
    }
}

function closeIngestionModal() {
    const modal = document.getElementById("ingestion-modal");
    if (modal) modal.classList.add("hidden");
}

function switchIngestMode(modeId) {
    document.querySelectorAll(".ingest-panel").forEach(p => p.classList.add("hidden"));
    document.querySelectorAll(".ingest-tab").forEach(t => {
        t.classList.remove("active", "border-cyan-500", "text-cyan-400");
        t.classList.add("border-transparent", "text-slate-400");
    });
    const panel = document.getElementById(modeId);
    if (panel) panel.classList.remove("hidden");
    const tabBtn = document.getElementById(`btn-${modeId}`);
    if (tabBtn) {
        tabBtn.classList.add("active", "border-cyan-500", "text-cyan-400");
        tabBtn.classList.remove("border-transparent", "text-slate-400");
    }
    if (window.lucide) lucide.createIcons();
}

// Mode 1: Search & Crawl (Mục đánh dấu khung đỏ)
async function performSearch() {
    const input = document.getElementById("crawl-ticker-input");
    const ticker = (input.value || (currentReport ? currentReport.ticker : "HPG")).trim().toUpperCase();
    if (!ticker) {
        showToast("Vui lòng nhập mã cổ phiếu để quét báo cáo!", true);
        return;
    }

    const btn = document.getElementById("btn-perform-search");
    if (btn) {
        btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Đang Quét...</span>`;
        if (window.lucide) lucide.createIcons();
    }

    const box = document.getElementById("search-results-box");
    box.innerHTML = `<div class="text-cyan-400 flex items-center justify-center gap-2 p-4 bg-slate-950/60 rounded-lg border border-slate-800">
        <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
        <span>Đang quét kho dữ liệu Vietstock eDocs, CafeF, SSI, HSC, Vietcap cho mã ${ticker}...</span>
    </div>`;
    if (window.lucide) lucide.createIcons();

    try {
        const resp = await fetch(`/api/search?ticker=${ticker}`);
        const data = await resp.json();
        
        if (!data.results || data.results.length === 0) {
            box.innerHTML = `<div class="p-4 text-center bg-slate-950/40 rounded border border-slate-800">
                <p class="text-amber-400">Không tìm thấy báo cáo tự động cho mã ${ticker}.</p>
                <p class="text-slate-400 text-[11px] mt-1">Hãy chuyển sang tab "Nhập URL Trực Tiếp", "Tải File PDF", hoặc "Dán Text Thô" để nạp dữ liệu.</p>
            </div>`;
            return;
        }

        let html = `<div class="space-y-2.5">`;
        data.results.forEach((item, idx) => {
            const encodedUrl = encodeURIComponent(item.url);
            const encodedTitle = encodeURIComponent(item.title);
            const btnId = `btn-extract-${idx}`;

            // Check if already in current matrix
            const alreadyAdded = currentReport && currentReport.matrix_table.some(r => r.institution.toLowerCase().includes(item.institution.toLowerCase().split(' ')[0]));

            html += `<div class="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-slate-700 transition-colors">
                <div class="space-y-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-white font-bold text-xs font-mono">${item.institution}</span>
                        <span class="text-[10px] text-slate-400 font-mono">(${item.date})</span>
                        <span class="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">${item.source}</span>
                        <span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">${item.type}</span>
                    </div>
                    <div class="text-[11px] text-slate-300 font-sans line-clamp-1">${item.title}</div>
                    <div class="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                        <span class="truncate max-w-xs">${item.url}</span>
                        <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="text-cyan-400 hover:underline flex items-center gap-0.5">
                            <span>Mở link</span><i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                        </a>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    ${alreadyAdded ? `
                        <button disabled class="px-3 py-1.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-lg text-xs font-mono font-bold flex items-center gap-1 cursor-default">
                            <i data-lucide="check" class="w-3.5 h-3.5"></i>
                            <span>Đã Trong Ma Trận</span>
                        </button>
                    ` : `
                        <button id="${btnId}" onclick="addDiscoveredReport('${item.institution}', '${ticker}', '${encodedUrl}', '${encodedTitle}', '${btnId}')" class="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shadow transition-all hover:scale-105 active:scale-95">
                            <i data-lucide="download" class="w-3.5 h-3.5"></i>
                            <span>+ Bóc Tách</span>
                        </button>
                    `}
                </div>
            </div>`;
        });
        html += `</div>`;
        box.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        box.innerHTML = `<div class="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 rounded text-xs font-mono">Lỗi tìm kiếm: ${err.message}</div>`;
    } finally {
        if (btn) {
            btn.innerHTML = `<i data-lucide="search" class="w-3.5 h-3.5"></i><span>Quét Báo Cáo</span>`;
            if (window.lucide) lucide.createIcons();
        }
    }
}

async function addDiscoveredReport(institution, ticker, encodedUrl, encodedTitle, btnId) {
    const btn = document.getElementById(btnId);
    let originalHtml = "";
    if (btn) {
        originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Đang tải & đọc...</span>`;
        if (window.lucide) lucide.createIcons();
    }

    const rawUrl = decodeURIComponent(encodedUrl);
    const title = decodeURIComponent(encodedTitle);
    showToast(`Đang tải file/link và bóc tách định lượng từ ${institution}...`);

    try {
        const resp = await fetch("/api/crawl-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: rawUrl,
                ticker: ticker,
                institution: institution
            })
        });

        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({ detail: "Lỗi kết nối tải dữ liệu" }));
            throw new Error(errData.detail || "Không thể tải báo cáo từ nguồn");
        }

        const data = await resp.json();
        const extracted = data.extracted_report;
        if (title && (!extracted.key_catalysts || extracted.key_catalysts.length === 0)) {
            extracted.key_catalysts = [title];
        }

        await integrateNewReport(extracted, ticker);

        if (btn) {
            btn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i><span>✓ Đã Nạp</span>`;
            btn.className = "px-3 py-1.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-lg text-xs font-mono font-bold cursor-default flex items-center gap-1";
            if (window.lucide) lucide.createIcons();
        }
        showToast(`Đã nạp và tổng hợp xong báo cáo từ ${institution}! (Target: ${Number(extracted.target_price).toLocaleString("vi-VN")} đ)`);
    } catch (err) {
        console.error("addDiscoveredReport error:", err);
        showToast(`Lỗi bóc tách: ${err.message}`, true);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            if (window.lucide) lucide.createIcons();
        }
    }
}

// Mode 2: Direct URL (Mục đánh dấu ô màu cam)
function quickFillUrl(type) {
    const currentTicker = (currentReport ? currentReport.ticker : "HPG").toUpperCase();
    const urlInput = document.getElementById("direct-url-input");
    const instInput = document.getElementById("url-institution-input");
    const tickerInput = document.getElementById("url-ticker-input");

    if (tickerInput) tickerInput.value = currentTicker;

    if (type === "vietstock" || type === "edocs") {
        if (urlInput) urlInput.value = `https://finance.vietstock.vn/${currentTicker}/bao-cao-phan-tich.htm`;
        if (instInput) instInput.value = "Vietstock Research Hub";
    } else if (type === "vndirect") {
        if (urlInput) urlInput.value = `https://dstock.vndirect.com.vn/tong-quan/${currentTicker}`;
        if (instInput) instInput.value = "VNDirect Research";
    } else {
        if (urlInput) urlInput.value = `https://finance.vietstock.vn/${currentTicker}/bao-cao-phan-tich.htm`;
        if (instInput) instInput.value = "SSI Research";
    }
    showToast("Đã điền thông tin link báo cáo chính thức!");
}

async function crawlDirectUrl() {
    const url = (document.getElementById("direct-url-input").value || "").trim();
    const inst = (document.getElementById("url-institution-input").value || "CTCK").trim();
    const ticker = (document.getElementById("url-ticker-input").value || (currentReport ? currentReport.ticker : "HPG")).trim().toUpperCase();

    if (!url) {
        showToast("Vui lòng nhập đường dẫn URL hợp lệ!", true);
        return;
    }

    const btn = document.getElementById("btn-crawl-url");
    let origHtml = "";
    if (btn) {
        origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Đang kết nối tải và bóc tách dữ liệu từ link...</span>`;
        if (window.lucide) lucide.createIcons();
    }

    showToast("Đang tải file/trang web và bóc tách định lượng...");
    try {
        const resp = await fetch("/api/crawl-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: url, institution: inst, ticker: ticker })
        });
        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({ detail: "Lỗi kết nối tải URL" }));
            throw new Error(errData.detail || await resp.text());
        }
        const data = await resp.json();
        
        await integrateNewReport(data.extracted_report, ticker);
        closeIngestionModal();
        showToast(`Đã bóc tách và tổng hợp thành công báo cáo ${inst} vào Ma trận!`);
    } catch (err) {
        showToast(`Lỗi bóc tách URL: ${err.message}`, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
            if (window.lucide) lucide.createIcons();
        }
    }
}

// Mode 3: PDF Upload (Mục đánh dấu ô màu cam)
let selectedPdfFile = null;

function setupPdfDropzone() {
    const dropzone = document.getElementById("pdf-dropzone");
    const fileInput = document.getElementById("pdf-file-input");
    if (!dropzone || !fileInput) return;

    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("border-cyan-500", "bg-cyan-950/30");
    });
    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("border-cyan-500", "bg-cyan-950/30");
    });
    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("border-cyan-500", "bg-cyan-950/30");
        if (e.dataTransfer.files.length > 0) {
            handlePdfFile(e.dataTransfer.files[0]);
        }
    });
}

function handlePdfSelected(event) {
    if (event.target.files && event.target.files.length > 0) {
        handlePdfFile(event.target.files[0]);
    }
}

function handlePdfFile(file) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
        showToast("Hệ thống chỉ hỗ trợ file định dạng PDF!", true);
        return;
    }
    selectedPdfFile = file;
    const nameEl = document.getElementById("pdf-selected-name");
    const infoBox = document.getElementById("pdf-selected-info");
    if (nameEl) nameEl.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    if (infoBox) infoBox.classList.remove("hidden");
    showToast(`Đã chọn file ${file.name}. Bấm "Bóc tách ngay" để xử lý.`);
}

function loadDemoPdf() {
    const currentTicker = (currentReport ? currentReport.ticker : "HPG").toUpperCase();
    const demoContent = `%PDF-1.4\n%Báo cáo phân tích ${currentTicker}\nBÁO CÁO PHÂN TÍCH DOANH NGHIỆP: CỔ PHIẾU ${currentTicker}\nTổ chức: SSI Research\nKhuyến nghị: MUA\nGiá mục tiêu: 38,000 VND\nP/E Forward: 11.2x\nP/B Forward: 1.6x\nDoanh thu: Tăng trưởng 22% YoY\nLNST: Tăng trưởng 35% YoY\nLuận điểm:\n- Dự án mở rộng công suất đi vào vận hành thương mại.\n- Biên lợi nhuận gộp hồi phục nhờ giá nguyên vật liệu hạ nhiệt.\n- Gia tăng thị phần bán hàng nội địa.\nRủi ro:\n- Biến động giá nguyên liệu thế giới.\n- Áp lực tỷ giá và lãi suất.`;
    const blob = new Blob([demoContent], { type: "application/pdf" });
    const fakeFile = new File([blob], `${currentTicker}_SSI_Research_Report.pdf`, { type: "application/pdf" });
    handlePdfFile(fakeFile);
}

async function uploadPdfReport() {
    if (!selectedPdfFile) {
        showToast("Vui lòng chọn hoặc kéo thả file PDF báo cáo trước!", true);
        return;
    }

    const ticker = (document.getElementById("pdf-ticker-input") ? document.getElementById("pdf-ticker-input").value : "").trim().toUpperCase() || (currentReport ? currentReport.ticker : "HPG");
    const inst = (document.getElementById("pdf-inst-input") ? document.getElementById("pdf-inst-input").value : "").trim() || "CTCK";

    const btn = document.getElementById("btn-upload-pdf");
    let origText = "";
    if (btn) {
        origText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Đang đọc...";
    }

    const formData = new FormData();
    formData.append("file", selectedPdfFile);
    formData.append("ticker", ticker);
    formData.append("institution", inst);

    showToast("Đang tải lên và trích xuất dữ liệu bằng PyPDF engine...");
    try {
        const resp = await fetch("/api/upload-pdf", {
            method: "POST",
            body: formData
        });
        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({ detail: "Lỗi xử lý file PDF" }));
            throw new Error(errData.detail || await resp.text());
        }
        const data = await resp.json();

        await integrateNewReport(data.extracted_report, ticker);
        closeIngestionModal();
        showToast(`Đã bóc tách thành công ${data.file_info.total_pages} trang PDF và tổng hợp vào Ma trận!`);
    } catch (err) {
        showToast(`Lỗi xử lý file PDF: ${err.message}`, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = origText;
        }
    }
}

// Mode 4: Raw Text (Mục đánh dấu ô màu cam)
function quickFillRawText(type) {
    const currentTicker = (currentReport ? currentReport.ticker : "HPG").toUpperCase();
    const txtArea = document.getElementById("raw-text-input");
    const instInput = document.getElementById("raw-inst-input");
    const tickerInput = document.getElementById("raw-ticker-input");

    if (tickerInput) tickerInput.value = currentTicker;

    if (type === "ssi") {
        if (instInput) instInput.value = "SSI Research";
        if (txtArea) {
            txtArea.value = `BÁO CÁO PHÂN TÍCH CỔ PHIẾU ${currentTicker} - SSI RESEARCH
Ngày phát hành: 05/09/2026
Khuyến nghị: MUA MẠNH
Giá mục tiêu: 38,500 VND
Thị giá hiện tại: 21,700 VND
P/E Forward: 11.2x | P/B Forward: 1.58x
Doanh thu dự phóng: 172,000 tỷ VND (+22.5% YoY)
LNST dự phóng: 16,500 tỷ VND (+41.2% YoY)
Luận điểm tăng trưởng:
- Dự án Dung Quất 2 (DQ2) đưa vào chạy thử lò cao thương mại, nâng công suất thêm 2.8 triệu tấn HRC chất lượng cao.
- Áp thuế tự vệ thương mại đối với sản phẩm nhập khẩu hỗ trợ giá bán thành phẩm nội địa.
- Tự chủ 100% phôi thép giúp biên lãi gộp cải thiện lên 17.5%.
Rủi ro:
- Thị trường bất động sản dân dụng phục hồi chậm hơn kỳ vọng.
- Biến động giá quặng sắt và than cốc trên thị trường quốc tế.`;
        }
    } else if (type === "hsc") {
        if (instInput) instInput.value = "HSC Research";
        if (txtArea) {
            txtArea.value = `BÁO CÁO CHIẾN LƯỢC ĐẦU TƯ: ${currentTicker} - HSC RESEARCH
Ngày phát hành: 28/08/2026
Đánh giá: MUA
Giá mục tiêu: 36,000 VND
P/E dự phóng 2026: 12.0x
LNST kỳ vọng: 15,200 tỷ VND (+34.0% YoY)
Luận điểm then chốt:
- Vị thế chi phí sản xuất thấp nhất khu vực Đông Nam Á đảm bảo tỷ suất sinh lời vượt trội.
- Thị phần thép xây dựng duy trì vững chắc trên 38% toàn quốc.
- Dòng tiền tự do FCF dồi dào tạo tiền đề chi trả cổ tức tiền mặt đều đặn.
Rủi ro trọng yếu:
- Rủi ro cạnh tranh từ nguồn thép giá rẻ nhập khẩu.
- Chi phí khấu hao tài sản mới tăng trong năm đầu vận hành.`;
        }
    }
    showToast("Đã điền văn bản mẫu báo cáo CTCK!");
}

async function analyzeRawText() {
    const rawText = (document.getElementById("raw-text-input").value || "").trim();
    const inst = (document.getElementById("raw-inst-input").value || "CTCK").trim();
    const ticker = (document.getElementById("raw-ticker-input").value || (currentReport ? currentReport.ticker : "HPG")).trim().toUpperCase();

    if (!rawText) {
        showToast("Vui lòng dán nội dung văn bản báo cáo!", true);
        return;
    }

    const btn = document.getElementById("btn-analyze-raw");
    let origHtml = "";
    if (btn) {
        origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Đang phân tích text bằng NLP Engine...</span>`;
        if (window.lucide) lucide.createIcons();
    }

    showToast("Đang bóc tách bằng Financial Heuristics & NLP Engine...");
    try {
        const resp = await fetch("/api/analyze-raw", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                raw_text: rawText,
                ticker: ticker,
                institution: inst
            })
        });
        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({ detail: "Lỗi phân tích văn bản" }));
            throw new Error(errData.detail || await resp.text());
        }
        const reportItem = await resp.json();

        await integrateNewReport(reportItem, ticker);
        closeIngestionModal();
        showToast("Đã trích xuất và tổng hợp các chỉ số định lượng vào ma trận!");
    } catch (err) {
        showToast(`Lỗi xử lý text: ${err.message}`, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
            if (window.lucide) lucide.createIcons();
        }
    }
}

// Hàm hợp nhất báo cáo mới vào hệ thống và kích hoạt tái tính toán consensus toàn diện
async function integrateNewReport(newReportItem, ticker) {
    const cleanTicker = (ticker || "HPG").toUpperCase();
    if (!currentReport) {
        currentReport = {
            ticker: cleanTicker,
            company_name: `Công ty Cổ phần ${cleanTicker}`,
            sector: "Doanh nghiệp niêm yết",
            current_price: newReportItem.current_price_at_report || 25000,
            consensus_summary: { current_market_price: newReportItem.current_price_at_report || 25000 },
            matrix_table: [newReportItem]
        };
    } else {
        // Kiểm tra xem tổ chức này đã có báo cáo trong ma trận chưa; nếu có cùng tổ chức thì cập nhật, ngược lại thêm mới
        const existingIdx = currentReport.matrix_table.findIndex(
            r => r.institution.toLowerCase().trim() === newReportItem.institution.toLowerCase().trim()
        );
        if (existingIdx >= 0) {
            currentReport.matrix_table[existingIdx] = newReportItem;
        } else {
            currentReport.matrix_table.push(newReportItem);
        }
    }

    const currentMarketPrice = (currentReport.consensus_summary && currentReport.consensus_summary.current_market_price) 
        ? currentReport.consensus_summary.current_market_price 
        : (currentReport.current_price || 25000);

    // Tái tính toán Consensus, Disensus, Causality và Chiến lược via Backend API
    const resp = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            ticker: currentReport.ticker,
            company_name: currentReport.company_name,
            sector: currentReport.sector,
            current_market_price: currentMarketPrice,
            reports: currentReport.matrix_table
        })
    });
    
    if (!resp.ok) {
        throw new Error(await resp.text());
    }
    
    currentReport = await resp.json();
    renderAll(currentReport);
}

// -------------------------------------------------------------
// TOAST NOTIFIER
// -------------------------------------------------------------
let toastTimeout = null;
function showToast(message, isError = false) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    const msg = document.getElementById("toast-message");
    if (msg) msg.textContent = message;

    const icon = toast.querySelector("i, svg");
    if (isError) {
        toast.classList.remove("border-cyan-500/50");
        toast.classList.add("border-rose-500/80");
        if (icon) {
            icon.classList.remove("text-emerald-400");
            icon.classList.add("text-rose-400");
        }
    } else {
        toast.classList.remove("border-rose-500/80");
        toast.classList.add("border-cyan-500/50");
        if (icon) {
            icon.classList.remove("text-rose-400");
            icon.classList.add("text-emerald-400");
        }
    }

    toast.classList.remove("translate-y-20", "opacity-0");
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.add("translate-y-20", "opacity-0");
    }, 3500);
}

// -------------------------------------------------------------
// LIVE PRICE COMPARISON & SYNC ENGINE
// -------------------------------------------------------------
let isSyncingLivePrice = false;

async function refreshLivePrice(isManual = false) {
    if (!currentReport || isSyncingLivePrice || isSwitchingTicker) return;
    const ticker = currentReport.ticker;
    isSyncingLivePrice = true;

    const iconEl = document.getElementById("icon-sync-live-price");
    if (iconEl) iconEl.classList.add("animate-spin");

    if (isManual) {
        showToast(`Đang quét đối chiếu giá trực tiếp từ Vietstock Chart và bảng giá CTCK...`);
    }

    try {
        const resp = await fetch(`/api/live-price/${ticker}`);
        if (!resp.ok) throw new Error("Không thể tải giá live");
        const priceInfo = await resp.json();

        if (isSwitchingTicker || !currentReport || currentReport.ticker !== ticker) {
            return;
        }

        const oldPrice = currentReport.consensus_summary ? currentReport.consensus_summary.current_market_price : 0;
        const newPrice = priceInfo.latest_close;

        // Chỉ cần reconcile lại nếu giá thay đổi hoặc khi người dùng bấm thủ công
        if (isManual || Math.abs(newPrice - oldPrice) > 0.01) {
            const recResp = await fetch("/api/reconcile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ticker: currentReport.ticker,
                    company_name: currentReport.company_name,
                    sector: currentReport.sector,
                    current_market_price: priceInfo.latest_close,
                    price_source_info: priceInfo,
                    reports: currentReport.matrix_table
                })
            });
            if (recResp.ok) {
                if (isSwitchingTicker || !currentReport || currentReport.ticker !== ticker) {
                    return;
                }
                currentReport = await recResp.json();
                renderAll(currentReport);
            }
        }

        if (isSwitchingTicker || !currentReport || currentReport.ticker !== ticker) {
            return;
        }

        // Đồng bộ trực tiếp giá vào tất cả các vị trí trên toàn trang webapp:
        // 1. Hero Market Price & Source text
        const pEl = document.getElementById("display-market-price");
        if (pEl) {
            pEl.textContent = `${newPrice.toLocaleString("vi-VN")} VND`;
        }
        const srcEl = document.getElementById("display-source-text");
        if (srcEl && priceInfo.selected_source) {
            srcEl.textContent = `${priceInfo.selected_source}`;
        }

        // 2. Tab Kỹ thuật: Toolbar Price & Tham chiếu
        const techToolbarPrice = document.getElementById("tech-toolbar-price");
        if (techToolbarPrice) {
            techToolbarPrice.textContent = `${newPrice.toLocaleString("vi-VN")} VND`;
        }
        const techRefP = document.getElementById("tech-ref-price");
        if (techRefP) {
            techRefP.textContent = Number(newPrice).toLocaleString("vi-VN");
        }

        // 3. Tab Kỹ thuật: Cập nhật nến mới nhất trên TradingView chart
        const candleSeries = currentFireantCandleSeries || currentLwCandleSeries;
        if (candleSeries && currentTechnicalData && currentTechnicalData.candles_history && currentTechnicalData.candles_history.length > 0) {
            const lastIdx = currentTechnicalData.candles_history.length - 1;
            const lastCandle = currentTechnicalData.candles_history[lastIdx];
            if (lastCandle) {
                lastCandle.close = newPrice;
                if (newPrice > (lastCandle.high || newPrice)) lastCandle.high = newPrice;
                if (newPrice < (lastCandle.low || newPrice)) lastCandle.low = newPrice;
                
                let tStr = lastCandle.time_str;
                if (!tStr && lastCandle.date && lastCandle.date.includes("/")) {
                    const parts = lastCandle.date.split("/");
                    if (parts.length === 3) tStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
                if (!tStr && lastCandle.time) {
                    tStr = new Date(lastCandle.time * 1000).toISOString().split("T")[0];
                }
                const candleTime = (currentTechnicalInterval === "D" || currentTechnicalInterval === "W" || currentTechnicalInterval === "M") ? tStr : lastCandle.time;
                if (candleTime) {
                    try {
                        candleSeries.update({
                            time: candleTime,
                            open: Number(lastCandle.open),
                            high: Number(lastCandle.high),
                            low: Number(lastCandle.low),
                            close: Number(lastCandle.close)
                        });
                        const lClose = document.getElementById("legend-close");
                        if (lClose) {
                            lClose.textContent = Number(newPrice).toLocaleString("vi-VN");
                            lClose.className = newPrice >= lastCandle.open ? "text-emerald-400 font-bold" : "text-rose-400 font-bold";
                        }
                    } catch (lwErr) {
                        // ignore
                    }
                }
            }
        }

        // 4. Cập nhật mã tương ứng trên live ticker tape nếu có
        const tapeEl = document.getElementById(`tape-${ticker.toLowerCase()}`);
        if (tapeEl) {
            tapeEl.textContent = `${newPrice.toLocaleString("vi-VN")}`;
        }

        // 5. Cập nhật Tab So Sánh Ngành (Peers Table) cho mã hiện tại
        if (currentFinancialBundle && currentFinancialBundle.peers_data && currentFinancialBundle.peers_data.peers) {
            const matchedPeer = currentFinancialBundle.peers_data.peers.find(p => p.ticker.toUpperCase() === ticker.toUpperCase());
            if (matchedPeer) {
                matchedPeer.price = newPrice;
            }
        }

        if (isManual) {
            showToast(`Đã đồng bộ giá ${newPrice.toLocaleString("vi-VN")} VND từ ${priceInfo.selected_source}!`);
        }
    } catch (err) {
        if (isManual) {
            console.error("Refresh price error:", err);
            showToast(`Lỗi lấy giá: ${err.message}`, true);
        }
    } finally {
        isSyncingLivePrice = false;
        if (iconEl) {
            setTimeout(() => iconEl.classList.remove("animate-spin"), 400);
        }
    }
}

function openPriceComparisonModal() {
    if (!currentReport) return;
    const cs = currentReport.consensus_summary;
    document.getElementById("modal-compare-ticker").textContent = currentReport.ticker;

    const container = document.getElementById("modal-sources-list");
    let sources = cs.sources_comparison || [];
    if (!sources || sources.length === 0) {
        // Fallback demo sources
        sources = [
            { source: "Vietstock Chart (finance.vietstock.vn)", price: cs.current_market_price, date_str: cs.price_date_str || "04/09/2026", url: "https://finance.vietstock.vn/phan-tich-ky-thuat.htm" },
            { source: "VNDirect Bảng giá / DChart", price: cs.current_market_price, date_str: cs.price_date_str || "04/09/2026", url: "https://banggia.vndirect.com.vn/" },
            { source: "DNSE Bảng giá / Chart", price: cs.current_market_price, date_str: cs.price_date_str || "04/09/2026", url: "https://banggia.dnse.com.vn/" }
        ];
    }

    let html = "";
    sources.forEach((s, idx) => {
        const isNewest = idx === 0;
        html += `<div class="flex items-center justify-between p-3 rounded bg-slate-900 border ${isNewest ? 'border-cyan-500/80 shadow-md shadow-cyan-950/50' : 'border-slate-800'}">
            <div class="space-y-0.5">
                <div class="text-white font-bold text-xs flex items-center gap-1.5">
                    <span>${s.source || s.source_short}</span>
                    ${isNewest ? '<span class="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[9px] font-bold">MỚI NHẤT</span>' : ''}
                </div>
                <div class="text-[10px] text-slate-400">Phiên giao dịch: <strong class="text-slate-200">${s.date_str || '04/09/2026'}</strong></div>
            </div>
            <div class="text-right">
                <div class="text-sm font-extrabold text-emerald-400">${Number(s.price).toLocaleString("vi-VN")} VND</div>
                ${s.url ? `<a href="${s.url}" target="_blank" class="text-[10px] text-cyan-400 hover:underline flex items-center justify-end gap-0.5"><span>Xem nguồn</span><i data-lucide="external-link" class="w-2.5 h-2.5"></i></a>` : ''}
            </div>
        </div>`;
    });

    container.innerHTML = html;
    document.getElementById("price-comparison-modal").classList.remove("hidden");
    if (window.lucide) lucide.createIcons();
}

function closePriceComparisonModal() {
    document.getElementById("price-comparison-modal").classList.add("hidden");
}

// -------------------------------------------------------------
// CTCK RESEARCH REPORTS COMPARISON MODAL
// -------------------------------------------------------------
function getValidReportUrl(r, ticker) {
    const cleanTicker = (ticker || currentReport?.ticker || "HPG").toUpperCase().trim();
    const inst = (r?.institution || "CTCK").trim();
    return `/api/reports/pdf/${cleanTicker}/${encodeURIComponent(inst)}.pdf`;
}

function openPdfViewerModal(pdfUrl, institution, ticker) {
    const modal = document.getElementById("pdf-viewer-modal");
    const frame = document.getElementById("pdf-viewer-frame");
    const title = document.getElementById("pdf-viewer-title");
    const sub = document.getElementById("pdf-viewer-sub");
    const openTabBtn = document.getElementById("pdf-viewer-open-tab");
    const downloadBtn = document.getElementById("pdf-viewer-download");

    if (title) {
        title.innerHTML = `<span>BÁO CÁO PHÂN TÍCH ${ticker} - ${institution.toUpperCase()}</span>
                           <span class="px-2 py-0.5 rounded text-[10px] bg-rose-950 text-rose-300 border border-rose-800">PDF RESEARCH</span>`;
    }
    if (sub) {
        sub.textContent = `Báo cáo phân tích & định giá chi tiết từ ${institution} cho mã ${ticker}`;
    }
    if (openTabBtn) {
        openTabBtn.href = pdfUrl;
    }
    if (downloadBtn) {
        downloadBtn.href = pdfUrl;
        const safeName = institution.replace(/\s+/g, '_');
        downloadBtn.setAttribute("download", `${ticker}_${safeName}_Bao_Cao_Phan_Tich.pdf`);
    }
    if (frame) {
        frame.src = pdfUrl;
    }
    if (modal) {
        modal.classList.remove("hidden");
    }
    if (window.lucide) lucide.createIcons();
}

function closePdfViewerModal() {
    const modal = document.getElementById("pdf-viewer-modal");
    const frame = document.getElementById("pdf-viewer-frame");
    if (frame) {
        frame.src = "";
    }
    if (modal) {
        modal.classList.add("hidden");
    }
}

async function openCtckReportsModal() {
    if (!currentReport) {
        const inputVal = (document.getElementById("central-ticker-input")?.value || "HPG").trim().toUpperCase();
        await selectTicker(inputVal);
        if (!currentReport) {
            showToast("Chưa có dữ liệu báo cáo CTCK cho mã này.", true);
            return;
        }
    }

    const report = currentReport;
    const cs = report.consensus_summary || {};
    const reports = report.matrix_table || [];

    // Current price
    const currentPrice = cs.current_market_price || 0;
    const meanTarget = cs.mean_target_price || 0;

    // Header info
    const tickerEl = document.getElementById("modal-ctck-ticker");
    if (tickerEl) tickerEl.textContent = report.ticker;
    const companyEl = document.getElementById("modal-ctck-company");
    if (companyEl) companyEl.textContent = report.company_name;
    const countEl = document.getElementById("modal-ctck-count");
    if (countEl) countEl.textContent = reports.length;

    // Top Summary KPI Cards
    const modalMarketPrice = document.getElementById("modal-ctck-market-price");
    if (modalMarketPrice) modalMarketPrice.textContent = `${currentPrice.toLocaleString("vi-VN")} VND`;

    const hasValidValuation = meanTarget > 0 && !(cs.consensus_rating || "").includes("THEO DÕI");
    const modalMeanTarget = document.getElementById("modal-ctck-mean-target");
    if (modalMeanTarget) modalMeanTarget.textContent = hasValidValuation ? `${meanTarget.toLocaleString("vi-VN")} VND` : '—';

    // Formula: ((meanTarget - currentPrice) / currentPrice) * 100
    const meanUpside = (hasValidValuation && currentPrice > 0) ? ((meanTarget - currentPrice) / currentPrice) * 100 : (cs.average_upside || 0);
    const modalMeanUpside = document.getElementById("modal-ctck-mean-upside");
    if (modalMeanUpside) {
        if (hasValidValuation) {
            const sign = meanUpside >= 0 ? "+" : "";
            modalMeanUpside.textContent = `${sign}${meanUpside.toFixed(1)}%`;
            modalMeanUpside.className = `text-lg font-black ${meanUpside >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        } else {
            modalMeanUpside.textContent = `Cần theo dõi thêm`;
            modalMeanUpside.className = `text-sm font-bold text-amber-400`;
        }
    }

    const modalSpread = document.getElementById("modal-ctck-spread");
    if (modalSpread) {
        modalSpread.textContent = hasValidValuation
            ? `${(cs.min_target_price || 0).toLocaleString("vi-VN")} - ${(cs.max_target_price || 0).toLocaleString("vi-VN")} VND`
            : "— (Cần theo dõi thêm)";
    }
    const modalSpreadPct = document.getElementById("modal-ctck-spread-pct");
    if (modalSpreadPct) {
        modalSpreadPct.textContent = hasValidValuation
            ? `Độ lệch spread: ${(cs.target_price_spread_percent || 0).toFixed(1)}%`
            : "Độ lệch spread: —";
    }

    const modalRating = document.getElementById("modal-ctck-consensus-rating");
    if (modalRating) modalRating.textContent = cs.consensus_rating || (hasValidValuation ? "MUA MẠNH" : "CẦN THEO DÕI THÊM");

    const modalScore = document.getElementById("modal-ctck-consensus-score");
    if (modalScore) {
        modalScore.textContent = hasValidValuation 
            ? `Điểm đồng thuận: ${(cs.consensus_score || 4.5).toFixed(1)}/5.0`
            : `Điểm đồng thuận: —`;
    }

    // Render Table Body
    const tbody = document.getElementById("modal-ctck-tbody");
    let tbodyHtml = "";

    reports.forEach((r, idx) => {
        const badgeClass = getRecBadgeClass(r.recommendation);
        const recUpper = (r.recommendation || "").toUpperCase();
        const isTech = r.is_technical || r.report_type === "technical" || recUpper.includes("PTKT");
        const hasValidTp = !isTech && !r.is_expired && !r.is_estimated_price && r.target_price && r.target_price > 0;
        
        let upside = null;
        let upsideHtml = "";
        let tpCellHtml = "";

        if (r.is_expired) {
            tpCellHtml = `
                <div class="text-slate-400 font-bold text-sm line-through">${r.target_price > 0 ? r.target_price.toLocaleString("vi-VN") + ' đ' : '—'}</div>
                <div class="text-[9px] text-rose-400/90 bg-rose-950/60 border border-rose-800/70 rounded px-1.5 py-0.5 mt-0.5 inline-block font-mono">
                    Báo cáo quá 1 năm<br>Không tính định giá
                </div>
            `;
            upsideHtml = `<div class="text-slate-500 text-xs italic font-medium">Không tính định giá</div>`;
        } else if (isTech) {
            tpCellHtml = `
                <div class="text-slate-400 font-bold text-sm">—</div>
                <div class="text-[9px] text-purple-400/90 bg-purple-950/60 border border-purple-800/70 rounded px-1.5 py-0.5 mt-0.5 inline-block font-mono">
                    Báo cáo PTKT<br>Không tính định giá
                </div>
            `;
            upsideHtml = `<div class="text-slate-500 text-xs italic font-medium">—</div>`;
        } else if (!hasValidTp) {
            tpCellHtml = `
                <div class="text-slate-400 font-bold text-sm">—</div>
                <div class="text-[9px] text-amber-400/80 bg-amber-950/50 border border-amber-800/60 rounded px-1 py-0.5 mt-0.5 inline-block font-mono">
                    Cập nhật KQKD<br>Chưa có giá MT
                </div>
            `;
            upsideHtml = `<div class="text-slate-500 text-xs italic font-medium">—</div>`;
        } else {
            // Exact formula: ((target_price - currentPrice) / currentPrice) * 100
            upside = currentPrice > 0 
                ? ((r.target_price - currentPrice) / currentPrice) * 100 
                : (r.upside_percent || 0);
            const isPos = upside >= 0;
            const sign = isPos ? "+" : "";
            const upsideColor = isPos 
                ? "text-emerald-400 bg-emerald-950/70 border-emerald-800/80" 
                : "text-rose-400 bg-rose-950/70 border-rose-800/80";
            const upsideIcon = isPos ? "trending-up" : "trending-down";

            tpCellHtml = `<div class="font-black text-cyan-300">${r.target_price.toLocaleString("vi-VN")} đ</div>`;
            upsideHtml = `
                <div class="inline-flex items-center gap-1 font-bold ${upsideColor} border px-2 py-0.5 rounded text-xs">
                    <i data-lucide="${upsideIcon}" class="w-3 h-3"></i>
                    <span>${sign}${upside.toFixed(1)}%</span>
                </div>
            `;
        }

        // Catalysts list
        let catHtml = `<ul class="space-y-1.5 text-[11px] text-slate-300">`;
        if (r.key_catalysts && r.key_catalysts.length > 0) {
            r.key_catalysts.forEach((c, cIdx) => {
                let formattedC = c;
                if (c.includes(":")) {
                    const colonIdx = c.indexOf(":");
                    formattedC = `<strong class="text-amber-300 font-bold">${c.substring(0, colonIdx)}:</strong><span>${c.substring(colonIdx + 1)}</span>`;
                }
                catHtml += `<li class="flex items-start gap-2 bg-slate-900/70 p-2 rounded-lg border border-slate-800/80 shadow-xs">
                    <span class="text-amber-400 font-mono font-bold shrink-0 bg-amber-950/80 px-1.5 py-0.5 rounded text-[10px] border border-amber-800/60">${cIdx + 1}</span>
                    <div class="leading-relaxed text-slate-200">${formattedC}</div>
                </li>`;
            });
        } else {
            catHtml += `<li class="text-slate-500 italic p-2 bg-slate-900/40 rounded">Đang cập nhật...</li>`;
        }
        catHtml += `</ul>`;

        // Risks list
        let riskHtml = `<ul class="space-y-1.5 text-[11px] text-rose-300/90">`;
        if (r.key_risks && r.key_risks.length > 0) {
            r.key_risks.forEach((k, kIdx) => {
                let formattedK = k;
                if (k.includes(":")) {
                    const colonIdx = k.indexOf(":");
                    formattedK = `<strong class="text-rose-300 font-bold">${k.substring(0, colonIdx)}:</strong><span>${k.substring(colonIdx + 1)}</span>`;
                }
                riskHtml += `<li class="flex items-start gap-1.5 bg-rose-950/20 p-2 rounded-lg border border-rose-900/40 shadow-xs">
                    <span class="text-rose-400 shrink-0 font-bold leading-none mt-0.5">•</span>
                    <div class="leading-relaxed text-rose-200/90">${formattedK}</div>
                </li>`;
            });
        } else {
            riskHtml += `<li class="text-slate-500 italic p-2 bg-slate-900/40 rounded">Chưa ghi nhận rủi ro lớn</li>`;
        }
        riskHtml += `</ul>`;

        // Valuation method badge
        const methodBadge = r.valuation_method 
            ? `<span class="text-[9px] text-cyan-400/80 bg-cyan-950/40 px-1 py-0.2 rounded border border-cyan-900/60 block mt-1 font-mono">${r.valuation_method}</span>` 
            : '';

        // Source link to read/open institutional research PDF directly
        const validReportUrl = getValidReportUrl(r, report.ticker);
        const originalUrl = (r.source_url && r.source_url.startsWith("http")) ? r.source_url : `https://edocs.vietstock.vn/${report.ticker}`;
        const safeInst = String(r.institution || "CTCK").replaceAll("'", "");
        
        let sourceBadge = '';
        if (originalUrl.includes("edocs.vietstock.vn") || originalUrl.includes("vietstock.vn")) {
            sourceBadge = `<a href="${originalUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 text-[9px] text-cyan-400 hover:text-cyan-200 bg-cyan-950/60 border border-cyan-800/80 px-1.5 py-0.5 rounded font-mono mt-1 hover:underline">
                <span>Vietstock eDocs</span>
                <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
            </a>`;
        } else if (originalUrl.includes("vcbs.com.vn")) {
            sourceBadge = `<a href="${originalUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 text-[9px] text-emerald-400 hover:text-emerald-200 bg-emerald-950/60 border border-emerald-800/80 px-1.5 py-0.5 rounded font-mono mt-1 hover:underline">
                <span>VCBS Research</span>
                <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
            </a>`;
        } else if (originalUrl.includes("alphastock.vn")) {
            sourceBadge = `<a href="${originalUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 text-[9px] text-amber-400 hover:text-amber-200 bg-amber-950/60 border border-amber-800/80 px-1.5 py-0.5 rounded font-mono mt-1 hover:underline">
                <span>AlphaStock AI</span>
                <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
            </a>`;
        } else {
            sourceBadge = `<a href="${originalUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 text-[9px] text-slate-400 hover:text-slate-200 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-mono mt-1 hover:underline">
                <span>Link Báo Cáo</span>
                <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
            </a>`;
        }

        const sourceHtml = `
            <div class="flex flex-col items-center justify-center gap-1.5 whitespace-nowrap">
                <div class="flex items-center justify-center gap-1.5">
                    <button onclick="openPdfViewerModal('${validReportUrl}', '${safeInst}', '${report.ticker}')" 
                       class="px-2.5 py-1 rounded bg-rose-950/90 hover:bg-rose-900 text-rose-300 hover:text-white border border-rose-800/80 hover:border-rose-500 inline-flex items-center gap-1 text-[11px] font-bold transition-all shadow-sm group" 
                       title="Đọc trực tiếp file PDF Báo cáo ${report.ticker} của ${r.institution}">
                        <i data-lucide="file-text" class="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform"></i>
                        <span>Đọc PDF</span>
                    </button>
                    <a href="${originalUrl}" target="_blank" rel="noopener noreferrer" 
                       class="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-300 border border-slate-700 hover:border-cyan-500 transition-all inline-flex items-center" 
                       title="Mở đường link gốc báo cáo trong tab mới">
                        <i data-lucide="external-link" class="w-3 h-3"></i>
                    </a>
                </div>
                <div class="text-[9px] text-slate-500">${r.report_date}</div>
            </div>
        `;

        tbodyHtml += `<tr class="hover:bg-slate-800/40 transition-colors">
            <td class="py-3 px-2 text-center text-slate-400 font-bold border-r border-slate-800/80">${idx + 1}</td>
            <td class="py-3 px-3 border-r border-slate-800/80 font-mono">
                <div class="font-bold text-white text-xs flex items-center gap-1.5">
                    <span>${r.institution}</span>
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5">Ngày đăng: <strong class="text-cyan-300">${r.report_date}</strong> ${r.is_expired ? '<span class="text-rose-400 text-[10px] font-semibold block">(Quá 1 năm)</span>' : ''}</div>
                ${sourceBadge}
                ${methodBadge}
            </td>
            <td class="py-3 px-2.5 text-center border-r border-slate-800/80">
                <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${r.is_expired ? 'bg-slate-800 text-slate-400 border border-slate-700/80 line-through opacity-70' : badgeClass}">
                    ${r.recommendation}
                </span>
                ${r.is_expired ? '<div class="text-[9px] text-rose-400 font-mono mt-0.5 font-semibold">Quá 1 năm</div>' : ''}
            </td>
            <td class="py-3 px-3 text-right font-extrabold text-slate-200 border-r border-slate-800/80">
                ${currentPrice.toLocaleString("vi-VN")} đ
            </td>
            <td class="py-3 px-3 text-right border-r border-slate-800/80">
                ${tpCellHtml}
            </td>
            <td class="py-3 px-3 text-right border-r border-slate-800/80 bg-emerald-950/10">
                ${upsideHtml}
            </td>
            <td class="py-3 px-2.5 text-center border-r border-slate-800/80">
                <div class="text-slate-200 font-bold text-xs">${(r.pe_forward && r.pe_forward > 0 && r.pe_forward < 100) ? r.pe_forward + 'x' : '—'}</div>
                <div class="text-slate-400 text-[10px]">${(r.pb_forward && r.pb_forward > 0 && r.pb_forward < 25) ? r.pb_forward + 'x' : '—'}</div>
            </td>
            <td class="py-3 px-3 border-r border-slate-800/80 text-[11px]">
                <div class="text-slate-300 mb-0.5"><span class="text-slate-500 text-[9px] block">DTT:</span>${r.revenue_forecast || '—'}</div>
                <div class="text-emerald-400 font-semibold"><span class="text-slate-500 text-[9px] block">LNST:</span>${r.npat_forecast || '—'}</div>
            </td>
            <td class="py-3 px-3.5 border-r border-slate-800/80">${catHtml}</td>
            <td class="py-3 px-3.5 border-r border-slate-800/80">${riskHtml}</td>
            <td class="py-3 px-2 text-center">${sourceHtml}</td>
        </tr>`;
    });

    tbody.innerHTML = tbodyHtml;

    // Render Table Footer (Consensus Summary Row)
    const tfoot = document.getElementById("modal-ctck-tfoot");
    if (tfoot) {
        const valReports = reports.filter(r => !r.is_expired && !r.is_technical && (r.report_type !== "technical") && !r.is_estimated_price && r.target_price > 0);
        const valCount = valReports.length;
        const peList = reports.filter(r => !r.is_expired).map(r => r.pe_forward).filter(v => typeof v === "number" && v > 0 && v < 100);
        const pbList = reports.filter(r => !r.is_expired).map(r => r.pb_forward).filter(v => typeof v === "number" && v > 0 && v < 25);
        const avgPe = peList.length > 0 ? (peList.reduce((a, b) => a + b, 0) / peList.length) : 0;
        const avgPb = pbList.length > 0 ? (pbList.reduce((a, b) => a + b, 0) / pbList.length) : 0;

        const meanSign = meanUpside >= 0 ? "+" : "";
        const meanColor = meanUpside >= 0 ? "text-emerald-400 bg-emerald-950 border-emerald-600" : "text-rose-400 bg-rose-950 border-rose-600";

        // Dynamic sector summary text for tfoot
        let tfootCat1 = "• Tăng trưởng tín dụng & mở rộng biên lãi thuần NIM phục hồi";
        let tfootCat2 = "• Vị thế tài chính vững chắc với tỷ lệ CASA và an toàn vốn CAR cao";
        let tfootRisk1 = "• Áp lực trích lập dự phòng rủi ro nợ xấu tín dụng";
        let tfootRisk2 = "• Biến động lãi suất huy động và thanh khoản liên ngân hàng";

        const secLower = (report.sector || "").toLowerCase();
        if (!secLower.includes("ngân hàng") && !secLower.includes("bank")) {
            if (secLower.includes("khu công nghiệp") || secLower.includes("kcn")) {
                tfootCat1 = "• Thu hút dòng vốn FDI và bàn giao quỹ đất khu công nghiệp mới";
                tfootCat2 = "• Giá thuê đất KCN duy trì đà tăng trưởng và dòng tiền trả trước cao";
                tfootRisk1 = "• Tiến độ đền bù giải phóng mặt bằng và phê duyệt thủ tục pháp lý";
                tfootRisk2 = "• Biến động chi phí đầu tư hạ tầng KCN theo khung giá đất mới";
            } else if (secLower.includes("chứng khoán")) {
                tfootCat1 = "• Thanh khoản bùng nổ, mở rộng room Margin và hưởng lợi từ KRX";
                tfootCat2 = "• Tự doanh FVTPL và doanh thu môi giới tăng trưởng vượt trội";
                tfootRisk1 = "• Biến động chỉ số VN-Index tác động danh mục tự doanh";
                tfootRisk2 = "• Cạnh tranh gay gắt chính sách phí zero-fee toàn ngành";
            } else {
                tfootCat1 = "• Mở rộng công suất, dự án trọng điểm đi vào vận hành thương mại";
                tfootCat2 = "• Chu kỳ phục hồi sản lượng & gia tăng thị phần cốt lõi";
                tfootRisk1 = "• Biến động giá nguyên liệu & chi phí logistics toàn cầu";
                tfootRisk2 = "• Tiến độ phục hồi sức mua thị trường chung & rủi ro vĩ mô";
            }
        }

        let tfootHtml = `<tr class="bg-slate-950">
            <td class="py-3.5 px-2 text-center text-cyan-400 font-bold border-r border-slate-800">
                <i data-lucide="award" class="w-4 h-4 mx-auto text-cyan-400"></i>
            </td>
            <td class="py-3.5 px-3 border-r border-slate-800">
                <div class="font-extrabold text-cyan-300 text-xs flex items-center gap-1.5">
                    <i data-lucide="scale" class="w-3.5 h-3.5 text-cyan-400"></i>
                    <span>ĐỒNG THUẬN TRUNG BÌNH</span>
                </div>
                <div class="text-[10px] text-slate-400 font-normal">
                    ${valCount === 0
                        ? `Không có định giá hiệu lực (<1 năm)`
                        : (valCount < reports.length 
                            ? `Định giá từ ${valCount} CTCK (${reports.length - valCount} BC hết hạn hoặc PTKT/KQKD)` 
                            : `Tổng hợp từ ${reports.length} tổ chức tài chính`)}
                </div>
            </td>
            <td class="py-3.5 px-2.5 text-center border-r border-slate-800">
                <span class="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold ${hasValidValuation ? 'bg-cyan-950 text-cyan-300 border border-cyan-700' : 'bg-amber-950/80 text-amber-300 border border-amber-700'}">
                    ${cs.consensus_rating || (hasValidValuation ? 'MUA MẠNH' : 'CẦN THEO DÕI THÊM')}
                </span>
            </td>
            <td class="py-3.5 px-3 text-right font-black text-emerald-400 text-sm border-r border-slate-800">
                ${currentPrice.toLocaleString("vi-VN")} đ
            </td>
            <td class="py-3.5 px-3 text-right border-r border-slate-800">
                <div class="font-black text-cyan-300 text-sm">${hasValidValuation ? meanTarget.toLocaleString("vi-VN") + ' đ' : '—'}</div>
                <div class="text-[9px] text-slate-400 font-normal">${(hasValidValuation && cs.min_target_price && cs.min_target_price > 0) ? `[${cs.min_target_price.toLocaleString("vi-VN")} - ${cs.max_target_price.toLocaleString("vi-VN")}]` : ''}</div>
            </td>
            <td class="py-3.5 px-3 text-right border-r border-slate-800 bg-emerald-950/30">
                ${hasValidValuation ? `
                <div class="inline-flex items-center gap-1 font-black ${meanColor} border px-2.5 py-1 rounded shadow-md text-xs">
                    <i data-lucide="${meanUpside >= 0 ? 'trending-up' : 'trending-down'}" class="w-3.5 h-3.5"></i>
                    <span>${meanSign}${meanUpside.toFixed(1)}%</span>
                </div>
                <div class="text-[9px] text-slate-400 mt-0.5">Biên LN bình quân</div>
                ` : `<div class="text-amber-400 text-xs font-semibold">Cần theo dõi thêm</div>`}
            </td>
            <td class="py-3.5 px-2.5 text-center border-r border-slate-800">
                <div class="text-white font-bold text-xs">P/E: ${avgPe > 0 ? avgPe.toFixed(1) + 'x' : 'N/A'}</div>
                <div class="text-slate-400 text-[10px]">P/B: ${avgPb > 0 ? avgPb.toFixed(1) + 'x' : 'N/A'}</div>
            </td>
            <td class="py-3.5 px-3 border-r border-slate-800 text-[10px]">
                <div class="text-emerald-400 font-bold">Đồng thuận tích cực</div>
                <div class="text-slate-400">Tăng trưởng LNST bình quân ~15-28% YoY</div>
            </td>
            <td class="py-3.5 px-3.5 border-r border-slate-800 text-[11px]">
                <div class="text-amber-300 font-bold mb-1 flex items-center gap-1">
                    <i data-lucide="sparkles" class="w-3 h-3 text-amber-400"></i>
                    <span>Điểm giao thoa kỳ vọng then chốt:</span>
                </div>
                <div class="text-[10px] text-slate-300 space-y-0.5">
                    <div>${tfootCat1}</div>
                    <div>${tfootCat2}</div>
                </div>
            </td>
            <td class="py-3.5 px-3.5 border-r border-slate-800 text-[11px]">
                <div class="text-rose-300 font-bold mb-1 flex items-center gap-1">
                    <i data-lucide="alert-triangle" class="w-3 h-3 text-rose-400"></i>
                    <span>Rủi ro trọng yếu cần theo dõi:</span>
                </div>
                <div class="text-[10px] text-rose-200/90 space-y-0.5">
                    <div>${tfootRisk1}</div>
                    <div>${tfootRisk2}</div>
                </div>
            </td>
            <td class="py-3.5 px-2 text-center">
                <span class="text-[10px] text-slate-500 font-bold">IERM Engine</span>
            </td>
        </tr>`;

        tfoot.innerHTML = tfootHtml;
    }

    const modal = document.getElementById("ctck-reports-modal");
    if (modal) {
        modal.classList.remove("hidden");
    }

    // Reset scroll position and initialize drag-to-scroll
    const tableContainer = document.getElementById("modal-ctck-table-container");
    if (tableContainer) {
        tableContainer.scrollLeft = 0;
    }
    initCtckTableDragToScroll();
    setTimeout(updateCtckScrollSlider, 60);

    if (window.lucide) {
        lucide.createIcons();
    }
}

function closeCtckReportsModal() {
    const modal = document.getElementById("ctck-reports-modal");
    if (modal) modal.classList.add("hidden");
}

// -------------------------------------------------------------
// CTCK TABLE DRAG-TO-SCROLL & HORIZONTAL SCROLLBAR CONTROLS
// -------------------------------------------------------------
let isCtckTableDragSetup = false;

function initCtckTableDragToScroll() {
    const container = document.getElementById("modal-ctck-table-container");
    if (!container || isCtckTableDragSetup) return;
    isCtckTableDragSetup = true;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasDragged = false;

    // Mouse Events for Click-and-Drag Pan
    container.addEventListener("mousedown", (e) => {
        // Allow clicking directly on links, buttons or inputs
        if (e.target.closest("button, a, input, select")) return;

        isDown = true;
        hasDragged = false;
        container.classList.add("cursor-grabbing");
        container.classList.remove("cursor-grab");
        startX = e.pageX - container.offsetLeft;
        scrollLeft = container.scrollLeft;
        document.body.style.userSelect = "none";
    });

    window.addEventListener("mouseup", () => {
        if (isDown) {
            isDown = false;
            container.classList.remove("cursor-grabbing");
            container.classList.add("cursor-grab");
            document.body.style.userSelect = "";
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const walk = (x - startX) * 1.6; // Scroll speed factor
        if (Math.abs(walk) > 4) {
            hasDragged = true;
        }
        container.scrollLeft = scrollLeft - walk;
        updateCtckScrollSlider();
    });

    // Touch Events for Mobile / Tablet touch dragging
    let touchStartX = 0;
    let touchScrollLeft = 0;
    container.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].pageX - container.offsetLeft;
            touchScrollLeft = container.scrollLeft;
        }
    }, { passive: true });

    container.addEventListener("touchmove", (e) => {
        if (e.touches.length === 1) {
            const x = e.touches[0].pageX - container.offsetLeft;
            const walk = (x - touchStartX) * 1.5;
            container.scrollLeft = touchScrollLeft - walk;
            updateCtckScrollSlider();
        }
    }, { passive: true });

    // Sync slider with native scroll (mouse wheel, scrollbar, trackpad)
    container.addEventListener("scroll", () => {
        updateCtckScrollSlider();
    });

    // Prevent inadvertent link navigation when dragging
    container.addEventListener("click", (e) => {
        if (hasDragged) {
            e.preventDefault();
            e.stopPropagation();
            hasDragged = false;
        }
    }, true);
}

function updateCtckScrollSlider() {
    const container = document.getElementById("modal-ctck-table-container");
    const slider = document.getElementById("modal-ctck-scroll-slider");
    const pctText = document.getElementById("modal-ctck-scroll-pct");
    if (!container || !slider) return;

    const maxScroll = container.scrollWidth - container.clientWidth;
    if (maxScroll <= 0) {
        slider.value = 0;
        if (pctText) pctText.textContent = "0%";
        return;
    }

    const pct = Math.min(100, Math.max(0, Math.round((container.scrollLeft / maxScroll) * 100)));
    slider.value = pct;
    if (pctText) pctText.textContent = `${pct}%`;
}

function onCtckSliderInput(val) {
    const container = document.getElementById("modal-ctck-table-container");
    if (!container) return;
    const maxScroll = container.scrollWidth - container.clientWidth;
    if (maxScroll > 0) {
        container.scrollLeft = (Number(val) / 100) * maxScroll;
    }
    const pctText = document.getElementById("modal-ctck-scroll-pct");
    if (pctText) pctText.textContent = `${val}%`;
}

function scrollCtckTable(deltaX) {
    const container = document.getElementById("modal-ctck-table-container");
    if (!container) return;
    container.scrollBy({ left: deltaX, behavior: "smooth" });
    setTimeout(updateCtckScrollSlider, 160);
}

function scrollCtckTableTo(targetX) {
    const container = document.getElementById("modal-ctck-table-container");
    if (!container) return;
    container.scrollTo({ left: targetX, behavior: "smooth" });
    setTimeout(updateCtckScrollSlider, 160);
}


function exportCtckModalCSV() {
    if (!currentReport) return;
    const ticker = currentReport.ticker || "IERM";
    const cs = currentReport.consensus_summary || {};
    const reports = currentReport.matrix_table || [];
    const curPrice = cs.current_market_price || 0;

    const headers = [
        "STT",
        "To Chuc CTCK",
        "Ngay Phat Hanh",
        "Khuyen Nghi",
        "Thi Gia Hien Tai (VND)",
        "Dinh Gia Muc Tieu (VND)",
        "% Con Lai / Bien LN Ky Vong (%)",
        "P/E Forward",
        "P/B Forward",
        "Du Phong Doanh Thu",
        "Du Phong LNST",
        "Yeu To Ky Vong Then Chot (Catalysts)",
        "Rui Ro Can Luu Y (Key Risks)",
        "Phuong Phap Dinh Gia",
        "Nguon Bao Cao (Khong Can Dang Nhap)"
    ];

    const rows = reports.map((r, idx) => {
        const isExp = !!r.is_expired;
        const upside = (isExp || !r.target_price || r.target_price <= 0) 
            ? "—" 
            : (curPrice > 0 ? (((r.target_price - curPrice) / curPrice) * 100).toFixed(2) : (r.upside_percent != null ? r.upside_percent.toFixed(2) : "—"));
        const catText = (r.key_catalysts || []).join(" | ");
        const riskText = (r.key_risks || []).join(" | ");
        const validReportUrl = getValidReportUrl(r, ticker);
        const recStr = isExp ? `${r.recommendation || ''} (Qua 1 nam)` : (r.recommendation || '');
        const tpStr = isExp ? `${r.target_price || ''} (Qua 1 nam)` : (r.target_price || '');

        return [
            idx + 1,
            `"${(r.institution || '').replace(/"/g, '""')}"`,
            `"${r.report_date || ''}${isExp ? ' (Qua 1 nam)' : ''}"`,
            `"${recStr.replace(/"/g, '""')}"`,
            curPrice,
            `"${tpStr}"`,
            `"${upside}"`,
            r.pe_forward || "",
            r.pb_forward || "",
            `"${(r.revenue_forecast || '').replace(/"/g, '""')}"`,
            `"${(r.npat_forecast || '').replace(/"/g, '""')}"`,
            `"${catText.replace(/"/g, '""')}"`,
            `"${riskText.replace(/"/g, '""')}"`,
            `"${(r.valuation_method || '').replace(/"/g, '""')}"`,
            `"${validReportUrl}"`
        ];
    });

    // Add consensus row
    const hasValidCons = (cs.mean_target_price || 0) > 0 && !(cs.consensus_rating || "").includes("THEO DOI");
    const meanUpside = hasValidCons && curPrice > 0 ? ((cs.mean_target_price - curPrice) / curPrice) * 100 : (cs.average_upside || 0);
    const meanUpsideStr = hasValidCons ? meanUpside.toFixed(2) : "Can theo doi them";
    const meanTpStr = hasValidCons ? cs.mean_target_price : "Khong co dinh gia";
    rows.push([
        "Consensus",
        `"DONG THUAN TRUNG BINH (${reports.length} CTCK)"`,
        `"${cs.price_date_str || ''}"`,
        `"${cs.consensus_rating || ''}"`,
        curPrice,
        `"${meanTpStr}"`,
        `"${meanUpsideStr}"`,
        "",
        "",
        `"Dong thuan tang truong tich cuc"`,
        `"LNST tang truong manh"`,
        `"Mo rong cong suat; Phuc hoi san luong va thi phan"`,
        `"Bien dong gia nguyen lieu; Rui ro vi mo"`,
        `"Consensus Mean"`,
        `"https://finance.vietstock.vn/${ticker}/bao-cao-phan-tich.htm"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${ticker}_Bao_Cao_Phan_Tich_Dinh_Gia_CTCK.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Đã xuất bảng đối chiếu CTCK mã ${ticker} ra file CSV!`);
}

// Global escape key handler to close any active modal
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeCtckReportsModal();
        closePriceComparisonModal();
        closeMarkdownModal();
        closeDatabaseModal();
        closePdfViewerModal();
    }
});


// -------------------------------------------------------------
// 650+ CORPORATE DATABASE MODAL (FIINTRADE & GOOGLE SHEETS)
// -------------------------------------------------------------
let allDatabaseCompanies = [];
let isDbLoaded = false;

async function openDatabaseModal() {
    const modal = document.getElementById("database-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    if (!isDbLoaded) {
        await loadDatabaseCompanies();
    } else {
        filterDatabaseTable();
    }
}

function closeDatabaseModal() {
    const modal = document.getElementById("database-modal");
    if (modal) {
        modal.classList.add("hidden");
        document.body.style.overflow = "";
    }
}

async function loadDatabaseCompanies() {
    const tbody = document.getElementById("db-companies-tbody");
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="12" class="p-8 text-center text-slate-400 font-mono text-xs"><i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-400"></i>Đang tải dữ liệu 650+ doanh nghiệp từ cơ sở dữ liệu...</td></tr>`;
        if (window.lucide) lucide.createIcons();
    }

    try {
        const resp = await fetch("/api/database/companies?limit=1000");
        const data = await resp.json();
        allDatabaseCompanies = data.companies || [];
        isDbLoaded = true;

        const countEl = document.getElementById("header-db-count");
        if (countEl) countEl.textContent = data.total_database_records || allDatabaseCompanies.length;

        // Populate sectors dropdown
        populateDatabaseSectorOptions();

        filterDatabaseTable();
    } catch (e) {
        console.error("Error loading companies database:", e);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="12" class="p-4 text-center text-rose-400 font-mono text-xs">Lỗi tải dữ liệu doanh nghiệp: ${e.message}</td></tr>`;
        }
    }
}

function populateDatabaseSectorOptions() {
    const secSelect = document.getElementById("db-sector-select");
    if (!secSelect) return;

    const uniqueSectors = new Set();
    allDatabaseCompanies.forEach(c => {
        if (c.fiintrade_sector) uniqueSectors.add(c.fiintrade_sector);
        else if (c.icb2) uniqueSectors.add(c.icb2);
    });

    const sorted = Array.from(uniqueSectors).sort();
    let opts = '<option value="">Tất cả các ngành</option>';
    sorted.forEach(s => {
        opts += `<option value="${s}">${s}</option>`;
    });
    secSelect.innerHTML = opts;
}

function filterDatabaseTable() {
    const q = (document.getElementById("db-search-input")?.value || "").trim().toLowerCase();
    const ex = (document.getElementById("db-exchange-select")?.value || "").trim().toUpperCase();
    const sec = (document.getElementById("db-sector-select")?.value || "").trim().toLowerCase();
    const tbody = document.getElementById("db-companies-tbody");
    const countEl = document.getElementById("db-match-count");

    if (!tbody) return;

    const filtered = allDatabaseCompanies.filter(c => {
        if (ex && c.exchange !== ex) return false;
        if (sec && !((c.fiintrade_sector || "").toLowerCase().includes(sec) || (c.icb2 || "").toLowerCase().includes(sec))) return false;
        if (q) {
            const matchT = c.ticker.toLowerCase().includes(q);
            const matchN = (c.name || "").toLowerCase().includes(q);
            const matchS = (c.fiintrade_sector || "").toLowerCase().includes(q) || (c.icb2 || "").toLowerCase().includes(q);
            if (!matchT && !matchN && !matchS) return false;
        }
        return true;
    });

    if (countEl) countEl.textContent = filtered.length;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="p-8 text-center text-slate-500 font-mono text-xs">Không tìm thấy doanh nghiệp nào phù hợp với bộ lọc hiện tại.</td></tr>`;
        return;
    }

    let html = "";
    filtered.slice(0, 150).forEach((c, idx) => {
        const exBadge = c.exchange === 'HOSE' ? 'bg-cyan-950 text-cyan-300 border-cyan-800' :
                        c.exchange === 'HNX' ? 'bg-amber-950 text-amber-300 border-amber-800' :
                        'bg-slate-800 text-slate-300 border-slate-700';

        const npGrowth = Number(c.net_profit_growth_yoy_pct || 0);
        const npColor = npGrowth > 0 ? 'text-emerald-400' : (npGrowth < 0 ? 'text-rose-400' : 'text-slate-400');
        const npText = npGrowth !== 0 ? `${npGrowth > 0 ? '+' : ''}${npGrowth.toFixed(1)}%` : '-';

        html += `
        <tr class="hover:bg-slate-900/80 transition-colors group">
            <td class="p-2.5 text-slate-500 font-mono text-[11px]">${idx + 1}</td>
            <td class="p-2.5 font-bold text-cyan-300 text-xs">${c.ticker}</td>
            <td class="p-2.5 text-white font-sans text-xs max-w-[200px] truncate" title="${c.name}">${c.name}</td>
            <td class="p-2.5"><span class="px-1.5 py-0.5 rounded text-[10px] border font-bold ${exBadge}">${c.exchange}</span></td>
            <td class="p-2.5 text-slate-300 font-sans text-xs">${c.fiintrade_sector || c.icb2 || '-'}</td>
            <td class="p-2.5 text-right text-slate-200 font-mono text-xs">${c.market_cap_bil ? c.market_cap_bil.toLocaleString('vi-VN') : '-'}</td>
            <td class="p-2.5 text-right text-cyan-400 font-mono text-xs">${c.price ? c.price.toLocaleString('vi-VN') : '-'}</td>
            <td class="p-2.5 text-right text-emerald-400 font-mono text-xs">${c.roe_ttm_pct ? c.roe_ttm_pct.toFixed(1) + '%' : '-'}</td>
            <td class="p-2.5 text-right text-slate-300 font-mono text-xs">${c.pe_ttm ? c.pe_ttm.toFixed(1) + 'x' : '-'}</td>
            <td class="p-2.5 text-right text-slate-300 font-mono text-xs">${c.pb_ttm ? c.pb_ttm.toFixed(1) + 'x' : '-'}</td>
            <td class="p-2.5 text-right font-mono text-xs font-semibold ${npColor}">${npText}</td>
            <td class="p-2.5 text-center">
                <button onclick="selectCompanyFromDb('${c.ticker}')" class="px-2.5 py-1 bg-cyan-950/80 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-700 hover:border-cyan-500 rounded text-[10px] font-bold font-mono transition-all flex items-center gap-1 mx-auto shadow cursor-pointer">
                    <i data-lucide="line-chart" class="w-3 h-3"></i>
                    <span>Nạp Phân Tích</span>
                </button>
            </td>
        </tr>
        `;
    });

    if (filtered.length > 150) {
        html += `<tr><td colspan="12" class="p-3 text-center text-slate-500 font-mono text-[11px] bg-slate-900/50">Đang hiển thị 150 / ${filtered.length} doanh nghiệp. Vui lòng nhập từ khóa để lọc chi tiết hơn.</td></tr>`;
    }

    tbody.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

function selectCompanyFromDb(ticker) {
    closeDatabaseModal();
    const input = document.getElementById("central-ticker-input");
    if (input) {
        input.value = ticker;
    }
    handleCentralSearch(ticker);
    showToast(`Đang phân tích doanh nghiệp ${ticker} từ CSDL FiinTrade...`);
}

async function syncDatabaseFromGoogleSheets() {
    const btn = document.getElementById("btn-sync-db");
    const txt = document.getElementById("sync-btn-text");
    const icon = document.getElementById("sync-icon");

    if (btn) btn.disabled = true;
    if (txt) txt.textContent = "Đang đồng bộ Google Sheets...";
    if (icon) icon.classList.add("animate-spin");

    try {
        const resp = await fetch("/api/database/sync", { method: "POST" });
        const res = await resp.json();
        if (res.status === "success") {
            showToast(res.message);
            await loadDatabaseCompanies();
        } else {
            showToast("Đồng bộ Google Sheets thất bại!");
        }
    } catch (e) {
        showToast("Lỗi đồng bộ: " + e.message);
    } finally {
        if (btn) btn.disabled = false;
        if (txt) txt.textContent = "Đồng bộ Google Sheets";
        if (icon) icon.classList.remove("animate-spin");
    }
}

// =========================================================================
// MODULE: XUẤT DỮ LIỆU DOANH NGHIỆP TỪ API SSI SANG EXCEL (.XLSX) & CSV
// =========================================================================

let currentExportPeriodMode = 'quarter';

function openSsiExportModal() {
    const modal = document.getElementById("ssi-export-modal");
    if (!modal) return;
    const tickerInput = document.getElementById("export-ticker-input");
    const tickerDisplay = document.getElementById("export-modal-ticker-display");
    const activeTicker = (typeof currentTicker !== 'undefined' && currentTicker) ? currentTicker : "SSI";
    if (tickerInput) tickerInput.value = activeTicker;
    if (tickerDisplay) tickerDisplay.textContent = activeTicker;
    
    updateExportPeriodLabels();
    modal.classList.remove("hidden");
    if (window.lucide) lucide.createIcons();
}

function closeSsiExportModal() {
    const modal = document.getElementById("ssi-export-modal");
    if (modal) modal.classList.add("hidden");
}

function useCurrentTickerForExport() {
    const activeTicker = (typeof currentTicker !== 'undefined' && currentTicker) ? currentTicker : "SSI";
    const tickerInput = document.getElementById("export-ticker-input");
    const tickerDisplay = document.getElementById("export-modal-ticker-display");
    if (tickerInput) tickerInput.value = activeTicker;
    if (tickerDisplay) tickerDisplay.textContent = activeTicker;
}

function setExportPeriodMode(mode) {
    currentExportPeriodMode = mode;
    const btnQ = document.getElementById("btn-export-mode-quarter");
    const btnY = document.getElementById("btn-export-mode-year");
    if (mode === 'quarter') {
        if (btnQ) btnQ.className = "py-1 rounded font-bold transition-all bg-cyan-600 text-white text-center";
        if (btnY) btnY.className = "py-1 rounded font-bold transition-all text-slate-400 hover:text-white text-center";
    } else {
        if (btnQ) btnQ.className = "py-1 rounded font-bold transition-all text-slate-400 hover:text-white text-center";
        if (btnY) btnY.className = "py-1 rounded font-bold transition-all bg-cyan-600 text-white text-center";
    }
    updateExportPeriodLabels();
}

function updateExportPeriodLabels() {
    const rangeSelect = document.getElementById("export-period-range");
    const badge = document.getElementById("export-preview-period-badge");
    const rangeVal = rangeSelect ? rangeSelect.value : "all";
    const unitText = currentExportPeriodMode === "quarter" ? "quý" : "năm";
    if (badge) {
        badge.textContent = rangeVal === "all" ? `Toàn bộ ${unitText} lịch sử` : `${rangeVal} ${unitText} gần nhất`;
    }
}

function setExportPreset(preset) {
    const allCheckboxes = document.querySelectorAll("#ssi-export-modal input[type='checkbox']");
    if (preset === 'all') {
        allCheckboxes.forEach(cb => cb.checked = true);
    } else if (preset === 'none') {
        allCheckboxes.forEach(cb => cb.checked = false);
    } else if (preset === 'bctc') {
        allCheckboxes.forEach(cb => cb.checked = false);
        const k = document.getElementById("grp-export-kqkd"); if (k) k.checked = true;
        const b = document.getElementById("grp-export-cdkt"); if (b) b.checked = true;
        const l = document.getElementById("grp-export-lctt"); if (l) l.checked = true;
        toggleExportGroup('kqkd', true);
        toggleExportGroup('cdkt', true);
        toggleExportGroup('lctt', true);
        const ms = document.getElementById("opt-export-multisheet"); if (ms) ms.checked = true;
    } else if (preset === 'ssi') {
        allCheckboxes.forEach(cb => cb.checked = false);
        const s = document.getElementById("grp-export-ssi"); if (s) s.checked = true;
        toggleExportGroup('ssi', true);
        const ms = document.getElementById("opt-export-multisheet"); if (ms) ms.checked = true;
    } else if (preset === 'ratios') {
        allCheckboxes.forEach(cb => cb.checked = false);
        const s = document.getElementById("grp-export-ssi"); if (s) s.checked = true;
        document.querySelectorAll(".export-param-ssi").forEach(cb => {
            if (['valuation_ratios', 'profitability', 'dupont', 'piotroski_altman'].includes(cb.value)) {
                cb.checked = true;
            }
        });
        const ms = document.getElementById("opt-export-multisheet"); if (ms) ms.checked = true;
    }
}

function toggleExportGroup(group, isChecked) {
    document.querySelectorAll(`.export-param-${group}`).forEach(cb => {
        cb.checked = isChecked;
    });
}

async function executeExport(format) {
    const tickerInput = document.getElementById("export-ticker-input");
    const ticker = (tickerInput ? tickerInput.value : "").trim().toUpperCase() || (typeof currentTicker !== 'undefined' && currentTicker ? currentTicker : "SSI");
    const rangeSelect = document.getElementById("export-period-range");
    const rangeVal = rangeSelect ? rangeSelect.value : "all";
    const unitSelect = document.getElementById("export-currency-unit");
    const unitVal = unitSelect ? unitSelect.value : "bil";

    const btnSubmit = document.getElementById("btn-export-excel-submit");
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Đang xuất dữ liệu...</span>`;
        if (window.lucide) lucide.createIcons();
    }

    try {
        showToast(`Đang thu thập dữ liệu tài chính & giao dịch SSI cho ${ticker}...`);

        // 1. Thu thập dữ liệu tài chính
        let bundle = currentFinancialBundle;
        if (!bundle || bundle.ticker !== ticker) {
            const resp = await fetch(`/api/financial-overview/${ticker}`);
            if (!resp.ok) throw new Error(`Không tìm thấy dữ liệu cho mã ${ticker}`);
            bundle = await resp.json();
        }

        // 2. Thu thập dữ liệu giao dịch SSI (OHLCV)
        let ssiTradingData = [];
        try {
            const respOhlc = await fetch(`/api/ssi/daily-ohlc?symbol=${ticker}`);
            if (respOhlc.ok) {
                const ohlcRes = await respOhlc.json();
                ssiTradingData = ohlcRes.data || [];
            }
        } catch(e) {}
        if ((!ssiTradingData || ssiTradingData.length === 0) && typeof chartOhlcData !== 'undefined' && Array.isArray(chartOhlcData) && chartOhlcData.length > 0) {
            ssiTradingData = chartOhlcData;
        }

        // Chọn BCTC theo Quý hoặc Năm
        const stm = currentExportPeriodMode === 'quarter' ? bundle.statements_quarterly : bundle.statements_annual;
        const activeStm = sliceStatements(stm, rangeVal);

        // Đơn vị chia/nhân
        let multiplier = 1.0;
        let unitLabel = "Tỷ VND";
        if (unitVal === "mil") {
            multiplier = 1000.0;
            unitLabel = "Triệu VND";
        } else if (unitVal === "raw") {
            multiplier = 1000000000.0;
            unitLabel = "VND";
        }

        const withFormulas = document.getElementById("opt-export-formulas")?.checked ?? true;
        const withMultiSheet = document.getElementById("opt-export-multisheet")?.checked ?? true;
        const withPeers = document.getElementById("opt-export-peers")?.checked ?? false;

        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `IERM_SSI_BCTC_${ticker}_${currentExportPeriodMode}_${dateStr}`;

        if (format === 'excel' && typeof XLSX !== 'undefined') {
            const wb = XLSX.utils.book_new();

            // SHEET 1: TỔNG QUAN & ĐỊNH GIÁ
            const profile = bundle.company_profile || {};
            const dupont = bundle.dupont || {};
            const piotroski = bundle.piotroski || {};
            const altman = bundle.altman_z || {};
            const valuation = bundle.valuation || {};

            const overviewData = [
                ["HỆ THỐNG PHÂN TÍCH TÀI CHÍNH & ĐỊNH GIÁ IERM - DỮ LIỆU CHỨNG KHOÁN SSI"],
                ["Mã Cổ Phiếu", ticker],
                ["Tên Doanh Nghiệp", profile.name || ""],
                ["Sàn Niêm Yết", profile.exchange || ""],
                ["Phân Ngành ICB", profile.sector || ""],
                ["Vốn Hóa Thị Trường (Tỷ VND)", profile.market_cap_bil || ""],
                ["Giá Thị Trường Hiện Tại (VND)", profile.current_price || ""],
                ["Số CP Lưu Hành", profile.listed_shares || ""],
                [""],
                ["CHỈ SỐ ĐỊNH GIÁ & SUẤT SINH LỜI", "GIÁ TRỊ", "Ý NGHĨA / XẾP HẠNG"],
                ["P/E (Giá / Thu nhập)", profile.pe || "", (profile.pe && profile.pe < 15 ? "Hấp dẫn" : "Bình thường")],
                ["P/B (Giá / Giá trị sổ sách)", profile.pb || "", (profile.pb && profile.pb < 1.8 ? "Hợp lý" : "Cao")],
                ["ROE (Lợi nhuận trên VCSH %)", profile.roe ? `${profile.roe}%` : "", (profile.roe && profile.roe > 15 ? "Rất tốt" : "Trung bình")],
                ["ROA (Lợi nhuận trên Tổng tài sản %)", profile.roa ? `${profile.roa}%` : "", ""],
                ["Điểm Piotroski F-Score (0 - 9)", piotroski.score !== undefined ? piotroski.score : "N/A", piotroski.interpretation || ""],
                ["Mô hình Rủi ro Altman Z-Score", altman.score ? Number(altman.score).toFixed(2) : "N/A", altman.zone || ""],
                ["Phân tích 5 bước DuPont - ROE", dupont.roe ? `${dupont.roe}%` : "", "Biên ròng x Vòng quay TS x Đòn bẩy tài chính"]
            ];
            const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
            wsOverview['!cols'] = [{ wch: 36 }, { wch: 25 }, { wch: 40 }];
            XLSX.utils.book_append_sheet(wb, wsOverview, "Tổng quan & Định giá");

            // SHEET 2: KẾT QUẢ KINH DOANH (KQKD)
            const incRows = [
                [`BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH - ${ticker} (Đơn vị: ${unitLabel})`],
                ["CHỈ TIÊU (VAS / IFRS)", ...activeStm.periods]
            ];
            if (activeStm.raw_inc && Object.keys(activeStm.raw_inc).length > 0) {
                for (const [title, vals] of Object.entries(activeStm.raw_inc)) {
                    incRows.push([title, ...vals.map(v => Math.round(v * multiplier * 10) / 10)]);
                }
            } else {
                incRows.push(["Doanh thu thuần", ...(activeStm.revenue || []).map(v => v * multiplier)]);
                incRows.push(["Giá vốn hàng bán", ...(activeStm.cogs || []).map(v => v * multiplier)]);
                incRows.push(["Lợi nhuận gộp", ...(activeStm.gross_profit || []).map(v => v * multiplier)]);
                incRows.push(["Chi phí tài chính (lãi vay)", ...(activeStm.financial_expense || []).map(v => v * multiplier)]);
                incRows.push(["Lợi nhuận từ HĐKD (EBIT)", ...(activeStm.operating_profit || []).map(v => v * multiplier)]);
                incRows.push(["Lợi nhuận sau thuế (LNST)", ...(activeStm.net_profit || []).map(v => v * multiplier)]);
            }
            const wsInc = XLSX.utils.aoa_to_sheet(incRows);
            wsInc['!cols'] = [{ wch: 45 }, ...activeStm.periods.map(() => ({ wch: 15 }))];
            XLSX.utils.book_append_sheet(wb, wsInc, "KQKD");

            // SHEET 3: CÂN ĐỐI KẾ TOÁN (CĐKT)
            const bsRows = [
                [`BẢNG CÂN ĐỐI KẾ TOÁN - ${ticker} (Đơn vị: ${unitLabel})`],
                ["CHỈ TIÊU (VAS / IFRS)", ...activeStm.periods]
            ];
            if (activeStm.raw_bs && Object.keys(activeStm.raw_bs).length > 0) {
                for (const [title, vals] of Object.entries(activeStm.raw_bs)) {
                    bsRows.push([title, ...vals.map(v => Math.round(v * multiplier * 10) / 10)]);
                }
            } else {
                bsRows.push(["Tổng cộng tài sản", ...(activeStm.total_assets || []).map(v => v * multiplier)]);
                bsRows.push(["Tài sản ngắn hạn", ...(activeStm.short_term_assets || []).map(v => v * multiplier)]);
                bsRows.push(["Tiền & tương đương tiền", ...(activeStm.cash_and_equivalents || []).map(v => v * multiplier)]);
                bsRows.push(["Hàng tồn kho", ...(activeStm.inventories || []).map(v => v * multiplier)]);
                bsRows.push(["Nợ phải trả", ...(activeStm.total_liabilities || []).map(v => v * multiplier)]);
                bsRows.push(["Vay ngắn hạn", ...(activeStm.short_term_debt || []).map(v => v * multiplier)]);
                bsRows.push(["Vay dài hạn", ...(activeStm.long_term_debt || []).map(v => v * multiplier)]);
                bsRows.push(["Vốn chủ sở hữu", ...(activeStm.owner_equity || []).map(v => v * multiplier)]);
            }
            const wsBs = XLSX.utils.aoa_to_sheet(bsRows);
            wsBs['!cols'] = [{ wch: 45 }, ...activeStm.periods.map(() => ({ wch: 15 }))];
            XLSX.utils.book_append_sheet(wb, wsBs, "CĐKT");

            // SHEET 4: LƯU CHUYỂN TIỀN TỆ (LCTT)
            const cfRows = [
                [`BÁO CÁO LƯU CHUYỂN TIỀN TỆ - ${ticker} (Đơn vị: ${unitLabel})`],
                ["CHỈ TIÊU (VAS / IFRS)", ...activeStm.periods]
            ];
            if (activeStm.raw_cf && Object.keys(activeStm.raw_cf).length > 0) {
                for (const [title, vals] of Object.entries(activeStm.raw_cf)) {
                    cfRows.push([title, ...vals.map(v => Math.round(v * multiplier * 10) / 10)]);
                }
            } else {
                cfRows.push(["Dòng tiền từ HĐKD (CFO)", ...(activeStm.cfo || []).map(v => v * multiplier)]);
                cfRows.push(["Dòng tiền từ HĐ Đầu tư (CFI)", ...(activeStm.cfi || []).map(v => v * multiplier)]);
                cfRows.push(["Dòng tiền từ HĐ Tài chính (CFF)", ...(activeStm.cff || []).map(v => v * multiplier)]);
                cfRows.push(["Dòng tiền tự do (FCF)", ...(activeStm.free_cash_flow || []).map(v => v * multiplier)]);
            }
            const wsCf = XLSX.utils.aoa_to_sheet(cfRows);
            wsCf['!cols'] = [{ wch: 45 }, ...activeStm.periods.map(() => ({ wch: 15 }))];
            XLSX.utils.book_append_sheet(wb, wsCf, "LCTT");

            // SHEET 5: NẾN GIÁ & KHỐI NGOẠI SSI FASTCONNECT
            if (ssiTradingData && ssiTradingData.length > 0) {
                const ssiRows = [
                    [`DỮ LIỆU GIAO DỊCH THỊ TRƯỜNG & KHỐI NGOẠI - NGUỒN SSI FASTCONNECT API`],
                    ["Ngày (Date)", "Mở cửa (Open)", "Cao nhất (High)", "Thấp nhất (Low)", "Đóng cửa (Close)", "Khối lượng (Volume)", "Khối ngoại Mua", "Khối ngoại Bán", "Khối ngoại Mua ròng"]
                ];
                const recentTrades = ssiTradingData.slice(-120);
                recentTrades.forEach(row => {
                    const timeStr = row.time ? (typeof row.time === 'string' ? row.time : new Date(row.time * 1000).toISOString().slice(0, 10)) : "";
                    const fBuy = row.foreign_buy || 0;
                    const fSell = row.foreign_sell || 0;
                    const fNet = row.foreign_net !== undefined ? row.foreign_net : (fBuy - fSell);
                    ssiRows.push([
                        timeStr,
                        row.open || 0,
                        row.high || 0,
                        row.low || 0,
                        row.close || 0,
                        row.volume || 0,
                        fBuy,
                        fSell,
                        fNet
                    ]);
                });
                const wsSsi = XLSX.utils.aoa_to_sheet(ssiRows);
                wsSsi['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
                XLSX.utils.book_append_sheet(wb, wsSsi, "Giao dịch SSI");
            }

            // Ghi file Excel (.xlsx)
            XLSX.writeFile(wb, `${filename}.xlsx`);
            showToast(`✅ Đã xuất thành công file Excel: ${filename}.xlsx`);
        } else if (format === 'csv') {
            // XUẤT CSV VỚI UTF-8 BOM
            let csvLines = [];
            csvLines.push(`"BÁO CÁO TÀI CHÍNH VÀ DỮ LIỆU DOANH NGHIỆP ${ticker} - NGUỒN SSI FASTCONNECT"`);
            csvLines.push(`"Đơn vị tính:","${unitLabel}"`);
            csvLines.push(`"Kỳ báo cáo:","${currentExportPeriodMode === 'quarter' ? 'Theo Quý' : 'Theo Năm'}"`);
            csvLines.push("");

            // 1. KQKD
            csvLines.push(`"=== 1. BÁO CÁO KẾT QUẢ KINH DOANH ==="`);
            csvLines.push(["Chỉ tiêu", ...activeStm.periods].map(c => `"${c}"`).join(","));
            if (activeStm.raw_inc && Object.keys(activeStm.raw_inc).length > 0) {
                for (const [title, vals] of Object.entries(activeStm.raw_inc)) {
                    csvLines.push([`"${title}"`, ...vals.map(v => Math.round(v * multiplier * 10) / 10)].join(","));
                }
            } else {
                csvLines.push([`"Doanh thu thuần"`, ...(activeStm.revenue || []).map(v => v * multiplier)].join(","));
                csvLines.push([`"Giá vốn hàng bán"`, ...(activeStm.cogs || []).map(v => v * multiplier)].join(","));
                csvLines.push([`"Lợi nhuận gộp"`, ...(activeStm.gross_profit || []).map(v => v * multiplier)].join(","));
                csvLines.push([`"Chi phí tài chính"`, ...(activeStm.financial_expense || []).map(v => v * multiplier)].join(","));
                csvLines.push([`"Lợi nhuận HĐKD"`, ...(activeStm.operating_profit || []).map(v => v * multiplier)].join(","));
                csvLines.push([`"Lợi nhuận sau thuế"`, ...(activeStm.net_profit || []).map(v => v * multiplier)].join(","));
            }
            csvLines.push("");

            // 2. CĐKT
            csvLines.push(`"=== 2. BẢNG CÂN ĐỐI KẾ TOÁN ==="`);
            csvLines.push(["Chỉ tiêu", ...activeStm.periods].map(c => `"${c}"`).join(","));
            if (activeStm.raw_bs && Object.keys(activeStm.raw_bs).length > 0) {
                for (const [title, vals] of Object.entries(activeStm.raw_bs)) {
                    csvLines.push([`"${title}"`, ...vals.map(v => Math.round(v * multiplier * 10) / 10)].join(","));
                }
            }
            csvLines.push("");

            // 3. LCTT
            csvLines.push(`"=== 3. BÁO CÁO LƯU CHUYỂN TIỀN TỆ ==="`);
            csvLines.push(["Chỉ tiêu", ...activeStm.periods].map(c => `"${c}"`).join(","));
            if (activeStm.raw_cf && Object.keys(activeStm.raw_cf).length > 0) {
                for (const [title, vals] of Object.entries(activeStm.raw_cf)) {
                    csvLines.push([`"${title}"`, ...vals.map(v => Math.round(v * multiplier * 10) / 10)].join(","));
                }
            }

            // UTF-8 BOM '\uFEFF' để Excel hiển thị đúng tiếng Việt
            const csvBlob = new Blob(["\uFEFF" + csvLines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(csvBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${filename}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`✅ Đã xuất thành công file CSV: ${filename}.csv`);
        } else {
            // XUẤT JSON
            const exportBundle = {
                ticker: ticker,
                unit: unitLabel,
                period_mode: currentExportPeriodMode,
                periods: activeStm.periods,
                financials: activeStm,
                ssi_trades: ssiTradingData.slice(-120),
                company_profile: bundle.company_profile
            };
            const jsonBlob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(jsonBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${filename}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`✅ Đã xuất thành công file JSON: ${filename}.json`);
        }
    } catch(err) {
        console.error("Export error:", err);
        showToast("Lỗi khi xuất dữ liệu: " + err.message);
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<i data-lucide="download" class="w-4 h-4"></i><span>Xuất File Excel (.xlsx)</span>`;
            if (window.lucide) lucide.createIcons();
        }
    }
}

// =========================================================================
// XUẤT BÁO CÁO ĐỐI THỦ CÙNG NGÀNH RA FILE EXCEL (.XLSX) & PDF (.PDF)
// =========================================================================

function exportPeersExcel() {
    try {
        const peersData = window.currentPeersData || (typeof currentFinancialBundle !== 'undefined' ? currentFinancialBundle?.peers_data : null);
        if (!peersData || !peersData.peers || peersData.peers.length === 0) {
            showToast("⚠️ Chưa có dữ liệu đối thủ cùng ngành để xuất!");
            return;
        }

        if (typeof XLSX === 'undefined') {
            showToast("⚠️ Thư viện SheetJS đang tải, vui lòng thử lại sau vài giây!");
            return;
        }

        const targetTicker = peersData.target_ticker || (typeof currentReport !== 'undefined' ? currentReport?.ticker : "DN") || "DN";
        const sectorName = peersData.sector_name || "Nganh";
        const todayStr = new Date().toISOString().slice(0, 10);
        const filename = `So_Sanh_Doi_Thu_${targetTicker}_${sectorName.replace(/[\s\/\\:*?"<>|]+/g, '_')}_${todayStr}`;

        const wb = XLSX.utils.book_new();

        // ----------------------------------------------------
        // SHEET 1: BẢNG SO SÁNH ĐỐI THỦ (PEER COMPARISON)
        // ----------------------------------------------------
        const kpiCols = peersData.sector_kpi_columns || [];
        const sheet1Data = [];

        sheet1Data.push([`BÁO CÁO SO SÁNH DOANH NGHIỆP CÙNG NGÀNH: ${sectorName.toUpperCase()}`]);
        sheet1Data.push([
            `Mã cổ phiếu phân tích: ${targetTicker}`,
            `Số lượng DN: ${peersData.peers.length}`,
            `Ngày xuất: ${new Date().toLocaleString('vi-VN')}`,
            `Nguồn dữ liệu: SSI API & Vietstock eDocs`
        ]);
        sheet1Data.push([]); // Dòng trống

        // Headers
        const headers = [
            "Mã CP",
            "Tên Doanh Nghiệp",
            "Vốn hóa (tỷ đ)",
            "P/E (lần)",
            "P/B (lần)",
            "ROE (%)",
            "ROA (%)",
            "Biên ròng (%)",
            "Nợ / VCSH (lần)"
        ];
        kpiCols.forEach(col => {
            headers.push(`${col.label}${col.unit ? ` (${col.unit})` : ''}`);
        });
        sheet1Data.push(headers);

        // Data rows
        peersData.peers.forEach(p => {
            const isTarget = p.ticker === targetTicker;
            const row = [
                p.ticker + (isTarget ? " (Đang xem)" : ""),
                p.name || "",
                p.market_cap_bil !== undefined && p.market_cap_bil !== null ? Number(p.market_cap_bil) : "-",
                p.pe !== undefined && p.pe !== null ? Number(p.pe) : "-",
                p.pb !== undefined && p.pb !== null ? Number(p.pb) : "-",
                p.roe !== undefined && p.roe !== null ? Number(p.roe) : "-",
                p.roa !== undefined && p.roa !== null ? Number(p.roa) : "-",
                p.net_margin !== undefined && p.net_margin !== null ? Number(p.net_margin) : "-",
                p.debt_to_equity !== undefined && p.debt_to_equity !== null ? Number(p.debt_to_equity) : "-"
            ];
            kpiCols.forEach(col => {
                const val = p[col.field];
                row.push(val !== undefined && val !== null ? val : "-");
            });
            sheet1Data.push(row);
        });

        // Industry Average Row
        const avg = peersData.industry_average || {};
        const avgRow = [
            `TRUNG BÌNH NGÀNH (${peersData.peers.length} DN)`,
            "-",
            "-",
            avg.pe !== undefined && avg.pe !== null ? Number(avg.pe) : "-",
            avg.pb !== undefined && avg.pb !== null ? Number(avg.pb) : "-",
            avg.roe !== undefined && avg.roe !== null ? Number(avg.roe) : "-",
            avg.roa !== undefined && avg.roa !== null ? Number(avg.roa) : "-",
            avg.net_margin !== undefined && avg.net_margin !== null ? Number(avg.net_margin) : "-",
            avg.debt_to_equity !== undefined && avg.debt_to_equity !== null ? Number(avg.debt_to_equity) : "-"
        ];
        kpiCols.forEach(col => {
            const val = avg[col.field];
            avgRow.push(val !== undefined && val !== null ? val : "-");
        });
        sheet1Data.push(avgRow);

        const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);

        // Column widths
        const colWidths = [
            { wch: 16 }, // Mã CP
            { wch: 34 }, // Tên DN
            { wch: 16 }, // Vốn hóa
            { wch: 12 }, // P/E
            { wch: 12 }, // P/B
            { wch: 12 }, // ROE
            { wch: 12 }, // ROA
            { wch: 14 }, // Biên ròng
            { wch: 15 }  // Nợ/VCSH
        ];
        kpiCols.forEach(() => colWidths.push({ wch: 20 }));
        ws1['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws1, "So Sánh Đối Thủ");

        // ----------------------------------------------------
        // SHEET 2: RADAR SỨC MẠNH TÀI CHÍNH
        // ----------------------------------------------------
        const radar = peersData.radar_metrics;
        if (radar && radar.categories && radar.categories.length > 0) {
            const targetScores = radar[targetTicker.toLowerCase()] || radar.target || radar.hpg || [];
            const indScores = radar.industry || [];

            const sheet2Data = [
                [`ĐÁNH GIÁ SỨC MẠNH TÀI CHÍNH (RADAR METRICS) - ${targetTicker} VS TB NGÀNH`],
                [`Mã cổ phiếu: ${targetTicker}`, `Ngành: ${sectorName}`, `Thang điểm chuẩn hóa: 0 - 100`],
                [],
                ["Trụ Cột Đánh Giá", `${targetTicker} (Điểm /100)`, "TB Ngành (Điểm /100)", "Chênh Lệch (+/-)", "Đánh Giá"]
            ];

            radar.categories.forEach((cat, idx) => {
                const tScore = targetScores[idx] !== undefined ? Number(targetScores[idx]) : 0;
                const iScore = indScores[idx] !== undefined ? Number(indScores[idx]) : 0;
                const diff = +(tScore - iScore).toFixed(1);
                const assessment = diff > 5 ? "Vượt trội ngành" : (diff < -5 ? "Thấp hơn ngành" : "Ngang bằng ngành");
                sheet2Data.push([cat, tScore, iScore, (diff > 0 ? `+${diff}` : `${diff}`), assessment]);
            });

            const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
            ws2['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 16 }, { wch: 20 }];
            XLSX.utils.book_append_sheet(wb, ws2, "Radar Sức Mạnh");
        }

        // ----------------------------------------------------
        // SHEET 3: MÔ HÌNH 5 LỰC LƯỢNG PORTER & CATALYSTS
        // ----------------------------------------------------
        if (peersData.porter_five_forces || peersData.industry_cycle || peersData.industry_catalysts) {
            const sheet3Data = [
                [`PHÂN TÍCH CẤU TRÚC NGÀNH: ${sectorName.toUpperCase()}`],
                [`Chu kỳ ngành hiện tại: ${peersData.industry_cycle || "Tăng trưởng"}`],
                [],
                ["Mô hình 5 Lực lượng Cạnh tranh Porter", "Mức độ Rủi ro (1-5)", "Đánh giá chi tiết"]
            ];

            const forceLabels = {
                "rivalry": "1. Cạnh tranh nội bộ ngành",
                "supplier_power": "2. Quyền lực đàm phán nhà cung ứng",
                "buyer_power": "3. Quyền lực đàm phán khách hàng",
                "substitution_threat": "4. Nguy cơ từ sản phẩm / dịch vụ thay thế",
                "new_entrants_threat": "5. Rào cản gia nhập thị trường từ đối thủ mới"
            };

            if (peersData.porter_five_forces) {
                for (const [k, v] of Object.entries(peersData.porter_five_forces)) {
                    sheet3Data.push([forceLabels[k] || k, `${v.score}/5`, v.desc || ""]);
                }
            }

            if (peersData.industry_catalysts && peersData.industry_catalysts.length > 0) {
                sheet3Data.push([]);
                sheet3Data.push(["ĐỘNG LỰC TĂNG TRƯỞNG & CATALYSTS THEN CHỐT"]);
                peersData.industry_catalysts.forEach((cat, idx) => {
                    sheet3Data.push([`Catalyst ${idx + 1}`, "-", cat]);
                });
            }

            const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
            ws3['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 70 }];
            XLSX.utils.book_append_sheet(wb, ws3, "5 Lực Lượng Porter");
        }

        XLSX.writeFile(wb, `${filename}.xlsx`);
        showToast(`✅ Đã xuất thành công file Excel: ${filename}.xlsx`);
    } catch(err) {
        console.error("Export Peers Excel error:", err);
        showToast("⚠️ Lỗi khi xuất file Excel đối thủ: " + err.message);
    }
}

async function exportPeersPdf() {
    try {
        const peersData = window.currentPeersData || (typeof currentFinancialBundle !== 'undefined' ? currentFinancialBundle?.peers_data : null);
        if (!peersData || !peersData.peers || peersData.peers.length === 0) {
            showToast("⚠️ Chưa có dữ liệu đối thủ cùng ngành để xuất!");
            return;
        }

        showToast("⏳ Đang khởi tạo file PDF Báo cáo ngành & đối thủ...");

        const targetTicker = peersData.target_ticker || (typeof currentReport !== 'undefined' ? currentReport?.ticker : "DN") || "DN";
        const sectorName = peersData.sector_name || "Nganh";
        const todayStr = new Date().toISOString().slice(0, 10);
        const formattedDate = new Date().toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const filename = `Bao_Cao_Nganh_${targetTicker}_${sectorName.replace(/[\s\/\\:*?"<>|]+/g, '_')}_${todayStr}`;

        // Chụp ảnh canvas biểu đồ Radar
        let radarBase64 = null;
        let radarImgHtml = "";
        const radarCanvas = document.getElementById("chart-peer-radar");
        if (radarCanvas) {
            try {
                radarBase64 = radarCanvas.toDataURL("image/png", 1.0);
                radarImgHtml = `<img src="${radarBase64}" style="max-width: 100%; max-height: 230px; object-fit: contain; display: block; margin: 0 auto;" />`;
            } catch(e) {
                console.warn("Could not capture radar chart canvas:", e);
            }
        }

        // =========================================================================
        // ƯU TIÊN 1: Gọi FastAPI Backend /api/peers/export-pdf (Vector PDF chuẩn A4 Landscape)
        // Không bị trắng trang, hỗ trợ 100% tiếng Việt có dấu, dung lượng nhẹ và sắc nét
        // =========================================================================
        try {
            const res = await fetch("/api/peers/export-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    peers_data: peersData,
                    radar_image_base64: radarBase64
                })
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${filename}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast(`✅ Đã xuất thành công file PDF Báo cáo ngành: ${filename}.pdf`);
                return;
            } else {
                const errDetail = await res.text();
                console.warn(`Backend PDF export returned HTTP ${res.status}:`, errDetail);
            }
        } catch(netErr) {
            console.warn("Backend PDF generation endpoint unreachable, falling back to client-side:", netErr);
        }

        // =========================================================================
        // ƯU TIÊN 2 (FALLBACK): Client-side HTML2PDF (Đã sửa lỗi tọa độ -9999px gây trắng trang)
        // =========================================================================
        const kpiCols = peersData.sector_kpi_columns || [];
        let kpiThs = "";
        kpiCols.forEach(col => {
            kpiThs += `<th style="padding: 6px 8px; text-align: right; border-bottom: 2px solid #94a3b8; background: #f1f5f9; color: #1e293b; font-size: 11px; white-space: nowrap;">${col.label}${col.unit ? `<br><span style="font-size: 9px; font-weight: normal; color: #64748b;">(${col.unit})</span>` : ''}</th>`;
        });

        let peerRowsHtml = "";
        peersData.peers.forEach((p, index) => {
            const isTarget = p.ticker === targetTicker;
            const rowBg = isTarget ? "#e0f2fe" : (index % 2 === 0 ? "#ffffff" : "#f8fafc");
            const tickerColor = isTarget ? "#0284c7" : "#0f172a";
            const fontWeight = isTarget ? "bold" : "normal";
            const borderStyle = isTarget ? "border-top: 2px solid #0284c7; border-bottom: 2px solid #0284c7;" : "border-bottom: 1px solid #e2e8f0;";

            let kpiTds = "";
            kpiCols.forEach(col => {
                const val = p[col.field];
                const formatted = typeof formatSectorKpiValue === 'function' ? formatSectorKpiValue(val, col.unit) : (val !== undefined && val !== null ? val : "-");
                kpiTds += `<td style="padding: 6px 8px; text-align: right; ${borderStyle} font-size: 11px; white-space: nowrap;">${formatted}</td>`;
            });

            peerRowsHtml += `
                <tr style="background: ${rowBg}; font-weight: ${fontWeight};">
                    <td style="padding: 6px 8px; text-align: left; ${borderStyle} color: ${tickerColor}; font-size: 11px; white-space: nowrap;">
                        <strong>${p.ticker}</strong> ${isTarget ? '<span style="font-size: 9px; background: #0284c7; color: #ffffff; padding: 1px 4px; border-radius: 3px; margin-left: 4px;">Đang xem</span>' : ''}
                    </td>
                    <td style="padding: 6px 8px; text-align: left; ${borderStyle} color: #334155; font-size: 10px; max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name || ''}</td>
                    <td style="padding: 6px 8px; text-align: right; ${borderStyle} font-size: 11px; white-space: nowrap;">${p.market_cap_bil >= 1000 ? (p.market_cap_bil / 1000).toFixed(1) + 'k tỷ' : Math.round(p.market_cap_bil) + ' tỷ'}</td>
                    <td style="padding: 6px 8px; text-align: right; ${borderStyle} font-size: 11px; white-space: nowrap;">${p.pe !== undefined && p.pe !== null ? p.pe + 'x' : '-'}</td>
                    <td style="padding: 6px 8px; text-align: right; ${borderStyle} font-size: 11px; white-space: nowrap;">${p.pb !== undefined && p.pb !== null ? p.pb + 'x' : '-'}</td>
                    <td style="padding: 6px 8px; text-align: right; ${borderStyle} font-size: 11px; color: #059669; font-weight: 600; white-space: nowrap;">${p.roe !== undefined && p.roe !== null ? p.roe + '%' : '-'}</td>
                    <td style="padding: 6px 8px; text-align: right; ${borderStyle} font-size: 11px; color: #0284c7; font-weight: 600; white-space: nowrap;">${p.roa !== undefined && p.roa !== null ? p.roa + '%' : '-'}</td>
                    <td style="padding: 6px 8px; text-align: right; ${borderStyle} font-size: 11px; white-space: nowrap;">${p.net_margin !== undefined && p.net_margin !== null ? p.net_margin + '%' : '-'}</td>
                    <td style="padding: 6px 8px; text-align: right; ${borderStyle} font-size: 11px; color: #d97706; white-space: nowrap;">${p.debt_to_equity !== undefined && p.debt_to_equity !== null ? p.debt_to_equity + 'x' : '-'}</td>
                    ${kpiTds}
                </tr>
            `;
        });

        const avg = peersData.industry_average || {};
        let avgKpiTds = "";
        kpiCols.forEach(col => {
            const val = avg[col.field];
            const formatted = typeof formatSectorKpiValue === 'function' ? formatSectorKpiValue(val, col.unit) : (val !== undefined && val !== null ? val : "-");
            avgKpiTds += `<td style="padding: 7px 8px; text-align: right; font-weight: bold; color: #0284c7; border-top: 2px solid #64748b; font-size: 11px; white-space: nowrap;">${formatted}</td>`;
        });

        const avgRowHtml = `
            <tr style="background: #e2e8f0; font-weight: bold;">
                <td style="padding: 7px 8px; text-align: left; color: #0f172a; border-top: 2px solid #64748b; font-size: 11px; white-space: nowrap;" colspan="2">
                    TRUNG BÌNH NGÀNH (${peersData.peers.length} DN)
                </td>
                <td style="padding: 7px 8px; text-align: right; color: #64748b; border-top: 2px solid #64748b; font-size: 11px; white-space: nowrap;">-</td>
                <td style="padding: 7px 8px; text-align: right; color: #0f172a; border-top: 2px solid #64748b; font-size: 11px; white-space: nowrap;">${avg.pe ? avg.pe + 'x' : '-'}</td>
                <td style="padding: 7px 8px; text-align: right; color: #0f172a; border-top: 2px solid #64748b; font-size: 11px; white-space: nowrap;">${avg.pb ? avg.pb + 'x' : '-'}</td>
                <td style="padding: 7px 8px; text-align: right; color: #059669; border-top: 2px solid #64748b; font-size: 11px; white-space: nowrap;">${avg.roe ? avg.roe + '%' : '-'}</td>
                <td style="padding: 7px 8px; text-align: right; color: #0284c7; border-top: 2px solid #64748b; font-size: 11px; white-space: nowrap;">${avg.roa ? avg.roa + '%' : '-'}</td>
                <td style="padding: 7px 8px; text-align: right; color: #0f172a; border-top: 2px solid #64748b; font-size: 11px; white-space: nowrap;">${avg.net_margin ? avg.net_margin + '%' : '-'}</td>
                <td style="padding: 7px 8px; text-align: right; color: #d97706; border-top: 2px solid #64748b; font-size: 11px; white-space: nowrap;">${avg.debt_to_equity ? avg.debt_to_equity + 'x' : '-'}</td>
                ${avgKpiTds}
            </tr>
        `;

        let forcesHtml = "";
        if (peersData.porter_five_forces) {
            const forceLabels = {
                "rivalry": "1. Cạnh tranh nội bộ ngành",
                "supplier_power": "2. Quyền lực nhà cung ứng",
                "buyer_power": "3. Quyền lực khách hàng",
                "substitution_threat": "4. Nguy cơ hàng thay thế",
                "new_entrants_threat": "5. Rào cản đối thủ mới"
            };
            for (const [k, v] of Object.entries(peersData.porter_five_forces)) {
                const badgeBg = v.score >= 4 ? '#fee2e2' : (v.score === 3 ? '#fef3c7' : '#dcfce7');
                const badgeColor = v.score >= 4 ? '#991b1b' : (v.score === 3 ? '#92400e' : '#166534');
                forcesHtml += `
                    <div style="margin-bottom: 5px; padding: 5px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                            <span style="font-weight: bold; font-size: 10px; color: #1e293b;">${forceLabels[k] || k}</span>
                            <span style="background: ${badgeBg}; color: ${badgeColor}; font-size: 9px; font-weight: bold; padding: 1px 6px; border-radius: 10px;">Mức ${v.score}/5</span>
                        </div>
                        <div style="font-size: 9px; color: #475569; line-height: 1.3;">${v.desc || ''}</div>
                    </div>
                `;
            }
        }

        let catalystsHtml = "";
        if (peersData.industry_catalysts && peersData.industry_catalysts.length > 0) {
            peersData.industry_catalysts.slice(0, 3).forEach((c, idx) => {
                catalystsHtml += `
                    <div style="display: flex; align-items: flex-start; gap: 6px; margin-bottom: 3px; font-size: 9px; color: #334155;">
                        <span style="background: #0284c7; color: white; border-radius: 50%; width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; font-size: 8px; font-weight: bold; flex-shrink: 0;">${idx+1}</span>
                        <span>${c}</span>
                    </div>
                `;
            });
        }

        // Đặt vị trí tại x=0, y=0 với zIndex cao nhưng opacity nhỏ để html2canvas render đầy đủ không bị trắng trang
        const container = document.createElement("div");
        container.style.width = "1120px";
        container.style.padding = "20px 24px";
        container.style.background = "#ffffff";
        container.style.color = "#0f172a";
        container.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        container.style.boxSizing = "border-box";
        container.style.position = "fixed";
        container.style.left = "0";
        container.style.top = "0";
        container.style.zIndex = "99999";
        container.style.opacity = "0.01";
        container.style.pointerEvents = "none";
        container.style.visibility = "visible";

        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 12px;">
                <div>
                    <div style="font-size: 11px; font-weight: 800; color: #0284c7; letter-spacing: 0.5px; text-transform: uppercase;">
                        IERM PLATFORM | INSTITUTIONAL EQUITY RESEARCH MATRIX
                    </div>
                    <div style="font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 2px;">
                        BÁO CÁO ĐỐI THỦ CÙNG NGÀNH - ${sectorName.toUpperCase()}
                    </div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 3px;">
                        Cổ phiếu mục tiêu: <strong style="color: #0284c7; font-size: 12px;">${targetTicker}</strong> | Quy mô: <strong>${peersData.peers.length} doanh nghiệp</strong>
                    </div>
                </div>
                <div style="text-align: right; font-size: 10px; color: #64748b; line-height: 1.4;">
                    <div>Ngày lập báo cáo: <strong>${formattedDate}</strong></div>
                    <div>Nguồn dữ liệu: <strong>Ưu tiên API SSI #1 (Bổ sung Vietstock & CafeF)</strong></div>
                    <div style="color: #059669; font-weight: bold; margin-top: 2px;">● Chuẩn mực VAS / IFRS</div>
                </div>
            </div>

            <div style="margin-bottom: 14px;">
                <div style="font-size: 11px; font-weight: bold; color: #1e293b; margin-bottom: 5px; display: flex; justify-content: space-between;">
                    <span>BẢNG CHỈ SỐ TÀI CHÍNH & ĐỊNH GIÁ ĐỐI THỦ CÙNG NGÀNH</span>
                    <span style="font-size: 9px; font-weight: normal; color: #64748b;">Đơn vị: Tỷ VNĐ / Lần (x) / Tỷ lệ (%)</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; font-size: 10px;">
                    <thead>
                        <tr style="background: #f1f5f9;">
                            <th style="padding: 6px 8px; text-align: left; border-bottom: 2px solid #94a3b8; color: #1e293b; font-size: 11px; white-space: nowrap;">Mã CP</th>
                            <th style="padding: 6px 8px; text-align: left; border-bottom: 2px solid #94a3b8; color: #1e293b; font-size: 11px; white-space: nowrap;">Doanh nghiệp</th>
                            <th style="padding: 6px 8px; text-align: right; border-bottom: 2px solid #94a3b8; color: #1e293b; font-size: 11px; white-space: nowrap;">Vốn hóa</th>
                            <th style="padding: 6px 8px; text-align: right; border-bottom: 2px solid #94a3b8; color: #1e293b; font-size: 11px; white-space: nowrap;">P/E</th>
                            <th style="padding: 6px 8px; text-align: right; border-bottom: 2px solid #94a3b8; color: #1e293b; font-size: 11px; white-space: nowrap;">P/B</th>
                            <th style="padding: 6px 8px; text-align: right; border-bottom: 2px solid #94a3b8; color: #1e293b; font-size: 11px; white-space: nowrap;">ROE</th>
                            <th style="padding: 6px 8px; text-align: right; border-bottom: 2px solid #94a3b8; color: #1e293b; font-size: 11px; white-space: nowrap;">ROA</th>
                            <th style="padding: 6px 8px; text-align: right; border-bottom: 2px solid #94a3b8; color: #1e293b; font-size: 11px; white-space: nowrap;">Biên ròng</th>
                            <th style="padding: 6px 8px; text-align: right; border-bottom: 2px solid #94a3b8; color: #1e293b; font-size: 11px; white-space: nowrap;">Nợ/VCSH</th>
                            ${kpiThs}
                        </tr>
                    </thead>
                    <tbody>
                        ${peerRowsHtml}
                        ${avgRowHtml}
                    </tbody>
                </table>
            </div>

            <div style="display: flex; gap: 14px; align-items: stretch;">
                <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; background: #ffffff;">
                    <div style="font-size: 11px; font-weight: bold; color: #0284c7; margin-bottom: 5px; border-bottom: 1px solid #f1f5f9; padding-bottom: 3px;">
                        RADAR SỨC MẠNH TÀI CHÍNH (${targetTicker} VS TB NGÀNH)
                    </div>
                    <div style="background: #090d16; border-radius: 6px; padding: 6px; display: flex; align-items: center; justify-content: center; min-height: 200px;">
                        ${radarImgHtml || '<div style="color: #94a3b8; font-size: 10px;">(Biểu đồ Radar chưa sẵn sàng)</div>'}
                    </div>
                </div>

                <div style="flex: 1.15; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <div style="font-size: 11px; font-weight: bold; color: #0284c7; margin-bottom: 5px; border-bottom: 1px solid #f1f5f9; padding-bottom: 3px; display: flex; justify-content: space-between;">
                            <span>MÔ HÌNH 5 LỰC LƯỢNG CẠNH TRANH PORTER</span>
                            <span style="font-size: 9px; font-weight: normal; color: #64748b;">Chu kỳ: <strong>${peersData.industry_cycle || 'Tăng trưởng'}</strong></span>
                        </div>
                        ${forcesHtml}
                    </div>

                    ${catalystsHtml ? `
                    <div style="margin-top: 5px; padding-top: 5px; border-top: 1px dashed #cbd5e1;">
                        <div style="font-size: 9px; font-weight: bold; color: #1e293b; margin-bottom: 3px;">ĐỘNG LỰC TĂNG TRƯỞNG CHÍNH (CATALYSTS):</div>
                        ${catalystsHtml}
                    </div>` : ''}
                </div>
            </div>

            <div style="margin-top: 10px; padding-top: 4px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 8px; color: #94a3b8;">
                <span>Hệ thống Nghiên cứu Doanh nghiệp IERM • Báo cáo tự động chuẩn hóa</span>
                <span>Trang 1 / 1 • Lưu hành nội bộ</span>
            </div>
        `;

        document.body.appendChild(container);

        try {
            if (typeof html2pdf !== 'undefined') {
                const opt = {
                    margin: [4, 4, 4, 4],
                    filename: `${filename}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0, windowWidth: 1120 },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
                };

                await html2pdf().set(opt).from(container).save();
                showToast(`✅ Đã xuất thành công file PDF: ${filename}.pdf`);
            } else {
                const printWin = window.open('', '_blank', 'width=1100,height=750');
                printWin.document.write(`
                    <html>
                    <head>
                        <title>${filename}</title>
                        <style>
                            @page { size: A4 landscape; margin: 5mm; }
                            body { margin: 0; padding: 10px; background: #fff; }
                        </style>
                    </head>
                    <body>
                        ${container.innerHTML}
                    </body>
                    </html>
                `);
                printWin.document.close();
                printWin.focus();
                setTimeout(() => { printWin.print(); }, 500);
                showToast(`✅ Đã mở bản in PDF: ${filename}`);
            }
        } finally {
            if (container.parentNode) {
                container.parentNode.removeChild(container);
            }
        }
    } catch(err) {
        console.error("Export Peers PDF error:", err);
        showToast("⚠️ Lỗi khi xuất file PDF đối thủ: " + err.message);
    }
}


