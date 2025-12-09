// ==================== 全域變數 ====================
let links = [];
let currentEditIndex = null;
let syncConfig = {
    token: '',
    gistId: ''
};

// ==================== DOM 元素 ====================
const linkList = document.getElementById('linkList');
const addLinkBtn = document.getElementById('addLinkBtn');
const linkModal = document.getElementById('linkModal');
const modalTitle = document.getElementById('modalTitle');
const linkUrl = document.getElementById('linkUrl');
const linkName = document.getElementById('linkName');
const saveLinkBtn = document.getElementById('saveLinkBtn');
const cancelBtn = document.getElementById('cancelBtn');
const fetchTitleBtn = document.getElementById('fetchTitleBtn');
const toolFrame = document.getElementById('toolFrame');
const welcomeScreen = document.getElementById('welcomeScreen');

// 同步相關元素
const syncStatus = document.getElementById('syncStatus');
const syncBtn = document.getElementById('syncBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const githubToken = document.getElementById('githubToken');
const gistId = document.getElementById('gistId');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const clearSettingsBtn = document.getElementById('clearSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const importFileInput = document.getElementById('importFileInput');

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    loadSyncConfig();
    loadLinks();
    renderLinks();
    updateSyncStatus();
    setupEventListeners();

    // 首次自動同步（如果有設置）
    if (syncConfig.token) {
        syncFromCloud();
    }
});

// ==================== 事件監聽器設置 ====================
function setupEventListeners() {
    // 連結管理
    addLinkBtn.addEventListener('click', openAddModal);
    cancelBtn.addEventListener('click', closeModal);
    saveLinkBtn.addEventListener('click', saveLink);
    fetchTitleBtn.addEventListener('click', fetchPageTitle);

    // 同步功能
    syncBtn.addEventListener('click', manualSync);
    exportBtn.addEventListener('click', exportData);
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', importData);

    // 設置
    settingsBtn.addEventListener('click', openSettingsModal);
    closeSettingsBtn.addEventListener('click', closeSettingsModal);
    saveSettingsBtn.addEventListener('click', saveSettings);
    clearSettingsBtn.addEventListener('click', clearSettings);

    // 點擊對話框外部關閉
    linkModal.addEventListener('click', (e) => {
        if (e.target === linkModal) closeModal();
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettingsModal();
    });

    // URL 輸入自動觸發抓取標題
    linkUrl.addEventListener('blur', () => {
        if (linkUrl.value && !linkName.value) {
            fetchPageTitle();
        }
    });
}

// ==================== GitHub Gist 同步功能 ====================

// 從雲端同步數據
async function syncFromCloud() {
    if (!syncConfig.token) {
        console.log('未設置 Token，跳過雲端同步');
        return;
    }

    try {
        setSyncStatus('syncing', '同步中...');

        // 如果有 Gist ID，嘗試獲取
        if (syncConfig.gistId) {
            const response = await fetch(`https://api.github.com/gists/${syncConfig.gistId}`, {
                headers: {
                    'Authorization': `token ${syncConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const gist = await response.json();
                const content = gist.files['toolkit-links.json'].content;
                const cloudLinks = JSON.parse(content);

                // 合併雲端數據（雲端優先）
                links = cloudLinks;
                saveLinksLocal();
                renderLinks();
                setSyncStatus('synced', '已同步');
                return;
            }
        }

        // 如果沒有 Gist ID 或獲取失敗，嘗試查找現有的 Gist
        const gists = await fetch('https://api.github.com/gists', {
            headers: {
                'Authorization': `token ${syncConfig.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (gists.ok) {
            const gistList = await gists.json();
            const existingGist = gistList.find(g =>
                g.files['toolkit-links.json'] && g.description === 'ToolKit Sync Data'
            );

            if (existingGist) {
                syncConfig.gistId = existingGist.id;
                saveSyncConfig();
                const content = existingGist.files['toolkit-links.json'].content;
                links = JSON.parse(content);
                saveLinksLocal();
                renderLinks();
                setSyncStatus('synced', '已同步');
                return;
            }
        }

        // 如果沒有找到，創建新的 Gist
        await syncToCloud();

    } catch (error) {
        console.error('雲端同步失敗:', error);
        setSyncStatus('error', '同步失敗');
    }
}

// 同步到雲端
async function syncToCloud() {
    if (!syncConfig.token) {
        alert('請先設置 GitHub Token');
        openSettingsModal();
        return;
    }

    try {
        setSyncStatus('syncing', '上傳中...');

        const data = {
            description: 'ToolKit Sync Data',
            public: false,
            files: {
                'toolkit-links.json': {
                    content: JSON.stringify(links, null, 2)
                }
            }
        };

        let response;

        if (syncConfig.gistId) {
            // 更新現有 Gist
            response = await fetch(`https://api.github.com/gists/${syncConfig.gistId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${syncConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
        } else {
            // 創建新 Gist
            response = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: {
                    'Authorization': `token ${syncConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
        }

        if (response.ok) {
            const gist = await response.json();
            syncConfig.gistId = gist.id;
            saveSyncConfig();
            setSyncStatus('synced', '已同步');
        } else {
            throw new Error('API 請求失敗');
        }

    } catch (error) {
        console.error('上傳到雲端失敗:', error);
        setSyncStatus('error', '上傳失敗');
        alert('同步失敗，請檢查 Token 是否正確');
    }
}

// 手動同步
async function manualSync() {
    if (!syncConfig.token) {
        alert('請先設置 GitHub Token');
        openSettingsModal();
        return;
    }

    await syncToCloud();
}

// ==================== 設置管理 ====================

function openSettingsModal() {
    githubToken.value = syncConfig.token;
    gistId.value = syncConfig.gistId;
    settingsModal.classList.add('active');
}

function closeSettingsModal() {
    settingsModal.classList.remove('active');
}

function saveSettings() {
    const token = githubToken.value.trim();
    const gist = gistId.value.trim();

    if (!token) {
        alert('請輸入 GitHub Token');
        return;
    }

    syncConfig.token = token;
    syncConfig.gistId = gist;
    saveSyncConfig();

    closeSettingsModal();
    updateSyncStatus();

    // 立即同步
    syncFromCloud();
}

function clearSettings() {
    if (confirm('確定要清除雲端同步設置嗎？本地數據不會被刪除。')) {
        syncConfig.token = '';
        syncConfig.gistId = '';
        saveSyncConfig();
        closeSettingsModal();
        updateSyncStatus();
    }
}

function saveSyncConfig() {
    localStorage.setItem('toolkitSyncConfig', JSON.stringify(syncConfig));
}

function loadSyncConfig() {
    const saved = localStorage.getItem('toolkitSyncConfig');
    if (saved) {
        try {
            syncConfig = JSON.parse(saved);
        } catch (error) {
            console.error('載入同步設置失敗:', error);
        }
    }
}

// ==================== 導出/導入功能 ====================

function exportData() {
    const dataStr = JSON.stringify(links, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `toolkit-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedLinks = JSON.parse(e.target.result);

            if (!Array.isArray(importedLinks)) {
                throw new Error('格式錯誤');
            }

            if (confirm(`將導入 ${importedLinks.length} 個工具，是否覆蓋現有數據？`)) {
                links = importedLinks;
                saveLinksLocal();
                renderLinks();

                // 如果有雲端同步，上傳到雲端
                if (syncConfig.token) {
                    syncToCloud();
                }
            }
        } catch (error) {
            alert('導入失敗，檔案格式錯誤');
            console.error('導入錯誤:', error);
        }
    };
    reader.readAsText(file);

    // 重置 input
    event.target.value = '';
}

// ==================== 同步狀態更新 ====================

function setSyncStatus(status, text) {
    syncStatus.className = 'sync-status ' + status;
    syncStatus.querySelector('.sync-text').textContent = text;
}

function updateSyncStatus() {
    if (syncConfig.token) {
        setSyncStatus('synced', '雲端模式');
    } else {
        setSyncStatus('', '本地模式');
    }
}

// ==================== 連結管理功能 ====================

function openAddModal() {
    currentEditIndex = null;
    modalTitle.textContent = '新增工具';
    linkUrl.value = '';
    linkName.value = '';
    linkModal.classList.add('active');
    linkUrl.focus();
}

function openEditModal(index) {
    currentEditIndex = index;
    modalTitle.textContent = '編輯工具';
    linkUrl.value = links[index].url;
    linkName.value = links[index].name;
    linkModal.classList.add('active');
    linkName.focus();
}

function closeModal() {
    linkModal.classList.remove('active');
    currentEditIndex = null;
}

// 自動抓取網頁標題
async function fetchPageTitle() {
    const url = linkUrl.value.trim();

    if (!url) {
        alert('請先輸入網址');
        return;
    }

    // 確保 URL 有協議
    let fullUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        fullUrl = 'https://' + url;
        linkUrl.value = fullUrl;
    }

    try {
        fetchTitleBtn.textContent = '抓取中...';
        fetchTitleBtn.disabled = true;

        // 使用 CORS 代理服務抓取網頁內容
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(fullUrl)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) {
            throw new Error('無法獲取網頁內容');
        }

        const data = await response.json();
        const htmlContent = data.contents;

        // 解析 HTML 內容
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');

        // 依序嘗試不同的標題來源
        let title = null;

        // 1. 嘗試獲取 og:title
        const ogTitle = doc.querySelector('meta[property="og:title"]');
        if (ogTitle) {
            title = ogTitle.getAttribute('content');
        }

        // 2. 嘗試獲取 twitter:title
        if (!title) {
            const twitterTitle = doc.querySelector('meta[name="twitter:title"]');
            if (twitterTitle) {
                title = twitterTitle.getAttribute('content');
            }
        }

        // 3. 嘗試獲取 <title> 標籤
        if (!title) {
            const titleTag = doc.querySelector('title');
            if (titleTag) {
                title = titleTag.textContent;
            }
        }

        // 4. 如果都沒有，使用域名作為標題
        if (!title || title.trim() === '') {
            const urlObj = new URL(fullUrl);
            title = urlObj.hostname.replace('www.', '');
        }

        linkName.value = title.trim();

    } catch (error) {
        console.error('Error fetching title:', error);

        // 失敗時使用域名作為標題
        try {
            const urlObj = new URL(fullUrl);
            linkName.value = urlObj.hostname.replace('www.', '');
        } catch (e) {
            alert('無法抓取網頁標題，請手動輸入');
        }
    } finally {
        fetchTitleBtn.textContent = '自動抓取標題';
        fetchTitleBtn.disabled = false;
    }
}

// 儲存連結
function saveLink() {
    const url = linkUrl.value.trim();
    const name = linkName.value.trim();

    if (!url || !name) {
        alert('請填寫所有欄位');
        return;
    }

    // 確保 URL 有協議
    let fullUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        fullUrl = 'https://' + url;
    }

    const link = {
        id: Date.now(),
        name: name,
        url: fullUrl
    };

    if (currentEditIndex !== null) {
        // 編輯現有連結，保留 ID
        link.id = links[currentEditIndex].id;
        links[currentEditIndex] = link;
    } else {
        // 新增連結
        links.push(link);
    }

    saveLinksLocal();
    renderLinks();
    closeModal();

    // 同步到雲端
    if (syncConfig.token) {
        syncToCloud();
    }
}

// 刪除連結
function deleteLink(index) {
    if (confirm(`確定要刪除「${links[index].name}」嗎？`)) {
        links.splice(index, 1);
        saveLinksLocal();
        renderLinks();

        // 如果刪除的是當前顯示的連結，顯示歡迎頁面
        const activeItems = document.querySelectorAll('.link-item.active');
        if (activeItems.length === 0) {
            showWelcome();
        }

        // 同步到雲端
        if (syncConfig.token) {
            syncToCloud();
        }
    }
}

// 上移連結
function moveUp(index) {
    if (index > 0) {
        [links[index - 1], links[index]] = [links[index], links[index - 1]];
        saveLinksLocal();
        renderLinks();

        // 同步到雲端
        if (syncConfig.token) {
            syncToCloud();
        }
    }
}

// 下移連結
function moveDown(index) {
    if (index < links.length - 1) {
        [links[index], links[index + 1]] = [links[index + 1], links[index]];
        saveLinksLocal();
        renderLinks();

        // 同步到雲端
        if (syncConfig.token) {
            syncToCloud();
        }
    }
}

// 開啟連結
function openLink(index) {
    const link = links[index];

    // 移除所有 active 狀態
    document.querySelectorAll('.link-item').forEach(item => {
        item.classList.remove('active');
    });

    // 添加 active 狀態到當前項目
    const linkItems = document.querySelectorAll('.link-item');
    if (linkItems[index]) {
        linkItems[index].classList.add('active');
    }

    // 顯示 iframe 並隱藏歡迎頁面
    welcomeScreen.style.display = 'none';
    toolFrame.style.display = 'block';
    toolFrame.src = link.url;
}

// 顯示歡迎頁面
function showWelcome() {
    welcomeScreen.style.display = 'flex';
    toolFrame.style.display = 'none';
    toolFrame.src = '';
}

// 渲染連結列表
function renderLinks() {
    linkList.innerHTML = '';

    if (links.length === 0) {
        linkList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999; font-size: 13px;">尚無工具<br>點擊上方按鈕新增</div>';
        return;
    }

    links.forEach((link, index) => {
        const li = document.createElement('li');
        li.className = 'link-item';
        li.innerHTML = `
            <div class="link-info">
                <div class="link-name">${escapeHtml(link.name)}</div>
                <div class="link-url">${escapeHtml(link.url)}</div>
            </div>
            <div class="link-actions">
                <div class="sort-buttons">
                    <button class="btn-sort btn-up" title="上移">▲</button>
                    <button class="btn-sort btn-down" title="下移">▼</button>
                </div>
                <button class="btn-icon edit" title="編輯">✎</button>
                <button class="btn-icon delete" title="刪除">✕</button>
            </div>
        `;

        // 點擊連結區域開啟工具
        li.querySelector('.link-info').addEventListener('click', () => openLink(index));

        // 編輯按鈕
        li.querySelector('.edit').addEventListener('click', (e) => {
            e.stopPropagation();
            openEditModal(index);
        });

        // 刪除按鈕
        li.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteLink(index);
        });

        // 上移按鈕
        li.querySelector('.btn-up').addEventListener('click', (e) => {
            e.stopPropagation();
            moveUp(index);
        });

        // 下移按鈕
        li.querySelector('.btn-down').addEventListener('click', (e) => {
            e.stopPropagation();
            moveDown(index);
        });

        linkList.appendChild(li);
    });
}

// ==================== 本地存儲 ====================

function saveLinksLocal() {
    localStorage.setItem('toolLinks', JSON.stringify(links));
}

function loadLinks() {
    const saved = localStorage.getItem('toolLinks');
    if (saved) {
        try {
            links = JSON.parse(saved);
        } catch (error) {
            console.error('Error loading links:', error);
            links = [];
        }
    }
}

// ==================== 工具函數 ====================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
