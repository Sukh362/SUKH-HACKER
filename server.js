const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

// Store connected devices in memory
let connectedDevices = [];
let deviceGalleries = {};

// ✅ NEW: Track gallery changes
let galleryChanges = {};

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadsDir = './uploads';
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const deviceId = req.body.deviceId || 'unknown';
        const timestamp = Date.now();
        const filename = `${deviceId}_${timestamp}_${file.originalname}`;
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// ✅ Gallery upload route
app.post('/api/upload-gallery', upload.single('galleryImage'), (req, res) => {
    try {
        const { deviceId } = req.body;
        
        if (!deviceId) {
            return res.status(400).json({ 
                success: false,
                error: 'Device ID is required' 
            });
        }

        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No image file uploaded' 
            });
        }

        console.log('📸 Gallery upload received from:', deviceId);

        // Initialize gallery for device if not exists
        if (!deviceGalleries[deviceId]) {
            deviceGalleries[deviceId] = [];
        }

        // Add image to device gallery
        const imageData = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            uploadedAt: new Date().toLocaleTimeString(),
            type: 'photo' // Default type
        };

        deviceGalleries[deviceId].push(imageData);

        console.log('✅ Gallery image stored for device:', deviceId);

        res.json({ 
            success: true,
            message: 'Gallery image uploaded successfully',
            deviceId: deviceId,
            imageCount: deviceGalleries[deviceId].length
        });
        
    } catch (error) {
        console.error('❌ Gallery upload error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: Screenshot upload route
app.post('/api/upload-screenshot', upload.single('screenshot'), (req, res) => {
    try {
        const { deviceId, timestamp } = req.body;
        
        if (!deviceId) {
            return res.status(400).json({ 
                success: false,
                error: 'Device ID is required' 
            });
        }

        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No screenshot file uploaded' 
            });
        }

        console.log('📸 Screenshot received from:', deviceId);

        // Initialize gallery for device if not exists
        if (!deviceGalleries[deviceId]) {
            deviceGalleries[deviceId] = [];
        }

        // Add screenshot to device gallery
        const screenshotData = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            uploadedAt: new Date().toLocaleTimeString(),
            type: 'screenshot',
            timestamp: timestamp || new Date().toISOString()
        };

        deviceGalleries[deviceId].push(screenshotData);

        console.log('✅ Screenshot stored for device:', deviceId);

        res.json({ 
            success: true,
            message: 'Screenshot uploaded successfully',
            deviceId: deviceId,
            screenshotCount: deviceGalleries[deviceId].filter(img => img.type === 'screenshot').length
        });
        
    } catch (error) {
        console.error('❌ Screenshot upload error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: Report gallery changes
app.post('/api/gallery-changes', (req, res) => {
    try {
        const { deviceId, action, imagePath, imageType, timestamp } = req.body;
        
        console.log('📸 Gallery change reported:', { deviceId, action, imageType, imagePath });
        
        if (!deviceGalleries[deviceId]) {
            deviceGalleries[deviceId] = [];
        }

        // Store change for parent to fetch
        if (!galleryChanges[deviceId]) {
            galleryChanges[deviceId] = [];
        }

        const change = {
            action: action, // 'added' or 'deleted'
            imagePath: imagePath,
            imageType: imageType || 'photo',
            timestamp: timestamp || new Date().toISOString(),
            reportedAt: new Date().toLocaleTimeString()
        };

        galleryChanges[deviceId].push(change);
        
        // Keep only last 50 changes
        if (galleryChanges[deviceId].length > 50) {
            galleryChanges[deviceId] = galleryChanges[deviceId].slice(-50);
        }

        res.json({ 
            success: true,
            message: 'Gallery change recorded',
            change: change
        });
        
    } catch (error) {
        console.error('❌ Gallery change error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: Get gallery changes for parent
app.get('/api/gallery-changes/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        const changes = galleryChanges[deviceId] || [];
        const lastUpdate = galleryChanges[deviceId] ? 
            galleryChanges[deviceId][galleryChanges[deviceId].length - 1]?.timestamp : null;

        res.json({ 
            success: true,
            deviceId: deviceId,
            changes: changes,
            changeCount: changes.length,
            lastUpdate: lastUpdate
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: Clear gallery changes
app.delete('/api/clear-changes/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        const changeCount = galleryChanges[deviceId] ? galleryChanges[deviceId].length : 0;
        delete galleryChanges[deviceId];

        res.json({ 
            success: true,
            message: 'Gallery changes cleared',
            deviceId: deviceId,
            clearedChanges: changeCount
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ Get gallery images by device ID
app.get('/api/gallery/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('📸 Gallery request for device:', deviceId);

        if (!deviceGalleries[deviceId] || deviceGalleries[deviceId].length === 0) {
            return res.json({ 
                success: true,
                message: 'No gallery images found',
                deviceId: deviceId,
                images: []
            });
        }

        const images = deviceGalleries[deviceId].map(img => ({
            filename: img.filename,
            originalName: img.originalName,
            size: img.size,
            uploadedAt: img.uploadedAt,
            type: img.type || 'photo',
            url: `/api/gallery-image/${img.filename}`
        }));

        res.json({ 
            success: true,
            deviceId: deviceId,
            imageCount: images.length,
            images: images
        });
        
    } catch (error) {
        console.error('❌ Gallery fetch error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: Get only screenshots by device ID
app.get('/api/screenshots/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('📸 Screenshots request for device:', deviceId);

        if (!deviceGalleries[deviceId] || deviceGalleries[deviceId].length === 0) {
            return res.json({ 
                success: true,
                message: 'No screenshots found',
                deviceId: deviceId,
                screenshots: []
            });
        }

        const screenshots = deviceGalleries[deviceId]
            .filter(img => img.type === 'screenshot')
            .map(img => ({
                filename: img.filename,
                originalName: img.originalName,
                size: img.size,
                uploadedAt: img.uploadedAt,
                timestamp: img.timestamp,
                url: `/api/gallery-image/${img.filename}`
            }));

        res.json({ 
            success: true,
            deviceId: deviceId,
            screenshotCount: screenshots.length,
            screenshots: screenshots
        });
        
    } catch (error) {
        console.error('❌ Screenshots fetch error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ Serve gallery images
app.get('/api/gallery-image/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const imagePath = path.join(__dirname, 'uploads', filename);

        if (!fs.existsSync(imagePath)) {
            return res.status(404).json({ 
                success: false,
                error: 'Image not found' 
            });
        }

        res.sendFile(imagePath);
        
    } catch (error) {
        console.error('❌ Image serve error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ Clear gallery for specific device
app.delete('/api/clear-gallery/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('🗑️ Clear gallery request for device:', deviceId);

        const imageCount = deviceGalleries[deviceId] ? deviceGalleries[deviceId].length : 0;
        delete deviceGalleries[deviceId];

        console.log('✅ Gallery cleared for device:', deviceId);

        res.json({ 
            success: true,
            message: 'Gallery cleared successfully',
            deviceId: deviceId,
            deletedImages: imageCount
        });
        
    } catch (error) {
        console.error('❌ Clear gallery error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Health check route
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Parental Control Server is running!',
        timestamp: new Date().toISOString(),
        deviceCount: connectedDevices.length,
        galleryDeviceCount: Object.keys(deviceGalleries).length,
        changesDeviceCount: Object.keys(galleryChanges).length
    });
});

// Battery update route
app.post('/api/battery-update', (req, res) => {
    try {
        const { deviceId, deviceName, batteryLevel } = req.body;
        
        console.log('🔋 Battery update received:', { deviceId, deviceName, batteryLevel });
        
        if (!deviceId) {
            return res.status(400).json({ 
                success: false,
                error: 'Device ID is required' 
            });
        }
        
        let device = connectedDevices.find(d => d.id === deviceId);
        
        if (device) {
            device.batteryLevel = batteryLevel;
            device.deviceName = deviceName || device.deviceName;
            device.lastConnected = new Date().toLocaleTimeString();
            device.status = 'online';
            
            console.log('✅ Device UPDATED:', device.deviceName, '| Battery:', batteryLevel + '%');
        } else {
            device = {
                id: deviceId,
                deviceName: deviceName || 'Child Device',
                batteryLevel: batteryLevel,
                status: 'online',
                lastConnected: new Date().toLocaleTimeString(),
                connectedAt: new Date().toLocaleTimeString()
            };
            connectedDevices.push(device);
            
            console.log('🆕 New Device CREATED:', device.deviceName, '| Battery:', batteryLevel + '%');
        }
        
        res.json({ 
            success: true,
            message: 'Battery update received',
            batteryLevel: batteryLevel,
            deviceId: deviceId
        });
        
    } catch (error) {
        console.error('❌ Battery update error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Register child device
app.post('/api/register', (req, res) => {
    try {
        const { deviceId, deviceName, batteryLevel } = req.body;
        
        console.log('📱 Child registration request:', req.body);
        
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
            lastConnected: new Date().toLocaleTimeString(),
            connectedAt: new Date().toLocaleTimeString()
        };
        
        connectedDevices = connectedDevices.filter(device => device.id !== deviceId);
        connectedDevices.push(newDevice);
        
        console.log('✅ Device REGISTERED:', newDevice.deviceName, '| ID:', deviceId);
        
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

// Get all connected devices
app.get('/api/devices', (req, res) => {
    try {
        console.log('📊 Devices requested. Total:', connectedDevices.length);
        
        res.json({ 
            success: true,
            connectedDevices: connectedDevices 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Delete specific device
app.delete('/api/delete-device', (req, res) => {
    try {
        const { deviceId } = req.body;
        
        console.log('🗑️ Delete request for device:', deviceId);
        
        const initialLength = connectedDevices.length;
        connectedDevices = connectedDevices.filter(device => device.id !== deviceId);
        
        if (connectedDevices.length < initialLength) {
            console.log('✅ Device deleted successfully');
            res.json({ 
                success: true,
                message: 'Device deleted successfully'
            });
        } else {
            console.log('❌ Device not found');
            res.status(404).json({ 
                success: false,
                error: 'Device not found'
            });
        }
        
    } catch (error) {
        console.error('❌ Delete error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Clear all devices
app.delete('/api/clear', (req, res) => {
    const deviceCount = connectedDevices.length;
    connectedDevices = [];
    console.log('🗑️ All devices cleared. Total cleared:', deviceCount);
    res.json({ 
        success: true,
        message: 'All devices cleared',
        clearedCount: deviceCount
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        message: '🚀 Parental Control Server - COMPLETE SYSTEM',
        endpoints: {
            health: '/health',
            register: '/api/register (POST)',
            batteryUpdate: '/api/battery-update (POST)',
            devices: '/api/devices (GET)',
            uploadGallery: '/api/upload-gallery (POST)',
            uploadScreenshot: '/api/upload-screenshot (POST)',
            getGallery: '/api/gallery/:deviceId (GET)',
            getScreenshots: '/api/screenshots/:deviceId (GET)',
            galleryImage: '/api/gallery-image/:filename (GET)',
            clearGallery: '/api/clear-gallery/:deviceId (DELETE)',
            reportChanges: '/api/gallery-changes (POST)',
            getChanges: '/api/gallery-changes/:deviceId (GET)',
            clearChanges: '/api/clear-changes/:deviceId (DELETE)'
        },
        deviceCount: connectedDevices.length,
        galleryDeviceCount: Object.keys(deviceGalleries).length,
        note: '✅ Complete System with Real-time Gallery Changes Tracking!'
    });
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 Parental Control Server Started! - COMPLETE SYSTEM');
    console.log(`📍 Port: ${PORT}`);
    console.log('📸 Features: Battery + Gallery + Screenshots + Real-time Changes');
    console.log('✅ All systems ready!');
});