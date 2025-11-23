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
        message: '🚀 Parental Control Server API - FIXED VERSION',
        endpoints: {
            health: '/health',
            register: '/api/register (POST) - REQUIRES deviceId',
            batteryUpdate: '/api/battery-update (POST) - REQUIRES deviceId',
            devices: '/api/devices (GET)',
            clear: '/api/clear (DELETE)',
            clearDevice: '/api/clear-device/:deviceId (DELETE)'
        },
        deviceCount: connectedDevices.length,
        note: '✅ Now using same device ID for updates - no duplicate devices!'
    });
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 Parental Control Server Started! - FIXED VERSION');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('📋 Available Routes:');
    console.log('   GET  /health');
    console.log('   POST /api/register ✅ REQUIRES deviceId');
    console.log('   POST /api/battery-update ✅ REQUIRES deviceId');
    console.log('   GET  /api/devices');
    console.log('   DELETE /api/clear');
    console.log('   DELETE /api/clear-device/:deviceId');
    console.log('\n✅ FIX: Same device ID for all updates - No duplicate devices!');
});