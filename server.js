const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// ✅ MIDDLEWARE SETUP
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ IMPORTANT: Static files serve karne ke liye
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

// ✅ DATA STORAGE
let connectedDevices = [];

// ✅ TIME FORMATTING FUNCTION
function formatSimpleTime(timestamp) {
    try {
        let date;
        
        if (typeof timestamp === 'number') {
            if (timestamp < 10000000000) {
                timestamp = timestamp * 1000;
            }
            date = new Date(timestamp);
        } else {
            date = new Date(timestamp);
        }
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = date.toLocaleString('en', { month: 'short' });
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        
        const formattedHours = String(hours % 12 || 12).padStart(2, '0');
        
        return `${day} ${month} ${year} ${formattedHours}:${minutes}:${seconds} ${ampm}`;
        
    } catch (error) {
        return new Date().toLocaleString();
    }
}

// ✅ MULTER SETUP FOR FILE UPLOADS
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
            console.log('✅ Created uploads directory:', uploadsDir);
        }
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const deviceId = req.body.deviceId || 'unknown';
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const filename = `${deviceId}_${timestamp}_${safeName}`;
        console.log('📁 Saving file:', filename);
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// ✅ ROOT ROUTE
app.get('/', (req, res) => {
    res.json({
        message: '🚀 Parental Control Server - DEVICES ONLY',
        status: 'Running',
        timestamp: formatSimpleTime(Date.now()),
        endpoints: {
            health: '/health',
            register: '/api/register (POST)',
            getDevices: '/api/devices (GET)'
        }
    });
});

// ✅ HEALTH CHECK
app.get('/health', (req, res) => {
    const uploadsDir = path.join(__dirname, 'uploads');
    const uploadsExists = fs.existsSync(uploadsDir);
    let uploadFileCount = 0;
    
    if (uploadsExists) {
        try {
            uploadFileCount = fs.readdirSync(uploadsDir).length;
        } catch (e) {
            uploadFileCount = -1;
        }
    }

    res.json({ 
        status: 'OK', 
        message: 'Server is running perfectly!',
        timestamp: formatSimpleTime(Date.now()),
        deviceCount: connectedDevices.length,
        uploads: {
            exists: uploadsExists,
            fileCount: uploadFileCount
        }
    });
});

// ✅ DEVICE REGISTRATION
app.post('/api/register', (req, res) => {
    try {
        const { deviceId, deviceName, batteryLevel } = req.body;
        
        console.log('📱 Device registration:', { deviceId, deviceName, batteryLevel });
        
        if (!deviceId) {
            return res.status(400).json({ 
                success: false,
                error: 'Device ID is required' 
            });
        }
        
        const newDevice = {
            id: deviceId,
            deviceName: deviceName || 'Child Device',
            batteryLevel: batteryLevel || 50,
            status: 'online',
            lastConnected: formatSimpleTime(Date.now()),
            connectedAt: formatSimpleTime(Date.now())
        };
        
        connectedDevices = connectedDevices.filter(device => device.id !== deviceId);
        connectedDevices.push(newDevice);
        
        console.log('✅ Device registered:', deviceId);
        
        res.json({ 
            success: true,
            message: 'Device registered successfully',
            device: newDevice
        });
        
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ GET ALL DEVICES
app.get('/api/devices', (req, res) => {
    try {
        console.log('📊 Devices requested. Total:', connectedDevices.length);
        
        const enhancedDevices = connectedDevices.map(device => {
            return {
                ...device,
                locationCount: 0,
                galleryCount: 0,
                notificationCount: 0,
                pendingCameraRequests: 0
            };
        });

        res.json({ 
            success: true,
            connectedDevices: enhancedDevices 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ ERROR HANDLING MIDDLEWARE
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 10MB.'
            });
        }
    }
    res.status(500).json({
        success: false,
        error: error.message
    });
});

// ✅ 404 HANDLER
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// ✅ START SERVER
app.listen(PORT, () => {
    console.log('🚀 Parental Control Server Started!');
    console.log(`📍 Port: ${PORT}`);
    console.log('📱 Features: Device Registration & Display Only');
    
    // Check uploads directory
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log('✅ Created uploads directory');
    } else {
        const files = fs.readdirSync(uploadsDir);
        console.log('✅ Uploads directory exists with', files.length, 'files');
    }
    
    console.log('✅ Server ready with clean setup!');
});
