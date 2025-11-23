const express = require('express');
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

// Health check route
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Parental Control Server is running!',
        timestamp: new Date().toISOString(),
        deviceCount: connectedDevices.length
    });
});

// Battery update route
app.post('/api/battery-update', (req, res) => {
    try {
        const { deviceId, deviceName, batteryLevel, timestamp } = req.body;
        
        console.log('🔋 Battery update received:', { deviceId, batteryLevel });
        
        // Device find karo ya naya banayo
        let device = connectedDevices.find(d => d.id === deviceId);
        
        if (device) {
            // Update existing device
            device.batteryLevel = batteryLevel;
            device.lastConnected = new Date().toLocaleTimeString();
            device.lastBatteryUpdate = new Date().toLocaleTimeString();
        } else {
            // Naya device banayo
            device = {
                id: deviceId,
                deviceName: deviceName || 'Child Device',
                batteryLevel: batteryLevel,
                status: 'online',
                lastConnected: new Date().toLocaleTimeString(),
                lastBatteryUpdate: new Date().toLocaleTimeString()
            };
            connectedDevices.push(device);
        }
        
        res.json({ 
            success: true,
            message: 'Battery update received',
            batteryLevel: batteryLevel
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
        const { deviceName, batteryLevel } = req.body;
        
        console.log('📱 Child registration request:', req.body);
        
        const newDevice = {
            id: 'CHILD_' + Date.now(),
            deviceName: deviceName || 'Child Device',
            batteryLevel: batteryLevel || Math.floor(Math.random() * 100),
            status: 'online',
            lastConnected: new Date().toLocaleTimeString(),
            ip: req.ip
        };
        
        // Remove existing device with same ID
        connectedDevices = connectedDevices.filter(device => device.id !== newDevice.id);
        connectedDevices.push(newDevice);
        
        console.log('✅ Device registered:', newDevice.deviceName);
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

// Clear all devices (for testing)
app.delete('/api/clear', (req, res) => {
    connectedDevices = [];
    res.json({ 
        success: true,
        message: 'All devices cleared'
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        message: '🚀 Parental Control Server API',
        endpoints: {
            health: '/health',
            register: '/api/register (POST)',
            devices: '/api/devices (GET)',
            clear: '/api/clear (DELETE)'
        },
        deviceCount: connectedDevices.length
    });
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 Parental Control Server Started!');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('📋 Available Routes:');
    console.log('   GET  /health');
    console.log('   POST /api/register');
    console.log('   GET  /api/devices');
    console.log('   DELETE /api/clear');
});
