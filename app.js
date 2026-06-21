(function () {
    const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
    const SELECTED_CLASS_KEY = "mwrace_selected_class_v4";
    const PROGRESS_PREFIX = "mwrace_progress_";
    const THEME_KEY = "mwrace_theme_v1";
    const GUEST_TEAM_NAMES_KEY = "mwrace_guest_team_names_v1";
    const GUEST_CLASS_ID = "guest-class";
    const GUEST_GROUP_POOL = ["雷霆队", "星火队", "银河队", "疾风队", "猛虎队", "飞鸟队", "先锋队", "闪电队", "勇者队", "奇迹队", "火箭队", "胜利队"];

    const state = {
        config: null,
        client: null,
        session: null,
        user: null,
        authListener: null,
        classes: [],
        allGroups: [],
        groups: [],
        selectedClassId: GUEST_CLASS_ID,
        totalSteps: 5,
        raceProgress: {},
        isRaceActive: true,
        currentWinnerId: null,
        bonusPoints: 0,
        lastActiveGroupId: null,
        configLoaded: false,
        guestTeamNames: [],
        authMode: "login"
    };

    let supabaseImportPromise = null;
    let toastTimer = null;

    const $ = (selector) => document.querySelector(selector);

    const els = {
        syncStatus: $("#syncStatus"),
        accountState: $("#accountState"),
        reloadBtn: $("#reloadBtn"),
        themeToggleBtn: $("#themeToggleBtn"),
        openSettingsBtn: $("#openSettingsBtn"),
        closeSettingsBtn: $("#closeSettingsBtn"),
        settingsOverlay: $("#settingsOverlay"),
        classSelect: $("#classSelect"),
        authLoginModeBtn: $("#authLoginModeBtn"),
        authRegisterModeBtn: $("#authRegisterModeBtn"),
        authModeHint: $("#authModeHint"),
        authEmail: $("#authEmail"),
        authPassword: $("#authPassword"),
        authSubmitBtn: $("#authSubmitBtn"),
        signOutBtn: $("#signOutBtn"),
        classForm: $("#classForm"),
        classNameInput: $("#classNameInput"),
        classList: $("#classList"),
        classCount: $("#classCount"),
        guestTeamForm: $("#guestTeamForm"),
        guestTeamNamesInput: $("#guestTeamNamesInput"),
        selectedClassTitle: $("#selectedClassTitle"),
        stepsInput: $("#stepsInput"),
        restartRaceBtn: $("#restartRaceBtn"),
        clearPointsBtn: $("#clearPointsBtn"),
        trackContainer: $("#trackContainer"),
        emptyRaceState: $("#emptyRaceState"),
        emptyRaceTitle: $("#emptyRaceTitle"),
        emptyRaceCopy: $("#emptyRaceCopy"),
        groupForm: $("#groupForm"),
        groupNameInput: $("#groupNameInput"),
        groupList: $("#groupList"),
        scoreList: $("#scoreList"),
        winnerModal: $("#winnerModal"),
        winnerTitle: $("#winnerTitle"),
        bonusStepOne: $("#bonusStepOne"),
        bonusStepTwo: $("#bonusStepTwo"),
        rollPointsBtn: $("#rollPointsBtn"),
        collectPointsBtn: $("#collectPointsBtn"),
        pointsDisplay: $("#pointsDisplay"),
        toast: $("#toast")
    };

    window.addEventListener("DOMContentLoaded", init);

    async function init() {
        state.totalSteps = 5;
        localStorage.removeItem("mwrace_total_steps_v2");
        els.stepsInput.value = String(state.totalSteps);
        applySavedTheme();
        loadGuestSettings();
        bindEvents();
        setupGuestRace();
        renderAll();

        await loadSupabaseConfig();
        if (state.config) await initializeSupabase();
        await loadData();

        document.addEventListener("contextmenu", (event) => {
            if (event.target.closest(".car-wrapper")) event.preventDefault();
        });
    }

    function bindEvents() {
        els.reloadBtn.addEventListener("click", () => loadData());
        els.themeToggleBtn.addEventListener("click", toggleTheme);
        els.openSettingsBtn.addEventListener("click", openSettings);
        els.closeSettingsBtn.addEventListener("click", closeSettings);
        els.settingsOverlay.addEventListener("click", (event) => {
            if (event.target === els.settingsOverlay) closeSettings();
        });
        els.classSelect.addEventListener("change", () => selectClass(els.classSelect.value));
        els.authLoginModeBtn.addEventListener("click", () => setAuthMode("login"));
        els.authRegisterModeBtn.addEventListener("click", () => setAuthMode("register"));
        els.authSubmitBtn.addEventListener("click", submitAuthForm);
        els.authEmail.addEventListener("input", clearAuthPassword);
        els.signOutBtn.addEventListener("click", signOut);
        els.classForm.addEventListener("submit", createClassFromForm);
        els.guestTeamForm.addEventListener("submit", applyGuestTeamSettings);
        els.groupForm.addEventListener("submit", createGroupFromForm);
        els.restartRaceBtn.addEventListener("click", () => restartRace(false));
        els.clearPointsBtn.addEventListener("click", clearPointsForSelectedClass);
        els.stepsInput.addEventListener("change", updateTotalSteps);
        els.rollPointsBtn.addEventListener("click", rollPoints);
        els.collectPointsBtn.addEventListener("click", collectBonus);
        window.addEventListener("resize", () => requestAnimationFrame(updateAllCarPositions));
    }

    async function loadSupabaseConfig() {
        state.configLoaded = true;

        if (window.MWRACE_SUPABASE_CONFIG && window.MWRACE_SUPABASE_CONFIG.url && window.MWRACE_SUPABASE_CONFIG.anonKey) {
            state.config = window.MWRACE_SUPABASE_CONFIG;
            return;
        }

        try {
            const response = await fetch("/api/config", { cache: "no-store" });
            if (!response.ok) return;
            const config = await response.json();
            if (config && config.url && config.anonKey) {
                state.config = { url: config.url, anonKey: config.anonKey };
            }
        } catch (error) {
            state.config = null;
        }
    }

    function applySavedTheme() {
        const theme = window.location.hash === "#light" || localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
        document.body.classList.toggle("theme-light", theme === "light");
        updateThemeButton(theme);
    }

    function toggleTheme() {
        const nextTheme = document.body.classList.contains("theme-light") ? "dark" : "light";
        localStorage.setItem(THEME_KEY, nextTheme);
        document.body.classList.toggle("theme-light", nextTheme === "light");
        updateThemeButton(nextTheme);
    }

    function updateThemeButton(theme) {
        const label = theme === "light" ? "切换到暗色主题" : "切换到淡色主题";
        els.themeToggleBtn.classList.toggle("is-light-theme", theme === "light");
        els.themeToggleBtn.setAttribute("aria-label", label);
        els.themeToggleBtn.title = label;
    }

    async function initializeSupabase() {
        if (!state.config) return;

        try {
            if (!supabaseImportPromise) supabaseImportPromise = import(SUPABASE_JS_URL);
            const { createClient } = await supabaseImportPromise;
            state.client = createClient(state.config.url, state.config.anonKey);

            const sessionResult = await state.client.auth.getSession();
            if (sessionResult.error) throw sessionResult.error;
            state.session = sessionResult.data.session;
            state.user = state.session ? state.session.user : null;

            unsubscribeAuthListener();
            const listenerResult = state.client.auth.onAuthStateChange((_event, session) => {
                state.session = session;
                state.user = session ? session.user : null;
                clearAuthPassword();
                loadData();
            });
            state.authListener = listenerResult.data.subscription;
        } catch (error) {
            state.client = null;
            state.session = null;
            state.user = null;
            toast(`云端初始化失败：${friendlyError(error)}`, "error");
        }
    }

    function setAuthMode(mode) {
        state.authMode = mode === "register" ? "register" : "login";
        clearAuthPassword();
        updateAuthModeView();
    }

    function submitAuthForm() {
        if (state.authMode === "register") {
            signUp();
            return;
        }
        signIn();
    }

    function clearAuthPassword() {
        if (els.authPassword) els.authPassword.value = "";
    }

    function updateAuthModeView() {
        const isRegister = state.authMode === "register";
        const signedIn = isSignedIn();
        els.authLoginModeBtn.classList.toggle("is-active", !isRegister);
        els.authRegisterModeBtn.classList.toggle("is-active", isRegister);
        els.authLoginModeBtn.setAttribute("aria-selected", String(!isRegister));
        els.authRegisterModeBtn.setAttribute("aria-selected", String(isRegister));
        els.authPassword.setAttribute("autocomplete", isRegister ? "new-password" : "current-password");
        els.authSubmitBtn.textContent = isRegister ? "注册账号" : "登录";
        els.authSubmitBtn.classList.toggle("secondary-button", isRegister);
        els.authSubmitBtn.classList.toggle("primary-button", !isRegister);
        let hint = "使用已有邮箱登录，继续管理你的班级和历史总分。";
        if (isRegister) hint = "注册新邮箱前请先退出当前账号；已注册邮箱请直接切回登录。";
        if (signedIn) hint = "当前账号已登录；切换账号或注册新账号前，请先退出。";
        els.authModeHint.textContent = hint;
    }

    function unsubscribeAuthListener() {
        if (state.authListener && state.authListener.unsubscribe) {
            state.authListener.unsubscribe();
        }
        state.authListener = null;
    }

    async function signIn() {
        if (!ensureCloudReady()) return;
        const email = normalizeEmail(els.authEmail.value);
        const password = els.authPassword.value;
        if (!email || !password) {
            toast("请填写邮箱和密码。", "error");
            return;
        }

        const { error } = await state.client.auth.signInWithPassword({ email, password });
        clearAuthPassword();
        if (error) {
            toast(`登录失败：${friendlyError(error)}`, "error");
            return;
        }
        toast("登录成功，正在加载你的班级。");
    }

    async function signUp() {
        if (!ensureCloudReady()) {
            clearAuthPassword();
            return;
        }
        if (isSignedIn()) {
            clearAuthPassword();
            toast("注册新账号前，请先退出当前账号。", "error");
            return;
        }

        const email = normalizeEmail(els.authEmail.value);
        const password = els.authPassword.value;
        if (!email || !password) {
            clearAuthPassword();
            toast("请填写邮箱和密码。", "error");
            return;
        }
        if (password.length < 6) {
            clearAuthPassword();
            toast("密码至少需要 6 位。", "error");
            return;
        }

        const { data, error } = await state.client.auth.signUp({ email, password });
        clearAuthPassword();
        if (error) {
            if (isDuplicateEmailError(error)) {
                setAuthMode("login");
                els.authEmail.value = email;
                toast("这个邮箱已经注册过，请直接登录。", "error");
                return;
            }
            toast(`注册失败：${friendlyError(error)}`, "error");
            return;
        }

        if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            setAuthMode("login");
            els.authEmail.value = email;
            toast("这个邮箱已经注册过，请直接登录。", "error");
            return;
        }

        toast("注册成功。如项目开启邮箱验证，请先完成验证后登录。");
    }

    function normalizeEmail(value) {
        return String(value || "").trim().toLowerCase();
    }

    function isDuplicateEmailError(error) {
        const message = `${error && error.message ? error.message : ""} ${error && error.code ? error.code : ""}`.toLowerCase();
        return message.includes("already registered")
            || message.includes("already been registered")
            || message.includes("user already")
            || message.includes("email_exists");
    }

    async function signOut() {
        clearAuthPassword();
        if (!state.client) return;
        const { error } = await state.client.auth.signOut();
        if (error) {
            toast(`退出失败：${friendlyError(error)}`, "error");
            return;
        }
        state.session = null;
        state.user = null;
        setupGuestRace();
        renderAll();
        toast("已退出账号，回到游客模式。");
    }

    function ensureCloudReady() {
        if (!state.client) {
            toast("云端未配置。部署到 Vercel 后请在环境变量里填写 Supabase 信息。", "error");
            return false;
        }
        return true;
    }

    function ensureSignedIn() {
        if (!isSignedIn()) {
            toast("游客模式不会保存数据。登录后才能管理班级和小组。", "error");
            return false;
        }
        return true;
    }

    async function loadData() {
        updateBackendState();

        if (!isSignedIn()) {
            setupGuestRace();
            renderAll();
            return;
        }

        await loadCloudData();
        ensureSelectedClass();
        filterGroupsForSelectedClass();
        hydrateProgress();
        renderAll();
    }

    async function loadCloudData() {
        const classesResult = await state.client
            .from("classes")
            .select("*")
            .order("created_at", { ascending: true });

        if (classesResult.error) {
            toast(`读取班级失败：${friendlyError(classesResult.error)}`, "error");
            setupGuestRace();
            return;
        }

        const groupsResult = await state.client
            .from("groups")
            .select("*")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true });

        if (groupsResult.error) {
            toast(`读取小组失败：${friendlyError(groupsResult.error)}`, "error");
            state.classes = classesResult.data || [];
            state.allGroups = [];
            state.groups = [];
            return;
        }

        state.classes = classesResult.data || [];
        state.allGroups = groupsResult.data || [];
    }

    function setupGuestRace() {
        const pickedNames = buildGuestTeamNames();
        state.classes = [{ id: GUEST_CLASS_ID, name: "游客模式" }];
        state.allGroups = pickedNames.map((name, index) => ({
            id: `guest-${index + 1}`,
            class_id: GUEST_CLASS_ID,
            name,
            avatar_index: index + 1,
            sort_order: index,
            points: 0
        }));
        state.groups = [...state.allGroups];
        state.selectedClassId = GUEST_CLASS_ID;
        state.isRaceActive = true;
        state.currentWinnerId = null;
        state.bonusPoints = 0;
        state.lastActiveGroupId = null;
        hideWinnerModal();
        hydrateProgress();
    }

    function loadGuestSettings() {
        try {
            const savedNames = JSON.parse(localStorage.getItem(GUEST_TEAM_NAMES_KEY) || "[]");
            state.guestTeamNames = Array.isArray(savedNames) ? cleanGuestNames(savedNames) : [];
        } catch (error) {
            state.guestTeamNames = [];
        }

        syncGuestSettingsInputs();
    }

    function syncGuestSettingsInputs() {
        els.guestTeamNamesInput.value = state.guestTeamNames.join("\n");
    }

    function applyGuestTeamSettings(event) {
        event.preventDefault();
        state.guestTeamNames = cleanGuestNames(els.guestTeamNamesInput.value.split(/\n|,|，/));
        localStorage.setItem(GUEST_TEAM_NAMES_KEY, JSON.stringify(state.guestTeamNames));
        syncGuestSettingsInputs();

        if (!isSignedIn()) {
            setupGuestRace();
            renderAll();
            toast("游客队伍已更新。");
            return;
        }

        toast("游客队伍设置已保存，退出登录后生效。");
    }

    function buildGuestTeamNames() {
        const names = cleanGuestNames(state.guestTeamNames);
        return names.length > 0 ? names : shuffle(GUEST_GROUP_POOL).slice(0, 5);
    }

    function cleanGuestNames(items) {
        const names = [];
        items.forEach((item) => {
            const name = String(item || "").trim().slice(0, 16);
            if (name && !names.includes(name)) names.push(name);
        });
        return names;
    }

    function isSignedIn() {
        return Boolean(state.client && state.session && state.user);
    }

    function updateBackendState() {
        const signedIn = isSignedIn();
        const configured = Boolean(state.client);

        if (els.syncStatus) els.syncStatus.className = "status-badge";
        if (signedIn) {
            if (els.syncStatus) {
                els.syncStatus.classList.add("status-cloud");
                els.syncStatus.textContent = "云端同步";
            }
            els.accountState.textContent = state.user.email || "已登录";
        } else if (configured) {
            if (els.syncStatus) {
                els.syncStatus.classList.add("status-warn");
                els.syncStatus.textContent = "游客模式";
            }
            els.accountState.textContent = "未登录";
        } else {
            if (els.syncStatus) {
                els.syncStatus.classList.add("status-local");
                els.syncStatus.textContent = "游客模式";
            }
            els.accountState.textContent = "云端未配置";
        }
    }

    function ensureSelectedClass() {
        const saved = localStorage.getItem(selectedClassKey());
        const currentIsValid = state.classes.some((item) => item.id === state.selectedClassId);
        const savedIsValid = state.classes.some((item) => item.id === saved);

        if (!currentIsValid) {
            state.selectedClassId = savedIsValid ? saved : (state.classes[0] ? state.classes[0].id : null);
        }

        if (state.selectedClassId) {
            localStorage.setItem(selectedClassKey(), state.selectedClassId);
        }
    }

    function selectedClassKey() {
        return state.user ? `${SELECTED_CLASS_KEY}_${state.user.id}` : SELECTED_CLASS_KEY;
    }

    function filterGroupsForSelectedClass() {
        state.groups = state.selectedClassId
            ? state.allGroups.filter((group) => group.class_id === state.selectedClassId)
            : [];
    }

    function hydrateProgress() {
        if (!state.selectedClassId) {
            state.raceProgress = {};
            return;
        }

        const raw = isSignedIn() ? sessionStorage.getItem(progressKey()) : null;
        let parsed = {};
        if (raw) {
            try {
                parsed = JSON.parse(raw);
            } catch (error) {
                sessionStorage.removeItem(progressKey());
            }
        }

        const next = {};
        state.groups.forEach((group) => {
            const existing = parsed[group.id] || {};
            const currentStep = clampNumber(Number(existing.currentStep) || 0, 0, state.totalSteps);
            const bonusAwarded = Math.max(0, Number(existing.bonusAwarded) || 0);
            const roundScore = Math.max(currentStep, Number(existing.roundScore) || currentStep);
            next[group.id] = {
                currentStep,
                roundScore,
                bonusAwarded,
                committedPoints: Math.max(0, Number(existing.committedPoints) || 0)
            };
        });
        state.raceProgress = next;
        saveProgress();
    }

    function progressKey() {
        return `${PROGRESS_PREFIX}${state.user ? state.user.id : "guest"}_${state.selectedClassId}`;
    }

    function saveProgress() {
        if (!state.selectedClassId || !isSignedIn()) return;
        sessionStorage.setItem(progressKey(), JSON.stringify(state.raceProgress));
    }

    function renderAll() {
        updateBackendState();
        renderClassSelect();
        renderClassList();
        renderGroupList();
        renderTrack();
        renderScoreboard();
        updateControlAvailability();
        updateAuthModeView();
    }

    function updateControlAvailability() {
        const signedIn = isSignedIn();
        const hasClass = Boolean(state.selectedClassId);
        els.classSelect.disabled = signedIn ? state.classes.length === 0 : true;
        els.classNameInput.disabled = !signedIn;
        els.classForm.querySelector("button").disabled = !signedIn;
        els.groupNameInput.disabled = !signedIn || !hasClass;
        els.groupForm.querySelector("button").disabled = !signedIn || !hasClass;
        els.restartRaceBtn.disabled = state.groups.length === 0;
        els.clearPointsBtn.disabled = state.groups.length === 0;
        els.stepsInput.disabled = false;
        els.authLoginModeBtn.disabled = false;
        els.authRegisterModeBtn.disabled = false;
        els.authSubmitBtn.disabled = !state.client || signedIn;
        els.signOutBtn.disabled = !isSignedIn();
    }

    function openSettings() {
        clearAuthPassword();
        updateAuthModeView();
        els.settingsOverlay.classList.add("is-visible");
        els.settingsOverlay.setAttribute("aria-hidden", "false");
    }

    function closeSettings() {
        clearAuthPassword();
        els.settingsOverlay.classList.remove("is-visible");
        els.settingsOverlay.setAttribute("aria-hidden", "true");
    }

    function renderClassSelect() {
        els.classSelect.innerHTML = "";

        if (!isSignedIn()) {
            els.classSelect.appendChild(selectOption(GUEST_CLASS_ID, "游客模式"));
            els.classSelect.value = GUEST_CLASS_ID;
            return;
        }

        if (state.classes.length === 0) {
            els.classSelect.appendChild(selectOption("", "暂无班级"));
            els.classSelect.value = "";
            return;
        }

        state.classes.forEach((classItem) => {
            els.classSelect.appendChild(selectOption(classItem.id, classItem.name));
        });
        els.classSelect.value = state.selectedClassId || "";
    }

    function selectOption(value, label) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
    }

    function renderClassList() {
        els.classList.innerHTML = "";
        els.classCount.textContent = isSignedIn() ? String(state.classes.length) : "0";

        if (!isSignedIn()) {
            els.classList.appendChild(emptyListMessage("登录后管理你的班级"));
            return;
        }

        if (state.classes.length === 0) {
            els.classList.appendChild(emptyListMessage("还没有班级"));
            return;
        }

        state.classes.forEach((classItem) => {
            const row = document.createElement("div");
            row.className = `entity-row${classItem.id === state.selectedClassId ? " selected" : ""}`;

            const main = document.createElement("button");
            main.type = "button";
            main.className = "entity-main reset-button";
            main.addEventListener("click", () => selectClass(classItem.id));

            const name = document.createElement("span");
            name.className = "entity-name";
            name.textContent = classItem.name;

            const meta = document.createElement("span");
            meta.className = "entity-meta";
            meta.textContent = `${countGroupsForClass(classItem.id)} 个小组`;

            main.append(name, meta);

            const actions = document.createElement("div");
            actions.className = "row-actions";
            actions.append(
                miniButton("改名", () => renameClass(classItem)),
                miniButton("删除", () => deleteClass(classItem), "danger")
            );

            row.append(main, actions);
            els.classList.appendChild(row);
        });
    }

    function renderGroupList() {
        els.groupList.innerHTML = "";

        if (!isSignedIn()) {
            els.groupList.appendChild(emptyListMessage("游客模式可比赛，登录后可保存班级小组"));
            return;
        }

        if (!state.selectedClassId) {
            els.groupList.appendChild(emptyListMessage("请先创建或选择班级"));
            return;
        }

        if (state.groups.length === 0) {
            els.groupList.appendChild(emptyListMessage("当前班级还没有小组"));
            return;
        }

        state.groups.forEach((group) => {
            const row = document.createElement("div");
            row.className = "entity-row group-entity";

            const avatar = document.createElement("img");
            avatar.className = "entity-avatar";
            avatar.src = `assets/mw/${group.avatar_index || 1}.png`;
            avatar.alt = "";

            const main = document.createElement("div");
            main.className = "entity-main";

            const name = document.createElement("span");
            name.className = "entity-name";
            name.textContent = group.name;

            const meta = document.createElement("span");
            meta.className = "entity-meta";
            meta.textContent = `角色 ${group.avatar_index || 1} · 历史总分 ${group.points || 0}`;

            main.append(name, meta);

            const actions = document.createElement("div");
            actions.className = "row-actions";
            actions.append(
                miniButton("换角色", () => rotateGroupAvatar(group)),
                miniButton("改名", () => renameGroup(group)),
                miniButton("删除", () => deleteGroup(group), "danger")
            );

            row.append(avatar, main, actions);
            els.groupList.appendChild(row);
        });
    }

    function renderTrack() {
        const selectedClass = state.classes.find((item) => item.id === state.selectedClassId);
        if (els.selectedClassTitle) {
            els.selectedClassTitle.textContent = selectedClass && selectedClass.id !== GUEST_CLASS_ID ? selectedClass.name : "竞速赛道";
        }
        els.trackContainer.innerHTML = "";
        setDynamicRaceScale();

        const shouldShowEmpty = !state.selectedClassId || state.groups.length === 0;
        els.emptyRaceState.classList.toggle("is-visible", shouldShowEmpty);
        updateEmptyRaceCopy();

        if (shouldShowEmpty) return;

        state.groups.forEach((group) => {
            const lane = document.createElement("div");
            lane.className = "track-lane";
            lane.dataset.groupId = group.id;

            const progressFill = document.createElement("div");
            progressFill.className = "lane-progress";

            const laneStart = document.createElement("div");
            laneStart.className = "lane-start-line";

            const carWrap = document.createElement("div");
            carWrap.className = "car-wrapper";
            carWrap.id = carElementId(group.id);
            carWrap.title = "左键前进，右键后退";
            carWrap.addEventListener("click", () => moveCarForward(group.id));
            carWrap.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                moveCarBackward(group.id);
            });

            const label = document.createElement("div");
            label.className = "group-label";
            label.textContent = group.name;

            const car = document.createElement("img");
            car.className = "car";
            car.src = `assets/mw/${group.avatar_index || 1}.png`;
            car.alt = group.name;
            car.draggable = false;

            carWrap.append(label, car);
            lane.append(progressFill, laneStart, carWrap);
            els.trackContainer.appendChild(lane);
        });

        requestAnimationFrame(updateAllCarPositions);
    }

    function updateEmptyRaceCopy() {
        if (!isSignedIn()) {
            els.emptyRaceTitle.textContent = "游客模式";
            els.emptyRaceCopy.textContent = "可以在设置里按行填写游客队伍名称。登录后可以保存班级、小组和历史总分。";
            return;
        }

        if (!state.selectedClassId) {
            els.emptyRaceTitle.textContent = "还没有选中班级";
            els.emptyRaceCopy.textContent = "在设置里创建或选择班级后，赛道会加载该班级的小组。";
            return;
        }

        els.emptyRaceTitle.textContent = "当前班级还没有小组";
        els.emptyRaceCopy.textContent = "在设置里给这个班级添加小组后，队伍会出现在赛道上。";
    }

    function renderScoreboard() {
        els.scoreList.innerHTML = "";

        if (!state.selectedClassId) {
            els.scoreList.appendChild(emptyListMessage("选择班级后查看积分"));
            return;
        }

        if (state.groups.length === 0) {
            els.scoreList.appendChild(emptyListMessage("暂无小组积分"));
            return;
        }

        const ranking = [...state.groups].sort((a, b) => {
            const scoreDiff = getRoundScore(b.id) - getRoundScore(a.id);
            if (scoreDiff !== 0) return scoreDiff;
            if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
            return (a.sort_order || 0) - (b.sort_order || 0);
        });
        const leaderScore = ranking.length > 0 ? getRoundScore(ranking[0].id) : 0;

        ranking.forEach((group, index) => {
            const roundScore = getRoundScore(group.id);
            const row = document.createElement("div");
            row.className = `score-row${group.id === state.lastActiveGroupId ? " active" : ""}`;
            if (index === 0) row.classList.add("rank-one");
            if (index === 1) row.classList.add("rank-two");
            if (index === 2) row.classList.add("rank-three");

            const rank = document.createElement("div");
            rank.className = "rank-cell";
            rank.textContent = String(index + 1);

            const avatar = document.createElement("img");
            avatar.className = "score-avatar";
            avatar.src = `assets/mw/${group.avatar_index || 1}.png`;
            avatar.alt = "";

            const main = document.createElement("div");
            main.className = "score-main";

            const name = document.createElement("div");
            name.className = "score-name";
            name.textContent = group.name;

            const meta = document.createElement("div");
            meta.className = "score-meta";
            meta.textContent = isSignedIn()
                ? `历史总分 ${group.points || 0}`
                : (index === 0 ? "当前领跑" : `距离榜首 ${Math.max(0, leaderScore - roundScore)} 分`);

            main.append(name, meta);

            const score = document.createElement("div");
            score.className = "score-value";
            score.textContent = String(roundScore);

            row.append(rank, avatar, main, score);
            els.scoreList.appendChild(row);
        });
    }

    function emptyListMessage(text) {
        const node = document.createElement("div");
        node.className = "entity-row";
        node.textContent = text;
        node.style.color = "var(--muted)";
        node.style.justifyContent = "center";
        return node;
    }

    async function selectClass(classId) {
        if (!classId) return;
        if (!isSignedIn() && classId === GUEST_CLASS_ID) return;
        if (!ensureSignedIn()) return;
        if (state.selectedClassId === classId) return;
        state.selectedClassId = classId;
        localStorage.setItem(selectedClassKey(), classId);
        filterGroupsForSelectedClass();
        hydrateProgress();
        state.isRaceActive = true;
        hideWinnerModal();
        renderAll();
    }

    async function createClassFromForm(event) {
        event.preventDefault();
        if (!ensureSignedIn()) return;
        const name = els.classNameInput.value.trim();
        if (!name) return;

        const { data, error } = await state.client
            .from("classes")
            .insert({ name, description: "", owner_id: state.user.id })
            .select()
            .single();

        if (error) {
            toast(`创建班级失败：${friendlyError(error)}`, "error");
            return;
        }

        state.selectedClassId = data.id;
        localStorage.setItem(selectedClassKey(), state.selectedClassId);
        els.classNameInput.value = "";
        await loadData();
        toast("班级已创建。");
    }

    async function renameClass(classItem) {
        if (!ensureSignedIn()) return;
        const nextName = window.prompt("新的班级名称", classItem.name);
        if (!nextName || nextName.trim() === classItem.name) return;

        const { error } = await state.client
            .from("classes")
            .update({ name: nextName.trim(), updated_at: new Date().toISOString() })
            .eq("id", classItem.id);

        if (error) {
            toast(`更新班级失败：${friendlyError(error)}`, "error");
            return;
        }

        await loadData();
        toast("班级已更新。");
    }

    async function deleteClass(classItem) {
        if (!ensureSignedIn()) return;
        if (!window.confirm(`删除「${classItem.name}」及其全部小组？`)) return;

        const { error } = await state.client.from("classes").delete().eq("id", classItem.id);
        if (error) {
            toast(`删除班级失败：${friendlyError(error)}`, "error");
            return;
        }

        if (state.selectedClassId === classItem.id) state.selectedClassId = null;
        await loadData();
        toast("班级已删除。");
    }

    async function createGroupFromForm(event) {
        event.preventDefault();
        if (!ensureSignedIn()) return;
        if (!state.selectedClassId) {
            toast("请先选择班级。", "error");
            return;
        }

        const name = els.groupNameInput.value.trim();
        if (!name) return;

        const nextOrder = state.groups.reduce((max, group) => Math.max(max, Number(group.sort_order) || 0), -1) + 1;
        const avatarIndex = (state.groups.length % 9) + 1;

        const { error } = await state.client
            .from("groups")
            .insert({
                class_id: state.selectedClassId,
                owner_id: state.user.id,
                name,
                avatar_index: avatarIndex,
                sort_order: nextOrder,
                points: 0
            });

        if (error) {
            toast(`创建小组失败：${friendlyError(error)}`, "error");
            return;
        }

        els.groupNameInput.value = "";
        await loadData();
        toast("小组已创建。");
    }

    async function renameGroup(group) {
        if (!ensureSignedIn()) return;
        const nextName = window.prompt("新的小组名称", group.name);
        if (!nextName || nextName.trim() === group.name) return;
        await updateGroup(group.id, { name: nextName.trim(), updated_at: new Date().toISOString() }, "小组已更新。");
    }

    async function rotateGroupAvatar(group) {
        if (!ensureSignedIn()) return;
        const nextAvatar = ((Number(group.avatar_index) || 1) % 9) + 1;
        await updateGroup(group.id, { avatar_index: nextAvatar, updated_at: new Date().toISOString() }, "角色已切换。");
    }

    async function deleteGroup(group) {
        if (!ensureSignedIn()) return;
        if (!window.confirm(`删除小组「${group.name}」？`)) return;

        const { error } = await state.client.from("groups").delete().eq("id", group.id);
        if (error) {
            toast(`删除小组失败：${friendlyError(error)}`, "error");
            return;
        }

        delete state.raceProgress[group.id];
        saveProgress();
        await loadData();
        toast("小组已删除。");
    }

    async function updateGroup(groupId, fields, successMessage) {
        if (!ensureSignedIn()) return false;

        const { error } = await state.client.from("groups").update(fields).eq("id", groupId);
        if (error) {
            toast(`更新小组失败：${friendlyError(error)}`, "error");
            return false;
        }

        await loadData();
        if (successMessage) toast(successMessage);
        return true;
    }

    function updateTotalSteps() {
        state.totalSteps = clampNumber(Number(els.stepsInput.value) || 5, 1, 99);
        els.stepsInput.value = String(state.totalSteps);
        Object.keys(state.raceProgress).forEach((groupId) => {
            const progress = state.raceProgress[groupId];
            progress.currentStep = clampNumber(progress.currentStep, 0, state.totalSteps);
            progress.roundScore = Math.max(progress.currentStep, Math.min(Number(progress.roundScore) || 0, progress.currentStep + (Number(progress.bonusAwarded) || 0)));
        });
        saveProgress();
        updateAllCarPositions();
    }

    function restartRace(keepScores) {
        Object.keys(state.raceProgress).forEach((groupId) => {
            state.raceProgress[groupId] = { currentStep: 0, roundScore: 0, bonusAwarded: 0, committedPoints: 0 };
        });
        state.isRaceActive = true;
        state.currentWinnerId = null;
        state.bonusPoints = 0;
        saveProgress();
        hideWinnerModal();
        updateAllCarPositions();
        renderScoreboard();
        if (!keepScores) toast(isSignedIn() ? "本轮已重开。" : "本轮已重开。");
    }

    async function clearPointsForSelectedClass() {
        if (!state.selectedClassId || state.groups.length === 0) return;
        if (!window.confirm(isSignedIn() ? "清空当前班级全部小组的历史总分？" : "清空当前得分？")) return;

        if (isSignedIn()) {
            const updates = state.groups.map((group) => updateGroupPoints(group.id, 0));
            await Promise.all(updates);
            await loadData();
            toast("历史总分已清空。");
            return;
        }

        state.groups.forEach((group) => {
            group.points = 0;
        });
        restartRace(true);
        renderAll();
        toast("当前得分已清空。");
    }

    function moveCarForward(groupId) {
        if (!state.isRaceActive) return;
        const progress = state.raceProgress[groupId];
        if (!progress || progress.currentStep >= state.totalSteps) return;

        progress.currentStep += 1;
        progress.roundScore = Math.max(0, Number(progress.roundScore) || 0) + 1;
        state.lastActiveGroupId = groupId;
        saveProgress();
        updateCarPosition(groupId);
        renderScoreboard();

        if (progress.currentStep === state.totalSteps) handleWin(groupId);
    }

    async function moveCarBackward(groupId) {
        const progress = state.raceProgress[groupId];
        if (!progress || progress.currentStep <= 0) return;

        if (progress.currentStep === state.totalSteps) {
            const rolledBack = await rollbackCommittedRoundScores();
            if (!rolledBack) return;
            const winnerProgress = state.currentWinnerId ? state.raceProgress[state.currentWinnerId] : progress;
            if (winnerProgress) {
                winnerProgress.roundScore = Math.max(0, (Number(winnerProgress.roundScore) || 0) - (Number(winnerProgress.bonusAwarded) || 0));
                winnerProgress.bonusAwarded = 0;
            }
            state.isRaceActive = true;
            state.currentWinnerId = null;
            state.bonusPoints = 0;
            hideWinnerModal();
        }

        progress.currentStep -= 1;
        progress.roundScore = Math.max(0, (Number(progress.roundScore) || 0) - 1);
        state.lastActiveGroupId = groupId;
        saveProgress();
        updateCarPosition(groupId);
        renderScoreboard();
    }

    function handleWin(groupId) {
        const group = state.groups.find((item) => item.id === groupId);
        if (!group) return;
        state.isRaceActive = false;
        state.currentWinnerId = groupId;
        state.bonusPoints = 0;
        els.winnerTitle.textContent = `${group.name} 获胜`;
        els.bonusStepOne.hidden = false;
        els.bonusStepTwo.hidden = true;
        els.pointsDisplay.textContent = "+0";
        els.winnerModal.classList.add("is-visible");
    }

    function rollPoints() {
        els.bonusStepOne.hidden = true;
        els.bonusStepTwo.hidden = false;

        let ticks = 0;
        const timer = window.setInterval(() => {
            els.pointsDisplay.textContent = `+${randomBonus()}`;
            ticks += 1;
            if (ticks > 15) {
                window.clearInterval(timer);
                state.bonusPoints = randomBonus();
                els.pointsDisplay.textContent = `+${state.bonusPoints}`;
                els.pointsDisplay.style.transform = "scale(1.12)";
                window.setTimeout(() => {
                    els.pointsDisplay.style.transform = "scale(1)";
                }, 180);
            }
        }, 50);
    }

    async function collectBonus() {
        if (!state.currentWinnerId || state.bonusPoints <= 0) return;

        const progress = state.raceProgress[state.currentWinnerId];
        if (progress) {
            const previousRoundScore = Number(progress.roundScore) || 0;
            const previousBonus = Number(progress.bonusAwarded) || 0;
            progress.bonusAwarded = state.bonusPoints;
            progress.roundScore = Math.max(0, previousRoundScore) + state.bonusPoints;

            const committed = await commitRoundScores();
            if (!committed) {
                progress.roundScore = previousRoundScore;
                progress.bonusAwarded = previousBonus;
                saveProgress();
                renderScoreboard();
                return;
            }
            saveProgress();
            renderScoreboard();
        }
        state.bonusPoints = 0;
        hideWinnerModal();
    }

    function hideWinnerModal() {
        els.winnerModal.classList.remove("is-visible");
    }

    function getRoundScore(groupId) {
        const progress = state.raceProgress[groupId];
        return progress ? Math.max(0, Number(progress.roundScore) || 0) : 0;
    }

    async function commitRoundScores() {
        const deltas = state.groups
            .map((group) => {
                const progress = state.raceProgress[group.id];
                if (!progress) return null;
                const committedPoints = Math.max(0, Number(progress.committedPoints) || 0);
                const delta = Math.max(0, getRoundScore(group.id) - committedPoints);
                return delta > 0 ? { groupId: group.id, delta } : null;
            })
            .filter(Boolean);

        const applied = [];
        for (const item of deltas) {
            const committed = await applyHistoricalDelta(item.groupId, item.delta);
            if (!committed) {
                for (const previous of applied.reverse()) {
                    await applyHistoricalDelta(previous.groupId, -previous.delta);
                    const previousProgress = state.raceProgress[previous.groupId];
                    if (previousProgress) {
                        previousProgress.committedPoints = Math.max(0, (Number(previousProgress.committedPoints) || 0) - previous.delta);
                    }
                }
                toast("本轮积分未完整同步，已撤回本次提交。", "error");
                return false;
            }
            const progress = state.raceProgress[item.groupId];
            if (progress) progress.committedPoints = (Number(progress.committedPoints) || 0) + item.delta;
            applied.push(item);
        }

        return true;
    }

    async function rollbackCommittedRoundScores() {
        const committedItems = state.groups
            .map((group) => {
                const progress = state.raceProgress[group.id];
                const points = progress ? Math.max(0, Number(progress.committedPoints) || 0) : 0;
                return points > 0 ? { groupId: group.id, points } : null;
            })
            .filter(Boolean);

        const rolledBack = [];
        for (const item of committedItems) {
            const reverted = await applyHistoricalDelta(item.groupId, -item.points);
            if (!reverted) {
                for (const previous of rolledBack.reverse()) {
                    await applyHistoricalDelta(previous.groupId, previous.points);
                    const previousProgress = state.raceProgress[previous.groupId];
                    if (previousProgress) previousProgress.committedPoints = previous.points;
                }
                toast("终点回退未完整同步，历史总分保持不变。", "error");
                return false;
            }
            const progress = state.raceProgress[item.groupId];
            if (progress) progress.committedPoints = 0;
            rolledBack.push(item);
        }

        return true;
    }

    async function applyHistoricalDelta(groupId, delta) {
        const group = state.groups.find((item) => item.id === groupId);
        if (!group || delta === 0) return false;

        const previousPoints = Number(group.points) || 0;
        const nextPoints = Math.max(0, previousPoints + delta);
        group.points = nextPoints;
        const matchingGroup = state.allGroups.find((item) => item.id === groupId);
        if (matchingGroup) matchingGroup.points = nextPoints;
        state.lastActiveGroupId = groupId;
        renderScoreboard();
        if (!isSignedIn()) return true;
        const saved = await updateGroupPoints(groupId, nextPoints);
        if (!saved) {
            group.points = previousPoints;
            if (matchingGroup) matchingGroup.points = previousPoints;
            renderScoreboard();
        }
        return saved;
    }

    async function updateGroupPoints(groupId, points) {
        if (!isSignedIn()) return true;

        const { error } = await state.client
            .from("groups")
            .update({ points, updated_at: new Date().toISOString() })
            .eq("id", groupId);

        if (error) {
            toast(`积分同步失败：${friendlyError(error)}`, "error");
            return false;
        }
        return true;
    }

    function updateAllCarPositions() {
        state.groups.forEach((group) => updateCarPosition(group.id));
    }

    function updateCarPosition(groupId) {
        const carEl = document.getElementById(carElementId(groupId));
        if (!carEl || !carEl.parentElement) return;

        const progress = state.raceProgress[groupId] || { currentStep: 0 };
        const startOffset = getStartOffset();
        const trackWidth = carEl.parentElement.offsetWidth;
        const safeFinish = Math.max(startOffset, trackWidth - 92);
        const travel = Math.max(0, safeFinish - startOffset);
        const nextLeft = startOffset + (travel / state.totalSteps) * progress.currentStep;
        carEl.style.left = `${nextLeft}px`;

        const laneProgress = carEl.parentElement.querySelector(".lane-progress");
        if (laneProgress) {
            const ratio = state.totalSteps > 0 ? progress.currentStep / state.totalSteps : 0;
            laneProgress.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
        }
    }

    function setDynamicRaceScale() {
        const count = state.groups.length;
        let carSize = 5.7;
        let laneMargin = 8;
        let labelScale = 1;

        if (count > 6) {
            carSize = Math.max(2.4, 5.7 - (count - 6) * 0.26);
            laneMargin = Math.max(2, 8 - (count - 6) * 0.55);
            labelScale = Math.max(0.66, 1 - (count - 6) * 0.035);
        }

        document.documentElement.style.setProperty("--car-size", `${carSize}rem`);
        document.documentElement.style.setProperty("--lane-margin", `${laneMargin}px`);
        document.documentElement.style.setProperty("--label-scale", String(labelScale));
    }

    function getStartOffset() {
        const raw = window.getComputedStyle(document.documentElement).getPropertyValue("--start-pos");
        return Number.parseFloat(raw) || 150;
    }

    function countGroupsForClass(classId) {
        return state.allGroups.filter((group) => group.class_id === classId).length;
    }

    function miniButton(text, onClick, tone) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `mini-button${tone ? ` ${tone}` : ""}`;
        button.textContent = text;
        button.addEventListener("click", onClick);
        return button;
    }

    function carElementId(groupId) {
        return `car-${groupId}`;
    }

    function randomBonus() {
        return Math.floor(Math.random() * 10) + 1;
    }

    function shuffle(items) {
        const copy = [...items];
        for (let index = copy.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
        }
        return copy;
    }

    function clampNumber(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function toast(message, type) {
        window.clearTimeout(toastTimer);
        els.toast.textContent = message;
        els.toast.className = `toast is-visible${type === "error" ? " error" : ""}`;
        toastTimer = window.setTimeout(() => {
            els.toast.className = "toast";
        }, 3200);
    }

    function friendlyError(error) {
        if (!error) return "未知错误";
        return error.message || String(error);
    }
})();
