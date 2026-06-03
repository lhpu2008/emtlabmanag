// ==========================================================================
// MOCK DATA FALLBACKS (Used if server APIs are unreachable)
// ==========================================================================

const DEFAULT_MEMBERS = [
    { id: "student_1", name: "张明", role: "博士生", grade: "2023级", studentId: "D20230105", research: "深度学习在无损检测中的应用", contact: "zhangm@mail.edu.cn" },
    { id: "student_2", name: "李华", role: "硕士生", grade: "2024级", studentId: "M20240211", research: "电磁超声检测技术 (EMAT)", contact: "lihua@mail.edu.cn" },
    { id: "student_3", name: "赵雷", role: "硕士生", grade: "2025级", studentId: "M20250314", research: "电阻抗成像重建算法 (EIT)", contact: "zhaolei@mail.edu.cn" },
    { id: "student_4", name: "钱雪", role: "博士生", grade: "2022级", studentId: "D20220102", research: "多模态物理融合深度学习", contact: "qianxue@mail.edu.cn" },
    { id: "student_5", name: "王芳", role: "硕士生", grade: "2024级", studentId: "M20240212", research: "阵列声学测井理论", contact: "wangfang@mail.edu.cn" },
    { id: "advisor", name: "陈教授", role: "导师", grade: "教师岗", studentId: "T2010001", research: "智能传感与电磁无损检测", contact: "chen_prof@mail.edu.cn" }
];

const DEFAULT_ANNOUNCEMENTS = [
    {
        id: "ann_1",
        title: "关于本周五（5月22日）下午实验室学术例会的通知",
        category: "Academic",
        content: "各位同学，本周五下午 14:00 将在工科楼 405 学术会议室举行每周学术例会。请李华同学准备汇报《非线性电磁超声导波检测技术及裂纹定量评估》的研究进展，请其他同学携带学术周报提前 5 分钟到场签到，陈老师将点评大家的研究进度。",
        date: "2026-05-19 16:30",
        publisher: "陈教授",
        unreadBy: ["student_1", "student_2", "student_3", "student_5"]
    },
    {
        id: "ann_2",
        title: "【紧急】学校超级计算中心升级维护及算力队列调整",
        category: "Important",
        content: "为保障毕业季论文计算需求，学校超级计算中心将于 5 月 21 日凌晨 00:00 - 06:00 对 GPU 物理节点进行系统升级与升级扩容维护。届时计算队列将暂停，请大家提前保存当前计算检查点 (Checkpoint) 以防训练任务意外丢失。维护完成后，实验室将优先倾斜分配算力给面临毕业论文撰写的研究生。",
        date: "2026-05-18 09:15",
        publisher: "系统管理员",
        unreadBy: ["student_2", "student_3"]
    }
];

const DEFAULT_POSTS = [
    {
        id: "post_1",
        title: "大家遇到 PyTorch 分布式 DDP 训练在 epoch 结束时卡死怎么解决？",
        category: "Academic",
        content: "如题，在进行三维图像分割模型的多卡 DDP 训练时，跑完第一个 epoch 的 validation 之后，程序就会卡死在 barrier() 或者报错 RuntimeError: Expected to have finished reduction...。排查了很久，不知道是 DataLoader 的 drop_last 导致的，还是网络结构里有未参与前向传播的参数引起的？求教组里做过分布式的大佬！",
        authorId: "student_1",
        authorName: "张明",
        authorRole: "博士生",
        date: "2026-05-19 20:15",
        tags: ["PyTorch", "DDP报错", "深度学习"],
        views: 42,
        replies: [
            {
                id: "rep_1_1",
                authorId: "student_4",
                authorName: "钱雪",
                authorRole: "博士生",
                date: "2026-05-19 21:05",
                content: "这个错一般是由于你网络中定义了某些层，但在 forward 传播里没有用到（比如某些条件分支或者遗留的无用模块）。DDP 在梯度 backward 同步时会等待所有定义的参数，没用到的层梯度没有计算，就会一直等待导致超时卡死。你可以试试在初始化 DDP 时加上 find_unused_parameters=True，或者检查 forward 是否有些层被跳过了。"
            }
        ]
    }
];

const DEFAULT_SIGNINS = {
    "2026-05-18": [
        { userId: "student_1", userName: "张明", time: "08:50:12", amPm: "AM", location: "工科楼 402 实验室", notes: "开始撰写DDP分布式优化代码" }
    ]
};

// ==========================================================================
// STATE MANAGEMENT & LOCALSTORAGE FALLBACK HELPERS
// ==========================================================================

function getStorage(key, defaultData) {
    const val = localStorage.getItem(key);
    if (!val) {
        localStorage.setItem(key, JSON.stringify(defaultData));
        return defaultData;
    }
    return JSON.parse(val);
}

function setStorage(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// Global Client-Side State
let state = {
    members: [],
    announcements: [],
    posts: [],
    signins: {}, // Fallback only
    currentUser: null,
    currentDate: new Date().toISOString().split("T")[0]
};

// State Synchronization with Backend SQLite Database
async function syncState() {
    try {
        const resMembers = await fetch('/api/members');
        state.members = await resMembers.json();
        
        const resAnns = await fetch('/api/announcements');
        state.announcements = await resAnns.json();
        
        const resPosts = await fetch('/api/posts');
        state.posts = await resPosts.json();
        
        // Ensure active user is still in the loaded members
        if (state.currentUser) {
            const matched = state.members.find(m => m.id === state.currentUser.id);
            if (matched) {
                state.currentUser = matched;
            }
        }
    } catch (e) {
        console.warn("Server API offline. Syncing state with localStorage fallback.", e);
        // Fallback to localStorage
        state.members = getStorage("gm_members", DEFAULT_MEMBERS);
        state.announcements = getStorage("gm_announcements", DEFAULT_ANNOUNCEMENTS);
        state.posts = getStorage("gm_posts", DEFAULT_POSTS);
        state.signins = getStorage("gm_signins", DEFAULT_SIGNINS);
    }
}

// Initialize Application State
async function initAppState() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            const user = await res.json();
            state.currentUser = user;
            
            const loginBackdrop = document.getElementById("loginBackdrop");
            if (loginBackdrop) {
                loginBackdrop.classList.remove("active");
            }
            
            await syncState();
            updateCurrentUserProfileUI();
        } else {
            state.currentUser = null;
            const loginBackdrop = document.getElementById("loginBackdrop");
            if (loginBackdrop) {
                loginBackdrop.classList.add("active");
            }
        }
    } catch (e) {
        console.warn("Server auth check failed. Using fallback.", e);
        const savedUserId = localStorage.getItem("gm_current_user_id");
        if (savedUserId) {
            await syncState();
            const matched = state.members.find(m => m.id === savedUserId);
            if (matched) {
                state.currentUser = matched;
                const loginBackdrop = document.getElementById("loginBackdrop");
                if (loginBackdrop) {
                    loginBackdrop.classList.remove("active");
                }
                updateCurrentUserProfileUI();
                return;
            }
        }
        
        state.currentUser = null;
        const loginBackdrop = document.getElementById("loginBackdrop");
        if (loginBackdrop) {
            loginBackdrop.classList.add("active");
        }
    }
}

function updateCurrentUserProfileUI() {
    if (!state.currentUser) return;
    const avatar = document.getElementById("currentUserAvatar");
    const nameLabel = document.getElementById("currentUserName");
    const roleLabel = document.getElementById("currentUserRole");
    
    if (avatar) avatar.textContent = state.currentUser.name.charAt(0);
    if (nameLabel) nameLabel.textContent = state.currentUser.name;
    if (roleLabel) roleLabel.textContent = state.currentUser.role;
    
    const replyAsUser = document.getElementById("replyAsUser");
    if (replyAsUser) replyAsUser.textContent = state.currentUser.name;

    const settingsBtn = document.getElementById("openSigninSettingsBtn");
    const alertBtn = document.getElementById("absenceAlertBtn");
    const isAdvisor = state.currentUser.id === "advisor";
    
    if (settingsBtn) {
        settingsBtn.style.display = isAdvisor ? "inline-flex" : "none";
    }
    if (alertBtn) {
        alertBtn.style.display = isAdvisor ? "flex" : "none";
    }
    
    if (isAdvisor) {
        updateAbsenceBadge();
    }
}

// ==========================================================================
// NOTIFICATIONS SYSTEM
// ==========================================================================

function getUnreadAnnouncementsCount() {
    return state.announcements.filter(ann => 
        ann.unreadBy && ann.unreadBy.includes(state.currentUser.id)
    ).length;
}

function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let icon = "fa-circle-check";
    if (type === "error") icon = "fa-circle-xmark";
    if (type === "warning") icon = "fa-circle-exclamation";
    if (type === "info") icon = "fa-circle-info";
    
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 4500);
}

function updateNotificationBadge() {
    const badge = document.getElementById("notificationBadge");
    const list = document.getElementById("notificationList");
    const unreadCount = getUnreadAnnouncementsCount();
    
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? "flex" : "none";
    }
    
    if (!list) return;
    list.innerHTML = "";
    
    const unreadAnnouncements = state.announcements.filter(ann => 
        ann.unreadBy && ann.unreadBy.includes(state.currentUser.id)
    );
    
    if (unreadAnnouncements.length === 0) {
        list.innerHTML = `<div class="dropdown-item" style="text-align: center; color: var(--text-muted);">暂无未读系统通知</div>`;
        return;
    }
    
    unreadAnnouncements.forEach(ann => {
        const item = document.createElement("div");
        item.className = "dropdown-item unread";
        item.dataset.annId = ann.id;
        
        let iconClass = "fa-bullhorn text-indigo";
        if (ann.category === "Important") iconClass = "fa-circle-exclamation text-danger";
        if (ann.category === "Activities") iconClass = "fa-gift text-success";
        
        item.innerHTML = `
            <div class="icon"><i class="fa-solid ${iconClass}"></i></div>
            <div class="content">
                <p><strong>${ann.title}</strong></p>
                <span>${ann.date}</span>
            </div>
        `;
        item.addEventListener("click", async () => {
            // Send read mark to backend
            try {
                await fetch('/api/announcements/read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        announcement_id: ann.id,
                        user_id: state.currentUser.id
                    })
                });
            } catch (err) {
                // local fallback
            }
            
            ann.unreadBy = ann.unreadBy.filter(id => id !== state.currentUser.id);
            updateNotificationBadge();
            
            navigateToSection("announcements");
            const element = document.querySelector(`[data-id="${ann.id}"]`);
            if (element) {
                element.scrollIntoView({ behavior: "smooth" });
                element.classList.add("unread");
                setTimeout(() => element.classList.remove("unread"), 2000);
            }
        });
        list.appendChild(item);
    });
}

// Mark all read listener
document.getElementById("markAllRead").addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
        await fetch('/api/announcements/read-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: state.currentUser.id })
        });
    } catch (err) {}
    
    state.announcements.forEach(ann => {
        if (ann.unreadBy && ann.unreadBy.includes(state.currentUser.id)) {
            ann.unreadBy = ann.unreadBy.filter(id => id !== state.currentUser.id);
        }
    });
    
    updateNotificationBadge();
    showToast("所有公告已标记为已读！");
    
    const activeSection = document.querySelector(".view-section.active").id;
    if (activeSection === "view-dashboard") renderDashboard();
    if (activeSection === "view-announcements") renderAnnouncements();
});

// Toggle dropdown click
document.getElementById("notificationBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById("notificationDropdown");
    dropdown.classList.toggle("active");
});
document.addEventListener("click", () => {
    document.getElementById("notificationDropdown").classList.remove("active");
});
document.getElementById("notificationDropdown").addEventListener("click", (e) => {
    e.stopPropagation();
});

// ==========================================================================
// CLOCK LOGIC
// ==========================================================================

function startClock() {
    const clock = document.getElementById("digitalClock");
    const largeTime = document.getElementById("largeTime");
    const largeDate = document.getElementById("largeDate");
    
    const updateTime = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const date = String(now.getDate()).padStart(2, "0");
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        const seconds = String(now.getSeconds()).padStart(2, "0");
        
        const dateStr = `${year}-${month}-${date}`;
        const timeStr = `${hours}:${minutes}:${seconds}`;
        
        if (clock) {
            clock.querySelector(".clock-date").textContent = dateStr;
            clock.querySelector(".clock-time").textContent = timeStr;
        }
        
        if (largeTime) largeTime.textContent = timeStr;
        if (largeDate) {
            const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
            largeDate.textContent = `${year}年${month}月${date}日 ${weekdays[now.getDay()]}`;
        }
    };
    
    updateTime();
    setInterval(updateTime, 1000);
}

// ==========================================================================
// ROLE SWITCHER
// ==========================================================================

// ==========================================================================
// AUTHENTICATION AND LOGOUT HANDLERS
// ==========================================================================

function initAuth() {
    const loginForm = document.getElementById("loginForm");
    const logoutBtn = document.getElementById("logoutBtn");
    
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const studentId = document.getElementById("loginStudentId").value.trim();
            const password = document.getElementById("loginPassword").value;
            
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId, password })
                });
                
                const data = await res.json();
                if (res.ok && data.success) {
                    state.currentUser = data.member;
                    localStorage.setItem("gm_current_user_id", data.member.id);
                    
                    showToast(`欢迎回来，${data.member.name} (${data.member.role})！`);
                    
                    const loginBackdrop = document.getElementById("loginBackdrop");
                    if (loginBackdrop) {
                        loginBackdrop.classList.remove("active");
                    }
                    
                    loginForm.reset();
                    
                    await syncState();
                    updateCurrentUserProfileUI();
                    
                    // Render current view
                    const activeSection = document.querySelector(".view-section.active").id;
                    if (activeSection === "view-dashboard") renderDashboard();
                    if (activeSection === "view-signin") renderSignInView();
                    if (activeSection === "view-announcements") renderAnnouncements();
                    if (activeSection === "view-forum") renderForum();
                    if (activeSection === "view-members") renderMembers();
                    
                    updateNotificationBadge();
                } else {
                    showToast(data.error || "学号或密码错误，请重试", "error");
                }
            } catch (err) {
                console.error("Login error:", err);
                showToast("登录连接超时，请重试", "error");
            }
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
                await fetch('/api/logout', { method: 'POST' });
                showToast("您已安全退出登录");
            } catch (err) {
                console.warn("Logout failed, logging out locally:", err);
            }
            
            state.currentUser = null;
            localStorage.removeItem("gm_current_user_id");
            
            const loginBackdrop = document.getElementById("loginBackdrop");
            if (loginBackdrop) {
                loginBackdrop.classList.add("active");
            }
            
            navigateToSection("dashboard");
        });
    }
}

// ==========================================================================
// ROUTING
// ==========================================================================

function navigateToSection(targetId) {
    document.querySelectorAll(".view-section").forEach(sec => sec.classList.remove("active"));
    const targetSection = document.getElementById(`view-${targetId}`);
    if (targetSection) targetSection.classList.add("active");
    
    document.querySelectorAll(".nav-item").forEach(link => link.classList.remove("active"));
    const navLink = document.querySelector(`.nav-item[data-target="${targetId}"]`);
    if (navLink) navLink.classList.add("active");
    
    const viewTitle = document.getElementById("viewTitle");
    const viewSubtitle = document.getElementById("viewSubtitle");
    
    const titles = {
        dashboard: { title: "仪表盘", subtitle: "实验室概况与今日动态" },
        signin: { title: "考勤签到系统", subtitle: "记录每日科研学术签到" },
        announcements: { title: "通知公告", subtitle: "实验室重要通知、学术会议及事务发布" },
        forum: { title: "学术论坛", subtitle: "论文探讨、技术交流、代码答疑与生活互助" },
        members: { title: "成员名册", subtitle: "课题组导师、研究生名册与联系方式" }
    };
    
    if (titles[targetId]) {
        viewTitle.textContent = titles[targetId].title;
        viewSubtitle.textContent = titles[targetId].subtitle;
    }
    
    if (targetId === "dashboard") renderDashboard();
    if (targetId === "signin") renderSignInView();
    if (targetId === "announcements") renderAnnouncements();
    if (targetId === "forum") renderForum();
    if (targetId === "members") renderMembers();
}

function initNavigation() {
    document.querySelectorAll(".nav-item").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const target = link.dataset.target;
            navigateToSection(target);
        });
    });
    
    document.getElementById("linkToForum").addEventListener("click", (e) => {
        e.preventDefault();
        navigateToSection("forum");
    });
    document.getElementById("linkToAnnounce").addEventListener("click", (e) => {
        e.preventDefault();
        navigateToSection("announcements");
    });
}

// ==========================================================================
// RENDER: DASHBOARD VIEW
// ==========================================================================

async function checkUserSignedToday() {
    try {
        const res = await fetch(`/api/signins/today?date=${state.currentDate}`);
        const todayLog = await res.json();
        return todayLog.some(log => log.userId === state.currentUser.id);
    } catch (e) {
        const todayLog = state.signins[state.currentDate] || [];
        return todayLog.some(log => log.userId === state.currentUser.id);
    }
}

async function renderDashboard() {
    if (!state.currentUser) return;
    await syncState();
    
    // Get signins count
    let todaySigned = 0;
    try {
        const res = await fetch(`/api/signins/today?date=${state.currentDate}`);
        const todayLog = await res.json();
        todaySigned = todayLog.length;
    } catch (e) {
        todaySigned = (state.signins[state.currentDate] || []).length;
    }
    
    const totalStudents = state.members.filter(m => m.id !== "advisor").length;
    const rate = totalStudents > 0 ? Math.round((todaySigned / totalStudents) * 100) : 0;
    
    document.getElementById("dashSignInRate").textContent = `${rate}%`;
    document.getElementById("dashSignInRatio").textContent = `${todaySigned}/${totalStudents} 人`;
    document.getElementById("dashSignInProgress").style.width = `${rate}%`;
    
    document.getElementById("dashPostCount").textContent = state.posts.length;
    document.getElementById("dashAnnounceCount").textContent = getUnreadAnnouncementsCount();
    
    // Quick sign button status
    const isSigned = await checkUserSignedToday();
    const quickSignTag = document.getElementById("quickSignStateTag");
    const quickSignBtn = document.getElementById("quickSignBtn");
    
    if (isSigned) {
        quickSignTag.textContent = "今日已签到";
        quickSignTag.className = "card-tag tag-success";
        quickSignBtn.disabled = true;
        quickSignBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>已完成签到</span>`;
        quickSignBtn.classList.remove("btn-primary", "btn-glow");
        quickSignBtn.classList.add("btn-secondary");
    } else {
        quickSignTag.textContent = "今日未签到";
        quickSignTag.className = "card-tag tag-warning";
        quickSignBtn.disabled = false;
        quickSignBtn.innerHTML = `<i class="fa-solid fa-fingerprint"></i> <span>立即签到</span>`;
        quickSignBtn.classList.remove("btn-secondary");
        quickSignBtn.classList.add("btn-primary", "btn-glow");
    }
    
    // Render Announcements list (limit 3)
    const announceList = document.getElementById("dashAnnounceList");
    announceList.innerHTML = "";
    
    const recentAnnouncements = state.announcements.slice(0, 3);
    recentAnnouncements.forEach(ann => {
        const card = document.createElement("div");
        card.className = "announce-item-preview";
        
        let iconBg = "bg-indigo";
        let icon = "fa-bullhorn";
        if (ann.category === "Important") {
            iconBg = "bg-danger";
            icon = "fa-triangle-exclamation";
        } else if (ann.category === "Activities") {
            iconBg = "bg-success";
            icon = "fa-people-group";
        }
        
        card.innerHTML = `
            <div class="announce-preview-icon ${iconBg}"><i class="fa-solid ${icon}"></i></div>
            <div class="preview-title-block">
                <span class="preview-title">${ann.title}</span>
                <span class="preview-meta"><span>${ann.publisher}</span> • <span>${ann.date}</span></span>
            </div>
        `;
        card.addEventListener("click", async () => {
            if (ann.unreadBy && ann.unreadBy.includes(state.currentUser.id)) {
                try {
                    await fetch('/api/announcements/read', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ announcement_id: ann.id, user_id: state.currentUser.id })
                    });
                } catch (e) {}
                ann.unreadBy = ann.unreadBy.filter(id => id !== state.currentUser.id);
                updateNotificationBadge();
            }
            navigateToSection("announcements");
            const element = document.querySelector(`[data-id="${ann.id}"]`);
            if (element) {
                element.scrollIntoView({ behavior: "smooth" });
            }
        });
        announceList.appendChild(card);
    });
    
    // Render Forum hot posts (limit 3)
    const dashForumList = document.getElementById("dashForumList");
    dashForumList.innerHTML = "";
    
    const recentPosts = state.posts.slice(0, 3);
    recentPosts.forEach(post => {
        const item = document.createElement("div");
        item.className = "preview-item";
        
        // Support replies count from API mapping or length
        const repliesCount = post.repliesCount !== undefined ? post.repliesCount : (post.replies ? post.replies.length : 0);
        
        item.innerHTML = `
            <div class="preview-title-block">
                <span class="preview-title">${post.title}</span>
                <span class="preview-meta"><span>${post.authorName}</span> • <span>${post.date}</span></span>
            </div>
            <span class="preview-replies">${repliesCount} 回复</span>
        `;
        item.addEventListener("click", () => {
            navigateToSection("forum");
            openPostDetailModal(post.id);
        });
        dashForumList.appendChild(item);
    });
    
    // Draw dynamic SVG chart
    renderTrendChart(todaySigned);
}

async function renderTrendChart(todaySigned) {
    const totalStudents = state.members.filter(m => m.id !== "advisor").length;
    
    let weekData = [5, 4, todaySigned, 0, 0, 0, 0];
    try {
        const res = await fetch('/api/signins/trend');
        const trend = await res.json();
        weekData = trend.counts;
    } catch (e) {}
    
    const rates = weekData.map((count, index) => {
        if (index > 2) return 0; // Future days
        return totalStudents > 0 ? (count / totalStudents) * 100 : 0;
    });
    
    const points = [];
    const chartWidth = 336;
    const chartHeight = 120;
    const startX = 40;
    const startY = 140;
    
    rates.forEach((rate, i) => {
        const x = startX + (i * (chartWidth / 6));
        const y = startY - (rate * (chartHeight / 100));
        points.push({x, y});
    });
    
    const linePath = document.getElementById("chartLinePath");
    const areaPath = document.getElementById("chartAreaPath");
    const nodesGroup = document.getElementById("chartNodes");
    
    if (!linePath || !areaPath || !nodesGroup) return;
    nodesGroup.innerHTML = "";
    
    let pathD = `M ${points[0].x} ${points[0].y}`;
    let areaD = `M ${points[0].x} ${startY} L ${points[0].x} ${points[0].y}`;
    
    points.forEach((pt, i) => {
        if (i > 0) {
            pathD += ` L ${pt.x} ${pt.y}`;
            areaD += ` L ${pt.x} ${pt.y}`;
        }
        
        if (i <= 2) {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", pt.x);
            circle.setAttribute("cy", pt.y);
            circle.setAttribute("r", 4);
            circle.setAttribute("fill", "#10b981");
            circle.setAttribute("stroke", "#ffffff");
            circle.setAttribute("stroke-width", "1.5");
            nodesGroup.appendChild(circle);
            
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", pt.x);
            text.setAttribute("y", pt.y - 8);
            text.setAttribute("fill", "white");
            text.setAttribute("font-size", "9");
            text.setAttribute("text-anchor", "middle");
            text.textContent = `${Math.round(rates[i])}%`;
            nodesGroup.appendChild(text);
        }
    });
    
    areaD += ` L ${points[2].x} ${startY} Z`;
    
    linePath.setAttribute("d", pathD);
    areaPath.setAttribute("d", areaD);
}

// Binds Quick Sign button
document.getElementById("quickSignBtn").addEventListener("click", () => {
    triggerSignIn("工科楼 402 实验室", "仪表盘快速打卡");
});

// ==========================================================================
// RENDER: SIGN-IN VIEW
// ==========================================================================

const _calNow = new Date();
let calendarCurrentMonth = _calNow.getMonth();    // 动态获取当前月份（0-indexed）
let calendarCurrentYear = _calNow.getFullYear();  // 动态获取当前年份

async function triggerSignIn(location, notes) {
    const isSigned = await checkUserSignedToday();
    
    if (isSigned) {
        showToast("您今天已经签到过了！", "warning");
        return;
    }
    
    try {
        const res = await fetch('/api/signins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: state.currentUser.id,
                userName: state.currentUser.name,
                location: location,
                notes: notes || "学术打卡完成",
                date: state.currentDate
            })
        });
        
        const data = await res.json();
        if (data.error) {
            showToast(data.error, "error");
            return;
        }
        
        if (data.ipWarning) {
            showToast("系统检测到同IP多人签到警告！", "warning");
        }
        showToast(`签到成功！打卡时间 ${data.signin.time} [${location}]`);
    } catch (e) {
        // Fallback to local
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;
        const amPm = now.getHours() < 12 ? "AM" : "PM";
        
        const record = {
            userId: state.currentUser.id,
            userName: state.currentUser.name,
            time: timeStr,
            amPm: amPm,
            location: location,
            notes: notes || "学术打卡完成"
        };
        
        if (!state.signins[state.currentDate]) {
            state.signins[state.currentDate] = [];
        }
        state.signins[state.currentDate].push(record);
        setStorage("gm_signins", state.signins);
        
        showToast(`签到成功 (本地暂存)！打卡时间 ${timeStr}`);
    }
    
    renderDashboard();
    renderSignInView();
}

async function renderSignInView() {
    if (!state.currentUser) return;
    await syncState();
    
    let todayLog = [];
    try {
        const res = await fetch(`/api/signins/today?date=${state.currentDate}`);
        todayLog = await res.json();
    } catch (e) {
        todayLog = state.signins[state.currentDate] || [];
    }
    
    const userLog = todayLog.find(log => log.userId === state.currentUser.id);
    
    const amStatus = document.getElementById("amSignStatus");
    const pmStatus = document.getElementById("pmSignStatus");
    const giantSignBtn = document.getElementById("giantSignBtn");
    const giantSignSub = document.getElementById("giantSignSubtext");
    
    if (userLog) {
        if (userLog.amPm === "AM") {
            amStatus.textContent = `${userLog.time.substring(0, 5)} (已签到)`;
            amStatus.className = "status-value signed";
            pmStatus.textContent = "--:-- (未签到)";
            pmStatus.className = "status-value";
        } else {
            amStatus.textContent = "--:-- (未签到)";
            amStatus.className = "status-value";
            pmStatus.textContent = `${userLog.time.substring(0, 5)} (已签到)`;
            pmStatus.className = "status-value signed";
        }
        
        giantSignBtn.disabled = true;
        giantSignBtn.style.background = "linear-gradient(135deg, #475569, #334155)";
        giantSignBtn.style.cursor = "default";
        giantSignBtn.style.boxShadow = "none";
        giantSignSub.textContent = "今日打卡已完成";
        
        const ripple = giantSignBtn.querySelector(".btn-ripple");
        if (ripple) ripple.remove();
    } else {
        amStatus.textContent = "--:-- (未签到)";
        amStatus.className = "status-value";
        pmStatus.textContent = "--:-- (未签到)";
        pmStatus.className = "status-value";
        
        giantSignBtn.disabled = false;
        giantSignBtn.style.background = "linear-gradient(135deg, var(--primary), var(--success))";
        giantSignBtn.style.cursor = "pointer";
        giantSignBtn.style.boxShadow = "0 8px 30px rgba(99, 102, 241, 0.4)";
        giantSignSub.textContent = "签到即刻记录";
        
        if (!giantSignBtn.querySelector(".btn-ripple")) {
            const ripple = document.createElement("div");
            ripple.className = "btn-ripple";
            giantSignBtn.appendChild(ripple);
        }
    }
    
    // Render Today's Sign-in List
    const todayLogList = document.getElementById("todaySigninLogList");
    todayLogList.innerHTML = "";
    
    const signedCount = todayLog.length;
    const totalStudents = state.members.filter(m => m.id !== "advisor").length;
    document.getElementById("signinCountBadge").textContent = `已签到 ${signedCount}/${totalStudents}`;
    
    if (todayLog.length === 0) {
        todayLogList.innerHTML = `<div class="text-secondary text-sm" style="text-align: center; padding: 20px 0;">今日还没有成员签到</div>`;
    } else {
        todayLog.forEach(log => {
            const item = document.createElement("div");
            item.className = "log-item";
            item.innerHTML = `
                <div class="log-item-left">
                    <div class="avatar avatar-sm">${log.userName.charAt(0)}</div>
                    <div class="log-item-info">
                        <h4>${log.userName}</h4>
                        <p>${log.notes}</p>
                    </div>
                </div>
                <div class="log-item-right">
                    <span class="log-time">${log.time.substring(0, 5)}</span>
                    <span class="log-location-tag">${log.location}</span>
                </div>
            `;
            todayLogList.appendChild(item);
        });
    }
    
    renderCalendar();
}

async function renderCalendar() {
    const calendarMonthYear = document.getElementById("calendarMonthYear");
    const calendarDaysGrid = document.getElementById("calendarDaysGrid");
    
    const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    calendarMonthYear.textContent = `${calendarCurrentYear}年 ${months[calendarCurrentMonth]}`;
    
    calendarDaysGrid.innerHTML = "";
    
    const firstDay = new Date(calendarCurrentYear, calendarCurrentMonth, 1).getDay();
    const totalDays = new Date(calendarCurrentYear, calendarCurrentMonth + 1, 0).getDate();
    const prevMonthTotalDays = new Date(calendarCurrentYear, calendarCurrentMonth, 0).getDate();
    
    // Fetch user's signins from API for calendar
    let monthlySignins = {};
    try {
        const res = await fetch(`/api/signins/calendar?user_id=${state.currentUser.id}&year=${calendarCurrentYear}&month=${calendarCurrentMonth}`);
        monthlySignins = await res.json();
    } catch (e) {
        monthlySignins = state.signins || {};
    }
    
    // Render previous month padding days
    for (let i = firstDay - 1; i >= 0; i--) {
        const dayDiv = document.createElement("div");
        dayDiv.className = "calendar-day other-month";
        dayDiv.textContent = prevMonthTotalDays - i;
        calendarDaysGrid.appendChild(dayDiv);
    }
    
    // Render current month days
    for (let day = 1; day <= totalDays; day++) {
        const dayDiv = document.createElement("div");
        dayDiv.className = "calendar-day";
        dayDiv.textContent = day;
        
        const dateStr = `${calendarCurrentYear}-${String(calendarCurrentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        
        if (dateStr === state.currentDate) {
            dayDiv.classList.add("today");
        }
        
        const dayLogs = monthlySignins[dateStr] || [];
        const isSigned = dayLogs.some(log => log.userId === state.currentUser.id);
        
        if (isSigned) {
            dayDiv.classList.add("signed");
        } else if (dateStr < state.currentDate) {
            const dayOfWeek = new Date(calendarCurrentYear, calendarCurrentMonth, day).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                dayDiv.classList.add("missed");
            }
        }
        
        dayDiv.addEventListener("click", () => {
            showCalendarDayDetail(dateStr);
        });
        
        calendarDaysGrid.appendChild(dayDiv);
    }
    
    // Render next month padding days
    const totalRendered = firstDay + totalDays;
    const nextMonthPadding = 42 - totalRendered;
    for (let i = 1; i <= nextMonthPadding; i++) {
        const dayDiv = document.createElement("div");
        dayDiv.className = "calendar-day other-month";
        dayDiv.textContent = i;
        calendarDaysGrid.appendChild(dayDiv);
    }
}

// Giant sign-in button bind
document.getElementById("giantSignBtn").addEventListener("click", () => {
    const loc = document.getElementById("signinLocationSelect").value;
    const notes = document.getElementById("signinNotes").value;
    triggerSignIn(loc, notes);
});

// Calendar navigation binds
document.getElementById("prevMonthBtn").addEventListener("click", () => {
    calendarCurrentMonth--;
    if (calendarCurrentMonth < 0) {
        calendarCurrentMonth = 11;
        calendarCurrentYear--;
    }
    renderCalendar();
});
document.getElementById("nextMonthBtn").addEventListener("click", () => {
    calendarCurrentMonth++;
    if (calendarCurrentMonth > 11) {
        calendarCurrentMonth = 0;
        calendarCurrentYear++;
    }
    renderCalendar();
});

// ==========================================================================
// RENDER: ANNOUNCEMENTS VIEW
// ==========================================================================

async function renderAnnouncements() {
    if (!state.currentUser) return;
    await syncState();
    
    const container = document.getElementById("announcementsList");
    if (!container) return;
    container.innerHTML = "";
    
    const searchVal = document.getElementById("announceSearch").value.toLowerCase();
    const activeCategory = document.querySelector(".filter-btn.active").dataset.category;
    
    let filtered = state.announcements;
    if (activeCategory !== "all") {
        filtered = filtered.filter(ann => ann.category === activeCategory);
    }
    if (searchVal) {
        filtered = filtered.filter(ann => 
            ann.title.toLowerCase().includes(searchVal) || 
            ann.content.toLowerCase().includes(searchVal) ||
            ann.publisher.toLowerCase().includes(searchVal)
        );
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="glass-card text-secondary" style="text-align: center; padding: 40px 0;">没有匹配的系统公告</div>`;
        return;
    }
    
    filtered.forEach(ann => {
        const card = document.createElement("div");
        card.className = "announce-card";
        card.dataset.id = ann.id;
        
        const isUnread = ann.unreadBy && ann.unreadBy.includes(state.currentUser.id);
        if (isUnread) {
            card.classList.add("unread-border");
        }
        
        let typeBadgeClass = "bg-indigo";
        let typeText = "学术科研";
        if (ann.category === "Important") {
            typeBadgeClass = "bg-danger";
            typeText = "重要通知";
        } else if (ann.category === "Activities") {
            typeBadgeClass = "bg-success";
            typeText = "学术活动";
        }

        let confirmHtml = "";
        if (ann.requiresConfirm) {
            if (state.currentUser.id === "advisor") {
                const confirmedCount = ann.confirmedBy ? ann.confirmedBy.length : 0;
                const totalCount = state.members.filter(m => m.id !== 'advisor').length;
                confirmHtml = `
                    <div class="announcement-confirm-section" style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.05); font-size:13px;">
                        <span>确认进度: <a href="#" class="view-confirms-link" data-ann-id="${ann.id}" style="color:var(--primary); font-weight:600; text-decoration:underline;">已确认成员 (${confirmedCount}/${totalCount})</a></span>
                    </div>
                `;
            } else {
                const isConfirmed = ann.confirmedBy && ann.confirmedBy.includes(state.currentUser.id);
                if (isConfirmed) {
                    confirmHtml = `
                        <div class="announcement-confirm-section" style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.05); font-size:13px; display:flex; align-items:center; gap:6px;">
                          <span class="badge bg-emerald"><i class="fa-solid fa-circle-check"></i> 我已知晓 (已回执)</span>
                        </div>
                    `;
                } else {
                    confirmHtml = `
                        <div class="announcement-confirm-section" style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.05); font-size:13px; display:flex; align-items:center; justify-content:space-between;">
                          <span class="text-amber"><i class="fa-solid fa-circle-exclamation"></i> 本条公告需要您的确认回执</span>
                          <button class="btn btn-primary btn-sm confirm-ann-btn" data-ann-id="${ann.id}" style="padding:4px 10px; font-size:11px;">我已知晓</button>
                        </div>
                    `;
                }
            }
        }

        let annContentHtml = "";
        try {
            annContentHtml = DOMPurify.sanitize(marked.parse(ann.content));
        } catch (e) {
            annContentHtml = ann.content.replace(/\n/g, "<br>");
        }

        card.innerHTML = `
            <div class="announce-header">
                <div class="announce-title-wrapper">
                    <span class="badge ${typeBadgeClass}">${typeText}</span>
                    <h3>${ann.title}</h3>
                </div>
                <span class="text-secondary text-sm">${ann.date}</span>
            </div>
            <div class="announce-body-text markdown-body">${annContentHtml}</div>
            ${confirmHtml}
            <div class="announce-footer">
                <div class="announce-footer-left">
                    <i class="fa-solid fa-signature"></i>
                    <span>发布部门/人: <strong>${ann.publisher}</strong></span>
                </div>
                ${isUnread ? `<span class="text-amber text-sm"><i class="fa-solid fa-circle-exclamation"></i> 未读</span>` : `<span class="text-muted text-sm"><i class="fa-solid fa-circle-check"></i> 已阅</span>`}
            </div>
        `;
        
        card.querySelectorAll("pre code").forEach((block) => {
            hljs.highlightElement(block);
        });

        card.addEventListener("click", async (e) => {
            if (e.target.closest(".confirm-ann-btn") || e.target.closest(".view-confirms-link")) {
                return;
            }
            if (isUnread) {
                try {
                    await fetch('/api/announcements/read', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ announcement_id: ann.id, user_id: state.currentUser.id })
                    });
                } catch (e) {}
                
                ann.unreadBy = ann.unreadBy.filter(id => id !== state.currentUser.id);
                updateNotificationBadge();
                renderAnnouncements();
            }
        });

        const confirmBtn = card.querySelector(".confirm-ann-btn");
        if (confirmBtn) {
            confirmBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const annId = confirmBtn.dataset.annId;
                try {
                    const res = await fetch(`/api/announcements/${annId}/confirm`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: state.currentUser.id })
                    });
                    const result = await res.json();
                    if (result.success) {
                        showToast("回执确认成功！");
                        await syncState();
                        renderAnnouncements();
                        updateNotificationBadge();
                    } else {
                        showToast(result.error || "确认失败", "error");
                    }
                } catch (err) {
                    showToast("连接失败，请检查网络", "error");
                }
            });
        }

        const viewConfirmsLink = card.querySelector(".view-confirms-link");
        if (viewConfirmsLink) {
            viewConfirmsLink.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const annId = viewConfirmsLink.dataset.annId;
                showAnnouncementConfirmations(annId);
            });
        }
        
        container.appendChild(card);
    });
}

// Binds search and filters
document.getElementById("announceSearch").addEventListener("input", renderAnnouncements);
document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderAnnouncements();
    });
});

// Modal publish handles
const pubAnnBtn = document.getElementById("openPublishAnnounceBtn");
const pubAnnModal = document.getElementById("publishAnnounceModal");
const closePubAnn = document.getElementById("closePublishAnnounceBtn");
const cancelPubAnn = document.getElementById("cancelAnnounceBtn");

pubAnnBtn.addEventListener("click", () => {
    pubAnnModal.classList.add("active");
    const adminAlert = document.getElementById("adminOnlyAlert");
    if (state.currentUser.id === "advisor") {
        adminAlert.style.display = "none";
        document.getElementById("announcePublisher").value = "陈教授";
    } else {
        adminAlert.style.display = "block";
        document.getElementById("announcePublisher").value = "陈教授 (模拟代发)";
    }
});

const closeAnnounceModal = () => {
    pubAnnModal.classList.remove("active");
    document.getElementById("newAnnounceForm").reset();
};
closePubAnn.addEventListener("click", closeAnnounceModal);
cancelPubAnn.addEventListener("click", closeAnnounceModal);

document.getElementById("newAnnounceForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("announceTitle").value;
    const category = document.getElementById("announceCategory").value;
    const publisher = document.getElementById("announcePublisher").value;
    const content = document.getElementById("announceContent").value;
    const requiresConfirm = document.getElementById("announceRequiresConfirm").checked;
    
    try {
        const res = await fetch('/api/announcements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, category, publisher, content, requiresConfirm })
        });
        
        showToast("新公告发布成功！");
        closeAnnounceModal();
        await syncState();
        renderAnnouncements();
        updateNotificationBadge();
    } catch (err) {
        showToast("发布失败，请检查网络", "error");
    }
});

// ==========================================================================
// RENDER: ACADEMIC FORUM VIEW
// ==========================================================================

async function renderForum() {
    if (!state.currentUser) return;
    await syncState();
    
    const postContainer = document.getElementById("forumPostList");
    if (!postContainer) return;
    postContainer.innerHTML = "";
    
    const searchVal = document.getElementById("forumSearch").value.toLowerCase();
    const activeCategory = document.querySelector(".forum-tab-btn.active").dataset.category;
    
    let filtered = state.posts;
    if (activeCategory !== "all") {
        filtered = filtered.filter(p => p.category === activeCategory);
    }
    if (searchVal) {
        filtered = filtered.filter(p => 
            p.title.toLowerCase().includes(searchVal) ||
            p.content.toLowerCase().includes(searchVal) ||
            p.authorName.toLowerCase().includes(searchVal)
        );
    }
    
    // Render Stats
    document.getElementById("forumTotalPosts").textContent = state.posts.length;
    const totalReplies = state.posts.reduce((sum, p) => sum + (p.repliesCount || 0), 0);
    document.getElementById("forumTotalReplies").textContent = totalReplies;
    
    if (filtered.length === 0) {
        postContainer.innerHTML = `<div class="glass-card text-secondary" style="text-align: center; padding: 40px 0;">暂无匹配的贴子</div>`;
        return;
    }
    
    filtered.forEach(post => {
        const card = document.createElement("div");
        card.className = "forum-post-card";
        card.dataset.postId = post.id;
        
        let sectBadge = "学术科研";
        let sectClass = "badge-indigo";
        if (post.category === "Daily") { sectBadge = "日常生活"; sectClass = "bg-success"; }
        if (post.category === "Project") { sectBadge = "项目进展"; sectClass = "bg-secondary"; }
        
        const tagsHtml = post.tags.map(t => `<span class="post-tag">#${t}</span>`).join("");
        const countReplies = post.repliesCount !== undefined ? post.repliesCount : (post.replies ? post.replies.length : 0);
        
        card.innerHTML = `
            <div class="forum-post-header">
                <div class="forum-post-title-wrapper">
                    <span class="badge ${sectClass}" style="align-self: flex-start;">${sectBadge}</span>
                    <h3>${post.title}</h3>
                </div>
                <span class="text-secondary text-sm">${post.date}</span>
            </div>
            <p class="forum-post-body-snippet">${post.content}</p>
            <div class="forum-post-footer">
                <div class="post-footer-left">
                    <div class="avatar avatar-sm" style="width:24px; height:24px; font-size:10px;">${post.authorName.charAt(0)}</div>
                    <span><strong>${post.authorName}</strong> (${post.authorRole})</span>
                </div>
                <div class="post-footer-right">
                    <div class="post-tags-container">${tagsHtml}</div>
                    <div class="post-stat text-indigo"><i class="fa-regular fa-comment-dots"></i> <span>${countReplies}</span></div>
                    <div class="post-stat"><i class="fa-regular fa-eye"></i> <span>${post.views}</span></div>
                </div>
            </div>
        `;
        
        card.addEventListener("click", () => {
            openPostDetailModal(post.id);
        });
        
        postContainer.appendChild(card);
    });
}

// Binds searches and tabs
document.getElementById("forumSearch").addEventListener("input", renderForum);
document.querySelectorAll(".forum-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".forum-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderForum();
    });
});

// New post modal handlers
const newPostModal = document.getElementById("newPostModal");
const openNewPostBtn = document.getElementById("openNewPostBtn");
const closeNewPostBtn = document.getElementById("closeNewPostBtn");
const cancelPostBtn = document.getElementById("cancelPostBtn");
const postContentInput = document.getElementById("postContent");

if (postContentInput) {
    postContentInput.addEventListener("input", (e) => {
        localStorage.setItem("gm_forum_draft", e.target.value);
    });
}

openNewPostBtn.addEventListener("click", () => {
    newPostModal.classList.add("active");
    const savedDraft = localStorage.getItem("gm_forum_draft");
    if (savedDraft && postContentInput) {
        postContentInput.value = savedDraft;
    }
});

const closePostModal = () => {
    newPostModal.classList.remove("active");
    document.getElementById("newPostForm").reset();
};
closeNewPostBtn.addEventListener("click", closePostModal);
cancelPostBtn.addEventListener("click", closePostModal);

document.getElementById("newPostForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("postTitle").value;
    const category = document.getElementById("postCategory").value;
    const tagVal = document.getElementById("postTag").value;
    const content = document.getElementById("postContent").value;
    
    const tags = tagVal ? tagVal.split(",").map(t => t.trim()).filter(t => t) : ["日常"];
    
    try {
        await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                category,
                content,
                authorId: state.currentUser.id,
                authorName: state.currentUser.name,
                authorRole: state.currentUser.role,
                tags
            })
        });
        
        showToast("论坛帖子发布成功！");
        localStorage.removeItem("gm_forum_draft");
        closePostModal();
        await syncState();
        renderForum();
    } catch (err) {
        showToast("发帖失败", "error");
    }
});

// ==========================================================================
// FORUM DETAIL VIEW & COMMENTS
// ==========================================================================

let activePostDetailId = null;

async function openPostDetailModal(postId) {
    try {
        const res = await fetch(`/api/posts/${postId}`);
        const post = await res.json();
        
        activePostDetailId = postId;
        const modal = document.getElementById("postDetailModal");
        
        const catBadge = document.getElementById("detailPostCategory");
        let catText = "学术科研";
        let catClass = "badge-indigo";
        if (post.category === "Daily") { catText = "日常生活"; catClass = "bg-success"; }
        if (post.category === "Project") { catText = "项目进展"; catClass = "bg-secondary"; }
        catBadge.textContent = catText;
        catBadge.className = `badge ${catClass}`;
        
        document.getElementById("detailPostTitle").textContent = post.title;
        document.getElementById("detailPostAvatar").textContent = post.authorName.charAt(0);
        document.getElementById("detailPostAuthor").textContent = post.authorName;
        document.getElementById("detailPostAuthorRole").textContent = post.authorRole;
        document.getElementById("detailPostTime").innerHTML = `<i class="fa-regular fa-clock"></i> ${post.date}`;
        const postContentEl = document.getElementById("detailPostContent");
        postContentEl.classList.add("markdown-body");
        try {
            postContentEl.innerHTML = DOMPurify.sanitize(marked.parse(post.content));
        } catch (e) {
            postContentEl.innerHTML = post.content.replace(/\n/g, "<br>");
        }
        postContentEl.querySelectorAll("pre code").forEach((block) => {
            hljs.highlightElement(block);
        });
        
        const tagsContainer = document.getElementById("detailPostTags");
        tagsContainer.innerHTML = post.tags.map(t => `<span class="post-tag">#${t}</span>`).join("");
        
        document.getElementById("replyAsUser").textContent = state.currentUser.name;
        
        renderRepliesList(post);
        modal.classList.add("active");
    } catch (err) {
        showToast("加载帖子详情失败", "error");
    }
}

function renderRepliesList(post) {
    const list = document.getElementById("detailRepliesList");
    if (!list) return;
    list.innerHTML = "";
    document.getElementById("detailRepliesCount").textContent = post.replies.length;
    
    if (post.replies.length === 0) {
        list.innerHTML = `<div class="text-secondary text-sm" style="text-align: center; padding: 20px 0;">暂无回帖，发表你的看法吧~</div>`;
        return;
    }
    
    post.replies.forEach(rep => {
        const item = document.createElement("div");
        item.className = "reply-item";
        
        let replyHtml = "";
        try {
            replyHtml = DOMPurify.sanitize(marked.parse(rep.content));
        } catch (e) {
            replyHtml = rep.content.replace(/\n/g, "<br>");
        }

        item.innerHTML = `
            <div class="reply-header">
                <div class="reply-author">
                    <div class="avatar avatar-sm" style="width:20px; height:20px; font-size:9px;">${rep.authorName.charAt(0)}</div>
                    <span class="reply-author-name">${rep.authorName}</span>
                    <span class="author-badge">${rep.authorRole}</span>
                </div>
                <span>${rep.date}</span>
            </div>
            <div class="reply-body-text markdown-body">${replyHtml}</div>
        `;
        item.querySelectorAll(".reply-body-text pre code").forEach((block) => {
            hljs.highlightElement(block);
        });
        list.appendChild(item);
    });
}

// Close detail modal Binds
const detailModal = document.getElementById("postDetailModal");
const closeDetailBtn = document.getElementById("closePostDetailBtn");
closeDetailBtn.addEventListener("click", () => {
    detailModal.classList.remove("active");
    document.getElementById("newReplyForm").reset();
    activePostDetailId = null;
    renderForum();
});

// Reply submission
document.getElementById("newReplyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activePostDetailId) return;
    
    const content = document.getElementById("replyContent").value;
    
    try {
        await fetch(`/api/posts/${activePostDetailId}/replies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                authorId: state.currentUser.id,
                authorName: state.currentUser.name,
                authorRole: state.currentUser.role,
                content
            })
        });
        
        showToast("回帖成功！");
        document.getElementById("replyContent").value = "";
        
        const res = await fetch(`/api/posts/${activePostDetailId}`);
        const post = await res.json();
        renderRepliesList(post);
        
        const list = document.getElementById("detailRepliesList");
        if (list && list.lastElementChild) {
            list.lastElementChild.scrollIntoView({ behavior: "smooth" });
        }
    } catch (err) {
        showToast("回帖提交失败", "error");
    }
});

// ==========================================================================
// RENDER: MEMBER DIRECTORY VIEW
// ==========================================================================

async function renderMembers() {
    if (!state.currentUser) return;
    await syncState();
    
    const grid = document.getElementById("membersGrid");
    if (!grid) return;
    grid.innerHTML = "";
    
    const searchVal = document.getElementById("memberSearch").value.toLowerCase();
    
    let filtered = state.members;
    if (searchVal) {
        filtered = filtered.filter(m => 
            m.name.toLowerCase().includes(searchVal) ||
            m.role.toLowerCase().includes(searchVal) ||
            m.research.toLowerCase().includes(searchVal) ||
            m.studentId.toLowerCase().includes(searchVal)
        );
    }
    
    filtered.forEach(m => {
        const card = document.createElement("div");
        card.className = "member-card";
        
        const isAdvisor = m.id === "advisor";
        if (isAdvisor) card.classList.add("is-advisor");
        
        const roleBadgeClass = isAdvisor ? "role-advisor" : "role-student";
        
        card.innerHTML = `
            <div class="member-avatar">${m.name.charAt(0)}</div>
            <span class="member-role-badge ${roleBadgeClass}">${m.role}</span>
            <h3 class="member-name">${m.name}</h3>
            <p class="member-grade">${m.grade}</p>
            <div class="member-detail-rows">
                <div class="detail-row">
                    <span class="label">学工号</span>
                    <span class="value">${m.studentId}</span>
                </div>
                <div class="detail-row">
                    <span class="label">主要研究方向</span>
                    <span class="value">${m.research}</span>
                </div>
                <div class="detail-row">
                    <span class="label">联系方式</span>
                    <span class="value">${m.contact || "未填写"}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

document.getElementById("memberSearch").addEventListener("input", renderMembers);

// Add member modals
const addMemBtn = document.getElementById("openAddMemberBtn");
const addMemModal = document.getElementById("addMemberModal");
const closeAddMem = document.getElementById("closeAddMemberBtn");
const cancelAddMem = document.getElementById("cancelMemberBtn");

addMemBtn.addEventListener("click", () => addMemModal.classList.add("active"));
const closeMemModal = () => {
    addMemModal.classList.remove("active");
    document.getElementById("newMemberForm").reset();
};
closeAddMem.addEventListener("click", closeMemModal);
cancelAddMem.addEventListener("click", closeMemModal);

document.getElementById("newMemberForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("memberName").value;
    const role = document.getElementById("memberRole").value;
    const grade = document.getElementById("memberGrade").value;
    const studentId = document.getElementById("memberId").value;
    const research = document.getElementById("memberResearch").value;
    const contact = document.getElementById("memberContact").value;
    
    try {
        const res = await fetch('/api/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, role, grade, studentId, research, contact })
        });
        const data = await res.json();
        if (data.error) {
            showToast(data.error, "error");
            return;
        }
        
        showToast(`新成员 ${name} 添加成功！`);
        closeMemModal();
        await syncState();
        populateRoleSelector();
        renderMembers();
    } catch (err) {
        showToast("添加成员失败", "error");
    }
});

// ==========================================================================
// STUDENT SELF REGISTRATION MODAL HANDLERS
// ==========================================================================

function initRegisterStudent() {
    const openBtn = document.getElementById("openRegisterBtn");
    const modal = document.getElementById("registerStudentModal");
    const closeBtn = document.getElementById("closeRegisterStudentBtn");
    const cancelBtn = document.getElementById("cancelRegisterStudentBtn");
    const form = document.getElementById("registerStudentForm");
    
    if (!openBtn || !modal) return;
    
    openBtn.addEventListener("click", (e) => {
        e.preventDefault();
        modal.classList.add("active");
    });
    
    const closeModal = () => {
        modal.classList.remove("active");
        form.reset();
    };
    
    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });
    
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const name = document.getElementById("regName").value.trim();
        const role = document.getElementById("regRole").value;
        const grade = document.getElementById("regGrade").value.trim();
        const studentId = document.getElementById("regStudentId").value.trim();
        const password = document.getElementById("regPassword").value;
        const research = document.getElementById("regResearch").value.trim();
        const contact = document.getElementById("regContact").value.trim();
        
        try {
            const res = await fetch('/api/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, role, grade, studentId, password, research, contact })
            });
            const data = await res.json();
            if (data.error) {
                showToast(data.error, "error");
                return;
            }
            
            showToast("注册成功！已为您自动登录该学生账号。");
            closeModal();
            
            const loginBackdrop = document.getElementById("loginBackdrop");
            if (loginBackdrop) {
                loginBackdrop.classList.remove("active");
            }
            
            await syncState();
            
            // Log in as new student
            state.currentUser = data.member;
            localStorage.setItem("gm_current_user_id", data.member.id);
            
            updateCurrentUserProfileUI();
            
            // Refresh views
            const activeSection = document.querySelector(".view-section.active").id;
            if (activeSection === "view-dashboard") renderDashboard();
            if (activeSection === "view-signin") renderSignInView();
            if (activeSection === "view-announcements") renderAnnouncements();
            if (activeSection === "view-forum") renderForum();
            if (activeSection === "view-members") renderMembers();
            
        } catch (err) {
            showToast("注册连接超时，请重试", "error");
        }
    });
}

// ==========================================================================
// APPLICATION ENTRY POINT
// ==========================================================================

// ==========================================================================
// NEW FEATURES IMPLEMENTATION DETAILS & HELPERS
// ==========================================================================

async function showCalendarDayDetail(dateStr) {
    const modal = document.getElementById("calendarDetailModal");
    const title = document.getElementById("calDetailDate");
    const body = document.getElementById("calDetailBody");
    if (!modal || !title || !body) return;

    title.textContent = `${dateStr} 签到与考勤详情`;
    body.innerHTML = `<div class="text-secondary" style="text-align:center;padding:20px 0;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</div>`;
    modal.classList.add("active");

    try {
        const resSignins = await fetch(`/api/signins/today?date=${dateStr}`);
        const daySignins = await resSignins.json();

        let leaveRequests = [];
        if (state.currentUser.id === "advisor") {
            const resLeaves = await fetch(`/api/leave-requests`);
            leaveRequests = await resLeaves.json();
        } else {
            const resLeaves = await fetch(`/api/leave-requests?user_id=${state.currentUser.id}`);
            leaveRequests = await resLeaves.json();
        }
        const dayLeaves = leaveRequests.filter(req => req.date === dateStr);

        let html = "";

        if (state.currentUser.id === "advisor") {
            html += `<div class="advisor-cal-detail" style="display:flex; flex-direction:column; gap:12px; max-height:400px; overflow-y:auto; padding-right:4px;">`;
            
            const students = state.members.filter(m => m.id !== "advisor");
            const ipCounts = {};
            daySignins.forEach(s => {
                if (s.clientIp) {
                    ipCounts[s.clientIp] = (ipCounts[s.clientIp] || 0) + 1;
                }
            });

            students.forEach(student => {
                const studentSignins = daySignins.filter(s => s.userId === student.id);
                const studentLeaves = dayLeaves.filter(l => l.userId === student.id);
                
                let statusHtml = "";
                let infoHtml = "";
                
                if (studentSignins.length > 0) {
                    studentSignins.forEach(s => {
                        const isLate = s.status === "late";
                        const isOutside = s.status === "outside_window";
                        let statusText = "正常";
                        let badgeClass = "bg-emerald";
                        if (isLate) { statusText = "迟到"; badgeClass = "bg-amber"; }
                        else if (isOutside) { statusText = "窗口外"; badgeClass = "bg-secondary"; }
                        
                        let ipWarningHtml = "";
                        if (s.clientIp && ipCounts[s.clientIp] >= 2) {
                            ipWarningHtml = `<span class="badge bg-danger" style="font-size:10px;"><i class="fa-solid fa-triangle-exclamation"></i> IP代签警告 (${s.clientIp})</span>`;
                        }

                        statusHtml += `<span class="badge ${badgeClass}">${s.amPm === "AM" ? "上午" : "下午"}${statusText}</span> ${ipWarningHtml}`;
                        infoHtml += `<p style="margin:4px 0 0 0; font-size:12px; color:var(--text-secondary);">
                            时间: ${s.time.substring(0,5)} | 地点: ${s.location}<br>
                            ${s.notes ? `备注: ${s.notes}` : ""}
                        </p>`;
                    });
                } else if (studentLeaves.length > 0) {
                    const l = studentLeaves[0];
                    let statusText = "请假审批中";
                    let badgeClass = "bg-amber";
                    if (l.status === "approved") {
                        statusText = l.type === "leave" ? "请假已批准" : "补签已批准";
                        badgeClass = "bg-emerald";
                    } else if (l.status === "rejected") {
                        statusText = "申请被拒绝";
                        badgeClass = "bg-danger";
                    }
                    statusHtml = `<span class="badge ${badgeClass}">${statusText}</span>`;
                    infoHtml = `<p style="margin:4px 0 0 0; font-size:12px; color:var(--text-secondary);">理由: ${l.reason}</p>`;
                } else {
                    const dayOfWeek = new Date(dateStr).getDay();
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                        statusHtml = `<span class="badge bg-secondary">周末未排卡</span>`;
                    } else {
                        statusHtml = `<span class="badge bg-danger">缺勤</span>`;
                    }
                }

                html += `
                    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="color:var(--text-primary);">${student.name} (${student.role})</strong>
                            <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">${statusHtml}</div>
                        </div>
                        ${infoHtml}
                    </div>
                `;
            });

            html += `</div>`;
        } else {
            const mySignins = daySignins.filter(s => s.userId === state.currentUser.id);
            const myLeaves = dayLeaves;

            html += `<div style="display:flex; flex-direction:column; gap:16px;">`;

            if (mySignins.length === 0 && myLeaves.length === 0) {
                const dayOfWeek = new Date(dateStr).getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                html += `
                    <div style="text-align:center; padding:20px; color:var(--text-secondary);">
                        <i class="fa-regular fa-calendar-times" style="font-size:32px; margin-bottom:8px; display:block; color:var(--text-muted);"></i>
                        ${isWeekend ? "今天是周末，无需签到打卡。" : "此日期您没有任何签到记录或请假补签申请。"}
                    </div>
                `;
            } else {
                if (mySignins.length > 0) {
                    html += `<div><h4 style="margin:0 0 8px 0; color:var(--primary); font-size:14px;"><i class="fa-solid fa-fingerprint"></i> 签到记录</h4>`;
                    mySignins.forEach(s => {
                        const isLate = s.status === "late";
                        const isOutside = s.status === "outside_window";
                        let statusText = "正常";
                        let badgeClass = "bg-emerald";
                        if (isLate) { statusText = "迟到"; badgeClass = "bg-amber"; }
                        else if (isOutside) { statusText = "窗口外"; badgeClass = "bg-secondary"; }

                        html += `
                            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:8px; margin-bottom:8px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                    <span style="font-weight:600;">${s.amPm === "AM" ? "上午签到" : "下午签到"}</span>
                                    <span class="badge ${badgeClass}">${statusText}</span>
                                </div>
                                <p style="margin:4px 0; font-size:13px; color:var(--text-secondary);">时间: ${s.time} | 地点: ${s.location}</p>
                                ${s.notes ? `<p style="margin:4px 0 0 0; font-size:12px; color:var(--text-muted);">备注: ${s.notes}</p>` : ""}
                            </div>
                        `;
                    });
                    html += `</div>`;
                }

                if (myLeaves.length > 0) {
                    html += `<div><h4 style="margin:12px 0 8px 0; color:var(--success); font-size:14px;"><i class="fa-solid fa-file-signature"></i> 请假/补签申请</h4>`;
                    myLeaves.forEach(l => {
                        let statusText = "待审批";
                        let badgeClass = "status-pending";
                        if (l.status === "approved") { statusText = "已批准"; badgeClass = "status-approved"; }
                        else if (l.status === "rejected") { statusText = "已拒绝"; badgeClass = "status-rejected"; }

                        html += `
                            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:8px; margin-bottom:8px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                    <span style="font-weight:600;">${l.type === "leave" ? "请假申请" : "补签申请"}</span>
                                    <span class="card-tag ${badgeClass}">${statusText}</span>
                                </div>
                                <p style="margin:4px 0; font-size:13px; color:var(--text-secondary);">事由: ${l.reason}</p>
                                ${l.reviewerNote ? `<p style="margin:4px 0 0 0; font-size:12px; color:var(--text-amber);">导师批复: ${l.reviewerNote}</p>` : ""}
                            </div>
                        `;
                    });
                    html += `</div>`;
                }
            }

            html += `</div>`;
        }

        body.innerHTML = html;
    } catch (err) {
        body.innerHTML = `<div class="text-danger" style="text-align:center;padding:20px 0;">加载考勤详情失败: ${err.message}</div>`;
    }
}

async function showAnnouncementConfirmations(annId) {
    const modal = document.getElementById("calendarDetailModal");
    const title = document.getElementById("calDetailDate");
    const body = document.getElementById("calDetailBody");
    if (!modal || !title || !body) return;

    title.textContent = "公告确认回执名单";
    body.innerHTML = `<div class="text-secondary" style="text-align:center;padding:20px 0;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</div>`;
    modal.classList.add("active");

    try {
        const res = await fetch(`/api/announcements/${annId}/confirmations`);
        const list = await res.json();
        
        let html = `<div style="max-height:400px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">`;
        if (list.length === 0) {
            html += `<div style="text-align:center; color:var(--text-secondary); padding:20px 0;">暂无成员确认</div>`;
        } else {
            list.forEach(c => {
                html += `
                    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                        <strong>${c.name}</strong>
                        <span style="font-size:12px; color:var(--text-secondary);"><i class="fa-solid fa-check text-success"></i> 已确认于 ${c.confirmedAt}</span>
                    </div>
                `;
            });
        }
        html += `</div>`;
        body.innerHTML = html;
    } catch (err) {
        body.innerHTML = `<div class="text-danger" style="text-align:center;padding:20px 0;">加载确认名单失败: ${err.message}</div>`;
    }
}

function initMobileMenu() {
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const mobileOverlay = document.getElementById("mobileOverlay");
    const sidebar = document.querySelector(".sidebar");
    
    if (!hamburgerBtn || !mobileOverlay || !sidebar) return;
    
    const toggleSidebar = () => {
        sidebar.classList.toggle("active");
        hamburgerBtn.classList.toggle("active");
        mobileOverlay.classList.toggle("active");
    };
    
    const closeSidebar = () => {
        sidebar.classList.remove("active");
        hamburgerBtn.classList.remove("active");
        mobileOverlay.classList.remove("active");
    };
    
    hamburgerBtn.addEventListener("click", toggleSidebar);
    mobileOverlay.addEventListener("click", closeSidebar);
    
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", () => {
            if (window.innerWidth <= 900) {
                closeSidebar();
            }
        });
    });
}

function initLeaveRequests() {
    const openBtn = document.getElementById("openLeaveRequestBtn");
    const modal = document.getElementById("leaveRequestModal");
    const closeBtn = document.getElementById("closeLeaveRequestBtn");
    const cancelBtn = document.getElementById("cancelLeaveBtn");
    const form = document.getElementById("leaveRequestForm");
    
    if (!openBtn || !modal) return;
    
    const showModal = () => {
        modal.classList.add("active");
        const isAdvisor = state.currentUser.id === "advisor";
        const reviewTab = document.getElementById("leaveReviewTab");
        if (reviewTab) {
            reviewTab.style.display = isAdvisor ? "inline-flex" : "none";
        }
        
        switchLeaveTab("submit");
        loadMyLeaveRequests();
        if (isAdvisor) {
            loadReviewLeaveRequests();
        }
    };
    
    const closeModal = () => {
        modal.classList.remove("active");
        form.reset();
    };
    
    openBtn.addEventListener("click", showModal);
    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });
    
    const tabs = document.querySelectorAll(".leave-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            
            const targetPane = tab.dataset.tab;
            switchLeaveTab(targetPane);
        });
    });
    
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const date = document.getElementById("leaveDate").value;
        const type = document.getElementById("leaveType").value;
        const reason = document.getElementById("leaveReason").value;
        
        try {
            const res = await fetch('/api/leave-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: state.currentUser.id,
                    userName: state.currentUser.name,
                    date: date,
                    type: type,
                    reason: reason
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast("申请提交成功，等待导师审批！");
                form.reset();
                switchLeaveTab("history");
                loadMyLeaveRequests();
            } else {
                showToast(data.error || "提交失败", "error");
            }
        } catch (err) {
            showToast("请求失败，请检查网络", "error");
        }
    });
}

function switchLeaveTab(tabName) {
    const panes = document.querySelectorAll(".leave-tab-pane");
    panes.forEach(p => p.classList.remove("active"));
    
    const tabs = document.querySelectorAll(".leave-tab");
    tabs.forEach(t => {
        if (t.dataset.tab === tabName) {
            t.classList.add("active");
        } else {
            t.classList.remove("active");
        }
    });

    if (tabName === "submit") {
        document.getElementById("leaveTabSubmit").classList.add("active");
    } else if (tabName === "history") {
        document.getElementById("leaveTabHistory").classList.add("active");
        loadMyLeaveRequests();
    } else if (tabName === "review") {
        document.getElementById("leaveTabReview").classList.add("active");
        loadReviewLeaveRequests();
    }
}

async function loadMyLeaveRequests() {
    const container = document.getElementById("myLeaveList");
    if (!container) return;
    container.innerHTML = `<div class="text-secondary" style="text-align:center;padding:20px 0;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</div>`;
    
    try {
        const res = await fetch(`/api/leave-requests?user_id=${state.currentUser.id}`);
        const list = await res.json();
        
        if (list.length === 0) {
            container.innerHTML = `<div class="text-secondary" style="text-align:center;padding:20px 0;">您还没有提交过任何请假/补签申请。</div>`;
            return;
        }
        
        let html = '<div style="display:flex; flex-direction:column; gap:10px;">';
        list.forEach(req => {
            let statusText = "待审批";
            let badgeClass = "status-pending";
            if (req.status === "approved") { statusText = "已批准"; badgeClass = "status-approved"; }
            else if (req.status === "rejected") { statusText = "已拒绝"; badgeClass = "status-rejected"; }
            
            html += `
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:12px; border-radius:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <strong>${req.type === "leave" ? "请假申请" : "补签申请"} (${req.date})</strong>
                        <span class="card-tag ${badgeClass}">${statusText}</span>
                    </div>
                    <p style="margin:4px 0; font-size:13px; color:var(--text-secondary);">事由: ${req.reason}</p>
                    <span style="font-size:11px; color:var(--text-muted);">提交于: ${req.submittedAt}</span>
                    ${req.reviewerNote ? `<div style="margin-top:6px; padding-top:6px; border-top:1px dashed rgba(255,255,255,0.05); font-size:12px; color:var(--text-amber);">批复: ${req.reviewerNote} (${req.reviewedAt})</div>` : ""}
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="text-danger" style="text-align:center;padding:20px 0;">加载失败: ${err.message}</div>`;
    }
}

async function loadReviewLeaveRequests() {
    const container = document.getElementById("reviewLeaveList");
    if (!container) return;
    container.innerHTML = `<div class="text-secondary" style="text-align:center;padding:20px 0;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</div>`;
    
    try {
        const res = await fetch(`/api/leave-requests`);
        const list = await res.json();
        
        const pendingList = list.filter(req => req.status === "pending");
        
        if (pendingList.length === 0) {
            container.innerHTML = `<div class="text-secondary" style="text-align:center;padding:20px 0;">当前暂无待审批的申请。</div>`;
            return;
        }
        
        let html = '<div style="display:flex; flex-direction:column; gap:12px;">';
        pendingList.forEach(req => {
            html += `
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:12px; border-radius:8px;" class="review-req-card" data-req-id="${req.id}">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <strong>${req.userName} — ${req.type === "leave" ? "请假" : "补签"} (${req.date})</strong>
                        <span class="card-tag status-pending">待审批</span>
                    </div>
                    <p style="margin:4px 0 8px 0; font-size:13px; color:var(--text-secondary);">理由: ${req.reason}</p>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <input type="text" placeholder="审批批复/备注 (选填)..." class="form-control reviewer-note-input" style="font-size:12px; padding:6px 10px; height:auto;" />
                        <div style="display:flex; gap:6px; justify-content:flex-end;">
                            <button class="btn btn-secondary btn-sm reject-btn" data-req-id="${req.id}" style="padding:4px 10px; font-size:11px;">拒绝</button>
                            <button class="btn btn-primary btn-sm approve-btn" data-req-id="${req.id}" style="padding:4px 10px; font-size:11px;">批准</button>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
        
        container.querySelectorAll(".approve-btn").forEach(btn => {
            btn.addEventListener("click", () => handleReviewAction(btn.dataset.reqId, "approve"));
        });
        container.querySelectorAll(".reject-btn").forEach(btn => {
            btn.addEventListener("click", () => handleReviewAction(btn.dataset.reqId, "reject"));
        });
    } catch (err) {
        container.innerHTML = `<div class="text-danger" style="text-align:center;padding:20px 0;">加载失败: ${err.message}</div>`;
    }
}

async function handleReviewAction(reqId, action) {
    const card = document.querySelector(`.review-req-card[data-req-id="${reqId}"]`);
    const noteInput = card ? card.querySelector(".reviewer-note-input") : null;
    const reviewerNote = noteInput ? noteInput.value.trim() : "";
    
    try {
        const res = await fetch(`/api/leave-requests/${reqId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: action,
                reviewerNote: reviewerNote
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(action === "approve" ? "已批准申请" : "已拒绝申请");
            loadReviewLeaveRequests();
            await syncState();
            const activeSection = document.querySelector(".view-section.active").id;
            if (activeSection === "view-signin") renderSignInView();
        } else {
            showToast(data.error || "处理失败", "error");
        }
    } catch (err) {
        showToast("请求失败，请检查网络", "error");
    }
}

function initSigninSettings() {
    const openBtn = document.getElementById("openSigninSettingsBtn");
    const modal = document.getElementById("signinSettingsModal");
    const closeBtn = document.getElementById("closeSigninSettingsBtn");
    const cancelBtn = document.getElementById("cancelSigninSettingsBtn");
    const form = document.getElementById("signinSettingsForm");
    
    if (!openBtn || !modal) return;
    
    openBtn.addEventListener("click", async () => {
        try {
            const res = await fetch('/api/settings/signin-window');
            const settings = await res.json();
            
            document.getElementById("settingAmStart").value = settings.am_start;
            document.getElementById("settingAmEnd").value = settings.am_end;
            document.getElementById("settingPmStart").value = settings.pm_start;
            document.getElementById("settingPmEnd").value = settings.pm_end;
            document.getElementById("settingLateThreshold").value = settings.late_threshold_minutes;
            
            modal.classList.add("active");
        } catch (err) {
            showToast("获取签到设置失败", "error");
        }
    });
    
    const closeModal = () => {
        modal.classList.remove("active");
    };
    
    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });
    
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const am_start = document.getElementById("settingAmStart").value;
        const am_end = document.getElementById("settingAmEnd").value;
        const pm_start = document.getElementById("settingPmStart").value;
        const pm_end = document.getElementById("settingPmEnd").value;
        const late_threshold_minutes = parseInt(document.getElementById("settingLateThreshold").value);
        
        try {
            const res = await fetch('/api/settings/signin-window', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    am_start,
                    am_end,
                    pm_start,
                    pm_end,
                    late_threshold_minutes
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast("签到设置更新成功！");
                closeModal();
            } else {
                showToast("更新设置失败", "error");
            }
        } catch (err) {
            showToast("请求失败，请检查网络", "error");
        }
    });
}

async function updateAbsenceBadge() {
    const badge = document.getElementById("absenceBadge");
    if (!badge || state.currentUser.id !== "advisor") return;
    
    try {
        const res = await fetch('/api/absence-alerts');
        const alerts = await res.json();
        
        badge.textContent = alerts.length;
        badge.style.display = alerts.length > 0 ? "flex" : "none";
    } catch (err) {
        console.warn("Error fetching absence alerts", err);
    }
}

function initAbsenceAlerts() {
    const btn = document.getElementById("absenceAlertBtn");
    if (!btn) return;
    
    btn.addEventListener("click", async () => {
        const modal = document.getElementById("calendarDetailModal");
        const title = document.getElementById("calDetailDate");
        const body = document.getElementById("calDetailBody");
        if (!modal || !title || !body) return;
        
        title.textContent = "连续缺勤预警 (3天及以上)";
        body.innerHTML = `<div class="text-secondary" style="text-align:center;padding:20px 0;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</div>`;
        modal.classList.add("active");
        
        try {
            const res = await fetch('/api/absence-alerts');
            const alerts = await res.json();
            
            let html = `<div style="max-height:400px; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">`;
            if (alerts.length === 0) {
                html += `<div style="text-align:center; color:var(--text-secondary); padding:20px 0;">当前暂无连续缺勤学生</div>`;
            } else {
                alerts.forEach(a => {
                    html += `
                        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:12px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <strong style="color:var(--text-primary);">${a.userName}</strong>
                                <span style="font-size:12px; color:var(--text-secondary); margin-left:8px;">${a.role}</span>
                            </div>
                            <span class="badge bg-danger" style="font-size:12px;"><i class="fa-solid fa-triangle-exclamation"></i> 连续缺勤 ${a.consecutiveDays} 天</span>
                        </div>
                    `;
                });
            }
            html += `</div>`;
            body.innerHTML = html;
        } catch (err) {
            body.innerHTML = `<div class="text-danger" style="text-align:center;padding:20px 0;">加载预警失败: ${err.message}</div>`;
        }
    });
}

function initCalendarDetails() {
    const closeBtn = document.getElementById("closeCalDetailBtn");
    const modal = document.getElementById("calendarDetailModal");
    if (!closeBtn || !modal) return;
    
    closeBtn.addEventListener("click", () => {
        modal.classList.remove("active");
    });
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.classList.remove("active");
        }
    });
}

function initExportAttendance() {
    const btn = document.getElementById("exportAttendanceBtn");
    if (!btn) return;
    
    btn.addEventListener("click", () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const defaultMonth = `${year}-${month}`;
        
        const userInput = prompt("请输入要导出的月份 (格式: YYYY-MM):", defaultMonth);
        if (userInput === null) return;
        
        const cleanInput = userInput.trim();
        if (cleanInput) {
            const url = `/api/export/attendance?month=${cleanInput}`;
            window.open(url, "_blank");
        } else {
            showToast("格式不正确，导出已取消", "warning");
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    startClock();
    await initAppState();
    initAuth();
    initNavigation();
    initRegisterStudent();
    
    initMobileMenu();
    initLeaveRequests();
    initSigninSettings();
    initAbsenceAlerts();
    initCalendarDetails();
    initExportAttendance();
    initChangePassword();
    
    if (state.currentUser) {
        updateNotificationBadge();
        renderDashboard();
    }
});

// ==========================================================================
// CHANGE PASSWORD
// ==========================================================================

function initChangePassword() {
    const modal    = document.getElementById("changePasswordModal");
    const openBtn  = document.getElementById("changePasswordBtn");
    const closeBtn = document.getElementById("closeChangePasswordBtn");
    const cancelBtn = document.getElementById("cancelChangePasswordBtn");
    const form     = document.getElementById("changePasswordForm");

    function openModal() {
        if (!state.currentUser) { showToast("请先登录", "warning"); return; }
        form.reset();
        modal.classList.add("active");
    }
    function closeModal() {
        modal.classList.remove("active");
        form.reset();
    }

    if (openBtn)  openBtn.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const oldPassword     = document.getElementById("cpOldPassword").value;
            const newPassword     = document.getElementById("cpNewPassword").value;
            const confirmPassword = document.getElementById("cpConfirmPassword").value;

            if (newPassword !== confirmPassword) {
                showToast("两次输入的新密码不一致，请重新填写", "error");
                return;
            }
            if (newPassword.length < 6) {
                showToast("新密码不能少于6位", "error");
                return;
            }

            const submitBtn = form.querySelector("button[type='submit']");
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 提交中...`;

            try {
                const res = await fetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldPassword, newPassword })
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    showToast("✅ 密码修改成功，即将跳转到登录界面...", "success");
                    closeModal();
                    setTimeout(() => {
                        state.currentUser = null;
                        localStorage.removeItem("gm_current_user_id");
                        const loginBackdrop = document.getElementById("loginBackdrop");
                        if (loginBackdrop) loginBackdrop.classList.add("active");
                        navigateToSection("dashboard");
                    }, 1800);
                } else {
                    showToast(data.error || "密码修改失败，请重试", "error");
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i class="fa-solid fa-shield-halved"></i> 确认修改`;
                }
            } catch (err) {
                showToast("网络错误，请检查服务器连接", "error");
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-shield-halved"></i> 确认修改`;
            }
        });
    }
}
