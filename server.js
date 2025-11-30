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

// ✅ IMPROVED CORS middleware - FIXED
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, deviceId, Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).json({
            body: "OK"
        });
    }
    next();
});

// ✅ DATA STORAGE
let connectedDevices = [];
let frontCameraRequests = {}; // Front camera requests storage
let backCameraRequests = {};  // ✅ NEW: Back camera requests storage
let deviceGalleries = {}; // Gallery storage

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
            getDevices: '/api/devices (GET)',
            // Front Camera Endpoints
            requestFrontCamera: '/api/request-front-camera (POST)',
            uploadFrontCamera: '/api/upload-front-camera (POST)',
            checkCameraRequest: '/api/check-camera-request/:requestId (GET)',
            getPendingRequests: '/api/pending-camera-requests/:deviceId (GET)',
            // ✅ NEW: Back Camera Endpoints
            requestBackCamera: '/api/request-back-camera (POST)',
            uploadBackCamera: '/api/upload-back-camera (POST)',
            checkBackCameraRequest: '/api/check-back-camera-request/:requestId (GET)',
            getPendingBackRequests: '/api/pending-back-camera-requests/:deviceId (GET)',
            // Gallery Endpoints
            getGallery: '/api/gallery/:deviceId (GET)',
            checkUploads: '/api/check-uploads (GET)'
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
        cameraRequestsCount: Object.keys(frontCameraRequests).length,
        backCameraRequestsCount: Object.keys(backCameraRequests).length, // ✅ NEW
        galleryDeviceCount: Object.keys(deviceGalleries).length,
        uploads: {
            exists: uploadsExists,
            fileCount: uploadFileCount
        }
    });
});

// ✅ DEVICE REGISTRATION - IMPROVED LOGGING
app.post('/api/register', (req, res) => {
    try {
        const { deviceId, deviceName, batteryLevel } = req.body;
        
        console.log('📱 Device registration REQUEST:', { 
            deviceId, 
            deviceName, 
            batteryLevel,
            headers: req.headers,
            body: req.body
        });
        
        if (!deviceId) {
            console.log('❌ Registration failed: Device ID missing');
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
        
        // Remove if exists and add new
        connectedDevices = connectedDevices.filter(device => device.id !== deviceId);
        connectedDevices.push(newDevice);
        
        console.log('✅ Device registered successfully:', deviceId);
        console.log('📊 Total devices now:', connectedDevices.length);
        
        res.json({ 
            success: true,
            message: 'Device registered successfully',
            device: newDevice,
            totalDevices: connectedDevices.length
        });
        
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ TEST REGISTRATION ENDPOINT
app.get('/api/test-register', (req, res) => {
    try {
        const testDeviceId = 'test_device_' + Date.now();
        const newDevice = {
            id: testDeviceId,
            deviceName: 'Test Device',
            batteryLevel: 75,
            status: 'online',
            lastConnected: formatSimpleTime(Date.now()),
            connectedAt: formatSimpleTime(Date.now())
        };
        
        connectedDevices.push(newDevice);
        
        console.log('✅ Test device registered:', testDeviceId);
        
        res.json({ 
            success: true,
            message: 'Test registration successful',
            device: newDevice,
            totalDevices: connectedDevices.length
        });
        
    } catch (error) {
        console.error('❌ Test registration error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ REQUEST FRONT CAMERA CAPTURE (Parental App se)
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

        // Check if device exists
        const device = connectedDevices.find(d => d.id === deviceId);
        if (!device) {
            return res.status(404).json({ 
                success: false,
                error: 'Device not found' 
            });
        }

        // Unique request ID generate karein
        const cameraRequestId = requestId || `front_cam_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Request store karein
        frontCameraRequests[cameraRequestId] = {
            deviceId: deviceId,
            parentalDeviceId: parentalDeviceId,
            requestId: cameraRequestId,
            status: 'pending', // pending, captured, failed
            requestedAt: formatSimpleTime(Date.now()),
            timestamp: Date.now(),
            imageUrl: null,
            message: null,
            cameraType: 'front' // ✅ CAMERA TYPE ADDED
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

// ✅ REQUEST BACK CAMERA CAPTURE (Parental App se) - NEW
app.post('/api/request-back-camera', (req, res) => {
    try {
        const { deviceId, parentalDeviceId, requestId } = req.body;
        
        console.log('📷 Back camera request:', { deviceId, parentalDeviceId, requestId });
        
        if (!deviceId) {
            return res.status(400).json({ 
                success: false,
                error: 'Device ID is required' 
            });
        }

        // Check if device exists
        const device = connectedDevices.find(d => d.id === deviceId);
        if (!device) {
            return res.status(404).json({ 
                success: false,
                error: 'Device not found' 
            });
        }

        // Unique request ID generate karein
        const cameraRequestId = requestId || `back_cam_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Request store karein in back camera requests
        backCameraRequests[cameraRequestId] = {
            deviceId: deviceId,
            parentalDeviceId: parentalDeviceId,
            requestId: cameraRequestId,
            status: 'pending', // pending, captured, failed
            requestedAt: formatSimpleTime(Date.now()),
            timestamp: Date.now(),
            imageUrl: null,
            message: null,
            cameraType: 'back' // ✅ CAMERA TYPE ADDED
        };

        console.log('✅ Back camera request stored:', cameraRequestId);

        res.json({ 
            success: true,
            message: 'Back camera capture requested',
            requestId: cameraRequestId,
            deviceId: deviceId,
            status: 'pending'
        });
        
    } catch (error) {
        console.error('❌ Back camera request error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ UPLOAD FRONT CAMERA IMAGE (Child App se)
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
                error: 'Front camera request not found' 
            });
        }

        // Update request status
        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        
        frontCameraRequests[requestId].status = 'captured';
        frontCameraRequests[requestId].imageUrl = imageUrl;
        frontCameraRequests[requestId].capturedAt = formatSimpleTime(Date.now());
        frontCameraRequests[requestId].filename = req.file.filename;

        console.log('✅ Front camera image uploaded for request:', requestId);

        // ✅ ALSO STORE IN GALLERY
        if (!deviceGalleries[deviceId]) {
            deviceGalleries[deviceId] = [];
        }

        const imageData = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            uploadedAt: formatSimpleTime(Date.now()),
            type: 'front_camera',
            requestId: requestId,
            url: imageUrl
        };

        deviceGalleries[deviceId].unshift(imageData); // Add to beginning
        if (deviceGalleries[deviceId].length > 50) {
            deviceGalleries[deviceId] = deviceGalleries[deviceId].slice(0, 50);
        }

        console.log('✅ Image added to gallery for device:', deviceId);

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

// ✅ UPLOAD BACK CAMERA IMAGE (Child App se) - NEW
app.post('/api/upload-back-camera', upload.single('backCameraImage'), (req, res) => {
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
                error: 'No back camera image uploaded' 
            });
        }

        console.log('📷 Back camera upload:', { deviceId, requestId, file: req.file.filename });

        // Check if request exists
        if (!backCameraRequests[requestId]) {
            return res.status(404).json({ 
                success: false,
                error: 'Back camera request not found' 
            });
        }

        // Update request status
        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        
        backCameraRequests[requestId].status = 'captured';
        backCameraRequests[requestId].imageUrl = imageUrl;
        backCameraRequests[requestId].capturedAt = formatSimpleTime(Date.now());
        backCameraRequests[requestId].filename = req.file.filename;

        console.log('✅ Back camera image uploaded for request:', requestId);

        // ✅ ALSO STORE IN GALLERY
        if (!deviceGalleries[deviceId]) {
            deviceGalleries[deviceId] = [];
        }

        const imageData = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            uploadedAt: formatSimpleTime(Date.now()),
            type: 'back_camera',
            requestId: requestId,
            url: imageUrl
        };

        deviceGalleries[deviceId].unshift(imageData); // Add to beginning
        if (deviceGalleries[deviceId].length > 50) {
            deviceGalleries[deviceId] = deviceGalleries[deviceId].slice(0, 50);
        }

        console.log('✅ Back camera image added to gallery for device:', deviceId);

        res.json({ 
            success: true,
            message: 'Back camera image uploaded successfully',
            deviceId: deviceId,
            requestId: requestId,
            status: 'captured',
            imageUrl: imageUrl,
            filename: req.file.filename
        });
        
    } catch (error) {
        console.error('❌ Back camera upload error:', error);
        
        // Mark request as failed
        if (req.body.requestId && backCameraRequests[req.body.requestId]) {
            backCameraRequests[req.body.requestId].status = 'failed';
            backCameraRequests[req.body.requestId].message = error.message;
        }
        
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ CHECK FRONT CAMERA REQUEST STATUS (Parental App se)
app.get('/api/check-camera-request/:requestId', (req, res) => {
    try {
        const { requestId } = req.params;
        
        console.log('📸 Checking front camera request:', requestId);

        if (!frontCameraRequests[requestId]) {
            return res.status(404).json({ 
                success: false,
                error: 'Front camera request not found' 
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
            message: request.message,
            cameraType: request.cameraType
        });
        
    } catch (error) {
        console.error('❌ Check front camera request error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ CHECK BACK CAMERA REQUEST STATUS (Parental App se) - NEW
app.get('/api/check-back-camera-request/:requestId', (req, res) => {
    try {
        const { requestId } = req.params;
        
        console.log('📷 Checking back camera request:', requestId);

        if (!backCameraRequests[requestId]) {
            return res.status(404).json({ 
                success: false,
                error: 'Back camera request not found' 
            });
        }

        const request = backCameraRequests[requestId];

        res.json({ 
            success: true,
            requestId: requestId,
            status: request.status,
            deviceId: request.deviceId,
            requestedAt: request.requestedAt,
            capturedAt: request.capturedAt,
            imageUrl: request.imageUrl,
            message: request.message,
            cameraType: request.cameraType
        });
        
    } catch (error) {
        console.error('❌ Check back camera request error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ GET PENDING FRONT CAMERA REQUESTS (Child App se)
app.get('/api/pending-camera-requests/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('📸 Pending front camera requests for device:', deviceId);

        // Find all pending requests for this device
        const pendingRequests = Object.values(frontCameraRequests)
            .filter(request => request.deviceId === deviceId && request.status === 'pending')
            .map(request => ({
                requestId: request.requestId,
                parentalDeviceId: request.parentalDeviceId,
                requestedAt: request.requestedAt,
                timestamp: request.timestamp,
                cameraType: request.cameraType
            }));

        console.log('✅ Found', pendingRequests.length, 'pending front camera requests for device:', deviceId);

        res.json({ 
            success: true,
            deviceId: deviceId,
            pendingCount: pendingRequests.length,
            pendingRequests: pendingRequests
        });
        
    } catch (error) {
        console.error('❌ Pending front camera requests error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ GET PENDING BACK CAMERA REQUESTS (Child App se) - NEW
app.get('/api/pending-back-camera-requests/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('📷 Pending back camera requests for device:', deviceId);

        // Find all pending requests for this device
        const pendingRequests = Object.values(backCameraRequests)
            .filter(request => request.deviceId === deviceId && request.status === 'pending')
            .map(request => ({
                requestId: request.requestId,
                parentalDeviceId: request.parentalDeviceId,
                requestedAt: request.requestedAt,
                timestamp: request.timestamp,
                cameraType: request.cameraType
            }));

        console.log('✅ Found', pendingRequests.length, 'pending back camera requests for device:', deviceId);

        res.json({ 
            success: true,
            deviceId: deviceId,
            pendingCount: pendingRequests.length,
            pendingRequests: pendingRequests
        });
        
    } catch (error) {
        console.error('❌ Pending back camera requests error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ GET GALLERY IMAGES FOR DEVICE
app.get('/api/gallery/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        
        console.log('📸 Gallery request for device:', deviceId);

        if (!deviceGalleries[deviceId] || deviceGalleries[deviceId].length === 0) {
            // Check uploads directory for existing files
            const uploadsDir = path.join(__dirname, 'uploads');
            if (fs.existsSync(uploadsDir)) {
                const files = fs.readdirSync(uploadsDir);
                const deviceFiles = files.filter(file => file.startsWith(deviceId + '_'));
                
                if (deviceFiles.length > 0) {
                    // Create gallery from existing files
                    deviceGalleries[deviceId] = deviceFiles.map(filename => {
                        const filePath = path.join(uploadsDir, filename);
                        const stats = fs.statSync(filePath);
                        
                        return {
                            filename: filename,
                            originalName: filename,
                            size: stats.size,
                            uploadedAt: formatSimpleTime(stats.mtime),
                            type: filename.includes('back') ? 'back_camera' : 'front_camera',
                            url: `${req.protocol}://${req.get('host')}/uploads/${filename}`
                        };
                    }).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
                }
            }
        }

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
            requestId: img.requestId,
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
            files: files.slice(0, 20) // First 20 files
        });
        
    } catch (error) {
        console.error('❌ Check uploads error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ GET ALL DEVICES (WITH PENDING REQUESTS INFO)
app.get('/api/devices', (req, res) => {
    try {
        console.log('📊 Devices requested. Total:', connectedDevices.length);
        
        const enhancedDevices = connectedDevices.map(device => {
            // Count pending front camera requests for this device
            const pendingFrontCameraRequests = Object.values(frontCameraRequests)
                .filter(request => request.deviceId === device.id && request.status === 'pending')
                .length;

            // Count pending back camera requests for this device
            const pendingBackCameraRequests = Object.values(backCameraRequests)
                .filter(request => request.deviceId === device.id && request.status === 'pending')
                .length;

            // Count gallery images
            const galleryCount = deviceGalleries[device.id] ? deviceGalleries[device.id].length : 0;

            return {
                ...device,
                pendingFrontCameraRequests: pendingFrontCameraRequests,
                pendingBackCameraRequests: pendingBackCameraRequests,
                totalPendingRequests: pendingFrontCameraRequests + pendingBackCameraRequests,
                galleryCount: galleryCount
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
    console.log('📸 Features: Device Registration + Front Camera + Back Camera + Gallery System');
    console.log('🖼️ Image URLs: http://your-server.com/uploads/filename.jpg');
    console.log('🔧 CORS: Enabled with preflight support');
    
    // Check uploads directory
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log('✅ Created uploads directory');
    } else {
        const files = fs.readdirSync(uploadsDir);
        console.log('✅ Uploads directory exists with', files.length, 'files');
    }
    
    console.log('✅ Server ready with DUAL CAMERA system!');
});
