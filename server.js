const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 4000;

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
    // Initial demo users
    const defaultUsers = {
        'mayor_smart': { password: 'india_clean_2026', role: 'Mayor', name: 'Dr. Rajesh Sharma' },
        'zonal_77': { password: 'officer_pass', role: 'Officer', name: 'Sanjeev Kumar' },
        'panchayat_admin': { password: 'gram_2026', role: 'GramPanchayat', name: 'Anita Devi' }
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

// API: Authority Register
app.post('/api/auth/register', (req, res) => {
    const { username, password, role, name } = req.body;
    const users = readUsers();

    if (users[username]) {
        return res.status(400).json({ error: 'Officer ID already registered.' });
    }

    users[username] = { password, role, name };
    writeUsers(users);

    res.status(201).json({ success: true, message: 'Account registered successfully.' });
});

// API: Authority Login
app.post('/api/auth/login', (req, res) => {
    const { username, password, role } = req.body;
    const users = readUsers();
    
    const user = users[username];
    if (user && user.password === password && user.role === role) {
        res.json({
            success: true,
            user: { id: username, role: user.role, name: user.name },
            token: 'TOKEN_' + Date.now()
        });
    } else {
        res.status(401).json({ error: 'Access Denied: Invalid credentials or role mismatch.' });
    }
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
    console.log(`🚀 KachraDarpan Backend running at http://localhost:${PORT}`);
});
