const PLUGIN_ID = "webgl-preview";
const WEBGL_PREVIEW_VERSION = "2026.08.01.3";
const UNITY_PREVIEW_VERSE_EXPAND =
  "id,name,description,data,metas,metas.code,metas.metaCode,resources,code,uuid,verseCode";
const ASSET_PATH_RE =
  /\.(?:png|jpe?g|gif|webp|bmp|svg|mp3|wav|ogg|m4a|mp4|webm|glb|gltf|fbx|obj|vox)(?:[?#]|$)/i;
const VIDEO_PATH_RE = /\.(?:mp4|webm)(?:[?#]|$)/i;
const SCENE_PAGE_SIZE = 20;
const SCENE_SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15000;
const DEFAULT_DISPOSE_TIMEOUT_MS = 4000;
const DEFAULT_UNITY_LOADER_TIMEOUT_MS = 600000;
const TOKEN_REFRESH_TIMEOUT_MS = 15000;
const PLATFORM_GET_MAX_ATTEMPTS = 2;
const PLATFORM_GET_RETRY_DELAY_MS = 250;
const RETRYABLE_PLATFORM_STATUSES = new Set([502, 503, 504]);
const PREVIEW_LIFECYCLE = Object.freeze({
  HANDSHAKE: "handshake",
  SCENE_LIST: "scene-list",
  READY: "ready",
  LOADING_SCENE: "loading-scene",
  STARTING_RUNNER: "starting-runner",
  RUNNING: "running",
  STOPPING: "stopping",
  STOPPED: "stopped",
  TERMINAL_ERROR: "terminal-error",
});
const LIFECYCLE_TRANSITIONS = Object.freeze({
  [PREVIEW_LIFECYCLE.HANDSHAKE]: [
    PREVIEW_LIFECYCLE.SCENE_LIST,
    PREVIEW_LIFECYCLE.READY,
    PREVIEW_LIFECYCLE.STOPPING,
    PREVIEW_LIFECYCLE.TERMINAL_ERROR,
  ],
  [PREVIEW_LIFECYCLE.SCENE_LIST]: [
    PREVIEW_LIFECYCLE.READY,
    PREVIEW_LIFECYCLE.LOADING_SCENE,
    PREVIEW_LIFECYCLE.STOPPING,
    PREVIEW_LIFECYCLE.HANDSHAKE,
    PREVIEW_LIFECYCLE.TERMINAL_ERROR,
  ],
  [PREVIEW_LIFECYCLE.READY]: [
    PREVIEW_LIFECYCLE.SCENE_LIST,
    PREVIEW_LIFECYCLE.LOADING_SCENE,
    PREVIEW_LIFECYCLE.STOPPING,
    PREVIEW_LIFECYCLE.HANDSHAKE,
    PREVIEW_LIFECYCLE.TERMINAL_ERROR,
  ],
  [PREVIEW_LIFECYCLE.LOADING_SCENE]: [
    PREVIEW_LIFECYCLE.STARTING_RUNNER,
    PREVIEW_LIFECYCLE.STOPPING,
    PREVIEW_LIFECYCLE.SCENE_LIST,
    PREVIEW_LIFECYCLE.TERMINAL_ERROR,
  ],
  [PREVIEW_LIFECYCLE.STARTING_RUNNER]: [
    PREVIEW_LIFECYCLE.RUNNING,
    PREVIEW_LIFECYCLE.STOPPING,
    PREVIEW_LIFECYCLE.TERMINAL_ERROR,
  ],
  [PREVIEW_LIFECYCLE.RUNNING]: [
    PREVIEW_LIFECYCLE.STOPPING,
    PREVIEW_LIFECYCLE.TERMINAL_ERROR,
  ],
  [PREVIEW_LIFECYCLE.STOPPING]: [
    PREVIEW_LIFECYCLE.STOPPED,
    PREVIEW_LIFECYCLE.HANDSHAKE,
    PREVIEW_LIFECYCLE.TERMINAL_ERROR,
  ],
  [PREVIEW_LIFECYCLE.STOPPED]: [
    PREVIEW_LIFECYCLE.READY,
    PREVIEW_LIFECYCLE.SCENE_LIST,
    PREVIEW_LIFECYCLE.LOADING_SCENE,
    PREVIEW_LIFECYCLE.STOPPING,
    PREVIEW_LIFECYCLE.HANDSHAKE,
    PREVIEW_LIFECYCLE.TERMINAL_ERROR,
  ],
  [PREVIEW_LIFECYCLE.TERMINAL_ERROR]: [],
});

const I18N = {
  zh: {
    topbarLabel: "WebGL 控制栏",
    viewerLabel: "Unity WebGL 预览",
    fullscreenPreview: "全屏预览",
    sceneIdLabel: "场景号",
    sceneIdPlaceholder: "请输入场景号：例如1416",
    myScenesLabel: "我的场景",
    openMyScenes: "打开我的场景",
    searchScenes: "搜索我的场景",
    selectScene: "请选择一个场景",
    awaitingHost: "正在等待平台登录信息…",
    loadingScenes: "正在加载我的场景…",
    noScenes: "你还没有可预览的场景。",
    noSearchResults: "没有找到匹配的场景，请更换关键词。",
    loginExpired: "登录状态已失效，请重新登录或等待平台刷新。",
    previewForbidden: "当前账号无权使用场景预览。",
    sceneListError: "我的场景加载失败，请重试。",
    retry: "重试",
    previousPage: "上一页",
    nextPage: "下一页",
    pageStatus: "第 {page} / {pages} 页，共 {total} 个",
    sceneOptionMeta: "场景 #{id}{updated}",
    sceneUpdated: " · 更新于 {date}",
    unnamedScene: "未命名场景",
    manualMode: "高级兼容模式",
    manualHelp: "手填场景号仍会经过平台权限校验，不会绕过场景授权。",
    manualSceneIdPlaceholder: "请输入正整数场景号",
    developmentTokenLabel: "本地开发 Token",
    developmentTokenWarning: "仅用于本地开发。Token 只保存在当前页面内存中。",
    useToken: "仅本次使用",
    returnToScenes: "返回场景选择",
    sceneDataUnauthorized: "登录状态已失效，无法读取场景。",
    sceneDataForbidden: "你没有权限预览这个场景。",
    sceneDataNotFound: "场景不存在或当前账号不可见。",
    sceneDataFailed: "场景数据读取失败，请稍后重试。",
    handshakeFailed: "无法建立可信的平台连接。",
    run: "运行",
    stop: "停止",
    rerun: "重跑",
    helpTitle: "操作说明",
    helpClick: "单击或长按鼠标左键可进行点击与拖拽物体操作",
    helpRotate: "按住 Alt + 鼠标左键旋转视角",
    helpZoomPan: "滚轮缩放视角，右键平移视角",
    configured: "已配置",
    notConfigured: "未配置",
    enterSceneId: "请输入场景号",
    enterValidSceneId: "请输入有效场景号",
    loadingPlugin: "正在加载 WebGL 插件",
    loadingPluginDetail: "0% 正在加载 Unity WebGL 运行环境，请稍候。",
    loadingPluginGuard:
      "0% 正在加载 Unity WebGL 运行环境，请勿切换场景或重复点击。",
    loadingPluginFallback: "正在加载 Unity WebGL 运行环境，请稍候。",
    readingScene: "读取场景中",
    readingSceneDetail: "正在读取场景 {sceneId}，请稍候。",
    loadingScene: "正在加载场景",
    preparingScene: "正在准备场景",
    preparingSceneDetail: "正在整理场景资源、脚本和实体数据。",
    sendingUnity: "发送到 Unity",
    startingScene: "正在启动场景",
    startingSceneDetail: "场景数据已读取完成，正在发送到 Unity。",
    sceneResourceLoading: "场景资源加载中",
    runFailed: "运行失败",
    running: "运行中",
    cachePlugin: "正在缓存 WebGL 插件",
    cacheReuse: "已复用本地缓存",
    cachePrepare: "正在准备插件资源",
    cacheDetail:
      "{percent} {action} {completed}/{total}{path}。首次加载 Unity 大包会较慢，请勿退出或重复操作。",
    localTokenMissing:
      "API 401: 本地独立运行缺少登录态，请在“本地访问令牌”里粘贴平台 token 后重试。",
    hostInit: "收到宿主 INIT，可使用登录态读取场景。",
    tokenUpdated: "登录 token 已更新。",
    payloadSent: "场景 payload 已发送到 Unity。",
    sceneReadStart: "开始读取场景 {sceneId}。",
    stopped: "已停止，场景已卸载并保留本地缓存。",
    iframeLoaded: "Unity iframe 已加载。",
    runnerReady: "Unity runner 已就绪。",
    runnerAccepted: "Unity runner 已接收场景。",
    cacheFailed: "插件缓存失败，将继续尝试直接加载。",
    tokenSaved: "本地开发 Token 已在本次页面中启用。",
    tokenCleared: "本地开发 Token 已从内存清空。",
    opened: "WebGL 场景运行器已打开。",
  },
  "zh-TW": {
    topbarLabel: "WebGL 控制列",
    viewerLabel: "Unity WebGL 預覽",
    fullscreenPreview: "全螢幕預覽",
    sceneIdLabel: "場景號",
    sceneIdPlaceholder: "請輸入場景號：例如1416",
    myScenesLabel: "我的場景",
    openMyScenes: "開啟我的場景",
    searchScenes: "搜尋我的場景",
    selectScene: "請選擇一個場景",
    awaitingHost: "正在等待平台登入資訊…",
    loadingScenes: "正在載入我的場景…",
    noScenes: "你還沒有可預覽的場景。",
    noSearchResults: "找不到符合的場景，請更換關鍵字。",
    loginExpired: "登入狀態已失效，請重新登入或等待平台更新。",
    previewForbidden: "目前帳號無權使用場景預覽。",
    sceneListError: "我的場景載入失敗，請重試。",
    retry: "重試",
    previousPage: "上一頁",
    nextPage: "下一頁",
    pageStatus: "第 {page} / {pages} 頁，共 {total} 個",
    sceneOptionMeta: "場景 #{id}{updated}",
    sceneUpdated: " · 更新於 {date}",
    unnamedScene: "未命名場景",
    manualMode: "進階相容模式",
    manualHelp: "手填場景號仍會經過平台權限驗證，不會繞過場景授權。",
    manualSceneIdPlaceholder: "請輸入正整數場景號",
    developmentTokenLabel: "本機開發 Token",
    developmentTokenWarning: "僅供本機開發。Token 只保存在目前頁面的記憶體中。",
    useToken: "僅本次使用",
    returnToScenes: "返回場景選擇",
    sceneDataUnauthorized: "登入狀態已失效，無法讀取場景。",
    sceneDataForbidden: "你沒有權限預覽這個場景。",
    sceneDataNotFound: "場景不存在或目前帳號不可見。",
    sceneDataFailed: "場景資料讀取失敗，請稍後重試。",
    handshakeFailed: "無法建立可信的平台連線。",
    run: "運行",
    stop: "停止",
    rerun: "重跑",
    helpTitle: "操作說明",
    helpClick: "單擊或長按滑鼠左鍵可進行點擊與拖拽物體操作",
    helpRotate: "按住 Alt + 滑鼠左鍵旋轉視角",
    helpZoomPan: "滾輪縮放視角，右鍵平移視角",
    configured: "已配置",
    notConfigured: "未配置",
    enterSceneId: "請輸入場景號",
    enterValidSceneId: "請輸入有效場景號",
    loadingPlugin: "正在載入 WebGL 插件",
    loadingPluginDetail: "0% 正在載入 Unity WebGL 執行環境，請稍候。",
    loadingPluginGuard:
      "0% 正在載入 Unity WebGL 執行環境，請勿切換場景或重複點擊。",
    loadingPluginFallback: "正在載入 Unity WebGL 執行環境，請稍候。",
    readingScene: "讀取場景中",
    readingSceneDetail: "正在讀取場景 {sceneId}，請稍候。",
    loadingScene: "正在載入場景",
    preparingScene: "正在準備場景",
    preparingSceneDetail: "正在整理場景資源、腳本和實體資料。",
    sendingUnity: "發送到 Unity",
    startingScene: "正在啟動場景",
    startingSceneDetail: "場景資料已讀取完成，正在發送到 Unity。",
    sceneResourceLoading: "場景資源載入中",
    runFailed: "運行失敗",
    running: "運行中",
    cachePlugin: "正在快取 WebGL 插件",
    cacheReuse: "已復用本機快取",
    cachePrepare: "正在準備插件資源",
    cacheDetail:
      "{percent} {action} {completed}/{total}{path}。首次載入 Unity 大包會較慢，請勿退出或重複操作。",
    localTokenMissing:
      "API 401：本機獨立運行缺少登入狀態，請在「本機存取權杖」貼上平台 token 後重試。",
    hostInit: "收到宿主 INIT，可使用登入狀態讀取場景。",
    tokenUpdated: "登入 token 已更新。",
    payloadSent: "場景 payload 已發送到 Unity。",
    sceneReadStart: "開始讀取場景 {sceneId}。",
    stopped: "已停止，場景已卸載並保留本機快取。",
    iframeLoaded: "Unity iframe 已載入。",
    runnerReady: "Unity runner 已就緒。",
    runnerAccepted: "Unity runner 已接收場景。",
    cacheFailed: "插件快取失敗，將繼續嘗試直接載入。",
    tokenSaved: "本機開發 Token 已在本頁啟用。",
    tokenCleared: "本機開發 Token 已從記憶體清除。",
    opened: "WebGL 場景運行器已開啟。",
  },
  en: {
    topbarLabel: "WebGL controls",
    viewerLabel: "Unity WebGL preview",
    fullscreenPreview: "Fullscreen preview",
    sceneIdLabel: "Scene ID",
    sceneIdPlaceholder: "Enter scene ID: e.g. 1416",
    myScenesLabel: "My scenes",
    openMyScenes: "Open My scenes",
    searchScenes: "Search My scenes",
    selectScene: "Select a scene",
    awaitingHost: "Waiting for the platform session…",
    loadingScenes: "Loading My scenes…",
    noScenes: "You do not have any scenes to preview yet.",
    noSearchResults: "No matching scenes. Try another search.",
    loginExpired: "Your session has expired. Sign in again or wait for a refresh.",
    previewForbidden: "This account cannot use scene preview.",
    sceneListError: "My scenes could not be loaded. Try again.",
    retry: "Retry",
    previousPage: "Previous page",
    nextPage: "Next page",
    pageStatus: "Page {page} of {pages}, {total} total",
    sceneOptionMeta: "Scene #{id}{updated}",
    sceneUpdated: " · Updated {date}",
    unnamedScene: "Untitled scene",
    manualMode: "Advanced compatibility mode",
    manualHelp: "A manually entered scene ID still uses platform authorization.",
    manualSceneIdPlaceholder: "Enter a positive scene ID",
    developmentTokenLabel: "Local development token",
    developmentTokenWarning: "Local development only. The token stays in this page's memory.",
    useToken: "Use once",
    returnToScenes: "Back to scenes",
    sceneDataUnauthorized: "Your session has expired, so the scene cannot be read.",
    sceneDataForbidden: "You do not have permission to preview this scene.",
    sceneDataNotFound: "The scene does not exist or is not visible to this account.",
    sceneDataFailed: "Scene data could not be loaded. Try again later.",
    handshakeFailed: "A trusted platform connection could not be established.",
    run: "Run",
    stop: "Stop",
    rerun: "Rerun",
    helpTitle: "Help",
    helpClick: "Click or hold the left mouse button to click and drag objects",
    helpRotate: "Hold Alt + left mouse button to rotate",
    helpZoomPan: "Use the wheel to zoom, right mouse button to pan",
    configured: "Configured",
    notConfigured: "Not configured",
    enterSceneId: "Enter a scene ID",
    enterValidSceneId: "Enter a valid scene ID",
    loadingPlugin: "Loading WebGL Plugin",
    loadingPluginDetail: "0% Loading the Unity WebGL runtime. Please wait.",
    loadingPluginGuard:
      "0% Loading the Unity WebGL runtime. Do not switch scenes or click repeatedly.",
    loadingPluginFallback: "Loading the Unity WebGL runtime. Please wait.",
    readingScene: "Reading scene",
    readingSceneDetail: "Reading scene {sceneId}. Please wait.",
    loadingScene: "Loading scene",
    preparingScene: "Preparing scene",
    preparingSceneDetail: "Preparing scene resources, scripts, and entities.",
    sendingUnity: "Sending to Unity",
    startingScene: "Starting scene",
    startingSceneDetail: "Scene data is ready and is being sent to Unity.",
    sceneResourceLoading: "Loading scene resources",
    runFailed: "Run failed",
    running: "Running",
    cachePlugin: "Caching WebGL Plugin",
    cacheReuse: "Using local cache",
    cachePrepare: "Preparing plugin assets",
    cacheDetail:
      "{percent} {action} {completed}/{total}{path}. The first Unity package load can be slow. Do not leave or repeat actions.",
    localTokenMissing:
      "API 401: Local standalone mode is missing login credentials. Paste a platform token into the local access token field and try again.",
    hostInit: "Host INIT received. Login state is available for scene loading.",
    tokenUpdated: "Login token updated.",
    payloadSent: "Scene payload sent to Unity.",
    sceneReadStart: "Started reading scene {sceneId}.",
    stopped: "Stopped. The scene was unloaded and local cache was kept.",
    iframeLoaded: "Unity iframe loaded.",
    runnerReady: "Unity runner is ready.",
    runnerAccepted: "Unity runner accepted the scene.",
    cacheFailed: "Plugin cache failed. Continuing with direct loading.",
    tokenSaved: "The local development token is active for this page only.",
    tokenCleared: "The local development token was cleared from memory.",
    opened: "WebGL scene runner opened.",
  },
  ja: {
    topbarLabel: "WebGL コントロール",
    viewerLabel: "Unity WebGL プレビュー",
    fullscreenPreview: "全画面プレビュー",
    sceneIdLabel: "シーン ID",
    sceneIdPlaceholder: "シーン ID を入力：例 1416",
    myScenesLabel: "自分のシーン",
    openMyScenes: "自分のシーンを開く",
    searchScenes: "自分のシーンを検索",
    selectScene: "シーンを選択してください",
    awaitingHost: "プラットフォームのログイン情報を待っています…",
    loadingScenes: "自分のシーンを読み込み中…",
    noScenes: "プレビューできるシーンはまだありません。",
    noSearchResults: "一致するシーンがありません。別のキーワードをお試しください。",
    loginExpired: "ログインの有効期限が切れました。再ログインしてください。",
    previewForbidden: "このアカウントにはシーンプレビュー権限がありません。",
    sceneListError: "シーンを読み込めませんでした。再試行してください。",
    retry: "再試行",
    previousPage: "前のページ",
    nextPage: "次のページ",
    pageStatus: "{page} / {pages} ページ、全 {total} 件",
    sceneOptionMeta: "シーン #{id}{updated}",
    sceneUpdated: " · {date} 更新",
    unnamedScene: "名称未設定のシーン",
    manualMode: "高度な互換モード",
    manualHelp: "手入力したシーン ID もプラットフォームの権限確認を通ります。",
    manualSceneIdPlaceholder: "正の整数のシーン ID を入力",
    developmentTokenLabel: "ローカル開発 Token",
    developmentTokenWarning: "ローカル開発専用です。Token はこのページのメモリだけに保存されます。",
    useToken: "今回のみ使用",
    returnToScenes: "シーン選択に戻る",
    sceneDataUnauthorized: "ログインの有効期限が切れたため、シーンを読み込めません。",
    sceneDataForbidden: "このシーンをプレビューする権限がありません。",
    sceneDataNotFound: "シーンが存在しないか、このアカウントには表示されません。",
    sceneDataFailed: "シーンデータを読み込めませんでした。後でもう一度お試しください。",
    handshakeFailed: "信頼できるプラットフォーム接続を確立できませんでした。",
    run: "実行",
    stop: "停止",
    rerun: "再実行",
    helpTitle: "操作ヘルプ",
    helpClick: "左クリックまたは長押しでクリックやオブジェクトのドラッグを行います",
    helpRotate: "Alt + 左クリックで視点を回転します",
    helpZoomPan: "ホイールでズーム、右クリックで視点を移動します",
    configured: "設定済み",
    notConfigured: "未設定",
    enterSceneId: "シーン ID を入力してください",
    enterValidSceneId: "有効なシーン ID を入力してください",
    loadingPlugin: "WebGL プラグインを読み込み中",
    loadingPluginDetail: "0% Unity WebGL ランタイムを読み込み中です。しばらくお待ちください。",
    loadingPluginGuard:
      "0% Unity WebGL ランタイムを読み込み中です。シーンを切り替えたり連続クリックしたりしないでください。",
    loadingPluginFallback: "Unity WebGL ランタイムを読み込み中です。しばらくお待ちください。",
    readingScene: "シーンを読み込み中",
    readingSceneDetail: "シーン {sceneId} を読み込み中です。しばらくお待ちください。",
    loadingScene: "シーンをロード中",
    preparingScene: "シーンを準備中",
    preparingSceneDetail: "シーンのリソース、スクリプト、エンティティを整理しています。",
    sendingUnity: "Unity に送信中",
    startingScene: "シーンを起動中",
    startingSceneDetail: "シーンデータの読み込みが完了し、Unity に送信しています。",
    sceneResourceLoading: "シーンリソースを読み込み中",
    runFailed: "実行に失敗しました",
    running: "実行中",
    cachePlugin: "WebGL プラグインをキャッシュ中",
    cacheReuse: "ローカルキャッシュを使用中",
    cachePrepare: "プラグインリソースを準備中",
    cacheDetail:
      "{percent} {action} {completed}/{total}{path}。初回の Unity パッケージ読み込みには時間がかかります。ページを離れたり操作を繰り返したりしないでください。",
    localTokenMissing:
      "API 401: ローカル単体実行にログイン情報がありません。プラットフォーム token をローカルアクセストークンに貼り付けて再試行してください。",
    hostInit: "ホスト INIT を受信しました。ログイン状態でシーンを読み込めます。",
    tokenUpdated: "ログイン token を更新しました。",
    payloadSent: "シーン payload を Unity に送信しました。",
    sceneReadStart: "シーン {sceneId} の読み込みを開始しました。",
    stopped: "停止しました。シーンをアンロードし、ローカルキャッシュを保持しました。",
    iframeLoaded: "Unity iframe を読み込みました。",
    runnerReady: "Unity runner の準備ができました。",
    runnerAccepted: "Unity runner がシーンを受信しました。",
    cacheFailed: "プラグインのキャッシュに失敗しました。直接読み込みを続行します。",
    tokenSaved: "ローカル開発 Token をこのページでのみ有効にしました。",
    tokenCleared: "ローカル開発 Token をメモリから消去しました。",
    opened: "WebGL シーンランナーを開きました。",
  },
  th: {
    topbarLabel: "แถบควบคุม WebGL",
    viewerLabel: "ตัวอย่าง Unity WebGL",
    fullscreenPreview: "ดูแบบเต็มหน้าจอ",
    sceneIdLabel: "รหัสฉาก",
    sceneIdPlaceholder: "กรอกรหัสฉาก เช่น 1416",
    myScenesLabel: "ฉากของฉัน",
    openMyScenes: "เปิดฉากของฉัน",
    searchScenes: "ค้นหาฉากของฉัน",
    selectScene: "เลือกฉาก",
    awaitingHost: "กำลังรอข้อมูลเข้าสู่ระบบจากแพลตฟอร์ม…",
    loadingScenes: "กำลังโหลดฉากของฉัน…",
    noScenes: "คุณยังไม่มีฉากสำหรับแสดงตัวอย่าง",
    noSearchResults: "ไม่พบฉากที่ตรงกัน ลองใช้คำค้นอื่น",
    loginExpired: "สถานะเข้าสู่ระบบหมดอายุ โปรดเข้าสู่ระบบอีกครั้ง",
    previewForbidden: "บัญชีนี้ไม่มีสิทธิ์ใช้ตัวอย่างฉาก",
    sceneListError: "โหลดฉากของฉันไม่สำเร็จ โปรดลองอีกครั้ง",
    retry: "ลองอีกครั้ง",
    previousPage: "หน้าก่อนหน้า",
    nextPage: "หน้าถัดไป",
    pageStatus: "หน้า {page} / {pages} รวม {total} รายการ",
    sceneOptionMeta: "ฉาก #{id}{updated}",
    sceneUpdated: " · อัปเดต {date}",
    unnamedScene: "ฉากไม่มีชื่อ",
    manualMode: "โหมดความเข้ากันได้ขั้นสูง",
    manualHelp: "รหัสฉากที่กรอกเองยังต้องผ่านการตรวจสอบสิทธิ์ของแพลตฟอร์ม",
    manualSceneIdPlaceholder: "กรอกรหัสฉากจำนวนเต็มบวก",
    developmentTokenLabel: "Token สำหรับพัฒนาในเครื่อง",
    developmentTokenWarning: "ใช้สำหรับพัฒนาในเครื่องเท่านั้น Token จะอยู่ในหน่วยความจำของหน้านี้",
    useToken: "ใช้ครั้งนี้เท่านั้น",
    returnToScenes: "กลับไปเลือกฉาก",
    sceneDataUnauthorized: "สถานะเข้าสู่ระบบหมดอายุ จึงอ่านฉากไม่ได้",
    sceneDataForbidden: "คุณไม่มีสิทธิ์ดูตัวอย่างฉากนี้",
    sceneDataNotFound: "ไม่มีฉากนี้หรือบัญชีนี้มองไม่เห็น",
    sceneDataFailed: "อ่านข้อมูลฉากไม่สำเร็จ โปรดลองอีกครั้งภายหลัง",
    handshakeFailed: "ไม่สามารถสร้างการเชื่อมต่อแพลตฟอร์มที่เชื่อถือได้",
    run: "รัน",
    stop: "หยุด",
    rerun: "รันใหม่",
    helpTitle: "วิธีใช้งาน",
    helpClick: "คลิกหรือกดปุ่มซ้ายค้างเพื่อคลิกและลากวัตถุ",
    helpRotate: "กด Alt + ปุ่มซ้ายเพื่อหมุนมุมมอง",
    helpZoomPan: "ใช้ล้อเมาส์เพื่อซูม และคลิกขวาเพื่อเลื่อนมุมมอง",
    configured: "ตั้งค่าแล้ว",
    notConfigured: "ยังไม่ได้ตั้งค่า",
    enterSceneId: "กรุณากรอกรหัสฉาก",
    enterValidSceneId: "กรุณากรอกรหัสฉากที่ถูกต้อง",
    loadingPlugin: "กำลังโหลดปลั๊กอิน WebGL",
    loadingPluginDetail: "0% กำลังโหลด Unity WebGL runtime กรุณารอสักครู่",
    loadingPluginGuard:
      "0% กำลังโหลด Unity WebGL runtime กรุณาอย่าสลับฉากหรือคลิกซ้ำ",
    loadingPluginFallback: "กำลังโหลด Unity WebGL runtime กรุณารอสักครู่",
    readingScene: "กำลังอ่านฉาก",
    readingSceneDetail: "กำลังอ่านฉาก {sceneId} กรุณารอสักครู่",
    loadingScene: "กำลังโหลดฉาก",
    preparingScene: "กำลังเตรียมฉาก",
    preparingSceneDetail: "กำลังเตรียมทรัพยากร สคริปต์ และเอนทิตีของฉาก",
    sendingUnity: "กำลังส่งไปยัง Unity",
    startingScene: "กำลังเริ่มฉาก",
    startingSceneDetail: "อ่านข้อมูลฉากเสร็จแล้ว กำลังส่งไปยัง Unity",
    sceneResourceLoading: "กำลังโหลดทรัพยากรฉาก",
    runFailed: "รันไม่สำเร็จ",
    running: "กำลังรัน",
    cachePlugin: "กำลังแคชปลั๊กอิน WebGL",
    cacheReuse: "ใช้แคชในเครื่อง",
    cachePrepare: "กำลังเตรียมทรัพยากรปลั๊กอิน",
    cacheDetail:
      "{percent} {action} {completed}/{total}{path} การโหลดแพ็กเกจ Unity ครั้งแรกอาจใช้เวลานาน กรุณาอย่าออกจากหน้า หรือกดซ้ำ",
    localTokenMissing:
      "API 401: โหมดโลคัลไม่มีสถานะเข้าสู่ระบบ กรุณาวาง platform token ในช่อง local access token แล้วลองใหม่",
    hostInit: "ได้รับ INIT จากโฮสต์แล้ว สามารถใช้สถานะเข้าสู่ระบบเพื่ออ่านฉากได้",
    tokenUpdated: "อัปเดต token เข้าสู่ระบบแล้ว",
    payloadSent: "ส่ง payload ของฉากไปยัง Unity แล้ว",
    sceneReadStart: "เริ่มอ่านฉาก {sceneId}",
    stopped: "หยุดแล้ว ยกเลิกโหลดฉากและเก็บแคชในเครื่องไว้",
    iframeLoaded: "โหลด Unity iframe แล้ว",
    runnerReady: "Unity runner พร้อมแล้ว",
    runnerAccepted: "Unity runner รับฉากแล้ว",
    cacheFailed: "แคชปลั๊กอินไม่สำเร็จ จะลองโหลดโดยตรงต่อไป",
    tokenSaved: "เปิดใช้ Token สำหรับพัฒนาเฉพาะหน้านี้แล้ว",
    tokenCleared: "ล้าง Token สำหรับพัฒนาออกจากหน่วยความจำแล้ว",
    opened: "เปิด WebGL scene runner แล้ว",
  },
};

const state = {
  lifecycle: PREVIEW_LIFECYCLE.HANDSHAKE,
  token: "",
  config: {},
  runtimeConfig: {},
  handshakeSession: "",
  handshakeComplete: false,
  handshakeTimer: 0,
  hostOrigin: "",
  hostSource: null,
  tokenRefreshWaiter: null,
  identityGeneration: 0,
  payload: null,
  frameReady: false,
  pendingRun: false,
  stopped: false,
  running: false,
  sceneVisible: false,
  busy: false,
  sceneLoading: false,
  sceneResourceLoading: false,
  sceneResourceProgressTimer: 0,
  sceneResourceProgressStartedAt: 0,
  cacheActive: false,
  loadingI18n: null,
  loadingProgressPercent: 0,
  loadingProgressMode: "plugin",
  frameSession: "",
  frameOrigin: "",
  runAbortController: null,
  runTerminal: false,
  disposeWaiter: null,
  runSerial: 0,
  sceneListStatus: "awaiting-host",
  scenes: [],
  sceneSearch: "",
  scenePage: 1,
  scenePageCount: 1,
  sceneTotalCount: 0,
  scenePerPage: SCENE_PAGE_SIZE,
  sceneListGeneration: 0,
  sceneListController: null,
  sceneSearchTimer: 0,
  selectedSceneId: null,
  selectedScene: null,
  initialSceneId: null,
  scenePickerOpen: false,
  allowManualSceneId: false,
  allowDevelopmentToken: false,
  locale: "zh",
};

const elements = {
  status: document.querySelector("[data-status]"),
  version: document.querySelector("[data-version]"),
  sceneControls: document.querySelector("[data-scene-controls]"),
  scenePicker: document.querySelector("[data-scene-picker]"),
  sceneSearch: document.querySelector("[data-scene-search]"),
  sceneToggle: document.querySelector("[data-scene-toggle]"),
  scenePopover: document.querySelector("[data-scene-popover]"),
  sceneListState: document.querySelector("[data-scene-list-state]"),
  sceneOptions: document.querySelector("[data-scene-options]"),
  sceneRetry: document.querySelector("[data-scene-retry]"),
  scenePagination: document.querySelector("[data-scene-pagination]"),
  scenePrevious: document.querySelector("[data-scene-previous]"),
  sceneNext: document.querySelector("[data-scene-next]"),
  scenePage: document.querySelector("[data-scene-page]"),
  manualMode: document.querySelector("[data-manual-mode]"),
  sceneField: document.querySelector("[data-scene-field]"),
  sceneId: document.querySelector("[data-scene-id]"),
  run: document.querySelector("[data-run]"),
  stop: document.querySelector("[data-stop]"),
  reload: document.querySelector("[data-reload]"),
  helpControl: document.querySelector("[data-help-control]"),
  fullscreen: document.querySelector("[data-fullscreen]"),
  tokenInput: document.querySelector("[data-token-input]"),
  saveToken: document.querySelector("[data-save-token]"),
  tokenState: document.querySelector("[data-token-state]"),
  apiBase: document.querySelector("[data-api-base]"),
  sceneName: document.querySelector("[data-scene-name]"),
  resourceCount: document.querySelector("[data-resource-count]"),
  metaCount: document.querySelector("[data-meta-count]"),
  luaLength: document.querySelector("[data-lua-length]"),
  log: document.querySelector("[data-log]"),
  frame: document.querySelector("[data-frame]"),
  idleHint: document.querySelector("[data-idle-hint]"),
  loadingProgress: document.querySelector("[data-loading-progress]"),
  loadingProgressBar: document.querySelector("[data-loading-progress-bar]"),
  loadingProgressText: document.querySelector("[data-loading-progress-text]"),
  loadingShield: document.querySelector("[data-loading-shield]"),
  loadingTitle: document.querySelector("[data-loading-title]"),
  loadingDetail: document.querySelector("[data-loading-detail]"),
  developmentToken: document.querySelector("[data-development-token]"),
  runError: document.querySelector("[data-run-error]"),
  runErrorTitle: document.querySelector("[data-run-error-title]"),
  runErrorCode: document.querySelector("[data-run-error-code]"),
  runRetry: document.querySelector("[data-run-retry]"),
  runReturn: document.querySelector("[data-run-return]"),
};

function canTransitionLifecycle(current, next, recoverTerminal = false) {
  if (!Object.values(PREVIEW_LIFECYCLE).includes(next)) return false;
  if (current === next) return true;
  if (current === PREVIEW_LIFECYCLE.TERMINAL_ERROR) {
    return recoverTerminal;
  }
  return (LIFECYCLE_TRANSITIONS[current] || []).includes(next);
}

function transitionLifecycle(
  next,
  { runSession = "", recoverTerminal = false } = {}
) {
  if (runSession && runSession !== state.frameSession) return false;
  if (!canTransitionLifecycle(state.lifecycle, next, recoverTerminal)) return false;
  state.lifecycle = next;
  state.runTerminal = next === PREVIEW_LIFECYCLE.TERMINAL_ERROR;
  document.documentElement.dataset.previewLifecycle = next;
  if (elements.status) elements.status.dataset.lifecycle = next;
  return true;
}

function normalizeLocale(value) {
  const lang = (value || navigator.language || "zh-CN")
    .toLowerCase()
    .replace("_", "-");
  if (lang === "zh-tw" || lang === "zh-hk" || lang === "zh-mo" || lang.includes("hant")) {
    return "zh-TW";
  }
  if (lang.startsWith("zh")) return "zh";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("th")) return "th";
  return "en";
}

function resolveLocale() {
  return normalizeLocale(readQuery().get("lang"));
}

function t(key, params = {}) {
  const template =
    (I18N[state.locale] && I18N[state.locale][key]) || I18N.zh[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : ""
  );
}

function applyI18n() {
  document.documentElement.lang = currentLocaleCode();
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.setAttribute("title", t(node.dataset.i18nTitle));
  });
  if (elements.tokenState) {
    elements.tokenState.textContent = state.token ? t("configured") : t("notConfigured");
  }
  renderScenePicker();
}

function currentLocaleCode() {
  const langMap = { zh: "zh-CN", "zh-TW": "zh-TW", en: "en-US", ja: "ja-JP", th: "th-TH" };
  return langMap[state.locale] || "en-US";
}

function refreshStatusForLocale() {
  if (state.lifecycle === PREVIEW_LIFECYCLE.TERMINAL_ERROR) {
    const key =
      state.sceneListStatus === "401"
        ? "loginExpired"
        : state.sceneListStatus === "403"
          ? "previewForbidden"
          : state.sceneListStatus === "error"
            ? "sceneListError"
            : state.sceneListStatus === "handshake-error"
              ? "handshakeFailed"
              : "runFailed";
    setStatus(t(key), "error");
    return;
  }
  if (state.sceneLoading) {
    setStatus(t("readingScene"), "busy");
    return;
  }
  if (state.sceneResourceLoading) {
    setStatus(t("sceneResourceLoading"), "busy");
    return;
  }
  if (state.running) {
    setStatus("", "");
    return;
  }
  if (
    state.busy ||
    state.cacheActive ||
    (!state.frameReady && !isUnityFrameStopped())
  ) {
    setStatus(t("loadingPlugin"), "busy");
    return;
  }
  setStatus(t("selectScene"), "ready");
}

function extractLocaleCandidate(value) {
  if (!value || typeof value !== "object") return "";
  const direct =
    value.lang ||
    value.language ||
    value.locale ||
    value.currentLang ||
    value.currentLanguage;
  if (typeof direct === "string") return direct;
  if (value.config && typeof value.config === "object") {
    return extractLocaleCandidate(value.config);
  }
  if (value.payload && typeof value.payload === "object") {
    return extractLocaleCandidate(value.payload);
  }
  return "";
}

function postLocaleToUnityFrame() {
  if (
    isUnityFrameStopped() ||
    !elements.frame.contentWindow ||
    !state.frameOrigin ||
    !state.frameSession
  ) return;
  elements.frame.contentWindow.postMessage(
    {
      type: "webgl-preview-locale-change",
      session: state.frameSession,
      lang: currentLocaleCode(),
      locale: currentLocaleCode(),
    },
    state.frameOrigin
  );
}

function updateLocale(nextLang) {
  const localeCandidate = nextLang || readQuery().get("lang");
  if (!localeCandidate) return false;
  const nextLocale = normalizeLocale(localeCandidate);
  if (nextLocale === state.locale) return false;
  state.locale = nextLocale;
  applyI18n();
  refreshStatusForLocale();
  refreshLoadingShieldForLocale();
  postLocaleToUnityFrame();
  return true;
}

function translateLoadingI18n(i18n) {
  if (!i18n || typeof i18n !== "object") return null;
  const titleKey = i18n.titleKey || "";
  const detailKey = i18n.detailKey || "";
  const params = i18n.params && typeof i18n.params === "object" ? { ...i18n.params } : {};
  if (params.actionKey) {
    params.action = t(params.actionKey);
  }
  if (!titleKey && !detailKey) return null;
  return {
    title: titleKey ? t(titleKey, params) : "",
    detail: detailKey ? t(detailKey, params) : "",
  };
}

function refreshLoadingShieldForLocale() {
  if (elements.loadingShield.hidden || !state.loadingI18n) return;
  const translated = translateLoadingI18n(state.loadingI18n);
  if (!translated) return;
  setLoadingShield(true, translated.detail, translated.title, state.loadingI18n);
}

function setLocalizedLoadingShield(visible, titleKey, detailKey, params = {}) {
  const i18n = { titleKey, detailKey, params };
  const translated = translateLoadingI18n(i18n) || {};
  setLoadingShield(visible, translated.detail, translated.title, i18n);
}

function normalizeLoadingI18n(i18n) {
  if (!i18n || typeof i18n !== "object") return null;
  return {
    titleKey: i18n.titleKey || "",
    detailKey: i18n.detailKey || "",
    params: i18n.params && typeof i18n.params === "object" ? { ...i18n.params } : {},
  };
}

function setRemoteLoadingShield(message) {
  const i18n = normalizeLoadingI18n(message.i18n);
  if (i18n) {
    const translated = translateLoadingI18n(i18n) || {};
    setLoadingShield(true, translated.detail, translated.title, i18n);
    return;
  }
  setLoadingShield(
    true,
    message.detail || t("loadingPluginFallback"),
    message.title || t("loadingPlugin")
  );
}

function genId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  const entropy = new Uint32Array(4);
  globalThis.crypto?.getRandomValues?.(entropy);
  const random = [...entropy]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
  return `${prefix}-${Date.now()}-${random}`;
}

function log(message, detail) {
  const timestamp = new Date().toLocaleTimeString();
  const suffix = detail ? `\n${JSON.stringify(detail, null, 2)}` : "";
  elements.log.textContent = `[${timestamp}] ${message}${suffix}\n\n${elements.log.textContent}`;
}

function safeResourceLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text, window.location.href);
    return url.pathname.split("/").filter(Boolean).pop() || "resource";
  } catch {
    return text.split(/[?#]/, 1)[0].slice(0, 96);
  }
}

function formatStatusText(text) {
  const value = String(text || "").trim();
  return value;
}

function setStatus(text, tone) {
  elements.status.textContent = formatStatusText(text);
  elements.status.dataset.tone = tone || "";
}

function parsePercent(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }
  const match = String(value || "").match(/(\d{1,3})%/);
  return match ? Math.max(0, Math.min(100, Number(match[1]))) : null;
}

function setLoadingProgress(percentText, { indeterminate = false, reset = false } = {}) {
  const parsed = parsePercent(percentText);
  if (parsed === null && !indeterminate) {
    return;
  }
  const percent = reset
    ? parsed || 0
    : Math.max(state.loadingProgressPercent, parsed || 0);
  state.loadingProgressPercent = percent;
  elements.loadingProgress.dataset.mode = indeterminate ? "indeterminate" : "";
  elements.loadingProgressBar.style.width = `${percent}%`;
  elements.loadingProgressText.textContent = `${percent}%`;
}

function setLoadingProgressMode(mode) {
  if (state.loadingProgressMode === mode) return;
  state.loadingProgressMode = mode;
  state.loadingProgressPercent = 0;
}

function stopSceneResourceProgress() {
  if (state.sceneResourceProgressTimer) {
    window.clearInterval(state.sceneResourceProgressTimer);
    state.sceneResourceProgressTimer = 0;
  }
  state.sceneResourceProgressStartedAt = 0;
}

function estimateSceneResourceProgress() {
  if (!state.sceneResourceProgressStartedAt) return 8;
  const elapsedSeconds = Math.max(
    0,
    (performance.now() - state.sceneResourceProgressStartedAt) / 1000
  );
  return Math.min(
    94,
    Math.max(8, Math.round(8 + 86 * (1 - Math.exp(-elapsedSeconds / 9))))
  );
}

function updateSceneResourceProgress() {
  if (!state.sceneResourceLoading) {
    stopSceneResourceProgress();
    return;
  }
  setLoadingProgress(`${estimateSceneResourceProgress()}%`);
}

function startSceneResourceProgress() {
  stopSceneResourceProgress();
  setLoadingProgressMode("scene-resource");
  state.sceneResourceProgressStartedAt = performance.now();
  setLoadingProgress("8%", { reset: true });
  state.sceneResourceProgressTimer = window.setInterval(
    updateSceneResourceProgress,
    500
  );
}

function clearLoadingProgress() {
  stopSceneResourceProgress();
  elements.loadingProgress.hidden = true;
  elements.loadingProgress.dataset.mode = "";
  elements.loadingProgressBar.style.width = "0%";
  elements.loadingProgressText.textContent = "0%";
  state.loadingProgressPercent = 0;
}

function shouldShowLoadingProgress() {
  const tone = elements.status.dataset.tone || "";
  if (tone === "ready" || tone === "error" || tone === "running") {
    return false;
  }

  return (
    state.sceneResourceLoading ||
    state.sceneLoading ||
    state.cacheActive ||
    state.busy ||
    (!elements.loadingShield.hidden &&
      !state.frameReady &&
      elements.status.dataset.tone !== "ready")
  );
}

function renderControls() {
  const isActive = state.busy || state.running;
  if (elements.idleHint) {
    elements.idleHint.hidden =
      state.running && !state.sceneLoading && !state.sceneResourceLoading;
  }
  if (elements.loadingProgress) {
    elements.loadingProgress.hidden = !shouldShowLoadingProgress();
  }
  if (elements.sceneControls) {
    elements.sceneControls.hidden = isActive;
  }
  if (elements.manualMode) {
    elements.manualMode.hidden = isActive || !state.allowManualSceneId;
  }
  if (elements.developmentToken) {
    elements.developmentToken.hidden = !state.allowDevelopmentToken;
  }
  elements.run.hidden = isActive;
  elements.stop.hidden = !isActive;
  elements.reload.hidden = !isActive;
  elements.helpControl.hidden = !isActive;
  elements.run.disabled = state.busy || !normalizePositiveSceneId(state.selectedSceneId);
  elements.stop.disabled = state.busy && state.stopped;
  elements.reload.disabled = state.busy && !state.sceneResourceLoading;
}

function setLoadingShield(visible, detail, title, i18n) {
  if (visible && state.lifecycle === PREVIEW_LIFECYCLE.TERMINAL_ERROR) return;
  elements.loadingShield.hidden = !visible;
  if (visible) {
    state.loadingI18n = normalizeLoadingI18n(i18n);
  } else {
    state.loadingI18n = null;
  }
  if (title) elements.loadingTitle.textContent = title;
  if (detail) elements.loadingDetail.textContent = detail;
  if (visible) {
    setStatus(title || t("loadingPlugin"), "busy");
    setLoadingProgress(detail || "");
  } else {
    if (!state.sceneResourceLoading) {
      clearLoadingProgress();
    }
  }
  renderControls();
}

function hideLoadingShieldIfReady() {
  if (!state.cacheActive && state.frameReady && !state.busy && !state.sceneLoading) {
    setLoadingShield(false);
  }
}

function setControlsBusy(isBusy) {
  state.busy = isBusy;
  renderControls();
}

function formatPercent(completed, total) {
  if (!total) return "0%";
  return `${Math.max(0, Math.min(100, Math.round((completed / total) * 100)))}%`;
}

function readQuery() {
  return new URLSearchParams(window.location.search);
}

class PreviewError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "PreviewError";
    this.code = code;
    this.status = Number(options.status || 0);
    this.retryable = options.retryable !== false;
  }
}

function normalizePositiveSceneId(value) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) return null;
  const sceneId = Number(text);
  return Number.isSafeInteger(sceneId) ? sceneId : null;
}

function normalizeApiBase(value) {
  const input = (value || "").trim();
  if (!input) return "";

  try {
    const url = new URL(input, window.location.href);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function normalizeOrigin(value) {
  if (value === "self") return window.location.origin;
  try {
    const url = new URL(String(value || ""), window.location.href);
    if (url.username || url.password) return "";
    return url.origin === "null" ? "" : url.origin;
  } catch {
    return "";
  }
}

function normalizeOriginList(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((candidate) => {
          if (candidate === "self") return window.location.origin;
          const input = String(candidate || "").trim();
          if (!input) return "";
          try {
            const url = new URL(input);
            return (
              (url.protocol === "https:" || url.protocol === "http:") &&
              url.origin === input
            )
              ? url.origin
              : "";
          } catch {
            return "";
          }
        })
        .filter(Boolean)
    ),
  ];
}

function isLoopbackHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function isExplicitLocalDevelopment() {
  const explicit =
    readQuery().get("dev") === "1" ||
    state.runtimeConfig.localDevelopment === true ||
    state.runtimeConfig.development === true;
  return explicit && isLoopbackHost(window.location.hostname);
}

function getRequestTimeoutMs() {
  const configured = Number(state.runtimeConfig.requestTimeoutMs);
  return Number.isFinite(configured) && configured >= 1000
    ? Math.min(configured, 60000)
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

function getHandshakeTimeoutMs() {
  const configured = Number(state.runtimeConfig.handshakeTimeoutMs);
  return Number.isFinite(configured) && configured >= 1000
    ? Math.min(configured, 60000)
    : DEFAULT_HANDSHAKE_TIMEOUT_MS;
}

function getDisposeTimeoutMs() {
  const configured = Number(state.runtimeConfig.disposeTimeoutMs);
  return Number.isFinite(configured) && configured >= 500
    ? Math.min(configured, 15000)
    : DEFAULT_DISPOSE_TIMEOUT_MS;
}

function getUnityLoaderTimeoutMs() {
  const configured = Number(state.runtimeConfig.unityLoaderTimeoutMs);
  return Number.isFinite(configured) && configured >= 1000
    ? Math.min(configured, 900000)
    : DEFAULT_UNITY_LOADER_TIMEOUT_MS;
}

function getMaxDevicePixelRatio() {
  const configured = Number(state.runtimeConfig.maxDevicePixelRatio);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(Math.max(configured, 1), 3)
    : 2;
}

async function loadRuntimeConfig() {
  const configUrl = new URL("./runtime-config.json", document.baseURI);
  const response = await fetch(configUrl.toString(), {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new PreviewError(
      "WGP-CONFIG",
      `Runtime config unavailable (${response.status})`,
      { status: response.status, retryable: false }
    );
  }
  const config = await response.json();
  if (!isRecord(config)) {
    throw new PreviewError("WGP-CONFIG", "Runtime config must be an object", {
      retryable: false,
    });
  }
  state.runtimeConfig = config;
  state.allowManualSceneId =
    config.allowManualSceneId === true || isExplicitLocalDevelopment();
  state.allowDevelopmentToken =
    isExplicitLocalDevelopment() && config.allowDevelopmentToken === true;
}

function allowedPlatformApiOrigins() {
  return normalizeOriginList(state.runtimeConfig.platformApiOrigins);
}

function allowedAssetOrigins() {
  return normalizeOriginList(state.runtimeConfig.assetOrigins);
}

function isAllowedSecureOrigin(url, allowedOrigins) {
  if (url.username || url.password) return false;
  if (!allowedOrigins.includes(url.origin)) return false;
  if (url.protocol === "https:") return true;
  return isExplicitLocalDevelopment() && url.protocol === "http:" && isLoopbackHost(url.hostname);
}

function resolvePlatformApiAlias() {
  const candidate = state.runtimeConfig.platformApiAlias;
  if (typeof candidate !== "string" || !candidate.trim()) return "";

  try {
    const url = new URL(candidate.trim(), window.location.href);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.origin !== window.location.origin ||
      (url.protocol !== "https:" &&
        !(isExplicitLocalDevelopment() && url.protocol === "http:"))
    ) {
      return "";
    }
    const pathname = url.pathname.replace(/\/+$/, "");
    if (!pathname || pathname === "/" || pathname.split("/").includes("..")) {
      return "";
    }
    url.pathname = pathname;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function isAllowedPlatformRequestUrl(url) {
  const aliasBase = resolvePlatformApiAlias();
  if (aliasBase) {
    const alias = new URL(`${aliasBase}/`);
    if (url.origin === alias.origin) {
      const listPath = `${alias.pathname.replace(/\/+$/, "")}/v1/verses`;
      if (url.pathname === listPath) return true;
      if (url.pathname.startsWith(`${listPath}/`)) {
        return /^[1-9]\d*$/.test(url.pathname.slice(listPath.length + 1));
      }
      return false;
    }
  }
  return isAllowedSecureOrigin(url, allowedPlatformApiOrigins());
}

function resolveApiBase() {
  const aliasBase = resolvePlatformApiAlias();
  if (aliasBase) return aliasBase;

  const candidates = [
    state.config.platformApiBase,
    state.config.apiBase,
    state.config.api,
    state.runtimeConfig.platformApiBase,
    state.runtimeConfig.apiBase,
    isExplicitLocalDevelopment() ? state.runtimeConfig.standaloneApiBase : "",
  ];
  const allowedOrigins = allowedPlatformApiOrigins();

  for (const candidate of candidates) {
    const normalized = normalizeApiBase(candidate);
    if (!normalized) continue;
    const url = new URL(normalized);
    if (isAllowedSecureOrigin(url, allowedOrigins)) return normalized;
  }

  if (allowedOrigins.length === 1) {
    return `${allowedOrigins[0]}/api`;
  }

  return "";
}

function resolvePlatformUrl(pathname) {
  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new PreviewError(
      "WGP-API-ORIGIN",
      "Platform API base is missing or not allowlisted",
      { retryable: false }
    );
  }
  const base = new URL(`${apiBase.replace(/\/+$/, "")}/`);
  const resolved = new URL(String(pathname).replace(/^\/+/, ""), base);
  if (!isAllowedPlatformRequestUrl(resolved)) {
    throw new PreviewError("WGP-API-ORIGIN", "Platform API origin denied", {
      retryable: false,
    });
  }
  return resolved;
}

function resolveAssetBaseOrigin() {
  const configured = state.runtimeConfig.assetBaseOrigin;
  if (configured) {
    try {
      const url = new URL(configured);
      if (isAllowedSecureOrigin(url, allowedAssetOrigins())) return url.origin;
    } catch {
      // Fall through to the first declared asset origin.
    }
  }
  return allowedAssetOrigins()[0] || "";
}

function resolveTrustedHostOrigin() {
  const allowed = normalizeOriginList(state.runtimeConfig.trustedHostOrigins);
  const candidates = [];
  if (document.referrer) candidates.push(normalizeOrigin(document.referrer));
  try {
    if (window.location.ancestorOrigins?.length) {
      candidates.push(normalizeOrigin(window.location.ancestorOrigins[0]));
    }
  } catch {
    // ancestorOrigins is optional and may be unavailable.
  }
  if (window.parent !== window) candidates.push(window.location.origin);
  const match = candidates.find((origin) => origin && allowed.includes(origin));
  if (match) return match;
  return allowed.length === 1 ? allowed[0] : "";
}

function setToken(token) {
  state.token = typeof token === "string" ? token.trim() : "";
  if (elements.tokenState) {
    elements.tokenState.textContent = state.token ? t("configured") : t("notConfigured");
  }
}

function readJwtPrincipal(token) {
  const normalizedToken = typeof token === "string" ? token.trim() : "";
  const payloadSegment = normalizedToken.split(".")[1] || "";
  if (!payloadSegment || !/^[A-Za-z0-9_-]+$/.test(payloadSegment)) return null;

  try {
    const base64 = payloadSegment
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");
    const payload = JSON.parse(window.atob(base64));
    if (!isRecord(payload)) return null;
    const normalizeClaim = (value) =>
      typeof value === "string" || typeof value === "number"
        ? String(value).trim()
        : "";
    const uid = normalizeClaim(payload.uid);
    const sub = normalizeClaim(payload.sub);
    if (!uid && !sub) return null;
    return { uid, sub };
  } catch {
    return null;
  }
}

function hasSameJwtPrincipal(currentToken, nextToken) {
  const currentPrincipal = readJwtPrincipal(currentToken);
  const nextPrincipal = readJwtPrincipal(nextToken);
  return (
    Boolean(currentPrincipal) &&
    Boolean(nextPrincipal) &&
    currentPrincipal.uid === nextPrincipal.uid &&
    currentPrincipal.sub === nextPrincipal.sub
  );
}

function hasHandshakeSession(payload) {
  return (
    isRecord(payload) &&
    payload.handshakeSession === state.handshakeSession &&
    Boolean(state.handshakeSession)
  );
}

function postToHost(message) {
  if (!state.hostOrigin || !window.parent || window.parent === window) return false;
  window.parent.postMessage(message, state.hostOrigin);
  return true;
}

function postPluginReady() {
  if (
    !state.hostOrigin ||
    !window.parent ||
    window.parent === window ||
    window.__PLUGIN_READY_SENT__
  ) return;

  window.__PLUGIN_READY_SENT__ = true;
  postToHost({
    type: "PLUGIN_READY",
    id: genId(`${PLUGIN_ID}-ready`),
    payload: { handshakeSession: state.handshakeSession },
  });
}

function settleTokenRefreshWaiter(token = "", updateToken = false) {
  const waiter = state.tokenRefreshWaiter;
  if (!waiter) return false;
  state.tokenRefreshWaiter = null;
  window.clearTimeout(waiter.timer);
  if (updateToken) setToken(token);
  waiter.resolve(updateToken ? state.token : "");
  return true;
}

function waitForSharedTokenRefresh(signal) {
  const waiter = state.tokenRefreshWaiter;
  if (!waiter) return Promise.resolve("");
  if (signal?.aborted) return Promise.reject(abortReason(signal));

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    waiter.promise.then(
      (token) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(token);
      },
      (error) => {
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

function requestTokenRefresh(signal) {
  if (
    !state.handshakeComplete ||
    !state.handshakeSession ||
    !state.hostSource ||
    !state.hostOrigin
  ) {
    return Promise.resolve("");
  }

  if (
    state.tokenRefreshWaiter &&
    state.tokenRefreshWaiter.handshakeSession !== state.handshakeSession
  ) {
    settleTokenRefreshWaiter("");
  }

  if (!state.tokenRefreshWaiter) {
    let resolveWaiter;
    const promise = new Promise((resolve) => {
      resolveWaiter = resolve;
    });
    const handshakeSession = state.handshakeSession;
    const waiter = {
      handshakeSession,
      promise,
      resolve: resolveWaiter,
      timer: 0,
    };
    state.tokenRefreshWaiter = waiter;
    waiter.timer = window.setTimeout(() => {
      if (state.tokenRefreshWaiter !== waiter) return;
      settleTokenRefreshWaiter("");
    }, TOKEN_REFRESH_TIMEOUT_MS);

    const posted = postToHost({
      type: "TOKEN_REFRESH_REQUEST",
      id: genId(`${PLUGIN_ID}-token-refresh`),
      payload: { handshakeSession },
    });
    if (!posted) settleTokenRefreshWaiter("");
  }

  return waitForSharedTokenRefresh(signal);
}

function isTrustedHostEvent(event) {
  return (
    Boolean(state.hostOrigin) &&
    event.source === window.parent &&
    event.origin === state.hostOrigin
  );
}

function handleHostMessage(event) {
  if (!isTrustedHostEvent(event)) return;
  const message = event.data || {};
  if (!isRecord(message) || typeof message.type !== "string") return;
  const payload = isRecord(message.payload) ? message.payload : {};
  const isLegacyLocaleMessage = [
    "LANGUAGE_CHANGE",
    "LOCALE_CHANGE",
    "SET_LANGUAGE",
    "SET_LOCALE",
    "CHANGE_LANGUAGE",
    "CHANGE_LOCALE",
    "LANG_CHANGE",
    "I18N_CHANGE",
  ].includes(message.type);

  if (isLegacyLocaleMessage) {
    if (!("handshakeSession" in payload) || hasHandshakeSession(payload)) {
      updateLocale(extractLocaleCandidate(message));
    }
    return;
  }

  if (!hasHandshakeSession(payload)) return;

  if (message.type === "INIT") {
    if (state.handshakeComplete && event.source !== state.hostSource) return;
    const wasInitialized = state.handshakeComplete;
    state.handshakeComplete = true;
    state.hostSource = event.source;
    if (state.handshakeTimer) {
      window.clearTimeout(state.handshakeTimer);
      state.handshakeTimer = 0;
    }
    state.config = isRecord(payload.config) ? payload.config : {};
    hideRunError();
    elements.apiBase.textContent = resolveApiBase();
    updateLocale(extractLocaleCandidate(message));
    log(t("hostInit"));
    if (wasInitialized) {
      resetForIdentityChange(payload.token);
    } else {
      clearSceneSelection();
      setToken(payload.token);
      loadMyScenes({ resetPage: true });
    }
    return;
  }

  if (!state.handshakeComplete || event.source !== state.hostSource) return;

  if (message.type === "TOKEN_UPDATE") {
    const nextToken = typeof payload.token === "string" ? payload.token.trim() : "";
    const refreshIsPending =
      state.tokenRefreshWaiter?.handshakeSession === state.handshakeSession;
    if (refreshIsPending) {
      if (!nextToken) {
        log(t("tokenUpdated"));
        resetForIdentityChange("");
        return;
      }
      if (nextToken === state.token) return;
      if (hasSameJwtPrincipal(state.token, nextToken)) {
        log(t("tokenUpdated"));
        settleTokenRefreshWaiter(nextToken, true);
        return;
      }
      log(t("tokenUpdated"));
      resetForIdentityChange(nextToken);
      return;
    }
    if (nextToken === state.token) return;
    log(t("tokenUpdated"));
    resetForIdentityChange(nextToken);
    return;
  }

  if (message.type === "DESTROY") {
    destroyPreview();
  }
}

async function resetForIdentityChange(nextToken) {
  state.identityGeneration += 1;
  const generation = state.identityGeneration;
  clearIdentityState();
  setToken("");
  await stopScene({ focusPicker: false });
  if (generation !== state.identityGeneration) return;
  setToken(nextToken);
  loadMyScenes({ resetPage: true });
}

function normalizeSceneListItem(item) {
  if (!isRecord(item)) return null;
  const id = normalizePositiveSceneId(item.id);
  if (!id) return null;
  const imageUrl =
    typeof item.image === "string"
      ? item.image
      : isRecord(item.image) && typeof item.image.url === "string"
        ? item.image.url
        : "";
  let thumbnail = "";
  if (imageUrl) {
    try {
      thumbnail = normalizeAllowedAssetUrl(imageUrl, resolveAssetBaseOrigin());
    } catch {
      // A denied thumbnail must not break access to the scene list.
    }
  }
  return {
    id,
    name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : t("unnamedScene"),
    uuid: typeof item.uuid === "string" ? item.uuid : "",
    updatedAt:
      typeof item.updated_at === "string" || typeof item.updated_at === "number"
        ? item.updated_at
        : "",
    thumbnail,
  };
}

function normalizeSceneListPayload(json) {
  const data = unwrapApiData(json);
  const items = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.items)
      ? data.items
      : [];
  return items.map(normalizeSceneListItem).filter(Boolean);
}

function readPaginationHeader(response, name, fallback) {
  const raw = response.headers.get(name);
  if (raw === null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function formatSceneDate(value) {
  if (!value) return "";
  const numeric = Number(value);
  const date = new Date(Number.isFinite(numeric) && numeric > 0 && numeric < 1e12 ? numeric * 1000 : value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(currentLocaleCode(), {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

function sceneListMessage() {
  switch (state.sceneListStatus) {
    case "awaiting-host":
      return { text: t("awaitingHost"), tone: "" };
    case "loading":
      return { text: t("loadingScenes"), tone: "" };
    case "empty":
      return { text: t("noScenes"), tone: "" };
    case "search-empty":
      return { text: t("noSearchResults"), tone: "" };
    case "401":
      return { text: `${t("loginExpired")} (WGP-SCENE-LIST-401)`, tone: "error" };
    case "403":
      return { text: `${t("previewForbidden")} (WGP-SCENE-LIST-403)`, tone: "error" };
    case "handshake-error":
      return { text: `${t("handshakeFailed")} (WGP-HANDSHAKE)`, tone: "error" };
    case "error":
      return { text: `${t("sceneListError")} (WGP-SCENE-LIST)`, tone: "error" };
    default:
      return { text: "", tone: "" };
  }
}

function createSceneThumbnailPlaceholder() {
  const placeholder = document.createElement("span");
  placeholder.className = "scene-thumbnail-placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.textContent = "◇";
  return placeholder;
}

function renderScenePicker() {
  if (!elements.sceneSearch || !elements.sceneOptions) return;
  const message = sceneListMessage();
  elements.sceneListState.textContent = message.text;
  elements.sceneListState.dataset.tone = message.tone;
  elements.sceneListState.setAttribute(
    "role",
    message.tone === "error" ? "alert" : "status"
  );
  elements.sceneListState.setAttribute(
    "aria-live",
    message.tone === "error" ? "assertive" : "polite"
  );
  elements.sceneOptions.replaceChildren();

  for (const scene of state.scenes) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "scene-option";
    option.setAttribute("role", "option");
    option.dataset.sceneOption = String(scene.id);
    option.id = `scene-option-${scene.id}`;
    option.setAttribute("aria-selected", String(state.selectedSceneId === scene.id));

    if (scene.thumbnail) {
      const image = document.createElement("img");
      image.className = "scene-thumbnail";
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.crossOrigin = "anonymous";
      image.addEventListener(
        "error",
        () => image.replaceWith(createSceneThumbnailPlaceholder()),
        { once: true }
      );
      image.src = scene.thumbnail;
      option.append(image);
    } else {
      option.append(createSceneThumbnailPlaceholder());
    }

    const copy = document.createElement("span");
    copy.className = "scene-option-copy";
    const name = document.createElement("span");
    name.className = "scene-option-name";
    name.textContent = scene.name;
    const meta = document.createElement("span");
    meta.className = "scene-option-meta";
    const formattedDate = formatSceneDate(scene.updatedAt);
    meta.textContent = t("sceneOptionMeta", {
      id: scene.id,
      updated: formattedDate ? t("sceneUpdated", { date: formattedDate }) : "",
    });
    copy.append(name, meta);
    option.append(copy);

    const check = document.createElement("span");
    check.className = "scene-option-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = state.selectedSceneId === scene.id ? "✓" : "";
    option.append(check);
    option.addEventListener("click", () => selectScene(scene));
    elements.sceneOptions.append(option);
  }

  const awaiting = state.sceneListStatus === "awaiting-host";
  elements.sceneSearch.disabled = awaiting;
  elements.sceneToggle.disabled = awaiting;
  elements.sceneRetry.hidden = state.sceneListStatus !== "error";
  const hasPages = state.sceneListStatus === "ready" && state.scenePageCount > 1;
  elements.scenePagination.hidden = !hasPages;
  elements.scenePrevious.disabled = state.scenePage <= 1 || state.sceneListStatus === "loading";
  elements.sceneNext.disabled =
    state.scenePage >= state.scenePageCount || state.sceneListStatus === "loading";
  elements.scenePage.textContent = t("pageStatus", {
    page: state.scenePage,
    pages: state.scenePageCount,
    total: state.sceneTotalCount,
  });
  elements.scenePopover.hidden = !state.scenePickerOpen;
  elements.sceneSearch.setAttribute("aria-expanded", String(state.scenePickerOpen));
  elements.sceneToggle.setAttribute("aria-expanded", String(state.scenePickerOpen));
  renderControls();
}

function setScenePickerOpen(open) {
  state.scenePickerOpen = Boolean(open) && state.sceneListStatus !== "awaiting-host";
  renderScenePicker();
}

function selectScene(scene) {
  const id = normalizePositiveSceneId(scene?.id);
  if (!id) return;
  state.selectedSceneId = id;
  state.selectedScene = { ...scene, id };
  elements.sceneSearch.value = state.selectedScene.name || `#${id}`;
  if (elements.sceneId) elements.sceneId.value = String(id);
  transitionLifecycle(PREVIEW_LIFECYCLE.READY);
  setScenePickerOpen(false);
  setStatus(t("selectScene"), "ready");
}

function clearSceneSelection({ keepSearch = false } = {}) {
  state.selectedSceneId = null;
  state.selectedScene = null;
  if (elements.sceneId) elements.sceneId.value = "";
  if (!keepSearch && elements.sceneSearch) elements.sceneSearch.value = "";
  renderControls();
}

function abortSceneList() {
  state.sceneListGeneration += 1;
  state.sceneListController?.abort();
  state.sceneListController = null;
}

function focusSceneListError(generation) {
  window.setTimeout(() => {
    if (
      generation !== state.sceneListGeneration ||
      state.lifecycle !== PREVIEW_LIFECYCLE.TERMINAL_ERROR
    ) return;
    const target =
      state.sceneListStatus === "error"
        ? elements.sceneRetry
        : elements.sceneListState;
    target?.focus();
  }, 0);
}

function createRequestContext(externalSignal, timeoutMs = getRequestTimeoutMs()) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    cleanup() {
      window.clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

function abortReason(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  return new DOMException("The request was aborted", "AbortError");
}

function waitForRetryBackoff(delayMs, signal) {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function shouldRetryPlatformGet(error) {
  if (RETRYABLE_PLATFORM_STATUSES.has(Number(error?.status || 0))) return true;
  return /-(?:NETWORK|TIMEOUT)$/.test(String(error?.code || ""));
}

async function requestPlatformResponse(url, { signal, code = "WGP-API" } = {}) {
  if (!state.token) {
    throw new PreviewError(code, "Authentication required", {
      status: 401,
      retryable: false,
    });
  }
  if (!isAllowedPlatformRequestUrl(url)) {
    throw new PreviewError("WGP-API-ORIGIN", "Platform API origin denied", {
      retryable: false,
    });
  }

  let retryableFailures = 0;
  let retriedAfterTokenRefresh = false;
  while (true) {
    if (signal?.aborted) throw abortReason(signal);
    const requestToken = state.token;
    if (!requestToken) {
      throw new PreviewError(code, "Authentication required", {
        status: 401,
        retryable: false,
      });
    }
    const request = createRequestContext(signal);
    let failure = null;
    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: request.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${requestToken}`,
        },
      });
      if (!response.ok) {
        throw new PreviewError(code, `Platform API returned ${response.status}`, {
          status: response.status,
          retryable: ![401, 403, 404].includes(response.status),
        });
      }
      const json = await response.json();
      return { response, json };
    } catch (error) {
      if (signal?.aborted) throw abortReason(signal);
      if (request.didTimeOut()) {
        failure = new PreviewError(`${code}-TIMEOUT`, "Platform API request timed out");
      } else if (error instanceof PreviewError) {
        failure = error;
      } else if (error?.name === "AbortError") {
        throw error;
      } else if (error instanceof SyntaxError) {
        failure = new PreviewError(
          `${code}-INVALID-JSON`,
          "Platform API returned invalid JSON",
          { retryable: false }
        );
      } else {
        failure = new PreviewError(`${code}-NETWORK`, "Platform API network error");
      }
    } finally {
      request.cleanup();
    }

    if (Number(failure?.status || 0) === 401 && !retriedAfterTokenRefresh) {
      retriedAfterTokenRefresh = true;
      const refreshedToken = await requestTokenRefresh(signal);
      if (refreshedToken) continue;
    }

    retryableFailures += 1;
    const canRetry =
      retryableFailures < PLATFORM_GET_MAX_ATTEMPTS &&
      shouldRetryPlatformGet(failure);
    if (!canRetry) throw failure;
    await waitForRetryBackoff(
      PLATFORM_GET_RETRY_DELAY_MS * retryableFailures,
      signal
    );
  }
}

async function requestMyScenes({ page, search, signal }) {
  const url = resolvePlatformUrl("v1/verses");
  url.searchParams.set("sort", "-updated_at");
  url.searchParams.set("page", String(page));
  url.searchParams.set("per-page", String(SCENE_PAGE_SIZE));
  url.searchParams.set("expand", "image");
  if (search) url.searchParams.set("VerseSearch[name]", search);
  const { response, json } = await requestPlatformResponse(url, {
    signal,
    code: "WGP-SCENE-LIST",
  });
  const scenes = normalizeSceneListPayload(json);
  return {
    scenes,
    page: Math.max(1, readPaginationHeader(response, "X-Pagination-Current-Page", page)),
    pageCount: Math.max(1, readPaginationHeader(response, "X-Pagination-Page-Count", 1)),
    perPage: Math.max(1, readPaginationHeader(response, "X-Pagination-Per-Page", SCENE_PAGE_SIZE)),
    totalCount: readPaginationHeader(response, "X-Pagination-Total-Count", scenes.length),
  };
}

async function validateInitialSceneCandidate(generation) {
  const sceneId = normalizePositiveSceneId(state.initialSceneId);
  if (!sceneId) return;
  state.initialSceneId = null;
  const listed = state.scenes.find((scene) => scene.id === sceneId);
  if (listed) {
    selectScene(listed);
    return;
  }
  try {
    const scene = await requestVerse(sceneId, "lua", state.sceneListController?.signal);
    if (generation !== state.sceneListGeneration) return;
    selectScene(
      normalizeSceneListItem(scene) || { id: sceneId, name: `#${sceneId}` }
    );
  } catch (error) {
    if (error?.name !== "AbortError") {
      log("WGP-SCENE-DATA-URL", { status: Number(error?.status || 0) });
    }
  }
}

async function loadMyScenes({ resetPage = false } = {}) {
  if (!state.handshakeComplete) {
    transitionLifecycle(PREVIEW_LIFECYCLE.HANDSHAKE, { recoverTerminal: true });
    state.sceneListStatus = "awaiting-host";
    renderScenePicker();
    return;
  }
  if (!state.token) {
    transitionLifecycle(PREVIEW_LIFECYCLE.TERMINAL_ERROR);
    state.sceneListStatus = "401";
    state.scenes = [];
    setStatus(t("loginExpired"), "error");
    setScenePickerOpen(true);
    focusSceneListError(state.sceneListGeneration);
    return;
  }

  abortSceneList();
  if (
    !transitionLifecycle(PREVIEW_LIFECYCLE.SCENE_LIST, {
      recoverTerminal: true,
    })
  ) return;
  setStatus(t("loadingScenes"), "busy");
  const controller = new AbortController();
  state.sceneListController = controller;
  const generation = state.sceneListGeneration;
  if (resetPage) state.scenePage = 1;
  state.sceneListStatus = "loading";
  renderScenePicker();

  try {
    const result = await requestMyScenes({
      page: state.scenePage,
      search: state.sceneSearch,
      signal: controller.signal,
    });
    if (generation !== state.sceneListGeneration || controller.signal.aborted) return;
    state.scenes = result.scenes;
    state.scenePage = result.page;
    state.scenePageCount = result.pageCount;
    state.scenePerPage = result.perPage;
    state.sceneTotalCount = result.totalCount;
    state.sceneListStatus = result.scenes.length
      ? "ready"
      : state.sceneSearch
        ? "search-empty"
        : "empty";
    transitionLifecycle(PREVIEW_LIFECYCLE.READY);
    setStatus(t("selectScene"), "ready");
    renderScenePicker();
    await validateInitialSceneCandidate(generation);
  } catch (error) {
    if (controller.signal.aborted || generation !== state.sceneListGeneration) return;
    state.scenes = [];
    if (Number(error?.status) === 401) state.sceneListStatus = "401";
    else if (Number(error?.status) === 403) state.sceneListStatus = "403";
    else state.sceneListStatus = "error";
    transitionLifecycle(PREVIEW_LIFECYCLE.TERMINAL_ERROR);
    setStatus(
      state.sceneListStatus === "401"
        ? t("loginExpired")
        : state.sceneListStatus === "403"
          ? t("previewForbidden")
          : t("sceneListError"),
      "error"
    );
    log(
      state.sceneListStatus === "401"
        ? "WGP-SCENE-LIST-401"
        : state.sceneListStatus === "403"
          ? "WGP-SCENE-LIST-403"
          : "WGP-SCENE-LIST",
      { status: Number(error?.status || 0) }
    );
    setScenePickerOpen(true);
    focusSceneListError(generation);
  } finally {
    if (state.sceneListController === controller) state.sceneListController = null;
  }
}

function clearIdentityState() {
  settleTokenRefreshWaiter("");
  abortSceneList();
  state.runAbortController?.abort();
  state.runAbortController = null;
  if (state.sceneSearchTimer) {
    window.clearTimeout(state.sceneSearchTimer);
    state.sceneSearchTimer = 0;
  }
  state.scenes = [];
  state.sceneSearch = "";
  state.scenePage = 1;
  state.scenePageCount = 1;
  state.sceneTotalCount = 0;
  clearSceneSelection();
}

async function destroyPreview() {
  state.identityGeneration += 1;
  clearIdentityState();
  setToken("");
  state.handshakeComplete = false;
  state.hostSource = null;
  await stopScene({ focusPicker: false });
  transitionLifecycle(PREVIEW_LIFECYCLE.HANDSHAKE);
  state.sceneListStatus = "awaiting-host";
  setScenePickerOpen(false);
}

function cloneForUnityPreview(value) {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeUnityPreviewData(value) {
  if (typeof value !== "string") return cloneForUnityPreview(value);
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function readFirstString() {
  for (const value of arguments) {
    if (typeof value === "string") return value;
  }
  return "";
}

function readCodeObjectValue(value, language) {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  return readFirstString(value[language], value.script, value.code);
}

function readUnityPreviewMetaLuaCode(meta) {
  const record = isRecord(meta) ? meta : {};
  return readFirstString(
    readCodeObjectValue(record.code, "lua"),
    readCodeObjectValue(record.metaCode, "lua"),
    record.lua,
    record.script
  );
}

function readUnityPreviewMetaJavaScriptCode(meta) {
  const record = isRecord(meta) ? meta : {};
  return readFirstString(
    readCodeObjectValue(record.code, "js"),
    readCodeObjectValue(record.metaCode, "js"),
    record.js,
    record.script
  );
}

function normalizeLuaTable(code, name) {
  const script = typeof code === "string" ? code : "";
  const globalTablePattern = new RegExp(
    `^\\s*(?:_G\\.)?${name}\\s*=\\s*(?:_G\\.)?${name}\\s+or\\s*\\{\\}`
  );
  const localGlobalAliasPattern = new RegExp(
    `^\\s*local\\s+${name}\\s*=\\s*_G\\.${name}\\b`
  );

  if (globalTablePattern.test(script) || localGlobalAliasPattern.test(script)) {
    return script;
  }

  const localOnlyGuardPattern = new RegExp(
    `^\\s*local\\s+${name}\\s*=\\s*(?:(?:_G\\.)?${name}\\s+or\\s*)?\\{\\}\\s*\\n?`
  );
  const localIndexGuardPattern = /^\s*local\s+index\s*=\s*(["'])\s*\1\s*\n?/;
  const stripped = script
    .replace(localOnlyGuardPattern, "")
    .replace(localIndexGuardPattern, "");

  return `_G.${name} = _G.${name} or {}\nlocal ${name} = _G.${name}\n${stripped}`;
}

function readUnityPreviewVerseCode(runtimeData, language) {
  const record = isRecord(runtimeData) ? runtimeData : {};
  const verseCode = isRecord(record.verseCode) ? record.verseCode : {};
  const code = isRecord(record.code) ? record.code : {};
  const key = language === "javascript" ? "js" : "lua";
  const candidates = [
    verseCode[key],
    code[key],
    record[key],
    language === "javascript" ? record.javascript : undefined,
    typeof record.code === "string" ? record.code : undefined,
  ];
  const found = candidates.find((item) => typeof item === "string");
  return typeof found === "string" ? found : "";
}

function normalizeAllowedAssetUrl(value, assetBaseOrigin) {
  const normalizedValue = String(value || "").trim().replace(/\\\//g, "/");
  if (!normalizedValue || !ASSET_PATH_RE.test(normalizedValue)) return value;
  let url;
  try {
    url = new URL(normalizedValue, assetBaseOrigin || undefined);
  } catch {
    return value;
  }
  if (!isAllowedSecureOrigin(url, allowedAssetOrigins())) {
    throw new PreviewError("WGP-ASSET-DENIED", "Scene asset origin denied", {
      retryable: false,
    });
  }

  // Preserve validated absolute URLs byte-for-byte. Re-serializing them can
  // alter signed query encoding, Unicode, or repeated parameter representation.
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(normalizedValue)) {
    return normalizedValue;
  }
  if (normalizedValue.startsWith("//")) {
    return `${url.protocol}${normalizedValue}`;
  }
  return url.toString();
}

function rewriteStringUrls(value, assetBaseOrigin) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("{") || trimmed.startsWith("[")) &&
    trimmed.length >= 2
  ) {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      // Continue with plain string replacement.
    }
    if (parsed !== undefined) {
      rewriteUnityPreviewUrls(parsed, assetBaseOrigin);
      return JSON.stringify(parsed);
    }
  }

  return normalizeAllowedAssetUrl(value, assetBaseOrigin);
}

function rewriteUnityPreviewUrls(value, assetBaseOrigin) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === "string") {
        value[index] = rewriteStringUrls(item, assetBaseOrigin);
      } else {
        rewriteUnityPreviewUrls(item, assetBaseOrigin);
      }
    });
    return;
  }

  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === "string") {
      value[key] = rewriteStringUrls(item, assetBaseOrigin);
    } else {
      rewriteUnityPreviewUrls(item, assetBaseOrigin);
    }
  });
}

function collectSceneResourceCacheUrls(value, urls = new Set()) {
  if (!value) return urls;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return urls;
    try {
      const url = new URL(trimmed, resolveAssetBaseOrigin() || undefined);
      if (
        isAllowedSecureOrigin(url, allowedAssetOrigins()) &&
        ASSET_PATH_RE.test(url.pathname) &&
        !VIDEO_PATH_RE.test(url.pathname)
      ) {
        urls.add(url.toString());
      }
    } catch {
      // Ignore non-URL strings.
    }
    return urls;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectSceneResourceCacheUrls(item, urls));
    return urls;
  }

  if (typeof value === "object") {
    Object.values(value).forEach((item) =>
      collectSceneResourceCacheUrls(item, urls)
    );
  }

  return urls;
}

function warmSceneResourceCache(payload) {
  if (!("serviceWorker" in navigator)) return;

  const resources = [...collectSceneResourceCacheUrls(payload)];
  if (!resources.length) return;

  const message = {
    type: "warm-webgl-scene-resource-cache",
    sceneId: payload.scene.id,
    snapshotId: payload.scene.snapshotId,
    resources,
  };

  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message);
    return;
  }

  navigator.serviceWorker.ready
    .then((registration) => {
      if (registration.active) {
        registration.active.postMessage(message);
      }
    })
    .catch(() => {});
}

function normalizeUnityPreviewMetas(metas) {
  if (!Array.isArray(metas)) return [];
  return metas.map((meta) => {
    const cloned = cloneForUnityPreview(meta);
    const record = isRecord(cloned) ? cloned : {};
    const code = readUnityPreviewMetaLuaCode(record);
    const normalizedCode = normalizeLuaTable(code, "meta");
    return {
      ...record,
      code: normalizedCode,
      script: normalizedCode,
      prefab: record.prefab ?? record.prefabs ?? 0,
    };
  });
}

function unwrapApiData(json) {
  if (json && typeof json === "object" && "success" in json && "data" in json) {
    return json.data;
  }
  return json;
}

async function requestVerse(sceneId, cl, signal) {
  const id = normalizePositiveSceneId(sceneId);
  if (!id) {
    throw new PreviewError("WGP-SCENE-DATA", "Invalid scene id", {
      retryable: false,
    });
  }
  const url = resolvePlatformUrl(`v1/verses/${id}`);
  url.searchParams.set("expand", UNITY_PREVIEW_VERSE_EXPAND);
  url.searchParams.set("cl", cl);
  const { json } = await requestPlatformResponse(url, {
    signal,
    code: "WGP-SCENE-DATA",
  });
  return unwrapApiData(json);
}

function buildPayload(sceneId, runtimeData, scriptRuntimeData) {
  const luaCode = readUnityPreviewVerseCode(runtimeData, "lua");
  const jsCode = readUnityPreviewVerseCode(scriptRuntimeData, "javascript");
  const metasJavaScript = ((scriptRuntimeData?.metas ?? []) || [])
    .map((item) => readUnityPreviewMetaJavaScriptCode(item))
    .join("\n");

  const payload = {
    protocolVersion: 1,
    source: "webgl-preview-plugin",
    sceneType: "verse",
    scene: {
      id: runtimeData?.verse_id ?? runtimeData?.id ?? sceneId,
      snapshotId: runtimeData?.verse_id ? runtimeData?.id : null,
      uuid: runtimeData?.uuid ?? null,
      name: runtimeData?.name ?? "",
      description: runtimeData?.description ?? "",
      data: normalizeUnityPreviewData(runtimeData?.data ?? null),
    },
    resources: cloneForUnityPreview(runtimeData?.resources ?? []),
    metas: normalizeUnityPreviewMetas(runtimeData?.metas ?? []),
    script: {
      blockly: null,
      lua: normalizeLuaTable(luaCode, "verse"),
      javascript: jsCode,
      metasJavaScript,
    },
  };

  rewriteUnityPreviewUrls(payload, resolveAssetBaseOrigin());

  return payload;
}

function updateSummary(payload) {
  elements.sceneName.textContent =
    payload.scene.name || payload.scene.uuid || String(payload.scene.id);
  elements.resourceCount.textContent = String(payload.resources.length);
  elements.metaCount.textContent = String(payload.metas.length);
  elements.luaLength.textContent = String(payload.script.lua.length);
}

function postScenePayloadToUnity(payload) {
  if (!state.frameOrigin || !state.frameSession || !elements.frame.contentWindow) return;
  elements.frame.contentWindow.postMessage(
    {
      type: "load-scene-json",
      session: state.frameSession,
      payload,
    },
    state.frameOrigin
  );
}

function sendPayloadToUnity(payload) {
  if (state.stopped) {
    state.pendingRun = true;
    return;
  }

  if (!state.frameReady || !elements.frame.contentWindow) {
    state.pendingRun = true;
    return;
  }

  postScenePayloadToUnity(payload);
  state.pendingRun = false;
  log(t("payloadSent"), {
    sceneId: payload.scene.id,
    resources: payload.resources.length,
    metas: payload.metas.length,
  });
}

function isUnityFrameStopped() {
  return !elements.frame.src || elements.frame.src === "about:blank";
}

function startRunAttempt() {
  state.runAbortController?.abort();
  state.runSerial += 1;
  return state.runSerial;
}

function isCurrentRunAttempt(runSerial) {
  return runSerial === state.runSerial && !state.stopped && !state.runTerminal;
}

function unloadUnityFrame() {
  state.frameReady = false;
  state.pendingRun = false;
  state.cacheActive = false;
  state.sceneVisible = false;
  state.frameSession = "";
  state.frameOrigin = "";
  state.payload = null;
  elements.frame.src = "about:blank";
}

function hideRunError() {
  if (elements.runError) elements.runError.hidden = true;
  if (elements.runRetry) elements.runRetry.hidden = false;
}

function runErrorPresentation(error) {
  const status = Number(error?.status || 0);
  if (/^WGP-(?:HANDSHAKE|CONFIG|API-ORIGIN)/.test(String(error?.code || ""))) {
    return { code: error.code, title: t("handshakeFailed") };
  }
  if (error?.code === "WGP-ASSET-DENIED") {
    return { code: "WGP-ASSET-DENIED", title: t("sceneDataFailed") };
  }
  if (status === 401) {
    return { code: "WGP-SCENE-DATA-401", title: t("sceneDataUnauthorized") };
  }
  if (status === 403) {
    return { code: "WGP-SCENE-DATA-403", title: t("sceneDataForbidden") };
  }
  if (status === 404) {
    return { code: "WGP-SCENE-DATA-404", title: t("sceneDataNotFound") };
  }
  return { code: error?.code || "WGP-SCENE-DATA", title: t("sceneDataFailed") };
}

function showRunError(error) {
  const presentation = runErrorPresentation(error);
  transitionLifecycle(PREVIEW_LIFECYCLE.TERMINAL_ERROR);
  state.running = false;
  state.sceneLoading = false;
  state.sceneResourceLoading = false;
  state.cacheActive = false;
  setStatus(t("runFailed"), "error");
  setLoadingShield(false);
  clearLoadingProgress();
  if (elements.runError) {
    elements.runErrorTitle.textContent = presentation.title;
    elements.runErrorCode.textContent = presentation.code;
    elements.runRetry.hidden = error?.retryable === false;
    elements.runError.hidden = false;
    window.setTimeout(() => elements.runError.focus(), 0);
  }
  log(presentation.code, { status: Number(error?.status || 0) });
  renderControls();
}

async function runScene() {
  const sceneId = normalizePositiveSceneId(state.selectedSceneId);
  if (!sceneId) {
    setStatus(t("enterValidSceneId"), "error");
    state.sceneLoading = false;
    state.sceneResourceLoading = false;
    state.cacheActive = false;
    setLoadingShield(false);
    clearLoadingProgress();
    renderControls();
    (state.allowManualSceneId ? elements.sceneId : elements.sceneSearch)?.focus();
    return;
  }

  const runSerial = startRunAttempt();
  if (
    !transitionLifecycle(PREVIEW_LIFECYCLE.LOADING_SCENE, {
      recoverTerminal: true,
    })
  ) return;
  const runController = new AbortController();
  state.runAbortController = runController;
  hideRunError();
  state.stopped = false;
  state.payload = null;
  state.sceneVisible = false;
  state.sceneResourceLoading = false;
  state.running = true;
  state.sceneLoading = true;
  setControlsBusy(true);
  setStatus(t("readingScene"), "busy");
  setLocalizedLoadingShield(true, "loadingScene", "readingSceneDetail", { sceneId });
  log(t("sceneReadStart", { sceneId }));

  try {
    const [runtimeData, scriptRuntimeData] = await Promise.all([
      requestVerse(sceneId, "lua", runController.signal),
      requestVerse(sceneId, "js", runController.signal),
    ]);
    if (!isCurrentRunAttempt(runSerial)) {
      return;
    }
    setLocalizedLoadingShield(true, "preparingScene", "preparingSceneDetail");
    const payload = buildPayload(sceneId, runtimeData, scriptRuntimeData);
    if (!isCurrentRunAttempt(runSerial)) {
      return;
    }
    if (!isUnityFrameStopped()) unloadUnityFrame();
    state.payload = payload;
    updateSummary(payload);
    warmSceneResourceCache(payload);
    setStatus(t("sendingUnity"), "busy");
    if (!transitionLifecycle(PREVIEW_LIFECYCLE.STARTING_RUNNER)) return;
    setLocalizedLoadingShield(true, "startingScene", "startingSceneDetail");
    loadUnityFrame({ autoRun: true });
    sendPayloadToUnity(payload);
  } catch (error) {
    if (runController.signal.aborted || runSerial !== state.runSerial) return;
    runController.abort(error);
    showRunError(error);
  } finally {
    if (state.runAbortController === runController) state.runAbortController = null;
    if (runSerial === state.runSerial) {
      setControlsBusy(false);
      hideLoadingShieldIfReady();
    }
  }
}

function readInitialSceneId() {
  const query = readQuery();
  state.initialSceneId = normalizePositiveSceneId(
    query.get("sceneId") || query.get("id") || ""
  );
}

function loadUnityFrame({ clearPayload = false, autoRun = false } = {}) {
  const frameSession = genId("unity");
  state.frameSession = frameSession;
  state.stopped = false;
  state.frameReady = false;
  setLoadingProgressMode("plugin-load");
  if (clearPayload) {
    state.payload = null;
  }
  if (autoRun) {
    state.pendingRun = true;
  }
  setLocalizedLoadingShield(true, "loadingPlugin", "loadingPluginDetail");
  const frameUrl = new URL("./embed.html", window.location.href);
  state.frameOrigin = frameUrl.origin;
  frameUrl.searchParams.set("embed", "1");
  frameUrl.searchParams.set("plugin", "1");
  frameUrl.searchParams.set("v", WEBGL_PREVIEW_VERSION);
  frameUrl.searchParams.set("session", frameSession);
  frameUrl.searchParams.set("lang", readQuery().get("lang") || document.documentElement.lang);
  frameUrl.searchParams.set("loaderTimeoutMs", String(getUnityLoaderTimeoutMs()));
  frameUrl.searchParams.set("maxDpr", String(getMaxDevicePixelRatio()));
  elements.frame.src = frameUrl.toString();
}

function disposeUnityFrame() {
  if (
    isUnityFrameStopped() ||
    !elements.frame.contentWindow ||
    !state.frameSession ||
    !state.frameOrigin
  ) {
    unloadUnityFrame();
    return Promise.resolve();
  }

  const session = state.frameSession;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      if (state.disposeWaiter?.session !== session) return;
      state.disposeWaiter = null;
      log("WGP-DISPOSE-TIMEOUT");
      unloadUnityFrame();
      resolve();
    }, getDisposeTimeoutMs());
    state.disposeWaiter = {
      session,
      resolve() {
        window.clearTimeout(timer);
        if (state.disposeWaiter?.session === session) state.disposeWaiter = null;
        unloadUnityFrame();
        resolve();
      },
    };
    elements.frame.contentWindow.postMessage(
      { type: "webgl-preview-dispose", session },
      state.frameOrigin
    );
  });
}

async function stopScene({ focusPicker = true } = {}) {
  startRunAttempt();
  transitionLifecycle(PREVIEW_LIFECYCLE.STOPPING, { recoverTerminal: true });
  state.runAbortController?.abort();
  state.runAbortController = null;
  state.stopped = true;
  state.running = false;
  state.sceneVisible = false;
  state.sceneLoading = false;
  state.sceneResourceLoading = false;
  setControlsBusy(true);
  try {
    await disposeUnityFrame();
  } finally {
    setControlsBusy(false);
  }
  transitionLifecycle(PREVIEW_LIFECYCLE.STOPPED);
  hideRunError();
  setStatus(t("selectScene"), "ready");
  setLoadingShield(false);
  renderControls();
  log(t("stopped"));
  if (focusPicker) elements.sceneSearch?.focus();
}

async function rerunScene() {
  if (!normalizePositiveSceneId(state.selectedSceneId)) {
    elements.sceneSearch?.focus();
    setStatus(t("selectScene"), "error");
    return;
  }
  await stopScene({ focusPicker: false });
  await runScene();
}

function setupFrame() {
  elements.frame.addEventListener("load", () => {
    if (state.stopped || elements.frame.src === "about:blank") {
      return;
    }
    log(t("iframeLoaded"));
  });

  window.addEventListener("message", (event) => {
    if (
      event.source !== elements.frame.contentWindow ||
      !state.frameOrigin ||
      event.origin !== state.frameOrigin
    ) return;
    const message = event.data || {};
    if (!isRecord(message) || message.session !== state.frameSession) return;
    if (message.type === "webgl-preview-disposed") {
      state.disposeWaiter?.resolve();
      return;
    }
    if (message.type === "webgl-preview-dispose-error") {
      log(message.code || "WGP-DISPOSE");
      state.disposeWaiter?.resolve();
      return;
    }
    if (state.lifecycle === PREVIEW_LIFECYCLE.TERMINAL_ERROR) return;
    if (
      message.type === "unity-web-preview-error" ||
      message.type === "webgl-preview-error"
    ) {
      showRunError(
        new PreviewError(message.code || "WGP-UNITY-LOAD", "Unity runner failed")
      );
      return;
    }
    if (message.type === "unity-web-preview-ready") {
      if (
        state.stopped ||
        state.lifecycle !== PREVIEW_LIFECYCLE.STARTING_RUNNER
      ) {
        return;
      }
      state.frameReady = true;
      log(t("runnerReady"));
      if (!state.running) {
        setStatus(t("selectScene"), "ready");
        clearLoadingProgress();
      }
      if (state.payload) {
        sendPayloadToUnity(state.payload);
      }
      hideLoadingShieldIfReady();
    }
    if (message.type === "unity-web-preview-scene-forwarded") {
      if (
        !state.running ||
        state.lifecycle !== PREVIEW_LIFECYCLE.STARTING_RUNNER
      ) return;
      state.sceneLoading = false;
      state.sceneResourceLoading = true;
      setStatus(t("sceneResourceLoading"), "busy");
      startSceneResourceProgress();
      hideLoadingShieldIfReady();
      log(t("runnerAccepted"), { length: message.length });
    }
    if (message.type === "unity-web-preview-scene-visible") {
      if (
        !state.running ||
        !transitionLifecycle(PREVIEW_LIFECYCLE.RUNNING, {
          runSession: message.session,
        })
      ) {
        return;
      }
      state.sceneVisible = true;
      state.sceneLoading = false;
      state.sceneResourceLoading = false;
      setLoadingShield(false);
      clearLoadingProgress();
      renderControls();
    }
    if (message.type === "webgl-preview-loading") {
      if (message.visible) {
        if (state.sceneVisible) {
          setLoadingShield(false);
          return;
        }
        setRemoteLoadingShield(message);
      } else {
        hideLoadingShieldIfReady();
      }
    }
    if (message.type === "webgl-preview-cache-status") {
      const isBackgroundCache =
        message.background === true || String(message.status).startsWith("background-");
      if (
        isBackgroundCache &&
        (message.status === "background-started" ||
          message.status === "background-progress")
      ) {
        state.cacheActive = false;
        hideLoadingShieldIfReady();
        return;
      }
      if (
        message.status === "started" ||
        message.status === "fetching" ||
        message.status === "progress" ||
        message.status === "background-started" ||
        message.status === "background-progress"
      ) {
        state.cacheActive = true;
        const completed = Number(message.completed || 0);
        const total = Number(message.total || 0);
        const resourceLabel = safeResourceLabel(message.path);
        const path = resourceLabel ? `：${resourceLabel}` : "";
        const percent = formatPercent(completed, total);
        setLocalizedLoadingShield(true, "cachePlugin", "cacheDetail", {
          percent,
          actionKey: message.reused ? "cacheReuse" : "cachePrepare",
          completed,
          total,
          path,
        });
      }

      if (
        message.status === "complete" ||
        message.status === "incomplete" ||
        message.status === "cancelled"
      ) {
        state.cacheActive = false;
        hideLoadingShieldIfReady();
        if (message.status === "incomplete") {
          log(t("cacheFailed"), { code: "WGP-CACHE-INCOMPLETE" });
        }
      }

      if (message.status === "error") {
        state.cacheActive = false;
        setLoadingShield(false);
        log(t("cacheFailed"), { code: "WGP-CACHE" });
      }
    }
  });
}

function toggleFullscreenPreview() {
  const target = document.querySelector(".viewer") || document.documentElement;
  const postHostFullscreenRequest = () => {
    if (window.parent && window.parent !== window) {
      const payload = {
        type: "webgl-preview-request-fullscreen",
        source: "webgl-preview",
        plugin: PLUGIN_ID,
        payload: { handshakeSession: state.handshakeSession },
      };
      postToHost(payload);
      postToHost({ ...payload, type: "plugin-request-fullscreen" });
    }
  };
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  if (target.requestFullscreen) {
    const request = target.requestFullscreen({ navigationUI: "hide" });
    if (request && typeof request.catch === "function") {
      request.catch(postHostFullscreenRequest);
    }
    postHostFullscreenRequest();
    return;
  }
  postHostFullscreenRequest();
}

function setupControls() {
  elements.run.addEventListener("click", runScene);
  elements.stop.addEventListener("click", () => stopScene());
  elements.reload.addEventListener("click", rerunScene);
  elements.fullscreen?.addEventListener("click", toggleFullscreenPreview);
  elements.runRetry?.addEventListener("click", runScene);
  elements.runReturn?.addEventListener("click", async () => {
    await stopScene({ focusPicker: false });
    setScenePickerOpen(true);
    elements.sceneSearch?.focus();
  });

  const useDevelopmentToken = () => {
    if (!state.allowDevelopmentToken) return;
    const nextToken = elements.tokenInput?.value || "";
    if (elements.tokenInput) elements.tokenInput.value = "";
    state.handshakeComplete = true;
    resetForIdentityChange(nextToken).then(() => {
      log(nextToken ? t("tokenSaved") : t("tokenCleared"));
    });
  };
  elements.saveToken?.addEventListener("click", useDevelopmentToken);
  elements.tokenInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") useDevelopmentToken();
  });

  elements.sceneId.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      runScene();
    }
  });
  elements.sceneId.addEventListener("input", () => {
    if (!state.allowManualSceneId) return;
    const sceneId = normalizePositiveSceneId(elements.sceneId.value);
    state.selectedSceneId = sceneId;
    state.selectedScene = sceneId ? { id: sceneId, name: `#${sceneId}` } : null;
    if (sceneId) transitionLifecycle(PREVIEW_LIFECYCLE.READY);
    renderControls();
  });

  elements.sceneSearch.addEventListener("focus", () => setScenePickerOpen(true));
  elements.sceneSearch.addEventListener("input", () => {
    clearSceneSelection({ keepSearch: true });
    state.sceneSearch = elements.sceneSearch.value.trim();
    state.scenePage = 1;
    if (state.sceneSearchTimer) window.clearTimeout(state.sceneSearchTimer);
    state.sceneSearchTimer = window.setTimeout(() => {
      state.sceneSearchTimer = 0;
      loadMyScenes({ resetPage: true });
    }, SCENE_SEARCH_DEBOUNCE_MS);
  });
  elements.sceneSearch.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setScenePickerOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setScenePickerOpen(true);
      elements.sceneOptions.querySelector("[data-scene-option]")?.focus();
    }
  });
  elements.sceneToggle.addEventListener("click", () => {
    setScenePickerOpen(!state.scenePickerOpen);
    if (state.scenePickerOpen) elements.sceneSearch.focus();
  });
  elements.sceneOptions.addEventListener("keydown", (event) => {
    const options = [...elements.sceneOptions.querySelectorAll("[data-scene-option]")];
    const currentIndex = options.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setScenePickerOpen(false);
      elements.sceneSearch.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(options.length - 1, currentIndex + delta));
    options[nextIndex]?.focus();
  });
  elements.sceneRetry.addEventListener("click", () => loadMyScenes());
  elements.scenePrevious.addEventListener("click", () => {
    if (state.scenePage <= 1) return;
    state.scenePage -= 1;
    loadMyScenes();
  });
  elements.sceneNext.addEventListener("click", () => {
    if (state.scenePage >= state.scenePageCount) return;
    state.scenePage += 1;
    loadMyScenes();
  });
  elements.manualMode?.addEventListener("toggle", () => {
    if (elements.manualMode.open) setScenePickerOpen(false);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!state.scenePickerOpen || elements.scenePicker.contains(event.target)) return;
    setScenePickerOpen(false);
  });
}

function setupLocaleSync() {
  let lastSearch = window.location.search;
  const syncFromUrl = () => {
    if (window.location.search === lastSearch) return;
    lastSearch = window.location.search;
    updateLocale(readQuery().get("lang"));
  };

  window.addEventListener("popstate", syncFromUrl);
  window.addEventListener("hashchange", syncFromUrl);
  window.addEventListener("focus", syncFromUrl);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncFromUrl();
  });

  const patchHistory = (name) => {
    const original = window.history[name];
    window.history[name] = function patchedHistoryState(...args) {
      const result = original.apply(this, args);
      syncFromUrl();
      return result;
    };
  };
  patchHistory("pushState");
  patchHistory("replaceState");
}

async function init() {
  transitionLifecycle(PREVIEW_LIFECYCLE.HANDSHAKE);
  state.locale = resolveLocale();
  applyI18n();
  readInitialSceneId();
  state.handshakeSession = genId("handshake");
  if (elements.version) {
    elements.version.textContent = `v${WEBGL_PREVIEW_VERSION}`;
  }
  setupControls();
  setupLocaleSync();
  setupFrame();
  state.sceneListStatus = "awaiting-host";
  setStatus(t("awaitingHost"), "busy");
  renderControls();
  renderScenePicker();
  log(t("opened"));

  try {
    await loadRuntimeConfig();
    elements.apiBase.textContent = resolveApiBase();
    applyI18n();
  } catch (error) {
    state.sceneListStatus = "handshake-error";
    showRunError(error);
    return;
  }

  if (window.parent === window && isExplicitLocalDevelopment()) {
    state.handshakeComplete = true;
    state.config = state.runtimeConfig;
    state.sceneListStatus = "401";
    transitionLifecycle(PREVIEW_LIFECYCLE.READY);
    setStatus(t("selectScene"), "ready");
    setScenePickerOpen(true);
    return;
  }

  state.hostOrigin = resolveTrustedHostOrigin();
  if (!state.hostOrigin || window.parent === window) {
    state.sceneListStatus = "handshake-error";
    showRunError(
      new PreviewError("WGP-HANDSHAKE-ORIGIN", t("handshakeFailed"), {
        retryable: false,
      })
    );
    return;
  }

  state.handshakeTimer = window.setTimeout(() => {
    if (state.handshakeComplete) return;
    state.sceneListStatus = "handshake-error";
    showRunError(
      new PreviewError("WGP-HANDSHAKE-TIMEOUT", t("handshakeFailed"), {
        retryable: false,
      })
    );
  }, getHandshakeTimeoutMs());
  window.addEventListener("message", handleHostMessage);
  postPluginReady();
}

window.addEventListener("pagehide", () => {
  state.identityGeneration += 1;
  clearIdentityState();
  unloadUnityFrame();
  setToken("");
});

init();
