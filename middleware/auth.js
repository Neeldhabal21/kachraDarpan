const jwt = require('jsonwebtoken');

/**
 * Authentication Middleware: Verifies the JWT token
 */
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'kachradarpan_secure_2026');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
    }
};

/**
 * Authorization Middleware: Checks if user has the required role
 * @param {string|string[]} roles - Required role(s)
 */
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized: User not authenticated.' });
        }

        const allowedRoles = Array.isArray(roles) ? roles : [roles];
        
        // Roles should be checked in a case-insensitive way or strictly as defined
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: You do not have permission to access this resource.' });
        }

        next();
    };
};

module.exports = { requireAuth, requireRole };
