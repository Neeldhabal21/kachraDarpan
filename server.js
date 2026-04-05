const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from root
app.use('/uploads', express.static('uploads'));

// Ensure reports.json exists
const reportsFile = path.join(__dirname, 'reports.json');
if (!fs.existsSync(reportsFile)) {
    fs.writeFileSync(reportsFile, JSON.stringify([]));
}

// Ensure users.json exists
const usersFile = path.join(__dirname, 'users.json');
if (!fs.existsSync(usersFile)) {
    // Initial demo users with mock phones
    const defaultUsers = {
        'mayor_smart': { password: 'india_clean_2026', role: 'Mayor', name: 'Dr. Rajesh Sharma', phone: '+910000000001' },
        'zonal_77': { password: 'officer_pass', role: 'Officer', name: 'Sanjeev Kumar', phone: '+910000000002' },
        'panchayat_admin': { password: 'gram_2026', role: 'GramPanchayat', name: 'Anita Devi', phone: '+910000000003' }
    };
    fs.writeFileSync(usersFile, JSON.stringify(defaultUsers, null, 2));
}

// Multer Setup for Image Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Helper to Read/Write Data
function readReports() { return JSON.parse(fs.readFileSync(reportsFile)); }
function writeReports(reports) { fs.writeFileSync(reportsFile, JSON.stringify(reports, null, 2)); }

function readUsers() { return JSON.parse(fs.readFileSync(usersFile)); }
function writeUsers(users) { fs.writeFileSync(usersFile, JSON.stringify(users, null, 2)); }

// In-Memory Mock Notification Log
const notifications = [];

// In-Memory OTP Store
const activeOtps = {}; // Format: { username: { otp: string, expires: number } }

// API: Authority Register
app.post('/api/auth/register', (req, res) => {
    const { username, password, role, name, email } = req.body;
    const users = readUsers();

    if (users[username]) {
        return res.status(400).json({ error: 'Officer ID already registered.' });
    }

    if (!email) {
        return res.status(400).json({ error: 'Official email address is required.' });
    }

    users[username] = { password, role, name, email };
    writeUsers(users);

    res.status(201).json({ success: true, message: 'Account registered successfully.' });
});

// Helper for Sending Emails (Real or Mock)
async function sendEmailOTP(email, otp, userName, subjectPrefix = "Identity Verification") {
    const { EMAIL_SERVICE, EMAIL_USER, EMAIL_PASS } = process.env;
    const maskedEmail = email.replace(/^(.)(.*)(.@.*)$/, (_, first, middle, last) => first + middle.replace(/./g, '*') + last);

    if (EMAIL_USER && EMAIL_PASS) {
        try {
            const cleanPass = EMAIL_PASS.replace(/\s+/g, '');
            const transporter = nodemailer.createTransport({
                service: EMAIL_SERVICE || 'gmail',
                auth: { user: EMAIL_USER, pass: cleanPass },
                tls: { rejectUnauthorized: false }
            });

            await transporter.sendMail({
                from: `"KachraDarpan Security" <${EMAIL_USER}>`,
                to: email,
                subject: `${subjectPrefix} Code`,
                html: `
                    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px; margin: auto;">
                        <h2 style="color: #2e7d32; text-align: center;">KachraDarpan Security</h2>
                        <p style="color: #333;">Hello <b>${userName}</b>,</p>
                        <p>You requested a secure verification code. Use the code below to proceed:</p>
                        <div style="font-size: 2.5rem; font-weight: bold; letter-spacing: 8px; color: #1a1a1a; margin: 30px 0; text-align: center; background: #f4f4f4; padding: 15px; border-radius: 8px;">${otp}</div>
                        <p style="color: #666; font-size: 0.85rem; border-top: 1px solid #eee; padding-top: 15px;">
                            This code is valid for 5 minutes. If you did not request this, please secure your account immediately.
                        </p>
                    </div>
                `
            });

            console.log(`[REAL EMAIL SENT] To: ${email} | Code: ${otp}`);
            return { success: true, message: `Secure code sent to ${maskedEmail}.` };
        } catch (error) {
            console.error('Email Sending Error:', error);
            throw new Error(`Failed to send verification email: ${error.message}`);
        }
    } else {
        console.log(`\n-----------------------------------------`);
        console.log(`[MOCK EMAIL SENT] To: ${email} (${userName})`);
        console.log(`[SUBJECT]: ${subjectPrefix}`);
        console.log(`[CODE]: ${otp}`);
        console.log(`[NOTICE]: Add EMAIL_USER and EMAIL_PASS to .env for real Gmail OTP.`);
        console.log(`-----------------------------------------\n`);

        return { 
            success: true, 
            message: `[DEV MODE] Code sent to ${maskedEmail}. Check server console.`,
            mock: true 
        };
    }
}

// API: Request OTP for Login
app.post('/api/auth/request-otp', async (req, res) => {
    const { username, password, role } = req.body;
    const users = readUsers();
    
    const user = users[username];
    if (user && user.password === password && user.role === role) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        activeOtps[username] = { otp, expires: Date.now() + (5 * 60 * 1000) };

        if (!user.email) {
            return res.status(400).json({ error: 'No official email address linked to this account.' });
        }

        try {
            const result = await sendEmailOTP(user.email, otp, user.name, "Login Verification");
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    } else {
        res.status(401).json({ error: 'Access Denied: Invalid credentials or role mismatch.' });
    }
});

// API: Forgot Password (Request OTP)
app.post('/api/auth/forgot-password', async (req, res) => {
    const { identifier } = req.body; // username or email
    const users = readUsers();
    
    // Find user by username or email
    const username = Object.keys(users).find(u => u === identifier || users[u].email === identifier);
    const user = users[username];

    if (!user) {
        return res.status(404).json({ error: 'No account found with this ID or Email.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    activeOtps[username] = { 
        otp, 
        expires: Date.now() + (5 * 60 * 1000),
        purpose: 'password-reset'
    };

    try {
        const result = await sendEmailOTP(user.email, otp, user.name, "Password Reset");
        res.json({ ...result, username }); // Send back username for the next step
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Reset Password
app.post('/api/auth/reset-password', (req, res) => {
    const { username, otp, newPassword } = req.body;
    const users = readUsers();
    const storedOtpData = activeOtps[username];

    if (!storedOtpData || storedOtpData.purpose !== 'password-reset') {
        return res.status(400).json({ error: 'No reset request found or has expired.' });
    }

    if (Date.now() > storedOtpData.expires) {
        delete activeOtps[username];
        return res.status(400).json({ error: 'Verification code has expired.' });
    }

    if (storedOtpData.otp !== otp) {
        return res.status(401).json({ error: 'Invalid verification code.' });
    }

    // Success: Update password and clear OTP
    users[username].password = newPassword;
    writeUsers(users);
    delete activeOtps[username];

    res.json({ success: true, message: 'Password has been successfully reset. You can now login.' });
});

// API: Authority Login (Updated with OTP)
app.post('/api/auth/login', (req, res) => {
    const { username, password, role, otp } = req.body;
    const users = readUsers();
    
    const user = users[username];
    
    // Step 1: Validate Credentials
    if (!user || user.password !== password || user.role !== role) {
        return res.status(401).json({ error: 'Access Denied: Invalid credentials.' });
    }

    // Step 2: Validate OTP
    const storedOtpData = activeOtps[username];
    
    if (!storedOtpData) {
        return res.status(400).json({ error: 'OTP not requested or already expired.' });
    }

    if (Date.now() > storedOtpData.expires) {
        delete activeOtps[username];
        return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (storedOtpData.otp !== otp) {
        return res.status(401).json({ error: 'Invalid OTP code.' });
    }

    // Success: Clear OTP and return session
    delete activeOtps[username];
    
    res.json({
        success: true,
        user: { id: username, role: user.role, name: user.name },
        token: 'TOKEN_' + Date.now()
    });
});

// API: Submit a Complaint
app.post('/api/complaints', upload.single('image'), (req, res) => {
    const { location, wasteType, confidence } = req.body;
    const file = req.file;

    if (!file || !location || !wasteType) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const reports = readReports();
    const newReport = {
        id: 'RD-' + Date.now().toString().slice(-6),
        imageUrl: `/uploads/${file.filename}`,
        location,
        wasteType,
        confidence: confidence || 'N/A',
        status: 'Pending',
        timestamp: new Date().toISOString()
    };

    reports.push(newReport);
    writeReports(reports);

    // Mock Notification Logic
    const notification = {
        to: 'Mayor Office / Gram Panchayat Officer',
        subject: `URGENT: New Waste Complaint - ${newReport.id}`,
        body: `A new waste report has been filed at ${location}. Type: ${wasteType}. View details in the dashboard.`,
        timestamp: new Date().toISOString()
    };
    notifications.push(notification);
    console.log(`[NOTIFICATION SENT] To: ${notification.to} - Sub: ${notification.subject}`);

    res.status(201).json(newReport);
});

// API: Get All Complaints (for Officers)
app.get('/api/complaints', (req, res) => {
    const reports = readReports();
    res.json(reports);
});

// API: Get Single Complaint by ID (for Residents/Tracking)
app.get('/api/complaints/:id', (req, res) => {
    const reports = readReports();
    const searchId = req.params.id.toUpperCase();
    const report = reports.find(r => r.id.toUpperCase() === searchId);
    
    if (!report) {
        return res.status(404).json({ error: 'Report not found. Please check your Ticket ID.' });
    }
    
    res.json(report);
});

// API: Update Complaint Status
app.patch('/api/complaints/:id', (req, res) => {
    const { status } = req.body;
    const reports = readReports();
    const index = reports.findIndex(r => r.id === req.params.id);

    if (index === -1) return res.status(404).json({ error: 'Report not found' });

    reports[index].status = status;
    writeReports(reports);
    res.json(reports[index]);
});

// API: Get Notifications (Mock)
app.get('/api/notifications', (req, res) => {
    res.json(notifications);
});

app.listen(PORT, () => {
    console.log(`🚀 KachraDarpan Backend running on port ${PORT}`);
});
