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

// ✅ NEW: Store gallery images by device
let deviceGalleries = {};

// ✅ NEW: Multer setup for file uploads
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

// Health check route
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Parental Control Server is running!',
        timestamp: new Date().toISOString(),
        deviceCount: connectedDevices.length,
        galleryCount: Object.keys(deviceGalleries).length
    });
});

// ✅ NEW: Gallery upload route
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
        console.log('📁 File:', req.file.filename);

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
            timestamp: new Date().toISOString()
        };

        deviceGalleries[deviceId].push(imageData);

        console.log('✅ Gallery image stored for device:', deviceId);
        console.log('📊 Total images for device:', deviceGalleries[deviceId].length);

        res.json({ 
            success: true,
            message: 'Gallery image uploaded successfully',
            deviceId: deviceId,
            imageCount: deviceGalleries[deviceId].length,
            filename: req.file.filename
        });
        
    } catch (error) {
        console.error('❌ Gallery upload error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: Get gallery images by device ID
app.get('/api/gallery/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('📸 Gallery request for device:', deviceId);

        if (!deviceGalleries[deviceId] || deviceGalleries[deviceId].length === 0) {
            return res.json({ 
                success: true,
                message: 'No gallery images found for this device',
                deviceId: deviceId,
                images: []
            });
        }

        const images = deviceGalleries[deviceId].map(img => ({
            filename: img.filename,
            originalName: img.originalName,
            size: img.size,
            uploadedAt: img.uploadedAt,
            timestamp: img.timestamp,
            url: `/api/gallery-image/${deviceId}/${img.filename}`
        }));

        console.log('📸 Sending gallery for device:', deviceId, '| Images:', images.length);

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

// ✅ NEW: Serve gallery images
app.get('/api/gallery-image/:deviceId/:filename', (req, res) => {
    try {
        const { deviceId, filename } = req.params;
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

// ✅ NEW: Clear gallery for specific device
app.delete('/api/clear-gallery/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('🗑️ Clear gallery request for device:', deviceId);

        const imageCount = deviceGalleries[deviceId] ? deviceGalleries[deviceId].length : 0;
        
        // Delete files from uploads folder
        if (deviceGalleries[deviceId]) {
            deviceGalleries[deviceId].forEach(img => {
                try {
                    if (fs.existsSync(img.path)) {
                        fs.unlinkSync(img.path);
                    }
                } catch (err) {
                    console.log('⚠️ Could not delete file:', img.path);
                }
            });
        }

        delete deviceGalleries[deviceId];

        console.log('✅ Gallery cleared for device:', deviceId, '| Images deleted:', imageCount);

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

// ✅ FIXED: Battery update route - SAME DEVICE UPDATE
app.post('/api/battery-update', (req, res) => {
    try {
        const { deviceId, deviceName, batteryLevel, timestamp, updateReason } = req.body;
        
        console.log('🔋 Battery update received:', { deviceId, deviceName, batteryLevel, updateReason });
        
        if (!deviceId) {
            return res.status(400).json({ 
                success: false,
                error: 'Device ID is required' 
            });
        }
        
        // ✅ Device find karo, naya mat banayo
        let device = connectedDevices.find(d => d.id === deviceId);
        
        if (device) {
            // ✅ UPDATE EXISTING DEVICE
            device.batteryLevel = batteryLevel;
            device.deviceName = deviceName || device.deviceName;
            device.lastConnected = new Date().toLocaleTimeString();
            device.lastBatteryUpdate = new Date().toLocaleTimeString();
            device.status = 'online';
            device.updateReason = updateReason || 'AUTO_UPDATE';
            
            console.log('✅ Device UPDATED:', device.deviceName, '| Battery:', batteryLevel + '%');
        } else {
            // ✅ ONLY CREATE NEW IF DEVICE REALLY DOESN'T EXIST
            device = {
                id: deviceId,
                deviceName: deviceName || 'Child Device',
                batteryLevel: batteryLevel,
                status: 'online',
                lastConnected: new Date().toLocaleTimeString(),
                lastBatteryUpdate: new Date().toLocaleTimeString(),
                connectedAt: new Date().toLocaleTimeString(),
                updateReason: updateReason || 'FIRST_UPDATE'
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

// ✅ FIXED: Register child device - SAME DEVICE ID USE KARO
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
        
        // ✅ CLIENT SE DEVICE ID LO, NAYA MAT BANAO
        const newDevice = {
            id: deviceId, // ✅ CLIENT KA DIYA HUA ID USE KARO
            deviceName: deviceName || 'Child Device',
            batteryLevel: batteryLevel || 50,
            status: 'online',
            lastConnected: new Date().toLocaleTimeString(),
            connectedAt: new Date().toLocaleTimeString(),
            ip: req.ip
        };
        
        // ✅ Remove existing device with same ID (avoid duplicates)
        connectedDevices = connectedDevices.filter(device => device.id !== deviceId);
        connectedDevices.push(newDevice);
        
        console.log('✅ Device REGISTERED:', newDevice.deviceName, '| ID:', deviceId);
        console.log('📊 Total devices:', connectedDevices.length);
        
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
                message: 'Device deleted successfully',
                remainingDevices: connectedDevices.length
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

// Get all connected devices
app.get('/api/devices', (req, res) => {
    try {
        console.log('📊 Devices requested. Total:', connectedDevices.length);
        
        // ✅ Show current devices in console
        connectedDevices.forEach(device => {
            console.log(`   📱 ${device.deviceName} | ID: ${device.id} | Battery: ${device.batteryLevel}%`);
        });
        
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

// ✅ NEW: Clear specific device by ID
app.delete('/api/clear-device/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('🗑️ Clear device request:', deviceId);
        
        const initialLength = connectedDevices.length;
        connectedDevices = connectedDevices.filter(device => device.id !== deviceId);
        
        res.json({ 
            success: true,
            message: 'Device cleared',
            cleared: initialLength - connectedDevices.length,
            remainingDevices: connectedDevices.length
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Root route
app.get('/', (req, res) => {
    res.json({
        message: '🚀 Parental Control Server API - WITH GALLERY UPLOAD',
        endpoints: {
            health: '/health',
            register: '/api/register (POST) - REQUIRES deviceId',
            batteryUpdate: '/api/battery-update (POST) - REQUIRES deviceId',
            devices: '/api/devices (GET)',
            clear: '/api/clear (DELETE)',
            clearDevice: '/api/clear-device/:deviceId (DELETE)',
            // ✅ NEW GALLERY ENDPOINTS
            uploadGallery: '/api/upload-gallery (POST) - multipart/form-data',
            getGallery: '/api/gallery/:deviceId (GET)',
            galleryImage: '/api/gallery-image/:deviceId/:filename (GET)',
            clearGallery: '/api/clear-gallery/:deviceId (DELETE)'
        },
        deviceCount: connectedDevices.length,
        galleryDeviceCount: Object.keys(deviceGalleries).length,
        note: '✅ Now with Gallery Upload Feature!'
    });
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 Parental Control Server Started! - WITH GALLERY UPLOAD');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('📋 Available Routes:');
    console.log('   GET  /health');
    console.log('   POST /api/register ✅ REQUIRES deviceId');
    console.log('   POST /api/battery-update ✅ REQUIRES deviceId');
    console.log('   GET  /api/devices');
    console.log('   DELETE /api/clear');
    console.log('   DELETE /api/clear-device/:deviceId');
    console.log('   ✅ NEW GALLERY ROUTES:');
    console.log('   POST /api/upload-gallery ✅ Gallery upload');
    console.log('   GET  /api/gallery/:deviceId ✅ Get device gallery');
    console.log('   GET  /api/gallery-image/:deviceId/:filename ✅ Serve image');
    console.log('   DELETE /api/clear-gallery/:deviceId ✅ Clear gallery');
    console.log('\n✅ Gallery Upload Feature Added!');
});