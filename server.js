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

// API: Request OTP
app.post('/api/auth/request-otp', async (req, res) => {
    const { username, password, role } = req.body;
    const users = readUsers();
    
    const user = users[username];
    if (user && user.password === password && user.role === role) {
        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store OTP with 5-minute expiry
        activeOtps[username] = {
            otp,
            expires: Date.now() + (5 * 60 * 1000)
        };

        const email = user.email;
        if (!email) {
            console.error(`[AUTH ERROR] Missing email for user: ${username}`);
            return res.status(400).json({ error: 'No official email address is linked to this account. OTP cannot be sent.' });
        }

        const maskedEmail = email.replace(/^(.)(.*)(.@.*)$/, (_, first, middle, last) => first + middle.replace(/./g, '*') + last);

        // Check for SMTP Credentials
        const { EMAIL_SERVICE, EMAIL_USER, EMAIL_PASS } = process.env;
        
        if (EMAIL_USER && EMAIL_PASS) {
            try {
                // Clean App Password (remove spaces if any)
                const cleanPass = EMAIL_PASS.replace(/\s+/g, '');

                const transporter = nodemailer.createTransport({
                    service: EMAIL_SERVICE || 'gmail',
                    auth: {
                        user: EMAIL_USER,
                        pass: cleanPass
                    },
                    tls: {
                        rejectUnauthorized: false // Helps in some restricted environments
                    }
                });

                await transporter.sendMail({
                    from: `"KachraDarpan Security" <${EMAIL_USER}>`,
                    to: email,
                    subject: "Secure Verification Code",
                    html: `
                        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                            <h2 style="color: #2e7d32;">KachraDarpan Identity Verification</h2>
                            <p>You requested a secure login code. Use the code below to complete your sign-in:</p>
                            <div style="font-size: 2rem; font-weight: bold; letter-spacing: 5px; color: #1a1a1a; margin: 20px 0;">${otp}</div>
                            <p style="color: #666; font-size: 0.8rem;">This code is valid for 5 minutes. If you did not request this, please ignore this email.</p>
                        </div>
                    `
                });

                console.log(`[REAL EMAIL SENT] To: ${email} | Code: ${otp}`);
                res.json({ success: true, message: `Secure OTP sent to ${maskedEmail}.` });
            } catch (error) {
                console.error('Email Sending Error:', error);
                res.status(500).json({ error: `Failed to send verification email: ${error.message}` });
            }
        } else {
            // DEVELOPER MOCK MODE
            console.log(`\n-----------------------------------------`);
            console.log(`[MOCK EMAIL SENT] To: ${email} (${user.name})`);
            console.log(`[CODE]: ${otp}`);
            console.log(`[NOTICE]: Add EMAIL_USER and EMAIL_PASS to .env for real Gmail OTP.`);
            console.log(`-----------------------------------------\n`);

            res.json({ 
                success: true, 
                message: `[DEV MODE] OTP sent to ${maskedEmail}. Check server console.`,
                mock: true 
            });
        }
    } else {
        res.status(401).json({ error: 'Access Denied: Invalid credentials or role mismatch.' });
    }
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
