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

// ✅ NEW: Track location data
let deviceLocations = {};

// ✅ NEW: Track gallery changes
let galleryChanges = {};

// ✅ NEW: Store notifications
let deviceNotifications = {};

// ✅ TIME FORMATTING FUNCTION
function formatTimestamp(timestamp) {
    try {
        let date;
        
        // Check if timestamp is in milliseconds or seconds
        if (typeof timestamp === 'string' && timestamp.match(/^\d+$/)) {
            timestamp = parseInt(timestamp);
        }
        
        if (typeof timestamp === 'number') {
            // If timestamp is in seconds (10 digits), convert to milliseconds
            if (timestamp < 10000000000) {
                timestamp = timestamp * 1000;
            }
            date = new Date(timestamp);
        } else if (typeof timestamp === 'string') {
            date = new Date(timestamp);
        } else {
            date = new Date();
        }
        
        // Format: "25 Nov 2024, 02:45:35 PM"
        const options = {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };
        
        return date.toLocaleDateString('en-IN', options).replace(',', '');
        
    } catch (error) {
        console.error('Time formatting error:', error);
        return 'Invalid Time';
    }
}

// ✅ SIMPLE TIME FORMAT (BACKUP)
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

// ✅ NEW: Notification update route
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
        
        console.log('📢 Notification received:', { 
            deviceId, 
            appName,
            title: title ? title.substring(0, 50) + '...' : 'No Title'
        });
        
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

        // Initialize notifications for device if not exists
        if (!deviceNotifications[deviceId]) {
            deviceNotifications[deviceId] = [];
        }

        const notificationData = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            packageName: packageName || 'unknown',
            appName: appName || 'Unknown App',
            title: title || '',
            text: text || '',
            timestamp: timestamp || Date.now(),
            formattedTime: formatSimpleTime(timestamp || Date.now()),
            category: category || 'general',
            priority: priority || 'normal',
            receivedAt: new Date().toLocaleTimeString()
        };

        // Add to device notifications (keep last 200 notifications)
        deviceNotifications[deviceId].unshift(notificationData); // Latest first
        if (deviceNotifications[deviceId].length > 200) {
            deviceNotifications[deviceId] = deviceNotifications[deviceId].slice(0, 200);
        }

        // Update device info
        let device = connectedDevices.find(d => d.id === deviceId);
        if (device) {
            device.lastNotification = notificationData;
            device.lastConnected = formatSimpleTime(Date.now());
            device.status = 'online';
            device.notificationCount = deviceNotifications[deviceId].length;
        }

        console.log('✅ Notification stored for device:', deviceId, '| Total:', deviceNotifications[deviceId].length);

        res.json({ 
            success: true,
            message: 'Notification received successfully',
            deviceId: deviceId,
            notification: notificationData,
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

// ✅ NEW: Get notifications for device
app.get('/api/notifications/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        const { limit = 50, app = 'all' } = req.query;
        
        console.log('📢 Notifications request for device:', deviceId);

        if (!deviceNotifications[deviceId] || deviceNotifications[deviceId].length === 0) {
            return res.json({ 
                success: true,
                message: 'No notifications found',
                deviceId: deviceId,
                notifications: []
            });
        }

        let notifications = deviceNotifications[deviceId];

        // Filter by app if specified
        if (app !== 'all') {
            notifications = notifications.filter(notif => 
                notif.packageName.includes(app) || notif.appName.toLowerCase().includes(app.toLowerCase())
            );
        }

        // Apply limit
        notifications = notifications.slice(0, parseInt(limit));

        res.json({ 
            success: true,
            deviceId: deviceId,
            notifications: notifications,
            totalNotifications: deviceNotifications[deviceId].length,
            showing: notifications.length
        });
        
    } catch (error) {
        console.error('❌ Notifications fetch error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: Get notification statistics
app.get('/api/notification-stats/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        if (!deviceNotifications[deviceId] || deviceNotifications[deviceId].length === 0) {
            return res.json({ 
                success: true,
                message: 'No notifications found',
                deviceId: deviceId,
                stats: {
                    total: 0,
                    byApp: {},
                    todayCount: 0,
                    mostActiveApp: 'None'
                }
            });
        }

        const notifications = deviceNotifications[deviceId];
        const today = new Date().toDateString();
        
        // Count by app
        const appCounts = {};
        let todayCount = 0;

        notifications.forEach(notif => {
            // Count by app
            const appKey = notif.appName;
            appCounts[appKey] = (appCounts[appKey] || 0) + 1;

            // Count today's notifications
            const notifDate = new Date(notif.timestamp).toDateString();
            if (notifDate === today) {
                todayCount++;
            }
        });

        // Find most active app
        let mostActiveApp = 'None';
        let maxCount = 0;
        for (const [app, count] of Object.entries(appCounts)) {
            if (count > maxCount) {
                maxCount = count;
                mostActiveApp = app;
            }
        }

        res.json({ 
            success: true,
            deviceId: deviceId,
            stats: {
                total: notifications.length,
                byApp: appCounts,
                todayCount: todayCount,
                mostActiveApp: mostActiveApp,
                lastNotification: notifications[0]?.formattedTime || 'None'
            }
        });
        
    } catch (error) {
        console.error('❌ Notification stats error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: Clear notifications for device
app.delete('/api/clear-notifications/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('🗑️ Clear notifications request for device:', deviceId);

        const notificationCount = deviceNotifications[deviceId] ? deviceNotifications[deviceId].length : 0;
        delete deviceNotifications[deviceId];

        console.log('✅ Notifications cleared for device:', deviceId);

        res.json({ 
            success: true,
            message: 'Notifications cleared successfully',
            deviceId: deviceId,
            deletedNotifications: notificationCount
        });
        
    } catch (error) {
        console.error('❌ Clear notifications error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: Get apps list for device
app.get('/api/notification-apps/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        if (!deviceNotifications[deviceId] || deviceNotifications[deviceId].length === 0) {
            return res.json({ 
                success: true,
                message: 'No notifications found',
                deviceId: deviceId,
                apps: []
            });
        }

        const appSet = new Set();
        deviceNotifications[deviceId].forEach(notif => {
            if (notif.appName && notif.appName !== 'Unknown App') {
                appSet.add(notif.appName);
            }
        });

        const apps = Array.from(appSet).sort();

        res.json({ 
            success: true,
            deviceId: deviceId,
            apps: apps,
            totalApps: apps.length
        });
        
    } catch (error) {
        console.error('❌ Notification apps error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: Location update route
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
        
        console.log('📍 Location update received:', { 
            deviceId, 
            deviceName, 
            latitude, 
            longitude,
            updateType,
            provider
        });
        
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

        // Initialize location tracking for device if not exists
        if (!deviceLocations[deviceId]) {
            deviceLocations[deviceId] = [];
        }

        const currentTime = new Date();
        const locationData = {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            accuracy: accuracy ? parseFloat(accuracy) : null,
            speed: speed ? parseFloat(speed) : null,
            bearing: bearing ? parseFloat(bearing) : null,
            altitude: altitude ? parseFloat(altitude) : null,
            timestamp: timestamp || Date.now(),
            // ✅ PROPERLY FORMATTED TIME
            formattedTime: formatSimpleTime(timestamp || Date.now()),
            updateType: updateType || 'LIVE_UPDATE',
            provider: provider || 'unknown',
            receivedAt: currentTime.toLocaleTimeString(),
            date: currentTime.toLocaleDateString()
        };

        // Add to device location history (keep last 100 locations)
        deviceLocations[deviceId].push(locationData);
        if (deviceLocations[deviceId].length > 100) {
            deviceLocations[deviceId] = deviceLocations[deviceId].slice(-100);
        }

        // Update device info in connected devices
        let device = connectedDevices.find(d => d.id === deviceId);
        if (device) {
            device.lastLocation = locationData;
            device.lastConnected = formatSimpleTime(Date.now());
            device.status = 'online';
        } else {
            device = {
                id: deviceId,
                deviceName: deviceName || 'Child Device',
                batteryLevel: 50, // Default
                lastLocation: locationData,
                status: 'online',
                lastConnected: formatSimpleTime(Date.now()),
                connectedAt: formatSimpleTime(Date.now())
            };
            connectedDevices.push(device);
        }

        console.log('✅ Location stored for device:', deviceId, '| Total updates:', deviceLocations[deviceId].length);

        res.json({ 
            success: true,
            message: 'Location update received successfully',
            deviceId: deviceId,
            locationCount: deviceLocations[deviceId].length,
            location: locationData
        });
        
    } catch (error) {
        console.error('❌ Location update error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: Get current location for device
app.get('/api/location/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('📍 Location request for device:', deviceId);

        if (!deviceLocations[deviceId] || deviceLocations[deviceId].length === 0) {
            return res.json({ 
                success: true,
                message: 'No location data found',
                deviceId: deviceId,
                currentLocation: null,
                locationHistory: []
            });
        }

        const currentLocation = deviceLocations[deviceId][deviceLocations[deviceId].length - 1];
        const locationHistory = deviceLocations[deviceId];

        res.json({ 
            success: true,
            deviceId: deviceId,
            currentLocation: currentLocation,
            locationHistory: locationHistory,
            totalUpdates: locationHistory.length,
            lastUpdate: currentLocation.formattedTime || currentLocation.receivedAt
        });
        
    } catch (error) {
        console.error('❌ Location fetch error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: Get location history for device
app.get('/api/location-history/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        const { limit = 50 } = req.query;
        
        console.log('📍 Location history request for device:', deviceId);

        if (!deviceLocations[deviceId] || deviceLocations[deviceId].length === 0) {
            return res.json({ 
                success: true,
                message: 'No location history found',
                deviceId: deviceId,
                locations: []
            });
        }

        const locations = deviceLocations[deviceId]
            .slice(-parseInt(limit))
            .reverse() // Latest first
            .map(loc => ({
                ...loc,
                // ✅ ENSURE FORMATTED TIME EXISTS
                displayTime: loc.formattedTime || formatSimpleTime(loc.timestamp)
            }));

        res.json({ 
            success: true,
            deviceId: deviceId,
            locations: locations,
            totalLocations: deviceLocations[deviceId].length,
            showing: locations.length
        });
        
    } catch (error) {
        console.error('❌ Location history error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ NEW: Clear location history for device
app.delete('/api/clear-location/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('🗑️ Clear location request for device:', deviceId);

        const locationCount = deviceLocations[deviceId] ? deviceLocations[deviceId].length : 0;
        delete deviceLocations[deviceId];

        console.log('✅ Location history cleared for device:', deviceId);

        res.json({ 
            success: true,
            message: 'Location history cleared successfully',
            deviceId: deviceId,
            deletedLocations: locationCount
        });
        
    } catch (error) {
        console.error('❌ Clear location error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
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
            uploadedAt: formatSimpleTime(Date.now()), // ✅ FORMATTED TIME
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

// ✅ Screenshot upload route
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
            uploadedAt: formatSimpleTime(Date.now()), // ✅ FORMATTED TIME
            type: 'screenshot',
            timestamp: timestamp || Date.now(),
            formattedTime: formatSimpleTime(timestamp || Date.now()) // ✅ FORMATTED TIME
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

// ✅ Report gallery changes
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
            timestamp: timestamp || Date.now(),
            reportedAt: formatSimpleTime(Date.now()), // ✅ FORMATTED TIME
            formattedTime: formatSimpleTime(timestamp || Date.now()) // ✅ FORMATTED TIME
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

// ✅ Get gallery changes for parent
app.get('/api/gallery-changes/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        const changes = galleryChanges[deviceId] || [];
        const lastUpdate = galleryChanges[deviceId] ? 
            galleryChanges[deviceId][galleryChanges[deviceId].length - 1]?.formattedTime : null;

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

// ✅ Clear gallery changes
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
            formattedTime: img.formattedTime || img.uploadedAt, // ✅ FORMATTED TIME
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

// ✅ Get only screenshots by device ID
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
                formattedTime: img.formattedTime || formatSimpleTime(img.timestamp), // ✅ FORMATTED TIME
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
        formattedTime: formatSimpleTime(Date.now()), // ✅ FORMATTED TIME
        deviceCount: connectedDevices.length,
        galleryDeviceCount: Object.keys(deviceGalleries).length,
        locationDeviceCount: Object.keys(deviceLocations).length,
        notificationDeviceCount: Object.keys(deviceNotifications).length, // ✅ NEW
        changesDeviceCount: Object.keys(galleryChanges).length
    });
});

// Battery update route
app.post('/api/battery-update', (req, res) => {
    try {
        const { deviceId, deviceName, batteryLevel, timestamp } = req.body;
        
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
            device.lastConnected = formatSimpleTime(Date.now()); // ✅ FORMATTED TIME
            device.status = 'online';
            
            console.log('✅ Device UPDATED:', device.deviceName, '| Battery:', batteryLevel + '%');
        } else {
            device = {
                id: deviceId,
                deviceName: deviceName || 'Child Device',
                batteryLevel: batteryLevel,
                status: 'online',
                lastConnected: formatSimpleTime(Date.now()), // ✅ FORMATTED TIME
                connectedAt: formatSimpleTime(Date.now()) // ✅ FORMATTED TIME
            };
            connectedDevices.push(device);
            
            console.log('🆕 New Device CREATED:', device.deviceName, '| Battery:', batteryLevel + '%');
        }
        
        res.json({ 
            success: true,
            message: 'Battery update received',
            batteryLevel: batteryLevel,
            deviceId: deviceId,
            timestamp: formatSimpleTime(timestamp || Date.now()) // ✅ FORMATTED TIME
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
            lastConnected: formatSimpleTime(Date.now()), // ✅ FORMATTED TIME
            connectedAt: formatSimpleTime(Date.now()) // ✅ FORMATTED TIME
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
        
        // Enhance devices with location and gallery info
        const enhancedDevices = connectedDevices.map(device => {
            const locationCount = deviceLocations[device.id] ? deviceLocations[device.id].length : 0;
            const galleryCount = deviceGalleries[device.id] ? deviceGalleries[device.id].length : 0;
            const notificationCount = deviceNotifications[device.id] ? deviceNotifications[device.id].length : 0; // ✅ NEW
            const lastLocation = deviceLocations[device.id] ? 
                deviceLocations[device.id][deviceLocations[device.id].length - 1] : null;
            const lastNotification = deviceNotifications[device.id] ? 
                deviceNotifications[device.id][0] : null; // ✅ NEW

            return {
                ...device,
                locationCount: locationCount,
                galleryCount: galleryCount,
                notificationCount: notificationCount, // ✅ NEW
                lastLocation: lastLocation,
                lastNotification: lastNotification // ✅ NEW
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

// Delete specific device
app.delete('/api/delete-device', (req, res) => {
    try {
        const { deviceId } = req.body;
        
        console.log('🗑️ Delete request for device:', deviceId);
        
        const initialLength = connectedDevices.length;
        connectedDevices = connectedDevices.filter(device => device.id !== deviceId);
        
        // Also clear device-specific data
        delete deviceGalleries[deviceId];
        delete deviceLocations[deviceId];
        delete galleryChanges[deviceId];
        delete deviceNotifications[deviceId]; // ✅ NEW
        
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
    deviceGalleries = {};
    deviceLocations = {};
    galleryChanges = {};
    deviceNotifications = {}; // ✅ NEW
    
    console.log('🗑️ All devices and data cleared. Total cleared:', deviceCount);
    res.json({ 
        success: true,
        message: 'All devices and data cleared',
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
            locationUpdate: '/api/location-update (POST)',
            notificationUpdate: '/api/notification-update (POST)', // ✅ NEW
            getLocation: '/api/location/:deviceId (GET)',
            locationHistory: '/api/location-history/:deviceId (GET)',
            getNotifications: '/api/notifications/:deviceId (GET)', // ✅ NEW
            notificationStats: '/api/notification-stats/:deviceId (GET)', // ✅ NEW
            notificationApps: '/api/notification-apps/:deviceId (GET)', // ✅ NEW
            clearLocation: '/api/clear-location/:deviceId (DELETE)',
            clearNotifications: '/api/clear-notifications/:deviceId (DELETE)', // ✅ NEW
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
        stats: {
            deviceCount: connectedDevices.length,
            galleryDeviceCount: Object.keys(deviceGalleries).length,
            locationDeviceCount: Object.keys(deviceLocations).length,
            notificationDeviceCount: Object.keys(deviceNotifications).length, // ✅ NEW
            changesDeviceCount: Object.keys(galleryChanges).length
        },
        note: '✅ Complete System with Battery + Gallery + Location + Notifications Tracking!',
        timeFormat: '📅 Time now displayed as: "25 Nov 2024 02:45:35 PM"'
    });
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 Parental Control Server Started! - COMPLETE SYSTEM');
    console.log(`📍 Port: ${PORT}`);
    console.log('📸 Features: Battery + Gallery + Screenshots + Location + Notifications 📢');
    console.log('🕐 Time Format: 25 Nov 2024 02:45:35 PM');
    console.log('✅ All systems ready!');
});
