from flask import Flask, jsonify, request, send_from_directory, Response, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import os
import datetime
import csv
import io

app = Flask(__name__, static_folder='.')

# --- CORS（前后端同源部署，CORS 仅作兜底配置）---
CORS(app, supports_credentials=True)

DATABASE = 'grad_manager.db'

# --- 接口限速（可选：安装 flask-limiter 后自动启用）---
try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
    limiter = Limiter(get_remote_address, app=app, default_limits=[], storage_uri="memory://")
    print("✅  接口限速已启用（flask-limiter）")
except ImportError:
    print("⚠️  flask-limiter 未安装，接口限速功能已禁用。建议运行：pip install flask-limiter")
    class _NoopLimiter:
        def limit(self, *args, **kwargs):
            def decorator(f):
                return f
            return decorator
    limiter = _NoopLimiter()

# --- 安全配置：SECRET_KEY 必须通过环境变量设置 ---
FLASK_DEBUG = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    if FLASK_DEBUG:
        import secrets as _secrets
        SECRET_KEY = _secrets.token_hex(32)
        print("⚠️  警告：SECRET_KEY 未设置，已自动生成临时密钥（重启后失效，仅供开发测试）")
    else:
        raise RuntimeError(
            "\n\n❌  启动失败：SECRET_KEY 环境变量未设置！\n"
            "    Windows PowerShell：$env:SECRET_KEY = \"你的随机密钥（建议32位以上）\"\n"
            "    Linux/Mac：        export SECRET_KEY=\"你的随机密钥（建议32位以上）\"\n"
            "    或者直接运行 start.bat 启动脚本（已自动处理）\n"
        )

app.config['SECRET_KEY'] = SECRET_KEY
app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(days=7)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")   # WAL 模式：提升并发写入安全性
    conn.execute("PRAGMA foreign_keys=ON")    # 强制外键约束
    return conn

def now_str():
    """Return current datetime as a formatted string."""
    return datetime.datetime.now().strftime('%Y-%m-%d %H:%M')

def today_str():
    return datetime.datetime.now().strftime('%Y-%m-%d')

def init_db():
    need_seed = not os.path.exists(DATABASE) or os.path.getsize(DATABASE) == 0

    conn = get_db()
    cursor = conn.cursor()

    # --- Core tables ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS members (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            grade TEXT,
            studentId TEXT UNIQUE NOT NULL,
            research TEXT,
            contact TEXT,
            password_hash TEXT NOT NULL
        )
    ''')

    # Ensure database migrations if table existed without password_hash
    try:
        cursor.execute("PRAGMA table_info(members)")
        columns = [row[1] for row in cursor.fetchall()]
        if 'password_hash' not in columns:
            print("Migrating database: adding password_hash column to members table...")
            cursor.execute("ALTER TABLE members ADD COLUMN password_hash TEXT DEFAULT ''")
            default_hash = generate_password_hash('123456')
            cursor.execute("UPDATE members SET password_hash = ?", (default_hash,))
            conn.commit()
    except Exception as e:
        print(f"Migration error: {e}")

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS announcements (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            content TEXT NOT NULL,
            date TEXT NOT NULL,
            publisher TEXT NOT NULL,
            requires_confirm INTEGER DEFAULT 0
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS announcement_reads (
            announcement_id TEXT,
            user_id TEXT,
            PRIMARY KEY (announcement_id, user_id),
            FOREIGN KEY (announcement_id) REFERENCES announcements(id),
            FOREIGN KEY (user_id) REFERENCES members(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS announcement_confirmations (
            announcement_id TEXT,
            user_id TEXT,
            confirmed_at TEXT NOT NULL,
            PRIMARY KEY (announcement_id, user_id),
            FOREIGN KEY (announcement_id) REFERENCES announcements(id),
            FOREIGN KEY (user_id) REFERENCES members(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS posts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            content TEXT NOT NULL,
            author_id TEXT NOT NULL,
            author_name TEXT NOT NULL,
            author_role TEXT NOT NULL,
            date TEXT NOT NULL,
            views INTEGER DEFAULT 0,
            FOREIGN KEY (author_id) REFERENCES members(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS post_tags (
            post_id TEXT,
            tag TEXT,
            PRIMARY KEY (post_id, tag),
            FOREIGN KEY (post_id) REFERENCES posts(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS replies (
            id TEXT PRIMARY KEY,
            post_id TEXT NOT NULL,
            author_id TEXT NOT NULL,
            author_name TEXT NOT NULL,
            author_role TEXT NOT NULL,
            date TEXT NOT NULL,
            content TEXT NOT NULL,
            FOREIGN KEY (post_id) REFERENCES posts(id),
            FOREIGN KEY (author_id) REFERENCES members(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS signins (
            date TEXT NOT NULL,
            user_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            time TEXT NOT NULL,
            am_pm TEXT NOT NULL,
            location TEXT NOT NULL,
            notes TEXT,
            status TEXT DEFAULT 'normal',
            client_ip TEXT,
            PRIMARY KEY (date, user_id, am_pm),
            FOREIGN KEY (user_id) REFERENCES members(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS leave_requests (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            date TEXT NOT NULL,
            type TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            submitted_at TEXT NOT NULL,
            reviewed_at TEXT,
            reviewer_note TEXT,
            FOREIGN KEY (user_id) REFERENCES members(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS signin_settings (
            id INTEGER PRIMARY KEY DEFAULT 1,
            am_start TEXT DEFAULT '08:00',
            am_end TEXT DEFAULT '10:30',
            pm_start TEXT DEFAULT '13:30',
            pm_end TEXT DEFAULT '18:00',
            late_threshold_minutes INTEGER DEFAULT 30
        )
    ''')

    # Ensure default settings row exists
    cursor.execute("INSERT OR IGNORE INTO signin_settings (id) VALUES (1)")

    # --- Performance indexes ---
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_signins_date ON signins(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_signins_user ON signins(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_signins_date_user ON signins(date, user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_replies_post ON replies(post_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_leave_user ON leave_requests(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status)")

    conn.commit()

    # Seed mock data
    if need_seed:
        cursor.execute("SELECT COUNT(*) FROM members")
        if cursor.fetchone()[0] == 0:
            print("Seeding database with default mock data...")
            default_hash = generate_password_hash('123456')

            members = [
                ("student_1", "张明", "博士生", "2023级", "D20230105", "深度学习在无损检测中的应用", "zhangm@mail.edu.cn", default_hash),
                ("student_2", "李华", "硕士生", "2024级", "M20240211", "电磁超声检测技术 (EMAT)", "lihua@mail.edu.cn", default_hash),
                ("student_3", "赵雷", "硕士生", "2025级", "M20250314", "电阻抗成像重建算法 (EIT)", "zhaolei@mail.edu.cn", default_hash),
                ("student_4", "钱雪", "博士生", "2022级", "D20220102", "多模态物理融合深度学习", "qianxue@mail.edu.cn", default_hash),
                ("student_5", "王芳", "硕士生", "2024级", "M20240212", "阵列声学测井理论", "wangfang@mail.edu.cn", default_hash),
                ("advisor", "陈教授", "导师", "教师岗", "T2010001", "智能传感与电磁无损检测", "chen_prof@mail.edu.cn", default_hash)
            ]
            cursor.executemany("INSERT OR IGNORE INTO members VALUES (?, ?, ?, ?, ?, ?, ?, ?)", members)

            announcements = [
                ("ann_1", "关于本周五（5月22日）下午实验室学术例会的通知", "Academic", "各位同学，本周五下午 14:00 将在工科楼 405 学术会议室举行每周学术例会。请李华同学准备汇报《非线性电磁超声导波检测技术及裂纹定量评估》的研究进展，请其他同学携带学术周报提前 5 分钟到场签到，陈老师将点评大家的研究进度。", "2026-05-19 16:30", "陈教授", 0),
                ("ann_2", "【紧急】学校超级计算中心升级维护及算力队列调整", "Important", "为保障毕业季论文计算需求，学校超级计算中心将于 5 月 21 日凌晨 00:00 - 06:00 对 GPU 物理节点进行系统升级与升级扩容维护。届时计算队列将暂停，请大家提前保存当前计算检查点 (Checkpoint) 以防训练任务意外丢失。维护完成后，实验室将优先倾斜分配算力给面临毕业论文撰写的研究生。", "2026-05-18 09:15", "系统管理员", 0),
                ("ann_3", "实验室安全准则与设备借用规范（2026年修订版）", "System", "最近发现有同学在离开 402 实验室时未关闭大功率实验仪器电源。在此重申：\n1. 每日最后离开实验室的同学必须检查所有示波器、信号发生器、功率放大器电源是否关闭，锁好门窗。\n2. 任何人借用阻抗分析仪、EMAT传感器等贵重设备，需在设备登记册上签字。\n请大家共同维护实验室安全，防范火灾隐患！", "2026-05-15 11:20", "陈教授", 1),
                ("ann_4", "五月份实验室翠华山登山团建活动与户外烧烤报名通知", "Activities", "春暖花开，为了缓解大家近期的科研实验压力，实验室计划于本周六（5月23日）组织前往翠华山森林公园进行登山与户外烧烤团建。实验室报销全部往返大巴及聚餐费用。请想参加的同学于周四下午5点前在班长李华处登记报名，欢迎大家携带家属参加！", "2026-05-17 14:00", "李华", 0)
            ]
            cursor.executemany("INSERT OR IGNORE INTO announcements VALUES (?, ?, ?, ?, ?, ?, ?)", announcements)

            reads = [
                ("ann_1", "student_4"), ("ann_1", "advisor"),
                ("ann_2", "student_1"), ("ann_2", "student_4"), ("ann_2", "student_5"), ("ann_2", "advisor"),
                ("ann_3", "student_1"), ("ann_3", "student_2"), ("ann_3", "student_3"),
                ("ann_3", "student_4"), ("ann_3", "student_5"), ("ann_3", "advisor"),
                ("ann_4", "student_2"), ("ann_4", "student_3"), ("ann_4", "student_4"),
                ("ann_4", "student_5"), ("ann_4", "advisor")
            ]
            cursor.executemany("INSERT OR IGNORE INTO announcement_reads VALUES (?, ?)", reads)

            confirmations = [
                ("ann_3", "student_1", "2026-05-15 12:00"),
                ("ann_3", "student_2", "2026-05-15 13:30"),
            ]
            cursor.executemany("INSERT OR IGNORE INTO announcement_confirmations VALUES (?, ?, ?)", confirmations)

            posts = [
                ("post_1", "大家遇到 PyTorch 分布式 DDP 训练在 epoch 结束时卡死怎么解决？", "Academic", "如题，在进行三维图像分割模型的多卡 DDP 训练时，跑完第一个 epoch 的 validation 之后，程序就会卡死在 barrier() 或者报错 RuntimeError: Expected to have finished reduction...。排查了很久，不知道是 DataLoader 的 drop_last 导致的，还是网络结构里有未参与前向传播的参数引起的？求教组里做过分布式的大佬！", "student_1", "张明", "博士生", "2026-05-19 20:15", 42),
                ("post_2", "关于 CVPR 2026 论文投稿交流与 PINN 算法物理引导损失项调优建议", "Academic", "近来打算整理一下关于非线性声学导波检测的物理引导神经网络 (PINN) 工作，准备投 CVPR 2026 的 AI for Science 专题。组里有没有同学对这个方向感兴趣，或者有相关撰写经验的？想交流一下：\n1. 传统的无损检测物理边界条件在损失函数里怎么做归一化，才能保证收敛？\n2. 审稿人对于物理模型的验证通常看重哪些实验结果？", "student_2", "李华", "硕士生", "2026-05-18 15:40", 35),
                ("post_3", "今天下午茶陈教授请客！已点奶茶和甜品，大家快来 405 会议室取！", "Daily", "庆祝实验室最近的 NSFC 面上项目顺利通过评审，陈老师特意给大家点了喜茶和糕点！热奶茶和冷饮都有，已经在工科楼 405 学术会议室摆好了，大家做完手头实验快来享用！", "student_2", "李华", "硕士生", "2026-05-20 15:30", 56)
            ]
            cursor.executemany("INSERT OR IGNORE INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", posts)

            tags = [
                ("post_1", "PyTorch"), ("post_1", "DDP报错"), ("post_1", "深度学习"),
                ("post_2", "CVPR"), ("post_2", "PINN"), ("post_2", "无损检测"),
                ("post_3", "福利"), ("post_3", "下午茶"), ("post_3", "喜茶")
            ]
            cursor.executemany("INSERT OR IGNORE INTO post_tags VALUES (?, ?)", tags)

            replies = [
                ("rep_1_1", "post_1", "student_4", "钱雪", "博士生", "2026-05-19 21:05", "这个错一般是由于你网络中定义了某些层，但在 forward 传播里没有用到（比如某些条件分支或者遗留的无用模块）。DDP 在梯度 backward 同步时会等待所有定义的参数，没用到的层梯度没有计算，就会一直等待导致超时卡死。你可以试试在初始化 DDP时加上 find_unused_parameters=True，或者检查 forward 是否有些层被跳过了。"),
                ("rep_1_2", "post_1", "student_1", "张明", "博士生", "2026-05-19 22:30", "感谢雪姐！我刚检查了一下，确实是我为了做消融实验，在构造函数里定义了注意力机制模块，但有一组实验里 forward 中直接 return x 跳过了该模块。我加上 find_unused_parameters=True 之后可以跑通了！不过听网上说这个参数会带来轻微的性能开销，我之后还是把不用的层直接在代码里注释掉比较好。"),
                ("rep_2_1", "post_2", "advisor", "陈教授", "导师", "2026-05-18 18:22", "李华，这个切入点很好。对于第一个问题，你可以参考前年我们发表在 NDT&E International 上的那篇基于有限元的损失权重自适应调整方法，物理约束与数据损失通常不在一个数量级，需要使用拉格朗日乘子法或者动态权重系数。第二个问题，审稿人最看重的是'泛化性与抗噪能力'。我们需要做多组不同钢轨裂纹深度、不同信噪比下的鲁棒性实验。本周五例会你可以带上PPT，我们详细讨论一下。"),
                ("rep_3_1", "post_3", "student_3", "赵雷", "硕士生", "2026-05-20 15:35", "哇塞！太棒了，谢谢陈老师！马上保存模型，三分钟内到达战场！"),
                ("rep_3_2", "post_3", "student_5", "王芳", "硕士生", "2026-05-20 15:42", "太好了！正好刚刚做完了超声波导波激励实验，补充一下糖分，冲冲冲！")
            ]
            cursor.executemany("INSERT OR IGNORE INTO replies VALUES (?, ?, ?, ?, ?, ?, ?)", replies)

            signins = [
                ("2026-05-18", "student_1", "张明", "08:50:12", "AM", "工科楼 402 实验室", "开始撰写DDP分布式优化代码", "normal", None),
                ("2026-05-18", "student_2", "李华", "09:12:05", "AM", "工科楼 402 实验室", "搭建电磁超声探头硬件平台", "normal", None),
                ("2026-05-18", "student_3", "赵雷", "09:28:44", "AM", "工科楼 402 实验室", "复现EIT图像重建差分算法", "normal", None),
                ("2026-05-18", "student_4", "钱雪", "09:05:18", "AM", "超级计算中心 301", "提交多模态融合模型训练作业", "normal", None),
                ("2026-05-18", "student_5", "王芳", "09:45:30", "AM", "工科楼 402 实验室", "分析阵列声波频散曲线", "late", None),
                ("2026-05-19", "student_1", "张明", "08:45:55", "AM", "工科楼 402 实验室", "调试多卡多折交叉验证", "normal", None),
                ("2026-05-19", "student_2", "李华", "09:02:11", "AM", "工科楼 402 实验室", "撰写CVPR摘要与框架图", "normal", None),
                ("2026-05-19", "student_3", "赵雷", "09:10:33", "AM", "工科楼 402 实验室", "EIT重构网格剖分调试", "normal", None),
                ("2026-05-19", "student_4", "钱雪", "08:58:02", "AM", "工科楼 402 实验室", "整理多模态数据集", "normal", None),
                ("2026-05-20", "student_2", "李华", "08:55:18", "AM", "工科楼 402 实验室", "准备周五例会汇报的PPT", "normal", None),
                ("2026-05-20", "student_4", "钱雪", "09:01:45", "AM", "超级计算中心 301", "监测昨日超算集群训练收敛状态", "normal", None)
            ]
            cursor.executemany(
                "INSERT OR IGNORE INTO signins (date, user_id, user_name, time, am_pm, location, notes, status, client_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                signins
            )
            conn.commit()

    conn.close()


# ==========================================================================
# HELPER: get signin settings
# ==========================================================================

def get_signin_settings(cursor):
    cursor.execute("SELECT * FROM signin_settings WHERE id = 1")
    row = cursor.fetchone()
    if row:
        return dict(row)
    return {'am_start': '08:00', 'am_end': '10:30', 'pm_start': '13:30', 'pm_end': '18:00', 'late_threshold_minutes': 30}


def classify_signin_status(time_str, am_pm, settings):
    """Returns 'normal', 'late', or 'outside_window'."""
    try:
        h, m, s = map(int, time_str.split(':'))
        current_minutes = h * 60 + m

        if am_pm == 'AM':
            start_h, start_m = map(int, settings['am_start'].split(':'))
            end_h, end_m = map(int, settings['am_end'].split(':'))
            late_threshold = start_h * 60 + start_m + settings['late_threshold_minutes']
            end_limit = end_h * 60 + end_m
        else:
            start_h, start_m = map(int, settings['pm_start'].split(':'))
            end_h, end_m = map(int, settings['pm_end'].split(':'))
            late_threshold = start_h * 60 + start_m + settings['late_threshold_minutes']
            end_limit = end_h * 60 + end_m

        if current_minutes > end_limit:
            return 'outside_window'
        if current_minutes > late_threshold:
            return 'late'
        return 'normal'
    except Exception:
        return 'normal'


# ==========================================================================
# REST API ENDPOINTS
# ==========================================================================

# 1. Authentication APIs
@app.route('/api/login', methods=['POST'])
@limiter.limit("10 per minute; 50 per hour")  # 防暴力破解：每分钟最多10次
def login():
    data = request.json
    student_id = data.get('studentId')
    password = data.get('password')

    if not student_id or not password:
        return jsonify({'error': '学号与密码不能为空'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM members WHERE studentId = ?", (student_id,))
    member = cursor.fetchone()
    conn.close()

    if not member or not check_password_hash(member['password_hash'], password):
        return jsonify({'error': '学号或密码错误'}), 401

    session.clear()
    session['user_id'] = member['id']
    session.permanent = True

    return jsonify({
        'success': True,
        'member': {
            'id': member['id'], 'name': member['name'], 'role': member['role'],
            'grade': member['grade'], 'studentId': member['studentId'],
            'research': member['research'], 'contact': member['contact']
        }
    })


@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})


@app.route('/api/auth/change-password', methods=['POST'])
def change_password():
    """修改当前登录用户的密码，修改成功后强制重新登录。"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401

    data = request.json or {}
    old_password = data.get('oldPassword', '').strip()
    new_password = data.get('newPassword', '').strip()

    if not old_password or not new_password:
        return jsonify({'error': '旧密码和新密码不能为空'}), 400
    if len(new_password) < 6:
        return jsonify({'error': '新密码不能少于6位'}), 400
    if old_password == new_password:
        return jsonify({'error': '新密码不能与旧密码相同'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT password_hash FROM members WHERE id = ?", (user_id,))
    member = cursor.fetchone()

    if not member or not check_password_hash(member['password_hash'], old_password):
        conn.close()
        return jsonify({'error': '旧密码不正确，请重试'}), 400

    new_hash = generate_password_hash(new_password)
    cursor.execute("UPDATE members SET password_hash = ? WHERE id = ?", (new_hash, user_id))
    conn.commit()
    conn.close()

    session.clear()  # 密码变更后强制重新登录
    return jsonify({'success': True, 'message': '密码修改成功，请重新登录'})


@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM members WHERE id = ?", (user_id,))
    member = cursor.fetchone()
    conn.close()

    if not member:
        session.clear()
        return jsonify({'error': '用户不存在，请重新登录'}), 401

    return jsonify({
        'id': member['id'], 'name': member['name'], 'role': member['role'],
        'grade': member['grade'], 'studentId': member['studentId'],
        'research': member['research'], 'contact': member['contact']
    })


# 2. Members APIs
@app.route('/api/members', methods=['GET'])
def get_members():
    if not session.get('user_id'):
        return jsonify({'error': '请先登录'}), 401
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, role, grade, studentId, research, contact FROM members")
    rows = cursor.fetchall()
    conn.close()
    return jsonify([{
        'id': r['id'], 'name': r['name'], 'role': r['role'],
        'grade': r['grade'], 'studentId': r['studentId'],
        'research': r['research'], 'contact': r['contact']
    } for r in rows])


@app.route('/api/members', methods=['POST'])
def add_member():
    # Registration doesn't require active session if it's new registration
    # But if there is a session, it must be advisor to create a member for someone else
    current_user_id = session.get('user_id')
    
    data = request.json
    name = data.get('name')
    role = data.get('role')
    grade = data.get('grade')
    student_id = data.get('studentId')
    research = data.get('research')
    contact = data.get('contact')
    password = data.get('password') or '123456'

    if not name or not role or not student_id:
        return jsonify({'error': '姓名、身份类型和学工号为必填项'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM members WHERE studentId = ?", (student_id,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'error': '该学工号已被注册！'}), 400

    # If logged in and NOT advisor, forbid creating new members (students cannot create other students)
    if current_user_id and current_user_id != 'advisor':
        conn.close()
        return jsonify({'error': '无权限进行该操作'}), 403

    member_id = data.get('id') or f"student_{int(datetime.datetime.now().timestamp() * 1000)}"
    password_hash = generate_password_hash(password)

    try:
        cursor.execute(
            "INSERT INTO members (id, name, role, grade, studentId, research, contact, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (member_id, name, role, grade, student_id, research, contact, password_hash)
        )
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

    conn.close()

    # Auto-login if it's a student self-registering
    if not current_user_id:
        session.clear()
        session['user_id'] = member_id
        session.permanent = True

    return jsonify({'success': True, 'member': {
        'id': member_id, 'name': name, 'role': role, 'grade': grade,
        'studentId': student_id, 'research': research, 'contact': contact
    }})


# 3. Announcements APIs
@app.route('/api/announcements', methods=['GET'])
def get_announcements():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM announcements ORDER BY date DESC")
    ann_rows = cursor.fetchall()

    cursor.execute("SELECT id FROM members")
    member_ids = [m['id'] for m in cursor.fetchall()]

    announcements = []
    for ann in ann_rows:
        ann_id = ann['id']
        cursor.execute("SELECT user_id FROM announcement_reads WHERE announcement_id = ?", (ann_id,))
        read_users = [r['user_id'] for r in cursor.fetchall()]
        unread_by = [m_id for m_id in member_ids if m_id != 'advisor' and m_id not in read_users]

        # Confirmation data
        requires_confirm = bool(ann['requires_confirm'])
        confirmed_users = []
        if requires_confirm:
            cursor.execute(
                "SELECT user_id FROM announcement_confirmations WHERE announcement_id = ?", (ann_id,)
            )
            confirmed_users = [r['user_id'] for r in cursor.fetchall()]

        announcements.append({
            'id': ann_id,
            'title': ann['title'],
            'category': ann['category'],
            'content': ann['content'],
            'date': ann['date'],
            'publisher': ann['publisher'],
            'unreadBy': unread_by,
            'requiresConfirm': requires_confirm,
            'confirmedBy': confirmed_users
        })
    conn.close()
    return jsonify(announcements)


@app.route('/api/announcements', methods=['POST'])
def add_announcement():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401
    
    if user_id != 'advisor':
        return jsonify({'error': '只有导师有权限发布系统公告'}), 403

    data = request.json
    title = data.get('title')
    category = data.get('category')
    content = data.get('content')
    publisher = data.get('publisher', '陈教授')
    requires_confirm = 1 if data.get('requiresConfirm') else 0

    if not title or not category or not content:
        return jsonify({'error': '标题、类型和正文为必填项'}), 400

    ann_id = f"ann_{int(datetime.datetime.now().timestamp() * 1000)}"
    date_str = now_str()

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO announcements (id, title, category, content, date, publisher, requires_confirm) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (ann_id, title, category, content, date_str, publisher, requires_confirm)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'announcement': {
        'id': ann_id, 'title': title, 'category': category, 'content': content,
        'date': date_str, 'publisher': publisher, 'unreadBy': [],
        'requiresConfirm': bool(requires_confirm), 'confirmedBy': []
    }})


@app.route('/api/announcements/read', methods=['POST'])
def read_announcement():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401

    data = request.json
    ann_id = data.get('announcement_id')
    if not ann_id:
        return jsonify({'error': 'announcement_id is required'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)", (ann_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/announcements/read-all', methods=['POST'])
def read_all_announcements():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM announcements")
    ann_ids = [r['id'] for r in cursor.fetchall()]
    for ann_id in ann_ids:
        cursor.execute("INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)", (ann_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/announcements/<ann_id>/confirm', methods=['POST'])
def confirm_announcement(ann_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401

    conn = get_db()
    cursor = conn.cursor()
    confirmed_at = now_str()
    cursor.execute(
        "INSERT OR IGNORE INTO announcement_confirmations (announcement_id, user_id, confirmed_at) VALUES (?, ?, ?)",
        (ann_id, user_id, confirmed_at)
    )
    cursor.execute("INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)", (ann_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'confirmed_at': confirmed_at})


@app.route('/api/announcements/<ann_id>/confirmations', methods=['GET'])
def get_confirmations(ann_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401
    
    if user_id != 'advisor':
        return jsonify({'error': '只有导师有权限查看确认回执'}), 403

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT ac.user_id, m.name, ac.confirmed_at FROM announcement_confirmations ac "
        "JOIN members m ON m.id = ac.user_id WHERE ac.announcement_id = ?",
        (ann_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    return jsonify([{'userId': r['user_id'], 'name': r['name'], 'confirmedAt': r['confirmed_at']} for r in rows])


# 4. Posts & Forum APIs
@app.route('/api/posts', methods=['GET'])
def get_posts():
    if not session.get('user_id'):
        return jsonify({'error': '请先登录'}), 401

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM posts ORDER BY date DESC")
    post_rows = cursor.fetchall()
    posts = []
    for p in post_rows:
        pid = p['id']
        cursor.execute("SELECT tag FROM post_tags WHERE post_id = ?", (pid,))
        tags = [t['tag'] for t in cursor.fetchall()]
        cursor.execute("SELECT COUNT(*) as count FROM replies WHERE post_id = ?", (pid,))
        replies_count = cursor.fetchone()['count']
        posts.append({
            'id': pid, 'title': p['title'], 'category': p['category'],
            'content': p['content'], 'authorId': p['author_id'],
            'authorName': p['author_name'], 'authorRole': p['author_role'],
            'date': p['date'], 'views': p['views'], 'tags': tags, 'repliesCount': replies_count
        })
    conn.close()
    return jsonify(posts)


@app.route('/api/posts', methods=['POST'])
def add_post():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401

    data = request.json
    title = data.get('title')
    category = data.get('category')
    content = data.get('content')
    tags = data.get('tags', [])

    if not title or not category or not content:
        return jsonify({'error': '请填写完整的标题、板块分类与内容'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT name, role FROM members WHERE id = ?", (user_id,))
    author = cursor.fetchone()
    if not author:
        conn.close()
        return jsonify({'error': '未找到发帖人信息'}), 404
        
    author_name = author['name']
    author_role = author['role']

    post_id = f"post_{int(datetime.datetime.now().timestamp() * 1000)}"
    date_str = now_str()

    cursor.execute(
        "INSERT INTO posts (id, title, category, content, author_id, author_name, author_role, date, views) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (post_id, title, category, content, user_id, author_name, author_role, date_str, 0)
    )
    for tag in tags:
        cursor.execute("INSERT INTO post_tags (post_id, tag) VALUES (?, ?)", (post_id, tag))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'post_id': post_id})


@app.route('/api/posts/<post_id>', methods=['GET'])
def get_post_detail(post_id):
    if not session.get('user_id'):
        return jsonify({'error': '请先登录'}), 401

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE posts SET views = views + 1 WHERE id = ?", (post_id,))
    conn.commit()
    cursor.execute("SELECT * FROM posts WHERE id = ?", (post_id,))
    p = cursor.fetchone()
    if not p:
        conn.close()
        return jsonify({'error': '未找到该贴子'}), 404
    cursor.execute("SELECT tag FROM post_tags WHERE post_id = ?", (post_id,))
    tags = [t['tag'] for t in cursor.fetchall()]
    cursor.execute("SELECT * FROM replies WHERE post_id = ? ORDER BY date ASC", (post_id,))
    replies = [{
        'id': r['id'], 'authorId': r['author_id'], 'authorName': r['author_name'],
        'authorRole': r['author_role'], 'date': r['date'], 'content': r['content']
    } for r in cursor.fetchall()]
    post = {
        'id': p['id'], 'title': p['title'], 'category': p['category'],
        'content': p['content'], 'authorId': p['author_id'], 'authorName': p['author_name'],
        'authorRole': p['author_role'], 'date': p['date'], 'views': p['views'],
        'tags': tags, 'replies': replies
    }
    conn.close()
    return jsonify(post)


@app.route('/api/posts/<post_id>/replies', methods=['POST'])
def add_reply(post_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401

    data = request.json
    content = data.get('content')
    if not content:
        return jsonify({'error': '回复内容不能为空'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT name, role FROM members WHERE id = ?", (user_id,))
    author = cursor.fetchone()
    if not author:
        conn.close()
        return jsonify({'error': '未找到回复人信息'}), 404
        
    author_name = author['name']
    author_role = author['role']

    reply_id = f"rep_{int(datetime.datetime.now().timestamp() * 1000)}"
    date_str = now_str()
    
    cursor.execute(
        "INSERT INTO replies (id, post_id, author_id, author_name, author_role, date, content) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (reply_id, post_id, user_id, author_name, author_role, date_str, content)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# 5. Sign-in APIs
@app.route('/api/signins/today', methods=['GET'])
def get_today_signins():
    if not session.get('user_id'):
        return jsonify({'error': '请先登录'}), 401

    date = request.args.get('date', today_str())
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM signins WHERE date = ?", (date,))
    rows = cursor.fetchall()
    conn.close()
    return jsonify([{
        'userId': r['user_id'], 'userName': r['user_name'],
        'time': r['time'], 'amPm': r['am_pm'], 'location': r['location'],
        'notes': r['notes'], 'status': r['status'] or 'normal',
        'clientIp': r['client_ip']
    } for r in rows])


@app.route('/api/signins', methods=['POST'])
def add_signin():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401

    data = request.json
    location = data.get('location')
    notes = data.get('notes', '')
    date = data.get('date', today_str())
    client_ip = request.remote_addr

    if not location:
        return jsonify({'error': '签到区域为必填项'}), 400

    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM members WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return jsonify({'error': '未找到对应的打卡成员'}), 404
    user_name = user['name']

    now = datetime.datetime.now()
    time_str = now.strftime('%H:%M:%S')
    am_pm = 'AM' if now.hour < 12 else 'PM'

    # Check already signed in this session
    cursor.execute("SELECT * FROM signins WHERE date = ? AND user_id = ? AND am_pm = ?", (date, user_id, am_pm))
    if cursor.fetchone():
        conn.close()
        return jsonify({'error': '您在此时间段（AM/PM）今天已经签到过了！'}), 400

    # Anti-proxy: check same IP signing in many users in short window
    cursor.execute(
        "SELECT COUNT(DISTINCT user_id) as cnt FROM signins WHERE date = ? AND client_ip = ? AND am_pm = ?",
        (date, client_ip, am_pm)
    )
    same_ip_count = cursor.fetchone()['cnt']
    ip_warning = same_ip_count >= 2

    # Classify status based on time window
    settings = get_signin_settings(cursor)
    status = classify_signin_status(time_str, am_pm, settings)

    try:
        cursor.execute(
            "INSERT INTO signins (date, user_id, user_name, time, am_pm, location, notes, status, client_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (date, user_id, user_name, time_str, am_pm, location, notes, status, client_ip)
        )
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

    conn.close()
    return jsonify({
        'success': True,
        'signin': {'userId': user_id, 'userName': user_name, 'time': time_str, 'amPm': am_pm, 'location': location, 'notes': notes, 'status': status},
        'ipWarning': ip_warning,
        'status': status
    })


@app.route('/api/signins/calendar', methods=['GET'])
def get_calendar_signins():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401

    req_user_id = request.args.get('user_id') or user_id
    # Non-advisors can only view their own calendar
    if user_id != 'advisor' and req_user_id != user_id:
        return jsonify({'error': '无权限查看他人签到记录'}), 403

    year = request.args.get('year')
    month = request.args.get('month')

    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT * FROM signins WHERE user_id = ?"
    params = [req_user_id]
    if year and month:
        month_str = f"{int(month) + 1:02d}"
        query += " AND date LIKE ?"
        params.append(f"{year}-{month_str}-%")
    cursor.execute(query, params)
    rows = cursor.fetchall()
    calendar_data = {}
    for r in rows:
        d = r['date']
        if d not in calendar_data:
            calendar_data[d] = []
        calendar_data[d].append({
            'userId': r['user_id'], 'userName': r['user_name'],
            'time': r['time'], 'amPm': r['am_pm'],
            'location': r['location'], 'notes': r['notes'],
            'status': r['status'] or 'normal'
        })
    conn.close()
    return jsonify(calendar_data)


@app.route('/api/signins/trend', methods=['GET'])
def get_signin_trend():
    if not session.get('user_id'):
        return jsonify({'error': '请先登录'}), 401

    # Return the last 7 days dynamically
    today = datetime.date.today()
    dates = [(today - datetime.timedelta(days=6 - i)).strftime('%Y-%m-%d') for i in range(7)]
    counts = []
    conn = get_db()
    cursor = conn.cursor()
    for d in dates:
        cursor.execute("SELECT COUNT(DISTINCT user_id) as count FROM signins WHERE date = ?", (d,))
        counts.append(cursor.fetchone()['count'])
    conn.close()
    return jsonify({'dates': dates, 'counts': counts})


# 6. Signin Settings APIs
@app.route('/api/settings/signin-window', methods=['GET'])
def get_signin_window():
    if not session.get('user_id'):
        return jsonify({'error': '请先登录'}), 401

    conn = get_db()
    cursor = conn.cursor()
    settings = get_signin_settings(cursor)
    conn.close()
    return jsonify(settings)


@app.route('/api/settings/signin-window', methods=['POST'])
def update_signin_window():
    user_id = session.get('user_id')
    if not user_id or user_id != 'advisor':
        return jsonify({'error': '只有导师有权限修改签到设置'}), 403

    data = request.json
    am_start = data.get('am_start', '08:00')
    am_end = data.get('am_end', '10:30')
    pm_start = data.get('pm_start', '13:30')
    pm_end = data.get('pm_end', '18:00')
    late_threshold = data.get('late_threshold_minutes', 30)
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE signin_settings SET am_start=?, am_end=?, pm_start=?, pm_end=?, late_threshold_minutes=? WHERE id=1",
        (am_start, am_end, pm_start, pm_end, late_threshold)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# 7. Leave Request APIs
@app.route('/api/leave-requests', methods=['GET'])
def get_leave_requests():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401

    conn = get_db()
    cursor = conn.cursor()
    
    # Advisor can view all requests (or filtered by student), students only view their own
    if user_id == 'advisor':
        req_user_id = request.args.get('user_id')
        if req_user_id:
            cursor.execute("SELECT * FROM leave_requests WHERE user_id = ? ORDER BY submitted_at DESC", (req_user_id,))
        else:
            cursor.execute("SELECT * FROM leave_requests ORDER BY submitted_at DESC")
    else:
        cursor.execute("SELECT * FROM leave_requests WHERE user_id = ? ORDER BY submitted_at DESC", (user_id,))
        
    rows = cursor.fetchall()
    conn.close()
    return jsonify([{
        'id': r['id'], 'userId': r['user_id'], 'userName': r['user_name'],
        'date': r['date'], 'type': r['type'], 'reason': r['reason'],
        'status': r['status'], 'submittedAt': r['submitted_at'],
        'reviewedAt': r['reviewed_at'], 'reviewerNote': r['reviewer_note']
    } for r in rows])


@app.route('/api/leave-requests', methods=['POST'])
def add_leave_request():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401

    data = request.json
    date = data.get('date')
    req_type = data.get('type')  # 'leave' or 'makeup'
    reason = data.get('reason')

    if not all([date, req_type, reason]):
        return jsonify({'error': '请填写完整的申请日期、类型与事由'}), 400

    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM members WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return jsonify({'error': '未找到该账户的成员信息'}), 404
    user_name = user['name']

    req_id = f"req_{int(datetime.datetime.now().timestamp() * 1000)}"
    submitted_at = now_str()
    
    cursor.execute(
        "INSERT INTO leave_requests (id, user_id, user_name, date, type, reason, status, submitted_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
        (req_id, user_id, user_name, date, req_type, reason, submitted_at)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'id': req_id})


@app.route('/api/leave-requests/<req_id>/approve', methods=['POST'])
def approve_leave_request(req_id):
    user_id = session.get('user_id')
    if not user_id or user_id != 'advisor':
        return jsonify({'error': '只有导师有权限审批假条'}), 403

    data = request.json
    action = data.get('action', 'approve')  # 'approve' or 'reject'
    reviewer_note = data.get('reviewerNote', '')
    status = 'approved' if action == 'approve' else 'rejected'
    reviewed_at = now_str()
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE leave_requests SET status=?, reviewed_at=?, reviewer_note=? WHERE id=?",
        (status, reviewed_at, reviewer_note, req_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'status': status})


# 8. Absence Alert API
@app.route('/api/absence-alerts', methods=['GET'])
def get_absence_alerts():
    user_id = session.get('user_id')
    if not user_id or user_id != 'advisor':
        return jsonify({'error': '只有导师有权限查看缺勤预警'}), 403

    threshold = int(request.args.get('threshold', 3))
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM members WHERE id != 'advisor'")
    members = cursor.fetchall()

    today = datetime.date.today()
    alerts = []

    for m in members:
        consecutive = 0
        for i in range(1, 15):  # Check last 14 working days
            check_date = today - datetime.timedelta(days=i)
            if check_date.weekday() >= 5:  # Skip weekends
                continue
            date_str = check_date.strftime('%Y-%m-%d')
            # Check if approved leave
            cursor.execute(
                "SELECT id FROM leave_requests WHERE user_id = ? AND date = ? AND status = 'approved'",
                (m['id'], date_str)
            )
            if cursor.fetchone():
                break
            cursor.execute("SELECT 1 FROM signins WHERE date = ? AND user_id = ?", (date_str, m['id']))
            if cursor.fetchone():
                break
            consecutive += 1

        if consecutive >= threshold:
            alerts.append({
                'userId': m['id'],
                'userName': m['name'],
                'consecutiveDays': consecutive,
                'role': m['role']
            })

    conn.close()
    return jsonify(alerts)


# 9. Attendance Export API (CSV)
@app.route('/api/export/attendance', methods=['GET'])
def export_attendance():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': '请先登录'}), 401

    month = request.args.get('month')  # Format: YYYY-MM
    req_user_id = request.args.get('user_id')

    # Standard students can only export their own records
    if user_id != 'advisor':
        req_user_id = user_id

    conn = get_db()
    cursor = conn.cursor()

    query = "SELECT s.*, m.role FROM signins s JOIN members m ON m.id = s.user_id WHERE 1=1"
    params = []
    if month:
        query += " AND s.date LIKE ?"
        params.append(f"{month}-%")
    if req_user_id:
        query += " AND s.user_id = ?"
        params.append(req_user_id)
    query += " ORDER BY s.date, s.user_name"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['日期', '姓名', '身份', '签到时段', '时间', '地点', '备注', '状态'])
    for r in rows:
        status_cn = {'normal': '正常', 'late': '迟到', 'outside_window': '窗口外'}.get(r['status'] or 'normal', '正常')
        writer.writerow([r['date'], r['user_name'], r['role'],
                         '上午' if r['am_pm'] == 'AM' else '下午',
                         r['time'], r['location'], r['notes'] or '', status_cn])

    filename = f"attendance_{month or 'all'}.csv"
    return Response(
        '\ufeff' + output.getvalue(),  # BOM for Excel Chinese compatibility
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename={filename}'}
    )


# ==========================================================================
# STATIC FILE ROUTES
# ==========================================================================
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)


# ==========================================================================
# GLOBAL ERROR HANDLERS
# ==========================================================================
@app.errorhandler(400)
def bad_request(e):
    return jsonify({'error': '请求参数有误'}), 400

@app.errorhandler(401)
def unauthorized(e):
    return jsonify({'error': '请先登录'}), 401

@app.errorhandler(403)
def forbidden(e):
    return jsonify({'error': '权限不足'}), 403

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': '接口或资源不存在'}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'error': '请求方法不允许'}), 405

@app.errorhandler(429)
def too_many_requests(e):
    return jsonify({'error': '请求过于频繁，请稍后再试（登录每分钟最多10次）'}), 429

@app.errorhandler(500)
def internal_error(e):
    import traceback
    traceback.print_exc()
    return jsonify({'error': '服务器内部错误，请联系管理员'}), 500


# ==========================================================================
# STARTUP
# ==========================================================================
if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 8181))
    if FLASK_DEBUG:
        print(f"⚠️  开发模式启动（debug=True），请勿用于生产环境")
        app.run(host='0.0.0.0', port=port, debug=True)
    else:
        try:
            from waitress import serve
            import socket
            print("=" * 55)
            print("🚀  研路通 研究生管理系统 已启动（生产模式）")
            print(f"   本机访问：http://localhost:{port}")
            try:
                local_ip = socket.gethostbyname(socket.gethostname())
                print(f"   局域网访问：http://{local_ip}:{port}")
            except Exception:
                pass
            print("   按 Ctrl+C 停止服务")
            print("=" * 55)
            serve(app, host='0.0.0.0', port=port, threads=4)
        except ImportError:
            print("⚠️  waitress 未安装，回退到 Flask 开发服务器（不建议用于生产）")
            print("   请运行：pip install waitress")
            app.run(host='0.0.0.0', port=port, debug=False)
