const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
require('dotenv').config();
const nodemailer = require('nodemailer');

const { requireAuth, requireRole } = require('./middleware/auth');
const { AuthTokenPromotionListInstance } = require('twilio/lib/rest/accounts/v1/authTokenPromotion');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'kachradarpan_secure_2026';

// Security Middleware: Rate Limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Too many requests, please try again after 15 minutes' }
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100,
    message: { error: 'Too many requests from this IP' }
});

// General Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));
app.use('/api/', apiLimiter);

// DB Files Setup
const reportsFile = path.join(__dirname, 'reports.json');
const usersFile = path.join(__dirname, 'users.json');
const auditLogFile = path.join(__dirname, 'audit_log.json');

if (!fs.existsSync(reportsFile)) fs.writeFileSync(reportsFile, JSON.stringify([]));
if (!fs.existsSync(auditLogFile)) fs.writeFileSync(auditLogFile, JSON.stringify([]));

// Seed Default Users if file is empty or doesn't exist
const initializeDB = async () => {
    let users = {};
    if (fs.existsSync(usersFile)) {
        try {
            users = JSON.parse(fs.readFileSync(usersFile));
        } catch (e) { users = {}; }
    }

    // Seed Mayor if not exists (for demo/testing promotion)
    if (!users['mayor_admin']) {
        const hashedPass = await bcrypt.hash('IndiaClean2026!', 10);
        users['mayor_admin'] = {
            password: hashedPass,
            role: 'mayor',
            name: 'Chief Mayor Rajesh',
            email: process.env.EMAIL_USER || 'admin@kachradarpan.in',
            createdAt: new Date().toISOString()
        };
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
        console.log('✅ Seeded default mayor user: mayor_admin / IndiaClean2026!');
    }
};
initializeDB();

// Helper Functions
const readData = (file) => JSON.parse(fs.readFileSync(file));
const writeData = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

function logAudit(action, actor, target, details) {
    const logs = readData(auditLogFile);
    logs.push({
        timestamp: new Date().toISOString(),
        action,
        actor,
        target,
        details
    });
    writeData(auditLogFile, logs);
}

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// In-Memory OTP Store
const activeOtps = {};

// Validation Schemas
const registerSchema = z.object({
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    name: z.string().min(2),
    email: z.string().email(),
    role: z.string().optional()
});

const loginSchema = z.object({
    username: z.string(),
    password: z.string(),
    otp: z.string().length(6)
});

// --- AUTH ROUTES ---

app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const validatedData = registerSchema.parse(req.body);
        const users = readData(usersFile);

        if (users[validatedData.username]) {
            return res.status(400).json({ error: 'Username already registered.' });
        }

        const hashedPassword = await bcrypt.hash(validatedData.password, 10);
        
        // Map frontend roles to backend roles
        const roleMap = {
            'Mayor': 'mayor',
            'Officer': 'zonal_officer',
            'GramPanchayat': 'gram_panchayat'
        };
        const assignedRole = roleMap[validatedData.role] || 'citizen';

        users[validatedData.username] = {
            password: hashedPassword,
            role: assignedRole,
            name: validatedData.name,
            email: validatedData.email,
            createdAt: new Date().toISOString()
        };

        writeData(usersFile, users);
        logAudit('USER_REGISTER', 'system', validatedData.username, `New ${assignedRole} registered`);

        res.status(201).json({ success: true, message: `Account registered as ${assignedRole}.` });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message || err.errors?.[0]?.message || "Validation Error" });
        console.error("Register Error:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/auth/request-otp', authLimiter, async (req, res) => {
    const { username, password } = req.body;
    const users = readData(usersFile);
    
        const user = users[username];
    if (user) {
        let isMatch = false;
        if (user.password.startsWith('$2')) {
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            isMatch = (password === user.password);
        }

        if (isMatch) {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            activeOtps[username] = { otp, expires: Date.now() + (5 * 60 * 1000) };

            try {
                await sendEmailOTP(user.email, otp, user.name, "Identity Verification");
                res.json({ success: true, message: 'Code sent to your official email.' });
            } catch (error) {
                res.status(500).json({ error: 'Mail service error.' });
            }
        } else {
            res.status(401).json({ error: 'Invalid credentials.' });
        }
    } else {
        res.status(401).json({ error: 'Invalid credentials.' });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { username, password, otp } = loginSchema.parse(req.body);
        const users = readData(usersFile);
        const user = users[username];
        if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

        let isMatch = false;
        if (user.password.startsWith('$2')) {
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            isMatch = (password === user.password);
        }

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const storedOtpData = activeOtps[username];
        if (!storedOtpData || storedOtpData.otp !== otp || Date.now() > storedOtpData.expires) {
            return res.status(401).json({ error: 'Invalid or expired code.' });
        }

        delete activeOtps[username];

        const token = jwt.sign(
            { userId: username, role: user.role.toLowerCase() },
            JWT_SECRET,
            { expiresIn: '4h' }
        );

        res.json({
            success: true,
            user: { id: username, role: user.role, name: user.name },
            token
        });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message || err.errors?.[0]?.message || "Validation Error" });
        res.status(500).json({ error: 'Server error' });
    }
});

// Forgot Password Logic
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
    const { identifier } = req.body; // username or email
    const users = readData(usersFile);
    const username = Object.keys(users).find(u => u === identifier || users[u].email === identifier);
    
    if (!username) return res.status(404).json({ error: 'Account not found.' });

    const user = users[username];
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    activeOtps[username] = { otp, expires: Date.now() + (10 * 60 * 1000), purpose: 'reset' };

    await sendEmailOTP(user.email, otp, user.name, "Password Reset");
    res.json({ success: true, message: 'Reset code sent.', username });
});

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
    const { username, otp, newPassword } = req.body;
    const users = readData(usersFile);
    const stored = activeOtps[username];

    if (!stored || stored.otp !== otp || stored.purpose !== 'reset' || Date.now() > stored.expires) {
        return res.status(401).json({ error: 'Invalid or expired reset code.' });
    }

    users[username].password = await bcrypt.hash(newPassword, 10);
    writeData(usersFile, users);
    delete activeOtps[username];

    logAudit('PASSWORD_RESET', 'system', username, 'User reset their password');
    res.json({ success: true, message: 'Password updated successfully.' });
});

// --- ADMIN & RBAC ROUTES ---

app.post('/api/admin/promote', requireAuth, requireRole(['mayor', 'super_admin']), async (req, res) => {
    const { targetUsername, newRole } = req.body;
    const users = readData(usersFile);

    if (!users[targetUsername]) return res.status(404).json({ error: 'User not found' });
    if (targetUsername === req.user.userId) return res.status(400).json({ error: 'Cannot promote self' });
    
    // Strict Role Policy
    const allowedRoles = ['zonal_officer', 'gram_panchayat'];
    if (!allowedRoles.includes(newRole)) return res.status(400).json({ error: 'Invalid target role' });

    const oldRole = users[targetUsername].role;
    users[targetUsername].role = newRole;
    writeData(usersFile, users);

    logAudit('ROLE_PROMOTION', req.user.userId, targetUsername, `From ${oldRole} to ${newRole}`);
    res.json({ success: true, message: `Promoted ${targetUsername} to ${newRole}` });
});

app.get('/api/admin/audit-logs', requireAuth, requireRole('mayor'), (req, res) => {
    res.json(readData(auditLogFile));
});

// --- OPERATIONAL ROUTES ---

app.get('/api/complaints', requireAuth, requireRole(['mayor', 'zonal_officer', 'gram_panchayat']), (req, res) => {
    res.json(readData(reportsFile));
});

// GET single complaint for tracking (public)
app.get('/api/complaints/:id', (req, res) => {
    const reports = readData(reportsFile);
    const report = reports.find(r => r.id.toLowerCase() === req.params.id.toLowerCase());
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
});

app.patch('/api/complaints/:id', requireAuth, requireRole(['mayor', 'zonal_officer', 'gram_panchayat']), (req, res) => {
    const { status } = req.body;
    const reports = readData(reportsFile);
    const index = reports.findIndex(r => r.id === req.params.id);

    if (index === -1) return res.status(404).json({ error: 'Report not found' });

    reports[index].status = status;
    writeData(reportsFile, reports);
    logAudit('COMPLAINT_UPDATE', req.user.userId, req.params.id, `Status set to ${status}`);
    res.json(reports[index]);
});

// Open route for public to submit reports
app.post('/api/complaints', upload.single('image'), (req, res) => {
    const { location, wasteType, confidence } = req.body;
    if (!req.file || !location || !wasteType) return res.status(400).json({ error: 'Data incomplete' });

    const reports = readData(reportsFile);
    const newReport = {
        id: 'RD-' + Date.now().toString().slice(-6),
        imageUrl: `/uploads/${req.file.filename}`,
        location, wasteType, confidence,
        status: 'Pending',
        timestamp: new Date().toISOString()
    };
    reports.push(newReport);
    writeData(reportsFile, reports);
    res.status(201).json(newReport);
});

// --- EMAIL HELPER ---
async function sendEmailOTP(email, otp, userName, subjectPrefix) {
    const { EMAIL_USER, EMAIL_PASS } = process.env;

    if (!EMAIL_USER || !EMAIL_PASS) {
        console.log(
            `\n[MOCK EMAIL] To: ${email} | Code: ${otp} | Subject: ${subjectPrefix}\n`
        );
        return;
    }

    try {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: true,

            auth: {
                user: EMAIL_USER,
                pass: EMAIL_PASS
            },

            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 20000
        });

        const info = await transporter.sendMail({
            from: `"KachraDarpan Security" <${EMAIL_USER}>`,
            to: email,
            subject: `${subjectPrefix} Code`,

            html: `
                <div style="
                    font-family: sans-serif;
                    border: 1px solid #ddd;
                    padding: 20px;
                    border-radius: 10px;
                ">
                    <h2>KachraDarpan Verification</h2>

                    <p>Hello ${userName},</p>

                    <p>
                        Your code is:
                        <b style="font-size:24px;color:#10b981;">
                            ${otp}
                        </b>
                    </p>

                    <p>Valid for 10 minutes.</p>
                </div>
            `
        });

        console.log("✅ OTP email sent:", info.messageId);

    } catch (error) {
        console.error("❌ Mail error:", error);

        // IMPORTANT:
        // Let request-otp know that sending failed
        throw error;
    }
}

app.listen(PORT, () => {
    console.log(`🚀 KachraDarpan SECURE Backend on port ${PORT}`);
});