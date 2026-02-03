document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const poemList = document.getElementById('poem-list');
    const poemDisplay = document.getElementById('poem-display');
    const sections = {
        'poems': document.getElementById('view-poems'),
        'stats': document.getElementById('view-stats'),
        'about': document.getElementById('view-about')
    };
    const tabs = document.querySelectorAll('.tab-btn');
    
    // Controls
    // const rhymeBasisSelect = document.getElementById('rhyme-basis'); // Removed from DOM
    const searchInput = document.getElementById('search-input');
    const typeFilter = document.getElementById('type-filter');

    // State
    let poemsData = [];
    let filteredPoems = [];
    let currentPoemId = null;
    let currentRhymeBasis = 'lzt'; // Default to Middle Chinese
    let currentDisplayLang = 'lzt'; // Default display language

    // --- Initialization ---

    fetch('data/poems_augmented.json?' + new Date().getTime())
        .then(response => response.json())
        .then(data => {
            poemsData = data;
            filteredPoems = data; 
            populateTypeFilter();
            renderPoemList();
            renderStats(); // Pre-calc stats
            
            // Check URL Params
            const urlParams = new URLSearchParams(window.location.search);
            const urlId = parseInt(urlParams.get('id') || urlParams.get('poem')); // Support ?poem=1
            const urlLang = urlParams.get('lang');

            if (urlLang && ['lzt', 'yue', 'cmn'].includes(urlLang)) {
                currentDisplayLang = urlLang;
            } else if (!urlLang) {
                // Default landing lang
                currentDisplayLang = 'yue';
            }

            if (urlId) {
                 const poemExists = poemsData.find(p => p.id === urlId);
                 if (poemExists) {
                     currentPoemId = urlId;
                 }
            } else if (filteredPoems.length > 0) {
                 // Default landing poem
                 currentPoemId = 81;
            }
            
            if (currentPoemId) {
                 // Scroll to button?
                 setTimeout(() => {
                    const btn = document.querySelector(`.poem-btn[data-id="${currentPoemId}"]`);
                    if (btn) btn.scrollIntoView({ block: 'center' });
                 }, 100);
                 
                renderPoemDetail(currentPoemId);
            }
        })
        .catch(err => console.error('Error loading poems:', err));

    // --- Event Listeners ---

    // Tabs
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update Tab UI
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show Section
            const target = tab.dataset.tab;
            Object.values(sections).forEach(el => el.style.display = 'none');
            Object.values(sections).forEach(el => el.classList.remove('active'));
            
            if (sections[target]) {
                sections[target].style.display = 'flex'; // or whatever display matched CSS
                sections[target].classList.add('active');
            }
        });
    });

    // Poem Controls
    /* rhymeBasisSelect removed
    rhymeBasisSelect.addEventListener('change', (e) => {
        currentRhymeBasis = e.target.value;
        // Don't re-render list, just detail if open
        if (currentPoemId) {
            renderPoemDetail(currentPoemId); 
        }
    }); */

    if (searchInput) searchInput.addEventListener('input', filterPoems);
    if (typeFilter) typeFilter.addEventListener('change', filterPoems);

    // --- Core Logic ---

    function populateTypeFilter() {
        const types = new Set(poemsData.map(p => p.type).filter(Boolean));
        types.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            typeFilter.appendChild(option);
        });
    }

    function filterPoems() {
        const term = searchInput.value.toLowerCase();
        const type = typeFilter.value;
        
        filteredPoems = poemsData.filter(poem => {
            // Reconstruct text from data to ensure search works
            const contentText = poem.content.map(line => 
                line.data.filter(d => !d[7]).map(d => d[0]).join('')
            ).join('');
            
            const matchesTerm = (
                poem.title.toLowerCase().includes(term) ||
                poem.author.toLowerCase().includes(term) ||
                contentText.includes(term)
            );
            const matchesType = type ? poem.type === type : true;
            return matchesTerm && matchesType;
        });
        
        renderPoemList();
    }

    function getRhymeTarget(poem, lang) {
        if (!poem.content || poem.content.length === 0) return null;
        
        // Strategy: Look at last line, find last non-note char.
        for (let i = poem.content.length - 1; i >= 0; i--) {
            const line = poem.content[i];
            const data = line.data || [];
            for (let j = data.length - 1; j >= 0; j--) {
                const row = data[j];
                if (!row[7]) { // Not a note
                    let rIndex = 4; // cmn
                    if (lang === 'yue') rIndex = 5;
                    if (lang === 'lzt') rIndex = 6;
                    
                    if (row[rIndex]) return row[rIndex];
                }
            }
        }
        return null;
    }

    function isRhymedelimiter(char) {
        return ['，', '。', '？', '！', '；', ',', '.', '?', '!', ';'].includes(char);
    }
    
    function calculateRhymeStats(poem, lang) {
        const type = poem.type || '';
        let requiredLines = [];
        
        if (type.includes('絕句')) { 
            requiredLines = [1, 3]; // lines 2, 4
        } else if (type.includes('律詩')) { 
            requiredLines = [1, 3, 5, 7]; // lines 2, 4, 6, 8
        } else {
            // For non-standard poems, we can default to checking evens or just return null?
            // User requested "count all lines", so maybe we calculate anyway?
            // But strict adherence check (green/red) only makes sense for Regulated types.
            // Let's return stats but with passed=true (or ignore pass/fail).
            // But to keep it simple, we return null for non-standard formats usually.
            // However, sticking to existing logic:
            return null; 
        }

        const targetRhyme = getRhymeTarget(poem, lang);
        
        // Count total valid slots (lines + syllables before internal delimiters)
        let totalSlots = 0;
        poem.content.forEach(line => {
             // For every delimiter we find, we usually assume there's a phrase before it.
             // If a line is "ABC, DEF." -> 2 slots.
             // Counting all delimiters in the line.
             line.data.forEach(row => {
                 if (!row[7] && isRhymedelimiter(row[0])) {
                     totalSlots++;
                 }
             });
        });
        
        // If no delimiters found (weird data?), fallback to line count
        if (totalSlots === 0) totalSlots = poem.content.length;

        if (!targetRhyme) return { matched: 0, total: totalSlots, passed: false, adherence: 0 };

        // 1. Calculate Adherence (Green/Red O/X) - strictly based on required lines
        let strictValidLines = 0;
        requiredLines.forEach(lineIdx => {
            if (lineIdx < poem.content.length) {
                const line = poem.content[lineIdx];
                const indices = getRhymeIndicesForLine(line.data, targetRhyme, lang);
                // Check if *required* line has rhyme (at end or comma)
                if (indices.size > 0) strictValidLines++;
            }
        });
        const adherencePct = strictValidLines / requiredLines.length;

        // 2. Calculate Display Stats (Matched / Total)
        // User want to "count all the lines" (or all matches in all lines).
        // Let's count Total Rhyming Syllables in the WHOLE poem.
        // And Denominator = Total Lines in Poem.
        let totalMatchesInPoem = 0;
        poem.content.forEach(line => {
            const indices = getRhymeIndicesForLine(line.data, targetRhyme, lang);
            totalMatchesInPoem += indices.size;
        });
        
        // Requirement: "1 rhyme means no rhyme, turn it into 0"
        if (totalMatchesInPoem <= 1) {
            totalMatchesInPoem = 0;
        }
        
        // Color Logic: "If the ratio is 4/8, that's 50%, should be green. If it's 0/8, that's 0% and should be red."
        // We use the visible ratio for coloring.
        const visibleRatio = totalSlots > 0 ? (totalMatchesInPoem / totalSlots) : 0;

        return {
            matched: totalMatchesInPoem, // Count of all rhyming characters in poem
            total: totalSlots,  // Total slots (delimiters)
            passed: visibleRatio >= 0.5, 
            adherence: visibleRatio // Store this for report too
        };
    }

    // Helper to identify rhyme indices for a specific language
    function getRhymeIndicesForLine(lineData, rhymeTarget, lang) {
        const indices = new Set();
        if (!rhymeTarget) return indices;

        let rIndex = 4;
        if (lang === 'yue') rIndex = 5;
        if (lang === 'lzt') rIndex = 6;

        // Check before delimiters
        for (let i = 0; i < lineData.length; i++) {
            const char = lineData[i][0];
            if (isRhymedelimiter(char)) {
                let k = i - 1;
                while (k >= 0 && lineData[k][7]) k--; // Skip notes
                if (k >= 0 && lineData[k][rIndex] === rhymeTarget) {
                    indices.add(k);
                }
            }
        }
        // Check end of line
        let lastK = lineData.length - 1;
        while (lastK >= 0 && (lineData[lastK][7] || isRhymedelimiter(lineData[lastK][0]))) lastK--;
        if (lastK >= 0 && lineData[lastK][rIndex] === rhymeTarget) {
            indices.add(lastK);
        }
        return indices;
    }

    // --- Rendering ---

    function renderPoemList() {
        poemList.innerHTML = '';
        if (filteredPoems.length === 0) {
            poemList.innerHTML = '<div style="padding:1rem;color:#999;">沒有找到詩歌。</div>';
            return;
        }

        filteredPoems.forEach(poem => {
            const btn = document.createElement('div');
            btn.className = `poem-btn ${currentPoemId === poem.id ? 'active' : ''}`;
            btn.dataset.id = poem.id;

            // Compute Stats Text for Sidebar
            let statsHtml = '';
            
            // Generate layout: "中古 1/4 x  粵 2/4 o  普 1/4 x"
            // We use simple flex row of items
            
            const langs = [
                { id: 'lzt', label: '中古' },
                { id: 'yue', label: '粵' },
                { id: 'cmn', label: '普' }
            ];
            
            statsHtml = '<div class="sidebar-stats-row">';
            langs.forEach(l => {
                const stats = calculateRhymeStats(poem, l.id);
                if (stats) {
                    // Update: Remove cross symbol
                    // Update: Green border if passed (>= 50% adherence), Red border if failed
                    const borderClass = stats.passed ? 'stat-pass' : 'stat-fail';
                    statsHtml += `<div class="stat-pill ${borderClass}"><span class="stat-label">${l.label}</span> ${stats.matched}/${stats.total}</div>`;
                } else {
                    statsHtml += `<div class="stat-pill"><span class="stat-label">${l.label}</span> -</div>`;
                }
            });
            statsHtml += '</div>';

            btn.innerHTML = `
                <div class="poem-btn-info">
                    <div class="mini-title">#${poem.id} ${poem.title}</div>
                    <div style="font-size:0.8rem;color:#666">${poem.author}</div>
                </div>
                ${statsHtml}
            `;
            
            btn.addEventListener('click', () => {
                document.querySelectorAll('.poem-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentPoemId = poem.id;
                renderPoemDetail(poem.id);
            });

            poemList.appendChild(btn);
        });
    }


    function renderMiniThumbnail(poem, lang) {
        const targetRhyme = getRhymeTarget(poem, lang);
        
        // Count total to apply "1 rhyme means 0" rule
        let totalRhymesInPoem = 0;
        poem.content.forEach(line => {
            const indices = getRhymeIndicesForLine(line.data, targetRhyme, lang);
            totalRhymesInPoem += indices.size;
        });

        const showRhymes = totalRhymesInPoem > 1;

        let html = '<div class="mini-preview">';
        
        poem.content.forEach(line => {
            let lineContentHtml = '';
            let hasContent = false;
            const indices = getRhymeIndicesForLine(line.data, targetRhyme, lang);
            
            line.data.forEach((row, idx) => {
                if (row[7]) return; // Skip notes
                hasContent = true;
                
                // Check punctuation
                if (isRhymedelimiter(row[0])) {
                    lineContentHtml += `<div class="punct-dot"></div>`;
                    return;
                }
                // Render dot
                if (showRhymes && indices.has(idx)) {
                   lineContentHtml += `<div class="rhyme-dot"></div>`;
                } else {
                   lineContentHtml += `<div class="no-rhyme-dot"></div>`; 
                }
            });
            
            // Only add line if it has content (ignores lines that are purely notes)
            if (hasContent) {
                 html += '<div class="mini-line" style="display:flex;height:4px;margin-bottom:1px;">';
                 html += lineContentHtml;
                 html += '</div>';
            }
        });
        html += '</div>';
        return html;
    }

    function renderPoemDetail(id) {
        const poem = poemsData.find(p => p.id === id);
        if (!poem) return;

        // Use currentDisplayLang for main panel rhyme logic AND romanization
        const targetRhyme = getRhymeTarget(poem, currentDisplayLang);
        
        // Count total rhymes in poem to decide on highlighting
        let totalRhymesInPoem = 0;
        poem.content.forEach(line => {
            const indices = getRhymeIndicesForLine(line.data, targetRhyme, currentDisplayLang);
            totalRhymesInPoem += indices.size;
        });

        let contentHtml = '';
        
        // Determine Romanization Index
        let pIndex = 3; // lzt default since index logic was 1=cmn, 2=yue, 3=lzt
        if (currentDisplayLang === 'cmn') pIndex = 1;
        if (currentDisplayLang === 'yue') pIndex = 2;
        if (currentDisplayLang === 'lzt') pIndex = 3;
        
        poem.content.forEach(line => {
            const data = line.data;
            
            // Get rhyme indices for VISUALIZATION in main panel (based on selected lang buttons)
            const rhymeIndices = getRhymeIndicesForLine(data, targetRhyme, currentDisplayLang);

            let mainTextHtml = '';
            let notesTextHtml = '';
            
            data.forEach((row, idx) => {
                const char = row[0];
                const is_note = row[7];
                const roman = row[pIndex] || '';
                
                if (is_note) {
                    notesTextHtml += char;
                } else {
                    // Only highlight if total rhymes > 1 (i.e., not just a single stray occurence)
                    const isRhyme = rhymeIndices.has(idx) && totalRhymesInPoem > 1;
                    mainTextHtml += `
                        <div class="char-block">
                            <div class="char-roman">${roman}</div>
                            <div class="char-text ${isRhyme ? 'rhyme' : ''}">${char}</div>
                        </div>
                    `;
                    // Split check: if delimiter AND not last char
                    // Note: We already split lines in python data, so this check might be redundant 
                    // unless line is very long.
                    // But user asked: "Line break at 。 and ？ in the display, but don't insert line break at ，"
                    // Our python script ALREADY splits at 。 and ？, so each `line` in poem.content IS a visual line.
                    // We shouldn't need extra splits here unless for comma? 
                    // User said "don't insert line break at ，". So we do nothing here.
                }
            });
            
            let notesBlock = '';
            if (notesTextHtml) {
                notesBlock = `<div class="line-notes">${notesTextHtml}</div>`;
            }

            contentHtml += `
                <div class="poem-row"><div class="line-text">${mainTextHtml}</div></div>
            `;
        });

        // Compute thumbnails for Main Panel
        const thumbLzt = renderMiniThumbnail(poem, 'lzt');
        const thumbYue = renderMiniThumbnail(poem, 'yue');
        const thumbCmn = renderMiniThumbnail(poem, 'cmn');


        // Expose switchLang global
        window.switchLang = function(lang) {
            currentDisplayLang = lang;
            if (currentPoemId) {
                renderPoemDetail(currentPoemId);
            }
        };

        // Share function
        window.sharePoem = function() {
            const url = window.location.protocol + '//' + window.location.host + window.location.pathname + '?poem=' + currentPoemId + '&lang=' + currentDisplayLang;
            navigator.clipboard.writeText(url).then(() => {
                const btn = document.getElementById('share-btn');
                if (btn) {
                    const originalText = btn.innerHTML;
                    btn.innerHTML = '已複製連結';
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                    }, 2000);
                }
            });
        };

        poemDisplay.innerHTML = `
            <div class="display-container">
                 <div class="lang-switcher-row">
                    <button class="lang-text-btn ${currentDisplayLang === 'lzt' ? 'active' : ''}" onclick="switchLang('lzt')">中古漢語</button>
                    <button class="lang-text-btn ${currentDisplayLang === 'yue' ? 'active' : ''}" onclick="switchLang('yue')">粵語（香港）</button>
                    <button class="lang-text-btn ${currentDisplayLang === 'cmn' ? 'active' : ''}" onclick="switchLang('cmn')">普通話</button>
                </div>

                <div class="poem-card">
                    <div style="position: absolute; top: 1.5rem; left: 1.5rem; color:#999; font-size:0.8rem;">${poem.type || ''}</div>
                    
                    <button id="share-btn" class="share-btn" onclick="sharePoem()" title="複製連結">
                         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                            <polyline points="16 6 12 2 8 6"></polyline>
                            <line x1="12" y1="2" x2="12" y2="15"></line>
                        </svg>
                    </button>

                    <div class="poem-meta">
                        <div class="poem-title">${poem.title}</div>
                        <div class="poem-author">${poem.author}</div>
                    </div>
                    <div class="poem-content">
                        ${contentHtml}
                    </div>
                </div>

                <div class="mini-display-area">
                    <div class="thumb-col" onclick="switchLang('lzt')" style="cursor:pointer">
                        <div class="thumb-label">中古</div>
                        ${thumbLzt}
                    </div>
                    <div class="thumb-col" onclick="switchLang('yue')" style="cursor:pointer">
                        <div class="thumb-label">粵</div>
                        ${thumbYue}
                    </div>
                    <div class="thumb-col" onclick="switchLang('cmn')" style="cursor:pointer">
                        <div class="thumb-label">普</div>
                        ${thumbCmn}
                    </div>
                </div>
            </div>
        `;
    }

    // --- Stats ---

    function renderStats() {
        const container = document.getElementById('stats-container');
        if (!container) return;
        
        // Remove processing / chart loading
        container.innerHTML = '';
        
        const targetTypes = ['五言絕句', '七言絕句', '五言律詩', '七言律詩'];
        
        // Setup Grid Layout
        // 4 cols: Label | LZT | YUE | CMN
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '80px 1fr 1fr 1fr';
        grid.style.gap = '1rem';
        grid.style.alignItems = 'start';
        grid.style.width = '100%';
        
        // Headers
        const headers = ['', '中古漢語', '粵語', '普通話'];
        headers.forEach(h => {
             const div = document.createElement('div');
             div.textContent = h;
             div.style.fontWeight = 'bold';
             div.style.textAlign = 'center';
             div.style.paddingBottom = '0.5rem';
             div.style.borderBottom = '1px solid #eee';
             grid.appendChild(div);
        });
        
        targetTypes.forEach(type => {
            const applicablePoems = poemsData.filter(p => p.type === type);
            if (applicablePoems.length === 0) return;
            
            // Row Label
            const labelEl = document.createElement('div');
            labelEl.innerHTML = `<div style="font-weight:bold; font-size:0.9rem">${type}</div><div style="font-size:0.8rem;color:#888">${applicablePoems.length}首</div>`;
            labelEl.style.paddingTop = '5px';
            grid.appendChild(labelEl);
            
            // 3 Lang Cells
            ['lzt', 'yue', 'cmn'].forEach(lang => {
                 const cell = document.createElement('div');
                 cell.style.display = 'flex';
                 cell.style.flexWrap = 'wrap';
                 cell.style.gap = '2px';
                 cell.style.alignContent = 'flex-start';
                 
                 applicablePoems.forEach(poem => {
                     const stats = calculateRhymeStats(poem, lang);
                     const passed = stats && stats.passed;
                     
                     const box = document.createElement('div');
                     box.style.width = '8px';
                     box.style.height = '8px';
                     box.style.borderRadius = '1px';
                     box.title = `#${poem.id} ${poem.title} (${poem.author})`;
                     
                     // Colors
                     if (passed) {
                         if (lang === 'lzt') box.style.backgroundColor = 'rgba(54, 162, 235, 0.8)'; // Blue
                         if (lang === 'yue') box.style.backgroundColor = 'rgba(75, 192, 192, 0.8)'; // Teal
                         if (lang === 'cmn') box.style.backgroundColor = 'rgba(255, 99, 132, 0.8)'; // Red
                     } else {
                         box.style.backgroundColor = '#f0f0f0';
                     }
                     
                     // Click to jump to poem
                     box.style.cursor = 'pointer';
                     box.addEventListener('click', () => {
                         // Switch to poem view
                        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                        document.querySelector('.tab-btn[data-tab="poems"]').classList.add('active');
                        
                        document.querySelectorAll('.view-section').forEach(el => {
                            el.style.display = 'none';
                            el.classList.remove('active');
                        });
                        const poemsView = document.getElementById('view-poems');
                        poemsView.style.display = 'flex';
                        poemsView.classList.add('active');
                        
                        // Set State (Params)
                        currentDisplayLang = lang;
                        currentPoemId = poem.id;
                        
                        // Render with new params
                        renderPoemDetail(currentPoemId);
                        
                        // Update Sidebar
                        document.querySelectorAll('.poem-btn').forEach(b => b.classList.remove('active'));
                        const sidebarBtn = document.querySelector(`.poem-btn[data-id="${currentPoemId}"]`);
                        if (sidebarBtn) {
                            sidebarBtn.classList.add('active');
                            // Small delay to allow display:flex to render so scroll works
                            setTimeout(() => {
                                sidebarBtn.scrollIntoView({ block: 'center' });
                            }, 50);
                        }
                     });
                     
                     cell.appendChild(box);
                 });
                 
                 grid.appendChild(cell);
            });
            
            // Divider row (optional, or just careful spacing)
            // Just use gap in grid
        });

        container.appendChild(grid);
        
        const footer = document.createElement('p');
        footer.style.textAlign = 'center';
        footer.style.color = '#666';
        footer.style.fontSize = '0.9rem';
        footer.style.marginTop = '2rem';
        footer.textContent = '方格代表該體裁下的每一首詩。有色方格表示該語言符合押韻規則。點擊方格可跳轉至該詩。';
        container.appendChild(footer);
    }

    // Deprecated old checker function if no longer used, or repurposed
    function checkRhymeScheme(poem, type, lang) {
        // ... replaced by calculateRhymeStats usage above
        return false;
    }

});
